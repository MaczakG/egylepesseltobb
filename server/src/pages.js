// A blog nyilvános oldalai. A keretet (head, fejléc, lábléc, szkript) a főoldalból veszik át,
// így a menü és a dizájn egy helyen, az index.html-ben változik.
import { POST_CATEGORIES } from './db.js';
import {
  FAMILY_BADGE, coverImage, escapeHtml, excerpt, familyCard, familyUrl, renderFamilyCards,
} from './render.js';

const MONTHS = ['január', 'február', 'március', 'április', 'május', 'június', 'július', 'augusztus',
  'szeptember', 'október', 'november', 'december'];

export function formatDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return `${y}. ${MONTHS[m - 1]} ${d}.`;
}

export function categoryLabel(key) {
  return (POST_CATEGORIES.find((c) => c.key === key) || { label: '' }).label;
}

function between(html, name) {
  const start = html.indexOf(`<!-- ${name}:start -->`);
  const end = html.indexOf(`<!-- ${name}:end -->`);
  return start === -1 || end === -1 ? '' : html.slice(start + `<!-- ${name}:start -->`.length, end);
}

// Aloldalon a #horgonyok a főoldalra, a relatív képutak a gyökérre mutassanak.
// (A #contact a láblécben van, ezért az aloldalakon is helyben működik.)
function absolutize(html) {
  return html.replace(/(href|src)="#/g, '$1="/#').replace(/(href|src)="assets\//g, '$1="/assets/');
}

// A lábléc „Adatkezelési tájékoztató” linkje; amíg csak `#` helyőrző, nem linkeljük.
function privacyLink(footer) {
  const m = footer.match(/<a href="([^"]*)"[^>]*>\s*Adatkezelési tájékoztató\s*<\/a>/);
  const href = m ? m[1] : '';
  return href && !/^\/?#?$/.test(href) ? absolutize(`href="${href}"`).slice(6, -1) : '';
}

export function siteFrame(indexHtml) {
  return {
    head: absolutize(indexHtml.slice(indexHtml.indexOf('<head>') + '<head>'.length, indexHtml.indexOf('</head>'))),
    header: absolutize(between(indexHtml, 'site:header')),
    footer: absolutize(between(indexHtml, 'site:footer')),
    script: between(indexHtml, 'site:script'),
    // A lábléc e-mail címe és adatkezelési tájékoztatója (a családok aloldalán használjuk).
    email: (between(indexHtml, 'site:footer').match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/) || [''])[0],
    privacyUrl: privacyLink(between(indexHtml, 'site:footer')),
  };
}

const CONTENT_CSS = `
  .blog-content { color: #334758; font-size: 1.075rem; line-height: 1.85; }
  .blog-content > * + * { margin-top: 1.25em; }
  .blog-content h2 { font-family: 'Baloo 2', sans-serif; font-size: 1.75rem; font-weight: 600; color: #263640; line-height: 1.25; margin-top: 1.8em; }
  .blog-content h3, .blog-content h4 { font-family: 'Baloo 2', sans-serif; font-size: 1.35rem; font-weight: 600; color: #263640; line-height: 1.3; margin-top: 1.6em; }
  .blog-content a { color: #a68c5c; text-decoration: underline; text-underline-offset: 3px; }
  .blog-content a:hover { color: #7d6944; }
  .blog-content strong, .blog-content b { color: #263640; }
  .blog-content ul { list-style: disc; padding-left: 1.5em; }
  .blog-content ol { list-style: decimal; padding-left: 1.5em; }
  .blog-content li + li { margin-top: 0.4em; }
  .blog-content blockquote { border-left: 3px solid #dac7a0; padding-left: 1.25em; font-style: italic; color: #4c6b7d; }
  .blog-content img { display: block; max-width: 100%; height: auto; border-radius: 1rem; margin: 2em auto; }
  .gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 0.5rem; }
  .blog-content .gallery { margin-top: 2em; }
  .gallery a { display: block; overflow: hidden; border-radius: 0.75rem; }
  .gallery img, .blog-content .gallery img { width: 100%; aspect-ratio: 1; object-fit: cover; margin: 0; border-radius: 0; transition: transform 0.4s ease; }
  .gallery a:hover img { transform: scale(1.04); }
`;

// Galéria-nagyító a bejegyzés és a család oldalán: a bélyegképekre kattintva a nagy kép jelenik meg (lapozható).
// JavaScript nélkül a link új lapon nyitja meg a képet.
const GALLERY_LIGHTBOX = `
<div id="gallery-lightbox" class="fixed inset-0 z-[100] hidden items-center justify-center bg-navy-900/95 px-4" role="dialog" aria-modal="true" aria-label="Képnézegető">
  <button data-lb="close" class="absolute top-5 right-5 text-white/80 hover:text-white text-3xl leading-none" aria-label="Bezárás">×</button>
  <button data-lb="prev" class="absolute left-2 md:left-6 top-1/2 -translate-y-1/2 text-white/70 hover:text-white text-5xl px-3" aria-label="Előző kép">‹</button>
  <img data-lb="img" src="" alt="" class="max-h-[85vh] max-w-full rounded-xl shadow-2xl">
  <button data-lb="next" class="absolute right-2 md:right-6 top-1/2 -translate-y-1/2 text-white/70 hover:text-white text-5xl px-3" aria-label="Következő kép">›</button>
  <p data-lb="count" class="absolute bottom-5 inset-x-0 text-center text-white/60 text-sm"></p>
</div>
<script>
(function () {
  var links = Array.prototype.slice.call(document.querySelectorAll('.blog-content .gallery a, a[data-lightbox]'));
  var box = document.getElementById('gallery-lightbox');
  if (!links.length || !box) return;
  var img = box.querySelector('[data-lb="img"]');
  var count = box.querySelector('[data-lb="count"]');
  var index = 0;
  function show(i) {
    index = (i + links.length) % links.length;
    img.src = links[index].getAttribute('href');
    count.textContent = (index + 1) + ' / ' + links.length;
  }
  function open(i) {
    show(i);
    box.classList.remove('hidden');
    box.classList.add('flex');
    document.body.style.overflow = 'hidden';
  }
  function close() {
    box.classList.add('hidden');
    box.classList.remove('flex');
    document.body.style.overflow = '';
  }
  links.forEach(function (a, i) {
    a.addEventListener('click', function (e) { e.preventDefault(); open(i); });
  });
  box.addEventListener('click', function (e) {
    var action = e.target.getAttribute('data-lb');
    if (action === 'close' || e.target === box) close();
    if (action === 'prev') show(index - 1);
    if (action === 'next') show(index + 1);
  });
  document.addEventListener('keydown', function (e) {
    if (box.classList.contains('hidden')) return;
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowLeft') show(index - 1);
    if (e.key === 'ArrowRight') show(index + 1);
  });
})();
</script>`;

function layout(frame, { title, description, canonical, image, type = 'website', main, extra = '' }) {
  const head = frame.head
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(title)}</title>`)
    .replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${escapeHtml(description)}">`);
  const meta = [
    canonical && `<link rel="canonical" href="${escapeHtml(canonical)}">`,
    `<meta property="og:type" content="${type}">`,
    `<meta property="og:title" content="${escapeHtml(title)}">`,
    `<meta property="og:description" content="${escapeHtml(description)}">`,
    canonical && `<meta property="og:url" content="${escapeHtml(canonical)}">`,
    image && `<meta property="og:image" content="${escapeHtml(image)}">`,
  ].filter(Boolean).join('\n');
  return `<!DOCTYPE html>
<html lang="hu">
<head>${head}${meta}
<style>${CONTENT_CSS}</style>
</head>
<body class="bg-white text-navy-700 antialiased">
${frame.header}
${main}
${frame.footer}
${frame.script}
${extra}
</body>
</html>
`;
}

function cover(post, className) {
  return post.coverImage
    ? `<img src="${escapeHtml(post.coverImage)}" loading="lazy" alt="" class="${className}">`
    : `<div class="${className} bg-sand-200 flex items-center justify-center"><span class="font-display text-xl font-semibold text-navy-700 px-6 text-center">${escapeHtml(categoryLabel(post.category))}</span></div>`;
}

export function postCard(post) {
  const url = `/blog/${post.slug}`;
  return `
      <article class="reveal lift-card group bg-navy-50 rounded-2xl overflow-hidden border border-navy-100 flex flex-col">
        <a href="${url}" class="block relative h-56 overflow-hidden" tabindex="-1" aria-hidden="true">
          ${cover(post, 'w-full h-full object-cover group-hover:scale-[1.04] transition-transform duration-500')}
          <span class="absolute top-4 left-4 bg-white/90 text-navy-800 text-xs font-semibold px-3 py-1.5 rounded-full">${escapeHtml(categoryLabel(post.category))}</span>
        </a>
        <div class="p-7 flex flex-col flex-1">
          <p class="text-xs text-navy-500 mb-2"><time datetime="${post.publishedAt}">${formatDate(post.publishedAt)}</time></p>
          <h3 class="font-display text-xl font-semibold text-navy-800 mb-3 leading-snug"><a href="${url}" class="hover:text-sand-700 transition-colors">${escapeHtml(post.title)}</a></h3>
          <p class="text-navy-600 text-sm leading-relaxed mb-6 flex-1">${escapeHtml(post.excerpt || excerpt(post.content, 200))}</p>
          <a href="${url}" class="inline-flex items-center gap-1 text-sm font-semibold text-navy-800 hover:text-sand-700 pt-5 border-t border-navy-200">Tovább olvasom →</a>
        </div>
      </article>`;
}

// A lábléc „Rendezvényeink” szekciója: a blog legfrissebb „Rendezvények” bejegyzései, galériával.
// Minden oldalon megjelenik (a lábléc része); ha nincs ilyen bejegyzés, a szekció elmarad.
// A bejegyzés galériáiban lévő képek száma.
function photoCount(post) {
  return (post.content.match(/<div class="gallery">[\s\S]*?<\/div>/g) || []).join('').split('<a ').length - 1;
}

export function renderEvents(posts) {
  if (!posts.length) return '';
  const card = (post) => `
        <a href="/blog/${post.slug}" class="event-card group block">
          <div class="relative h-44 rounded-xl overflow-hidden mb-4 bg-navy-700">
            ${post.coverImage
    ? `<img src="${escapeHtml(post.coverImage)}" loading="lazy" alt="${escapeHtml(post.title)}" class="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-500">`
    : '<div class="w-full h-full flex items-center justify-center font-display text-sand-400 text-lg">Rendezvény</div>'}
            <div class="absolute inset-0 bg-navy-900/30 group-hover:bg-navy-900/10 transition-colors"></div>
          </div>
          <h4 class="font-display font-semibold text-white mb-1 group-hover:text-sand-400 transition-colors">${escapeHtml(post.title)}</h4>
          <p class="text-sm text-white/60"><time datetime="${post.publishedAt}">${formatDate(post.publishedAt)}</time>${photoCount(post) ? ` · ${photoCount(post)} fotó` : ''}</p>
        </a>`;
  return `
  <div id="events" class="border-b border-white/10 py-16 px-6 lg:px-10">
    <div class="max-w-7xl mx-auto">
      <div class="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-10">
        <div>
          <p class="text-xs tracking-[0.3em] uppercase text-sand-400 mb-3">Rendezvényeink</p>
          <h3 class="font-display text-2xl md:text-3xl font-medium">Találkozzunk élőben is</h3>
        </div>
        <a href="/blog?kategoria=rendezvenyek" class="inline-flex items-center gap-2 text-sm font-semibold text-sand-400 hover:text-sand-300 self-start sm:self-auto">Összes rendezvény →</a>
      </div>
      <div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
${posts.map(card).join('\n')}
      </div>
    </div>
  </div>`;
}

// A főoldal blogszekciója; ha nincs közzétett bejegyzés, el sem jelenik.
export function renderHomePosts(posts) {
  if (!posts.length) return '';
  return `
<!-- ============ BLOG ============ -->
<section id="blog" class="relative bg-sand-50 py-24 md:py-36 px-6 lg:px-10">
  <div class="max-w-7xl mx-auto">
    <div class="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-16 md:mb-20">
      <div>
        <span class="reveal block text-sand-700 tracking-[0.3em] text-xs md:text-sm font-semibold uppercase mb-4">Blog</span>
        <h2 class="reveal font-display text-3xl md:text-5xl font-medium text-navy-800 max-w-2xl leading-tight">Hírek és közös élmények az alapítvány életéből</h2>
      </div>
      <a href="/blog" class="reveal inline-flex items-center gap-2 border border-navy-800 text-navy-800 hover:bg-navy-800 hover:text-white font-semibold px-6 py-3 rounded-full transition-colors self-start md:self-auto">Összes bejegyzés →</a>
    </div>
    <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-8 md:gap-10">
${posts.map(postCard).join('\n')}
    </div>
  </div>
</section>
`;
}

function listUrl(category, page) {
  const params = new URLSearchParams();
  if (category) params.set('kategoria', category);
  if (page > 1) params.set('oldal', String(page));
  const qs = params.toString();
  return qs ? `/blog?${qs}` : '/blog';
}

export function renderBlogList(frame, { posts, page, pageCount, category, baseUrl }) {
  const chip = (key, label) => {
    const active = (key || '') === (category || '');
    return `<a href="${listUrl(key, 1)}" class="px-4 py-2 rounded-full text-sm font-semibold transition-colors ${active
      ? 'bg-navy-800 text-white'
      : 'border border-navy-200 text-navy-700 hover:border-navy-800'}"${active ? ' aria-current="page"' : ''}>${escapeHtml(label)}</a>`;
  };
  const heading = category ? categoryLabel(category) : 'Hírek, élmények és történetek az alapítvány életéből';
  const grid = posts.length
    ? `<div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-8 md:gap-10 mt-12">\n${posts.map(postCard).join('\n')}\n      </div>`
    : '<p class="mt-12 text-navy-600">Ebben a kategóriában még nincs bejegyzés.</p>';
  const pager = pageCount > 1
    ? `<nav class="flex items-center justify-between mt-16 pt-8 border-t border-navy-100" aria-label="Lapozás">
        ${page > 1 ? `<a href="${listUrl(category, page - 1)}" class="font-semibold text-navy-800 hover:text-sand-700">← Újabb bejegyzések</a>` : '<span></span>'}
        <span class="text-sm text-navy-500">${page} / ${pageCount}</span>
        ${page < pageCount ? `<a href="${listUrl(category, page + 1)}" class="font-semibold text-navy-800 hover:text-sand-700">Régebbi bejegyzések →</a>` : '<span></span>'}
      </nav>`
    : '';
  const main = `
<main class="pt-32 md:pt-40 pb-24 md:pb-32 px-6 lg:px-10">
  <div class="max-w-7xl mx-auto">
    <span class="block text-sand-700 tracking-[0.3em] text-xs md:text-sm font-semibold uppercase mb-4">Blog</span>
    <h1 class="font-display text-3xl md:text-5xl font-medium text-navy-800 max-w-3xl leading-tight">${escapeHtml(heading)}</h1>
    <nav class="flex flex-wrap gap-2 mt-10" aria-label="Kategóriák">
      ${chip('', 'Összes')}
      ${POST_CATEGORIES.map((c) => chip(c.key, c.label)).join('\n      ')}
    </nav>
    ${grid}
    ${pager}
  </div>
</main>`;
  const title = category ? `${categoryLabel(category)} — Blog — Egy Lépéssel Több Alapítvány` : 'Blog — Egy Lépéssel Több Alapítvány';
  return layout(frame, {
    title,
    description: 'Hírek, közös élmények, rendezvények és médiamegjelenések az Egy Lépéssel Több Alapítvány életéből.',
    canonical: baseUrl + listUrl(category, page),
    main,
  });
}

export function renderBlogPost(frame, { post, related, baseUrl, preview }) {
  const description = post.excerpt || excerpt(post.content, 200);
  const banner = preview
    ? '<div class="bg-amber-100 text-amber-900 text-sm font-semibold text-center px-6 py-3 rounded-xl mb-8">Előnézet: ez a bejegyzés még nem nyilvános, csak bejelentkezett adminisztrátor látja.</div>'
    : '';
  const more = related.length
    ? `
  <section class="bg-sand-50 py-20 md:py-28 px-6 lg:px-10 mt-20 md:mt-28">
    <div class="max-w-7xl mx-auto">
      <h2 class="font-display text-2xl md:text-4xl font-medium text-navy-800 mb-12">További bejegyzések</h2>
      <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-8 md:gap-10">
${related.map(postCard).join('\n')}
      </div>
    </div>
  </section>`
    : '';
  const main = `
<main class="pt-32 md:pt-40">
  <article>
    <header class="px-6 lg:px-10">
      <div class="max-w-3xl mx-auto">
        ${banner}
        <a href="/blog" class="inline-flex items-center gap-1 text-sm font-semibold text-navy-500 hover:text-navy-800">← Vissza a bloghoz</a>
        <p class="mt-8 text-sm text-navy-500">
          <a href="${listUrl(post.category, 1)}" class="font-semibold text-sand-700 hover:text-sand-800">${escapeHtml(categoryLabel(post.category))}</a>
          · <time datetime="${post.publishedAt}">${formatDate(post.publishedAt)}</time>
        </p>
        <h1 class="font-display text-3xl md:text-5xl font-medium text-navy-800 leading-tight mt-3">${escapeHtml(post.title)}</h1>
        ${post.excerpt ? `<p class="mt-6 text-lg md:text-xl text-navy-600 leading-relaxed">${escapeHtml(post.excerpt)}</p>` : ''}
      </div>
    </header>
    ${post.coverImage ? `<div class="px-6 lg:px-10 mt-12"><img src="${escapeHtml(post.coverImage)}" alt="" class="max-w-5xl w-full mx-auto rounded-2xl aspect-[16/9] object-cover"></div>` : ''}
    <div class="px-6 lg:px-10 mt-12">
      <div class="blog-content max-w-3xl mx-auto">${post.content}</div>
    </div>
  </article>
  ${more}
  ${more ? '' : '<div class="pb-24 md:pb-32"></div>'}
</main>`;
  return layout(frame, {
    title: `${post.title} — Egy Lépéssel Több Alapítvány`,
    description,
    canonical: `${baseUrl}/blog/${post.slug}`,
    image: post.coverImage ? baseUrl + post.coverImage : '',
    type: 'article',
    main,
    extra: post.content.includes('class="gallery"') ? GALLERY_LIGHTBOX : '',
  });
}

// --- Családok ---------------------------------------------------------------

function familyListUrl(status, page) {
  const params = new URLSearchParams();
  if (status === 'adopted') params.set('statusz', 'orokbefogadott');
  if (page > 1) params.set('oldal', String(page));
  const qs = params.toString();
  return qs ? `/csaladok?${qs}` : '/csaladok';
}

export function renderFamilyList(frame, { families, status, page, pageCount, counts, baseUrl }) {
  const adopted = status === 'adopted';
  const chip = (key, label) => {
    const active = key === status;
    return `<a href="${familyListUrl(key, 1)}" class="px-4 py-2 rounded-full text-sm font-semibold transition-colors ${active
      ? 'bg-navy-800 text-white'
      : 'border border-navy-200 text-navy-700 hover:border-navy-800'}"${active ? ' aria-current="page"' : ''}>${label} <span class="${active ? 'text-white/60' : 'text-navy-400'}">${counts[key] || 0}</span></a>`;
  };
  const heading = adopted ? 'Örökbefogadott családjaink' : 'Örökbefogadható családok';
  const intro = adopted
    ? 'Ők már megtalálták a támogatóikat. Köszönjük mindenkinek, aki egy lépéssel többet tett értük!'
    : 'Nem statisztika. Nem szám. Egy valódi család, akinek az élete változhat veled. Válaszd ki, kinek a történetének szeretnél a része lenni.';
  const grid = families.length
    ? `<div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-8 md:gap-10 mt-12">\n${families.map(familyCard).join('\n')}\n      </div>`
    : `<div class="grid mt-12">${renderFamilyCards([])}</div>`;
  const pager = pageCount > 1
    ? `<nav class="flex items-center justify-between mt-16 pt-8 border-t border-navy-100" aria-label="Lapozás">
        ${page > 1 ? `<a href="${familyListUrl(status, page - 1)}" class="font-semibold text-navy-800 hover:text-sand-700">← Előző oldal</a>` : '<span></span>'}
        <span class="text-sm text-navy-500">${page} / ${pageCount}</span>
        ${page < pageCount ? `<a href="${familyListUrl(status, page + 1)}" class="font-semibold text-navy-800 hover:text-sand-700">Következő oldal →</a>` : '<span></span>'}
      </nav>`
    : '';
  const main = `
<main class="pt-32 md:pt-40 pb-24 md:pb-32 px-6 lg:px-10">
  <div class="max-w-7xl mx-auto">
    <span class="block text-sand-700 tracking-[0.3em] text-xs md:text-sm font-semibold uppercase mb-4">Fogadj örökbe egy családot</span>
    <h1 class="font-display text-3xl md:text-5xl font-medium text-navy-800 max-w-3xl leading-tight">${heading}</h1>
    <p class="mt-6 text-lg text-navy-600 leading-relaxed max-w-3xl">${intro}</p>
    <nav class="flex flex-wrap gap-2 mt-10" aria-label="Családok">
      ${chip('adoptable', 'Örökbefogadható')}
      ${chip('adopted', 'Örökbefogadott')}
    </nav>
    ${grid}
    ${pager}
  </div>
</main>`;
  return layout(frame, {
    title: `${heading} — Egy Lépéssel Több Alapítvány`,
    description: intro,
    canonical: baseUrl + familyListUrl(status, page),
    main,
  });
}

function shareBox(frame, pageUrl, { donate }) {
  return `
    <aside class="bg-navy-800 text-white rounded-2xl p-8 mt-6">
      ${donate ? `
      <p class="text-sand-400 tracking-[0.2em] text-xs font-semibold uppercase mb-3">Egyszeri segítség</p>
      <p class="text-white/75 leading-relaxed">Egyszeri adománnyal is segíthetsz: a banki adatainkat az oldal alján találod.</p>
      <a href="#contact" class="mt-5 inline-flex justify-center items-center gap-2 border border-white/40 hover:border-sand-400 hover:text-sand-400 font-semibold px-6 py-3 rounded-full transition-colors w-full">Egyszeri adomány</a>
      ${frame.email ? `<p class="mt-5 text-sm text-white/60">Kérdésed van? Írj nekünk: <a href="mailto:${escapeHtml(frame.email)}" class="text-white underline underline-offset-2">${escapeHtml(frame.email)}</a></p>` : ''}
      <div class="mt-6 pt-6 border-t border-white/15">` : '<div>'}
        <p class="text-sm text-white/70 mb-3">Oszd meg, hogy minél többen megismerjék a történetüket:</p>
        <div class="flex flex-wrap gap-2">
          <a href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(pageUrl)}" target="_blank" rel="noopener" class="inline-flex items-center gap-2 border border-white/30 hover:border-sand-400 hover:text-sand-400 text-sm font-semibold px-4 py-2 rounded-full transition-colors">Facebook</a>
          <button type="button" onclick="var b=this;navigator.clipboard&&navigator.clipboard.writeText(location.href).then(function(){b.textContent='Link másolva ✓'})" class="inline-flex items-center gap-2 border border-white/30 hover:border-sand-400 hover:text-sand-400 text-sm font-semibold px-4 py-2 rounded-full transition-colors">Link másolása</button>
        </div>
      </div>
    </aside>`;
}

function statusBox(family) {
  if (family.status === 'adopted') {
    return `
    <aside class="bg-navy-800 text-white rounded-2xl p-8 mb-6">
      <p class="text-sand-400 tracking-[0.2em] text-xs font-semibold uppercase mb-3">Örökbefogadott család</p>
      <h2 class="font-display text-2xl font-semibold leading-snug">Ez a család már megtalálta a támogatóit</h2>
      <p class="mt-4 text-white/75 leading-relaxed">Köszönjük mindenkinek, aki segített! Más családok még várják, hogy valaki egy lépéssel többet tegyen értük: az alábbi űrlapon közülük választhatsz.</p>
    </aside>`;
  }
  if (family.status !== 'adoptable') {
    return `
    <aside class="bg-navy-50 border border-navy-100 rounded-2xl p-8 mb-6">
      <p class="text-navy-500 tracking-[0.2em] text-xs font-semibold uppercase mb-3">${FAMILY_BADGE[family.status].label}</p>
      <p class="text-navy-700 leading-relaxed">Ez a család most nem jelenik meg a weboldalon. Az adminban „Örökbefogadható” vagy „Örökbefogadott” státuszra állítva lesz nyilvános.</p>
    </aside>`;
  }
  return '';
}

const INPUT = 'w-full rounded-full border bg-white px-5 py-3 text-navy-800 outline-none transition focus:border-sand-600 focus:ring-2 focus:ring-sand-200';

// „Jelentkezem támogatónak” űrlap a család oldalán. JavaScript nélkül is működik (sima POST, a szerver
// hiba esetén a hibaüzenetekkel és a beírt értékekkel adja vissza az oldalt).
function applicationForm(frame, family, form) {
  if (form.submitted) {
    return `
    <section id="jelentkezes" class="scroll-mt-32 bg-white border border-navy-100 rounded-2xl shadow-sm p-8 text-center" role="status">
      <div class="w-14 h-14 rounded-full bg-sand-100 text-sand-800 mx-auto flex items-center justify-center text-2xl font-bold">✓</div>
      <h2 class="font-display text-2xl font-semibold text-navy-800 mt-5">Köszönjük a jelentkezésedet!</h2>
      <p class="mt-3 text-navy-600 leading-relaxed">Hamarosan felvesszük veled a kapcsolatot a megadott elérhetőségeken.</p>
    </section>`;
  }
  const v = form.values || {};
  const e = form.errors || {};
  const selected = v.familyId || (form.options.some((o) => o.id === family.id) ? family.id : 0);
  const cls = (name) => `${INPUT} ${e[name] ? 'border-red-400' : 'border-navy-200'}`;
  const err = (name) => (e[name] ? `<p class="mt-1.5 ml-4 text-sm text-red-700">${escapeHtml(e[name])}</p>` : '');
  const label = (id, text, required = true) => `<label for="${id}" class="block text-sm text-navy-600 mb-1.5 ml-1">${required ? '<span class="text-red-600">*</span> ' : ''}${text}</label>`;
  const input = (name, id, text, type, autocomplete) => `
        <div>
          ${label(id, text)}
          <input id="${id}" name="${name.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)}" type="${type}" autocomplete="${autocomplete}" required maxlength="${type === 'email' ? 200 : 100}" value="${escapeHtml(v[name] || '')}" class="${cls(name)}"${e[name] ? ' aria-invalid="true"' : ''}>
          ${err(name)}
        </div>`;
  const option = (value, text, isSelected) => `<option value="${escapeHtml(String(value))}"${isSelected ? ' selected' : ''}>${escapeHtml(text)}</option>`;
  const privacy = frame.privacyUrl
    ? `<a href="${escapeHtml(frame.privacyUrl)}" target="_blank" rel="noopener" class="text-sand-800 underline underline-offset-2 hover:text-navy-800">adatkezelési tájékoztatót</a>`
    : 'adatkezelési tájékoztatót';
  return `
    <section id="jelentkezes" class="scroll-mt-32 bg-white border border-navy-100 rounded-2xl shadow-sm p-6 md:p-8">
      <h2 class="font-display text-2xl md:text-3xl font-semibold text-navy-800">Jelentkezem támogatónak</h2>
      <p class="mt-2 text-sm text-navy-500">Fogadj örökbe egy családot, és válj havonta a történetük részévé. A <span class="text-red-600">*</span>-gal jelölt mezők kitöltése kötelező.</p>
      ${form.error ? `<p class="mt-5 text-sm text-red-800 bg-red-50 border border-red-200 rounded-xl px-4 py-3" role="alert">${escapeHtml(form.error)}</p>` : ''}
      ${Object.keys(e).length && !form.error ? '<p class="mt-5 text-sm text-red-800 bg-red-50 border border-red-200 rounded-xl px-4 py-3" role="alert">Kérjük, javítsd a megjelölt mezőket.</p>' : ''}
      <form method="post" action="${familyUrl(family)}/jelentkezes" class="mt-6 space-y-5">
        ${input('lastName', 'app-last-name', 'Vezetéknév:', 'text', 'family-name')}
        ${input('firstName', 'app-first-name', 'Keresztnév:', 'text', 'given-name')}
        ${input('email', 'app-email', 'E-mail:', 'email', 'email')}
        ${input('phone', 'app-phone', 'Telefonszám:', 'tel', 'tel')}
        <div>
          ${label('app-amount', 'Havi támogatás összege (HUF):')}
          <select id="app-amount" name="amount" required class="${cls('amount')}">
            ${option('', 'Válassz összeget', !v.amount)}
            ${form.amounts.map((a) => option(a, `${a.toLocaleString('hu-HU')} Ft`, a === v.amount)).join('\n            ')}
          </select>
          ${err('amount')}
        </div>
        <div>
          ${label('app-family', 'Támogatni kívánt család:')}
          <select id="app-family" name="family_id" required class="${cls('familyId')}">
            ${option('', 'Válassz családot', !selected)}
            ${form.options.map((o) => option(o.id, o.name, o.id === selected)).join('\n            ')}
          </select>
          ${err('familyId')}
        </div>
        <div>
          ${label('app-source', 'Honnan hallott rólunk?:')}
          <select id="app-source" name="source" required class="${cls('source')}">
            ${option('', 'Válasszon a felsoroltak közül', !v.source)}
            ${form.sources.map((src) => option(src, src, src === v.source)).join('\n            ')}
          </select>
          ${err('source')}
        </div>
        <div>
          ${label('app-note', 'Megjegyzés:', false)}
          <textarea id="app-note" name="note" rows="4" maxlength="2000" class="w-full rounded-2xl border border-navy-200 bg-white px-5 py-3 text-navy-800 outline-none transition focus:border-sand-600 focus:ring-2 focus:ring-sand-200">${escapeHtml(v.note || '')}</textarea>
        </div>
        <div class="absolute -left-[9999px] w-px h-px overflow-hidden" aria-hidden="true">
          <label for="app-website">Weboldal (hagyd üresen)</label>
          <input id="app-website" name="website" type="text" tabindex="-1" autocomplete="off">
        </div>
        <div>
          <label class="flex items-start gap-3 text-sm text-navy-600 ml-1">
            <input type="checkbox" name="consent" value="on" required${v.consent ? ' checked' : ''} class="mt-0.5 w-4 h-4 rounded border-navy-300 text-sand-700 focus:ring-sand-300">
            <span><span class="text-red-600">*</span> Elolvastam és megértettem az ${privacy}.</span>
          </label>
          ${err('consent')}
        </div>
        <button type="submit" class="btn-primary w-full bg-sand-500 hover:bg-sand-600 text-navy-900 font-bold uppercase tracking-wide px-6 py-3.5 rounded-full">Beküldés</button>
      </form>
    </section>`;
}

export function renderFamilyPage(frame, { family, more, baseUrl, preview, form }) {
  const cover = coverImage(family);
  const others = family.images.filter((im) => im !== cover);
  const pageUrl = baseUrl + familyUrl(family);
  const badge = FAMILY_BADGE[family.status] || FAMILY_BADGE.adoptable;
  const description = excerpt(family.story, 200) || family.subtitle || family.name;
  const back = family.status === 'adopted' ? familyListUrl('adopted', 1) : '/csaladok';
  const banner = preview
    ? '<div class="bg-amber-100 text-amber-900 text-sm font-semibold text-center px-6 py-3 rounded-xl mb-8">Előnézet: ez a család nem nyilvános, csak bejelentkezett adminisztrátor látja.</div>'
    : '';
  const alt = `${family.name}, akit az Alapítvány támogat`;
  const coverHtml = cover
    ? `<a href="${escapeHtml(cover.url)}" data-lightbox class="block mt-10 rounded-2xl overflow-hidden bg-navy-50"><img src="${escapeHtml(cover.url)}" alt="${escapeHtml(alt)}" class="w-full aspect-[4/3] object-cover hover:scale-[1.02] transition-transform duration-500"></a>`
    : '';
  const galleryHtml = others.length
    ? `<div class="gallery mt-3">${others.map((im) => `<a href="${escapeHtml(im.url)}" data-lightbox><img src="${escapeHtml(im.url)}" loading="lazy" alt="${escapeHtml(alt)}"></a>`).join('')}</div>`
    : '';
  const moreHtml = more.length
    ? `
  <section class="bg-sand-50 py-20 md:py-28 px-6 lg:px-10 mt-20 md:mt-28">
    <div class="max-w-7xl mx-auto">
      <div class="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-12">
        <h2 class="font-display text-2xl md:text-4xl font-medium text-navy-800">Ők is segítségre várnak</h2>
        <a href="/csaladok" class="inline-flex items-center gap-2 border border-navy-800 text-navy-800 hover:bg-navy-800 hover:text-white font-semibold px-6 py-3 rounded-full transition-colors self-start md:self-auto">Összes örökbefogadható család →</a>
      </div>
      <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-8 md:gap-10">
${more.map(familyCard).join('\n')}
      </div>
    </div>
  </section>`
    : '<div class="pb-24 md:pb-32"></div>';
  const main = `
<main class="pt-32 md:pt-40">
  <article class="px-6 lg:px-10">
    <div class="max-w-7xl mx-auto">
      ${banner}
      <a href="${back}" class="inline-flex items-center gap-1 text-sm font-semibold text-navy-500 hover:text-navy-800">← Vissza a családokhoz</a>
      <div class="grid lg:grid-cols-12 gap-10 lg:gap-16 mt-8 items-start">
        <div class="lg:col-span-7">
          <span class="inline-block ${badge.className} text-xs font-semibold px-3 py-1.5 rounded-full">${badge.label}</span>
          <h1 class="font-display text-3xl md:text-5xl font-medium text-navy-800 leading-tight mt-4">${escapeHtml(family.name)}</h1>
          ${family.subtitle ? `<p class="mt-3 text-lg md:text-xl text-navy-500">${escapeHtml(family.subtitle)}</p>` : ''}
          ${family.status === 'adoptable' ? '<a href="#jelentkezes" class="lg:hidden btn-primary mt-6 inline-flex items-center gap-2 bg-sand-500 hover:bg-sand-600 text-navy-900 font-semibold px-6 py-3 rounded-full">Segíteni szeretnék</a>' : ''}
          ${coverHtml}
          ${galleryHtml}
          <div class="blog-content mt-10">${family.story}</div>
        </div>
        <div class="lg:col-span-5">${statusBox(family)}${applicationForm(frame, family, form)}${shareBox(frame, pageUrl, { donate: family.status === 'adoptable' })}
        </div>
      </div>
    </div>
  </article>
  ${moreHtml}
</main>`;
  return layout(frame, {
    title: `${family.name} — Egy Lépéssel Több Alapítvány`,
    description,
    canonical: pageUrl,
    image: cover ? (cover.url.startsWith('/') ? baseUrl + cover.url : cover.url) : '',
    type: 'article',
    main,
    // Hibás beküldés után az űrlaphoz görgetünk, hogy a hibaüzenetek rögtön látsszanak.
    extra: (cover ? GALLERY_LIGHTBOX : '')
      + (form.errors && Object.keys(form.errors).length || form.error
        ? "<script>document.getElementById('jelentkezes').scrollIntoView();</script>" : ''),
  });
}

export function renderNotFound(frame) {
  const main = `
<main class="pt-40 pb-32 px-6 lg:px-10">
  <div class="max-w-3xl mx-auto text-center">
    <p class="text-sand-700 tracking-[0.3em] text-xs md:text-sm font-semibold uppercase mb-4">404</p>
    <h1 class="font-display text-3xl md:text-5xl font-medium text-navy-800 leading-tight">Ez az oldal nem található</h1>
    <p class="mt-6 text-navy-600">Lehet, hogy elköltözött, vagy elírás történt a címben.</p>
    <div class="flex flex-wrap justify-center gap-4 mt-10">
      <a href="/" class="bg-sand-500 hover:bg-sand-600 text-navy-900 font-semibold px-8 py-4 rounded-full">Vissza a főoldalra</a>
      <a href="/blog" class="border border-navy-800 text-navy-800 hover:bg-navy-800 hover:text-white font-semibold px-8 py-4 rounded-full transition-colors">Blog</a>
    </div>
  </div>
</main>`;
  return layout(frame, { title: 'Az oldal nem található — Egy Lépéssel Több Alapítvány', description: 'Az oldal nem található.', main });
}
