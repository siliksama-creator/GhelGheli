// کش مرورگر برای تصویرهای نسخه‌دار.
//
// کلید = خودِ URL. آپلودها با timestamp-rand ذخیره می‌شوند و بازنویسی
// نمی‌شوند. عوض شدن عکس یعنی URL تازه، یعنی miss، یعنی یک بار دیگر از
// سرور. درخواست دوم و بعد از آن از Cache Storage می‌آید، نه از شبکه.
const CACHE_NAME = 'ghelgheli-img-v1';

export function isVersionedImage(url) {
  const value = String(url || '');
  if (!value) return false;
  const lower = value.toLowerCase();
  if (lower.startsWith('blob:') || lower.startsWith('data:')) return false;
  return lower.includes('/uploads/') || lower.includes('/public/');
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
