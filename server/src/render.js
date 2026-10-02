// A családkártyák (főoldal, családlista, aloldal ajánlója). A jelölés az index.html statikus kártyáit követi.
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

export function coverImage(family) {
  return family.images.find((im) => im.isCover) || family.images[0] || null;
}

export const FAMILY_BADGE = {
  adoptable: { label: 'Örökbefogadható', className: 'bg-sand-500 text-navy-900' },
  adopted: { label: 'Örökbefogadott', className: 'bg-navy-800 text-white' },
  uploading: { label: 'Feltöltés alatt', className: 'bg-white text-navy-800' },
  archived: { label: 'Archivált', className: 'bg-white text-navy-800' },
};

export function familyUrl(family) {
  return `/csaladok/${family.slug}`;
}

export function familyCard(family) {
  const cover = coverImage(family);
  const url = familyUrl(family);
  const badge = FAMILY_BADGE[family.status] || FAMILY_BADGE.adoptable;
  const media = cover
    ? `<img src="${escapeHtml(cover.url)}" loading="lazy" alt="${escapeHtml(family.name)}, akit az Alapítvány támogat" class="w-full h-full object-cover group-hover:scale-[1.04] transition-transform duration-500">`
    : `<div class="w-full h-full bg-sand-200 flex items-center justify-center font-display text-5xl font-semibold text-navy-700">${escapeHtml(family.name.slice(0, 1))}</div>`;
  const cta = family.status === 'adoptable' ? 'Segíteni szeretnék →' : 'Elolvasom a történetüket →';
  return `
      <article class="reveal lift-card group bg-navy-50 rounded-2xl overflow-hidden border border-navy-100 flex flex-col">
        <a href="${url}" class="block relative h-64 overflow-hidden" tabindex="-1" aria-hidden="true">
          ${media}
          <span class="absolute top-4 left-4 ${badge.className} text-xs font-semibold px-3 py-1.5 rounded-full">${badge.label}</span>
        </a>
        <div class="p-7 flex flex-col flex-1">
          <h3 class="font-display text-xl font-semibold text-navy-800 mb-1"><a href="${url}" class="hover:text-sand-700 transition-colors">${escapeHtml(family.name)}</a></h3>
          <p class="text-sm text-navy-500 mb-4">${escapeHtml(family.subtitle)}</p>
          <p class="text-navy-600 text-sm leading-relaxed mb-6 flex-1">${escapeHtml(excerpt(family.story))}</p>
          <a href="${url}" class="inline-flex items-center gap-1 text-sm font-semibold text-navy-800 hover:text-sand-700 pt-5 border-t border-navy-200 w-full">${cta}</a>
        </div>
      </article>`;
}

export function renderFamilyCards(families) {
  if (!families.length) {
    return `
      <p class="reveal sm:col-span-2 lg:col-span-3 text-navy-600 leading-relaxed">Jelenleg minden családunk megtalálta a támogatóját. Hamarosan újabb családokat mutatunk be.</p>`;
  }
  return families.map(familyCard).join('\n');
}

// A `<!-- név:start -->` és `<!-- név:end -->` jelölők közé teszi a tartalmat; jelölők nélkül nem nyúl a HTML-hez.
export function injectSection(indexHtml, name, content) {
  const start = indexHtml.indexOf(`<!-- ${name}:start -->`);
  const end = indexHtml.indexOf(`<!-- ${name}:end -->`);
  if (start === -1 || end === -1 || end < start) return indexHtml;
  return `${indexHtml.slice(0, start + `<!-- ${name}:start -->`.length)}\n${content}\n      ${indexHtml.slice(end)}`;
}

export function injectFamilies(indexHtml, cardsHtml) {
  return injectSection(indexHtml, 'families', cardsHtml);
}
