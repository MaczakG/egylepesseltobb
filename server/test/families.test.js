import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { after, before, describe, test } from 'node:test';
import { createApp } from '../src/app.js';
import { hashPassword } from '../src/auth.js';
import { loadConfig } from '../src/config.js';
import * as store from '../src/db.js';

const EMAIL = 'admin@pelda.hu';
const PASSWORD = 'nagyontitkos123';

let server;
let base;
let db;
let cookie;

before(async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'elt-fam-'));
  const config = { ...loadConfig({ DATA_DIR: dataDir }), sessionSecret: 'teszt-titok' };
  db = store.openDb(config.dbPath);
  store.seed(db);
  store.upsertUser(db, EMAIL, hashPassword(PASSWORD));
  server = createApp({ db, config }).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  const res = await request('POST', '/api/login', { body: { email: EMAIL, password: PASSWORD }, auth: false });
  cookie = res.headers.getSetCookie().find((c) => c.startsWith('elt_session=')).split(';')[0];
});

after(() => server.close());

function request(method, url, { body, auth = true } = {}) {
  const h = { 'X-ELT-Request': '1' };
  if (auth && cookie) h.Cookie = cookie;
  if (body !== undefined) h['Content-Type'] = 'application/json';
  return fetch(base + url, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
}

const page = async (url, opts) => {
  const res = await request('GET', url, { auth: false, ...opts });
  return { status: res.status, html: await res.text(), headers: res.headers };
};

const family = (overrides = {}) => ({
  name: 'Teszt család', subtitle: '', status: 'adoptable', amount: 0, applicants: 0,
  story: '<p>Egy történet.</p>', images: [], ...overrides,
});

const create = async (overrides) => (await request('POST', '/api/admin/families', { body: family(overrides) })).json();

describe('a családok webcíme', () => {
  test('a minta-családok a nevükből kapnak webcímet', () => {
    assert.deepEqual(store.listFamilies(db).map((f) => f.slug).sort(), ['f-noel', 'kamilla', 'noel']);
  });

  test('új családnál a névből készül, foglalt névnél sorszámot kap', async () => {
    const f = await create({ name: 'Kamilla' });
    assert.equal(f.slug, 'kamilla-2');
    const g = await create({ name: 'Kiss Ábel és családja', slug: '' });
    assert.equal(g.slug, 'kiss-abel-es-csaladja');
  });

  test('átnevezéskor megmarad, kézzel átírható', async () => {
    const f = await create({ name: 'Régi Név' });
    let res = await request('PUT', `/api/admin/families/${f.id}`, { body: family({ name: 'Új Név', slug: '' }) });
    assert.equal((await res.json()).slug, 'regi-nev');
    res = await request('PUT', `/api/admin/families/${f.id}`, { body: family({ name: 'Új Név', slug: 'Új Név Ékezettel!' }) });
    assert.equal((await res.json()).slug, 'uj-nev-ekezettel');
    res = await request('PUT', `/api/admin/families/${f.id}`, { body: family({ name: 'Új Név', slug: 'kamilla' }) });
    assert.equal((await res.json()).slug, 'kamilla-3', 'foglalt webcímre nem írható át');
  });
});

describe('a gyerek aloldala', () => {
  test('a főoldali kártya az aloldalra visz', async () => {
    const { html } = await page('/');
    assert.match(html, /<a href="\/csaladok\/kamilla" class="inline-flex[^"]*">Segíteni szeretnék →<\/a>/);
    assert.match(html, /href="\/csaladok\?statusz=orokbefogadott"/);
  });

  test('az örökbefogadható család oldala az adatbázisból: történet, képek, segítség, ajánló', async () => {
    const f = await create({
      name: 'B. Lili és családja',
      subtitle: '6 éves · SMA',
      amount: 987654,
      applicants: 4,
      story: '<p>Lili <strong>vidám</strong> kislány.</p><h2>Kezelések</h2><p>Hetente jár terápiára.</p>',
      images: [
        { url: '/assets/img/story-anna.webp', label: 'a', isCover: false },
        { url: '/assets/img/story-noel.webp', label: 'b', isCover: true },
      ],
    });
    assert.equal(f.slug, 'b-lili-es-csaladja');
    const { status, html } = await page('/csaladok/b-lili-es-csaladja');
    assert.equal(status, 200);
    assert.match(html, /<title>B\. Lili és családja — Egy Lépéssel Több Alapítvány<\/title>/);
    assert.match(html, /<h1[^>]*>B\. Lili és családja<\/h1>/);
    assert.match(html, /6 éves · SMA/);
    assert.match(html, /<div id="tortenet" class="lg:col-span-7 lg:sticky lg:top-28 scroll-mt-28">/);
    assert.match(html, /<div class="blog-content"><p>Lili <strong>vidám<\/strong> kislány\.<\/p><h2>Kezelések<\/h2>/);
    assert.match(html, /<link rel="canonical" href="http:\/\/127\.0\.0\.1:\d+\/csaladok\/b-lili-es-csaladja">/);
    assert.match(html, /<meta property="og:image" content="http:\/\/127\.0\.0\.1:\d+\/assets\/img\/story-noel\.webp">/);
    assert.match(html, /<meta name="description" content="Lili vidám kislány\. Kezelések Hetente jár terápiára\.">/);
    // A borítókép elöl, a többi kép galériában; mindkettő a nagyítóban nyílik.
    assert.deepEqual([...html.matchAll(/<a href="([^"]+)" data-lightbox/g)].map((m) => m[1]),
      ['/assets/img/story-noel.webp', '/assets/img/story-anna.webp']);
    assert.match(html, /id="gallery-lightbox"/);
    // Jelentkezési űrlap, a család előválasztva; a kérdésekre a lábléc e-mail címe.
    assert.match(html, /<form method="post" action="\/csaladok\/b-lili-es-csaladja\/jelentkezes"/);
    assert.match(html, new RegExp(`<option value="${f.id}" selected>B\\. Lili és családja</option>`));
    assert.match(html, /href="mailto:info@egylepesseltobb\.hu"/);
    assert.match(html, /facebook\.com\/sharer\/sharer\.php\?u=http%3A%2F%2F127\.0\.0\.1%3A\d+%2Fcsaladok%2Fb-lili-es-csaladja/);
    // Belső adatok nem kerülnek ki.
    assert.doesNotMatch(html, /987654|987 654/);
    // Ajánló: a többi örökbefogadható család, a saját nélkül.
    const more = html.slice(html.indexOf('Ők is segítségre várnak'));
    assert.equal((more.match(/<article /g) || []).length, 3);
    assert.doesNotMatch(more, /href="\/csaladok\/b-lili-es-csaladja"/);
    // A keret a főoldalé.
    assert.match(html, /<header|<nav/);
    assert.match(html, /id="contact"/);
  });

  test('az örökbefogadott család oldala köszönetet mond, nem kér segítséget', async () => {
    await create({ name: 'Örökbefogadott Ottó', status: 'adopted' });
    const { status, html } = await page('/csaladok/orokbefogadott-otto');
    assert.equal(status, 200);
    assert.match(html, /már megtalálta a támogatóit/);
    // Az űrlapon a még segítségre váró családok közül lehet választani, ő maga nincs köztük.
    assert.match(html, /Jelentkezem támogatónak/);
    assert.match(html, /<option value="" selected>Válassz családot<\/option>/);
    assert.doesNotMatch(html, />Örökbefogadott Ottó<\/option>/);
    assert.match(html, /<a href="\/csaladok\?statusz=orokbefogadott"[^>]*>Örökbefogadott családok<\/a>/);
  });

  test('az archivált és a feltöltés alatti család csak az adminnak látszik, előnézetként', async () => {
    await create({ name: 'Archív Anna', status: 'archived' });
    await create({ name: 'Feltöltés Feri', status: 'uploading' });
    for (const slug of ['archiv-anna', 'feltoltes-feri']) {
      assert.equal((await page(`/csaladok/${slug}`)).status, 404);
      const admin = await page(`/csaladok/${slug}`, { auth: true });
      assert.equal(admin.status, 200);
      assert.equal(admin.headers.get('x-robots-tag'), 'noindex');
      assert.match(admin.html, /Előnézet: ez a család nem nyilvános/);
    }
  });

  test('ismeretlen vagy hibás webcím: 404', async () => {
    assert.equal((await page('/csaladok/nincs-ilyen')).status, 404);
    assert.equal((await page('/csaladok/Rossz%20Cim')).status, 404);
  });

  test('a név és az alcím escape-elve kerül az oldalra', async () => {
    const f = await create({ name: '<script>alert(1)</script> család', subtitle: '"><img src=x onerror=alert(1)>' });
    const { html } = await page(`/csaladok/${f.slug}`);
    assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
    assert.doesNotMatch(html, /<img src=x/);
    assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt; család/);
  });
});

describe('családlista', () => {
  test('alapból minden nyilvános család (elöl az örökbefogadhatók), szűrővel csak az egyik fajta', async () => {
    const all = await page('/csaladok');
    assert.equal(all.status, 200);
    assert.match(all.html, /<h1[^>]*>Családjaink<\/h1>/);
    assert.ok(all.html.indexOf('/csaladok/b-lili-es-csaladja"') < all.html.indexOf('/csaladok/orokbefogadott-otto"'), 'elöl az örökbefogadhatók');
    assert.doesNotMatch(all.html, /archiv-anna|feltoltes-feri/);
    const counts = store.countFamiliesByStatus(db);
    assert.match(all.html, new RegExp(`Mind <span class="text-navy-900/55">${counts.adoptable + counts.adopted}</span>`));

    const adoptable = await page('/csaladok?statusz=orokbefogadhato');
    assert.match(adoptable.html, /<h1[^>]*>Örökbefogadható családok<\/h1>/);
    assert.match(adoptable.html, /href="\/csaladok\/b-lili-es-csaladja"/);
    assert.doesNotMatch(adoptable.html, /orokbefogadott-otto/);

    const adopted = await page('/csaladok?statusz=orokbefogadott');
    assert.match(adopted.html, /<h1[^>]*>Örökbefogadott családjaink<\/h1>/);
    assert.match(adopted.html, /href="\/csaladok\/orokbefogadott-otto"/);
    assert.match(adopted.html, /Elolvasom a történetüket →/);
    assert.doesNotMatch(adopted.html, /href="\/csaladok\/kamilla"/);
    assert.match(adopted.html, new RegExp(`Örökbefogadott <span class="text-navy-900/55">${counts.adopted}</span>`));
  });

  test('nincs lapozás: minden család egy oldalon', async () => {
    for (let i = 1; i <= 30; i += 1) store.createFamily(db, family({ name: `Sok család ${i}`, status: i % 2 ? 'adoptable' : 'adopted' }));
    const counts = store.countFamiliesByStatus(db);
    const cards = async (url) => ((await page(url)).html.match(/<article /g) || []).length;
    assert.equal(await cards('/csaladok'), counts.adoptable + counts.adopted);
    assert.equal(await cards('/csaladok?statusz=orokbefogadhato'), counts.adoptable);
    assert.equal(await cards('/csaladok?statusz=orokbefogadott'), counts.adopted);
    assert.doesNotMatch((await page('/csaladok')).html, /aria-label="Lapozás"/);
  });
});

describe('migráció', () => {
  test('a webcím nélküli régi családok a nevükből kapnak egyedi webcímet', () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'elt-slug-')), 'old.db');
    const old = new DatabaseSync(file);
    old.exec(`CREATE TABLE families (
      id INTEGER PRIMARY KEY, name TEXT NOT NULL, subtitle TEXT NOT NULL DEFAULT '', status TEXT NOT NULL,
      amount INTEGER NOT NULL DEFAULT 0, applicants INTEGER NOT NULL DEFAULT 0, story TEXT NOT NULL DEFAULT '',
      images TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL DEFAULT (date('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')));
      INSERT INTO families (name, status) VALUES ('Csaba és családja', 'adopted'), ('Csaba és családja', 'adopted'), ('!!!', 'archived');`);
    old.close();
    const migrated = store.openDb(file);
    assert.deepEqual(store.listFamilies(migrated).map((f) => f.slug).sort(),
      ['csaba-es-csaladja', 'csaba-es-csaladja-2', 'csalad']);
    store.openDb(file);
  });
});
