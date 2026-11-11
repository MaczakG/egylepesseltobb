// Fájltár a feltöltött képeknek (uploads/…) és a beküldött dokumentumoknak (private/…).
// Helyben (fejlesztés, tesztek) a DATA_DIR mappa, AWS-en (Lambda) egy S3 bucket ugyanazokkal a kulcsokkal.
import fs from 'node:fs';
import path from 'node:path';

export function createStorage(config) {
  return config.bucket ? s3Storage(config) : localStorage(config.dataDir);
}

function localStorage(root) {
  const file = (key) => path.join(root, key);
  return {
    async put(key, body) {
      fs.mkdirSync(path.dirname(file(key)), { recursive: true, mode: 0o700 });
      fs.writeFileSync(file(key), body, { mode: 0o600 });
    },
    async get(key) {
      return fs.existsSync(file(key)) ? fs.readFileSync(file(key)) : null;
    },
    async exists(key) {
      return fs.existsSync(file(key));
    },
    async remove(key) {
      fs.rmSync(file(key), { recursive: true, force: true });
    },
    // Letöltés: helyben a fájl, S3-on egy rövid ideig érvényes link (a Lambda válasza max. 6 MB lehet).
    async send(res, key) {
      res.sendFile(file(key));
    },
    // Helyben nincs közvetlen feltöltés: az űrlap ilyenkor a fájlokat magával küldi.
    async presignPut() {
      return null;
    },
  };
}

function s3Storage({ bucket, region }) {
  const sdk = import('@aws-sdk/client-s3').then(async (s3) => ({
    ...s3, client: new s3.S3Client({ region }), presign: (await import('@aws-sdk/s3-request-presigner')).getSignedUrl,
  }));
  const TYPES = {
    webp: 'image/webp', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', pdf: 'application/pdf',
  };
  const contentType = (key) => TYPES[path.extname(key).slice(1).toLowerCase()] || 'application/octet-stream';
  return {
    async put(key, body) {
      const { client, PutObjectCommand } = await sdk;
      await client.send(new PutObjectCommand({
        Bucket: bucket, Key: key, Body: body, ContentType: contentType(key),
        CacheControl: key.startsWith('uploads/') ? 'public, max-age=2592000' : 'private, no-store',
      }));
    },
    async get(key) {
      const { client, GetObjectCommand } = await sdk;
      try {
        const out = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
        return Buffer.from(await out.Body.transformToByteArray());
      } catch (err) {
        if (err.name === 'NoSuchKey') return null;
        throw err;
      }
    },
    async exists(key) {
      const { client, HeadObjectCommand } = await sdk;
      try {
        await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
        return true;
      } catch (err) {
        if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) return false;
        throw err;
      }
    },
    async remove(key) {
      const { client, ListObjectsV2Command, DeleteObjectsCommand } = await sdk;
      const { Contents = [] } = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: key }));
      const keys = Contents.map((o) => o.Key).filter((k) => k === key || k.startsWith(`${key}/`));
      if (keys.length) await client.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: keys.map((Key) => ({ Key })) } }));
    },
    async send(res, key) {
      const { client, GetObjectCommand, presign } = await sdk;
      const url = await presign(client, new GetObjectCommand({
        Bucket: bucket, Key: key,
        ResponseContentDisposition: res.get('Content-Disposition'),
        ResponseContentType: res.get('Content-Type'),
        ResponseCacheControl: 'private, no-store',
      }), { expiresIn: 60 });
      res.redirect(302, url);
    },
    // Közvetlen feltöltés a böngészőből (a Lambda kérésmérete max. 6 MB): az aláírt link csak erre a kulcsra,
    // típusra és méretre érvényes, 10 percig.
    async presignPut(key, { type, size }) {
      const { client, PutObjectCommand, presign } = await sdk;
      return presign(client, new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: type, ContentLength: size }), { expiresIn: 600 });
    },
  };
}
