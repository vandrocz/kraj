// ============================================================
// SERVICE WORKER — PWA + Push notifikácie
// ============================================================

const CACHE_NAME = 'vandro-v4';
// Offline mapa: dlaždice stažených oblastí ukládá aplikace do 'vandro-tiles-v1' — tuto cache nikdy nemažeme
const TILE_CACHE = 'vandro-tiles-v1';
const TILE_HOSTS = ['tiles.openfreemap.org', 'tiles.opensnowmap.org', 'server.arcgisonline.com'];
const PRECACHE = [
  '/',
  '/index.html',
  '/assets/styles.css',
  '/manifest.json',
  '/assets/map-style.json',
  '/assets/map-style-topo.json',
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
      await Promise.all(keys.filter((k) => k !== CACHE_NAME && k !== TILE_CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  if (req.method !== 'GET') return;

  // Mapové dlaždice / fonty / sprite — cache-first z cache stažených oblastí, jinak síť
  if (TILE_HOSTS.includes(url.hostname)) {
    event.respondWith(
      caches.open(TILE_CACHE).then(async (cache) => {
        const cached = await cache.match(req);
        if (cached) return cached;
        try { return await fetch(req); } catch (e) { return Response.error(); }
      }),
    );
    return;
  }

  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  const isHtml = req.headers.get('accept')?.includes('text/html') ||
                 url.pathname === '/' ||
                 url.pathname === '/index.html';

  if (isHtml) {
    event.respondWith(
      fetch(req).then((res) => {
        if (res && res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone)).catch(() => {});
        }
        return res;
      }).catch(() => caches.match(req).then((cached) => cached || caches.match('/index.html'))),
    );
    return;
  }

  // Skripty, styly a JSON: nejdřív síť (nová verze se projeví hned), cache jen jako záloha offline
  event.respondWith(
    fetch(req).then((res) => {
      if (res && res.status === 200 && res.type === 'basic') {
        const clone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, clone)).catch(() => {});
      }
      return res;
    }).catch(() => caches.match(req)),
  );
});

self.addEventListener('push', (event) => {
  let data = { title: 'VANDRO', body: 'Nová notifikace', url: '/' };
  try { if (event.data) data = { ...data, ...event.data.json() }; }
  catch (e) { try { data.body = event.data.text(); } catch {} }

  const options = {
    body: data.body || '',
    icon: data.icon || 'https://cdn.vandro.cz/Untitled15_20260522160351.png',
    badge: 'https://cdn.vandro.cz/Untitled15_20260522160351.png',
    data: { url: data.url || '/' },
    tag: data.tag || 'vandro',
    renotify: true,
  };

  event.waitUntil(self.registration.showNotification(data.title || 'VANDRO', options));
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
