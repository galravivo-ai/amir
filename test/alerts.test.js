import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAlerter } from '../src/alerts.js';

test('errors reach the admins by email, the same one once an hour, at most 20 an hour', async () => {
  const sent = [];
  let t = Date.parse('2026-10-17T10:00:00Z');
  const alerter = createAlerter({ mailer: { send: async (m) => sent.push(m) }, adminEmails: () => ['op@example.com'], now: () => t });
  assert.equal(await alerter.report('[jobs] googleReviews failed:', new Error('timeout after 30000ms')), true);
  assert.equal(sent[0].kind, 'error_alert');
  assert.deepEqual(sent[0].to, ['op@example.com']);
  assert.match(sent[0].subject, /googleReviews failed/);
  assert.match(sent[0].html, /timeout after 30000ms/);
  // The same fault (different numbers) within the hour: not again.
  assert.equal(await alerter.report('[jobs] googleReviews failed:', new Error('timeout after 31000ms')), false);
  t += 3601e3;
  assert.equal(await alerter.report('[jobs] googleReviews failed:', new Error('timeout after 30000ms')), true);
  // A flood of different errors stops at 20 an hour.
  let n = 0;
  for (let i = 0; i < 30; i++) if (await alerter.report(`error kind ${'x'.repeat(i)}`)) n++;
  assert.equal(n, 19, '20 in the hour, one already used');
  // console.error is watched, and still prints.
  const printed = [];
  const fake = { error: (...a) => printed.push(a) };
  t += 3601e3;
  alerter.watchConsole(fake);
  fake.error('[http] GET /admin:', new Error('boom'));
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(printed.length, 1);
  assert.match(sent.at(-1).html, /boom/);
});
