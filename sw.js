// ============================================================
// SERVICE WORKER — PWA + Push notifikácie
// ============================================================

const CACHE_NAME = 'vandro-v10';
// Offline mapa: dlaždice stažených oblastí ukládá aplikace do 'vandro-tiles-v1' — tuto cache nikdy nemažeme
const TILE_CACHE = 'vandro-tiles-v1';
const TILE_HOSTS = ['tiles.openfreemap.org', 'tiles.opensnowmap.org', 'server.arcgisonline.com'];
// Obrázky příspěvků (R2 / CDN): cache-first, aby feedy fungovaly i offline. Cache má omezený počet položek.
const IMG_CACHE = 'vandro-img-v1';
const IMG_HOSTS = ['media.vandro.cz', 'cdn.vandro.cz'];
const IMG_MAX_ENTRIES = 300;
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
      await Promise.all(keys.filter((k) => k !== CACHE_NAME && k !== TILE_CACHE && k !== IMG_CACHE).map((k) => caches.delete(k)));
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

  // Obrázky z R2/CDN
  if (IMG_HOSTS.includes(url.hostname) && (req.destination === 'image' || /\.(png|jpe?g|webp|gif|avif)$/i.test(url.pathname))) {
    event.respondWith((async () => {
      const cache = await caches.open(IMG_CACHE);
      const cached = await cache.match(req.url);
      if (cached) return cached;
      try {
        // CORS požadavek → odpověď půjde uložit bez velké "opaque" režie; když server CORS nepovolí, vrátíme obrázek bez ukládání
        let res;
        try { res = await fetch(new Request(req.url, { mode: 'cors', credentials: 'omit' })); }
        catch { return await fetch(req); }
        if (res && res.ok) {
          cache.put(req.url, res.clone()).then(async () => {
            const keys = await cache.keys();
            if (keys.length > IMG_MAX_ENTRIES) await Promise.all(keys.slice(0, keys.length - IMG_MAX_ENTRIES).map((k) => cache.delete(k)));
          }).catch(() => {});
        }
        return res;
      } catch { return Response.error(); }
    })());
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
