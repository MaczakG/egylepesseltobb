import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { createApp } from '../src/app.js';
import { hashPassword } from '../src/auth.js';
import { loadConfig } from '../src/config.js';
import * as store from '../src/db.js';

const ADMIN = 'admin@pelda.hu';
const PASSWORD = 'nagyontitkos123';
let server;
let base;
let db;

before(async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'elt-users-'));
  const config = { ...loadConfig({ DATA_DIR: dataDir }), sessionSecret: 'teszt-titok' };
  db = store.openDb(config.dbPath);
  store.upsertUser(db, ADMIN, hashPassword(PASSWORD));
  server = createApp({ db, config }).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

const login = async (email, password) => {
  const res = await fetch(`${base}/api/login`, {
    method: 'POST', headers: { 'X-ELT-Request': '1', 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }),
  });
  return { res, cookie: (res.headers.getSetCookie().find((c) => c.startsWith('elt_session=')) || '').split(';')[0] };
};
const call = (cookie, method, url, body) => fetch(base + url, {
  method, headers: { Cookie: cookie, 'X-ELT-Request': '1', ...(body ? { 'Content-Type': 'application/json' } : {}) },
  body: body ? JSON.stringify(body) : undefined,
});

describe('felhasználók és szerepkörök', () => {
  test('az admin munkatársat vesz fel; a munkatárs csak a tartalmat éri el', async () => {
    const { cookie: adminCookie } = await login(ADMIN, PASSWORD);
    const created = await call(adminCookie, 'POST', '/api/admin/users', { email: 'munkatars@pelda.hu', role: 'staff', password: 'munkatars1234' });
    assert.equal(created.status, 201);
    assert.equal((await created.json()).role, 'staff');
    assert.equal((await call(adminCookie, 'POST', '/api/admin/users', { email: 'munkatars@pelda.hu', role: 'staff', password: 'x'.repeat(12) })).status, 400, 'foglalt e-mail');
    assert.equal((await call(adminCookie, 'POST', '/api/admin/users', { email: 'rovid@pelda.hu', role: 'staff', password: 'rovid' })).status, 400);
    assert.equal((await call(adminCookie, 'POST', '/api/admin/users', { email: 'x@pelda.hu', role: 'fonok', password: 'x'.repeat(12) })).status, 400);

    const { res, cookie } = await login('munkatars@pelda.hu', 'munkatars1234');
    assert.deepEqual(await res.json(), { email: 'munkatars@pelda.hu', role: 'staff' });
    for (const url of ['/api/admin/families', '/api/admin/applications', '/api/admin/messages', '/api/admin/posts',
      '/api/admin/products', '/api/admin/orders', '/api/admin/settings']) {
      assert.equal((await call(cookie, 'GET', url)).status, 200, url);
    }
    for (const [method, url] of [['PUT', '/api/admin/settings'], ['GET', '/api/admin/form-settings'], ['GET', '/api/admin/nomination-settings'],
      ['GET', '/api/admin/payment-settings'], ['PUT', '/api/admin/payment-settings'], ['GET', '/api/admin/smtp-settings'],
      ['POST', '/api/admin/smtp-test'], ['GET', '/api/admin/users'], ['POST', '/api/admin/users']]) {
      assert.equal((await call(cookie, method, url, method === 'GET' ? undefined : {})).status, 403, `${method} ${url}`);
    }
    // A saját jelszavát módosíthatja.
    assert.equal((await call(cookie, 'POST', '/api/password', { currentPassword: 'munkatars1234', newPassword: 'ujjelszo12345' })).status, 200);
  });

  test('szerepkörcsere és jelszócsere kijelentkezteti; az utolsó admin nem törölhető és nem fokozható le', async () => {
    const { cookie: adminCookie } = await login(ADMIN, PASSWORD);
    const { users, me } = await (await call(adminCookie, 'GET', '/api/admin/users')).json();
    const staff = users.find((u) => u.email === 'munkatars@pelda.hu');
    const { cookie } = await login('munkatars@pelda.hu', 'ujjelszo12345');
    assert.equal((await call(adminCookie, 'PUT', `/api/admin/users/${staff.id}`, { role: 'admin', password: '' })).status, 200);
    assert.equal((await call(cookie, 'GET', '/api/me')).status, 401, 'a régi munkamenet érvénytelen');
    const { res } = await login('munkatars@pelda.hu', 'ujjelszo12345');
    assert.equal((await res.json()).role, 'admin', 'üres jelszónál a régi marad');

    assert.equal((await call(adminCookie, 'DELETE', `/api/admin/users/${me}`)).status, 400, 'saját magát nem törölheti');
    assert.equal((await call(adminCookie, 'DELETE', `/api/admin/users/${staff.id}`)).status, 200);
    assert.equal((await call(adminCookie, 'PUT', `/api/admin/users/${me}`, { role: 'staff' })).status, 400, 'utolsó admin');
    assert.equal((await call(adminCookie, 'GET', '/api/me')).status, 200);
  });
});
