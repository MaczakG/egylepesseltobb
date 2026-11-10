// AWS Lambda belépési pont (függvény-URL, a CloudFront mögött). Az Express alkalmazás változatlanul fut egy
// helyi porton; a Lambda kérést oda továbbítjuk, a választ visszaadjuk. Csak kéréskor fut, forgalom nélkül ingyenes.
import fs from 'node:fs';
import http from 'node:http';
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { createApp } from './app.js';
import { settle } from './background.js';
import { loadConfig } from './config.js';
import { createDbSync } from './dbsync.js';
import { createMailer } from './mailer.js';

const { BUCKET, LOCK_TABLE, AWS_REGION, SESSION_SECRET_PARAM } = process.env;
let ready;

async function init() {
  const config = { ...loadConfig({ ...process.env, DATA_DIR: '/tmp/elt' }), bucket: BUCKET, region: AWS_REGION };
  fs.mkdirSync(config.dataDir, { recursive: true });
  const ssm = new SSMClient({ region: AWS_REGION });
  config.sessionSecret = (await ssm.send(new GetParameterCommand({ Name: SESSION_SECRET_PARAM, WithDecryption: true }))).Parameter.Value;
  const sync = createDbSync({ bucket: BUCKET, table: LOCK_TABLE, region: AWS_REGION, file: config.dbPath });
  await sync.open();
  // Lambdán a válasz megvárja a levélküldést, ezért itt rövidek az újrapróbálkozások.
  const app = createApp({ db: sync.db, config, mailer: createMailer(sync.db, { retryDelays: [1000, 3000] }) });
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  return { sync, port: server.address().port };
}

function forward(port, event) {
  const { method } = event.requestContext.http;
  const headers = { ...event.headers };
  // A CloudFront-függvény adja át a látogató eredeti címét és IP-jét (a függvény-URL saját Host fejlécet vár).
  headers.host = headers['x-forwarded-host'] || headers.host;
  headers['x-forwarded-for'] = headers['x-viewer-ip'] || event.requestContext.http.sourceIp;
  headers['x-forwarded-proto'] = 'https';
  if (event.cookies?.length) headers.cookie = event.cookies.join('; ');
  const body = event.body ? Buffer.from(event.body, event.isBase64Encoded ? 'base64' : 'utf8') : null;
  if (body) headers['content-length'] = String(body.length);
  const query = event.rawQueryString ? `?${event.rawQueryString}` : '';
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method, path: event.rawPath + query, headers }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const { 'set-cookie': cookies = [], ...rest } = res.headers;
        const out = Object.fromEntries(Object.entries(rest).map(([k, v]) => [k, Array.isArray(v) ? v.join(', ') : v]));
        delete out['transfer-encoding'];
        delete out.connection;
        resolve({
          statusCode: res.statusCode, headers: out, cookies, body: Buffer.concat(chunks).toString('base64'), isBase64Encoded: true,
        });
      });
    });
    req.on('error', reject);
    req.end(body);
  });
}

export async function handler(event) {
  ready ??= init().catch((err) => { ready = null; throw err; });
  const { sync, port } = await ready;
  const { method } = event.requestContext.http;
  // Írhat: minden nem-GET kérés (kivéve a feltöltési link kérését), és a SimplePay visszairányítása.
  const writes = (!['GET', 'HEAD'].includes(method) && event.rawPath !== '/feltoltes') || event.rawPath === '/fizetes/vissza';
  if (writes) {
    await sync.lock();
    await sync.refresh();
  } else {
    // Az admin mindig a legfrissebbet látja, a nyilvános oldalaknak elég 10 másodpercenként ránézni.
    await sync.refresh(event.rawPath.startsWith('/api/') ? 0 : 10_000);
  }
  try {
    const before = sync.changes();
    const response = await forward(port, event);
    await settle();
    if (sync.changes() !== before) {
      if (writes) await sync.push();
      else console.error(`Olvasó kérés módosította az adatbázist, a változás elveszhet: ${method} ${event.rawPath}`);
    }
    return response;
  } finally {
    if (writes) await sync.unlock();
  }
}
