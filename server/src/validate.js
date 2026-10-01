import sanitizeHtml from 'sanitize-html';
import { STATUSES } from './db.js';

export class ValidationError extends Error {}

// A szerkesztő eszköztára ennyit tud előállítani; minden mást kiszűrünk.
const STORY_OPTIONS = {
  allowedTags: ['p', 'br', 'b', 'strong', 'i', 'em', 'u', 'ul', 'ol', 'li', 'a', 'h3', 'h4', 'blockquote'],
  allowedAttributes: { a: ['href', 'rel', 'target'] },
  allowedSchemes: ['http', 'https', 'mailto'],
  transformTags: {
    a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer', target: '_blank' }),
  },
};

const IMAGE_URL = /^\/(uploads|assets\/img)\/[A-Za-z0-9._-]+$/;

function text(value, field, max, { required = false } = {}) {
  const s = typeof value === 'string' ? value.trim() : '';
  if (required && !s) throw new ValidationError(`A(z) ${field} megadása kötelező.`);
  if (s.length > max) throw new ValidationError(`A(z) ${field} legfeljebb ${max} karakter lehet.`);
  return s;
}

function integer(value, field, max) {
  const n = value === '' || value == null ? 0 : Number(value);
  if (!Number.isInteger(n) || n < 0 || n > max) {
    throw new ValidationError(`A(z) ${field} 0 és ${max} közötti egész szám legyen.`);
  }
  return n;
}

function images(value) {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > 30) throw new ValidationError('Legfeljebb 30 kép adható meg.');
  const list = value.map((im) => {
    if (!im || typeof im.url !== 'string' || !IMAGE_URL.test(im.url)) {
      throw new ValidationError('Érvénytelen kép.');
    }
    return { url: im.url, label: text(im.label, 'képnév', 200) || im.url.split('/').pop(), isCover: im.isCover === true };
  });
  // Pontosan egy borítókép legyen: az első megjelölt, ennek hiányában az első kép.
  const coverIndex = Math.max(0, list.findIndex((im) => im.isCover));
  return list.map((im, i) => ({ ...im, isCover: i === coverIndex }));
}

export function validateFamily(body) {
  if (!body || typeof body !== 'object') throw new ValidationError('Hiányzó adatok.');
  if (!STATUSES.includes(body.status)) throw new ValidationError('Érvénytelen státusz.');
  const story = sanitizeHtml(typeof body.story === 'string' ? body.story : '', STORY_OPTIONS);
  if (story.length > 100_000) throw new ValidationError('A történet túl hosszú.');
  return {
    name: text(body.name, 'családnév', 120, { required: true }),
    subtitle: text(body.subtitle, 'alcím', 200),
    status: body.status,
    amount: integer(body.amount, 'összeg', 100_000_000),
    applicants: integer(body.applicants, 'jelentkezők száma', 100_000),
    story,
    images: images(body.images),
  };
}

export function validateSettings(body) {
  if (!body || typeof body !== 'object') throw new ValidationError('Hiányzó adatok.');
  if (!STATUSES.includes(body.autoStatus)) throw new ValidationError('Érvénytelen státusz.');
  const threshold = integer(body.threshold, 'küszöb', 100_000);
  if (threshold < 1) throw new ValidationError('A küszöb legalább 1 legyen.');
  return { threshold, autoStatus: body.autoStatus, autoEnabled: body.autoEnabled === true };
}

// A fájl első bájtjai alapján döntünk, nem a böngésző által küldött típus alapján.
export function detectImageType(buf) {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  if (buf.length >= 6 && /^GIF8[79]a$/.test(buf.toString('ascii', 0, 6))) return 'gif';
  return null;
}
