import nodemailer from 'nodemailer';
import { h } from './util.js';

/**
 * Email delivery. With SMTP_URL set (e.g. smtps://user:pass@smtp.gmail.com:465)
 * mail is sent for real; otherwise it is only recorded in the outbox table so
 * everything can be inspected from /superadmin during development.
 */
export function createMailer(db, { smtpUrl = process.env.SMTP_URL, from = process.env.MAIL_FROM, transport } = {}) {
  const transporter = transport || (smtpUrl ? nodemailer.createTransport(smtpUrl) : null);
  const sender = from || 'Reviews <no-reply@localhost>';
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
export function emailLayout({ title, body, color = '#4b2bd6', footer = '' }) {
  return `<!doctype html><html lang="he" dir="rtl"><body style="margin:0;background:#f5f6f8;font-family:Arial,sans-serif;color:#1f2330">
<div style="max-width:560px;margin:0 auto;padding:24px 16px">
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
