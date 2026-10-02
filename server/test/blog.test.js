import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { createApp } from '../src/app.js';
import { hashPassword } from '../src/auth.js';
import { loadConfig } from '../src/config.js';
import { openDb, seed, upsertUser } from '../src/db.js';
import { slugify } from '../src/validate.js';

const EMAIL = 'admin@pelda.hu';
const PASSWORD = 'nagyontitkos123';
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
const today = new Date().toISOString().slice(0, 10);
const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

let server;
let base;
let config;
let cookie;

before(async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'elt-blog-'));
  config = { ...loadConfig({ DATA_DIR: dataDir }), sessionSecret: 'teszt-titok' };
  const db = openDb(config.dbPath);
  seed(db);
  upsertUser(db, EMAIL, hashPassword(PASSWORD));
  server = createApp({ db, config }).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  const res = await request('POST', '/api/login', { body: { email: EMAIL, password: PASSWORD }, auth: false });
  cookie = res.headers.getSetCookie().find((c) => c.startsWith('elt_session=')).split(';')[0];
});

after(() => server.close());

function request(method, url, { body, auth = true, headers = {} } = {}) {
  const h = { 'X-ELT-Request': '1', ...headers };
  if (auth && cookie) h.Cookie = cookie;
  let payload = body;
  if (body !== undefined && !Buffer.isBuffer(body)) {
    h['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  return fetch(base + url, { method, headers: h, body: payload });
}

const page = async (url, opts) => {
  const res = await request('GET', url, { auth: false, ...opts });
  return { status: res.status, html: await res.text(), headers: res.headers };
};

const post = (overrides = {}) => ({
  title: 'Őszi családi nap', excerpt: '', content: '<p>Remek nap volt.</p>', coverImage: '',
  category: 'kozos-elmenyeink', status: 'published', publishedAt: today, ...overrides,
});

async function createPost(overrides) {
  const res = await request('POST', '/api/admin/posts', { body: post(overrides) });
  assert.equal(res.status, 201, await res.clone().text());
  return res.json();
}

async function upload() {
  const res = await request('POST', '/api/admin/uploads', { body: PNG, headers: { 'Content-Type': 'image/png' } });
  return (await res.json()).url;
}

describe('slugify', () => {
  test('ékezetek nélkül, kötőjelekkel', () => {
    assert.equal(slugify('Őszi családi nap 2026!'), 'oszi-csaladi-nap-2026');
    assert.equal(slugify('Árvíztűrő tükörfúrógép'), 'arvizturo-tukorfurogep');
    assert.equal(slugify('  --Szia   Világ--  '), 'szia-vilag');
  });
});

describe('admin API', () => {
  test('bejelentkezés nélkül 401', async () => {
    assert.equal((await request('GET', '/api/admin/posts', { auth: false })).status, 401);
    assert.equal((await request('POST', '/api/admin/posts', { auth: false, body: post() })).status, 401);
  });

  test('létrehozás: a webcím a címből készül, ütközéskor sorszámot kap', async () => {
    const a = await createPost({ title: 'Jótékonysági gála 2026' });
    const b = await createPost({ title: 'Jótékonysági gála 2026' });
    assert.equal(a.slug, 'jotekonysagi-gala-2026');
    assert.equal(b.slug, 'jotekonysagi-gala-2026-2');
    const edited = await (await request('PUT', `/api/admin/posts/${b.id}`, { body: post({ title: 'Más cím', slug: 'sajat-webcim' }) })).json();
    assert.equal(edited.slug, 'sajat-webcim');
  });

  test('érvénytelen adatok 400, külső kép kiszűrve', async () => {
    for (const body of [post({ title: ' ' }), post({ category: 'mas' }), post({ status: 'kesz' }),
      post({ publishedAt: '2026-13-45' }), post({ coverImage: 'https://evil.example/x.png' }), post({ title: '!!!' })]) {
      assert.equal((await request('POST', '/api/admin/posts', { body })).status, 400, JSON.stringify(body));
    }
    const p = await createPost({
      title: 'Képes bejegyzés',
      content: '<p>a</p><img src="https://evil.example/x.png"><img src="/uploads/abc.png" onerror="alert(1)"><script>alert(1)</script>',
    });
    assert.equal(p.content, '<p>a</p><img src="/uploads/abc.png" />');
  });
});

describe('nyilvános oldalak', () => {
  test('a piszkozat és az időzített bejegyzés nem nyilvános, az admin előnézetben látja', async () => {
    const draft = await createPost({ title: 'Titkos piszkozat', status: 'draft' });
    const future = await createPost({ title: 'Holnapi hír', publishedAt: tomorrow });
    const list = await page('/blog');
    assert.equal(list.status, 200);
    for (const p of [draft, future]) {
      assert.equal((await page(`/blog/${p.slug}`)).status, 404);
      assert.ok(!list.html.includes(p.title));
    }
    const api = await (await fetch(`${base}/api/posts`)).json();
    assert.ok(!api.some((p) => p.id === draft.id || p.id === future.id));
    assert.ok(api.every((p) => !('content' in p)));

    const preview = await page(`/blog/${draft.slug}`, { auth: true });
    assert.equal(preview.status, 200);
    assert.match(preview.html, /Előnézet: ez a bejegyzés még nem nyilvános/);
    assert.equal(preview.headers.get('x-robots-tag'), 'noindex');
  });

  test('a bejegyzés oldala: tartalom, meta adatok és a főoldal kerete', async () => {
    const cover = await upload();
    const p = await createPost({ title: 'Gyereknap a parkban', excerpt: 'Rövid összefoglaló.', coverImage: cover, content: '<h2>Alcím</h2><p>Szöveg.</p>' });
    const { status, html } = await page(`/blog/${p.slug}`);
    assert.equal(status, 200);
    assert.match(html, /<title>Gyereknap a parkban — Egy Lépéssel Több Alapítvány<\/title>/);
    assert.match(html, /<meta name="description" content="Rövid összefoglaló.">/);
    assert.ok(html.includes(`<meta property="og:image" content="${base}${cover}">`));
    assert.ok(html.includes(`<link rel="canonical" href="${base}/blog/gyereknap-a-parkban">`));
    assert.ok(html.includes('<h2>Alcím</h2><p>Szöveg.</p>'));
    assert.ok(html.includes('id="site-header"') && html.includes('</footer>'), 'fejléc és lábléc');
    assert.ok(html.includes('href="/#families"') && !html.includes('href="#families"'), 'horgonyok a főoldalra mutatnak');
    assert.ok(html.includes('src="/assets/img/logo-full.png"') && !html.includes('src="assets/'), 'abszolút képutak');
    assert.ok(!html.includes('loremflickr'), 'nincs külső helykitöltő kép');
  });

  test('a lista kategóriánként szűrhető és lapozható', async () => {
    for (let i = 1; i <= 13; i += 1) await createPost({ title: `Médiahír ${i}`, category: 'media' });
    const first = await page('/blog?kategoria=media');
    assert.equal(first.html.match(/Tovább olvasom/g).length, 12);
    assert.match(first.html, /Régebbi bejegyzések/);
    assert.ok(!first.html.includes('Gyereknap a parkban'), 'más kategória nem jelenik meg');
    const second = await page('/blog?kategoria=media&oldal=2');
    assert.equal(second.html.match(/Tovább olvasom/g).length, 1);
    assert.equal((await page('/blog?kategoria=nincs')).status, 200);
    assert.equal((await page('/blog?oldal=999')).status, 200);
  });

  test('a főoldalon a 3 legfrissebb közzétett bejegyzés jelenik meg', async () => {
    const home = (await page('/')).html;
    const section = home.slice(home.indexOf('id="blog"'));
    assert.match(home, /Hírek és közös élmények az alapítvány életéből/);
    assert.equal(section.slice(0, section.indexOf('</section>')).match(/Tovább olvasom/g).length, 3);
    assert.ok(!home.includes('Titkos piszkozat'));
  });

  test('a lábléc rendezvényei a blog „Rendezvények” bejegyzéseiből jönnek, minden oldalon', async () => {
    assert.ok(!(await page('/')).html.includes('id="events"'), 'rendezvény-bejegyzés nélkül a szekció elmarad');
    const cover = await upload();
    for (let i = 1; i <= 5; i += 1) {
      await createPost({
        title: `Gálaest ${i}`, category: 'rendezvenyek', coverImage: cover, publishedAt: `2026-0${i}-15`,
        content: `<p>Köszönjük!</p><div class="gallery"><a href="${cover}"><img src="${cover}" alt="" /></a><a href="${cover}"><img src="${cover}" alt="" /></a></div>`,
      });
    }
    await createPost({ title: 'Jövőbeli gála', category: 'rendezvenyek', publishedAt: tomorrow });
    for (const url of ['/', '/blog', '/csaladok']) {
      const { html } = await page(url);
      const events = html.slice(html.indexOf('id="events"'), html.indexOf('id="contact"'));
      assert.equal((events.match(/class="event-card/g) || []).length, 4, url);
      assert.match(events, /<a href="\/blog\/galaest-5" class="event-card group block">/);
      assert.ok(events.includes(`src="${cover}"`));
      assert.match(events, /2026\. május 15\.<\/time> · 2 fotó/);
      assert.ok(!events.includes('Gálaest 1<'), 'csak a 4 legfrissebb');
      assert.ok(!events.includes('Jövőbeli gála'), 'az időzített még nem');
      assert.match(events, /href="\/blog\?kategoria=rendezvenyek"/);
      assert.ok(!html.includes('loremflickr'));
    }
  });

  test('ismeretlen oldal: 404 a főoldal keretével', async () => {
    const res = await page('/nincs-ilyen-oldal');
    assert.equal(res.status, 404);
    assert.match(res.html, /Ez az oldal nem található/);
    assert.equal((await page('/blog/NAGYBETUS')).status, 404);
  });
});

describe('képek takarítása', () => {
  test('a bejegyzésből eltávolított és a törölt bejegyzés képei törlődnek', async () => {
    const coverUrl = await upload();
    const inlineUrl = await upload();
    const file = (url) => path.join(config.uploadsDir, path.basename(url));
    const p = await createPost({ title: 'Képtakarítás', coverImage: coverUrl, content: `<p>x</p><img src="${inlineUrl}">` });

    await request('PUT', `/api/admin/posts/${p.id}`, { body: post({ title: 'Képtakarítás', coverImage: coverUrl, content: '<p>x</p>' }) });
    assert.ok(!fs.existsSync(file(inlineUrl)));
    assert.ok(fs.existsSync(file(coverUrl)));

    await request('DELETE', `/api/admin/posts/${p.id}`);
    assert.ok(!fs.existsSync(file(coverUrl)));
  });

  test('a családnál is használt kép megmarad', async () => {
    const shared = await upload();
    await request('POST', '/api/admin/families', {
      body: { name: 'Közös kép', status: 'adopted', images: [{ url: shared, isCover: true }] },
    });
    const p = await createPost({ title: 'Közös kép bejegyzés', coverImage: shared });
    await request('DELETE', `/api/admin/posts/${p.id}`);
    assert.ok(fs.existsSync(path.join(config.uploadsDir, path.basename(shared))));
  });
});
