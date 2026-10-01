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

export function siteFrame(indexHtml) {
  return {
    head: absolutize(indexHtml.slice(indexHtml.indexOf('<head>') + '<head>'.length, indexHtml.indexOf('</head>'))),
    header: absolutize(between(indexHtml, 'site:header')),
    footer: absolutize(between(indexHtml, 'site:footer')),
    script: between(indexHtml, 'site:script'),
    // A lábléc e-mail címe: a családok aloldalán a „Segíteni szeretnék” gomb erre ír.
    email: (between(indexHtml, 'site:footer').match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/) || [''])[0],
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

function helpBox(frame, family, pageUrl) {
  const share = `
      <div class="mt-6 pt-6 border-t border-white/15">
        <p class="text-sm text-white/70 mb-3">Oszd meg, hogy minél többen megismerjék a történetüket:</p>
        <div class="flex flex-wrap gap-2">
          <a href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(pageUrl)}" target="_blank" rel="noopener" class="inline-flex items-center gap-2 border border-white/30 hover:border-sand-400 hover:text-sand-400 text-sm font-semibold px-4 py-2 rounded-full transition-colors">Facebook</a>
          <button type="button" onclick="var b=this;navigator.clipboard&&navigator.clipboard.writeText(location.href).then(function(){b.textContent='Link másolva ✓'})" class="inline-flex items-center gap-2 border border-white/30 hover:border-sand-400 hover:text-sand-400 text-sm font-semibold px-4 py-2 rounded-full transition-colors">Link másolása</button>
        </div>
      </div>`;
  if (family.status === 'adoptable') {
    const contact = frame.email
      ? `mailto:${frame.email}?subject=${encodeURIComponent(`Örökbefogadás: ${family.name}`)}`
      : '#contact';
    return `
    <aside id="segits" class="bg-navy-800 text-white rounded-2xl p-8 lg:sticky lg:top-32 scroll-mt-32">
      <p class="text-sand-400 tracking-[0.2em] text-xs font-semibold uppercase mb-3">Fogadd örökbe a családot</p>
      <h2 class="font-display text-2xl font-semibold leading-snug">Légy te is a történetük része</h2>
      <p class="mt-4 text-white/75 leading-relaxed">Fogadd örökbe a családot, és válj havonta a történetük részévé. Írj nekünk, és elmondjuk a részleteket.</p>
      <div class="flex flex-col gap-3 mt-7">
        <a href="${escapeHtml(contact)}" class="btn-primary inline-flex justify-center items-center gap-2 bg-sand-500 hover:bg-sand-600 text-navy-900 font-semibold px-6 py-3.5 rounded-full">Segíteni szeretnék</a>
        <a href="#contact" class="inline-flex justify-center items-center gap-2 border border-white/40 hover:border-sand-400 hover:text-sand-400 font-semibold px-6 py-3.5 rounded-full transition-colors">Egyszeri adomány</a>
      </div>
      ${frame.email ? `<p class="mt-5 text-sm text-white/60">Kérdésed van? Írj nekünk: <a href="mailto:${escapeHtml(frame.email)}" class="text-white underline underline-offset-2">${escapeHtml(frame.email)}</a></p>` : ''}
      ${share}
    </aside>`;
  }
  if (family.status === 'adopted') {
    return `
    <aside id="segits" class="bg-navy-800 text-white rounded-2xl p-8 lg:sticky lg:top-32 scroll-mt-32">
      <p class="text-sand-400 tracking-[0.2em] text-xs font-semibold uppercase mb-3">Örökbefogadott család</p>
      <h2 class="font-display text-2xl font-semibold leading-snug">Ez a család már megtalálta a támogatóit</h2>
      <p class="mt-4 text-white/75 leading-relaxed">Köszönjük mindenkinek, aki segített! Más családok még várják, hogy valaki egy lépéssel többet tegyen értük.</p>
      <a href="/csaladok" class="btn-primary mt-7 inline-flex justify-center items-center gap-2 bg-sand-500 hover:bg-sand-600 text-navy-900 font-semibold px-6 py-3.5 rounded-full w-full">Örökbefogadható családok →</a>
      ${share}
    </aside>`;
  }
  return `
    <aside id="segits" class="bg-navy-50 border border-navy-100 rounded-2xl p-8 lg:sticky lg:top-32">
      <p class="text-navy-500 tracking-[0.2em] text-xs font-semibold uppercase mb-3">${FAMILY_BADGE[family.status].label}</p>
      <p class="text-navy-700 leading-relaxed">Ez a család most nem jelenik meg a weboldalon. Az adminban „Örökbefogadható” vagy „Örökbefogadott” státuszra állítva lesz nyilvános.</p>
    </aside>`;
}

export function renderFamilyPage(frame, { family, more, baseUrl, preview }) {
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
          ${family.status === 'adoptable' ? '<a href="#segits" class="lg:hidden btn-primary mt-6 inline-flex items-center gap-2 bg-sand-500 hover:bg-sand-600 text-navy-900 font-semibold px-6 py-3 rounded-full">Segíteni szeretnék</a>' : ''}
          ${coverHtml}
          ${galleryHtml}
          <div class="blog-content mt-10">${family.story}</div>
        </div>
        <div class="lg:col-span-5">${helpBox(frame, family, pageUrl)}
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
    extra: cover ? GALLERY_LIGHTBOX : '',
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
