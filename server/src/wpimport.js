// A régi WordPress oldal (egylepesseltobb.hu) tartalmának egyszeri importja a server/import alatti exportból.
// A képeket az eredeti oldalról tölti le és webre méretezi. Többször is futtatható: a már importált
// bejegyzéseket a WordPress-azonosító alapján frissíti, a már letöltött képeket nem tölti le újra.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import * as store from './db.js';
import {
  detectImageType, sanitizePage, sanitizePost, sanitizeStory,
} from './validate.js';

export const IMPORT_FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../import/wordpress-2026-10-01.json');

const STATUS_KEY = 'wp_import';
const IMAGES_KEY = 'wp_import_images';
const PARALLEL_DOWNLOADS = 3;

// WordPress-kategória → családstátusz (ami itt nincs, az blogbejegyzés lesz).
const FAMILY_STATUS = {
  orokbefogadhato: 'adoptable',
  'orokbefogadott-csaladok': 'adopted',
  'feltoltes-alatt': 'uploading',
  'kategoria-nelkuli-hu': 'archived',
};
const POST_CATEGORY = {
  'kozos-elmenyeink': 'kozos-elmenyeink',
  'alairasi-ceremonia': 'rendezvenyek',
  'csaladi-nap': 'rendezvenyek',
  galaest: 'rendezvenyek',
  rendezvenyek: 'rendezvenyek',
};

sharp.cache(false);

export async function fetchFromWeb(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

export function importStatus(db) {
  return store.getSetting(db, STATUS_KEY, null);
}

export function loadImportData(file = IMPORT_FILE) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

async function inChunks(items, size, fn) {
  const results = [];
  for (let i = 0; i < items.length; i += size) {
    results.push(...await Promise.all(items.slice(i, i + size).map(fn)));
  }
  return results;
}

export async function runImport({ db, config, data, fetchImage = fetchFromWeb, log = console.log }) {
  const status = {
    state: 'running', startedAt: new Date().toISOString(), finishedAt: null,
    total: data.posts.length, done: 0, skipped: 0, images: 0, failedImages: [], error: null,
  };
  const save = () => store.setSetting(db, STATUS_KEY, status);
  save();

  const imageMap = store.getSetting(db, IMAGES_KEY, {});
  const failed = new Set(); // egy futáson belül a hibás képet csak egyszer próbáljuk (több bejegyzésben is szerepelhet)
  const exists = (url) => Boolean(url) && fs.existsSync(path.join(config.uploadsDir, path.basename(url)));
  const variant = (buffer, width, quality, name) => sharp(buffer, { failOn: 'none' })
    .rotate()
    .resize({ width, withoutEnlargement: true })
    .webp({ quality })
    .toFile(path.join(config.uploadsDir, name));

  // Nagy méret (max. 1600 px) mindig, galériához bélyegkép is (480 px).
  async function image(url, withThumb) {
    const known = imageMap[url];
    if (known && exists(known.large) && (!withThumb || exists(known.thumb))) return known;
    if (known && exists(known.large)) {
      // Borítóként már megvan, most galériában is kell: a bélyegkép a meglévő nagy képből készül.
      const name = path.basename(known.large).replace(/\.webp$/, '-thumb.webp');
      await variant(path.join(config.uploadsDir, path.basename(known.large)), 480, 72, name);
      imageMap[url] = { ...known, thumb: `/uploads/${name}` };
      store.setSetting(db, IMAGES_KEY, imageMap);
      return imageMap[url];
    }
    if (failed.has(url)) return null;
    try {
      const buffer = await fetchImage(url);
      if (!detectImageType(buffer)) throw new Error('nem kép');
      const base = crypto.randomBytes(12).toString('hex');
      const entry = { large: `/uploads/${base}.webp`, thumb: null };
      await variant(buffer, 1600, 82, `${base}.webp`);
      if (withThumb) {
        entry.thumb = `/uploads/${base}-thumb.webp`;
        await variant(buffer, 480, 72, `${base}-thumb.webp`);
      }
      imageMap[url] = entry;
      store.setSetting(db, IMAGES_KEY, imageMap);
      status.images += 1;
      return entry;
    } catch (err) {
      log(`Kép kihagyva (${err.message}): ${url}`);
      failed.add(url);
      status.failedImages.push(url);
      return null;
    }
  }

  try {
    fs.mkdirSync(config.uploadsDir, { recursive: true });
    if (data.posts.some((p) => FAMILY_STATUS[p.category])) store.removeSeedFamilies(db);

    for (const p of data.posts) {
      if (store.importedRowEdited(db, FAMILY_STATUS[p.category] ? 'families' : 'posts', p.wpId)) {
        status.skipped += 1;
        status.done += 1;
        save();
        continue;
      }
      const cover = p.featuredImage ? await image(p.featuredImage.url, false) : null;
      if (FAMILY_STATUS[p.category]) {
        store.upsertImportedFamily(db, p.wpId, {
          name: p.title,
          status: FAMILY_STATUS[p.category],
          story: sanitizeStory(p.contentHtml),
          images: cover ? [{ url: cover.large, label: p.featuredImage.url.split('/').pop(), isCover: true }] : [],
          createdAt: p.date,
        });
      } else {
        const gallery = (await inChunks(p.images, PARALLEL_DOWNLOADS, (url) => image(url, true))).filter(Boolean);
        const galleryHtml = gallery.length
          ? `<div class="gallery">${gallery.map((g) => `<a href="${g.large}"><img src="${g.thumb}" alt="" /></a>`).join('')}</div>`
          : '';
        store.upsertImportedPost(db, p.wpId, {
          title: p.title,
          slug: p.slug,
          excerpt: p.excerpt.slice(0, 500),
          content: sanitizePost([p.contentHtml, galleryHtml].filter(Boolean).join('\n')),
          coverImage: cover ? cover.large : '',
          category: POST_CATEGORY[p.category] || 'hirek',
          status: 'published',
          publishedAt: p.date,
        });
      }
      status.done += 1;
      save();
    }
    status.state = 'done';
  } catch (err) {
    status.state = 'failed';
    status.error = err.message;
    log(`A WordPress-import megszakadt: ${err.stack || err.message}`);
  }
  status.finishedAt = new Date().toISOString();
  save();
  return status;
}

// Egyszerre csak egy import futhat.
let running = null;

export function startImport(options) {
  if (!running) {
    running = runImport(options).finally(() => { running = null; });
  }
  return running;
}

// --- Oldalak (pl. /alapitonk) ---------------------------------------------------

export const PAGES_FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../import/wordpress-pages-2026-10-01.json');
const PAGES_STATUS_KEY = 'wp_pages_import';
const FILES_KEY = 'wp_import_files';
const UPLOAD_URL = /https:\/\/egylepesseltobb\.hu\/wp-content\/uploads\/[^"'\s<>)]+/g;

export function pagesImportStatus(db) {
  return store.getSetting(db, PAGES_STATUS_KEY, null);
}

// A PDF a régi fájlnevén kerül a feltöltések közé, hogy a címe beszédes és állandó legyen (pl. /uploads/Prospektus.pdf).
function pdfName(uploadsDir, url) {
  let base = decodeURIComponent(path.basename(new URL(url).pathname)).normalize('NFD').replace(/[̀-ͯ]/g, '');
  base = base.replace(/\.pdf$/i, '').replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'dokumentum';
  let name = `${base}.pdf`;
  for (let n = 2; fs.existsSync(path.join(uploadsDir, name)); n += 1) name = `${base}-${n}.pdf`;
  return name;
}

export async function runPagesImport({ db, config, data, fetchImage = fetchFromWeb, log = console.log }) {
  const status = {
    state: 'running', startedAt: new Date().toISOString(), finishedAt: null,
    total: data.pages.length, done: 0, skipped: 0, files: 0, failedFiles: [], error: null,
  };
  const save = () => store.setSetting(db, PAGES_STATUS_KEY, status);
  save();
  const fileMap = store.getSetting(db, FILES_KEY, {});
  const failed = new Set();
  const exists = (url) => Boolean(url) && fs.existsSync(path.join(config.uploadsDir, path.basename(url)));

  // Kép: webre méretezve (WebP); PDF: változatlanul. Más fájltípust nem veszünk át.
  async function file(url) {
    if (exists(fileMap[url])) return fileMap[url];
    if (failed.has(url)) return null;
    try {
      const buffer = await fetchImage(url);
      let name;
      if (detectImageType(buffer)) {
        name = `${crypto.randomBytes(12).toString('hex')}.webp`;
        await sharp(buffer, { failOn: 'none' }).rotate().resize({ width: 1600, withoutEnlargement: true })
          .webp({ quality: 82 }).toFile(path.join(config.uploadsDir, name));
      } else if (buffer.subarray(0, 5).toString('latin1') === '%PDF-') {
        name = pdfName(config.uploadsDir, url);
        fs.writeFileSync(path.join(config.uploadsDir, name), buffer);
      } else {
        throw new Error('nem kép és nem PDF');
      }
      fileMap[url] = `/uploads/${name}`;
      store.setSetting(db, FILES_KEY, fileMap);
      status.files += 1;
      return fileMap[url];
    } catch (err) {
      log(`Fájl kihagyva (${err.message}): ${url}`);
      failed.add(url);
      status.failedFiles.push(url);
      return null;
    }
  }

  try {
    fs.mkdirSync(config.uploadsDir, { recursive: true });
    for (const url of data.files || []) await file(url);
    for (const pg of data.pages) {
      if (store.importedRowEdited(db, 'pages', pg.wpId)) {
        status.skipped += 1;
      } else {
        const urls = [...new Set(pg.content.match(UPLOAD_URL) || [])];
        const local = await inChunks(urls, PARALLEL_DOWNLOADS, file);
        let content = pg.content;
        urls.forEach((url, i) => { if (local[i]) content = content.split(url).join(local[i]); });
        store.upsertImportedPage(db, pg.wpId, { slug: pg.slug, title: pg.title, content: sanitizePage(content), extras: pg.extras });
      }
      status.done += 1;
      save();
    }
    status.state = 'done';
  } catch (err) {
    status.state = 'failed';
    status.error = err.message;
    log(`Az oldalak importja megszakadt: ${err.stack || err.message}`);
  }
  status.finishedAt = new Date().toISOString();
  save();
  return status;
}

// A régi oldal bejegyzéseinek webcíme → WordPress-azonosító (a régi linkek átirányításához).
export function legacyPostSlugs(data) {
  return new Map(data.posts.map((p) => [p.slug, p.wpId]));
}
