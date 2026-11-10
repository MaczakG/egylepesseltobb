// E-mail értesítések SMTP-n (pl. Google Workspace vagy Microsoft 365 alkalmazásjelszóval).
// A látogatók minden beküldése (támogatói jelentkezés, kapcsolat, programjelentkezés, díjjelölés) és minden
// sikeres fizetés után levél megy az adminban megadott címekre. A küldés a háttérben fut: hiba esetén a
// beküldés ettől még sikeres, a hibát a napló és az admin Beállítások oldala mutatja.
import nodemailer from 'nodemailer';
import * as store from './db.js';
import { escapeHtml } from './render.js';

export function createMailer(db, { transportFactory = (opts) => nodemailer.createTransport(opts) } = {}) {
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
    html: renderHtml({ subject, intro, rows, link }),
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
    return transport(s).sendMail(message(s, mail))
      .then(() => {
        store.saveSmtpStatus(db, { lastSentAt: new Date().toISOString(), lastError: '' });
        return true;
      })
      .catch((err) => {
        console.error(`E-mail értesítés hiba (${mail.subject}): ${err.message}`);
        store.saveSmtpStatus(db, { lastErrorAt: new Date().toISOString(), lastError: String(err.message).slice(0, 300) });
        return false;
      });
  }

  return { notify, sendTest, configured };
}

function renderHtml({ subject, intro, rows, link }) {
  const tr = rows.map(([k, v]) => `<tr><th align="left" valign="top" style="padding:6px 16px 6px 0;color:#64748b;font-weight:600;white-space:nowrap">${escapeHtml(k)}</th><td style="padding:6px 0;color:#0f172a;white-space:pre-line">${escapeHtml(String(v))}</td></tr>`).join('');
  return `<!doctype html><html lang="hu"><body style="margin:0;padding:24px;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5">
<div style="max-width:640px;margin:0 auto;background:#fff;border-radius:8px;border-top:4px solid #c9a96e;padding:24px">
<h1 style="margin:0 0 12px;font-size:18px;color:#1a252d">${escapeHtml(subject)}</h1>
${intro ? `<p style="margin:0 0 16px;color:#334155">${escapeHtml(intro)}</p>` : ''}
${tr ? `<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%">${tr}</table>` : ''}
${link ? `<p style="margin:20px 0 0"><a href="${escapeHtml(link)}" style="display:inline-block;background:#334758;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:600">Megnyitás az adminban</a></p>` : ''}
</div>
<p style="max-width:640px;margin:12px auto 0;color:#94a3b8;font-size:12px">Automatikus értesítés az egylepesseltobb.hu weboldalról.</p>
</body></html>`;
}
