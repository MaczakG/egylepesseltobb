import crypto from 'node:crypto';
import fs from 'node:fs';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { openDb, seed } from './db.js';

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
