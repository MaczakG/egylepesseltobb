import crypto from 'node:crypto';
import fs from 'node:fs';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { openDb, seed } from './db.js';
import {
  IMPORT_FILE, PAGES_FILE, importStatus, loadImportData, pagesImportStatus, runPagesImport, startImport,
} from './wpimport.js';

const config = loadConfig();
if (!config.sessionSecret) {
  // Fejlesztéshez elég: újraindításkor mindenki kijelentkezik.
  console.warn('SESSION_SECRET nincs beállítva, ideiglenes kulcsot használok.');
  config.sessionSecret = crypto.randomBytes(32).toString('hex');
}

fs.mkdirSync(config.dataDir, { recursive: true });
const db = openDb(config.dbPath);
seed(db);

createApp({ db, config }).listen(config.port, config.host, () => {
  console.log(`Az oldal fut: http://${config.host}:${config.port}`);
});

// A régi WordPress-tartalom importja a háttérben indul, ha még nem futott le (WP_IMPORT=0 kikapcsolja):
// előbb a családok és a bejegyzések, utána az oldalak.
if (process.env.WP_IMPORT !== '0') {
  (async () => {
    // Újabb exportnál (scripts/wp-export.mjs) újra lefut: frissíti a családok státuszát és felveszi az újakat,
    // az adminban módosított tételekhez nem nyúl.
    const data = fs.existsSync(IMPORT_FILE) ? loadImportData() : null;
    const last = importStatus(db);
    if (data && (last?.state !== 'done' || (last.exportedAt || '') < data.exportedAt)) {
      const s = await startImport({ db, config, data });
      console.log(`WordPress-import: ${s.state}, ${s.done}/${s.total} bejegyzés, ${s.images} kép, ${s.failedImages.length} hibás kép`);
    }
    const pages = fs.existsSync(PAGES_FILE) ? loadImportData(PAGES_FILE) : null;
    const lastPages = pagesImportStatus(db);
    if (pages && (lastPages?.state !== 'done' || (lastPages.exportedAt || '') < pages.exportedAt)) {
      const s = await runPagesImport({ db, config, data: pages });
      console.log(`Oldalak importja: ${s.state}, ${s.done}/${s.total} oldal, ${s.files} fájl, ${s.failedFiles.length} hibás fájl`);
    }
  })();
}
