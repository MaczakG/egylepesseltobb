import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export function loadConfig(env = process.env) {
  const dataDir = path.resolve(env.DATA_DIR || path.join(repoRoot, 'server/data'));
  return {
    port: Number(env.PORT || 3000),
    host: env.HOST || '127.0.0.1',
    siteDir: path.resolve(env.SITE_DIR || repoRoot),
    dataDir,
    uploadsDir: path.join(dataDir, 'uploads'),
    // A beküldött dokumentumok (pl. orvosi papírok) helye: nem nyilvános, csak az adminból tölthetők le.
    privateDir: path.join(dataDir, 'private'),
    dbPath: path.join(dataDir, 'egylepesseltobb.db'),
    sessionSecret: env.SESSION_SECRET || null,
  };
}
