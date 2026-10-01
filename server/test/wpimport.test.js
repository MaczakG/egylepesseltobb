import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { before, describe, test } from 'node:test';
import sharp from 'sharp';
import { loadConfig } from '../src/config.js';
import * as store from '../src/db.js';
import { loadImportData, runImport } from '../src/wpimport.js';

const data = loadImportData();
let jpeg;
const BROKEN = data.posts.find((p) => p.category === 'orokbefogadott-csaladok').featuredImage.url;

before(async () => {
  jpeg = await sharp({ create: { width: 2400, height: 1600, channels: 3, background: '#c3ac7e' } }).jpeg().toBuffer();
});

function setup() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'elt-wp-'));
  const config = loadConfig({ DATA_DIR: dataDir });
  const db = store.openDb(config.dbPath);
  store.seed(db);
  const fetched = [];
  const fetchImage = async (url) => {
    fetched.push(url);
    if (url === BROKEN) throw new Error('HTTP 404');
    return jpeg;
  };
  return { db, config, fetched, fetchImage, log: () => {} };
}

describe('WordPress-import', () => {
  let ctx;
  let first;

  before(async () => {
    ctx = setup();
    first = await runImport({ ...ctx, data });
  });

  test('a családok a megfelelő státuszba kerülnek, a minta-családok helyére', () => {
    const count = (status) => store.listFamilies(ctx.db, { status }).length;
    assert.equal(count('adoptable'), 14);
    assert.equal(count('adopted'), 155);
    assert.equal(count('archived'), 4);
    assert.equal(count('uploading'), 1);
    assert.equal(store.listFamilies(ctx.db).length, 174, 'a 3 minta-család törlődött');
    const kinga = store.listFamilies(ctx.db).find((f) => f.name === 'H. Kinga és családja');
    assert.equal(kinga.createdAt, '2026-09-30');
    assert.match(kinga.story, /^<p>Kinga 7 éves kislány Moyamoya-betegséggel él/);
    assert.match(kinga.images[0].url, /^\/uploads\/[0-9a-f]{24}\.webp$/);
    assert.equal(kinga.images[0].isCover, true);
  });

  test('a rendezvények galériás blogbejegyzések lesznek', () => {
    const posts = store.listPosts(ctx.db);
    assert.equal(posts.length, 7);
    assert.equal(posts.filter((p) => p.category === 'rendezvenyek').length, 6);
    const thai = posts.find((p) => p.slug === 'thai-jotekonysagi-koncert');
    assert.equal(thai.category, 'kozos-elmenyeink');
    assert.equal(thai.publishedAt, '2025-12-08');
    assert.equal(thai.status, 'published');
    assert.equal(thai.content.match(/<a href="\/uploads\/[0-9a-f]{24}\.webp"/g).length, 25);
    assert.match(thai.content, /^<div class="gallery"><a href="\/uploads\/[^"]+" rel="noopener noreferrer" target="_blank"><img src="\/uploads\/[0-9a-f]{24}-thumb\.webp" alt="" \/><\/a>/);
    assert.match(thai.coverImage, /^\/uploads\/[0-9a-f]{24}\.webp$/);
  });

  test('a képek webre méretezve: nagy kép max. 1600 px, bélyegkép 480 px', async () => {
    const thai = store.listPosts(ctx.db).find((p) => p.slug === 'thai-jotekonysagi-koncert');
    const [, large, thumb] = thai.content.match(/<a href="([^"]+)"[^>]*><img src="([^"]+)"/);
    const file = (url) => path.join(ctx.config.uploadsDir, path.basename(url));
    assert.equal((await sharp(file(large)).metadata()).width, 1600);
    assert.equal((await sharp(file(thumb)).metadata()).width, 480);
  });

  test('a hibás kép kimarad, de a bejegyzés bekerül, és az állapot rögzül', () => {
    assert.equal(first.state, 'done');
    assert.equal(first.done, 181);
    assert.deepEqual(first.failedImages, [BROKEN]);
    assert.equal(first.images, 700);
    assert.equal(store.getSetting(ctx.db, 'wp_import').state, 'done');
  });

  test('újrafuttatva nem duplikál, és csak a hiányzó képet próbálja újra', async () => {
    const before = ctx.fetched.length;
    const again = await runImport({ ...ctx, data });
    assert.equal(again.state, 'done');
    assert.equal(again.skipped, 0);
    assert.equal(store.listFamilies(ctx.db).length, 174);
    assert.equal(store.listPosts(ctx.db).length, 7);
    assert.deepEqual(ctx.fetched.slice(before), [BROKEN]);
  });

  test('újrafuttatva az adminban módosított családot és bejegyzést nem írja felül', async () => {
    const kinga = store.listFamilies(ctx.db).find((f) => f.name === 'H. Kinga és családja');
    const thai = store.listPosts(ctx.db).find((p) => p.slug === 'thai-jotekonysagi-koncert');
    // Az admin mentése más másodpercre essen, mint az import.
    ctx.db.prepare("UPDATE families SET wp_synced_at = datetime('now', '-1 minute'), updated_at = datetime('now', '-1 minute')").run();
    ctx.db.prepare("UPDATE posts SET wp_synced_at = datetime('now', '-1 minute'), updated_at = datetime('now', '-1 minute')").run();
    store.updateFamily(ctx.db, kinga.id, { ...kinga, status: 'adopted', amount: 120000 });
    store.updatePost(ctx.db, thai.id, { ...thai, title: 'Thai koncert – átírt cím' });

    const again = await runImport({ ...ctx, data });
    assert.equal(again.skipped, 2);
    assert.equal(store.getFamily(ctx.db, kinga.id).status, 'adopted');
    assert.equal(store.getFamily(ctx.db, kinga.id).amount, 120000);
    assert.equal(store.getPost(ctx.db, thai.id).title, 'Thai koncert – átírt cím');
    const other = store.listFamilies(ctx.db, { status: 'archived' })[0];
    assert.equal(store.getFamily(ctx.db, other.id).status, 'archived');
  });

  test('az automatikus státuszszabály az archivált és a feltöltés alatti családokhoz nem nyúl', () => {
    const hunor = store.listFamilies(ctx.db, { status: 'uploading' })[0];
    store.updateFamily(ctx.db, hunor.id, { ...hunor, applicants: 99 });
    store.saveSettings(ctx.db, { threshold: 1, autoStatus: 'adopted', autoEnabled: true });
    assert.equal(store.getFamily(ctx.db, hunor.id).status, 'uploading');
  });
});

describe('adatbázis-migráció', () => {
  test('a régi, két státuszra korlátozott families tábla átalakul, az adatok megmaradnak', () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'elt-mig-')), 'old.db');
    const old = new DatabaseSync(file);
    old.exec(`CREATE TABLE families (
      id INTEGER PRIMARY KEY, name TEXT NOT NULL, subtitle TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL CHECK (status IN ('adoptable', 'adopted')),
      amount INTEGER NOT NULL DEFAULT 0, applicants INTEGER NOT NULL DEFAULT 0, story TEXT NOT NULL DEFAULT '',
      images TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL DEFAULT (date('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')));
      INSERT INTO families (name, status, amount) VALUES ('Régi család', 'adopted', 42000);`);
    old.close();

    const db = store.openDb(file);
    const [family] = store.listFamilies(db);
    assert.equal(family.name, 'Régi család');
    assert.equal(family.amount, 42000);
    store.updateFamily(db, family.id, { ...family, status: 'archived' });
    assert.equal(store.getFamily(db, family.id).status, 'archived');
    store.openDb(file); // második megnyitás: a migráció nem fut újra
  });
});
