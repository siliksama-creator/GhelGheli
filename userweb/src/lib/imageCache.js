// کش مرورگر برای تصویرهای نسخه‌دار.
//
// کلید = خودِ URL. آپلودها با timestamp-rand ذخیره می‌شوند و بازنویسی
// نمی‌شوند. عوض شدن عکس یعنی URL تازه، یعنی miss، یعنی یک بار دیگر از
// سرور. درخواست دوم و بعد از آن از Cache Storage می‌آید، نه از شبکه.
//
// ═══════════════════════════════════════════════════════════════════════════
// ⚠️ باگی که باعث شد کارت‌ها در وب اصلاً دیده نشوند
// ═══════════════════════════════════════════════════════════════════════════
//
// گزارش مالک: «کارت ها در نسخه وب نمایش داده نمیشدن».
//
// سرور مسیرِ **نسبی** برمی‌گرداند: `/uploads/images/....webp`.
// `primeImageCache` همان رشته را مستقیم به `fetch()` می‌داد. مرورگر آن را
// نسبت به **مبدأ صفحه** حل می‌کند، یعنی:
//
//     https://user.ghelghelishop.ir/uploads/images/....webp   ← غلط
//     https://api.ghelghelishop.ir/uploads/images/....webp    ← درست
//
// روی دامنهٔ user هیچ فایلی آنجا نیست، ولی nginx برای SPA این قاعده را
// دارد: `try_files $uri /index.html`. پس به‌جای ۴۰۴، **۲۰۰ با
// index.html** برمی‌گرداند (۱۴۷۸ بایت، `text/html`).
//
// `response.ok` برای آن true است، پس آن HTML به‌عنوان «تصویر» در
// Cache Storage ذخیره می‌شد. بعد `lookupCachedImage` همان را می‌خواند،
// از آن blob می‌ساخت و به تگ `<img>` می‌داد — و مرورگر نمی‌توانست
// رمزگشایی کند. نتیجه: هیچ خطای شبکه‌ای، هیچ ۴۰۴، فقط کارتِ خالی.
//
// این بدترین نوع باگ است: همه‌چیز «موفق» گزارش می‌شود.
//
// دو محافظ اضافه شد:
//   ۱. URL قبل از fetch با `asset()` مطلق می‌شود (رفع علت اصلی).
//   ۲. فقط پاسخی کش می‌شود که واقعاً `image/*` باشد (رفع کلاسِ باگ).
//
// نام کش حالا v4 است: v3 فایلِ کامل را prime می‌کرد ولی کامپوننت variant
// ۴۸۰ را می‌خواست؛ پاک شدنش هم فضای نسخه‌های تکراری را پس می‌دهد.
import { asset } from './api.js';

const CACHE_NAME = 'ghelgheli-img-v4';

/**
 * فقط پاسخی که واقعاً تصویر است ارزشِ کش شدن دارد.
 *
 * بدونِ این، هر پاسخِ ۲۰۰ای (از جمله index.html که nginx برای مسیرهای
 * ناموجود می‌دهد) به‌عنوان تصویر ذخیره می‌شود و بعداً به شکلِ کارتِ
 * خالی ظاهر می‌شود — بدونِ هیچ خطایی در کنسول.
 */
function isImageResponse(response) {
  if (!response || !response.ok) return false;
  const type = String(response.headers.get('content-type') || '').toLowerCase();
  return type.startsWith('image/');
}
const CARD_IMAGE_KEYS = new Set([
  'imageUrl', 'image_url', 'frontImageUrl', 'front_image_url',
]);
const AVATAR_IMAGE_KEYS = new Set([
  'profileImageUrl', 'profile_image_url',
]);
const IMAGE_KEYS = new Set([...CARD_IMAGE_KEYS, ...AVATAR_IMAGE_KEYS]);

/** همان variantی که کامپوننت واقعاً می‌خواهد وارد cache می‌شود. */
export function cacheVariantUrl(url, key = '') {
  const value = String(url || '').trim();
  if (!value || value.includes('?') || !value.includes('/uploads/images/')) {
    return value;
  }
  // کارت در همهٔ نماها یک فایل ۴۸۰ دارد؛ CSS آن را کوچک می‌کند. آواتار
  // کوچک‌تر است. قبل از این، prime اصل تصویر را می‌گرفت ولی <CachedImg>
  // بلافاصله ?w=240/480 می‌خواست — یعنی prewarm کاملاً بی‌اثر و دوبرابر.
  const width = AVATAR_IMAGE_KEYS.has(key) ? 240 : 480;
  return `${value}?w=${width}`;
}

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
      if (isVersionedImage(url)) out.add(cacheVariantUrl(url, key));
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
        // ⚠️ `asset()` اجباری است: URLهای نسبی نسبت به دامنهٔ وب‌اپ حل
        //    می‌شوند نه دامنهٔ API. توضیح کامل بالای فایل.
        const absolute = asset(url);
        const hit = await cache.match(absolute);
        if (hit) return;
        const response = await fetch(absolute, {
          mode: 'cors',
          credentials: 'omit',
          cache: 'force-cache',
        });
        if (isImageResponse(response)) await cache.put(absolute, response.clone());
      }));
    }
  } catch {
    // Cache API unsupported / private mode.
  }
}

export async function lookupCachedImage(url) {
  if (!url || typeof caches === 'undefined') return url;
  if (!isVersionedImage(url)) return url;
  // همان دلیلِ primeImageCache: بدونِ مطلق‌سازی، درخواست به دامنهٔ اشتباه
  // می‌رود و index.html می‌گیرد.
  const absolute = asset(url);
  try {
    const cache = await caches.open(CACHE_NAME);
    const hit = await cache.match(absolute);
    if (hit) {
      // ⚠️ `blob.size > 0` کافی نیست — index.html هم اندازه دارد.
      //    نوعِ محتوا باید تصویر باشد وگرنه تگ img نمی‌تواند رمزگشایی
      //    کند و کاربر کارتِ خالی می‌بیند.
      const type = String(hit.headers.get('content-type') || '').toLowerCase();
      if (type.startsWith('image/')) {
        const blob = await hit.blob();
        if (blob.size > 0) return URL.createObjectURL(blob);
      }
      // ورودیِ معیوبِ به‌جامانده از نسخهٔ قبل: پاکش کن و دوباره بگیر.
      await cache.delete(absolute);
    }
    const response = await fetch(absolute, {
      mode: 'cors',
      credentials: 'omit',
      cache: 'force-cache',
    });
    if (!isImageResponse(response)) return absolute;
    await cache.put(absolute, response.clone());
    const blob = await response.blob();
    return blob.size > 0 ? URL.createObjectURL(blob) : absolute;
  } catch {
    // CORS یا مرورگر بدون Cache API: خود تگ img و هدر immutable سرور.
    return absolute;
  }
}

export function registerImageCacheWorker() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  if (typeof location === 'undefined' || location.protocol !== 'https:') return;
  navigator.serviceWorker.register('/image-cache-sw.js').catch(() => {});
}
