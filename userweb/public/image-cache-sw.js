/* کش تصویر نسخه‌دار. URL همان نسخه است؛ miss فقط وقتی نام/هش عوض شود.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠️ چرا `response.ok` به‌تنهایی کافی نیست
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * دقیقاً همان باگی که کارت‌ها را در وب نامرئی کرد (توضیح کامل در
 * `src/lib/imageCache.js`): وقتی مسیرِ تصویر به دامنهٔ وب‌اپ برود،
 * nginx به‌خاطر قاعدهٔ SPA (`try_files $uri /index.html`) پاسخِ
 * **۲۰۰ با index.html** می‌دهد، نه ۴۰۴.
 *
 * `response.ok` برای آن true است، پس HTML به‌عنوان تصویر کش می‌شد و
 * دفعهٔ بعد همان به تگ `<img>` می‌رسید — بدونِ هیچ خطایی در کنسول.
 *
 * حالا فقط پاسخی با `content-type: image/*` کش می‌شود.
 *
 * نام کش نسخه‌دار است تا ورودی‌های مسموم/variantهای قدیمی خودبه‌خود دور ریخته
 * شوند؛ `activate` هم کش‌های قدیمی را پاک می‌کند.
 */
const CACHE_NAME = 'ghelgheli-img-v4';
const VERSIONED = /\/uploads\/|\/public\//;

function isImageResponse(response) {
  if (!response || !response.ok) return false;
  const type = String(response.headers.get('content-type') || '').toLowerCase();
  return type.startsWith('image/');
}

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  // پاکسازی کش‌های نسخه‌های قبل — بدونِ این، کاربری که یک بار
  // index.html را به‌جای تصویر کش کرده تا ابد کارتِ خالی می‌بیند.
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names
      .filter(n => n.startsWith('ghelgheli-img-') && n !== CACHE_NAME)
      .map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = request.url;
  if (!VERSIONED.test(url)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const hit = await cache.match(url);
    if (hit) {
      const type = String(hit.headers.get('content-type') || '').toLowerCase();
      if (type.startsWith('image/')) return hit;
      // ورودیِ معیوبِ به‌جامانده: دور بریز و از شبکه بگیر.
      await cache.delete(url);
    }
    const response = await fetch(request);
    if (isImageResponse(response)) cache.put(url, response.clone());
    return response;
  })());
});
