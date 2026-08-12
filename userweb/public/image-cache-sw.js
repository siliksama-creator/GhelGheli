/* کش تصویر نسخه‌دار. URL همان نسخه است؛ miss فقط وقتی نام/هش عوض شود. */
const CACHE_NAME = 'ghelgheli-img-v2';
const VERSIONED = /\/uploads\/|\/public\//;

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = request.url;
  if (!VERSIONED.test(url)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const hit = await cache.match(url);
    if (hit) return hit;
    const response = await fetch(request);
    if (response && response.ok) {
      cache.put(url, response.clone());
    }
    return response;
  })());
});
