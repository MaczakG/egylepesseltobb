import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import busboy from 'busboy';
import express from 'express';
import * as store from './db.js';
import {
  MIN_PASSWORD_LENGTH, SESSION_TTL_MS, createSessionToken, hashPassword, readSessionToken, verifyPassword,
} from './auth.js';
import {
  applicationForm, renderBlogList, renderBlogPost, renderEvents, renderFamilyList, renderFamilyPage, renderHomePosts,
  renderCheckout, renderNotFound, renderPage, renderPaymentResult, siteFrame, fmtHuf,
} from './pages.js';
import {
  BACK_STATUS, IPN_STATUS, SimplePayError, handleIpn, parseBack, startPayment,
} from './simplepay.js';
import { IMPORT_FILE, legacyPostSlugs, loadImportData } from './wpimport.js';
import { checkMessage, formSchema, messageForm, renderMessageForm } from './forms.js';
import { injectFamilies, injectSection, renderFamilyCards } from './render.js';
import { createMailer } from './mailer.js';
import { createStorage } from './storage.js';
import {
  EMAIL, ValidationError, checkApplication, detectImageType, validateApplicationStatus, validateFamily, validateFormSettings,
  validateMessageStatus, validateNominationSettings, validatePaymentSettings, validatePost, validateProduct, validateSettings, validateSmtpSettings,
} from './validate.js';

const COOKIE = 'elt_session';
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILURES = 10;
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const POSTS_PER_PAGE = 12;
const SUBMIT_WINDOW_MS = 60 * 60 * 1000;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// Beküldések IP-címenként, óránként legfeljebb `max` (a ritkán ürülő listát időnként kitakarítja).
function ipLimiter(max) {
  const hits = new Map();
  const recent = (ip) => (hits.get(ip) || []).filter((t) => t > Date.now() - SUBMIT_WINDOW_MS);
  return {
    full: (ip) => recent(ip).length >= max,
    add(ip) {
      hits.set(ip, [...recent(ip), Date.now()]);
      if (hits.size > 5000) for (const key of hits.keys()) if (!recent(key).length) hits.delete(key);
    },
  };
}

const MAX_FILES = 5;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_BYTES = 25 * 1024 * 1024;

// Fájlfeltöltéses űrlap (multipart) beolvasása memóriába, korlátokkal.
function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    let bb;
    try {
      bb = busboy({ headers: req.headers, defParamCharset: 'utf8', limits: { files: MAX_FILES, fileSize: MAX_FILE_BYTES, fields: 40, fieldSize: 20_000, parts: 50 } });
    } catch {
      return reject(new ValidationError('Hibás kérés.'));
    }
    const fields = {};
    const files = [];
    let total = 0;
    let problem = '';
    bb.on('field', (name, value) => { fields[name] = value; });
    bb.on('file', (name, stream, info) => {
      const chunks = [];
      stream.on('data', (chunk) => {
        total += chunk.length;
        if (total <= MAX_TOTAL_BYTES) chunks.push(chunk);
      });
      stream.on('limit', () => { problem = 'Egy fájl legfeljebb 10 MB lehet.'; });
      stream.on('end', () => {
        const buffer = Buffer.concat(chunks);
        if (info.filename && buffer.length && !stream.truncated) files.push({ name: info.filename, buffer });
      });
    });
    bb.on('filesLimit', () => { problem = `Legfeljebb ${MAX_FILES} fájl tölthető fel.`; });
    bb.on('close', () => resolve({
      fields, files, problem: problem || (total > MAX_TOTAL_BYTES ? 'A fájlok összesen legfeljebb 25 MB-osak lehetnek.' : ''),
    }));
    bb.on('error', reject);
    req.pipe(bb);
  });
}

function fileKind(buffer) {
  return detectImageType(buffer) || (buffer.subarray(0, 5).toString('latin1') === '%PDF-' ? 'pdf' : null);
}

function parseCookies(header = '') {
  const cookies = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) cookies[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return cookies;
}

// A régi oldal címei, amelyeket a mi oldalunk másként old meg (lista, főoldal).
const LEGACY_REDIRECTS = {
  fooldal: '/',
  'orokbefogadhato-csaladok': '/csaladok?statusz=orokbefogadhato',
  'orokbefogadott-csaladok': '/csaladok?statusz=orokbefogadott',
  'kozos-elmenyeink': '/blog?kategoria=kozos-elmenyeink',
  'feltoltes-alatt': '/csaladok',
  // A régi oldalon a „Jótékonysági meccs” oldal helyére a „Jótékonysági gálaest” került.
  'jotekonysagi-meccs': '/jotekonysagi-galaest',
  en: '/',
};

// A bejegyzés tartalmában hivatkozott feltöltött képek (a törléskor felszabadítandók).
function postImages(post) {
  const urls = [...post.content.matchAll(/src="(\/uploads\/[^"]+)"/g)].map((m) => m[1]);
  return post.coverImage ? [post.coverImage, ...urls] : urls;
}

export function createApp({
  db, config, fetchImpl = fetch, mailer = createMailer(db), storage = createStorage(config),
}) {
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
  // A lábléc rendezvényei minden oldalon az adatbázisból jönnek, ezért már a beolvasáskor bekerülnek.
  const readIndex = () => injectSection(
    fs.readFileSync(path.join(config.siteDir, 'index.html'), 'utf8'),
    'events',
    renderEvents(store.listPublicPosts(db, { category: 'rendezvenyek', limit: 4 }).posts),
  );
  const baseUrl = (req) => `${req.protocol}://${req.get('host')}`;
  const adminLink = (req) => `${baseUrl(req)}/admin.html`;
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

  // Minden család egy oldalon (lapozás nélkül); a szűrő csak az örökbefogadhatókat vagy az örökbefogadottakat mutatja.
  const LIST_FILTERS = { orokbefogadhato: 'adoptable', orokbefogadott: 'adopted' };
  app.get('/csaladok', (req, res) => {
    const status = LIST_FILTERS[req.query.statusz] || 'all';
    const { families } = store.listPublicFamilies(db, { status });
    sendHtml(res, renderFamilyList(siteFrame(readIndex()), {
      families, status, counts: store.countFamiliesByStatus(db), baseUrl: baseUrl(req),
    }));
  });

  // A gyerek (család) aloldala. Az archivált és a feltöltés alatti családot csak a bejelentkezett admin látja.
  const pageFamily = (req) => {
    if (!SLUG.test(req.params.slug)) return null;
    const family = store.getFamilyBySlug(db, req.params.slug);
    const isPublic = Boolean(family) && store.PUBLIC_STATUSES.includes(family.status);
    return family && (isPublic || req.user) ? { family, isPublic } : null;
  };

  // A jelentkezési űrlapon az örökbefogadható családok közül lehet választani (név szerint rendezve).
  const adoptableOptions = () => store.listPublicFamilies(db, { status: 'adoptable', limit: 10_000 }).families
    .map((f) => ({ id: f.id, name: f.name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'hu'));

  const sendFamilyPage = (req, res, { family, isPublic }, form = {}, status = 200) => {
    const more = store.listPublicFamilies(db, { status: 'adoptable', limit: 3, excludeId: family.id }).families;
    if (!isPublic) res.set('X-Robots-Tag', 'noindex');
    sendHtml(res, renderFamilyPage(siteFrame(readIndex()), {
      family, more, baseUrl: baseUrl(req), preview: !isPublic,
      form: { options: adoptableOptions(), ...store.getFormSettings(db), ...form },
    }), status);
  };

  app.get('/csaladok/:slug', (req, res, next) => {
    const found = pageFamily(req);
    if (!found) return next();
    sendFamilyPage(req, res, found, { submitted: req.query.jelentkezes === 'koszonjuk' });
  });

  // Támogatói jelentkezés. Sima űrlapküldés (JavaScript nélkül is megy); siker után átirányít (PRG),
  // hibánál a hibaüzenetekkel és a beírt adatokkal adja vissza az oldalt (családoldal vagy tartalmi oldal).
  const applicationLimit = ipLimiter(5);
  const handleApplication = (req, res, { thanks, sendPage }) => {
    const body = req.body || {};
    // Rejtett mező: ember nem tölti ki, a spamrobotok igen. Nekik is „sikert” mutatunk, de nem mentjük.
    if (body.website) return res.redirect(303, thanks);

    if (applicationLimit.full(req.ip)) {
      return sendPage({
        error: 'Erről a címről már túl sok jelentkezés érkezett. Kérjük, próbáld újra később, vagy írj nekünk e-mailt.',
      }, 429);
    }

    const { values, errors } = checkApplication(body, store.getFormSettings(db));
    const target = values.familyId ? store.getFamily(db, values.familyId) : null;
    if (values.familyId && (!target || target.status !== 'adoptable')) {
      errors.familyId = 'Ez a család már nem várja a jelentkezéseket. Kérjük, válassz egy másikat.';
    }
    if (Object.keys(errors).length) return sendPage({ values, errors }, 400);

    const saved = store.createApplication(db, values);
    mailer.notify({
      subject: `Új támogatói jelentkezés: ${saved.familyName}`,
      intro: 'Új támogatói jelentkezés érkezett a weboldalon.',
      rows: [
        ['Család', saved.familyName],
        ['Név', `${saved.lastName} ${saved.firstName}`],
        ['E-mail', saved.email],
        ['Telefonszám', saved.phone],
        ['Havi összeg', fmtHuf(saved.amount)],
        ['Honnan hallott rólunk', saved.source],
        ...(saved.note ? [['Megjegyzés', saved.note]] : []),
      ],
      link: adminLink(req),
      replyTo: saved.email,
    });
    applicationLimit.add(req.ip);
    res.redirect(303, thanks);
  };
  const formBody = express.urlencoded({ extended: false, limit: '20kb' });

  app.post('/csaladok/:slug/jelentkezes', formBody, (req, res, next) => {
    const found = pageFamily(req);
    if (!found) return next();
    handleApplication(req, res, {
      thanks: `/csaladok/${found.family.slug}?jelentkezes=koszonjuk#jelentkezes`,
      sendPage: (form, status) => sendFamilyPage(req, res, found, form, status),
    });
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

  // --- Admin API -----------------------------------------------------------
  const admin = express.Router();
  admin.use(requireAuth);

  const idParam = (req) => {
    const id = Number(req.params.id);
    return Number.isInteger(id) && id > 0 ? id : null;
  };

  // Csak a már sehol nem hivatkozott feltöltött képeket törli; az assets/ képekhez nem nyúl.
  const removeUnusedUploads = async (urls) => {
    for (const url of urls) {
      if (url.startsWith('/uploads/') && !store.isImageReferenced(db, url)) await storage.remove(`uploads/${path.basename(url)}`);
    }
  };

  admin.get('/families', (req, res) => res.json(store.listFamilies(db)));

  admin.post('/families', (req, res) => {
    res.status(201).json(store.createFamily(db, validateFamily(req.body)));
  });

  admin.put('/families/:id', async (req, res) => {
    const id = idParam(req);
    const before = id && store.getFamily(db, id);
    if (!before) return res.status(404).json({ error: 'A család nem található.' });
    const updated = store.updateFamily(db, id, validateFamily(req.body));
    await removeUnusedUploads(before.images.map((im) => im.url));
    res.json(updated);
  });

  admin.delete('/families/:id', async (req, res) => {
    const id = idParam(req);
    const before = id && store.getFamily(db, id);
    if (!before) return res.status(404).json({ error: 'A család nem található.' });
    store.deleteFamily(db, id);
    await removeUnusedUploads(before.images.map((im) => im.url));
    res.json({ ok: true });
  });

  admin.get('/messages', (req, res) => res.json({ forms: formSchema(), messages: store.listMessages(db) }));

  admin.put('/messages/:id', (req, res) => {
    const id = idParam(req);
    if (!id || !store.getMessage(db, id)) return res.status(404).json({ error: 'Az üzenet nem található.' });
    res.json(store.updateMessageStatus(db, id, validateMessageStatus(req.body)));
  });

  admin.delete('/messages/:id', async (req, res) => {
    const id = idParam(req);
    if (!id || !store.deleteMessage(db, id)) return res.status(404).json({ error: 'Az üzenet nem található.' });
    await storage.remove(`private/messages/${id}`);
    res.json({ ok: true });
  });

  // A beküldött dokumentum letöltése (csak bejelentkezve; mindig letöltésként, sosem a böngészőben megnyitva).
  admin.get('/messages/:id/files/:n', async (req, res) => {
    const id = idParam(req);
    const message = id && store.getMessage(db, id);
    const file = message && message.files[Number(req.params.n)];
    if (!file) return res.status(404).json({ error: 'A fájl nem található.' });
    // ASCII-tartalék és UTF-8 név (RFC 6266), hogy az ékezetes fájlnév minden böngészőben jó legyen.
    const ascii = file.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7e]|["\\]/g, '_');
    const utf8 = encodeURIComponent(file.name).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
    res.set({
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': `attachment; filename="${ascii}"; filename*=UTF-8''${utf8}`,
    });
    res.type(file.type === 'pdf' ? 'application/pdf' : file.type);
    await storage.send(res, `private/messages/${id}/${path.basename(file.stored)}`);
  });

  admin.get('/posts', (req, res) => res.json(store.listPosts(db)));

  admin.post('/posts', (req, res) => {
    res.status(201).json(store.createPost(db, validatePost(req.body)));
  });

  admin.put('/posts/:id', async (req, res) => {
    const id = idParam(req);
    const before = id && store.getPost(db, id);
    if (!before) return res.status(404).json({ error: 'A bejegyzés nem található.' });
    const updated = store.updatePost(db, id, validatePost(req.body));
    await removeUnusedUploads(postImages(before));
    res.json(updated);
  });

  admin.delete('/posts/:id', async (req, res) => {
    const id = idParam(req);
    const before = id && store.getPost(db, id);
    if (!before) return res.status(404).json({ error: 'A bejegyzés nem található.' });
    store.deletePost(db, id);
    await removeUnusedUploads(postImages(before));
    res.json({ ok: true });
  });

  admin.get('/settings', (req, res) => res.json(store.getSettings(db)));

  admin.get('/form-settings', (req, res) => res.json(store.getFormSettings(db)));

  admin.put('/form-settings', (req, res) => {
    res.json(store.saveFormSettings(db, validateFormSettings(req.body)));
  });

  admin.get('/nomination-settings', (req, res) => res.json(store.getNominationSettings(db)));

  admin.put('/nomination-settings', (req, res) => {
    res.json(store.saveNominationSettings(db, validateNominationSettings(req.body)));
  });

  // --- Termékek, fizetések, SimplePay beállítás ---
  admin.get('/products', (req, res) => res.json({
    products: store.listProducts(db),
    pages: store.listPages(db).map((pg) => ({ slug: pg.slug, title: pg.title })),
  }));

  admin.post('/products', (req, res) => res.status(201).json(store.createProduct(db, validateProduct(req.body))));

  admin.put('/products/:id', (req, res) => {
    const id = idParam(req);
    if (!id || !store.getProduct(db, id)) return res.status(404).json({ error: 'A termék nem található.' });
    res.json(store.updateProduct(db, id, validateProduct(req.body)));
  });

  admin.delete('/products/:id', (req, res) => {
    const id = idParam(req);
    if (!id || !store.deleteProduct(db, id)) return res.status(404).json({ error: 'A termék nem található.' });
    res.json({ ok: true });
  });

  admin.get('/orders', (req, res) => res.json(store.listOrders(db)));

  admin.delete('/orders/:id', (req, res) => {
    const id = idParam(req);
    if (!id || !store.deleteOrder(db, id)) return res.status(404).json({ error: 'A fizetés nem található.' });
    res.json({ ok: true });
  });

  // A titkos kulcsot sosem küldjük vissza, csak azt, hogy be van-e állítva.
  const publicPaymentSettings = (req) => {
    const s = store.getPaymentSettings(db);
    return {
      merchant: s.merchant, sandbox: s.sandbox, hasSecretKey: Boolean(s.secretKey),
      configured: paymentsConfigured(), ipnUrl: `${baseUrl(req)}/fizetes/ipn`,
    };
  };
  admin.get('/payment-settings', (req, res) => res.json(publicPaymentSettings(req)));

  admin.put('/payment-settings', (req, res) => {
    store.savePaymentSettings(db, validatePaymentSettings(req.body, store.getPaymentSettings(db)));
    res.json(publicPaymentSettings(req));
  });

  // E-mail értesítések (SMTP). A jelszót sosem küldjük vissza.
  const publicSmtpSettings = () => {
    const { pass, ...rest } = store.getSmtpSettings(db);
    return { ...rest, hasPassword: Boolean(pass), configured: mailer.configured(), status: store.getSmtpStatus(db) };
  };
  admin.get('/smtp-settings', (req, res) => res.json(publicSmtpSettings()));

  admin.put('/smtp-settings', (req, res) => {
    store.saveSmtpSettings(db, validateSmtpSettings(req.body, store.getSmtpSettings(db)));
    res.json(publicSmtpSettings());
  });

  admin.post('/smtp-test', async (req, res) => {
    try {
      await mailer.sendTest(adminLink(req));
      res.json(publicSmtpSettings());
    } catch (err) {
      store.saveSmtpStatus(db, { lastErrorAt: new Date().toISOString(), lastError: String(err.message).slice(0, 300) });
      res.status(502).json({ error: `A tesztlevél nem ment el: ${err.message}` });
    }
  });

  admin.get('/applications', (req, res) => res.json(store.listApplications(db)));

  admin.put('/applications/:id', (req, res) => {
    const id = idParam(req);
    if (!id || !store.getApplication(db, id)) return res.status(404).json({ error: 'A jelentkezés nem található.' });
    res.json(store.updateApplicationStatus(db, id, validateApplicationStatus(req.body)));
  });

  admin.delete('/applications/:id', (req, res) => {
    const id = idParam(req);
    if (!id || !store.deleteApplication(db, id)) return res.status(404).json({ error: 'A jelentkezés nem található.' });
    res.json({ ok: true });
  });

  admin.put('/settings', (req, res) => {
    res.json(store.saveSettings(db, validateSettings(req.body)));
  });

  admin.post('/uploads', express.raw({ type: 'image/*', limit: MAX_UPLOAD_BYTES }), async (req, res) => {
    const ext = Buffer.isBuffer(req.body) ? detectImageType(req.body) : null;
    if (!ext) return res.status(400).json({ error: 'Csak JPG, PNG, WEBP vagy GIF kép tölthető fel.' });
    const name = `${crypto.randomBytes(12).toString('hex')}.${ext}`;
    await storage.put(`uploads/${name}`, req.body);
    let label = '';
    try { label = decodeURIComponent(req.get('X-Filename') || ''); } catch { /* marad üres */ }
    res.status(201).json({ url: `/uploads/${name}`, label: label.slice(0, 200) || name });
  });

  api.use('/admin', admin);
  api.use((req, res) => res.status(404).json({ error: 'Nem található.' }));
  app.use('/api', api);

  // --- Oldalak (pl. /alapitonk) és a régi WordPress-címek ---------------------
  const contentPage = (req) => {
    if (!SLUG.test(req.params.slug)) return null;
    const page = store.getPageBySlug(db, req.params.slug);
    const isPublic = Boolean(page) && page.status === 'published';
    return page && (isPublic || req.user) ? { page, isPublic } : null;
  };

  // --- Online fizetés (SimplePay v2 API) ----------------------------------------
  const paymentSettings = () => store.getPaymentSettings(db);
  const paymentsConfigured = () => {
    const s = paymentSettings();
    return Boolean(s.merchant && s.secretKey);
  };
  const productParam = (req) => {
    const id = /^\d{1,9}$/.test(req.params.id) ? Number(req.params.id) : 0;
    const product = id && store.getProduct(db, id);
    return product && product.active ? product : null;
  };
  const productPage = (product) => {
    const page = store.getPageBySlug(db, product.pageSlug);
    return page && page.status === 'published' ? page : null;
  };
  const sendCheckout = (req, res, product, form = {}, status = 200) => {
    res.set('X-Robots-Tag', 'noindex');
    sendHtml(res, renderCheckout(siteFrame(readIndex()), {
      product, page: productPage(product), payable: paymentsConfigured(), ...form,
    }), status);
  };

  app.get('/fizetes/vissza', (req, res) => {
    res.set('X-Robots-Tag', 'noindex');
    const back = parseBack(paymentSettings(), req.query.r, req.query.s);
    const order = back && store.getOrderByRef(db, back.orderRef);
    if (!back || !order) {
      return sendHtml(res, renderPaymentResult(siteFrame(readIndex()), { event: 'UNKNOWN' }), 400);
    }
    const updated = store.updateOrder(db, order.id, { status: BACK_STATUS[back.event], transactionId: back.transactionId });
    const product = order.productId && store.getProduct(db, order.productId);
    sendHtml(res, renderPaymentResult(siteFrame(readIndex()), {
      event: back.event, transactionId: back.transactionId, order: updated, page: product ? productPage(product) : null,
    }));
  });

  // IPN: a SimplePay a háttérben értesít a végleges állapotról; a válasz a kapott JSON receiveDate-tel, aláírva.
  app.post('/fizetes/ipn', express.text({ type: '*/*', limit: '64kb' }), (req, res) => {
    const result = handleIpn(paymentSettings(), typeof req.body === 'string' ? req.body : '', req.get('Signature'));
    if (!result) return res.status(400).type('text').send('UNSUCCESSFUL VALIDATION');
    const order = store.getOrderByRef(db, result.data.orderRef);
    if (order && IPN_STATUS[result.data.status]) {
      const updated = store.updateOrder(db, order.id, { status: IPN_STATUS[result.data.status], transactionId: result.data.transactionId, fromIpn: true });
      // Az IPN többször is megjöhet: csak az első „fizetve” állapotról megy levél.
      if (updated.status === 'paid' && order.status !== 'paid') {
        mailer.notify({
          subject: `Sikeres fizetés: ${fmtHuf(updated.amount)} – ${updated.name}`,
          intro: `Sikeres SimplePay fizetés érkezett${updated.sandbox ? ' (teszt módban)' : ''}.`,
          rows: [
            ['Termék', updated.productName],
            ['Összeg', fmtHuf(updated.amount)],
            ['Név', updated.name],
            ['E-mail', updated.email],
            ['Rendelésazonosító', updated.orderRef],
            ['SimplePay tranzakció', updated.transactionId || ''],
          ],
          link: adminLink(req),
          replyTo: updated.email,
        });
      }
    } else if (!order) {
      console.error(`SimplePay IPN ismeretlen rendeléshez: ${result.data.orderRef}`);
    }
    res.status(200).set({ 'Content-Type': 'application/json', Signature: result.replySignature }).send(result.reply);
  });

  app.get('/fizetes/:id', (req, res, next) => {
    const product = productParam(req);
    if (!product) return next();
    sendCheckout(req, res, product);
  });

  const paymentLimit = ipLimiter(10);
  app.post('/fizetes/:id', express.urlencoded({ extended: false, limit: '10kb' }), async (req, res, next) => {
    const product = productParam(req);
    if (!product) return next();
    const body = req.body || {};
    if (body.website) return res.redirect(303, `/fizetes/${product.id}`);
    if (!paymentsConfigured()) return sendCheckout(req, res, product, {}, 503);
    const values = {
      name: typeof body.name === 'string' ? body.name.trim().slice(0, 120) : '',
      email: typeof body.email === 'string' ? body.email.trim().slice(0, 200) : '',
      consent: body.consent === 'on',
      transfer: body.transfer === 'on',
    };
    const errors = {};
    if (!values.name) errors.name = 'Add meg a neved.';
    if (!EMAIL.test(values.email)) errors.email = 'Adj meg egy érvényes e-mail címet.';
    if (!values.consent) errors.consent = 'A fizetéshez el kell fogadnod az adatkezelési tájékoztatót.';
    if (!values.transfer) errors.transfer = 'A fizetéshez el kell fogadnod az adattovábbítási nyilatkozatot.';
    if (Object.keys(errors).length) return sendCheckout(req, res, product, { values, errors }, 400);

    if (paymentLimit.full(req.ip)) {
      return sendCheckout(req, res, product, { values, error: 'Túl sok fizetési kísérlet. Kérjük, próbáld újra később.' }, 429);
    }
    paymentLimit.add(req.ip);

    const settings = paymentSettings();
    const page = productPage(product);
    const order = store.createOrder(db, {
      orderRef: `ELT-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${crypto.randomBytes(5).toString('hex')}`,
      productId: product.id,
      productName: page ? `${page.title} – ${product.name}` : product.name,
      pageSlug: product.pageSlug,
      amount: product.price,
      name: values.name,
      email: values.email,
      sandbox: settings.sandbox,
    });
    try {
      const started = await startPayment(settings, {
        orderRef: order.orderRef,
        total: order.amount,
        customerEmail: order.email,
        customerName: order.name,
        backUrl: `${baseUrl(req)}/fizetes/vissza`,
        items: [{ ref: product.id, title: order.productName.slice(0, 120), price: product.price }],
        fetchImpl,
      });
      store.updateOrder(db, order.id, { transactionId: started.transactionId });
      res.redirect(303, started.paymentUrl);
    } catch (err) {
      store.updateOrder(db, order.id, { status: 'error', error: err.message.slice(0, 500) });
      console.error(`SimplePay start hiba (${order.orderRef}): ${err.message}`);
      mailer.notify({
        subject: `Sikertelen fizetésindítás: ${order.productName}`,
        intro: 'Egy látogató fizetni szeretett volna, de a SimplePay-fizetést nem sikerült elindítani. Érdemes ellenőrizni a SimplePay beállításait.',
        rows: [['Termék', order.productName], ['Összeg', fmtHuf(order.amount)], ['Név', order.name], ['E-mail', order.email], ['Hiba', err.message]],
        link: adminLink(req),
        replyTo: order.email,
      });
      sendCheckout(req, res, product, {
        values, error: err instanceof SimplePayError ? 'A fizetést most nem sikerült elindítani. Kérjük, próbáld újra később.' : 'Váratlan hiba történt.',
      }, 502);
    }
  });

  const sendContentPage = (req, res, { page, isPublic }, form = {}, status = 200) => {
    const frame = siteFrame(readIndex());
    const families = page.extras.families ? store.listPublicFamilies(db, { status: 'adoptable' }).families : [];
    const posts = page.extras.posts.map((slug) => store.getPublicPostBySlug(db, slug)).filter(Boolean);
    let formHtml = '';
    if (page.extras.form === 'application') {
      formHtml = applicationForm(frame, { action: `/${page.slug}/jelentkezes` },
        { options: adoptableOptions(), ...store.getFormSettings(db), ...form });
    } else if (messageForm(page.extras.form)) {
      formHtml = renderMessageForm(messageForm(page.extras.form, store.getNominationSettings(db)),
        { action: `/${page.slug}/urlap`, privacyUrl: frame.privacyUrl, ...form });
    }
    if (!isPublic) res.set('X-Robots-Tag', 'noindex');
    sendHtml(res, renderPage(frame, {
      page, baseUrl: baseUrl(req), preview: !isPublic, families, posts, formHtml, form,
      products: store.listPageProducts(db, page.slug), payable: paymentsConfigured(),
    }), status);
  };

  app.get('/:slug', (req, res, next) => {
    const found = contentPage(req);
    if (found) return sendContentPage(req, res, found, { submitted: req.query.jelentkezes === 'koszonjuk' });
    if (LEGACY_REDIRECTS[req.params.slug]) return res.redirect(301, LEGACY_REDIRECTS[req.params.slug]);
    next();
  });

  app.post('/:slug/jelentkezes', formBody, (req, res, next) => {
    const found = contentPage(req);
    if (!found || found.page.extras.form !== 'application') return next();
    handleApplication(req, res, {
      thanks: `/${found.page.slug}?jelentkezes=koszonjuk#jelentkezes`,
      sendPage: (form, status) => sendContentPage(req, res, found, form, status),
    });
  });

  // Kapcsolati űrlap, programjelentkezés (orvosi dokumentumokkal), díjjelölés. A dokumentumok a nem nyilvános
  // mappába kerülnek, csak bejelentkezett admin töltheti le őket.
  const messageLimit = ipLimiter(5);

  // Az űrlap dokumentumai a böngészőből egyenesen a tárhelyre kerülnek (AWS-en); itt csak aláírt linket adunk.
  const UPLOAD_TYPES = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
  const INCOMING_KEY = /^incoming\/[0-9a-f]{24}\.(pdf|jpg|png|webp)$/;
  const uploadLimit = ipLimiter(30);
  app.post('/feltoltes', express.json({ limit: '2kb' }), async (req, res) => {
    const { type, size } = req.body || {};
    const ext = UPLOAD_TYPES[type];
    if (!ext) return res.status(400).json({ error: 'Csak PDF vagy kép (JPG, PNG, WEBP) tölthető fel.' });
    if (!Number.isInteger(size) || size < 1 || size > MAX_FILE_BYTES) return res.status(400).json({ error: 'Egy fájl legfeljebb 10 MB lehet.' });
    if (uploadLimit.full(req.ip)) return res.status(429).json({ error: 'Túl sok feltöltés. Kérjük, próbáld újra később.' });
    const key = `incoming/${crypto.randomBytes(12).toString('hex')}.${ext}`;
    const url = await storage.presignPut(key, { type, size });
    if (!url) return res.status(404).json({ error: 'Nincs közvetlen feltöltés.' });
    uploadLimit.add(req.ip);
    res.json({ key, url });
  });
  app.post('/:slug/urlap', formBody, async (req, res, next) => {
    const found = contentPage(req);
    const def = found && messageForm(found.page.extras.form, store.getNominationSettings(db));
    if (!def) return next();
    const thanks = `/${found.page.slug}?jelentkezes=koszonjuk#jelentkezes`;
    const send = (form, status) => sendContentPage(req, res, found, form, status);
    let body = req.body || {};
    let files = [];
    let problem = '';
    if (req.is('multipart/form-data')) ({ fields: body, files, problem } = await parseMultipart(req));
    if (body.website) return res.redirect(303, thanks);
    // A böngészőből már feltöltött dokumentumok (lásd /feltoltes).
    let incoming = [];
    if (!files.length && body.uploaded) {
      try { incoming = JSON.parse(body.uploaded); } catch { incoming = null; }
      if (!Array.isArray(incoming) || incoming.length > MAX_FILES || incoming.some((f) => !INCOMING_KEY.test(f?.key))) {
        return send({ error: 'Hibás feltöltés. Kérjük, válaszd ki újra a fájlokat.' }, 400);
      }
      for (const f of incoming) {
        const buffer = await storage.get(f.key);
        if (!buffer) return send({ error: 'A feltöltött fájl nem található. Kérjük, válaszd ki újra a fájlokat.' }, 400);
        files.push({ name: String(f.name || ''), buffer });
      }
      if (files.reduce((n, f) => n + f.buffer.length, 0) > MAX_TOTAL_BYTES) problem = 'A fájlok összesen legfeljebb 25 MB-osak lehetnek.';
    }

    if (messageLimit.full(req.ip)) {
      return send({ error: 'Erről a címről már túl sok üzenet érkezett. Kérjük, próbáld újra később, vagy írj nekünk e-mailt.' }, 429);
    }
    const { values, errors } = checkMessage(def, body);
    const acceptsFiles = def.sections.some((sec) => sec.fields.some((f) => f.type === 'file'));
    const kinds = files.map((f) => fileKind(f.buffer));
    if (problem) errors.documents = problem;
    else if (!acceptsFiles && files.length) errors.documents = 'Ezen az űrlapon nem lehet fájlt feltölteni.';
    else if (kinds.some((k) => !k)) errors.documents = 'Csak PDF vagy kép (JPG, PNG, WEBP) tölthető fel.';
    if (Object.keys(errors).length) return send({ values, errors }, 400);

    const { consent, ...data } = values;
    const message = store.createMessage(db, { form: found.page.extras.form, pageSlug: found.page.slug, data });
    if (files.length) {
      const saved = await Promise.all(files.map(async (f, i) => {
        const display = path.basename(f.name).replace(/[\u0000-\u001f]/g, '').slice(0, 150) || `dokumentum-${i + 1}`;
        const stored = `${i + 1}.${kinds[i]}`;
        await storage.put(`private/messages/${message.id}/${stored}`, f.buffer);
        return { name: display, stored, size: f.buffer.length, type: kinds[i] };
      }));
      store.setMessageFiles(db, message.id, saved);
      for (const f of incoming) await storage.remove(f.key);
    }
    const fields = def.sections.flatMap((sec) => sec.fields);
    mailer.notify({
      subject: `Új üzenet (${def.label}): ${data.name || ''}`.trim(),
      intro: `Új beküldés érkezett a(z) „${found.page.title}” oldal űrlapján.`,
      rows: [
        ...fields.filter((f) => f.type !== 'file' && data[f.name]).map((f) => [f.label, data[f.name]]),
        ...(files.length ? [['Feltöltött dokumentumok', `${files.length} db (az adminban tölthetők le)`]] : []),
      ],
      link: adminLink(req),
      replyTo: data.email,
    });
    messageLimit.add(req.ip);
    res.redirect(303, thanks);
  });

  // A régi oldal bejegyzéseinek címe (/2025/12/08/<webcím>/) a blogbejegyzésre vagy a család oldalára visz.
  let legacySlugs = null;
  app.get('/:y/:m/:d/:slug', (req, res, next) => {
    const { y, m, d, slug } = req.params;
    if (!/^\d{4}$/.test(y) || !/^\d{2}$/.test(m) || !/^\d{2}$/.test(d) || !SLUG.test(slug)) return next();
    if (store.getPublicPostBySlug(db, slug)) return res.redirect(301, `/blog/${slug}`);
    if (!legacySlugs) legacySlugs = fs.existsSync(IMPORT_FILE) ? legacyPostSlugs(loadImportData()) : new Map();
    const family = legacySlugs.has(slug) ? store.getFamilyByWpId(db, legacySlugs.get(slug)) : null;
    if (family && store.PUBLIC_STATUSES.includes(family.status)) return res.redirect(301, `/csaladok/${family.slug}`);
    next();
  });

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
