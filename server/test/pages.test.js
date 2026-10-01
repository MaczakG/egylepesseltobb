import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import sharp from 'sharp';
import { createApp } from '../src/app.js';
import { hashPassword } from '../src/auth.js';
import { loadConfig } from '../src/config.js';
import * as store from '../src/db.js';
import { sanitizePage } from '../src/validate.js';
import { PAGES_FILE, loadImportData, runImport, runPagesImport } from '../src/wpimport.js';

const EMAIL = 'admin@pelda.hu';
const PASSWORD = 'nagyontitkos123';
const pagesData = loadImportData(PAGES_FILE);
const PDF = Buffer.from('%PDF-1.4\n1 0 obj <<>> endobj\ntrailer <<>>\n%%EOF\n');

let server;
let base;
let db;
let config;
let cookie;
let jpeg;
let firstRun;
const fetched = [];
const BROKEN = 'https://egylepesseltobb.hu/wp-content/uploads/2024/11/1-1.png';

const fetchImage = async (url) => {
  fetched.push(url);
  if (url === BROKEN) throw new Error('HTTP 404');
  return url.toLowerCase().endsWith('.pdf') ? PDF : jpeg;
};

before(async () => {
  jpeg = await sharp({ create: { width: 2000, height: 1400, channels: 3, background: '#c3ac7e' } }).jpeg().toBuffer();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'elt-pages-'));
  config = { ...loadConfig({ DATA_DIR: dataDir }), sessionSecret: 'teszt-titok' };
  db = store.openDb(config.dbPath);
  store.seed(db);
  store.upsertUser(db, EMAIL, hashPassword(PASSWORD));
  await runImport({ db, config, data: loadImportData(), fetchImage: async () => jpeg, log: () => {} });
  firstRun = await runPagesImport({ db, config, data: pagesData, fetchImage, log: () => {} });
  server = createApp({ db, config }).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  const res = await api('POST', '/api/login', { email: EMAIL, password: PASSWORD }, false);
  cookie = res.headers.getSetCookie().find((c) => c.startsWith('elt_session=')).split(';')[0];
});

after(() => server.close());

function api(method, url, body, auth = true) {
  const headers = { 'X-ELT-Request': '1' };
  if (auth && cookie) headers.Cookie = cookie;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  return fetch(base + url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual' });
}

const page = async (url, auth = false) => {
  const res = await fetch(base + url, { headers: auth ? { Cookie: cookie } : {}, redirect: 'manual' });
  return { status: res.status, html: await res.text(), headers: res.headers };
};

describe('a régi oldal aloldalainak importja', () => {
  test('minden tartalmi oldal bekerül, a képek és PDF-ek letöltve, a régi címek átírva', () => {
    assert.equal(firstRun.state, 'done');
    assert.equal(firstRun.done, pagesData.pages.length);
    assert.equal(store.listPages(db).length, 21);
    assert.deepEqual(firstRun.failedFiles, [BROKEN]);
    for (const pg of store.listPages(db)) {
      assert.doesNotMatch(pg.content, /src="https:\/\/egylepesseltobb\.hu/, pg.slug);
      assert.doesNotMatch(pg.content, /<script|style=/, pg.slug);
    }
    const docs = store.getPageBySlug(db, 'dokumentumok');
    assert.match(docs.content, /<a href="\/uploads\/Alapito-okirat-1\.pdf">Alapító okirat\.pdf<\/a>/);
    assert.ok(fs.existsSync(path.join(config.uploadsDir, 'Prospektus.pdf')), 'a menüből linkelt prospektus is letöltődik');
    assert.match(store.getPageBySlug(db, 'kuratorium').content, /<img src="\/uploads\/[0-9a-f]{24}\.webp" alt="Hajós István" \/>/);
  });

  test('újrafuttatva nem duplikál, csak a hiányzó fájlt kéri újra, az adminban módosított oldalhoz nem nyúl', async () => {
    const pg = store.getPageBySlug(db, 'kapcsolat');
    db.prepare("UPDATE pages SET updated_at = datetime('now', '-1 minute'), wp_synced_at = datetime('now', '-1 minute')").run();
    store.updatePage(db, pg.id, { ...pg, title: 'Kapcsolat – átírva' });
    const before = fetched.length;
    const again = await runPagesImport({ db, config, data: pagesData, fetchImage, log: () => {} });
    assert.equal(again.skipped, 1);
    assert.equal(store.listPages(db).length, 21);
    assert.deepEqual(fetched.slice(before), [BROKEN]);
    assert.equal(store.getPageBySlug(db, 'kapcsolat').title, 'Kapcsolat – átírva');
  });
});

describe('oldalak megjelenítése', () => {
  test('/alapitonk: a főoldal kerete, címsor, kép+szöveg elrendezés', async () => {
    const { status, html } = await page('/alapitonk');
    assert.equal(status, 200);
    assert.match(html, /<title>Alapítónk — Egy Lépéssel Több Alapítvány<\/title>/);
    assert.match(html, /<h1[^>]*>Alapítónk<\/h1>/);
    assert.match(html, /<div class="media"><div class="media-img"><img src="\/uploads\/[0-9a-f]{24}\.webp"/);
    assert.match(html, /Hajós István az Egy lépéssel több alapítvány alapítója/);
    assert.match(html, /<link rel="canonical" href="http:\/\/127\.0\.0\.1:\d+\/alapitonk">/);
    assert.match(html, /id="site-header"/);
    assert.match(html, /<a href="https:\/\/hu\.wikipedia\.org[^"]+" rel="noopener noreferrer" target="_blank">/);
  });

  test('/kuldetesunk és /fogadj-orokbe-egy-csaladot: alattuk az örökbefogadható családok', async () => {
    for (const slug of ['kuldetesunk', 'fogadj-orokbe-egy-csaladot']) {
      const { html } = await page(`/${slug}`);
      const section = html.slice(html.indexOf('>Örökbefogadható családok</h2>'));
      assert.equal((section.match(/<article /g) || []).length, store.countFamiliesByStatus(db).adoptable, slug);
    }
  });

  test('/alairasi-ceremonia: a hozzá tartozó galériás bejegyzések kártyái', async () => {
    const { html } = await page('/alairasi-ceremonia');
    for (const slug of ['alairasi-ceremonia', 'vii-alairasi-ceremonia', 'viii-alairasi-ceremonia']) {
      assert.match(html, new RegExp(`href="/blog/${slug}"`));
    }
  });

  test('/partnereink logórács, /1-ado galéria a nagyítóval, /linkesfizetes fizetési gombok', async () => {
    assert.match((await page('/partnereink')).html, /<div class="logos"><img src="\/uploads\//);
    const ado = (await page('/1-ado')).html;
    assert.match(ado, /<div class="gallery"><a href="\/uploads\/[^"]+"><img/);
    assert.match(ado, /id="gallery-lightbox"/);
    assert.match(ado, /<a class="button" href="\/uploads\/25EGYSZA-adoszammal\.pdf">/);
    const pay = (await page('/linkesfizetes')).html;
    assert.equal((pay.match(/<a class="button" href="https:\/\/checkout\.simplepay\.hu\/trx\/[^"]+" rel="noopener noreferrer" target="_blank">Fizetés<\/a>/g) || []).length, 8);
  });

  test('a régi címek átirányítanak', async () => {
    const loc = async (url) => { const r = await page(url); return [r.status, r.headers.get('location')]; };
    assert.deepEqual(await loc('/fooldal'), [301, '/']);
    assert.deepEqual(await loc('/orokbefogadhato-csaladok/'), [301, '/csaladok?statusz=orokbefogadhato']);
    assert.deepEqual(await loc('/orokbefogadott-csaladok'), [301, '/csaladok?statusz=orokbefogadott']);
    assert.deepEqual(await loc('/kozos-elmenyeink'), [301, '/blog?kategoria=kozos-elmenyeink']);
    assert.deepEqual(await loc('/2025/12/08/galaest/'), [301, '/blog/galaest']);
    const kinga = store.listFamilies(db).find((f) => f.name === 'H. Kinga és családja');
    assert.deepEqual(await loc('/2026/09/30/h-kinga-es-csaladja/'), [301, `/csaladok/${kinga.slug}`]);
    assert.equal((await page('/2026/01/01/nincs-ilyen')).status, 404);
    assert.equal((await page('/nincs-ilyen-oldal')).status, 404);
  });
});

describe('jelentkezési űrlap a „Jelentkezz támogatónak” oldalon', () => {
  test('az űrlap a régi oldal összegeivel és válaszaival, család előválasztás nélkül', async () => {
    const { html } = await page('/jelntkezz-tamogatonak');
    assert.match(html, /<form method="post" action="\/jelntkezz-tamogatonak\/jelentkezes"/);
    assert.match(html, /<option value="" selected>Válassz családot<\/option>/);
    assert.equal((html.match(/<option value="\d+">[\d\s]+Ft<\/option>/g) || []).length, 10);
    assert.match(html, /<option value="Plakáton láttam">Plakáton láttam<\/option>/);
  });

  test('beküldés: mentés, köszönő üzenet ugyanezen az oldalon', async () => {
    const family = store.listFamilies(db, { status: 'adoptable' })[0];
    const res = await fetch(`${base}/jelntkezz-tamogatonak/jelentkezes`, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Forwarded-For': '10.1.1.1' },
      body: new URLSearchParams({
        last_name: 'Teszt', first_name: 'Ilona', email: 'ilona@pelda.hu', phone: '+36 1 234 5678', amount: '25000',
        family_id: String(family.id), source: 'Rádióból', consent: 'on',
      }).toString(),
    });
    assert.equal(res.status, 303);
    assert.equal(res.headers.get('location'), '/jelntkezz-tamogatonak?jelentkezes=koszonjuk#jelentkezes');
    assert.equal(store.listApplications(db)[0].familyName, family.name);
    assert.match((await page('/jelntkezz-tamogatonak?jelentkezes=koszonjuk')).html, /Köszönjük a jelentkezésedet!/);
  });
});

describe('oldal tartalma és piszkozat', () => {
  test('a tartalomból csak a dizájn elemei maradnak, a belső link ugyanabban a lapon nyílik', () => {
    const html = sanitizePage('<section><p class="eyebrow ismeretlen">Címke</p><script>alert(1)</script><div class="cards"><div class="card"><h3>Kártya</h3></div></div>'
      + '<p><a href="/alapitonk">Belső</a> <a href="https://pelda.hu">Külső</a> <a href="javascript:alert(1)">Rossz</a></p>'
      + '<img src="https://kulso.hu/kep.jpg" alt=""><div style="color:red" class="x">Stílus</div></section>');
    assert.equal(html, '<section><p class="eyebrow">Címke</p><div class="cards"><div class="card"><h3>Kártya</h3></div></div>'
      + '<p><a href="/alapitonk">Belső</a> <a href="https://pelda.hu" rel="noopener noreferrer" target="_blank">Külső</a> <a>Rossz</a></p>'
      + '<div>Stílus</div></section>');
  });

  test('a piszkozat oldal nem nyilvános, a bejelentkezett admin előnézetben látja', async () => {
    const pg = store.createPage(db, {
      slug: 'blog', title: 'Piszkozat', content: '<section><p>Szöveg.</p></section>', status: 'draft',
      extras: { form: '', families: false, posts: ['galaest'] },
    });
    assert.equal(pg.slug, 'blog-oldal', 'az alkalmazás saját útvonala nem lehet oldal');
    assert.equal((await page('/blog-oldal')).status, 404);
    const preview = await page('/blog-oldal', true);
    assert.equal(preview.status, 200);
    assert.equal(preview.headers.get('x-robots-tag'), 'noindex');
    assert.match(preview.html, /Előnézet: ez az oldal még nem nyilvános/);
    assert.match(preview.html, /href="\/blog\/galaest"/);
  });

  test('az oldalak adminfelülete és API-ja nincs meg', async () => {
    assert.equal((await api('GET', '/api/admin/pages')).status, 404);
  });
});
