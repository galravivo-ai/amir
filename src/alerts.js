import { emailLayout } from './mailer.js';
import { h } from './util.js';

// Every error the server logs reaches the system admins by email, so a fault
// is known before a customer complains. The same error is sent once an hour,
// and at most 20 alerts go out in an hour, so a broken loop can't flood the inbox.

const HOUR = 3600e3;
const MAX_PER_HOUR = 20;

const text = (a) => (a instanceof Error ? `${a.message}\n${a.stack || ''}` : typeof a === 'string' ? a : (() => { try { return JSON.stringify(a); } catch { return String(a); } })());

export function createAlerter({ mailer, adminEmails, now = () => Date.now() }) {
  const lastSent = new Map();
  let windowStart = 0;
  let sentInWindow = 0;
  let sending = false;

  /** `args` are what was passed to console.error. Returns true when an email went out. */
  async function report(...args) {
    // Never alert about the alert (a failing mail server would loop).
    if (sending) return false;
    const message = args.map(text).join(' ').trim();
    if (!message) return false;
    const first = message.split('\n')[0].slice(0, 160);
    // Numbers and ids change between repeats of the same fault.
    const signature = first.replace(/\d+/g, '#');
    const t = now();
    if (lastSent.has(signature) && t - lastSent.get(signature) < HOUR) return false;
    if (t - windowStart > HOUR) {
      windowStart = t;
      sentInWindow = 0;
    }
    if (sentInWindow >= MAX_PER_HOUR) return false;
    const to = adminEmails();
    if (!to.length) return false;
    lastSent.set(signature, t);
    sentInWindow++;
    sending = true;
    try {
      await mailer.send({
        kind: 'error_alert',
        to,
        subject: `⚠ תקלה במערכת: ${first.slice(0, 90)}`,
        html: emailLayout({
          title: 'תקלה במערכת',
          brand: true,
          body: `<p>השרת רשם שגיאה ב-${h(new Date(t).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' }))}.</p>
            <pre dir="ltr" style="white-space:pre-wrap;font:12px/1.5 monospace;background:#f6f6f9;border:1px solid #e4e4ec;border-radius:8px;padding:12px;text-align:left">${h(message.split('\n').slice(0, 25).join('\n'))}</pre>
            <p style="color:#6b7280;font-size:13px">אותה שגיאה לא תישלח שוב בשעה הקרובה. הלוג המלא נמצא ב-Railway.</p>`,
        }),
      });
      return true;
    } catch {
      return false;
    } finally {
      sending = false;
    }
  }

  /** Sends whatever console.error logs (the original still prints). */
  function watchConsole(console_ = console) {
    const original = console_.error.bind(console_);
    console_.error = (...args) => {
      original(...args);
      report(...args).catch(() => {});
    };
    return () => {
      console_.error = original;
    };
  }

  return { report, watchConsole };
}
