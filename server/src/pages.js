// A blog nyilvános oldalai. A keretet (head, fejléc, lábléc, szkript) a főoldalból veszik át,
// így a menü és a dizájn egy helyen, az index.html-ben változik.
import { POST_CATEGORIES } from './db.js';
import { escapeHtml, excerpt } from './render.js';

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
function absolutize(html) {
  return html.replace(/(href|src)="#/g, '$1="/#').replace(/(href|src)="assets\//g, '$1="/assets/');
}

export function siteFrame(indexHtml) {
  return {
    head: absolutize(indexHtml.slice(indexHtml.indexOf('<head>') + '<head>'.length, indexHtml.indexOf('</head>'))),
    header: absolutize(between(indexHtml, 'site:header')),
    footer: absolutize(between(indexHtml, 'site:footer')),
    script: between(indexHtml, 'site:script'),
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
`;

function layout(frame, { title, description, canonical, image, type = 'website', main }) {
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
