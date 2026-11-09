import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { createApp } from '../src/app.js';
import { hashPassword } from '../src/auth.js';
import { loadConfig } from '../src/config.js';
import * as store from '../src/db.js';
import { isoWithOffset, sign } from '../src/simplepay.js';
import { paymentCards } from '../src/wpimport.js';

const EMAIL = 'admin@pelda.hu';
const PASSWORD = 'nagyontitkos123';
const MERCHANT = 'PUBLICTESTHUF';
const KEY = 'FxDa5w314kLlNseq2sKuVwaqZshZT5d6';
const LEGACY = 'https://checkout.simplepay.hu/trx/regi-link';

let server;
let base;
let db;
let cookie;
let ip = 0;
const started = []; // a SimplePay-nek elküldött start kérések
let simplePayReply = null;

// A SimplePay start végpontjának utánzata: ellenőrzi az aláírást, és aláírt választ ad.
async function fakeSimplePay(url, init) {
  const body = JSON.parse(init.body);
  started.push({ url, body, signature: init.headers.Signature, validSignature: init.headers.Signature === sign(KEY, init.body) });
  const reply = JSON.stringify(simplePayReply || {
    salt: 'x'.repeat(32), merchant: body.merchant, orderRef: body.orderRef, currency: 'HUF',
    transactionId: 504233881, timeout: body.timeout, total: Number(body.total), paymentUrl: 'https://sandbox.simplepay.hu/pay/pay/pspHU/abc',
  });
  return new Response(reply, { status: 200, headers: { 'Content-Type': 'application/json', Signature: sign(KEY, reply) } });
}

before(async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'elt-pay-'));
  const config = { ...loadConfig({ DATA_DIR: dataDir }), sessionSecret: 'teszt-titok' };
  db = store.openDb(config.dbPath);
  store.upsertUser(db, EMAIL, hashPassword(PASSWORD));
  const content = '<section><p>Bevezető.</p></section><section><div class="cards">'
    + `<div class="card"><h3>Támogatói jegy:</h3><p class="price">10 000 Ft</p><p><a class="button" href="${LEGACY}">Fizetés</a></p></div>`
    + `<div class="card"><h3>Támogatói jegy:</h3><p class="price">20 000 Ft</p><p><a class="button" href="${LEGACY}-2">Fizetés</a></p></div>`
    + '</div></section>';
  store.createPage(db, { slug: 'gala', title: 'Jótékonysági gálaest', content, status: 'published', extras: { form: '', families: false, posts: [] } });
  store.seedPageProducts(db, 'gala', paymentCards(content));
  server = createApp({ db, config, fetchImpl: fakeSimplePay }).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  const res = await fetch(`${base}/api/login`, {
    method: 'POST', headers: { 'X-ELT-Request': '1', 'Content-Type': 'application/json' }, body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  cookie = res.headers.getSetCookie().find((c) => c.startsWith('elt_session=')).split(';')[0];
});

after(() => server.close());

const admin = (method, url, body) => fetch(base + url, {
  method, headers: { Cookie: cookie, 'X-ELT-Request': '1', ...(body ? { 'Content-Type': 'application/json' } : {}) },
  body: body ? JSON.stringify(body) : undefined,
});
const checkout = (id, fields) => fetch(`${base}/fizetes/${id}`, {
  method: 'POST', redirect: 'manual', body: new URLSearchParams(fields).toString(),
  headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Forwarded-For': `10.9.0.${(ip += 1)}` },
});
const VALID = { name: 'Teszt Elek', email: 'elek@pelda.hu', consent: 'on', transfer: 'on' };
const backUrl = (data, key = KEY) => {
  const json = JSON.stringify(data);
  return `${base}/fizetes/vissza?r=${encodeURIComponent(Buffer.from(json).toString('base64'))}&s=${encodeURIComponent(sign(key, json))}`;
};

describe('termékek a régi fizetési linkekből', () => {
  test('a kártyákból termékek lesznek, oldalanként csak egyszer', () => {
    const products = store.listPageProducts(db, 'gala');
    assert.deepEqual(products.map((p) => [p.name, p.price, p.legacyUrl]), [['Támogatói jegy', 10000, LEGACY], ['Támogatói jegy', 20000, `${LEGACY}-2`]]);
    assert.equal(store.seedPageProducts(db, 'gala', [{ name: 'Új', price: 500 }]), 0);
  });

  test('amíg a SimplePay nincs beállítva, a gomb a régi linkre mutat', async () => {
    const html = await (await fetch(`${base}/gala`)).text();
    assert.match(html, new RegExp(`<a class="button" href="${LEGACY}">Fizetés</a>`));
    const [first] = store.listPageProducts(db, 'gala');
    const res = await checkout(first.id, VALID);
    assert.equal(res.status, 503);
    assert.match(await res.text(), /Az online fizetés jelenleg nem érhető el/);
    assert.equal(started.length, 0);
  });
});

describe('admin: termékek és SimplePay beállítás', () => {
  test('bejelentkezés nélkül nem érhető el, a titkos kulcs nem jön vissza', async () => {
    assert.equal((await fetch(`${base}/api/admin/products`)).status, 401);
    assert.equal((await fetch(`${base}/api/admin/payment-settings`)).status, 401);
    const res = await admin('PUT', '/api/admin/payment-settings', { merchant: MERCHANT, secretKey: KEY, sandbox: true });
    const saved = await res.json();
    assert.deepEqual({ ...saved, ipnUrl: undefined }, { merchant: MERCHANT, sandbox: true, hasSecretKey: true, configured: true, ipnUrl: undefined });
    assert.match(saved.ipnUrl, /\/fizetes\/ipn$/);
    assert.doesNotMatch(JSON.stringify(saved), new RegExp(KEY));
    // Üres kulccsal mentve a régi marad.
    const again = await (await admin('PUT', '/api/admin/payment-settings', { merchant: MERCHANT, secretKey: '', sandbox: true })).json();
    assert.equal(again.hasSecretKey, true);
  });

  test('termék felvétele, módosítása, kikapcsolása, törlése; hibás ár: 400', async () => {
    const created = await (await admin('POST', '/api/admin/products', { pageSlug: 'gala', name: 'VIP jegy', price: '50 000', button: 'Megveszem', sort: 3 })).json();
    assert.equal(created.price, 50000);
    let html = await (await fetch(`${base}/gala`)).text();
    assert.match(html, new RegExp(`<h3>VIP jegy:</h3><p class="price">50 000 Ft</p><p><a class="button" href="/fizetes/${created.id}">Megveszem</a>`));
    assert.doesNotMatch(html, /checkout\.simplepay\.hu/, 'beállított SimplePay mellett a régi link már nem jelenik meg');
    await admin('PUT', `/api/admin/products/${created.id}`, { ...created, active: false });
    html = await (await fetch(`${base}/gala`)).text();
    assert.doesNotMatch(html, /VIP jegy/);
    assert.equal((await fetch(`${base}/fizetes/${created.id}`)).status, 404);
    assert.equal((await admin('POST', '/api/admin/products', { pageSlug: 'gala', name: 'X', price: 'sok' })).status, 400);
    assert.equal((await admin('DELETE', `/api/admin/products/${created.id}`)).status, 200);
    const { products, pages } = await (await admin('GET', '/api/admin/products')).json();
    assert.equal(products.length, 2);
    assert.ok(pages.some((pg) => pg.slug === 'gala'));
  });
});

describe('fizetés a SimplePay API-n', () => {
  test('a fizetési oldal az adattovábbítási nyilatkozattal és a SimplePay logóval', async () => {
    const [first] = store.listPageProducts(db, 'gala');
    const html = await (await fetch(`${base}/fizetes/${first.id}`)).text();
    assert.match(html, /<h1[^>]*>Jótékonysági gálaest<\/h1>/);
    assert.match(html, /10 000 Ft/);
    assert.match(html, /átadásra kerülnek a SimplePay Zrt\., mint adatfeldolgozó részére/);
    assert.match(html, /href="https:\/\/simplepartner\.hu\/PaymentService\/Fizetesi_tajekoztato\.pdf"/);
    const res = await checkout(first.id, { ...VALID, transfer: '' });
    assert.equal(res.status, 400);
    assert.match(await res.text(), /el kell fogadnod az adattovábbítási nyilatkozatot/);
    assert.equal(started.length, 0);
  });

  test('indítás: aláírt kérés a sandboxba, rendelés mentve, átirányítás a fizetőoldalra', async () => {
    const [first] = store.listPageProducts(db, 'gala');
    const res = await checkout(first.id, VALID);
    assert.equal(res.status, 303);
    assert.equal(res.headers.get('location'), 'https://sandbox.simplepay.hu/pay/pay/pspHU/abc');
    const [req] = started;
    assert.equal(req.url, 'https://sandbox.simplepay.hu/payment/v2/start');
    assert.ok(req.validSignature);
    assert.equal(req.body.merchant, MERCHANT);
    assert.equal(req.body.total, '10000');
    assert.equal(req.body.customerEmail, 'elek@pelda.hu');
    assert.equal(req.body.currency, 'HUF');
    assert.deepEqual(req.body.methods, ['CARD']);
    assert.equal(req.body.salt.length, 32);
    assert.match(req.body.url, /\/fizetes\/vissza$/);
    assert.equal(req.body.items[0].title, 'Jótékonysági gálaest – Támogatói jegy');
    const [order] = store.listOrders(db);
    assert.equal(order.orderRef, req.body.orderRef);
    assert.equal(order.status, 'started');
    assert.equal(order.transactionId, '504233881');
    assert.equal(order.sandbox, true);
  });

  test('visszairányítás: sikeres fizetésnél a SimplePay tranzakcióazonosító, megszakításnál nem; hamis aláírás: 400', async () => {
    const [order] = store.listOrders(db);
    const back = { r: 0, t: 504233881, e: 'SUCCESS', m: MERCHANT, o: order.orderRef };
    let html = await (await fetch(backUrl(back))).text();
    assert.match(html, /Sikeres tranzakció/);
    assert.match(html, /SimplePay tranzakcióazonosító: <strong>504233881<\/strong>/);
    assert.equal(store.getOrder(db, order.id).status, 'authorized');
    html = await (await fetch(backUrl({ ...back, e: 'CANCEL' }))).text();
    assert.match(html, /Megszakított fizetés/);
    assert.doesNotMatch(html, /tranzakcióazonosító/);
    const forged = await fetch(backUrl({ ...back, e: 'SUCCESS' }, 'rossz-kulcs'));
    assert.equal(forged.status, 400);
  });

  test('IPN: aláírt válasz receiveDate-tel, a rendelés kifizetett lesz, és a visszairányítás ezt nem írja felül', async () => {
    const [order] = store.listOrders(db);
    const ipn = JSON.stringify({
      salt: 'y'.repeat(32), orderRef: order.orderRef, method: 'CARD', merchant: MERCHANT,
      finishDate: isoWithOffset(), paymentDate: isoWithOffset(), transactionId: 504233881, status: 'FINISHED',
    });
    const res = await fetch(`${base}/fizetes/ipn`, { method: 'POST', body: ipn, headers: { 'Content-Type': 'application/json', Signature: sign(KEY, ipn) } });
    assert.equal(res.status, 200);
    const replyText = await res.text();
    const reply = JSON.parse(replyText);
    assert.equal(reply.orderRef, order.orderRef);
    assert.equal(reply.status, 'FINISHED');
    assert.match(reply.receiveDate, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
    assert.equal(res.headers.get('signature'), sign(KEY, replyText));
    const paid = store.getOrder(db, order.id);
    assert.equal(paid.status, 'paid');
    assert.ok(paid.paidAt);
    await fetch(backUrl({ r: 0, t: 504233881, e: 'CANCEL', m: MERCHANT, o: order.orderRef }));
    assert.equal(store.getOrder(db, order.id).status, 'paid');

    const bad = await fetch(`${base}/fizetes/ipn`, { method: 'POST', body: ipn, headers: { 'Content-Type': 'application/json', Signature: 'hamis' } });
    assert.equal(bad.status, 400);
  });

  test('ha a SimplePay hibát jelez, a rendelés hibás lesz, a támogató hibaüzenetet kap', async () => {
    const [, second] = store.listPageProducts(db, 'gala');
    simplePayReply = { errorCodes: [5321] };
    const res = await checkout(second.id, VALID);
    simplePayReply = null;
    assert.equal(res.status, 502);
    assert.match(await res.text(), /A fizetést most nem sikerült elindítani/);
    const failed = store.listOrders(db).find((o) => o.productId === second.id);
    assert.equal(failed.status, 'error');
    assert.match(failed.error, /5321/);
    const orders = await (await admin('GET', '/api/admin/orders')).json();
    assert.equal(orders.length, 2);
  });
});
