// ============================================================
// SERVICE WORKER — PWA + Push notifikácie
// ============================================================

const CACHE_NAME = 'naskraj-v1';
const PRECACHE = [
  '/',
  '/index.html',
  '/assets/styles.css',
  '/manifest.json',
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE).catch(() => {})),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;
  if (req.method !== 'GET') return;

  if (url.pathname.startsWith('/assets/') || url.pathname === '/' || url.pathname === '/index.html' || url.pathname === '/manifest.json') {
    event.respondWith(
      caches.match(req).then((cached) => cached || fetch(req).then((res) => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, clone)).catch(() => {});
        return res;
      }).catch(() => cached)),
    );
    return;
  }

  event.respondWith(fetch(req).catch(() => caches.match(req)));
});

self.addEventListener('push', (event) => {
  let data = { title: 'Náš kraj', body: 'Nová notifikace', url: '/' };
  try { if (event.data) data = { ...data, ...event.data.json() }; }
  catch (e) { try { data.body = event.data.text(); } catch {} }

  const options = {
    body: data.body || '',
    icon: data.icon || 'https://cdn.vandro.cz/Untitled15_20260522160351.png',
    badge: 'https://cdn.vandro.cz/Untitled15_20260522160351.png',
    data: { url: data.url || '/' },
    tag: data.tag || 'naskraj',
    renotify: true,
  };

  event.waitUntil(self.registration.showNotification(data.title || 'Náš kraj', options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const c of clients) {
        if (c.url.includes(self.location.origin)) return c.focus().then(() => c.navigate(url));
      }
      return self.clients.openWindow(url);
    }),
  );
});
