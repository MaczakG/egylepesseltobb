import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
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
let ipCounter = 0;

before(async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'elt-app-'));
  const config = { ...loadConfig({ DATA_DIR: dataDir }), sessionSecret: 'teszt-titok' };
  db = store.openDb(config.dbPath);
  store.seed(db);
  store.upsertUser(db, EMAIL, hashPassword(PASSWORD));
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
  return fetch(base + url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}

// Minden beküldés más (a proxytól kapott) IP-ről jön, hogy a korlátozás csak a saját tesztjét érintse.
function submit(slug, fields, ip = `10.0.0.${(ipCounter += 1)}`) {
  return fetch(`${base}/csaladok/${slug}/jelentkezes`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Forwarded-For': ip },
    body: new URLSearchParams(fields).toString(),
  });
}

const family = (slug) => store.getFamilyBySlug(db, slug);

const valid = (overrides = {}) => ({
  last_name: 'Kovács', first_name: 'Anna', email: 'anna@pelda.hu', phone: '+36 30 123 4567',
  amount: '10000', family_id: String(family('kamilla').id), source: 'Facebook', note: '', consent: 'on', ...overrides,
});

describe('jelentkezési űrlap a család oldalán', () => {
  test('minden mezővel, a család előválasztva, a beállított összegekkel és válaszokkal', async () => {
    const html = await (await fetch(`${base}/csaladok/kamilla`)).text();
    assert.match(html, /<h2[^>]*>Jelentkezem támogatónak<\/h2>/);
    assert.match(html, /<form method="post" action="\/csaladok\/kamilla\/jelentkezes"/);
    for (const name of ['last_name', 'first_name', 'email', 'phone', 'amount', 'family_id', 'source', 'note', 'consent', 'website']) {
      assert.match(html, new RegExp(`name="${name}"`), name);
    }
    assert.match(html, new RegExp(`<option value="${family('kamilla').id}" selected>Kamilla</option>`));
    assert.match(html, /<option value="10000">10\s000 Ft<\/option>/);
    assert.match(html, /<option value="Ismerősöm ajánlotta">Ismerősöm ajánlotta<\/option>/);
    assert.match(html, /Elolvastam és megértettem az adatkezelési tájékoztatót/);
  });

  test('sikeres jelentkezés: mentés, +1 jelentkező, átirányítás a köszönő üzenetre', async () => {
    const before = family('kamilla').applicants;
    const res = await submit('kamilla', valid({ note: 'Szívesen segítek <b>havonta</b>.' }));
    assert.equal(res.status, 303);
    assert.equal(res.headers.get('location'), '/csaladok/kamilla?jelentkezes=koszonjuk#jelentkezes');
    assert.equal(family('kamilla').applicants, before + 1);
    const [app] = store.listApplications(db);
    assert.equal(app.lastName, 'Kovács');
    assert.equal(app.familyName, 'Kamilla');
    assert.equal(app.amount, 10000);
    assert.equal(app.note, 'Szívesen segítek <b>havonta</b>.');
    assert.equal(app.status, 'new');
    assert.match(app.consentAt, /^\d{4}-\d{2}-\d{2} /);
    const thanks = await (await fetch(`${base}/csaladok/kamilla?jelentkezes=koszonjuk`)).text();
    assert.match(thanks, /Köszönjük a jelentkezésedet!/);
    assert.doesNotMatch(thanks, /<form method="post"/);
  });

  test('másik családot választva annak a számlálója nő', async () => {
    const noel = family('noel');
    const kamilla = family('kamilla').applicants;
    const res = await submit('kamilla', valid({ family_id: String(noel.id) }));
    assert.equal(res.status, 303);
    assert.equal(family('noel').applicants, noel.applicants + 1);
    assert.equal(family('kamilla').applicants, kamilla);
  });

  test('hibás adatoknál nem ment, a hibákat és a beírt értékeket visszaadja', async () => {
    const count = store.listApplications(db).length;
    const res = await submit('kamilla', valid({
      last_name: '"><script>alert(1)</script>', first_name: '', email: 'nem-email', phone: '12', amount: '123',
      source: 'Kitalált', consent: '',
    }));
    assert.equal(res.status, 400);
    const html = await res.text();
    assert.equal(store.listApplications(db).length, count);
    for (const msg of ['Add meg a keresztneved.', 'Adj meg egy érvényes e-mail címet.', 'Adj meg egy érvényes telefonszámot.',
      'Válassz összeget.', 'Válassz a felsoroltak közül.', 'A jelentkezéshez el kell fogadnod az adatkezelési tájékoztatót.']) {
      assert.ok(html.includes(msg), msg);
    }
    assert.match(html, /value="&quot;&gt;&lt;script&gt;alert\(1\)&lt;\/script&gt;"/);
    assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
    assert.match(html, /value="nem-email"/);
    assert.match(html, /scrollIntoView/);
  });

  test('csak örökbefogadható családra lehet jelentkezni', async () => {
    const archived = store.createFamily(db, { name: 'Archív Ádám', subtitle: '', status: 'archived', amount: 0, applicants: 0, story: '', images: [] });
    const res = await submit('kamilla', valid({ family_id: String(archived.id) }));
    assert.equal(res.status, 400);
    assert.match(await res.text(), /Ez a család már nem várja a jelentkezéseket/);
    assert.equal(store.getFamily(db, archived.id).applicants, 0);
    assert.equal((await submit('kamilla', valid({ family_id: '999999' }))).status, 400);
  });

  test('a rejtett mezőt kitöltő robot „sikert” lát, de nem kerül be', async () => {
    const count = store.listApplications(db).length;
    const res = await submit('kamilla', valid({ website: 'http://spam.example' }));
    assert.equal(res.status, 303);
    assert.equal(store.listApplications(db).length, count);
  });

  test('egy IP-ről óránként legfeljebb 5 jelentkezés', async () => {
    for (let i = 0; i < 5; i += 1) assert.equal((await submit('kamilla', valid(), '10.9.9.9')).status, 303);
    const res = await submit('kamilla', valid(), '10.9.9.9');
    assert.equal(res.status, 429);
    assert.match(await res.text(), /túl sok jelentkezés/);
  });

  test('nem nyilvános családnál és hibás webcímnél 404', async () => {
    assert.equal((await submit('archiv-adam', valid())).status, 404);
    assert.equal((await submit('nincs-ilyen', valid())).status, 404);
  });
});

describe('automatikus státuszváltás jelentkezéskor', () => {
  test('a küszöb elérésekor a beállított státuszra vált, és lekerül a főoldalról', async () => {
    const f = store.createFamily(db, { name: 'Küszöb Kata', subtitle: '', status: 'adoptable', amount: 0, applicants: 1, story: '', images: [] });
    store.saveSettings(db, { threshold: 2, autoStatus: 'adopted', autoEnabled: true });
    assert.equal((await submit(f.slug, valid({ family_id: String(f.id) }))).status, 303);
    const after = store.getFamily(db, f.id);
    assert.equal(after.applicants, 2);
    assert.equal(after.status, 'adopted');
    assert.doesNotMatch(await (await fetch(`${base}/`)).text(), /Küszöb Kata/);
  });

  test('kikapcsolt automatizmusnál csak a számláló nő', async () => {
    const f = store.createFamily(db, { name: 'Kézi Kornél', subtitle: '', status: 'adoptable', amount: 0, applicants: 5, story: '', images: [] });
    store.saveSettings(db, { threshold: 2, autoStatus: 'adopted', autoEnabled: false });
    assert.equal((await submit(f.slug, valid({ family_id: String(f.id) }))).status, 303);
    assert.equal(store.getFamily(db, f.id).applicants, 6);
    assert.equal(store.getFamily(db, f.id).status, 'adoptable');
    store.saveSettings(db, { threshold: 100, autoStatus: 'adopted', autoEnabled: true });
  });
});

describe('admin: jelentkezések', () => {
  test('csak bejelentkezve érhető el', async () => {
    assert.equal((await api('GET', '/api/admin/applications', undefined, false)).status, 401);
  });

  test('lista a legfrissebbel kezdve, állapot módosítása', async () => {
    const list = await (await api('GET', '/api/admin/applications')).json();
    assert.ok(list.length >= 3);
    assert.ok(list[0].id > list[list.length - 1].id);
    const res = await api('PUT', `/api/admin/applications/${list[0].id}`, { status: 'contacted' });
    assert.equal((await res.json()).status, 'contacted');
    assert.equal((await api('PUT', `/api/admin/applications/${list[0].id}`, { status: 'rossz' })).status, 400);
    assert.equal((await api('PUT', '/api/admin/applications/999999', { status: 'closed' })).status, 404);
  });

  test('törléskor a család jelentkezőinek száma eggyel csökken (nulla alá nem)', async () => {
    const app = store.listApplications(db).find((a) => a.familyName === 'Kamilla');
    const before = family('kamilla').applicants;
    assert.equal((await api('DELETE', `/api/admin/applications/${app.id}`)).status, 200);
    assert.equal(family('kamilla').applicants, before - 1);
    assert.equal(store.getApplication(db, app.id), null);
    assert.equal((await api('DELETE', `/api/admin/applications/${app.id}`)).status, 404);

    const zero = store.createFamily(db, { name: 'Nulla Nóra', subtitle: '', status: 'adoptable', amount: 0, applicants: 0, story: '', images: [] });
    const created = store.createApplication(db, { ...valid(), lastName: 'X', firstName: 'Y', amount: 5000, familyId: zero.id, note: '' });
    store.updateFamily(db, zero.id, { ...store.getFamily(db, zero.id), applicants: 0 });
    await api('DELETE', `/api/admin/applications/${created.id}`);
    assert.equal(store.getFamily(db, zero.id).applicants, 0);
  });

  test('a család törlése után a jelentkezése megmarad a család nevével', async () => {
    const f = store.createFamily(db, { name: 'Törölt Tamás', subtitle: '', status: 'adoptable', amount: 0, applicants: 0, story: '', images: [] });
    const app = store.createApplication(db, { lastName: 'A', firstName: 'B', email: 'a@b.hu', phone: '+3612345678', amount: 5000, familyId: f.id, source: 'Facebook', note: '' });
    assert.equal((await api('DELETE', `/api/admin/families/${f.id}`)).status, 200);
    const kept = store.getApplication(db, app.id);
    assert.equal(kept.familyId, null);
    assert.equal(kept.familyName, 'Törölt Tamás');
  });
});

describe('admin: az űrlap választható értékei', () => {
  test('alapértékek, mentés, és az űrlapon azonnal megjelennek', async () => {
    const defaults = await (await api('GET', '/api/admin/form-settings')).json();
    assert.deepEqual(defaults.amounts, store.DEFAULT_FORM_SETTINGS.amounts);
    const res = await api('PUT', '/api/admin/form-settings', { amounts: '25 000 Ft\n8000\n8000', sources: 'TikTok\n\nPlakát' });
    assert.deepEqual(await res.json(), { amounts: [8000, 25000], sources: ['TikTok', 'Plakát'] });
    const html = await (await fetch(`${base}/csaladok/kamilla`)).text();
    assert.match(html, /<option value="25000">25\s000 Ft<\/option>/);
    assert.match(html, /<option value="TikTok">TikTok<\/option>/);
    assert.doesNotMatch(html, /<option value="Facebook">/);
    const f = store.createFamily(db, { name: 'Űrlap Ubul', subtitle: '', status: 'adoptable', amount: 0, applicants: 0, story: '', images: [] });
    const fields = { family_id: String(f.id), source: 'TikTok' };
    assert.equal((await submit(f.slug, valid({ ...fields, amount: '10000' }))).status, 400, 'a régi összeg már nem választható');
    assert.equal((await submit(f.slug, valid({ ...fields, amount: '25000' }))).status, 303);
  });

  test('hibás értékek: 400', async () => {
    assert.equal((await api('PUT', '/api/admin/form-settings', { amounts: 'sok', sources: 'A' })).status, 400);
    assert.equal((await api('PUT', '/api/admin/form-settings', { amounts: '5000', sources: '' })).status, 400);
    assert.equal((await api('PUT', '/api/admin/form-settings', { amounts: '0', sources: 'A' })).status, 400);
  });

  test('az import végpontjai már nincsenek az adminban', async () => {
    assert.equal((await api('GET', '/api/admin/import')).status, 404);
  });
});
