// Partnerlogók egységesítése: a logó körüli üres (átlátszó vagy fehér) szegélyt levágjuk, majd úgy méretezzük,
// hogy minden logó nagyjából ugyanakkora felületet foglaljon el (a széles logó szélesebb, a négyzetes magasabb),
// és egy egyforma, átlátszó vászon közepére tesszük. Így a csempékben egyforma súlyúnak látszanak.
import sharp from 'sharp';

export const LOGO_CANVAS = { width: 640, height: 320 };
const AREA = 46000; // a logó tartalmának célterülete pixelben (kb. 215×215 négyzetes logónál)
const MAX = { width: 470, height: 250 };

export async function normalizeLogo(input, format = 'png') {
  const trimmed = await sharp(input, { failOn: 'none' }).rotate().ensureAlpha().trim({ threshold: 20 })
    .toBuffer({ resolveWithObject: true });
  const { width, height } = trimmed.info;
  const scale = Math.min(Math.sqrt(AREA / (width * height)), MAX.width / width, MAX.height / height);
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const logo = await sharp(trimmed.data).resize(w, h, { fit: 'fill' }).png().toBuffer();
  const canvas = sharp({
    create: { ...LOGO_CANVAS, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 0 } },
  }).composite([{ input: logo, left: Math.round((LOGO_CANVAS.width - w) / 2), top: Math.round((LOGO_CANVAS.height - h) / 2) }]);
  return format === 'webp' ? canvas.webp({ quality: 90, alphaQuality: 100 }).toBuffer() : canvas.png({ compressionLevel: 9 }).toBuffer();
}
