// A régi oldal további űrlapjai (kapcsolat, programjelentkezés, díjjelölés). A mezők a régi űrlapokat követik;
// a beküldések az adminban az „Üzenetek” menüpontban jelennek meg.
import { escapeHtml } from './render.js';

const NAME = { name: 'name', label: 'Név', type: 'text', required: true, max: 120, autocomplete: 'name' };
const EMAIL = { name: 'email', label: 'E-mail', type: 'email', required: true, max: 200, autocomplete: 'email' };
const PHONE = { name: 'phone', label: 'Telefonszám', type: 'tel', max: 30, autocomplete: 'tel' };

export const MESSAGE_FORMS = {
  contact: {
    label: 'Kapcsolat',
    title: 'Kapcsolati űrlap',
    sections: [{ fields: [NAME, EMAIL, { name: 'message', label: 'Üzenet', type: 'textarea', max: 5000, rows: 5 }] }],
  },
  program: {
    label: 'Programjelentkezés',
    title: 'Jelentkezés a programba',
    sections: [{
      fields: [
        NAME, EMAIL, { ...PHONE, required: true },
        { name: 'story', label: 'Rövid történet a gyermek betegségéről, fejlesztésekről, célokról', type: 'textarea', required: true, max: 10000, rows: 6 },
        { name: 'documents', label: 'A gyermek betegségét igazoló orvosi dokumentáció feltöltése', type: 'file', help: 'PDF vagy kép (JPG, PNG, WEBP), legfeljebb 5 fájl, egyenként max. 10 MB.' },
      ],
    }],
  },
  nomination: {
    label: 'Díjjelölés',
    title: 'Jelölés a Váradi Eszter-díjra',
    sections: [
      { title: 'Jelölő adatai', fields: [NAME, EMAIL, PHONE] },
      {
        title: 'Jelölések',
        fields: [
          { name: 'nominee', label: 'Jelölt neve', type: 'text', required: true, max: 160 },
          {
            name: 'category', label: 'Díj kategória', type: 'select', required: true, placeholder: 'Válasszon',
            options: ['Az Év Önkéntese', 'Az Év Magánszemély Támogatója', 'Az Év Céges Támogatója', 'Az Év Előadója',
              'Az Év Előadóművésze', 'Az Év Nagykövete', 'Az Év Médiatámogatója', 'Az Év Gyermekorvosa',
              'Az Év Egészségügyi Dolgozója', 'Az Év Utánpótlás Női Sportolója', 'Az Év Utánpótlás Férfi Sportolója',
              'Életműdíj', 'Különdíj', 'Az Év Női Paralimpikonja', 'Az Év Férfi Paralimpikonja'],
          },
          {
            name: 'ambassador', label: 'Nagykövet', type: 'select', placeholder: 'Válasszon',
            options: ['Győrfi Pál', 'Kucsera Gábor', 'Andrásfi Tibor', 'Kovács-Dobos Evelin'],
          },
          { name: 'reason', label: 'Indoklás', type: 'textarea', required: true, min: 200, max: 10000, rows: 7, help: 'Legalább 200 karakter.' },
        ],
      },
    ],
  },
};

export const MESSAGE_FORM_TYPES = Object.keys(MESSAGE_FORMS);

const fieldsOf = (def) => def.sections.flatMap((s) => s.fields).filter((f) => f.type !== 'file');

// Mezők és címkék sorrendben (az adminnak, hogy a beküldött adatokat érthetően mutassa).
export function formSchema() {
  return Object.fromEntries(Object.entries(MESSAGE_FORMS).map(([key, def]) => [key, {
    label: def.label, fields: fieldsOf(def).map((f) => ({ name: f.name, label: f.label })),
  }]));
}

const EMAIL_RE = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]{2,}$/;
const PHONE_RE = /^[+()\-\s\d/]{6,30}$/;

export function checkMessage(def, body) {
  const values = {};
  const errors = {};
  for (const f of fieldsOf(def)) {
    const v = typeof body[f.name] === 'string' ? body[f.name].trim().slice(0, f.max || 200) : '';
    values[f.name] = v;
    if (!v) {
      if (f.required) errors[f.name] = f.type === 'select' ? 'Válassz a felsoroltak közül.' : `Add meg: ${f.label.toLowerCase()}.`;
      continue;
    }
    if (f.type === 'email' && !EMAIL_RE.test(v)) errors[f.name] = 'Adj meg egy érvényes e-mail címet.';
    if (f.type === 'tel' && (!PHONE_RE.test(v) || v.replace(/\D/g, '').length < 7)) errors[f.name] = 'Adj meg egy érvényes telefonszámot.';
    if (f.type === 'select' && !f.options.includes(v)) errors[f.name] = 'Válassz a felsoroltak közül.';
    if (f.min && v.length < f.min) errors[f.name] = `Legalább ${f.min} karakter kell (most ${v.length}).`;
  }
  values.consent = ['on', '1', 'true'].includes(body.consent);
  if (!values.consent) errors.consent = 'A beküldéshez el kell fogadnod az adatkezelési tájékoztatót.';
  return { values, errors };
}

const INPUT = 'w-full rounded-full border bg-white px-5 py-3 text-navy-800 outline-none transition focus:border-sand-600 focus:ring-2 focus:ring-sand-200';
const AREA = 'w-full rounded-2xl border bg-white px-5 py-3 text-navy-800 outline-none transition focus:border-sand-600 focus:ring-2 focus:ring-sand-200';

// JavaScript nélkül is működő űrlap (sima POST; fájlfeltöltésnél multipart).
export function renderMessageForm(def, { action, values = {}, errors = {}, error = '', submitted = false, privacyUrl = '' }) {
  if (submitted) {
    return `
    <section id="jelentkezes" class="scroll-mt-32 bg-white border border-navy-100 rounded-2xl shadow-sm p-8 text-center" role="status">
      <div class="w-14 h-14 rounded-full bg-sand-100 text-sand-800 mx-auto flex items-center justify-center text-2xl font-bold">✓</div>
      <h2 class="font-display text-2xl font-semibold text-navy-800 mt-5">Köszönjük, megkaptuk!</h2>
      <p class="mt-3 text-navy-600 leading-relaxed">Hamarosan felvesszük veled a kapcsolatot a megadott elérhetőségeken.</p>
    </section>`;
  }
  const hasFile = def.sections.some((s) => s.fields.some((f) => f.type === 'file'));
  const err = (name) => (errors[name] ? `<p class="mt-1.5 ml-4 text-sm text-red-700">${escapeHtml(errors[name])}</p>` : '');
  const border = (name) => (errors[name] ? 'border-red-400' : 'border-navy-200');
  const label = (f, id) => `<label for="${id}" class="block text-sm text-navy-600 mb-1.5 ml-1">${f.required ? '<span class="text-red-600">*</span> ' : ''}${escapeHtml(f.label)}:</label>`;
  const field = (f) => {
    const id = `msg-${f.name}`;
    const v = values[f.name] || '';
    const req = f.required ? ' required' : '';
    const invalid = errors[f.name] ? ' aria-invalid="true"' : '';
    const help = f.help ? `<p class="mt-1.5 ml-4 text-xs text-navy-500">${escapeHtml(f.help)}</p>` : '';
    let control;
    if (f.type === 'textarea') {
      control = `<textarea id="${id}" name="${f.name}" rows="${f.rows || 4}"${req} maxlength="${f.max}"${f.min ? ` minlength="${f.min}"` : ''} class="${AREA} ${border(f.name)}"${invalid}>${escapeHtml(v)}</textarea>`;
    } else if (f.type === 'select') {
      const opts = [`<option value=""${v ? '' : ' selected'}>${escapeHtml(f.placeholder)}</option>`,
        ...f.options.map((o) => `<option value="${escapeHtml(o)}"${o === v ? ' selected' : ''}>${escapeHtml(o)}</option>`)];
      control = `<select id="${id}" name="${f.name}"${req} class="${INPUT} ${border(f.name)}"${invalid}>${opts.join('')}</select>`;
    } else if (f.type === 'file') {
      control = `<input id="${id}" name="${f.name}" type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf" class="block w-full text-sm text-navy-600 file:mr-4 file:rounded-full file:border-0 file:bg-sand-100 file:px-5 file:py-2.5 file:font-semibold file:text-navy-800 hover:file:bg-sand-200">`;
    } else {
      control = `<input id="${id}" name="${f.name}" type="${f.type}"${f.autocomplete ? ` autocomplete="${f.autocomplete}"` : ''}${req} maxlength="${f.max}" value="${escapeHtml(v)}" class="${INPUT} ${border(f.name)}"${invalid}>`;
    }
    return `
        <div>
          ${label(f, id)}
          ${control}
          ${help}${err(f.name)}
        </div>`;
  };
  const privacy = privacyUrl
    ? `<a href="${escapeHtml(privacyUrl)}" target="_blank" rel="noopener" class="text-sand-800 underline underline-offset-2 hover:text-navy-800">adatkezelési tájékoztatót</a>`
    : 'adatkezelési tájékoztatót';
  const sections = def.sections.map((s) => `
        ${s.title ? `<h3 class="font-display text-lg font-semibold text-navy-800 pt-2">${escapeHtml(s.title)}</h3>` : ''}
        ${s.fields.map(field).join('')}`).join('');
  const summary = error || (Object.keys(errors).length ? `Kérjük, javítsd a megjelölt mezőket.${hasFile ? ' A fájlokat újra ki kell választani.' : ''}` : '');
  return `
    <section id="jelentkezes" class="scroll-mt-32 bg-white border border-navy-100 rounded-2xl shadow-sm p-6 md:p-8">
      <h2 class="font-display text-2xl md:text-3xl font-semibold text-navy-800">${escapeHtml(def.title)}</h2>
      <p class="mt-2 text-sm text-navy-500">A <span class="text-red-600">*</span>-gal jelölt mezők kitöltése kötelező.</p>
      ${summary ? `<p class="mt-5 text-sm text-red-800 bg-red-50 border border-red-200 rounded-xl px-4 py-3" role="alert">${escapeHtml(summary)}</p>` : ''}
      <form method="post" action="${action}"${hasFile ? ' enctype="multipart/form-data"' : ''} class="mt-6 space-y-5">
        ${sections}
        <div class="absolute -left-[9999px] w-px h-px overflow-hidden" aria-hidden="true">
          <label for="msg-website">Weboldal (hagyd üresen)</label>
          <input id="msg-website" name="website" type="text" tabindex="-1" autocomplete="off">
        </div>
        <div>
          <label class="flex items-start gap-3 text-sm text-navy-600 ml-1">
            <input type="checkbox" name="consent" value="on" required${values.consent ? ' checked' : ''} class="mt-0.5 w-4 h-4 rounded border-navy-300 text-sand-700 focus:ring-sand-300">
            <span><span class="text-red-600">*</span> Elolvastam és megértettem az ${privacy}.</span>
          </label>
          ${err('consent')}
        </div>
        <button type="submit" class="btn-primary w-full bg-sand-500 hover:bg-sand-600 text-navy-900 font-bold uppercase tracking-wide px-6 py-3.5 rounded-full">Beküldés</button>
      </form>
    </section>`;
}
