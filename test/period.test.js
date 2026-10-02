import { test } from 'node:test';
import assert from 'node:assert/strict';
import { midnight, resolvePeriod } from '../src/period.js';

// 2 Oct 2026, 10:00 in Israel (UTC+3, summer time).
const NOW = Date.UTC(2026, 9, 2, 7, 0, 0);

test('Israel midnight', () => {
  assert.equal(new Date(midnight(2026, 9, 2)).toISOString(), '2026-10-01T21:00:00.000Z');
  // Winter time is UTC+2.
  assert.equal(new Date(midnight(2026, 11, 1)).toISOString(), '2026-11-30T22:00:00.000Z');
});

test('presets', () => {
  const today = resolvePeriod({ range: 'today' }, NOW);
  assert.equal(today.from, midnight(2026, 9, 2));
  assert.equal(today.to, null, 'ranges that reach now stay open');
  assert.equal(today.label, 'היום');

  const y = resolvePeriod({ range: 'yesterday' }, NOW);
  assert.equal(y.from, midnight(2026, 9, 1));
  assert.equal(y.to, midnight(2026, 9, 2));

  const lm = resolvePeriod({ range: 'last_month' }, NOW);
  assert.equal(lm.from, midnight(2026, 8, 1));
  assert.equal(lm.to, midnight(2026, 9, 1));
  assert.equal(lm.fromDay, '2026-09-01');
  assert.equal(lm.toDay, '2026-09-30');
  assert.equal(lm.days, 30);

  assert.equal(resolvePeriod({ range: 'this_year' }, NOW).from, midnight(2026, 0, 1));
  assert.equal(resolvePeriod({ days: '90' }, NOW).key, '90d', 'old links with ?days= still work');
  assert.equal(resolvePeriod({ range: 'nonsense' }, NOW).key, '30d');
});

test('custom range', () => {
  const p = resolvePeriod({ range: 'custom', from: '2026-09-01', to: '2026-09-15' }, NOW);
  assert.equal(p.from, midnight(2026, 8, 1));
  assert.equal(p.to, midnight(2026, 8, 16), 'the last day is included');
  assert.match(p.label, /^בין 1\.9\.2026 ל-15\.9\.2026$/);

  const swapped = resolvePeriod({ range: 'custom', from: '2026-09-15', to: '2026-09-01' }, NOW);
  assert.equal(swapped.from, p.from);
  assert.equal(swapped.to, p.to);

  const open = resolvePeriod({ range: 'custom', from: '2026-09-20', to: '2026-10-02' }, NOW);
  assert.equal(open.to, null, 'a range ending today stays open');

  const long = resolvePeriod({ range: 'custom', from: '2000-01-01', to: '2026-09-30' }, NOW);
  assert.equal(long.days, 731, 'capped at two years');

  assert.equal(resolvePeriod({ range: 'custom', from: 'bad' }, NOW).key, '30d');
});
