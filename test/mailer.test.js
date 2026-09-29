import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { createMailer, resendTransport } from '../src/mailer.js';

test('Resend is used over HTTPS, also when configured as an SMTP URL', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push([url, init]);
    return { ok: true, status: 200, text: async () => '{"id":"1"}' };
  };
  const t = resendTransport('re_key', fetchImpl);
  await t.sendMail({ from: 'GoFive <no-reply@gofive.co.il>', to: 'a@x.test,b@x.test', subject: 'S', html: '<p>h</p>' });
  assert.equal(calls[0][0], 'https://api.resend.com/emails');
  assert.equal(calls[0][1].headers.authorization, 'Bearer re_key');
  assert.deepEqual(JSON.parse(calls[0][1].body).to, ['a@x.test', 'b@x.test']);

  const failing = resendTransport('bad', async () => ({ ok: false, status: 403, text: async () => '{"message":"API key is invalid"}' }));
  await assert.rejects(failing.sendMail({ from: 'a', to: 'b', subject: 's' }), /403: API key is invalid/);

  // An SMTP URL for Resend is picked up (and pasted quotes are ignored).
  const mailer = createMailer(openDb(':memory:'), { smtpUrl: ' "smtps://resend:re_x@smtp.resend.com:465" ', resendKey: '' });
  assert.equal(mailer.enabled, true);
});
