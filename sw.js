const CACHE_NAME = 'precios-tienda-v2';

const BASE = '/precios-tienda';

const STATIC_ASSETS = [
  BASE + '/',
  BASE + '/index.html',
  BASE + '/styles.css',
  BASE + '/app.js',
  BASE + '/firebase-config.js',
  BASE + '/manifest.json',
  'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.url.includes('firebase') || event.request.url.includes('googleapis')) {
    event.respondWith(fetch(event.request).catch(() => {
      return new Response(
        JSON.stringify({ error: 'Sin conexión' }),
        { status: 503, headers: { 'Content-Type': 'application/json' } }
      );
    }));
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) return cachedResponse;
      return fetch(event.request).then((response) => {
        if (!response || response.status !== 200 || response.type !== 'basic') return response;
        const cloned = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, cloned);
        });
        return response;
      }).catch(() => {
        return new Response(
          JSON.stringify({ error: 'Sin conexión' }),
          { status: 503, headers: { 'Content-Type': 'application/json' } }
        );
      });
    })
  );
});
