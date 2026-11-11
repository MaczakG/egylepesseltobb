// SimplePay (OTP Mobil) v2 API: fizetés indítása, visszairányítás és IPN ellenőrzése.
// A hivatalos PHP SDK (SimplePayV2.1 Payment PHP SDK 2.1.5) működését követi:
// - aláírás: base64(HMAC-SHA384(titkos kulcs, a küldött JSON szöveg)), a `Signature` fejlécben;
// - visszairányítás: `r` = base64 JSON ({ r, t, e, m, o }), `s` = a dekódolt JSON aláírása;
// - IPN: a kapott JSON aláírását ellenőrizzük, a válasz ugyanaz `receiveDate`-tel kiegészítve, aláírva.
import crypto from 'node:crypto';

export const API = {
  sandbox: 'https://sandbox.simplepay.hu/payment',
  live: 'https://secure.simplepay.hu/payment',
};
export const SDK_VERSION = 'EgyLepesselTobb_Node_1.0';
// A fizetési tájékoztató, amire a SimplePay logónak mutatnia kell (dokumentáció, 7. fejezet).
export const PAYMENT_INFO_URL = 'https://simplepartner.hu/PaymentService/Fizetesi_tajekoztato.pdf';
export const PRIVACY_URL = 'https://simplepay.hu/adatkezelesi-tajekoztatok/';

export function sign(secretKey, text) {
  return crypto.createHmac('sha384', String(secretKey).trim()).update(text, 'utf8').digest('base64');
}

export function isValidSignature(secretKey, text, signature) {
  if (!secretKey || typeof signature !== 'string' || !signature) return false;
  const expected = Buffer.from(sign(secretKey, text));
  const given = Buffer.from(signature.trim());
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}

// ISO 8601 idő helyi eltolással, ahogy a SimplePay példái is mutatják (pl. 2026-11-09T12:00:00+01:00).
export function isoWithOffset(date = new Date()) {
  const off = -date.getTimezoneOffset();
  const pad = (n) => String(Math.floor(Math.abs(n))).padStart(2, '0');
  const local = new Date(date.getTime() + off * 60000).toISOString().slice(0, 19);
  return `${local}${off >= 0 ? '+' : '-'}${pad(off / 60)}:${pad(off % 60)}`;
}

/**
 * Fizetés indítása. Visszaadja: { transactionId, paymentUrl, timeout }.
 * Hiba esetén SimplePayError-t dob (a SimplePay hibakódjaival).
 */
export async function startPayment(settings, {
  orderRef, total, customerEmail, customerName, backUrl, items = [], timeoutMinutes = 30, fetchImpl = fetch,
}) {
  const body = {
    salt: crypto.randomBytes(16).toString('hex'),
    merchant: settings.merchant,
    orderRef,
    currency: 'HUF',
    customerEmail,
    language: 'HU',
    sdkVersion: SDK_VERSION,
    methods: ['CARD'],
    total: String(total),
    timeout: isoWithOffset(new Date(Date.now() + timeoutMinutes * 60000)),
    url: backUrl,
    customer: customerName,
    // A számlázási adatokat a SimplePay fizetőoldalán adja meg a támogató (nálunk csak név és e-mail van).
    // Részleges `invoice` objektumot nem küldünk: azt a SimplePay hiányos címként elutasítja (5310–5312).
    maySelectInvoice: true,
    items: items.map((it) => ({
      ref: String(it.ref), title: it.title, desc: it.desc || '', amount: String(it.amount || 1), price: String(it.price), tax: '0',
    })),
  };
  const text = JSON.stringify(body);
  const res = await fetchImpl(`${settings.sandbox ? API.sandbox : API.live}/v2/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept-language': 'HU', Signature: sign(settings.secretKey, text) },
    body: text,
  });
  const responseText = await res.text();
  let data;
  try { data = JSON.parse(responseText); } catch { throw new SimplePayError(`Váratlan válasz (HTTP ${res.status}).`, []); }
  if (data.errorCodes && data.errorCodes.length) throw new SimplePayError('A SimplePay hibát jelzett.', data.errorCodes);
  if (!isValidSignature(settings.secretKey, responseText, res.headers.get('signature'))) {
    throw new SimplePayError('A SimplePay válaszának aláírása érvénytelen.', []);
  }
  if (!data.paymentUrl || !data.transactionId) throw new SimplePayError('Hiányos SimplePay válasz.', []);
  return { transactionId: data.transactionId, paymentUrl: data.paymentUrl, timeout: data.timeout };
}

export class SimplePayError extends Error {
  constructor(message, codes) {
    super(codes.length ? `${message} (${codes.join(', ')})` : message);
    this.codes = codes;
  }
}

// A visszairányítás (back URL) paraméterei. Érvénytelen aláírásnál null.
export function parseBack(settings, r, s) {
  if (typeof r !== 'string' || typeof s !== 'string') return null;
  const json = Buffer.from(r, 'base64').toString('utf8');
  if (!isValidSignature(settings.secretKey, json, s)) return null;
  try {
    const data = JSON.parse(json);
    return {
      responseCode: data.r, transactionId: data.t, event: String(data.e || '').toUpperCase(), merchant: data.m, orderRef: String(data.o || ''),
    };
  } catch {
    return null;
  }
}

/**
 * IPN: a nyers törzs és a Signature fejléc ellenőrzése. Érvényes üzenetnél a kért válasz
 * (törzs + aláírás) és a feldolgozott adatok, érvénytelennél null.
 */
export function handleIpn(settings, rawBody, signature, now = new Date()) {
  if (!isValidSignature(settings.secretKey, rawBody, signature)) return null;
  let data;
  try { data = JSON.parse(rawBody); } catch { return null; }
  const reply = JSON.stringify({ ...data, receiveDate: isoWithOffset(now) });
  return { data, reply, replySignature: sign(settings.secretKey, reply) };
}

// A SimplePay tranzakció-státuszok a mi rendelésállapotainkra.
export const IPN_STATUS = {
  FINISHED: 'paid',
  AUTHORISED: 'paid',
  NOTAUTHORISED: 'failed',
  CANCELLED: 'cancelled',
  TIMEOUT: 'timeout',
  REVERSED: 'cancelled',
};
export const BACK_STATUS = { SUCCESS: 'authorized', FAIL: 'failed', CANCEL: 'cancelled', TIMEOUT: 'timeout' };
