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
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const PDF = Buffer.from('%PDF-1.4\n%%EOF\n');

let server;
let base;
let db;
let config;
let cookie;
let ip = 0;

before(async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'elt-msg-'));
  config = { ...loadConfig({ DATA_DIR: dataDir }), sessionSecret: 'teszt-titok' };
  db = store.openDb(config.dbPath);
  store.upsertUser(db, EMAIL, hashPassword(PASSWORD));
  const page = (slug, form) => store.createPage(db, {
    slug, title: slug, content: '<section><p>Szöveg.</p></section>', status: 'published', extras: { form, families: false, posts: [] },
  });
  page('kapcsolat-urlap', 'contact');
  page('programba', 'program');
  page('jeloles', 'nomination');
  page('sima', '');
  server = createApp({ db, config }).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  const res = await fetch(`${base}/api/login`, {
    method: 'POST', headers: { 'X-ELT-Request': '1', 'Content-Type': 'application/json' }, body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  cookie = res.headers.getSetCookie().find((c) => c.startsWith('elt_session=')).split(';')[0];
});

after(() => server.close());

const post = (slug, body, headers = {}) => fetch(`${base}/${slug}/urlap`, {
  method: 'POST', redirect: 'manual', body,
  headers: { 'X-Forwarded-For': `10.2.0.${(ip += 1)}`, ...headers },
});
const form = (fields) => new URLSearchParams(fields).toString();
const urlencoded = { 'Content-Type': 'application/x-www-form-urlencoded' };
const admin = (method, url, body) => fetch(base + url, {
  method, headers: { Cookie: cookie, 'X-ELT-Request': '1', ...(body ? { 'Content-Type': 'application/json' } : {}) },
  body: body ? JSON.stringify(body) : undefined,
});
const REASON = 'Évek óta önzetlenül segíti a beteg gyermekeket nevelő családokat. '.repeat(4);

describe('űrlapok az oldalakon', () => {
  test('a régi oldal mezői: kapcsolat, programjelentkezés fájlfeltöltéssel, díjjelölés kategóriákkal', async () => {
    const contact = await (await fetch(`${base}/kapcsolat-urlap`)).text();
    assert.match(contact, /<form method="post" action="\/kapcsolat-urlap\/urlap" class/);
    for (const n of ['name', 'email', 'message', 'consent', 'website']) assert.match(contact, new RegExp(`name="${n}"`));
    const program = await (await fetch(`${base}/programba`)).text();
    assert.match(program, /enctype="multipart\/form-data"/);
    assert.match(program, /Rövid történet a gyermek betegségéről, fejlesztésekről, célokról/);
    assert.match(program, /<input id="msg-documents" name="documents" type="file" multiple/);
    const nomination = await (await fetch(`${base}/jeloles`)).text();
    assert.match(nomination, />Jelölő adatai<\/h3>/);
    assert.match(nomination, /<option value="Az Év Gyermekorvosa">/);
    assert.match(nomination, /<option value="Kovács-Dobos Evelin">/);
    assert.doesNotMatch(await (await fetch(`${base}/sima`)).text(), /<form method="post"/);
  });

  test('kapcsolati üzenet: mentés, köszönő üzenet', async () => {
    const res = await post('kapcsolat-urlap', form({ name: 'Kiss Anna', email: 'anna@pelda.hu', message: 'Szia!', consent: 'on' }), urlencoded);
    assert.equal(res.status, 303);
    assert.equal(res.headers.get('location'), '/kapcsolat-urlap?jelentkezes=koszonjuk#jelentkezes');
    const [m] = store.listMessages(db);
    assert.equal(m.form, 'contact');
    assert.deepEqual(m.data, { name: 'Kiss Anna', email: 'anna@pelda.hu', message: 'Szia!' });
    assert.match(await (await fetch(`${base}/kapcsolat-urlap?jelentkezes=koszonjuk`)).text(), /Köszönjük, megkaptuk!/);
  });

  test('díjjelölés: az indoklás legalább 200 karakter, a kategória a listából', async () => {
    const fields = { name: 'Jelölő', email: 'j@pelda.hu', nominee: 'Dr. Példa', category: 'Az Év Gyermekorvosa', reason: 'Rövid.', consent: 'on' };
    let res = await post('jeloles', form(fields), urlencoded);
    assert.equal(res.status, 400);
    const html = await res.text();
    assert.match(html, /Legalább 200 karakter kell \(most 6\)/);
    assert.match(html, /value="Dr\. Példa"/);
    res = await post('jeloles', form({ ...fields, reason: REASON, category: 'Kitalált' }), urlencoded);
    assert.equal(res.status, 400);
    res = await post('jeloles', form({ ...fields, reason: REASON, ambassador: 'Győrfi Pál' }), urlencoded);
    assert.equal(res.status, 303);
    assert.equal(store.listMessages(db)[0].data.ambassador, 'Győrfi Pál');
  });

  test('programjelentkezés: PDF és kép feltöltése a nem nyilvános mappába', async () => {
    const fd = new FormData();
    for (const [k, v] of Object.entries({ name: 'Szülő Éva', email: 'eva@pelda.hu', phone: '+36 30 111 2222', story: 'A történetünk.', consent: 'on' })) fd.append(k, v);
    fd.append('documents', new Blob([PDF], { type: 'application/pdf' }), 'zárójelentés.pdf');
    fd.append('documents', new Blob([PNG], { type: 'image/png' }), 'lelet.png');
    const res = await post('programba', fd);
    assert.equal(res.status, 303);
    const m = store.listMessages(db)[0];
    assert.equal(m.form, 'program');
    assert.deepEqual(m.files.map((f) => [f.name, f.stored, f.type]), [['zárójelentés.pdf', '1.pdf', 'pdf'], ['lelet.png', '2.png', 'png']]);
    const dir = path.join(config.privateDir, 'messages', String(m.id));
    assert.deepEqual(fs.readdirSync(dir).sort(), ['1.pdf', '2.png']);
    assert.equal(fs.statSync(path.join(dir, '1.pdf')).mode & 0o777, 0o600);
    assert.ok(!fs.existsSync(path.join(config.uploadsDir, '1.pdf')), 'nem a nyilvános feltöltések közé kerül');
  });

  test('programjelentkezés: más fájltípus és hibás adat esetén nem ment', async () => {
    const count = store.listMessages(db).length;
    const fd = new FormData();
    for (const [k, v] of Object.entries({ name: 'X', email: 'x@pelda.hu', phone: '+36 30 111 2222', story: 'T', consent: 'on' })) fd.append(k, v);
    fd.append('documents', new Blob(['<script>alert(1)</script>'], { type: 'text/html' }), 'rossz.html');
    const res = await post('programba', fd);
    assert.equal(res.status, 400);
    assert.match(await res.text(), /Csak PDF vagy kép/);
    assert.equal(store.listMessages(db).length, count);
    const noConsent = await post('kapcsolat-urlap', form({ name: 'A', email: 'a@pelda.hu' }), urlencoded);
    assert.equal(noConsent.status, 400);
    assert.match(await noConsent.text(), /el kell fogadnod az adatkezelési tájékoztatót/);
  });

  test('rejtett mező, IP-korlát, űrlap nélküli oldal', async () => {
    const count = store.listMessages(db).length;
    assert.equal((await post('kapcsolat-urlap', form({ name: 'Bot', email: 'b@pelda.hu', consent: 'on', website: 'x' }), urlencoded)).status, 303);
    assert.equal(store.listMessages(db).length, count);
    const fields = form({ name: 'Sok', email: 's@pelda.hu', consent: 'on' });
    for (let i = 0; i < 5; i += 1) assert.equal((await post('kapcsolat-urlap', fields, { ...urlencoded, 'X-Forwarded-For': '10.3.3.3' })).status, 303);
    assert.equal((await post('kapcsolat-urlap', fields, { ...urlencoded, 'X-Forwarded-For': '10.3.3.3' })).status, 429);
    assert.equal((await post('sima', fields, urlencoded)).status, 404);
  });
});

describe('admin: a díjjelölés legördülő listái', () => {
  test('alapértékek, mentés, és az űrlapon és az ellenőrzésben azonnal érvényesek', async () => {
    assert.equal((await fetch(`${base}/api/admin/nomination-settings`)).status, 401);
    const defaults = await (await admin('GET', '/api/admin/nomination-settings')).json();
    assert.deepEqual(defaults, store.DEFAULT_NOMINATION_SETTINGS);
    assert.equal(defaults.categories.length, 15);

    const saved = await (await admin('PUT', '/api/admin/nomination-settings', {
      categories: 'Az Év Önkéntese\n\n  Az Év Mentora  \nAz Év Önkéntese', ambassadors: 'Új Nagykövet',
    })).json();
    assert.deepEqual(saved, { categories: ['Az Év Önkéntese', 'Az Év Mentora'], ambassadors: ['Új Nagykövet'] });
    const html = await (await fetch(`${base}/jeloles`)).text();
    assert.match(html, /<option value="Az Év Mentora">Az Év Mentora<\/option>/);
    assert.match(html, /<option value="Új Nagykövet">Új Nagykövet<\/option>/);
    assert.doesNotMatch(html, /Az Év Gyermekorvosa|Győrfi Pál/);

    const fields = { name: 'Jelölő', email: 'j@pelda.hu', nominee: 'Dr. Példa', reason: REASON, consent: 'on' };
    assert.equal((await post('jeloles', form({ ...fields, category: 'Az Év Gyermekorvosa' }), urlencoded)).status, 400, 'a törölt kategória már nem választható');
    assert.equal((await post('jeloles', form({ ...fields, category: 'Az Év Mentora', ambassador: 'Győrfi Pál' }), urlencoded)).status, 400);
    assert.equal((await post('jeloles', form({ ...fields, category: 'Az Év Mentora', ambassador: 'Új Nagykövet' }), urlencoded)).status, 303);
    assert.equal(store.listMessages(db)[0].data.category, 'Az Év Mentora');

    // Üres nagykövetlista: a mező eltűnik az űrlapról.
    await admin('PUT', '/api/admin/nomination-settings', { categories: 'Az Év Mentora', ambassadors: '' });
    assert.doesNotMatch(await (await fetch(`${base}/jeloles`)).text(), /name="ambassador"/);
    assert.equal((await post('jeloles', form({ ...fields, category: 'Az Év Mentora' }), urlencoded)).status, 303);

    await admin('PUT', '/api/admin/nomination-settings', store.DEFAULT_NOMINATION_SETTINGS);
  });

  test('hibás értékek: 400', async () => {
    assert.equal((await admin('PUT', '/api/admin/nomination-settings', { categories: '', ambassadors: 'A' })).status, 400);
    assert.equal((await admin('PUT', '/api/admin/nomination-settings', { categories: 'x'.repeat(101), ambassadors: '' })).status, 400);
  });
});

describe('admin: üzenetek', () => {
  test('lista a mezők címkéivel, dokumentum letöltése csak bejelentkezve, állapot, törlés a fájlokkal együtt', async () => {
    assert.equal((await fetch(`${base}/api/admin/messages`)).status, 401);
    const { forms, messages } = await (await admin('GET', '/api/admin/messages')).json();
    assert.deepEqual(forms.program.fields.map((f) => f.label), ['Név', 'E-mail', 'Telefonszám', 'Rövid történet a gyermek betegségéről, fejlesztésekről, célokról']);
    const prog = messages.find((m) => m.form === 'program');

    assert.equal((await fetch(`${base}/api/admin/messages/${prog.id}/files/0`)).status, 401);
    const file = await admin('GET', `/api/admin/messages/${prog.id}/files/0`);
    assert.equal(file.status, 200);
    assert.equal(file.headers.get('content-disposition'), "attachment; filename=\"zarojelentes.pdf\"; filename*=UTF-8''z%C3%A1r%C3%B3jelent%C3%A9s.pdf");
    assert.equal(file.headers.get('content-type'), 'application/pdf');
    assert.equal(file.headers.get('cache-control'), 'private, no-store');
    assert.deepEqual(Buffer.from(await file.arrayBuffer()), PDF);
    assert.equal((await admin('GET', `/api/admin/messages/${prog.id}/files/9`)).status, 404);

    const upd = await admin('PUT', `/api/admin/messages/${prog.id}`, { status: 'handled' });
    assert.equal((await upd.json()).status, 'handled');
    assert.equal((await admin('PUT', `/api/admin/messages/${prog.id}`, { status: 'x' })).status, 400);

    assert.equal((await admin('DELETE', `/api/admin/messages/${prog.id}`)).status, 200);
    assert.ok(!fs.existsSync(path.join(config.privateDir, 'messages', String(prog.id))));
    assert.equal((await admin('DELETE', `/api/admin/messages/${prog.id}`)).status, 404);
  });
});
