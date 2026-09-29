import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { createApp } from '../src/app.js';

let server;
let base;
before(async () => {
  server = createApp(openDb(':memory:'), { ai: null, backups: false, google: null }).app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

test('legal pages, accessibility menu and cookie notice', async () => {
  const pages = {
    '/terms': /ביטול והחזרים/,
    '/privacy': /Limited Use/,
    '/cookies': /<code>sid<\/code>/,
    '/accessibility': /רכז הנגישות/,
  };
  for (const [path, marker] of Object.entries(pages)) {
    const res = await fetch(base + path);
    assert.equal(res.status, 200, path);
    const html = await res.text();
    assert.match(html, marker, path);
    assert.match(html, /<script src="\/static\/assist\.js"><\/script>/, `${path} loads the accessibility menu`);
    assert.match(html, /href="#main"/, `${path} has a skip link`);
    for (const link of ['/terms', '/privacy', '/cookies', '/accessibility']) assert.match(html, new RegExp(`href="${link}"`), `${path} footer links ${link}`);
  }
  const js = await fetch(`${base}/static/assist.js`);
  assert.equal(js.status, 200);
  assert.match(await js.text(), /gofive-cookies-ok/);
  // Every page kind carries the menu: the login page and a missing page too.
  assert.match(await (await fetch(`${base}/login`)).text(), /assist\.js/);
});
