const CACHE_NAME = 'spendwise-shell-v2';
const APP_SHELL = ['/', '/manifest.webmanifest', '/icons/spendwise.svg', '/icons/spendwise-192.png', '/icons/spendwise-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(APP_SHELL);
    const page = await cache.match('/');
    const html = await page.text();
    const assets = [...html.matchAll(/(?:src|href)="([^"]*\/assets\/[^"]+)"/g)].map((match) => match[1]);
    await cache.addAll(assets);
  })());
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/v1/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then((response) => {
      if (response.ok) {
        const copy = response.clone();
        void caches.open(CACHE_NAME).then((cache) => cache.put('/', copy));
      }
      return response;
    }).catch(async () => (await caches.match('/')) || Response.error()));
    return;
  }

  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(caches.match(request).then((cached) => {
      const update = fetch(request).then((response) => {
        if (response.ok) void caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
        return response;
      });
      return cached || update;
    }));
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
    const appWindow = clients.find((client) => client.url.startsWith(self.location.origin) && 'focus' in client);
    return appWindow ? appWindow.focus() : self.clients.openWindow(target);
  }));
});
