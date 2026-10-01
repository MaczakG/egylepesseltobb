import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

export const STATUSES = ['adoptable', 'adopted'];
export const DEFAULT_SETTINGS = { threshold: 6, autoStatus: 'adopted', autoEnabled: true };

// A főoldalon eddig statikusan szereplő családok, hogy az első indítás után se legyen üres az oldal.
const SEED_FAMILIES = [
  {
    name: 'Kamilla',
    subtitle: 'Rett-szindróma',
    story: '<p>Egészségesen született, ám másfél éves korára feltűnt, hogy lassabban fejlődik társainál. Háromévesen diagnosztizálták nála a Rett-szindrómát, ami komoly visszaesést okozott. A család célja, hogy Kamilla minél tovább megőrizhesse mosolygós, boldog természetét.</p>',
    image: 'story-kamilla.webp',
  },
  {
    name: 'F. Noel',
    subtitle: '9 éves · Duchenne-féle izomdisztrófia',
    story: '<p>Ritka és súlyos izombetegséggel született — szülei már kisgyermekként érezték, hogy nehezebb útja lesz, mint kortársainak. Két éven belül mindkét lába eltört, mégis újra és újra megpróbált felállni. Ma karjait is egyre nehezebben emeli, de nem panaszkodik — csendben, türelemmel küzd.</p>',
    image: 'story-fnoel.webp',
  },
  {
    name: 'Noel',
    subtitle: 'Küzdelem a dongalábbal',
    story: '<p>2025 őszén dongaláb miatt hónapokon át heti gipszelésre járt, majd 2026 februárjában fontos műtéten esett át. Nagymamája elvesztése is nehéz veszteség volt a családnak. Ma már ortopéd cipővel teszi meg egyre biztosabb lépéseit, de további kezelések várnak rá.</p>',
    image: 'story-noel.webp',
  },
];

export function openDb(file) {
  // Jelszó-hasheket tartalmaz: csak az alkalmazás felhasználója olvashassa. A SQLite a -wal/-shm
  // fájlokat a fő fájl jogosultságával hozza létre, ezért megnyitás előtt állítjuk be.
  if (file !== ':memory:') {
    fs.closeSync(fs.openSync(file, 'a', 0o600));
    for (const f of [file, `${file}-wal`, `${file}-shm`]) {
      if (fs.existsSync(f)) fs.chmodSync(f, 0o600);
    }
  }
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      session_version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS families (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      subtitle TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL CHECK (status IN ('adoptable', 'adopted')),
      amount INTEGER NOT NULL DEFAULT 0,
      applicants INTEGER NOT NULL DEFAULT 0,
      story TEXT NOT NULL DEFAULT '',
      images TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (date('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  return db;
}

export function seed(db) {
  if (db.prepare("SELECT 1 FROM settings WHERE key = 'seeded'").get()) return;
  const insert = db.prepare(
    "INSERT INTO families (name, subtitle, status, story, images) VALUES (?, ?, 'adoptable', ?, ?)",
  );
  for (const f of SEED_FAMILIES) {
    const images = [{ url: `/assets/img/${f.image}`, label: f.image, isCover: true }];
    insert.run(f.name, f.subtitle, f.story, JSON.stringify(images));
  }
  db.prepare("INSERT INTO settings (key, value) VALUES ('seeded', '1')").run();
}

function toFamily(row) {
  return {
    id: row.id,
    name: row.name,
    subtitle: row.subtitle,
    status: row.status,
    amount: row.amount,
    applicants: row.applicants,
    story: row.story,
    images: JSON.parse(row.images),
    createdAt: row.created_at,
  };
}

export function listFamilies(db, { status } = {}) {
  const rows = status
    ? db.prepare('SELECT * FROM families WHERE status = ? ORDER BY created_at DESC, id DESC').all(status)
    : db.prepare('SELECT * FROM families ORDER BY created_at DESC, id DESC').all();
  return rows.map(toFamily);
}

export function getFamily(db, id) {
  const row = db.prepare('SELECT * FROM families WHERE id = ?').get(id);
  return row ? toFamily(row) : null;
}

export function createFamily(db, f) {
  const { lastInsertRowid } = db.prepare(`
    INSERT INTO families (name, subtitle, status, amount, applicants, story, images)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(f.name, f.subtitle, f.status, f.amount, f.applicants, f.story, JSON.stringify(f.images));
  return getFamily(db, lastInsertRowid);
}

export function updateFamily(db, id, f) {
  const { changes } = db.prepare(`
    UPDATE families
    SET name = ?, subtitle = ?, status = ?, amount = ?, applicants = ?, story = ?, images = ?,
        updated_at = datetime('now')
    WHERE id = ?
  `).run(f.name, f.subtitle, f.status, f.amount, f.applicants, f.story, JSON.stringify(f.images), id);
  return changes ? getFamily(db, id) : null;
}

export function deleteFamily(db, id) {
  return db.prepare('DELETE FROM families WHERE id = ?').run(id).changes > 0;
}

export function isImageReferenced(db, url) {
  return Boolean(db.prepare('SELECT 1 FROM families WHERE instr(images, ?) > 0').get(JSON.stringify(url)));
}

export function getSettings(db) {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'automation'").get();
  return row ? { ...DEFAULT_SETTINGS, ...JSON.parse(row.value) } : { ...DEFAULT_SETTINGS };
}

// Mentéskor az admin felülethez hasonlóan azonnal érvényesíti a szabályt az összes családra.
export function saveSettings(db, settings) {
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('automation', ?)")
    .run(JSON.stringify(settings));
  if (settings.autoEnabled) {
    db.prepare("UPDATE families SET status = ?, updated_at = datetime('now') WHERE applicants >= ? AND status != ?")
      .run(settings.autoStatus, settings.threshold, settings.autoStatus);
  }
  return getSettings(db);
}

export function getUserByEmail(db, email) {
  return db.prepare('SELECT * FROM users WHERE email = ?').get(email) || null;
}

export function getUserById(db, id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id) || null;
}

export function upsertUser(db, email, passwordHash) {
  const existing = getUserByEmail(db, email);
  if (existing) {
    db.prepare('UPDATE users SET password_hash = ?, session_version = session_version + 1 WHERE id = ?')
      .run(passwordHash, existing.id);
    return { user: getUserById(db, existing.id), created: false };
  }
  const { lastInsertRowid } = db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)')
    .run(email, passwordHash);
  return { user: getUserById(db, lastInsertRowid), created: true };
}

export function setPassword(db, userId, passwordHash) {
  db.prepare('UPDATE users SET password_hash = ?, session_version = session_version + 1 WHERE id = ?')
    .run(passwordHash, userId);
  return getUserById(db, userId);
}
