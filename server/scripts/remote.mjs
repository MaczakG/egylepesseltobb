// Feladatok az AWS-en (S3-ban) tárolt adatbázison, a Lambda-oldal mellett, zár alatt.
//   BUCKET=… LOCK_TABLE=… AWS_REGION=eu-central-1 node scripts/remote.mjs import
//   … ADMIN_EMAIL=… ADMIN_PASSWORD=… node scripts/remote.mjs create-admin
// Az `import` a régi WordPress-oldal tartalmát tölti be (képek az S3-ba), mint helyben a szerver induláskor.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { hashPassword, MIN_PASSWORD_LENGTH } from '../src/auth.js';
import { loadConfig } from '../src/config.js';
import { seed, upsertUser } from '../src/db.js';
import { createDbSync } from '../src/dbsync.js';
import { IMPORT_FILE, PAGES_FILE, loadImportData, runImport, runPagesImport } from '../src/wpimport.js';

const { BUCKET, LOCK_TABLE, AWS_REGION, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
const task = process.argv[2];
if (!BUCKET || !LOCK_TABLE || !['import', 'create-admin'].includes(task)) {
  console.error('Használat: BUCKET=… LOCK_TABLE=… node scripts/remote.mjs import|create-admin');
  process.exit(1);
}
if (task === 'create-admin' && (!/^[^\s@]+@[^\s@]+$/.test(ADMIN_EMAIL || '') || (ADMIN_PASSWORD || '').length < MIN_PASSWORD_LENGTH)) {
  console.error(`Adj meg ADMIN_EMAIL-t és legalább ${MIN_PASSWORD_LENGTH} karakteres ADMIN_PASSWORD-öt.`);
  process.exit(1);
}

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'elt-remote-'));
const config = { ...loadConfig({ DATA_DIR: dataDir }), bucket: BUCKET, region: AWS_REGION };
// Az import percekig tart: a zár addig érvényes, hogy közben a Lambda ne írhasson.
const sync = createDbSync({ bucket: BUCKET, table: LOCK_TABLE, region: AWS_REGION, file: config.dbPath, lockTtlMs: 30 * 60_000 });

await sync.lock();
try {
  await sync.open();
  const { db } = sync;
  if (task === 'create-admin') {
    upsertUser(db, ADMIN_EMAIL.trim(), hashPassword(ADMIN_PASSWORD));
    console.log(`Admin: ${ADMIN_EMAIL}`);
  } else {
    seed(db);
    const posts = await runImport({ db, config, data: loadImportData(IMPORT_FILE) });
    console.log(`Bejegyzések: ${posts.state}, ${posts.done}/${posts.total}, ${posts.images} kép, ${posts.failedImages.length} hibás`);
    const pages = await runPagesImport({ db, config, data: loadImportData(PAGES_FILE) });
    console.log(`Oldalak: ${pages.state}, ${pages.done}/${pages.total}, ${pages.files} fájl, ${pages.failedFiles.length} hibás`);
  }
  await sync.push();
} finally {
  await sync.unlock();
  fs.rmSync(dataDir, { recursive: true, force: true });
}
