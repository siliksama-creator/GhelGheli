/* فقط چانک‌های hashدار. ۴۰۴ِ immutableِ قبلی را دور می‌زند و HTML را
 * به‌جای اسکریپت کش نمی‌کند. منطق با بلوکِ gg-chunk-v1 در
 * userweb/public/image-cache-sw.js یکی است. */
const CHUNK_CACHE = 'gg-chunk-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

function isHashedAsset(url) {
  return url.origin === self.location.origin
    && url.pathname.indexOf('/assets/') === 0
    && /\.(?:js|css)$/.test(url.pathname);
}

async function serveHashedAsset(request) {
  const cache = await caches.open(CHUNK_CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request.url, { cache: 'reload', credentials: 'same-origin' });
  const type = String(res.headers.get('content-type') || '').toLowerCase();
  const script = type.includes('javascript') || type.includes('ecmascript') || type.includes('text/css') || type.includes('css');
  if (res.ok && script) {
    try { await cache.put(request, res.clone()); } catch { /* quota */ }
  }
  return res;
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  let url;
  try { url = new URL(event.request.url); } catch { return; }
  if (!isHashedAsset(url)) return;
  event.respondWith(serveHashedAsset(event.request).catch(() => fetch(event.request)));
});
