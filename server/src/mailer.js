// E-mail értesítések SMTP-n, egyszerű szöveges levélben (pl. Google Workspace vagy Microsoft 365 alkalmazásjelszóval).
// A látogatók minden beküldése (támogatói jelentkezés, kapcsolat, programjelentkezés, díjjelölés) és minden
// sikeres fizetés után levél megy az adminban megadott címekre. A küldés a háttérben fut: hiba esetén a
// beküldés ettől még sikeres, a hibát a napló és az admin Beállítások oldala mutatja.
import nodemailer from 'nodemailer';
import * as store from './db.js';

// Átmeneti hibánál (pl. Google „421 Try again later”, időtúllépés) a levél később újra elindul.
const RETRY_DELAYS = [30_000, 120_000, 600_000];
const isTransient = (err) => !err.responseCode || (err.responseCode >= 400 && err.responseCode < 500);

export function createMailer(db, {
  transportFactory = (opts) => nodemailer.createTransport(opts), retryDelays = RETRY_DELAYS,
} = {}) {
  const settings = () => store.getSmtpSettings(db);
  const configured = (s = settings()) => Boolean(s.host && s.from && s.to.length);

  const transport = (s) => transportFactory({
    host: s.host,
    port: s.port,
    secure: s.port === 465,
    requireTLS: s.port !== 465,
    auth: s.user ? { user: s.user, pass: s.pass } : undefined,
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 30000,
  });

  const message = (s, { subject, rows, intro = '', link, replyTo }) => ({
    from: s.from,
    to: s.to.join(', '),
    replyTo: replyTo || undefined,
    // A tárgyban a látogató által beírt szöveg is lehet: sortörés nem kerülhet a fejlécbe.
    subject: `[Egy Lépéssel Több] ${subject}`.replace(/[\r\n\t]+/g, ' ').slice(0, 200),
    text: [intro, '', ...rows.map(([k, v]) => `${k}: ${v}`), '', link ? `Megnyitás az adminban: ${link}` : '']
      .join('\n').trim(),
  });

  // Tesztlevél az adminból: itt a hibát visszaadjuk, hogy a beállításnál látszódjon.
  async function sendTest(link) {
    const s = settings();
    if (!configured(s)) throw new Error('Add meg az SMTP-szervert, a feladót és legalább egy címzettet.');
    await transport(s).sendMail(message(s, {
      subject: 'Tesztlevél',
      intro: 'Ez egy tesztlevél a weboldal adminjából. Ha megkaptad, az értesítések működnek.',
      rows: [],
      link,
    }));
    store.saveSmtpStatus(db, { lastSentAt: new Date().toISOString(), lastError: '' });
  }

  // Értesítés a háttérben; sosem dob hibát a hívó felé.
  function notify(mail) {
    const s = settings();
    if (!s.enabled || !configured(s)) return Promise.resolve(false);
    const msg = message(s, mail);
    const attempt = (n) => transport(s).sendMail(msg)
      .then(() => {
        store.saveSmtpStatus(db, { lastSentAt: new Date().toISOString(), lastError: '' });
        return true;
      })
      .catch((err) => {
        const retry = n < retryDelays.length && isTransient(err);
        console.error(`E-mail értesítés hiba (${mail.subject}, ${n + 1}. próba${retry ? ', újrapróbálja' : ''}): ${err.message}`);
        store.saveSmtpStatus(db, { lastErrorAt: new Date().toISOString(), lastError: String(err.message).slice(0, 300) });
        if (!retry) return false;
        return new Promise((resolve) => { setTimeout(resolve, retryDelays[n]).unref(); }).then(() => attempt(n + 1));
      });
    return attempt(0);
  }

  return { notify, sendTest, configured };
}
