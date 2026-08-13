// Shared HTTP layer for the user web app.
//
// Extracted from main.jsx so every screen speaks to the backend the same way
// and error handling lives in exactly one place.
export const API =
  import.meta.env.VITE_API_BASE || 'https://api.ghelghelishop.ir';

// ═══════════════════════════════════════════════════════════════════════════
// کشِ شرطیِ داده با ETag
// ═══════════════════════════════════════════════════════════════════════════
//
// ── خواستهٔ مالک ──
//
//   «وقتی کارتی در موبایل یا وب لود میشه باید کش بشه که دیگه به سیستم فشار
//    نیاد ولی اگه تغییری در کارت در سرور به وجود اومد دوباره از سیستم خودشو
//    بروز کنه»
//
// ── چیزی که از قبل درست بود ──
//
// **تصویرها** مشکلی نداشتند: نامشان `timestamp-rand.webp` است و هرگز
// بازنویسی نمی‌شوند، پس عوض شدنِ عکس یعنی URLِ تازه یعنی خودبه‌خود باطل
// شدنِ کش. سرور هم `max-age=31536000, immutable` می‌دهد.
//
// ── چیزی که واقعاً کم بود ──
//
// **متادیتای JSON**. هر بار که کاربر اینونتوری یا آرنا را باز می‌کرد، کلِ
// فهرستِ کارت‌ها دوباره از شبکه می‌آمد — حتی وقتی حرفی عوض نشده بود. روی
// اینترنتِ موبایلِ ایران این یعنی چند صد کیلوبایتِ تکراری و ثانیه‌ها انتظار.
//
// اکسپرس از قبل `ETag` می‌فرستد (آزموده شد: درخواستِ دوم با
// `If-None-Match` جوابِ `304` با بدنهٔ صفر می‌گیرد). ولی هیچ‌کدام از
// کلاینت‌ها از آن استفاده نمی‌کردند.
//
// حالا می‌کنند: پاسخِ هر GET همراه با ETagش نگه داشته می‌شود و درخواستِ
// بعدی `If-None-Match` می‌فرستد. اگر سرور `304` بدهد، همان دادهٔ ذخیره‌شده
// برمی‌گردد و **هیچ بایتی از بدنه دانلود نمی‌شود**. اگر داده عوض شده باشد،
// سرور ۲۰۰ با بدنهٔ تازه می‌دهد و کش خودش را به‌روز می‌کند.
//
// ── چرا در حافظه و نه localStorage ──
//
// localStorage همگام است و روی رشتهٔ اصلی می‌نویسد؛ برای پاسخ‌های چند صد
// کیلوبایتی یعنی پرشِ محسوس در UI. هدف اینجا حذفِ رفت‌وبرگشتِ شبکه در طولِ
// یک نشست است، نه ماندگاری بینِ نشست‌ها — آن کار را کشِ تصویر می‌کند که
// واقعاً حجیم است.
const etagCache = new Map();
// سقف: بدونِ آن، کاربری که ساعت‌ها در اپ می‌ماند و ده‌ها مسیر را باز
// می‌کند حافظه را بی‌نهایت بزرگ می‌کند.
const ETAG_CACHE_MAX = 60;

function cacheKey(path, token) {
  // توکن در کلید هست چون پاسخِ `/api/me` برای دو کاربر یکی نیست. بدونِ
  // این، خروج و ورود با حسابِ دیگر دادهٔ نفرِ قبلی را نشان می‌داد.
  return `${token ? token.slice(-12) : 'anon'}|${path}`;
}

/** بعد از هر تغییر (خرید، ثبت کارت، ...) کشِ خوانده‌ها باید بی‌اعتبار شود. */
export function clearDataCache() {
  etagCache.clear();
}

/**
 * One request. Throws an Error carrying `.status` and `.data` so callers can
 * branch on the HTTP code (a 409 from the tap endpoint is an answer, not a
 * network failure) instead of parsing message strings.
 */
export async function req(path, method = 'GET', body, token) {
  let r;
  const cacheable = method === 'GET';
  const key = cacheKey(path, token);
  const cached = cacheable ? etagCache.get(key) : null;
  try {
    r = await fetch(API + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        // اگر نسخهٔ قبلی را داریم، فقط تغییرات را بخواه.
        ...(cached ? { 'If-None-Match': cached.etag } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (networkError) {
    // fetch() only rejects on a genuine network fault. Give that its own
    // message — "خطا در ارتباط با سرور" for a 500 and for an offline phone
    // sent users chasing the wrong problem.
    const err = new Error('اتصال اینترنت برقرار نیست');
    err.status = 0;
    err.offline = true;
    throw err;
  }

  // ── ۳۰۴: هیچ چیز عوض نشده ──
  //
  // بدنه خالی است، پس `r.json()` شکست می‌خورد. دادهٔ ذخیره‌شده را
  // برمی‌گردانیم. این تنها نقطه‌ای است که «کش» واقعاً صرفه‌جویی می‌کند.
  if (r.status === 304 && cached) {
    return cached.data;
  }

  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err = new Error(data.message || 'خطا در ارتباط با سرور');
    err.status = r.status;
    err.data = data;
    throw err;
  }

  if (cacheable) {
    const etag = r.headers.get('ETag');
    if (etag) {
      // LRU سادهٔ درجِ مجدد: حذف و دوبارهٔ درج، کلید را به انتهای Map
      // می‌برد، پس قدیمی‌ترین همیشه اولِ صف است.
      if (etagCache.has(key)) etagCache.delete(key);
      etagCache.set(key, { etag, data });
      while (etagCache.size > ETAG_CACHE_MAX) {
        etagCache.delete(etagCache.keys().next().value);
      }
    }
  } else {
    // هر نوشتنی می‌تواند هر خواندنی را باطل کند (ثبتِ کارت هم اینونتوری
    // را عوض می‌کند هم امتیاز را هم آرنا را). پاک کردنِ کامل ساده‌تر و
    // امن‌تر از حدس زدنِ اینکه کدام مسیرها تحتِ تأثیرند.
    etagCache.clear();
  }
  return data;
}

/** Absolute URL for an asset path returned by the API. */
export const asset = v =>
  !v ? '' : String(v).startsWith('http') ? v : API + v;

/** Persian digits, used everywhere numbers are shown. */
/**
 * Persian digits with Persian thousands separators.
 *
 * `Intl.NumberFormat('fa-IR')` is supposed to do this, but headless Chrome and
 * some Android WebViews ship reduced ICU data and fall back to Latin commas —
 * producing "۱۰۰,۰۰۰", a mix of two scripts in one number. Requesting the
 * numbering system explicitly and normalising the separator guarantees the
 * same output everywhere.
 */
export const fa = n => {
  const v = Number(n || 0);
  let s;
  try {
    s = new Intl.NumberFormat('fa-IR-u-nu-arabext').format(v);
  } catch {
    s = String(v);
  }
  // Map any Latin digits/separators the runtime left behind.
  const latin = '0123456789';
  const persian = '۰۱۲۳۴۵۶۷۸۹';
  s = s.replace(/[0-9]/g, d => persian[latin.indexOf(d)]);
  // U+066C is the Arabic thousands separator Persian uses; a plain comma is
  // what the degraded fallback emits.
  return s.replace(/,/g, '٬');
};

/**
 * URL for a stored avatar key.
 *
 * The database stores keys like `avatar_1_football.png` and the server
 * validates against that exact list, so the KEY must stay .png. The files
 * themselves are now WebP (the PNGs were 384px and 240KB each, displayed at
 * 62px — 3.6MB of avatars on a screen that shows ten of them). Mapping the
 * extension here means no migration and no server change.
 */
export const avatarUrl = (key) => {
  const k = String(key || avatars[0]);
  // A purchased club crest can stand in for an avatar. It is stored with a
  // `club:` prefix so the two namespaces cannot collide (a bundled avatar
  // filename never contains a colon), and it resolves to the same shop
  // artwork the badge uses — one file, not a second copy.
  if (k.startsWith('club:')) return `/shop/club_${k.slice(5)}.webp`;
  return `/avatars/${k.replace(/\.png$/, '.webp')}`;
};

export const avatars = [
  'avatar_1_football.png', 'avatar_2_trophy.png', 'avatar_3_star.png',
  'avatar_4_rocket.png', 'avatar_5_lion.png', 'avatar_6_tiger.png',
  'avatar_7_eagle.png', 'avatar_8_target.png', 'avatar_9_bolt.png',
  'avatar_10_crown.png',
];

/** Accent palette for the admin-pinned announcement. Mirrors the server's
 *  PIN_ACCENTS and the Flutter pinAccents map. */
export const PIN_COLORS = {
  gold: '#FFC53D', green: '#34D399', blue: '#60A5FA', red: '#F87171',
};

// `PIN_COLORS_LIGHT` و `pinColor()` حذف شدند — اپ تک‌تم (تیره) است و
// همیشه از PIN_COLORS استفاده می‌شود.
