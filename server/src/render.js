// A főoldal családkártyái. A jelölés megegyezik az index.html statikus kártyáival.
const START = '<!-- families:start -->';
const END = '<!-- families:end -->';
const EXCERPT_LENGTH = 340;

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", nbsp: ' ' };

export function excerpt(html, length = EXCERPT_LENGTH) {
  const text = String(html)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (_, e) => ENTITIES[e])
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= length) return text;
  const cut = text.slice(0, length);
  return `${cut.slice(0, cut.lastIndexOf(' ') > 0 ? cut.lastIndexOf(' ') : length)}…`;
}

function coverImage(family) {
  return family.images.find((im) => im.isCover) || family.images[0] || null;
}

function card(family) {
  const cover = coverImage(family);
  const media = cover
    ? `<img src="${escapeHtml(cover.url)}" loading="lazy" alt="${escapeHtml(family.name)}, akit az Alapítvány támogat" class="w-full h-full object-cover group-hover:scale-[1.04] transition-transform duration-500">`
    : `<div class="w-full h-full bg-sand-200 flex items-center justify-center font-display text-5xl font-semibold text-navy-700">${escapeHtml(family.name.slice(0, 1))}</div>`;
  return `
      <article class="reveal lift-card group bg-navy-50 rounded-2xl overflow-hidden border border-navy-100">
        <div class="relative h-64 overflow-hidden">
          ${media}
          <span class="absolute top-4 left-4 bg-sand-500 text-navy-900 text-xs font-semibold px-3 py-1.5 rounded-full">Örökbefogadható</span>
        </div>
        <div class="p-7">
          <h3 class="font-display text-xl font-semibold text-navy-800 mb-1">${escapeHtml(family.name)}</h3>
          <p class="text-sm text-navy-500 mb-4">${escapeHtml(family.subtitle)}</p>
          <p class="text-navy-600 text-sm leading-relaxed mb-6">${escapeHtml(excerpt(family.story))}</p>
          <a href="#contact" class="inline-flex items-center gap-1 text-sm font-semibold text-navy-800 hover:text-sand-700 pt-5 border-t border-navy-200 w-full">Segíteni szeretnék →</a>
        </div>
      </article>`;
}

export function renderFamilyCards(families) {
  if (!families.length) {
    return `
      <p class="reveal sm:col-span-2 lg:col-span-3 text-navy-600 leading-relaxed">Jelenleg minden családunk megtalálta a támogatóját. Hamarosan újabb családokat mutatunk be.</p>`;
  }
  return families.map(card).join('\n');
}

export function injectFamilies(indexHtml, cardsHtml) {
  const start = indexHtml.indexOf(START);
  const end = indexHtml.indexOf(END);
  if (start === -1 || end === -1 || end < start) return indexHtml;
  return `${indexHtml.slice(0, start + START.length)}\n${cardsHtml}\n      ${indexHtml.slice(end)}`;
}
