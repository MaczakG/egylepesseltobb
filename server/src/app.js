import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import * as store from './db.js';
import {
  MIN_PASSWORD_LENGTH, SESSION_TTL_MS, createSessionToken, hashPassword, readSessionToken, verifyPassword,
} from './auth.js';
import {
  renderBlogList, renderBlogPost, renderHomePosts, renderNotFound, siteFrame,
} from './pages.js';
import { injectFamilies, injectSection, renderFamilyCards } from './render.js';
import {
  ValidationError, detectImageType, validateFamily, validatePost, validateSettings,
} from './validate.js';

const COOKIE = 'elt_session';
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILURES = 10;
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const POSTS_PER_PAGE = 12;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function parseCookies(header = '') {
  const cookies = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) cookies[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return cookies;
}

function publicFamily({ amount, applicants, ...family }) {
  return family;
}

function postSummary({ content, ...post }) {
  return post;
}

// A bejegyzés tartalmában hivatkozott feltöltött képek (a törléskor felszabadítandók).
function postImages(post) {
  const urls = [...post.content.matchAll(/src="(\/uploads\/[^"]+)"/g)].map((m) => m[1]);
  return post.coverImage ? [post.coverImage, ...urls] : urls;
}

export function createApp({ db, config }) {
  fs.mkdirSync(config.uploadsDir, { recursive: true });
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback');

  // A bejelentkezett adminisztrátort az oldalak is felismerik (pl. piszkozat előnézetéhez).
  app.use((req, res, next) => {
    const session = readSessionToken(parseCookies(req.get('cookie'))[COOKIE], config.sessionSecret);
    if (session) {
      const user = store.getUserById(db, session.uid);
      if (user && user.session_version === session.v) req.user = user;
    }
    next();
  });

  // --- Oldalak -------------------------------------------------------------
  const readIndex = () => fs.readFileSync(path.join(config.siteDir, 'index.html'), 'utf8');
  const baseUrl = (req) => `${req.protocol}://${req.get('host')}`;
  const sendHtml = (res, html, status = 200) => res.status(status).set('Cache-Control', 'no-cache').type('html').send(html);

  app.get(['/', '/index.html'], (req, res) => {
    let html = injectFamilies(readIndex(), renderFamilyCards(store.listFamilies(db, { status: 'adoptable' })));
    html = injectSection(html, 'posts', renderHomePosts(store.listPublicPosts(db, { limit: 3 }).posts));
    sendHtml(res, html);
  });

  app.get('/blog', (req, res) => {
    const category = store.POST_CATEGORIES.some((c) => c.key === req.query.kategoria) ? req.query.kategoria : '';
    const requested = Math.max(1, Number.parseInt(req.query.oldal, 10) || 1);
    const { total } = store.listPublicPosts(db, { category, limit: 1 });
    const pageCount = Math.max(1, Math.ceil(total / POSTS_PER_PAGE));
    const page = Math.min(requested, pageCount);
    const { posts } = store.listPublicPosts(db, { category, limit: POSTS_PER_PAGE, offset: (page - 1) * POSTS_PER_PAGE });
    sendHtml(res, renderBlogList(siteFrame(readIndex()), { posts, page, pageCount, category, baseUrl: baseUrl(req) }));
  });

  app.get('/blog/:slug', (req, res, next) => {
    if (!SLUG.test(req.params.slug)) return next();
    const published = store.getPublicPostBySlug(db, req.params.slug);
    const post = published || (req.user && store.getPostBySlug(db, req.params.slug));
    if (!post) return next();
    const related = store.listPublicPosts(db, { limit: 3, excludeId: post.id }).posts;
    const html = renderBlogPost(siteFrame(readIndex()), { post, related, baseUrl: baseUrl(req), preview: !published });
    if (!published) res.set('X-Robots-Tag', 'noindex');
    sendHtml(res, html);
  });

  // Élesben az nginx szolgálja ki a statikus fájlokat; ez fejlesztéshez és tartaléknak kell.
  app.get('/admin.html', (req, res) => {
    res.set('X-Robots-Tag', 'noindex, nofollow').sendFile(path.join(config.siteDir, 'admin.html'));
  });
  app.use('/assets', express.static(path.join(config.siteDir, 'assets'), { maxAge: '30d' }));
  app.use('/uploads', express.static(config.uploadsDir, {
    maxAge: '30d',
    setHeaders: (res) => res.set('X-Content-Type-Options', 'nosniff'),
  }));

  // --- API -----------------------------------------------------------------
  const api = express.Router();

  // CSRF ellen: a módosító kérésekhez egyedi fejléc kell, amit idegen oldal CORS-engedély nélkül nem küldhet.
  api.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD' && req.get('X-ELT-Request') !== '1') {
      return res.status(403).json({ error: 'Érvénytelen kérés.' });
    }
    next();
  });
  api.use(express.json({ limit: '1mb' }));

  const setSession = (req, res, user) => {
    res.cookie(COOKIE, createSessionToken(user, config.sessionSecret), {
      httpOnly: true, sameSite: 'strict', secure: req.secure, maxAge: SESSION_TTL_MS, path: '/',
    });
  };

  const requireAuth = (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Bejelentkezés szükséges.' });
    next();
  };

  // Nem létező felhasználónál is lefut egy jelszó-ellenőrzés, hogy a válaszidő ne árulja el, létezik-e.
  const dummyHash = hashPassword(crypto.randomBytes(16).toString('hex'));
  const failures = new Map();

  api.post('/login', (req, res) => {
    const now = Date.now();
    const entry = failures.get(req.ip);
    if (entry && entry.resetAt > now && entry.count >= LOGIN_MAX_FAILURES) {
      return res.status(429).json({ error: 'Túl sok sikertelen próbálkozás. Próbáld újra 15 perc múlva.' });
    }
    const { email, password } = req.body || {};
    const user = typeof email === 'string' ? store.getUserByEmail(db, email.trim()) : null;
    const ok = verifyPassword(typeof password === 'string' ? password : '', user ? user.password_hash : dummyHash);
    if (!user || !ok) {
      const fresh = !entry || entry.resetAt <= now;
      failures.set(req.ip, { count: fresh ? 1 : entry.count + 1, resetAt: fresh ? now + LOGIN_WINDOW_MS : entry.resetAt });
      return res.status(401).json({ error: 'Hibás e-mail cím vagy jelszó.' });
    }
    failures.delete(req.ip);
    setSession(req, res, user);
    res.json({ email: user.email });
  });

  api.post('/logout', (req, res) => {
    res.clearCookie(COOKIE, { path: '/' });
    res.json({ ok: true });
  });

  api.get('/me', requireAuth, (req, res) => res.json({ email: req.user.email }));

  api.post('/password', requireAuth, (req, res) => {
    const { currentPassword, newPassword } = req.body || {};
    if (typeof currentPassword !== 'string' || !verifyPassword(currentPassword, req.user.password_hash)) {
      return res.status(400).json({ error: 'A jelenlegi jelszó nem helyes.' });
    }
    if (typeof newPassword !== 'string' || newPassword.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ error: `Az új jelszó legalább ${MIN_PASSWORD_LENGTH} karakter legyen.` });
    }
    const user = store.setPassword(db, req.user.id, hashPassword(newPassword));
    setSession(req, res, user);
    res.json({ ok: true });
  });

  api.get('/families', (req, res) => {
    const status = store.STATUSES.includes(req.query.status) ? req.query.status : undefined;
    res.json(store.listFamilies(db, { status }).map(publicFamily));
  });

  api.get('/posts', (req, res) => {
    const category = store.POST_CATEGORIES.some((c) => c.key === req.query.kategoria) ? req.query.kategoria : '';
    const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit, 10) || POSTS_PER_PAGE));
    res.json(store.listPublicPosts(db, { category, limit }).posts.map(postSummary));
  });

  // --- Admin API -----------------------------------------------------------
  const admin = express.Router();
  admin.use(requireAuth);

  const idParam = (req) => {
    const id = Number(req.params.id);
    return Number.isInteger(id) && id > 0 ? id : null;
  };

  // Csak a már sehol nem hivatkozott feltöltött képeket törli; az assets/ képekhez nem nyúl.
  const removeUnusedUploads = (urls) => {
    for (const url of urls) {
      if (url.startsWith('/uploads/') && !store.isImageReferenced(db, url)) {
        fs.rmSync(path.join(config.uploadsDir, path.basename(url)), { force: true });
      }
    }
  };

  admin.get('/families', (req, res) => res.json(store.listFamilies(db)));

  admin.post('/families', (req, res) => {
    res.status(201).json(store.createFamily(db, validateFamily(req.body)));
  });

  admin.put('/families/:id', (req, res) => {
    const id = idParam(req);
    const before = id && store.getFamily(db, id);
    if (!before) return res.status(404).json({ error: 'A család nem található.' });
    const updated = store.updateFamily(db, id, validateFamily(req.body));
    removeUnusedUploads(before.images.map((im) => im.url));
    res.json(updated);
  });

  admin.delete('/families/:id', (req, res) => {
    const id = idParam(req);
    const before = id && store.getFamily(db, id);
    if (!before) return res.status(404).json({ error: 'A család nem található.' });
    store.deleteFamily(db, id);
    removeUnusedUploads(before.images.map((im) => im.url));
    res.json({ ok: true });
  });

  admin.get('/posts', (req, res) => res.json(store.listPosts(db)));

  admin.post('/posts', (req, res) => {
    res.status(201).json(store.createPost(db, validatePost(req.body)));
  });

  admin.put('/posts/:id', (req, res) => {
    const id = idParam(req);
    const before = id && store.getPost(db, id);
    if (!before) return res.status(404).json({ error: 'A bejegyzés nem található.' });
    const updated = store.updatePost(db, id, validatePost(req.body));
    removeUnusedUploads(postImages(before));
    res.json(updated);
  });

  admin.delete('/posts/:id', (req, res) => {
    const id = idParam(req);
    const before = id && store.getPost(db, id);
    if (!before) return res.status(404).json({ error: 'A bejegyzés nem található.' });
    store.deletePost(db, id);
    removeUnusedUploads(postImages(before));
    res.json({ ok: true });
  });

  admin.get('/settings', (req, res) => res.json(store.getSettings(db)));

  admin.put('/settings', (req, res) => {
    res.json(store.saveSettings(db, validateSettings(req.body)));
  });

  admin.post('/uploads', express.raw({ type: 'image/*', limit: MAX_UPLOAD_BYTES }), (req, res) => {
    const ext = Buffer.isBuffer(req.body) ? detectImageType(req.body) : null;
    if (!ext) return res.status(400).json({ error: 'Csak JPG, PNG, WEBP vagy GIF kép tölthető fel.' });
    const name = `${crypto.randomBytes(12).toString('hex')}.${ext}`;
    fs.writeFileSync(path.join(config.uploadsDir, name), req.body);
    let label = '';
    try { label = decodeURIComponent(req.get('X-Filename') || ''); } catch { /* marad üres */ }
    res.status(201).json({ url: `/uploads/${name}`, label: label.slice(0, 200) || name });
  });

  api.use('/admin', admin);
  api.use((req, res) => res.status(404).json({ error: 'Nem található.' }));
  app.use('/api', api);

  app.use((req, res) => sendHtml(res, renderNotFound(siteFrame(readIndex())), 404));

  // Az Express a négy paraméterből ismeri fel a hibakezelőt, ezért kell a nem használt `next` is.
  app.use((err, req, res, next) => {
    if (err instanceof ValidationError) return res.status(400).json({ error: err.message });
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'A feltöltött adat túl nagy (max. 10 MB).' });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Hibás kérés.' });
    console.error(err);
    res.status(500).json({ error: 'Váratlan hiba történt.' });
  });

  return app;
}
