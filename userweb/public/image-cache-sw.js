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


// ── Web Push (۲۰۲۶-۰۹-۲۲) — همان اعلان‌های اپِ موبایل روی مرورگر ──────
// پیلودِ سمتِ سرور (notificationService.sendToSubs):
//   { title, body, url, data: { type, ... } }
// این هندلرها به سرویس‌ورکرِ موجود اضافه شده‌اند چون دامنه/اسکوپِ همین
// یکی SW کلِ سایت را پوشش می‌دهد؛ SW دومی در همان اسکوپ ممکن نیست.
self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: 'قلقلی', body: event.data ? event.data.text() : '' };
  }
  const title = payload.title || 'قلقلی';
  const options = {
    body: payload.body || '',
    icon: '/favicon.png',
    badge: '/favicon.png',
    lang: 'fa',
    data: { url: payload.url || '/' },
    // اعلان‌های هم‌نوع همدیگر را به‌روز می‌کنند (صف نمی‌شوند) و نوع‌های
    // متفاوت جدا می‌مانند — همان حسِ اپِ موبایل.
    tag: (payload.data && payload.data.type) ? `gg-${payload.data.type}` : 'gg-push',
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) {
          try { client.navigate(url); } catch { /* مرورگرِ قدیمی */ }
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
      return undefined;
    }),
  );
});
