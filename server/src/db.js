import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

// A főoldalon csak az örökbefogadhatók jelennek meg; az archivált és a feltöltés alatt álló családok csak az adminban.
export const STATUSES = ['adoptable', 'adopted', 'uploading', 'archived'];
export const POST_STATUSES = ['draft', 'published'];
// A menü „Közös élményeink” és „Média megjelenések” pontjai is ezekre a kategóriákra mutatnak.
export const POST_CATEGORIES = [
  { key: 'hirek', label: 'Hírek' },
  { key: 'kozos-elmenyeink', label: 'Közös élményeink' },
  { key: 'rendezvenyek', label: 'Rendezvények' },
  { key: 'media', label: 'Média megjelenések' },
];
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
      status TEXT NOT NULL,
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
    CREATE TABLE IF NOT EXISTS posts (
      id INTEGER PRIMARY KEY,
      title TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      excerpt TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL DEFAULT '',
      cover_image TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('draft', 'published')),
      published_at TEXT NOT NULL DEFAULT (date('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS posts_public ON posts (status, published_at);
  `);
  migrate(db);
  return db;
}

function columns(db, table) {
  return db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
}

function migrate(db) {
  // Az első változat CHECK-kel két státuszra korlátozta a családokat; a tábla újraépítésével vesszük le
  // (a státuszt az alkalmazás ellenőrzi).
  const { sql } = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'families'").get();
  if (sql.includes('CHECK (status IN')) {
    db.exec(`
      BEGIN;
      CREATE TABLE families_new (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        subtitle TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL,
        amount INTEGER NOT NULL DEFAULT 0,
        applicants INTEGER NOT NULL DEFAULT 0,
        story TEXT NOT NULL DEFAULT '',
        images TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL DEFAULT (date('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO families_new (id, name, subtitle, status, amount, applicants, story, images, created_at, updated_at)
        SELECT id, name, subtitle, status, amount, applicants, story, images, created_at, updated_at FROM families;
      DROP TABLE families;
      ALTER TABLE families_new RENAME TO families;
      COMMIT;
    `);
  }
  // A WordPress-importhoz: az eredeti bejegyzés azonosítója, hogy az import többször is futtatható legyen,
  // és az utolsó import ideje, hogy az adminban azóta módosított sorokat az újrafuttatás ne írja felül.
  for (const table of ['families', 'posts']) {
    const cols = columns(db, table);
    if (!cols.includes('wp_id')) db.exec(`ALTER TABLE ${table} ADD COLUMN wp_id INTEGER`);
    if (!cols.includes('wp_synced_at')) db.exec(`ALTER TABLE ${table} ADD COLUMN wp_synced_at TEXT`);
    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS ${table}_wp_id ON ${table} (wp_id)`);
  }
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
  return Boolean(
    db.prepare('SELECT 1 FROM families WHERE instr(images, ?) > 0').get(JSON.stringify(url))
    || db.prepare('SELECT 1 FROM posts WHERE cover_image = ? OR instr(content, ?) > 0').get(url, url),
  );
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
    // Az archivált és a feltöltés alatt álló családokhoz a szabály nem nyúl.
    db.prepare(`UPDATE families SET status = ?, updated_at = datetime('now')
      WHERE applicants >= ? AND status != ? AND status IN ('adoptable', 'adopted')`)
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

// --- Blog -------------------------------------------------------------------

function toPost(row) {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    excerpt: row.excerpt,
    content: row.content,
    coverImage: row.cover_image,
    category: row.category,
    status: row.status,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Nyilvános: közzétett és a megjelenési dátumot már elért bejegyzések (így időzíteni is lehet).
const PUBLIC = "status = 'published' AND published_at <= date('now')";

export function listPublicPosts(db, { category, limit = 12, offset = 0, excludeId = 0 } = {}) {
  const where = [PUBLIC, 'id != ?'];
  const params = [excludeId];
  if (category) {
    where.push('category = ?');
    params.push(category);
  }
  const sql = `SELECT * FROM posts WHERE ${where.join(' AND ')} ORDER BY published_at DESC, id DESC`;
  const total = db.prepare(`SELECT count(*) AS n FROM posts WHERE ${where.join(' AND ')}`).get(...params).n;
  const rows = db.prepare(`${sql} LIMIT ? OFFSET ?`).all(...params, limit, offset);
  return { posts: rows.map(toPost), total };
}

export function getPublicPostBySlug(db, slug) {
  const row = db.prepare(`SELECT * FROM posts WHERE slug = ? AND ${PUBLIC}`).get(slug);
  return row ? toPost(row) : null;
}

export function getPostBySlug(db, slug) {
  const row = db.prepare('SELECT * FROM posts WHERE slug = ?').get(slug);
  return row ? toPost(row) : null;
}

export function listPosts(db) {
  return db.prepare('SELECT * FROM posts ORDER BY published_at DESC, id DESC').all().map(toPost);
}

export function getPost(db, id) {
  const row = db.prepare('SELECT * FROM posts WHERE id = ?').get(id);
  return row ? toPost(row) : null;
}

// Ha a cím alapján készült URL már foglalt, -2, -3, … végződést kap.
export function uniqueSlug(db, base, exceptId = 0) {
  let slug = base;
  for (let n = 2; db.prepare('SELECT 1 FROM posts WHERE slug = ? AND id != ?').get(slug, exceptId); n += 1) {
    slug = `${base}-${n}`;
  }
  return slug;
}

export function createPost(db, p) {
  const { lastInsertRowid } = db.prepare(`
    INSERT INTO posts (title, slug, excerpt, content, cover_image, category, status, published_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(p.title, uniqueSlug(db, p.slug), p.excerpt, p.content, p.coverImage, p.category, p.status, p.publishedAt);
  return getPost(db, lastInsertRowid);
}

export function updatePost(db, id, p) {
  const { changes } = db.prepare(`
    UPDATE posts
    SET title = ?, slug = ?, excerpt = ?, content = ?, cover_image = ?, category = ?, status = ?,
        published_at = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(p.title, uniqueSlug(db, p.slug, id), p.excerpt, p.content, p.coverImage, p.category, p.status,
    p.publishedAt, id);
  return changes ? getPost(db, id) : null;
}

export function deletePost(db, id) {
  return db.prepare('DELETE FROM posts WHERE id = ?').run(id).changes > 0;
}

// --- WordPress-import --------------------------------------------------------

export function getSetting(db, key, fallback = null) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? JSON.parse(row.value) : fallback;
}

export function setSetting(db, key, value) {
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, JSON.stringify(value));
}

// Igaz, ha az importált sort az import óta az adminban módosították (akkor az újrafuttatás nem nyúl hozzá).
export function importedRowEdited(db, table, wpId) {
  const row = db.prepare(`SELECT updated_at, wp_synced_at FROM ${table === 'posts' ? 'posts' : 'families'} WHERE wp_id = ?`)
    .get(wpId);
  return Boolean(row && row.wp_synced_at && row.updated_at !== row.wp_synced_at);
}

export function upsertImportedFamily(db, wpId, f) {
  const existing = db.prepare('SELECT id FROM families WHERE wp_id = ?').get(wpId);
  if (existing) {
    db.prepare(`UPDATE families SET name = ?, status = ?, story = ?, images = ?, created_at = ?, updated_at = datetime('now'),
      wp_synced_at = datetime('now') WHERE id = ?`).run(f.name, f.status, f.story, JSON.stringify(f.images), f.createdAt, existing.id);
    return existing.id;
  }
  return Number(db.prepare(`INSERT INTO families (name, subtitle, status, story, images, created_at, wp_id, updated_at, wp_synced_at)
    VALUES (?, '', ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`).run(f.name, f.status, f.story, JSON.stringify(f.images), f.createdAt, wpId).lastInsertRowid);
}

export function upsertImportedPost(db, wpId, p) {
  const existing = db.prepare('SELECT id FROM posts WHERE wp_id = ?').get(wpId);
  if (existing) {
    db.prepare(`UPDATE posts SET title = ?, excerpt = ?, content = ?, cover_image = ?, category = ?, status = ?,
      published_at = ?, updated_at = datetime('now'), wp_synced_at = datetime('now') WHERE id = ?`)
      .run(p.title, p.excerpt, p.content, p.coverImage, p.category, p.status, p.publishedAt, existing.id);
    return existing.id;
  }
  return Number(db.prepare(`INSERT INTO posts (title, slug, excerpt, content, cover_image, category, status, published_at, wp_id,
    updated_at, wp_synced_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`).run(p.title, uniqueSlug(db, p.slug), p.excerpt, p.content, p.coverImage,
    p.category, p.status, p.publishedAt, wpId).lastInsertRowid);
}

// A mintaként betöltött három családot az import a valódi adatokra cseréli (ha még nem szerkesztették át őket).
export function removeSeedFamilies(db) {
  const names = SEED_FAMILIES.map((f) => f.name);
  return db.prepare(`DELETE FROM families WHERE wp_id IS NULL AND name IN (${names.map(() => '?').join(', ')})
    AND images LIKE '%/assets/img/story-%'`).run(...names).changes;
}
