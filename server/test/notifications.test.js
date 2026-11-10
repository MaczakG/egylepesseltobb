import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, beforeEach, describe, test } from 'node:test';
import { createApp } from '../src/app.js';
import { hashPassword } from '../src/auth.js';
import { loadConfig } from '../src/config.js';
import * as store from '../src/db.js';
import { createMailer } from '../src/mailer.js';
import { isoWithOffset, sign } from '../src/simplepay.js';

const EMAIL = 'admin@pelda.hu';
const PASSWORD = 'nagyontitkos123';
const KEY = 'FxDa5w314kLlNseq2sKuVwaqZshZT5d6';

let server;
let base;
let db;
let cookie;
let ip = 0;
let family;
const sent = []; // az elküldött levelek
const transports = []; // a létrehozott SMTP-kapcsolatok beállításai
let failWith = null;

const fakeTransport = (opts) => {
  transports.push(opts);
  return {
    sendMail: async (mail) => {
      if (failWith) throw new Error(failWith);
      sent.push(mail);
      return { messageId: 'x' };
    },
  };
};

// A háttérben futó küldés befejeződésére várunk.
const settle = () => new Promise((resolve) => setTimeout(resolve, 30));

before(async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'elt-mail-'));
  const config = { ...loadConfig({ DATA_DIR: dataDir }), sessionSecret: 'teszt-titok' };
  db = store.openDb(config.dbPath);
  store.upsertUser(db, EMAIL, hashPassword(PASSWORD));
  store.createPage(db, {
    slug: 'kapcsolat-urlap', title: 'Kapcsolat', content: '<section><p>Szöveg.</p></section>', status: 'published',
    extras: { form: 'contact', families: false, posts: [] },
  });
  family = store.createFamily(db, { name: 'Levél Lili', subtitle: '', status: 'adoptable', amount: 0, applicants: 0, story: '', images: [] });
  store.savePaymentSettings(db, { merchant: 'PUBLICTESTHUF', secretKey: KEY, sandbox: true });
  const mailer = createMailer(db, { transportFactory: fakeTransport });
  server = createApp({ db, config, mailer }).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  const res = await fetch(`${base}/api/login`, {
    method: 'POST', headers: { 'X-ELT-Request': '1', 'Content-Type': 'application/json' }, body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  cookie = res.headers.getSetCookie().find((c) => c.startsWith('elt_session=')).split(';')[0];
});

after(() => server.close());

beforeEach(() => {
  sent.length = 0;
  failWith = null;
});

const admin = (method, url, body) => fetch(base + url, {
  method, headers: { Cookie: cookie, 'X-ELT-Request': '1', ...(body ? { 'Content-Type': 'application/json' } : {}) },
  body: body ? JSON.stringify(body) : undefined,
});
const postForm = (url, fields) => fetch(base + url, {
  method: 'POST', redirect: 'manual', body: new URLSearchParams(fields).toString(),
  headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Forwarded-For': `10.7.0.${(ip += 1)}` },
});
const SMTP = {
  host: 'smtp.gmail.com', port: 587, user: 'info@egylepesseltobb.hu', pass: 'abcd efgh ijkl mnop',
  from: 'Egy Lépéssel Több <info@egylepesseltobb.hu>', to: 'info@egylepesseltobb.hu\nkuratorium@pelda.hu', enabled: true,
};

describe('SMTP beállítás', () => {
  test('beállítás nélkül nem megy levél, a beküldés ettől még sikeres', async () => {
    const res = await postForm('/kapcsolat-urlap/urlap', { name: 'Nincs Levél', email: 'n@pelda.hu', message: 'Szia', consent: 'on' });
    assert.equal(res.status, 303);
    await settle();
    assert.equal(sent.length, 0);
  });

  test('mentés: a jelszó sosem jön vissza, üresen hagyva megmarad', async () => {
    let res = await admin('PUT', '/api/admin/smtp-settings', SMTP);
    assert.equal(res.status, 200);
    let s = await res.json();
    assert.equal(s.pass, undefined);
    assert.equal(s.hasPassword, true);
    assert.equal(s.configured, true);
    assert.deepEqual(s.to, ['info@egylepesseltobb.hu', 'kuratorium@pelda.hu']);
    assert.equal(store.getSmtpSettings(db).pass, 'abcdefghijklmnop', 'az alkalmazásjelszó szóközei kimaradnak');

    res = await admin('PUT', '/api/admin/smtp-settings', { ...SMTP, pass: '' });
    s = await res.json();
    assert.equal(s.hasPassword, true);
    assert.equal(store.getSmtpSettings(db).pass, 'abcdefghijklmnop');
    assert.doesNotMatch(JSON.stringify(await (await admin('GET', '/api/admin/smtp-settings')).json()), /abcdefgh/);
  });

  test('hibás adatok', async () => {
    for (const bad of [{ host: 'nem jó' }, { to: 'nem-email' }, { from: 'x@y.hu\r\nBcc: z@w.hu' }, { port: '99999' }]) {
      const res = await admin('PUT', '/api/admin/smtp-settings', { ...SMTP, ...bad });
      assert.equal(res.status, 400, JSON.stringify(bad));
    }
  });

  test('tesztlevél: siker, illetve a hiba szövege visszajön', async () => {
    let res = await admin('POST', '/api/admin/smtp-test');
    assert.equal(res.status, 200);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].to, 'info@egylepesseltobb.hu, kuratorium@pelda.hu');
    assert.equal(sent[0].from, SMTP.from);
    assert.match(sent[0].subject, /Tesztlevél/);
    const t = transports.at(-1);
    assert.deepEqual([t.host, t.port, t.secure, t.requireTLS, t.auth.user], ['smtp.gmail.com', 587, false, true, 'info@egylepesseltobb.hu']);

    failWith = 'Invalid login: 535 Username and Password not accepted';
    res = await admin('POST', '/api/admin/smtp-test');
    assert.equal(res.status, 502);
    assert.match((await res.json()).error, /535/);
    assert.match((await (await admin('GET', '/api/admin/smtp-settings')).json()).status.lastError, /535/);
  });

  test('csak bejelentkezve', async () => {
    assert.equal((await fetch(`${base}/api/admin/smtp-settings`)).status, 401);
  });
});

describe('értesítések a látogatók beküldéseiről', () => {
  test('kapcsolati űrlap: minden kitöltött mező, válaszcím a beküldő', async () => {
    const res = await postForm('/kapcsolat-urlap/urlap', {
      name: 'Kiss <b>Béla</b>', email: 'bela@pelda.hu', message: 'Szeretnék segíteni.', consent: 'on',
    });
    assert.equal(res.status, 303);
    await settle();
    assert.equal(sent.length, 1);
    const mail = sent[0];
    assert.match(mail.subject, /Új üzenet \(Kapcsolat\): Kiss <b>Béla<\/b>/);
    assert.equal(mail.replyTo, 'bela@pelda.hu');
    assert.match(mail.text, /Üzenet: Szeretnék segíteni\./);
    assert.match(mail.text, /\/admin\.html/);
    assert.equal(mail.html, undefined, 'csak szöveges levél');
  });

  test('támogatói jelentkezés', async () => {
    const res = await postForm(`/csaladok/${family.slug}/jelentkezes`, {
      last_name: 'Nagy', first_name: 'Anna', email: 'anna@pelda.hu', phone: '+36 30 123 4567',
      amount: '10000', family_id: String(family.id), source: 'Facebookról', note: 'Szívesen.', consent: 'on',
    });
    assert.equal(res.status, 303);
    await settle();
    assert.equal(sent.length, 1);
    assert.match(sent[0].subject, /Új támogatói jelentkezés: Levél Lili/);
    assert.match(sent[0].text, /Név: Nagy Anna/);
    assert.match(sent[0].text, /Havi összeg: 10\s000 Ft/);
    assert.match(sent[0].text, /Megjegyzés: Szívesen\./);
  });

  test('a rejtett mezőt kitöltő robotról nem megy levél', async () => {
    await postForm('/kapcsolat-urlap/urlap', { name: 'Robot', email: 'r@pelda.hu', message: 'x', consent: 'on', website: 'spam' });
    await settle();
    assert.equal(sent.length, 0);
  });

  test('SMTP-hiba esetén is sikeres a beküldés, a hiba a beállításoknál látszik', async () => {
    failWith = 'connect ETIMEDOUT';
    const res = await postForm('/kapcsolat-urlap/urlap', { name: 'Hiba Hugó', email: 'h@pelda.hu', message: 'x', consent: 'on' });
    assert.equal(res.status, 303);
    await settle();
    assert.match(store.getSmtpStatus(db).lastError, /ETIMEDOUT/);
  });

  test('kikapcsolt értesítéseknél nem megy levél', async () => {
    await admin('PUT', '/api/admin/smtp-settings', { ...SMTP, pass: '', enabled: false });
    await postForm('/kapcsolat-urlap/urlap', { name: 'Csend', email: 'c@pelda.hu', message: 'x', consent: 'on' });
    await settle();
    assert.equal(sent.length, 0);
    await admin('PUT', '/api/admin/smtp-settings', { ...SMTP, pass: '' });
  });

  test('sikeres fizetés (IPN): egy levél, az ismételt IPN-ről nem megy újabb', async () => {
    const order = store.createOrder(db, {
      orderRef: 'ELT-TESZT-1', productId: null, productName: 'Gálaest – Támogatói jegy', pageSlug: 'gala', amount: 20000,
      name: 'Fizető Feri', email: 'feri@pelda.hu', sandbox: true,
    });
    const ipn = async () => {
      const body = JSON.stringify({
        salt: 'x'.repeat(32), orderRef: order.orderRef, method: 'CARD', merchant: 'PUBLICTESTHUF',
        finishDate: isoWithOffset(), paymentDate: isoWithOffset(), transactionId: 504233881, status: 'FINISHED',
      });
      const res = await fetch(`${base}/fizetes/ipn`, { method: 'POST', body, headers: { 'Content-Type': 'application/json', Signature: sign(KEY, body) } });
      assert.equal(res.status, 200);
      await settle();
    };
    await ipn();
    await ipn();
    assert.equal(sent.length, 1);
    assert.match(sent[0].subject, /Sikeres fizetés: 20\s000 Ft – Fizető Feri/);
    assert.match(sent[0].text, /teszt módban/);
    assert.match(sent[0].text, /SimplePay tranzakció: 504233881/);
  });
});
