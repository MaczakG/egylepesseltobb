// Az SQLite adatbázis egy fájlként az S3-ban él (verziózva, 35 napig visszaállítható). Minden Lambda-példány
// letölti; olvasáskor időnként megnézi, változott-e, íráskor pedig egy DynamoDB-zár alatt frissít, ír és feltölt,
// így két egyszerre érkező írás sem veszhet el. Forgalom nélkül nincs költség (nincs futó szerver vagy adatbázis).
import crypto from 'node:crypto';
import fs from 'node:fs';
import { DynamoDBClient, DeleteItemCommand, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { openDb } from './db.js';

const KEY = 'db/egylepesseltobb.db';
const LOCK_WAIT_MS = 25_000;

export function createDbSync({
  bucket, table, region, file, lockTtlMs = 60_000,
}) {
  const s3 = new S3Client({ region });
  const dynamo = new DynamoDBClient({ region });
  const owner = crypto.randomUUID();
  let db = null;
  let etag = null; // a helyi példány melyik S3-verzióból jött (null: még nincs távoli adatbázis)
  let checkedAt = 0;

  const remoteEtag = async () => {
    try {
      return (await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: KEY }))).ETag;
    } catch (err) {
      if (err.$metadata?.httpStatusCode === 404) return null;
      throw err;
    }
  };

  async function download() {
    const out = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: KEY }));
    db?.close();
    for (const f of [file, `${file}-wal`, `${file}-shm`]) fs.rmSync(f, { force: true });
    fs.writeFileSync(file, await out.Body.transformToByteArray(), { mode: 0o600 });
    db = openDb(file);
    etag = out.ETag;
  }

  return {
    // Az alkalmazás ezen keresztül éri el a mindenkori (esetleg újratöltött) adatbázist.
    db: new Proxy({}, {
      get: (_, name) => (typeof db[name] === 'function' ? db[name].bind(db) : db[name]),
    }),

    async open() {
      if (await remoteEtag()) await download();
      else db = openDb(file);
      checkedAt = Date.now();
    },

    // Letölti az újabb változatot, ha van (maxAge ms-on belül nem kérdez rá újra).
    async refresh(maxAge = 0) {
      if (Date.now() - checkedAt < maxAge) return;
      const remote = await remoteEtag();
      if (remote && remote !== etag) await download();
      checkedAt = Date.now();
    },

    changes: () => db.prepare('SELECT total_changes() AS n').get().n,

    // Feltöltés csak akkor sikerül, ha közben más nem írt (If-Match); a zár mellett ez a második védővonal.
    async push() {
      const snapshot = `${file}.snapshot`;
      fs.rmSync(snapshot, { force: true });
      db.exec(`VACUUM INTO '${snapshot}'`);
      const out = await s3.send(new PutObjectCommand({
        Bucket: bucket, Key: KEY, Body: fs.readFileSync(snapshot), ContentType: 'application/vnd.sqlite3',
        ...(etag ? { IfMatch: etag } : { IfNoneMatch: '*' }),
      }));
      fs.rmSync(snapshot, { force: true });
      etag = out.ETag;
      checkedAt = Date.now();
    },

    async lock() {
      const deadline = Date.now() + LOCK_WAIT_MS;
      for (;;) {
        const now = Date.now();
        try {
          await dynamo.send(new PutItemCommand({
            TableName: table,
            Item: { pk: { S: 'db' }, owner: { S: owner }, expires: { N: String(now + lockTtlMs) } },
            ConditionExpression: 'attribute_not_exists(pk) OR expires < :now',
            ExpressionAttributeValues: { ':now': { N: String(now) } },
          }));
          return;
        } catch (err) {
          if (err.name !== 'ConditionalCheckFailedException' || now > deadline) throw err;
          await new Promise((resolve) => { setTimeout(resolve, 100 + Math.random() * 150); });
        }
      }
    },

    async unlock() {
      await dynamo.send(new DeleteItemCommand({
        TableName: table, Key: { pk: { S: 'db' } },
        ConditionExpression: '#o = :me', ExpressionAttributeNames: { '#o': 'owner' }, ExpressionAttributeValues: { ':me': { S: owner } },
      })).catch(() => {});
    },
  };
}
