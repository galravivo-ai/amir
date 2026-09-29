import nodemailer from 'nodemailer';
import { h } from './util.js';

/**
 * Sends through Resend's HTTPS API. Many hosts (Railway on its Trial and
 * Hobby plans among them) block outbound SMTP, so HTTPS is the safe default.
 */
export function resendTransport(apiKey, fetchImpl = globalThis.fetch) {
  return {
    async sendMail({ from, to, subject, html, text }) {
      const res = await fetchImpl('https://api.resend.com/emails', {
        method: 'POST',
        headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({ from, to: String(to).split(','), subject, html, text }),
        signal: AbortSignal.timeout(20e3),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        let msg = body;
        try {
          msg = JSON.parse(body).message || body;
        } catch {
          /* not JSON */
        }
        throw new Error(`Resend ${res.status}: ${msg}`.slice(0, 400));
      }
    },
  };
}

/** Picks the transport: RESEND_API_KEY, or SMTP_URL (Resend SMTP URLs go over HTTPS too). */
function transportFor(smtpUrl, resendKey) {
  if (resendKey) return resendTransport(resendKey);
  if (!smtpUrl) return null;
  try {
    const u = new URL(smtpUrl);
    if (u.hostname === 'smtp.resend.com' && u.password) return resendTransport(decodeURIComponent(u.password));
  } catch {
    /* let nodemailer report a malformed URL */
  }
  // Fail fast instead of leaving a request hanging when the port is blocked.
  return nodemailer.createTransport(smtpUrl, { connectionTimeout: 10e3, greetingTimeout: 10e3, socketTimeout: 20e3 });
}

/**
 * Email delivery. With RESEND_API_KEY or SMTP_URL set (e.g.
 * smtps://user:pass@smtp.gmail.com:465) mail is sent for real; otherwise it is
 * only recorded in the outbox table so everything can be inspected from
 * /superadmin during development.
 */
export function createMailer(
  db,
  { smtpUrl = process.env.SMTP_URL, resendKey = process.env.RESEND_API_KEY, from = process.env.MAIL_FROM, transport } = {},
) {
  // Values pasted into a hosting dashboard often carry stray spaces or quotes.
  const clean = (v) => String(v ?? '').trim().replace(/^["']|["']$/g, '').trim();
  const transporter = transport || transportFor(clean(smtpUrl), clean(resendKey));
  const sender = clean(from) || 'Reviews <no-reply@localhost>';
  const log = db.prepare(
    'INSERT INTO outbox (business_id, kind, to_addr, subject, body, status, error) VALUES (?, ?, ?, ?, ?, ?, ?)',
  );

  return {
    enabled: Boolean(transporter),
    /** Never throws: failures are logged in the outbox. */
    async send({ to, subject, html, text, kind = 'general', businessId = null }) {
      const recipients = [].concat(to).map((x) => String(x).trim()).filter(Boolean);
      if (!recipients.length) return false;
      const body = html || `<pre>${h(text)}</pre>`;
      if (!transporter) {
        log.run(businessId, kind, recipients.join(','), subject, body, 'logged', '');
        return true;
      }
      try {
        await transporter.sendMail({ from: sender, to: recipients.join(','), subject, html: body, text });
        log.run(businessId, kind, recipients.join(','), subject, body, 'sent', '');
        return true;
      } catch (err) {
        console.warn(`[mail] ${kind} to ${recipients.join(',')} failed: ${err.message}`);
        log.run(businessId, kind, recipients.join(','), subject, body, 'failed', String(err.message).slice(0, 500));
        return false;
      }
    },
  };
}

/** Wraps email content in a simple RTL Hebrew layout. */
/**
 * `brand: true` puts the product logo on top. Only for emails from the
 * platform itself; emails about a business carry that business's colors.
 */
export function emailLayout({ title, body, color = '#4b2bd6', footer = '', brand = false }) {
  const base = String(process.env.PUBLIC_URL ?? '').replace(/\/$/, '');
  const logo =
    brand && base && (process.env.BRAND_NAME || 'GoFive') === 'GoFive'
      ? `<div style="text-align:right;margin:0 0 14px"><img src="${h(base)}/static/brand/gofive-logo-email.png" width="180" height="44" alt="GoFive" style="display:inline-block;border:0"></div>`
      : '';
  return `<!doctype html><html lang="he" dir="rtl"><body style="margin:0;background:#f5f6f8;font-family:Arial,sans-serif;color:#1f2330">
<div style="max-width:560px;margin:0 auto;padding:24px 16px">
${logo}
<div style="background:#fff;border-radius:12px;padding:24px;border-top:4px solid ${color};text-align:right">
<h2 style="margin:0 0 12px">${h(title)}</h2>
${body}
</div>
<p style="color:#6b7280;font-size:12px;text-align:center">${footer}</p>
</div></body></html>`;
}

export function emailButton(url, label, color = '#4b2bd6') {
  return `<p style="margin:20px 0"><a href="${h(url)}" style="background:${color};color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block">${h(label)}</a></p>`;
}
