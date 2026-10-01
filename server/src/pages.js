// Az aloldalak (blog, családok, tartalmi oldalak). A keretet (head, fejléc, lábléc, szkript) a főoldalból veszik át,
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
  .blog-content > :first-child { margin-top: 0; }
  .blog-content a { color: #a68c5c; text-decoration: underline; text-underline-offset: 3px; }
  .blog-content a:hover { color: #7d6944; }
  .blog-content strong, .blog-content b { color: #263640; }
  .blog-content ul { list-style: disc; padding-left: 1.5em; }
  .blog-content ol { list-style: decimal; padding-left: 1.5em; }
  .blog-content li + li { margin-top: 0.4em; }
  .blog-content li::marker { color: #c3ac7e; }
  .blog-content blockquote { border-left: 3px solid #dac7a0; padding-left: 1.25em; font-style: italic; color: #4c6b7d; }
  .blog-content img { display: block; max-width: 100%; height: auto; border-radius: 1rem; margin: 2em auto; }
  .gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 0.5rem; }
  .blog-content .gallery { margin-top: 2em; }
  .gallery a { display: block; overflow: hidden; border-radius: 0.75rem; }
  .gallery img, .blog-content .gallery img { width: 100%; aspect-ratio: 1; object-fit: cover; margin: 0; border-radius: 0; transition: transform 0.4s ease; }
  .gallery a:hover img { transform: scale(1.04); }

  /* A fejléc alatti nagy kép bevezetője */
  .hero-lead > * + * { margin-top: 1rem; }
  .hero-lead a { color: #e2d3ab; text-decoration: underline; text-underline-offset: 3px; }
  .hero-lead a:hover { color: #fff; }

  /* Oldalak (pl. /alapitonk): a régi oldal elrendezési elemei a főoldal dizájnjával. */
  .page-content h2 { font-size: 2rem; font-weight: 500; line-height: 1.15; }
  @media (min-width: 768px) { .page-content h2 { font-size: 2.75rem; } }
  .page-content.has-lead > p:first-child { font-size: 1.25rem; line-height: 1.7; color: #263640; }
  .page-content .eyebrow { color: #a68c5c; font-size: 0.75rem; font-weight: 600; letter-spacing: 0.3em; text-transform: uppercase; }
  .page-content .eyebrow + * { margin-top: 0.5rem; }
  .page-content a.button { display: inline-flex; align-items: center; gap: 0.5rem; background: #dac7a0; color: #1a252d; font-weight: 600; padding: 0.9rem 2rem; border-radius: 9999px; text-decoration: none; transition: background-color 0.25s, transform 0.25s; }
  .page-content a.button:hover { background: #c3ac7e; color: #1a252d; transform: translateY(-2px); }

  /* Kártyák: mint a főoldal „Területeink” kártyái (fehér, homokszín felső csík). */
  .page-content .cards { display: grid; gap: 1.5rem; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); }
  .page-content .card { background: #fff; border: 1px solid transparent; border-top: 4px solid #dac7a0; border-radius: 1rem; padding: 1.75rem; font-size: 0.975rem; line-height: 1.7; color: #3d5568; }
  .band-white .page-content .card, .blog-content .card { background: #fdfbf7; border-color: #f0e4cb #f0e4cb #f0e4cb; border-top-color: #dac7a0; }
  .page-content .card > * + * { margin-top: 0.6rem; }
  .page-content .card h3 { margin-top: 0; font-size: 1.2rem; font-weight: 600; line-height: 1.35; }
  .page-content .card h3 + * { margin-top: 0.5rem; }
  .page-content .card img { margin: 0; }
  .page-content .card:has(.price) { display: flex; flex-direction: column; align-items: center; text-align: center; padding-top: 2.25rem; padding-bottom: 2rem; }
  .page-content .card:has(.price) h3 { font-family: 'Nunito', sans-serif; font-size: 0.75rem; font-weight: 700; letter-spacing: 0.25em; text-transform: uppercase; color: #a68c5c; }
  .page-content .card .price { font-family: 'Baloo 2', sans-serif; font-size: 2.4rem; font-weight: 600; line-height: 1.1; color: #263640; }
  .page-content .card:has(.price) > :last-child { margin-top: auto; padding-top: 1.5rem; }
  .page-content .card:has(> .num) { display: grid; grid-template-columns: auto minmax(0, 1fr); column-gap: 1.25rem; row-gap: 0.4rem; align-content: start; }
  .page-content .card:has(> .num) > * { grid-column: 2; margin: 0; }
  .page-content .card > .num { grid-column: 1; grid-row: 1 / span 6; font-family: 'Baloo 2', sans-serif; font-size: 2.75rem; font-weight: 700; line-height: 1; color: #c3ac7e; }

  /* Személyek (pl. nagykövetek): mint a főoldal nagykövet-kártyái. */
  .page-content .cards-people { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; }
  @media (min-width: 640px) { .page-content .cards-people { gap: 2rem; } }
  @media (min-width: 1024px) { .page-content .cards-people { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
  .page-content .cards-people .card { padding: 0; overflow: hidden; text-align: center; background: rgba(51, 71, 88, 0.6); border: 1px solid rgba(255, 255, 255, 0.1); }
  .band-white .page-content .cards-people .card { background: #263640; border-color: #263640; }
  .page-content .cards-people .card-media { position: relative; aspect-ratio: 4 / 5; overflow: hidden; }
  .page-content .cards-people .card-media a { display: block; height: 100%; }
  .page-content .cards-people .card img { width: 100%; height: 100%; object-fit: cover; object-position: top; border-radius: 0; filter: contrast(0.78) saturate(0.85) brightness(1.05); transition: transform 0.5s var(--ease-soft); }
  .page-content .cards-people .card:hover img { transform: scale(1.04); }
  .page-content .cards-people .card h3 { color: #fff; font-size: 18px; margin: 1.5rem 1.25rem 0.25rem; }
  .page-content .cards-people .card p { color: #dac7a0; font-size: 14px; line-height: 1.5; text-transform: uppercase; letter-spacing: 0.025em; margin: 0 1.25rem 1.5rem; }

  /* Partnerlogók: fehér csempék, szürkéből színesbe. */
  .page-content .logos { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); }
  @media (min-width: 768px) { .page-content .logos { gap: 1.5rem; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); } }
  .page-content .logos img { width: 100%; height: 120px; object-fit: contain; padding: 1.5rem; margin: 0; background: #fff; border: 1px solid #f0e4cb; border-radius: 1rem; filter: grayscale(1); opacity: 0.7; transition: filter 0.3s, opacity 0.3s, transform 0.3s, box-shadow 0.3s; }
  .page-content .logos img:hover { filter: none; opacity: 1; transform: translateY(-3px); box-shadow: 0 16px 30px -14px rgba(26, 37, 45, 0.25); }

  .page-content .gallery { margin-top: 0; gap: 0.75rem; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); }
  .page-content .gallery a { border-radius: 1rem; }
  .blog-content.page-content .gallery { margin-top: 2em; }

  .page-content .split { display: grid; gap: 2.5rem; align-items: start; }
  @media (min-width: 1024px) { .page-content .split { grid-template-columns: minmax(0, 5fr) minmax(0, 7fr); gap: 4rem; } }
  .page-content .split > div > * + * { margin-top: 1.1rem; }
  .page-content .split > div:first-child p { font-size: 1.125rem; line-height: 1.8; color: #3d5568; }
  .page-content .split .cards { grid-template-columns: 1fr; gap: 1rem; }

  .page-content .doc-list { list-style: none; padding-left: 0; }
  .page-content .doc-list li + li { margin-top: 0.5rem; }
  .page-content .doc-list a { display: inline-flex; align-items: center; gap: 0.6rem; color: #263640; text-decoration: none; font-weight: 600; }
  .page-content .doc-list a::before { content: 'PDF'; font-size: 0.65rem; font-weight: 700; letter-spacing: 0.05em; color: #fff; background: #a68c5c; border-radius: 0.35rem; padding: 0.2rem 0.4rem; }
  .page-content .doc-list a:hover { color: #a68c5c; }

  /* Évszámos felsorolás idővonalként */
  .page-content ol.timeline { list-style: none; padding: 0.25rem 0 0; margin-left: 0.4rem; border-left: 2px solid #f0e4cb; }
  .page-content ol.timeline > li { position: relative; display: grid; grid-template-columns: 4.25rem minmax(0, 1fr); gap: 0.75rem; padding: 0 0 1.1rem 1.6rem; margin: 0; }
  .page-content ol.timeline > li::before { content: ''; position: absolute; left: -7px; top: 0.6rem; width: 12px; height: 12px; border-radius: 9999px; background: #dac7a0; box-shadow: 0 0 0 4px #fff; }
  .band-sand .page-content ol.timeline > li::before { box-shadow: 0 0 0 4px #fdfbf7; }
  .page-content ol.timeline > li > .year { font-family: 'Baloo 2', sans-serif; font-size: 1.25rem; font-weight: 700; line-height: 1.6; color: #a68c5c; }
  .page-content ol.timeline ul { margin-top: 0.25rem; }
  .page-content ol.timeline ul li + li { margin-top: 0.5rem; }

  /* „Címke: érték” sorok (adószám, bankszámla…) adatlapként */
  .page-content dl.facts { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); }
  .page-content .fact { background: #fdfbf7; border: 1px solid #f0e4cb; border-top: 4px solid #dac7a0; border-radius: 1rem; padding: 1.1rem 1.4rem; }
  .band-sand .page-content .fact { background: #fff; }
  .page-content .fact dt { font-size: 0.7rem; font-weight: 700; letter-spacing: 0.2em; text-transform: uppercase; color: #a68c5c; }
  .page-content .fact dd { margin-top: 0.3rem; color: #263640; font-weight: 600; line-height: 1.55; overflow-wrap: anywhere; }
  .page-content .fact dd a { color: inherit; }
  .page-content .card dl.facts { grid-template-columns: 1fr; gap: 0; }
  .page-content .card .fact { background: none; border: 0; border-top: 1px solid #f0e4cb; border-radius: 0; padding: 0.7rem 0; }

  /* Keretezett kép + szöveg (pl. alapító, kuratórium): mint a főoldal „Alapítónk” szekciója. */
  .media-body > * + * { margin-top: 1.1rem; }
  .media-body h2 { font-family: 'Baloo 2', sans-serif; font-size: 1.875rem; font-weight: 500; line-height: 1.15; color: #263640; }
  @media (min-width: 768px) { .media-body h2 { font-size: 3rem; } }
  .media-body h2 + h3 { font-family: 'Nunito', sans-serif; font-size: 0.8rem; font-weight: 700; letter-spacing: 0.25em; text-transform: uppercase; color: #a68c5c; margin-top: 0.9rem; }
  .media-body p { font-size: 1.075rem; line-height: 1.85; color: #3d5568; }
  @media (min-width: 768px) { .media-body p { font-size: 1.125rem; } }
  .media-body h2 + h3 + p { font-family: 'Baloo 2', sans-serif; font-size: 1.4rem; font-style: italic; line-height: 1.5; color: #263640; border-left: 3px solid #dac7a0; padding-left: 1.25rem; margin-top: 1.75rem; }
  .media-body a { color: #a68c5c; text-decoration: underline; text-underline-offset: 3px; }
  .media-body h3:has(a) { margin-top: 2rem; font-size: 1rem; }
  .media-body h3 a { font-family: 'Nunito', sans-serif; font-weight: 700; color: #263640; text-decoration: none; border-bottom: 2px solid #dac7a0; padding-bottom: 2px; transition: color 0.2s; }
  .media-body h3 a::after { content: ' →'; }
  .media-body h3 a:hover { color: #a68c5c; }
`;

// Galéria-nagyító (bejegyzés, család, oldalak): a bélyegképekre kattintva a nagy kép jelenik meg (lapozható).
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
  var links = Array.prototype.slice.call(document.querySelectorAll('.gallery a, a[data-lightbox]'))
    .filter(function (a) { return /\.(webp|jpe?g|png|gif)$/i.test(a.getAttribute('href') || ''); });
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
<main>
${main}
</main>
${frame.footer}
${frame.script}
${extra}
</body>
</html>
`;
}

// --- Közös elemek: a főoldal dizájnjának építőkockái ---------------------------

const BRAND = 'Egy Lépéssel Több Alapítvány';

// Az aloldalak fejlécképei (a főoldal képei közül) és a kép kivágása.
const HERO_IMAGES = {
  about: ['/assets/img/about.webp', 'object-[center_28%]'],
  swing: ['/assets/img/hero.webp', 'object-[center_62%]'],
  therapy: ['/assets/img/why-important.webp', 'object-[center_30%]'],
  flute: ['/assets/img/editorial-big.webp', 'object-[center_30%]'],
};

const BTN_PRIMARY = 'btn-primary inline-flex items-center gap-2 bg-sand-500 hover:bg-sand-600 text-navy-900 font-semibold px-8 py-4 rounded-full';
const BTN_GHOST = 'inline-flex items-center gap-2 border border-white/40 hover:border-sand-400 hover:text-sand-400 text-white px-8 py-4 rounded-full transition-colors';
const BTN_OUTLINE = 'reveal inline-flex items-center gap-2 border border-navy-800 text-navy-800 hover:bg-navy-800 hover:text-white font-semibold px-6 py-3 rounded-full transition-colors self-start md:self-auto whitespace-nowrap';
const EYEBROW = 'block tracking-[0.3em] text-xs md:text-sm font-semibold uppercase';

function previewBanner(text) {
  return `<div class="bg-amber-100 text-amber-900 text-sm font-semibold text-center px-6 py-3 rounded-xl mb-8">${text}</div>`;
}

// Morzsamenü a fejlécképen: Főoldal / … / az aktuális oldal.
function crumbsHtml(crumbs) {
  const items = [{ label: 'Főoldal', href: '/' }, ...crumbs];
  const li = (c, i) => {
    const label = escapeHtml(c.label);
    const node = i === items.length - 1
      ? `<span aria-current="page" class="text-white/90">${label}</span>`
      : c.href ? `<a href="${escapeHtml(c.href)}" class="hover:text-sand-400 transition-colors">${label}</a>` : `<span>${label}</span>`;
    return `<li class="flex items-center gap-2">${i ? '<span aria-hidden="true" class="text-white/30">/</span>' : ''}${node}</li>`;
  };
  return `<nav aria-label="Morzsamenü" class="reveal text-sm text-white/60 mb-8"><ol class="flex flex-wrap items-center gap-x-2 gap-y-1">${items.map(li).join('')}</ol></nav>`;
}

// Az aloldalak nyitó képe a főoldal hőse mintájára: teljes szélességű kép, sötét átmenet, bal alsó szöveg.
function pageHero({ eyebrow, title, lead = '', image = HERO_IMAGES.swing, crumbs = null, actions = '', below = '', banner = '', tall = false }) {
  const [src, position] = image;
  return `
<section class="relative overflow-hidden bg-navy-900">
  <div class="absolute inset-0" aria-hidden="true">
    <img src="${escapeHtml(src)}" alt="" class="hero-slide active absolute inset-0 w-full h-full object-cover ${position}">
  </div>
  <div class="absolute inset-0 bg-gradient-to-t from-navy-900 via-navy-900/75 to-navy-900/45"></div>
  <div class="relative z-10 px-6 lg:px-10 pt-36 md:pt-44 pb-16 md:pb-24 flex flex-col justify-end ${tall ? 'min-h-[88vh]' : 'min-h-[480px] md:min-h-[600px]'}">
    <div class="max-w-7xl mx-auto w-full">
      ${banner}
      ${crumbs ? crumbsHtml(crumbs) : ''}
      <span class="reveal ${EYEBROW} text-sand-400 mb-5">${eyebrow}</span>
      <h1 class="reveal font-display text-white text-4xl sm:text-5xl md:text-6xl font-medium leading-[1.05] max-w-4xl">${escapeHtml(title)}</h1>
      ${lead ? `<div class="reveal hero-lead text-white/85 text-lg md:text-xl max-w-2xl mt-6 leading-relaxed">${lead}</div>` : ''}
      ${actions ? `<div class="reveal flex flex-wrap gap-4 mt-10">${actions}</div>` : ''}
      ${below}
    </div>
  </div>
</section>`;
}

// Család és bejegyzés: sötét sáv, balra a szöveg, jobbra a keretezett fotó (mint a főoldal „Alapítónk” szekciója).
function splitHero({ eyebrow, title, lead = '', crumbs, actions = '', banner = '', image, alt = '' }) {
  return `
<section class="relative overflow-hidden bg-navy-800 px-6 lg:px-10 pt-32 md:pt-40 pb-20 md:pb-28">
  <div class="max-w-7xl mx-auto">
    ${banner}
    <div class="grid lg:grid-cols-12 gap-12 lg:gap-16 items-center">
      <div class="lg:col-span-7">
        ${crumbsHtml(crumbs)}
        <div class="reveal mb-5">${eyebrow}</div>
        <h1 class="reveal font-display text-white text-4xl sm:text-5xl md:text-6xl font-medium leading-[1.05]">${escapeHtml(title)}</h1>
        ${lead ? `<p class="reveal text-white/80 text-lg md:text-xl max-w-2xl mt-6 leading-relaxed">${lead}</p>` : ''}
        ${actions ? `<div class="reveal flex flex-wrap gap-4 mt-10">${actions}</div>` : ''}
      </div>
      <div class="lg:col-span-5 relative reveal">
        <div class="absolute -inset-4 border border-sand-500/40 rounded-2xl hidden md:block"></div>
        <a href="${escapeHtml(image)}" data-lightbox class="relative block rounded-2xl overflow-hidden shadow-2xl group">
          <img src="${escapeHtml(image)}" alt="${escapeHtml(alt)}" class="w-full aspect-[4/3] object-cover group-hover:scale-[1.03] transition-transform duration-700">
        </a>
      </div>
    </div>
  </div>
</section>`;
}

const BAND_BG = { white: 'bg-white', sand: 'bg-sand-50', dark: 'bg-navy-800' };

function band(bg, inner, id = '') {
  return `
<section${id ? ` id="${id}"` : ''} class="band band-${bg} ${BAND_BG[bg]} py-20 md:py-32 px-6 lg:px-10${id ? ' scroll-mt-20' : ''}">
  <div class="max-w-7xl mx-auto">${inner}
  </div>
</section>`;
}

// Szekciófej, mint a főoldalon: felirat + nagy cím, jobbra gomb vagy rövid bevezető.
function sectionHead({ eyebrow = '', title, aside = '', lead = '', dark = false }) {
  const titleHtml = `
        ${eyebrow ? `<span class="reveal ${EYEBROW} ${dark ? 'text-sand-400' : 'text-sand-700'} mb-4">${eyebrow}</span>` : ''}
        <h2 class="reveal font-display text-3xl md:text-5xl font-medium ${dark ? 'text-white' : 'text-navy-800'} max-w-2xl leading-tight">${title}</h2>`;
  if (lead) {
    return `
    <div class="mb-14 md:mb-16 grid md:grid-cols-2 gap-8 md:gap-10 items-end">
      <div>${titleHtml}</div>
      <div class="reveal space-y-4 leading-relaxed ${dark ? 'text-white/75' : 'text-navy-600'} md:text-right">${lead}</div>
    </div>`;
  }
  return `
    <div class="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-14 md:mb-16">
      <div>${titleHtml}</div>
      ${aside}
    </div>`;
}

const outlineButton = (href, label) => `<a href="${href}" class="${BTN_OUTLINE}">${label}</a>`;

// --- Oldaltartalom szekciókra bontása -----------------------------------------
// A tartalom a régi oldalról átvett, megtisztított HTML: <section> blokkok, bennük bekezdések,
// kártyák (.cards), logók (.logos), kép + szöveg (.media), galéria stb. Ebből építjük a sávokat.

const VOID_TAGS = new Set(['img', 'br', 'hr', 'input', 'source', 'wbr']);

// A (megtisztított, jól formált) HTML legfelső szintű elemei.
function topBlocks(html) {
  const blocks = [];
  const tagRe = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b[^>]*?(\/?)>/g;
  let depth = 0;
  let start = 0;
  let last = 0;
  let m;
  const pushText = (to) => {
    const text = html.slice(last, to);
    if (text.trim()) blocks.push({ tag: '#text', cls: '', html: text });
  };
  while ((m = tagRe.exec(html))) {
    const [, closing, rawName, selfClosing] = m;
    const name = rawName.toLowerCase();
    const isVoid = VOID_TAGS.has(name) || selfClosing === '/';
    if (closing) {
      depth -= 1;
      if (depth === 0) {
        blocks.push(makeBlock(html.slice(start, tagRe.lastIndex)));
        last = tagRe.lastIndex;
      }
    } else if (depth === 0) {
      pushText(m.index);
      if (isVoid) {
        blocks.push(makeBlock(m[0]));
        last = tagRe.lastIndex;
      } else {
        start = m.index;
        depth = 1;
      }
    } else if (!isVoid) {
      depth += 1;
    }
  }
  pushText(html.length);
  return blocks;
}

function makeBlock(html) {
  const open = html.match(/^<([a-zA-Z0-9]+)\b([^>]*)>/);
  return { tag: open[1].toLowerCase(), cls: ((open[2] || '').match(/class="([^"]*)"/) || [])[1] || '', html };
}

const innerOf = (block) => block.html.replace(/^<[^>]+>/, '').replace(/<\/[a-zA-Z0-9]+>$/, '');
const textOf = (html) => excerpt(html, Number.MAX_SAFE_INTEGER);
const joinBlocks = (blocks) => blocks.map((b) => b.html).join('');

// Csupa nagybetűs címek („KIEMELT PARTNEREINK”) mondatkezdő írásmóddal.
function calmHeadings(html) {
  return html.replace(/<(h2|h3)>([^<]+)<\/\1>/g, (all, tag, text) => {
    const shouting = /\p{Lu}{3}/u.test(text) && text === text.toLocaleUpperCase('hu');
    return shouting ? `<${tag}>${text.charAt(0)}${text.slice(1).toLocaleLowerCase('hu')}</${tag}>` : all;
  });
}

// Egy bekezdés „Címke: érték” sora (pl. <b>Adószám:</b> 19353825-1-41 vagy <strong>2018</strong>: …).
function labelLine(line) {
  const s = line.replace(/<(b|strong)>\s*<\/\1>/g, '').replace(/(<br\s*\/?>\s*)+$/, '').trim();
  const m = s.match(/^<(b|strong)>([^<]*?)<\/\1>([\s\S]*)$/);
  if (!m) return null;
  let label = m[2].trim();
  let value = m[3].trim();
  if (label.endsWith(':')) label = label.slice(0, -1).trim();
  else if (value.startsWith(':')) value = value.slice(1).trim();
  else if (!value && label.includes(':')) [label, value] = [label.slice(0, label.indexOf(':')).trim(), label.slice(label.indexOf(':') + 1).trim()];
  else return null;
  value = value.replace(/^(<br\s*\/?>\s*)+/, '');
  const year = /^\d{4}$/.test(label);
  if (!label || label.length > 40 || (!value && !year)) return null;
  return { label, value, year };
}

// Egy bekezdés besorolása: évszámos sor, adatsor, alcím, alcím + szöveg vagy sima bekezdés.
function paragraphUnit(html, rawInner) {
  const inner = rawInner.replace(/<(b|strong)>\s*<\/\1>/g, '').trim();
  const parsed = inner.split(/<br\s*\/?>\s*(?=<(?:b|strong)>)/).map(labelLine);
  if (parsed.every(Boolean)) {
    if (parsed.every((x) => x.year)) return { type: 'year', items: parsed, html };
    if (parsed.every((x) => !x.year)) return { type: 'fact', items: parsed, html };
  }
  const sub = inner.match(/^<(b|strong)>([^<]{2,90}?)\s*<\/\1>$/);
  if (sub) return { type: 'sub', html: `<h3>${sub[2].replace(/:$/, '')}</h3>` };
  const headed = inner.match(/^<(b|strong)>([^<]{2,120}?)\s*((?:<br\s*\/?>\s*)*)<\/\1>\s*((?:<br\s*\/?>\s*)*)([\s\S]+)$/);
  if (headed && (headed[3] || headed[4])) return { type: 'sub', html: `<h3>${headed[2].replace(/:$/, '')}</h3><p>${headed[5]}</p>` };
  return { type: 'other', html };
}

// Egymás utáni bekezdések: évszámos sorokból idővonal, adatsorokból adatlap, félkövér sorokból alcím.
function enhanceParagraphs(run) {
  const trailingList = run.match(/<ul>[\s\S]*?<\/ul>$/);
  const ps = [...run.slice(0, trailingList ? trailingList.index : run.length).matchAll(/<p>([\s\S]*?)<\/p>/g)];
  const units = ps.map((m) => paragraphUnit(m[0], m[1]));
  let list = trailingList ? trailingList[0] : '';
  let out = '';
  for (let i = 0; i < units.length;) {
    let j = i;
    while (j < units.length && units[j].type === units[i].type) j += 1;
    const group = units.slice(i, j);
    const items = group.flatMap((u) => u.items || []);
    const type = units[i].type;
    if (type === 'year' && items.length >= 2) {
      const lastItem = items[items.length - 1];
      if (j === units.length && list && !lastItem.value) {
        lastItem.value = list;
        list = '';
      }
      out += `<ol class="timeline">${items.map((x) => `<li><span class="year">${x.label}</span><div>${x.value}</div></li>`).join('')}</ol>`;
    } else if (type === 'fact' && items.length >= 3) {
      out += `<dl class="facts">${items.map((x) => `<div class="fact"><dt>${x.label}</dt><dd>${x.value}</dd></div>`).join('')}</dl>`;
    } else {
      out += group.map((u) => u.html).join('');
    }
    i = j;
  }
  return out + list;
}

function enhance(html) {
  return calmHeadings(html.replace(/(?:<p>(?:(?!<\/p>)[\s\S])*<\/p>\s*)+(?:<ul>[\s\S]*?<\/ul>)?/g, enhanceParagraphs));
}

// Az „Egy lépéssel több alapítvány” felirat minden régi szekció fölött ott volt; a fejléckép már mutatja.
const GENERIC_EYEBROW = /<p class="eyebrow">\s*egy lépéssel több( hajós istván)? alapítvány\s*<\/p>/gi;

function kindOf(blocks) {
  if (!blocks.length) return 'empty';
  if (blocks.length === 1 && blocks[0].tag === 'div') {
    const { cls, html } = blocks[0];
    if (cls === 'cards') return html.includes('<img ') ? 'people' : 'cards';
    if (['logos', 'media', 'split', 'gallery'].includes(cls)) return cls;
  }
  return blocks.every((b) => b.tag === 'p' && !b.cls) ? 'para' : 'text';
}

// A tartalom szekciói: { header: {eyebrow, title} | null, lead, blocks, kind }.
function parseSections(content) {
  const parts = [...content.matchAll(/<section>([\s\S]*?)<\/section>/g)].map((m) => m[1]);
  return (parts.length ? parts : [content]).map((inner) => {
    let blocks = topBlocks(enhance(inner.replace(GENERIC_EYEBROW, '')));
    let header = null;
    const at = blocks[0]?.tag === 'p' && blocks[0].cls === 'eyebrow' && blocks[1]?.tag === 'h2' ? 1 : blocks[0]?.tag === 'h2' ? 0 : -1;
    if (at >= 0) {
      header = { eyebrow: at ? innerOf(blocks[0]) : '', title: innerOf(blocks[at]) };
      blocks = blocks.slice(at + 1);
    }
    return { header, lead: '', blocks, kind: kindOf(blocks) };
  }).filter((s) => s.header || s.blocks.length);
}

// Rövid, csak bekezdésekből álló nyitó szekció: a fejlécképre kerül bevezetőként.
function takeIntro(sections) {
  const first = sections[0];
  if (!first) return '';
  if (!first.header && first.kind === 'para' && first.blocks.length <= 2 && textOf(joinBlocks(first.blocks)).length <= 520) {
    sections.shift();
    return joinBlocks(first.blocks);
  }
  if (first.header && first.kind === 'empty') {
    sections.shift();
    return `<p>${first.header.title}</p>`;
  }
  return '';
}

// A cím + rövid bevezető szekció a következő (kártyás, logós, galériás) szekció fejléce lesz.
function mergeHeadings(sections) {
  for (let i = 0; i < sections.length - 1; i += 1) {
    const s = sections[i];
    const next = sections[i + 1];
    const short = (s.kind === 'para' || s.kind === 'empty') && textOf(joinBlocks(s.blocks)).length <= 700;
    if (s.header && short && !next.header && ['cards', 'people', 'logos', 'gallery'].includes(next.kind)) {
      next.header = s.header;
      next.lead = joinBlocks(s.blocks);
      sections.splice(i, 1);
      i -= 1;
    }
  }
  return sections;
}

// Sávszínek: a kártyák homokszínen, a szöveg fehéren, a személyek sötétkéken; két egyforma világos sáv nem kerül egymás mellé.
const PREFERRED_BG = { people: 'dark', cards: 'sand', logos: 'sand', split: 'sand' };

function nextBackground(kind, prev) {
  let bg = PREFERRED_BG[kind] || 'white';
  if (bg === 'dark' && prev === 'hero') bg = 'white';
  if (bg !== 'dark' && bg === prev) bg = bg === 'white' ? 'sand' : 'white';
  return bg;
}

function headerTitle(header, size = 'text-3xl md:text-5xl') {
  return `
        ${header.eyebrow ? `<span class="reveal ${EYEBROW} text-sand-700 mb-4">${header.eyebrow}</span>` : ''}
        <h2 class="reveal font-display ${size} font-medium text-navy-800 leading-tight">${header.title}</h2>`;
}

function mediaBlock(html, flip) {
  const m = html.match(/^<div class="media"><div class="media-img">([\s\S]*?)<\/div><div class="media-body">([\s\S]*)<\/div><\/div>$/);
  if (!m) return `<div class="blog-content page-content max-w-3xl">${html}</div>`;
  const img = m[1].replace(/<img /, '<img loading="lazy" class="relative w-full aspect-[4/5] object-cover rounded-2xl shadow-2xl" ');
  return `
    <div class="grid lg:grid-cols-12 gap-12 lg:gap-20 items-center">
      <div class="lg:col-span-5 relative reveal w-full max-w-md mx-auto lg:max-w-none${flip ? ' lg:order-last' : ''}">
        <div class="absolute -inset-4 border border-sand-500/40 rounded-2xl hidden md:block"></div>
        ${img}
      </div>
      <div class="lg:col-span-7 media-body page-content reveal">${m[2]}</div>
    </div>`;
}

function peopleCards(html) {
  return html
    .replace('<div class="cards">', '<div class="cards cards-people">')
    .replace(/<img /g, '<img loading="lazy" ')
    .replace(/<div class="card">((?:<a [^>]*>)?<img [^>]*>(?:<\/a>)?)/g,
      '<div class="card reveal lift-card"><div class="card-media">$1<span class="ambassador-accent"></span></div>');
}

const liftCards = (html) => html.replace(/<div class="card">/g, '<div class="card reveal lift-card">');

// Szekció egy hasábba (űrlap melletti oszlophoz).
function columnHtml(sec) {
  const body = joinBlocks(sec.blocks);
  return `${sec.header ? `<div class="mb-8">${headerTitle(sec.header, 'text-3xl md:text-4xl')}</div>` : ''}${body ? `<div class="blog-content page-content${sec.blocks[0]?.tag === 'p' && !sec.header ? ' has-lead' : ''}">${sec.kind === 'cards' ? liftCards(body) : body}</div>` : ''}`;
}

function renderSection(sec, bg, mediaIndex) {
  const dark = bg === 'dark';
  const body = joinBlocks(sec.blocks);
  const head = sec.header ? sectionHead({ ...sec.header, lead: sec.lead, dark }) : '';
  switch (sec.kind) {
    case 'media':
      return band(bg, `${head}${mediaBlock(body, mediaIndex % 2 === 1)}`);
    case 'people':
      return band(bg, `${head}<div class="page-content">${peopleCards(body)}</div>`);
    case 'cards':
    case 'logos':
    case 'gallery':
    case 'split':
      return band(bg, `${head}<div class="page-content">${liftCards(body)}</div>`);
    default:
      if (sec.header && body) {
        return band(bg, `
    <div class="grid lg:grid-cols-12 gap-10 lg:gap-16 items-start">
      <div class="lg:col-span-5 lg:sticky lg:top-32">${headerTitle(sec.header)}
      </div>
      <div class="lg:col-span-7 blog-content page-content">${liftCards(body)}</div>
    </div>`);
      }
      if (sec.header) return band(bg, head);
      return band(bg, `<div class="blog-content page-content max-w-3xl${sec.blocks[0].tag === 'p' ? ' has-lead' : ''}">${liftCards(body)}</div>`);
  }
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

// Szűrőgombok a sötét fejlécképen.
function heroChip(href, label, active, count = null) {
  return `<a href="${href}" class="px-4 py-2 rounded-full text-sm font-semibold transition-colors ${active
    ? 'bg-sand-500 text-navy-900'
    : 'border border-white/25 text-white/85 hover:border-sand-400 hover:text-sand-400'}"${active ? ' aria-current="page"' : ''}>${escapeHtml(label)}${count === null ? '' : ` <span class="${active ? 'text-navy-900/55' : 'text-white/50'}">${count}</span>`}</a>`;
}

export function renderBlogList(frame, { posts, page, pageCount, category, baseUrl }) {
  const heading = category ? categoryLabel(category) : 'Hírek, élmények és történetek az alapítvány életéből';
  const grid = posts.length
    ? `<div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-8 md:gap-10">\n${posts.map(postCard).join('\n')}\n    </div>`
    : '<p class="text-navy-600 text-lg">Ebben a kategóriában még nincs bejegyzés.</p>';
  const pager = pageCount > 1
    ? `
    <nav class="flex items-center justify-between mt-16 pt-8 border-t border-navy-100" aria-label="Lapozás">
      ${page > 1 ? `<a href="${listUrl(category, page - 1)}" class="${BTN_OUTLINE.replace('reveal ', '')}">← Újabb bejegyzések</a>` : '<span></span>'}
      <span class="text-sm text-navy-500">${page} / ${pageCount}</span>
      ${page < pageCount ? `<a href="${listUrl(category, page + 1)}" class="${BTN_OUTLINE.replace('reveal ', '')}">Régebbi bejegyzések →</a>` : '<span></span>'}
    </nav>`
    : '';
  // A fejléckép a lista első borítóképe (kategóriánként más), ha nincs, a főoldal egyik képe.
  const featured = posts.find((p) => p.coverImage);
  const main = pageHero({
    eyebrow: 'Blog',
    title: heading,
    image: featured ? [featured.coverImage, 'object-center'] : HERO_IMAGES.flute,
    crumbs: category ? [{ label: 'Blog', href: '/blog' }, { label: categoryLabel(category) }] : [{ label: 'Blog' }],
    below: `
      <nav class="reveal flex flex-wrap gap-2 mt-10" aria-label="Kategóriák">
        ${heroChip(listUrl('', 1), 'Összes', !category)}
        ${POST_CATEGORIES.map((c) => heroChip(listUrl(c.key, 1), c.label, c.key === category)).join('\n        ')}
      </nav>`,
  }) + band('white', `
    ${grid}${pager}`);
  const title = category ? `${categoryLabel(category)} — Blog — Egy Lépéssel Több Alapítvány` : 'Blog — Egy Lépéssel Több Alapítvány';
  return layout(frame, {
    title,
    description: 'Hírek, közös élmények, rendezvények és médiamegjelenések az Egy Lépéssel Több Alapítvány életéből.',
    canonical: baseUrl + listUrl(category, page),
    main,
  });
}

function shareButtons(pageUrl, tone = 'dark') {
  const cls = tone === 'dark'
    ? 'border border-white/30 hover:border-sand-400 hover:text-sand-400'
    : 'border border-navy-200 text-navy-800 hover:border-navy-800';
  return `
        <div class="flex flex-wrap gap-2">
          <a href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(pageUrl)}" target="_blank" rel="noopener" class="inline-flex items-center gap-2 ${cls} text-sm font-semibold px-4 py-2 rounded-full transition-colors">Facebook</a>
          <button type="button" onclick="var b=this;navigator.clipboard&&navigator.clipboard.writeText(location.href).then(function(){b.textContent='Link másolva ✓'})" class="inline-flex items-center gap-2 ${cls} text-sm font-semibold px-4 py-2 rounded-full transition-colors">Link másolása</button>
        </div>`;
}

export function renderBlogPost(frame, { post, related, baseUrl, preview }) {
  const description = post.excerpt || excerpt(post.content, 200);
  const pageUrl = `${baseUrl}/blog/${post.slug}`;
  const banner = preview ? previewBanner('Előnézet: ez a bejegyzés még nem nyilvános, csak bejelentkezett adminisztrátor látja.') : '';
  const label = escapeHtml(categoryLabel(post.category));
  const crumbs = [{ label: 'Blog', href: '/blog' }, { label: categoryLabel(post.category), href: listUrl(post.category, 1) }, { label: post.title }];
  const eyebrow = `<span class="${EYEBROW} text-sand-400"><a href="${listUrl(post.category, 1)}" class="hover:text-white transition-colors">${label}</a> · <time datetime="${post.publishedAt}">${formatDate(post.publishedAt)}</time></span>`;
  const hero = post.coverImage
    ? splitHero({ eyebrow, title: post.title, lead: post.excerpt ? escapeHtml(post.excerpt) : '', crumbs, banner, image: post.coverImage, alt: post.title })
    : pageHero({
      eyebrow: `${label} · <time datetime="${post.publishedAt}">${formatDate(post.publishedAt)}</time>`,
      title: post.title, lead: post.excerpt ? `<p>${escapeHtml(post.excerpt)}</p>` : '', image: HERO_IMAGES.flute, crumbs, banner,
    });
  const body = band('white', `
    <div class="grid lg:grid-cols-12 gap-12 lg:gap-16 items-start">
      <article class="lg:col-span-8">
        <div class="blog-content">${post.content}</div>
      </article>
      <aside class="lg:col-span-4 lg:sticky lg:top-32 space-y-6">
        <div class="bg-sand-50 border border-sand-200 border-t-4 border-t-sand-500 rounded-2xl p-7">
          <p class="${EYEBROW} text-sand-700 !text-xs">Megjelent</p>
          <p class="font-display text-xl font-semibold text-navy-800 mt-1"><time datetime="${post.publishedAt}">${formatDate(post.publishedAt)}</time></p>
          <p class="${EYEBROW} text-sand-700 !text-xs mt-5">Kategória</p>
          <a href="${listUrl(post.category, 1)}" class="inline-block font-display text-xl font-semibold text-navy-800 hover:text-sand-700 mt-1">${label}</a>
          <div class="mt-6 pt-6 border-t border-sand-200">
            <p class="text-sm text-navy-600 mb-3">Oszd meg másokkal is:</p>${shareButtons(pageUrl, 'light')}
          </div>
        </div>
        <a href="/blog" class="inline-flex items-center gap-1 text-sm font-semibold text-navy-500 hover:text-navy-800">← Vissza a bloghoz</a>
      </aside>
    </div>`);
  const more = related.length
    ? band('sand', `${sectionHead({ eyebrow: 'Blog', title: 'További bejegyzések', aside: outlineButton('/blog', 'Összes bejegyzés →') })}
    <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-8 md:gap-10">
${related.map(postCard).join('\n')}
    </div>`)
    : '';
  return layout(frame, {
    title: `${post.title} — Egy Lépéssel Több Alapítvány`,
    description,
    canonical: pageUrl,
    image: post.coverImage ? baseUrl + post.coverImage : '',
    type: 'article',
    main: hero + body + more,
    extra: post.coverImage || post.content.includes('class="gallery"') ? GALLERY_LIGHTBOX : '',
  });
}

// --- Családok ---------------------------------------------------------------

const LIST_PARAM = { adoptable: 'orokbefogadhato', adopted: 'orokbefogadott' };
const LIST_LABEL = { adoptable: 'Örökbefogadható családok', adopted: 'Örökbefogadott családok' };

function familyListUrl(status) {
  return LIST_PARAM[status] ? `/csaladok?statusz=${LIST_PARAM[status]}` : '/csaladok';
}

const LIST_TEXT = {
  all: ['Családjaink', 'Nem statisztika. Nem szám. Valódi családok, akiknek az élete változhat veled. Elöl azok, akik még támogatóra várnak.'],
  adoptable: ['Örökbefogadható családok', 'Nem statisztika. Nem szám. Egy valódi család, akinek az élete változhat veled. Válaszd ki, kinek a történetének szeretnél a része lenni.'],
  adopted: ['Örökbefogadott családjaink', 'Ők már megtalálták a támogatóikat. Köszönjük mindenkinek, aki egy lépéssel többet tett értük!'],
};

// Minden család egy oldalon, lapozás nélkül.
export function renderFamilyList(frame, { families, status, counts, baseUrl }) {
  const [heading, intro] = LIST_TEXT[status] || LIST_TEXT.all;
  const grid = `<div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-8 md:gap-10">\n${renderFamilyCards(families)}\n    </div>`;
  const main = pageHero({
    eyebrow: 'Fogadj örökbe egy családot',
    title: heading,
    lead: `<p>${intro}</p>`,
    image: HERO_IMAGES.swing,
    crumbs: status === 'all' ? [{ label: 'Családok' }] : [{ label: 'Családok', href: '/csaladok' }, { label: LIST_LABEL[status] }],
    below: `
      <nav class="reveal flex flex-wrap gap-2 mt-10" aria-label="Családok">
        ${heroChip(familyListUrl('all'), 'Mind', status === 'all', (counts.adoptable || 0) + (counts.adopted || 0))}
        ${heroChip(familyListUrl('adoptable'), 'Örökbefogadható', status === 'adoptable', counts.adoptable || 0)}
        ${heroChip(familyListUrl('adopted'), 'Örökbefogadott', status === 'adopted', counts.adopted || 0)}
      </nav>`,
  }) + band('white', `
    ${grid}`);
  return layout(frame, {
    title: `${heading} — Egy Lépéssel Több Alapítvány`,
    description: intro,
    canonical: baseUrl + familyListUrl(status),
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
        <p class="text-sm text-white/70 mb-3">Oszd meg, hogy minél többen megismerjék a történetüket:</p>${shareButtons(pageUrl)}
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
export function applicationForm(frame, { action, selectedId = 0 }, form) {
  if (form.submitted) {
    return `
    <section id="jelentkezes" class="scroll-mt-32 bg-white border border-navy-100 border-t-4 border-t-sand-500 rounded-2xl shadow-[0_24px_60px_-30px_rgba(26,37,45,0.35)] p-8 text-center" role="status">
      <div class="w-14 h-14 rounded-full bg-sand-100 text-sand-800 mx-auto flex items-center justify-center text-2xl font-bold">✓</div>
      <h2 class="font-display text-2xl font-semibold text-navy-800 mt-5">Köszönjük a jelentkezésedet!</h2>
      <p class="mt-3 text-navy-600 leading-relaxed">Hamarosan felvesszük veled a kapcsolatot a megadott elérhetőségeken.</p>
    </section>`;
  }
  const v = form.values || {};
  const e = form.errors || {};
  const selected = v.familyId || (form.options.some((o) => o.id === selectedId) ? selectedId : 0);
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
    <section id="jelentkezes" class="scroll-mt-32 bg-white border border-navy-100 border-t-4 border-t-sand-500 rounded-2xl shadow-[0_24px_60px_-30px_rgba(26,37,45,0.35)] p-6 md:p-8">
      <h2 class="font-display text-2xl md:text-3xl font-semibold text-navy-800">Jelentkezem támogatónak</h2>
      <p class="mt-2 text-sm text-navy-500">Fogadj örökbe egy családot, és válj havonta a történetük részévé. A <span class="text-red-600">*</span>-gal jelölt mezők kitöltése kötelező.</p>
      ${form.error ? `<p class="mt-5 text-sm text-red-800 bg-red-50 border border-red-200 rounded-xl px-4 py-3" role="alert">${escapeHtml(form.error)}</p>` : ''}
      ${Object.keys(e).length && !form.error ? '<p class="mt-5 text-sm text-red-800 bg-red-50 border border-red-200 rounded-xl px-4 py-3" role="alert">Kérjük, javítsd a megjelölt mezőket.</p>' : ''}
      <form method="post" action="${action}" class="mt-6 space-y-5">
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
  const banner = preview ? previewBanner('Előnézet: ez a család nem nyilvános, csak bejelentkezett adminisztrátor látja.') : '';
  const alt = `${family.name}, akit az Alapítvány támogat`;
  const crumbs = [
    LIST_LABEL[family.status] ? { label: LIST_LABEL[family.status], href: familyListUrl(family.status) } : { label: 'Családok', href: '/csaladok' },
    { label: family.name },
  ];
  // A sötét sávon az „Örökbefogadott” címke is világos legyen.
  const badgeClass = family.status === 'adopted' ? 'bg-white text-navy-800' : badge.className;
  const eyebrow = `<span class="inline-block ${badgeClass} text-xs font-semibold px-3 py-1.5 rounded-full">${badge.label}</span>`;
  const actions = family.status === 'adoptable'
    ? `<a href="#jelentkezes" class="${BTN_PRIMARY}">Segíteni szeretnék</a><a href="#tortenet" class="${BTN_GHOST}">Elolvasom a történetüket</a>`
    : `<a href="#tortenet" class="${BTN_GHOST}">Elolvasom a történetüket</a>`;
  const subtitle = family.subtitle ? escapeHtml(family.subtitle) : '';
  const hero = cover
    ? splitHero({ eyebrow, title: family.name, lead: subtitle, crumbs, actions, banner, image: cover.url, alt })
    : pageHero({ eyebrow: badge.label, title: family.name, lead: subtitle ? `<p>${subtitle}</p>` : '', image: HERO_IMAGES.swing, crumbs, actions, banner });
  const galleryHtml = others.length
    ? `
        <div class="mt-14">
          <span class="${EYEBROW} text-sand-700 mb-5">Képek a családról</span>
          <div class="gallery">${others.map((im) => `<a href="${escapeHtml(im.url)}" data-lightbox><img src="${escapeHtml(im.url)}" loading="lazy" alt="${escapeHtml(alt)}"></a>`).join('')}</div>
        </div>`
    : '';
  const body = band('white', `
    <div class="grid lg:grid-cols-12 gap-12 lg:gap-16 items-start">
      <div id="tortenet" class="lg:col-span-7 scroll-mt-28">
        <span class="reveal ${EYEBROW} text-sand-700 mb-4">A történetük</span>
        <h2 class="reveal font-display text-3xl md:text-4xl font-medium text-navy-800 leading-tight mb-8">${escapeHtml(family.name)}</h2>
        <div class="blog-content">${family.story}</div>${galleryHtml}
      </div>
      <div class="lg:col-span-5">${statusBox(family)}${applicationForm(frame, { action: `${familyUrl(family)}/jelentkezes`, selectedId: family.id }, form)}${shareBox(frame, pageUrl, { donate: family.status === 'adoptable' })}
      </div>
    </div>`);
  const moreHtml = more.length
    ? band('sand', `${sectionHead({ eyebrow: 'Fogadj örökbe egy családot', title: 'Ők is segítségre várnak', aside: outlineButton('/csaladok?statusz=orokbefogadhato', 'Összes örökbefogadható család →') })}
    <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-8 md:gap-10">
${more.map(familyCard).join('\n')}
    </div>`)
    : '';
  return layout(frame, {
    title: `${family.name} — Egy Lépéssel Több Alapítvány`,
    description,
    canonical: pageUrl,
    image: cover ? (cover.url.startsWith('/') ? baseUrl + cover.url : cover.url) : '',
    type: 'article',
    main: hero + body + moreHtml,
    // Hibás beküldés után az űrlaphoz görgetünk, hogy a hibaüzenetek rögtön látsszanak.
    extra: (cover ? GALLERY_LIGHTBOX : '')
      + (form.errors && Object.keys(form.errors).length || form.error
        ? "<script>document.getElementById('jelentkezes').scrollIntoView();</script>" : ''),
  });
}

// --- Oldalak ------------------------------------------------------------------

// Oldalanként a fejléckép felirata (a menü csoportja) és képe.
const PAGE_LOOK = {
  alapitonk: ['Alapítvány', 'about'],
  nagykoveteink: ['Alapítvány', 'about'],
  kuratorium: ['Alapítvány', 'about'],
  dokumentumok: ['Alapítvány', 'about'],
  kuldetesunk: ['Alapítvány', 'swing'],
  'tamogatott-teruletek': ['Alapítvány', 'therapy'],
  partnereink: ['Alapítvány', 'flute'],
  kapcsolat: ['Alapítvány', 'about'],
  'adatkezelesi-tajekoztato': ['Alapítvány', 'about'],
  'fogadj-orokbe-egy-csaladot': ['Fogadj örökbe egy családot', 'swing'],
  'jelntkezz-tamogatonak': ['Fogadj örökbe egy családot', 'swing'],
  'kerulj-be-programunkba': ['Fogadj örökbe egy családot', 'therapy'],
  linkesfizetes: ['Támogass minket', 'therapy'],
  'jotekonysagi-meccs': ['Támogass minket', 'flute'],
  '1-ado': ['Támogass minket', 'swing'],
  'media-megjelenesek': ['Galéria', 'flute'],
  'csaladi-napok': ['Galéria', 'swing'],
  'alairasi-ceremonia': ['Galéria', 'swing'],
  galaest: ['Galéria', 'swing'],
  'varadi-eszter-dijra-jeloles': ['Váradi Eszter-díj', 'flute'],
  'generali-szurobusz-palyazat': [BRAND, 'therapy'],
};

// Az űrlap a tartalom mellett (jobb hasábban) jelenik meg; a kapcsolati űrlap az oldal utolsó szekciója mellé kerül.
const SIDE_FORMS = ['application', 'program', 'nomination'];

function galleryImages(html) {
  const galleries = (html.match(/<div class="gallery">[\s\S]*?<\/div>/g) || []).join('');
  return [...galleries.matchAll(/<img [^>]*src="([^"]+)"/g)].map((m) => m[1]);
}

// Rendezvényoldalak (pl. Gálaest): a bejegyzések nagy képpel, néhány fotóval a galériából.
function eventFeature(post, i) {
  const url = `/blog/${post.slug}`;
  const photos = photoCount(post);
  const thumbs = galleryImages(post.content).filter((src) => src !== post.coverImage).slice(0, 4);
  return `
    <article class="grid lg:grid-cols-12 gap-12 lg:gap-20 items-center">
      <div class="lg:col-span-6 relative reveal${i % 2 ? ' lg:order-last' : ''}">
        <div class="absolute -inset-4 border border-sand-500/40 rounded-2xl hidden md:block"></div>
        <a href="${url}" class="relative block rounded-2xl overflow-hidden shadow-2xl group" tabindex="-1" aria-hidden="true">
          ${cover(post, 'w-full aspect-[4/3] object-cover group-hover:scale-[1.03] transition-transform duration-700')}
        </a>
      </div>
      <div class="lg:col-span-6 reveal">
        <span class="${EYEBROW} text-sand-700 mb-4"><time datetime="${post.publishedAt}">${formatDate(post.publishedAt)}</time>${photos ? ` · ${photos} fotó` : ''}</span>
        <h2 class="font-display text-3xl md:text-5xl font-medium text-navy-800 leading-tight"><a href="${url}" class="hover:text-sand-700 transition-colors">${escapeHtml(post.title)}</a></h2>
        <p class="mt-6 text-navy-600 text-lg leading-relaxed">${escapeHtml(post.excerpt || excerpt(post.content, 260))}</p>
        ${thumbs.length ? `<div class="grid grid-cols-4 gap-2 sm:gap-3 mt-8">${thumbs.map((src) => `<a href="${url}" class="block rounded-xl overflow-hidden" tabindex="-1" aria-hidden="true"><img src="${escapeHtml(src)}" loading="lazy" alt="" class="w-full aspect-square object-cover hover:scale-[1.06] transition-transform duration-500"></a>`).join('')}</div>` : ''}
        <a href="${url}" class="${BTN_PRIMARY} mt-10">Megnézem a képeket →</a>
      </div>
    </article>`;
}

export function renderPage(frame, { page, baseUrl, preview, families = [], posts = [], formHtml = '', form = {} }) {
  const description = excerpt(page.content, 200) || page.title;
  const banner = preview ? previewBanner('Előnézet: ez az oldal még nem nyilvános, csak bejelentkezett adminisztrátor látja.') : '';
  const side = Boolean(formHtml) && SIDE_FORMS.includes(page.extras.form);
  const sections = parseSections(page.content || '');
  const lead = side ? '' : takeIntro(sections);
  mergeHeadings(sections);

  // A kapcsolati űrlap az utolsó (szöveges vagy kártyás) szekció mellé kerül.
  let formColumn = null;
  if (formHtml && !side && sections.length && ['text', 'para', 'cards', 'empty'].includes(sections[sections.length - 1].kind)) {
    formColumn = sections.pop();
  }

  let prev = 'hero';
  let mediaIndex = 0;
  const parts = [];
  if (side) {
    const column = sections.map(columnHtml).join('<div class="h-10"></div>');
    const short = textOf(page.content || '').length < 900;
    parts.push(band('sand', column
      ? `
    <div class="grid lg:grid-cols-12 gap-12 lg:gap-16 items-start">
      <div class="lg:col-span-5${short ? ' lg:sticky lg:top-32' : ''}">${column}</div>
      <div class="lg:col-span-7">${formHtml}</div>
    </div>`
      : `<div class="max-w-3xl mx-auto">${formHtml}</div>`));
    prev = 'sand';
  } else {
    for (const sec of sections) {
      const bg = nextBackground(sec.kind, prev);
      parts.push(renderSection(sec, bg, sec.kind === 'media' ? mediaIndex++ : 0));
      prev = bg;
    }
    if (formHtml) {
      const bg = nextBackground('text', prev);
      parts.push(band(bg, formColumn
        ? `
    <div class="grid lg:grid-cols-12 gap-12 lg:gap-16 items-start">
      <div class="lg:col-span-5">${columnHtml(formColumn)}</div>
      <div class="lg:col-span-7">${formHtml}</div>
    </div>`
        : `<div class="max-w-3xl mx-auto">${formHtml}</div>`));
      prev = bg;
    }
  }
  if (posts.length) {
    const bg = nextBackground('text', prev);
    parts.push(band(bg, `
    <div class="space-y-24 md:space-y-36">${posts.map(eventFeature).join('')}
    </div>`));
    prev = bg;
  }
  if (families.length) {
    const bg = nextBackground('text', prev);
    parts.push(band(bg, `${sectionHead({ eyebrow: 'Fogadj örökbe egy családot', title: 'Örökbefogadható családok', aside: outlineButton('/csaladok?statusz=orokbefogadhato', 'Összes örökbefogadható család →') })}
    <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-8 md:gap-10">
${families.map(familyCard).join('\n')}
    </div>`));
  }

  const [group, look] = PAGE_LOOK[page.slug] || [BRAND, 'swing'];
  let image = HERO_IMAGES[look];
  let heroLead = lead;
  const firstCover = posts.find((p) => p.coverImage);
  if (firstCover) image = [firstCover.coverImage, 'object-center'];
  if (posts.length && !heroLead) {
    const photos = posts.reduce((n, p) => n + photoCount(p), 0);
    heroLead = `<p>Pillanatok, amelyeket együtt éltünk át${posts.length > 1 ? `: ${posts.length} alkalom` : ''}${photos ? `${posts.length > 1 ? ',' : ':'} ${photos} fotó` : ''}.</p>`;
  }
  const hero = pageHero({
    eyebrow: escapeHtml(group), title: page.title, lead: heroLead, image, crumbs: [{ label: page.title }], banner,
  });

  const hasGallery = /class="gallery"/.test(page.content);
  const firstImage = (page.content.match(/<img src="(\/uploads\/[^"]+)"/) || [])[1];
  return layout(frame, {
    title: `${page.title} — Egy Lépéssel Több Alapítvány`,
    description,
    canonical: `${baseUrl}/${page.slug}`,
    image: firstImage ? baseUrl + firstImage : '',
    main: hero + parts.join(''),
    extra: (hasGallery ? GALLERY_LIGHTBOX : '')
      + ((form.errors && Object.keys(form.errors).length) || form.error
        ? "<script>document.getElementById('jelentkezes').scrollIntoView();</script>" : ''),
  });
}

export function renderNotFound(frame) {
  const main = pageHero({
    eyebrow: '404',
    title: 'Ez az oldal nem található',
    lead: '<p>Lehet, hogy elköltözött, vagy elírás történt a címben.</p>',
    image: HERO_IMAGES.swing,
    tall: true,
    actions: `<a href="/" class="${BTN_PRIMARY}">Vissza a főoldalra</a><a href="/blog" class="${BTN_GHOST}">Blog</a>`,
  });
  return layout(frame, { title: 'Az oldal nem található — Egy Lépéssel Több Alapítvány', description: 'Az oldal nem található.', main });
}
