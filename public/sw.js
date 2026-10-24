// Service worker: shows push notifications and opens the right page on tap.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

// Without a connection, a page opened from the app shows a short note instead
// of the browser's error page. Nothing is cached: the data is always live.
const OFFLINE = `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>אין חיבור</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:system-ui,sans-serif;background:#1d1650;color:#fff;text-align:center;padding:24px;box-sizing:border-box}
h1{font-size:1.3rem;margin:0 0 8px}p{opacity:.8;margin:0 0 20px}button{font:inherit;font-weight:700;border:0;border-radius:12px;padding:12px 22px;background:#7a5cff;color:#fff}</style></head>
<body><div><h1>אין חיבור לאינטרנט</h1><p>ברגע שהחיבור יחזור, הנתונים יופיעו כאן.</p><button onclick="location.reload()">לנסות שוב</button></div></body></html>`;

self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') return;
  event.respondWith(fetch(event.request).catch(() => new Response(OFFLINE, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })));
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: event.data ? event.data.text() : '' };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'התראה חדשה', {
      body: data.body || '',
      icon: '/static/icons/icon-192.png',
      badge: '/static/icons/badge-96.png',
      dir: 'rtl',
      lang: 'he',
      tag: data.tag || undefined,
      data: { url: data.url || '/admin' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/admin', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if (w.url.startsWith(self.location.origin) && 'focus' in w) {
          w.navigate(url);
          return w.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
