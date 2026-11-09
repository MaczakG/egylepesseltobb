// A régi WordPress oldal (egylepesseltobb.hu) bejegyzéseinek exportja a server/import alatti importfájlba.
// Futtatás: node scripts/wp-export.mjs [kimeneti fájl]
// A REST API nyilvános végpontjait olvassa; a képeket nem tölti le, csak a címüket menti (a szerver
// importja tölti le és méretezi őket).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE = 'https://egylepesseltobb.hu';
const API = `${SOURCE}/wp-json/wp/v2`;
// Gyűjtőkategória: ha egy bejegyzésnek van pontosabb kategóriája is (pl. Aláírási ceremónia), az számít.
const GENERIC_CATEGORIES = new Set(['rendezvenyek']);
// A családok kategóriái: ezeknél csak a borítókép kell, a csatolt képek nem.
const FAMILY_CATEGORIES = new Set(['orokbefogadhato', 'orokbefogadott-csaladok', 'feltoltes-alatt', 'kategoria-nelkuli-hu']);

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…',
};

function decode(text) {
  return String(text)
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (all, name) => ENTITIES[name.toLowerCase()] ?? all);
}

function plainText(html) {
  return decode(String(html).replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')).trim();
}

async function getAll(endpoint, params = '') {
  const items = [];
  for (let page = 1; ; page += 1) {
    const res = await fetch(`${API}/${endpoint}?per_page=100&page=${page}${params}`);
    if (res.status === 400 && page > 1) break; // túl a lapozáson
    if (!res.ok) throw new Error(`${endpoint}: HTTP ${res.status}`);
    const batch = await res.json();
    items.push(...batch);
    if (page >= Number(res.headers.get('x-wp-totalpages') || 1)) break;
  }
  return items;
}

// A galéria (Gutenberg wp-block-gallery) képei külön listába kerülnek, a szövegből kimaradnak.
function splitGallery(html) {
  const images = [];
  const galleries = html.match(/<figure class="wp-block-gallery[\s\S]*?(?=<figure class="wp-block-gallery|$)/g) || [];
  for (const g of galleries) {
    for (const m of g.matchAll(/<img[^>]+src="([^"]+)"/g)) images.push(decode(m[1]));
  }
  return { content: removeGalleries(html).trim(), images: [...new Set(images)].sort() };
}

// A galériablokk a nyitó <figure class="wp-block-gallery"> és a hozzá tartozó záró </figure> között van.
function removeGalleries(html) {
  let out = '';
  let i = 0;
  while (i < html.length) {
    const start = html.indexOf('<figure class="wp-block-gallery', i);
    if (start === -1) { out += html.slice(i); break; }
    out += html.slice(i, start);
    // Egymásba ágyazott <figure> elemek: a mélységet követjük a záró címkéig.
    const tagRe = /<(\/?)figure\b[^>]*>/g;
    tagRe.lastIndex = start;
    let depth = 0;
    let end = html.length;
    for (let m = tagRe.exec(html); m; m = tagRe.exec(html)) {
      depth += m[1] ? -1 : 1;
      if (depth === 0) { end = tagRe.lastIndex; break; }
    }
    i = end;
  }
  return out;
}

async function main() {
  const out = process.argv[2]
    || path.resolve(path.dirname(fileURLToPath(import.meta.url)), `../import/wordpress-${new Date().toISOString().slice(0, 10)}.json`);
  const categories = new Map((await getAll('categories', '&_fields=id,slug')).map((c) => [c.id, c.slug]));
  const media = new Map();
  const posts = await getAll('posts', '&status=publish&_fields=id,slug,date,title,excerpt,content,categories,featured_media');

  const featuredIds = [...new Set(posts.map((p) => p.featured_media).filter(Boolean))];
  for (let i = 0; i < featuredIds.length; i += 100) {
    const ids = featuredIds.slice(i, i + 100).join(',');
    for (const m of await getAll('media', `&include=${ids}&_fields=id,source_url,alt_text`)) media.set(m.id, m);
  }

  const result = [];
  for (const p of posts) {
    const slugs = p.categories.map((id) => categories.get(id)).filter(Boolean);
    const category = slugs.find((s) => !GENERIC_CATEGORIES.has(s)) || slugs[0] || '';
    const { content, images: galleryImages } = splitGallery(p.content.rendered);
    let images = galleryImages;
    // Galéria nélküli blogbejegyzés: a bejegyzéshez feltöltött (csatolt) képek adják a galériát (pl. Pro Filii).
    if (!images.length && !FAMILY_CATEGORIES.has(category)) {
      const attached = await getAll('media', `&parent=${p.id}&media_type=image&_fields=id,source_url`);
      images = attached.map((m) => m.source_url)
        .sort((a, b) => a.localeCompare(b, 'hu', { numeric: true }));
    }
    const featured = media.get(p.featured_media);
    result.push({
      wpId: p.id,
      title: decode(p.title.rendered),
      slug: p.slug,
      date: p.date.slice(0, 10),
      category,
      excerpt: plainText(p.excerpt.rendered),
      contentHtml: content,
      featuredImage: featured ? { url: featured.source_url, alt: featured.alt_text || '' } : null,
      images,
    });
  }
  result.sort((a, b) => b.date.localeCompare(a.date) || b.wpId - a.wpId);

  fs.writeFileSync(out, `${JSON.stringify({ source: SOURCE, exportedAt: new Date().toISOString().slice(0, 19), posts: result }, null, 1)}\n`);
  console.log(`${result.length} bejegyzés → ${out}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
