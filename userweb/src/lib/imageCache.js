// کش مرورگر برای تصویرهای نسخه‌دار.
//
// کلید = خودِ URL. آپلودها با timestamp-rand ذخیره می‌شوند و بازنویسی
// نمی‌شوند. عوض شدن عکس یعنی URL تازه، یعنی miss، یعنی یک بار دیگر از
// سرور. درخواست دوم و بعد از آن از Cache Storage می‌آید، نه از شبکه.
const CACHE_NAME = 'ghelgheli-img-v2';
const IMAGE_KEYS = new Set([
  'imageUrl', 'image_url', 'frontImageUrl', 'front_image_url',
  'profileImageUrl', 'profile_image_url',
]);

export function isVersionedImage(url) {
  const value = String(url || '');
  if (!value) return false;
  const lower = value.toLowerCase();
  if (lower.startsWith('blob:') || lower.startsWith('data:')) return false;
  return lower.includes('/uploads/') || lower.includes('/public/');
}

export function collectVersionedImages(payload, out = new Set()) {
  if (!payload) return out;
  if (Array.isArray(payload)) {
    for (const item of payload) collectVersionedImages(item, out);
    return out;
  }
  if (typeof payload !== 'object') return out;
  for (const [key, value] of Object.entries(payload)) {
    if (IMAGE_KEYS.has(key)) {
      const url = String(value || '').trim();
      if (isVersionedImage(url)) out.add(url);
    }
    collectVersionedImages(value, out);
  }
  return out;
}

export async function primeImageCache(payload) {
  if (typeof caches === 'undefined') return;
  const urls = [...collectVersionedImages(payload)];
  if (!urls.length) return;
  try {
    const cache = await caches.open(CACHE_NAME);
    for (let i = 0; i < urls.length; i += 4) {
      const chunk = urls.slice(i, i + 4);
      await Promise.all(chunk.map(async (url) => {
        const hit = await cache.match(url);
        if (hit) return;
        const response = await fetch(url, {
          mode: 'cors',
          credentials: 'omit',
          cache: 'force-cache',
        });
        if (response.ok) await cache.put(url, response.clone());
      }));
    }
  } catch {
    // Cache API unsupported / private mode.
  }
}

export async function lookupCachedImage(url) {
  if (!url || typeof caches === 'undefined') return url;
  if (!isVersionedImage(url)) return url;
  try {
    const cache = await caches.open(CACHE_NAME);
    const hit = await cache.match(url);
    if (hit) {
      const blob = await hit.blob();
      if (blob.size > 0) return URL.createObjectURL(blob);
    }
    const response = await fetch(url, {
      mode: 'cors',
      credentials: 'omit',
      cache: 'force-cache',
    });
    if (!response.ok) return url;
    await cache.put(url, response.clone());
    const blob = await response.blob();
    return blob.size > 0 ? URL.createObjectURL(blob) : url;
  } catch {
    // CORS یا مرورگر بدون Cache API: خود تگ img و هدر immutable سرور.
    return url;
  }
}

export function registerImageCacheWorker() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  if (typeof location === 'undefined' || location.protocol !== 'https:') return;
  navigator.serviceWorker.register('/image-cache-sw.js').catch(() => {});
}
