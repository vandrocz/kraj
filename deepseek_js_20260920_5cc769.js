// ============================================================
// SERVICE WORKER — Web Push
// ============================================================

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = { title: 'Náš kraj', body: 'Nová notifikace', url: '/' };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch (e) {
    try { data.body = event.data.text(); } catch {}
  }

  const options = {
    body: data.body || '',
    icon: data.icon || '/assets/og-default.jpg',
    badge: '/assets/og-default.jpg',
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
        if (c.url.includes(self.location.origin)) {
          return c.focus().then(() => c.navigate(url));
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});