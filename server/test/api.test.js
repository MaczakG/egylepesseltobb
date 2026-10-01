import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { createApp } from '../src/app.js';
import { hashPassword, verifyPassword } from '../src/auth.js';
import { loadConfig } from '../src/config.js';
import { openDb, seed, upsertUser } from '../src/db.js';
import { excerpt, injectFamilies, renderFamilyCards } from '../src/render.js';

const EMAIL = 'admin@pelda.hu';
const PASSWORD = 'nagyontitkos123';
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

let server;
let base;
let config;

before(async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'elt-test-'));
  config = { ...loadConfig({ DATA_DIR: dataDir }), sessionSecret: 'teszt-titok' };
  const db = openDb(config.dbPath);
  seed(db);
  upsertUser(db, EMAIL, hashPassword(PASSWORD));
  server = createApp({ db, config }).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

function request(method, url, { body, cookie, headers = {}, csrf = true } = {}) {
  const h = { ...headers };
  if (csrf) h['X-ELT-Request'] = '1';
  if (cookie) h.Cookie = cookie;
  let payload = body;
  if (body !== undefined && !Buffer.isBuffer(body)) {
    h['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  return fetch(base + url, { method, headers: h, body: payload });
}

function sessionCookie(res) {
  const cookie = res.headers.getSetCookie().find((c) => c.startsWith('elt_session='));
  return cookie && cookie.split(';')[0];
}

async function login(password = PASSWORD) {
  const res = await request('POST', '/api/login', { body: { email: EMAIL, password } });
  return { res, cookie: sessionCookie(res) };
}

async function upload(cookie, bytes = PNG, type = 'image/png') {
  return request('POST', '/api/admin/uploads', { body: bytes, cookie, headers: { 'Content-Type': type, 'X-Filename': 'k%C3%A9p.png' } });
}

const family = (overrides = {}) => ({
  name: 'Teszt család', subtitle: 'Budapest · 2 gyermek', status: 'adoptable',
  amount: 40000, applicants: 0, story: '<p>Történet</p>', images: [], ...overrides,
});

describe('főoldal', () => {
  test('a szerver az adatbázis családjait rendereli a statikus kártyák helyére', async () => {
    const html = await (await fetch(`${base}/`)).text();
    assert.equal(html.match(/Segíteni szeretnék/g).length, 3);
    assert.ok(!html.includes('Segítek Noelnek'), 'a statikus tartalék kártyák eltűnnek');
    assert.ok(html.indexOf('>Noel<') < html.indexOf('>F. Noel<'));
    assert.ok(html.includes('src="/assets/img/story-kamilla.webp"'));
  });

  test('a forráskód és az adatkönyvtár nem érhető el', async () => {
    for (const url of ['/server/src/app.js', '/server/package.json', '/deploy/aws/deploy.sh', '/.git/config']) {
      assert.equal((await fetch(base + url)).status, 404, url);
    }
  });
});

describe('render', () => {
  test('excerpt: címkék nélkül, szóhatáron vág', () => {
    assert.equal(excerpt('<p>Egy &amp; <b>kettő</b></p>'), 'Egy & kettő');
    assert.equal(excerpt('alma körte szilva', 12), 'alma körte…');
  });

  test('üres lista esetén üzenet, jelölők nélkül változatlan HTML', () => {
    assert.match(renderFamilyCards([]), /megtalálta a támogatóját/);
    assert.equal(injectFamilies('<p>nincs jelölő</p>', 'x'), '<p>nincs jelölő</p>');
  });
});

describe('hitelesítés', () => {
  test('admin végpontok bejelentkezés nélkül 401-et adnak', async () => {
    assert.equal((await request('GET', '/api/admin/families')).status, 401);
    assert.equal((await request('POST', '/api/admin/families', { body: family() })).status, 401);
  });

  test('X-ELT-Request fejléc nélkül a módosító kérés tiltott', async () => {
    const res = await request('POST', '/api/login', { body: { email: EMAIL, password: PASSWORD }, csrf: false });
    assert.equal(res.status, 403);
  });

  test('hibás jelszó 401, helyes jelszó HttpOnly sütit ad', async () => {
    assert.equal((await login('rossz-jelszo-123')).res.status, 401);
    const { res, cookie } = await login();
    assert.equal(res.status, 200);
    assert.match(res.headers.get('set-cookie'), /HttpOnly/i);
    assert.match(res.headers.get('set-cookie'), /SameSite=Strict/i);
    const me = await request('GET', '/api/me', { cookie });
    assert.deepEqual(await me.json(), { email: EMAIL });
  });

  test('a Python (deploy.sh) által készített scrypt hash elfogadott', (t) => {
    let hash;
    try {
      hash = execFileSync('python3', ['-c', [
        'import base64,hashlib,os',
        's=os.urandom(16)',
        "h=hashlib.scrypt(b'jelszo-pythonbol', salt=s, n=16384, r=8, p=1, dklen=64)",
        "print('scrypt$16384$8$1$%s$%s' % (base64.b64encode(s).decode(), base64.b64encode(h).decode()))",
      ].join('\n')], { encoding: 'utf8' }).trim();
    } catch {
      t.skip('nincs python3');
      return;
    }
    assert.ok(verifyPassword('jelszo-pythonbol', hash));
    assert.ok(!verifyPassword('mas-jelszo', hash));
  });
});

describe('családok', () => {
  test('létrehozás: a történet HTML-je megtisztítva, a főoldalon megjelenik', async () => {
    const { cookie } = await login();
    const res = await request('POST', '/api/admin/families', {
      cookie,
      body: family({
        name: 'Biztonsági család',
        story: '<p onclick="x()">Szia<script>alert(1)</script><img src=x onerror="alert(1)"><a href="javascript:alert(1)">link</a><a href="https://pelda.hu">jó</a></p>',
      }),
    });
    assert.equal(res.status, 201);
    const created = await res.json();
    for (const bad of ['<script', 'alert', 'onclick', 'onerror', '<img', 'javascript:']) {
      assert.ok(!created.story.includes(bad), `${bad} kiszűrve`);
    }
    assert.ok(created.story.includes('<a href="https://pelda.hu" rel="noopener noreferrer" target="_blank">jó</a>'));
    assert.ok((await (await fetch(`${base}/`)).text()).includes('Biztonsági család'));
  });

  test('örökbefogadott család nem jelenik meg a főoldalon, a nyilvános API nem ad ki belső adatot', async () => {
    const { cookie } = await login();
    await request('POST', '/api/admin/families', { cookie, body: family({ name: 'Örökbefogadott teszt', status: 'adopted' }) });
    assert.ok(!(await (await fetch(`${base}/`)).text()).includes('Örökbefogadott teszt'));
    const list = await (await fetch(`${base}/api/families`)).json();
    assert.ok(list.some((f) => f.name === 'Örökbefogadott teszt'));
    assert.ok(list.every((f) => !('amount' in f) && !('applicants' in f)));
  });

  test('érvénytelen adatok 400-at adnak', async () => {
    const { cookie } = await login();
    for (const body of [
      family({ name: '  ' }),
      family({ status: 'mas' }),
      family({ amount: -5 }),
      family({ images: [{ url: 'javascript:alert(1)' }] }),
      family({ images: [{ url: '/uploads/../../etc/passwd' }] }),
    ]) {
      const res = await request('POST', '/api/admin/families', { cookie, body });
      assert.equal(res.status, 400, JSON.stringify(body));
      assert.ok((await res.json()).error);
    }
  });

  test('nem létező család módosítása és törlése 404', async () => {
    const { cookie } = await login();
    assert.equal((await request('PUT', '/api/admin/families/9999', { cookie, body: family() })).status, 404);
    assert.equal((await request('DELETE', '/api/admin/families/9999', { cookie })).status, 404);
  });
});

describe('képfeltöltés', () => {
  test('valódi kép feltölthető és kiszolgálható, álcázott fájl nem', async () => {
    const { cookie } = await login();
    const res = await upload(cookie);
    assert.equal(res.status, 201);
    const img = await res.json();
    assert.match(img.url, /^\/uploads\/[0-9a-f]{24}\.png$/);
    assert.equal(img.label, 'kép.png');
    const served = await fetch(base + img.url);
    assert.equal(served.status, 200);
    assert.equal(served.headers.get('x-content-type-options'), 'nosniff');

    const fake = await upload(cookie, Buffer.from('<html><script>alert(1)</script></html>'));
    assert.equal(fake.status, 400);
    assert.equal((await upload(cookie, PNG, 'text/html')).status, 400);
  });

  test('a családból eltávolított és a törölt család képei törlődnek', async () => {
    const { cookie } = await login();
    const a = await (await upload(cookie)).json();
    const b = await (await upload(cookie)).json();
    const fileOf = (img) => path.join(config.uploadsDir, path.basename(img.url));

    const created = await (await request('POST', '/api/admin/families', {
      cookie, body: family({ images: [{ ...a, isCover: false }, { ...b, isCover: false }] }),
    })).json();
    assert.deepEqual(created.images.map((im) => im.isCover), [true, false], 'borítókép hiányában az első lesz az');

    await request('PUT', `/api/admin/families/${created.id}`, { cookie, body: family({ images: [b] }) });
    assert.ok(!fs.existsSync(fileOf(a)));
    assert.ok(fs.existsSync(fileOf(b)));

    await request('DELETE', `/api/admin/families/${created.id}`, { cookie });
    assert.ok(!fs.existsSync(fileOf(b)));
  });
});

describe('beállítások', () => {
  test('mentéskor a szabály az összes családra lefut', async () => {
    const { cookie } = await login();
    const created = await (await request('POST', '/api/admin/families', {
      cookie, body: family({ name: 'Küszöb teszt', applicants: 3 }),
    })).json();
    const res = await request('PUT', '/api/admin/settings', {
      cookie, body: { threshold: 3, autoStatus: 'adopted', autoEnabled: true },
    });
    assert.deepEqual(await res.json(), { threshold: 3, autoStatus: 'adopted', autoEnabled: true });
    const list = await (await request('GET', '/api/admin/families', { cookie })).json();
    assert.equal(list.find((f) => f.id === created.id).status, 'adopted');
    assert.equal((await request('PUT', '/api/admin/settings', { cookie, body: { threshold: 0, autoStatus: 'adopted' } })).status, 400);
    await request('PUT', '/api/admin/settings', { cookie, body: { threshold: 6, autoStatus: 'adopted', autoEnabled: true } });
  });
});

describe('jelszócsere és korlátozás', () => {
  test('jelszócsere után a régi süti érvénytelen', async () => {
    const { cookie } = await login();
    const wrong = await request('POST', '/api/password', { cookie, body: { currentPassword: 'rossz', newPassword: 'ujjelszo12345' } });
    assert.equal(wrong.status, 400);
    const short = await request('POST', '/api/password', { cookie, body: { currentPassword: PASSWORD, newPassword: 'rovid' } });
    assert.equal(short.status, 400);

    const ok = await request('POST', '/api/password', { cookie, body: { currentPassword: PASSWORD, newPassword: 'ujjelszo12345' } });
    assert.equal(ok.status, 200);
    const fresh = sessionCookie(ok);
    assert.equal((await request('GET', '/api/me', { cookie })).status, 401);
    assert.equal((await request('GET', '/api/me', { cookie: fresh })).status, 200);

    await request('POST', '/api/password', { cookie: fresh, body: { currentPassword: 'ujjelszo12345', newPassword: PASSWORD } });
  });

  test('10 sikertelen bejelentkezés után 429', async () => {
    for (let i = 0; i < 10; i += 1) await login('rossz-jelszo-123');
    assert.equal((await login()).res.status, 429);
  });
});
