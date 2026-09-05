// ============================================================================
//  Storeِ محدودکنندهٔ نرخ (Redis) برای حالتِ چندپروسه‌ای
// ============================================================================
//
// ── چرا هست ──────────────────────────────────────────────────────────
// express-rate-limit به‌صورت پیش‌فرض شمارنده‌ها را در حافظهٔ همان پروسه
// نگه می‌دارد. در حالتِ تک‌پروسه درست است؛ اما به‌محض اینکه چند پروسهٔ
// Node بالا بیاید:
//
//   • هر پروسه سطلِ جدا دارد → محدودیتِ X درخواست، عملاً X × تعدادِ پروسه
//     می‌شود (هر کاربر می‌تواند از هر دو پروسه عبور کند)؛
//   • ری‌استارتِ یک پروسه سهمیه‌اش را صفر می‌کند → سقف عملاً قابل دور زدن
//     با سعیِ متعدد در زمان ری‌استارت.
//
// اگر REDIS_URL فعال باشد، هر limiter یک RedisStore می‌گیرد تا شمارندهٔ
// هر کاربر/IP درست مثلِ حالتِ تک‌پروسه، یکتا و سراسری باشد. اگر Redis
// نباشد (محیط توسعه/CI بدونِ ردیس)، null برمی‌گردد و express-rate-limit
// به همان storeِ حافظه‌ایِ پیش‌فرض می‌افتد — یعنی رفتارِ امروز.
//
// ── چرا به‌ازای هر limiter یک نمونهٔ جدا ساخته می‌شود ─────────────────
// express-rate-limit نسخهٔ ۷ اعتبارسنجیِ `unsharedStore` دارد: یک نمونهٔ
// Store نباید بین چند limiter به اشتراک گذاشته شود، وگرنه موقعِ ساختِ
// دومی خطای ERR_ERL_STORE_REUSE پرتاب می‌کند (و چون این خطا هنگامِ
// تعریفِ میدلور در زمانِ بارگذاری ماژول رخ می‌دهد، پروسه می‌افتد و PM2
// ری‌استارتش می‌کند). پس:
//
//   • هر limiter یک نمونهٔ RedisStore **جدا** می‌گیرد؛
//   • ولی همه‌شان به **همان Redis** وصل‌اند و هر limiter پیشوندِ کلیدِ
//     خودش را دارد (مثل `rl:login:`). به این ترتیب شمارندهٔ یک limiter
//     بینِ هر دو پروسهٔ سرور **مشترک و سراسری** می‌ماند (هدفِ اصلی)،
//     بی‌آنکه نمونهٔ Store مشترک باشد یا کلیدها به هم بخورند.

// اتصالِ Redis یک‌بار و مشترک ساخته می‌شود؛ خودِ Storeها جدا هستند ولی
// همه از همین یک کلاینت دستور می‌فرستند تا اتصالِ اضافه نسازیم.
let cachedClient = null;
function redisClient() {
  if (cachedClient !== null) return cachedClient || null;
  if (!String(process.env.REDIS_URL || '').trim()) { cachedClient = false; return null; }
  try {
    // eslint-disable-next-line global-require
    const { makeClient } = require('./redis');
    cachedClient = makeClient('ratelimit') || false;
  } catch {
    cachedClient = false;
  }
  return cachedClient || null;
}

/**
 * ساختِ یک Store اختصاصی برای یک limiter.
 *
 * @param {string} prefix  نامِ کوتاهِ limiter (مثل 'otp'، 'login') — در
 *   پیشوندِ کلیدِ Redis می‌نشیند (`rl:<prefix>:`) تا شمارندهٔ limiterهای
 *   مختلف از هم جدا باشند.
 * @returns {object|null}  یک RedisStore تازه، یا null اگر Redis در دسترس
 *   نباشد (در آن صورت express-rate-limit از storeِ حافظه‌ای استفاده می‌کند).
 */
function makeRateStore(prefix) {
  const client = redisClient();
  if (!client) return null;
  let RedisStore;
  try {
    // eslint-disable-next-line global-require
    ({ RedisStore } = require('rate-limit-redis'));
  } catch {
    console.error('[ratelimit] rate-limit-redis نصب نیست؛ store حافظه‌ای استفاده می‌شود (در حالت چندپروسه دقیق نیست)');
    return null;
  }
  return new RedisStore({
    // sendCommand: ioredis خام — مستقیم از خودِ کلاینت استفاده می‌کنیم تا
    // connection دومیِ بی‌مورد ساخته نشود.
    sendCommand: (...args) => client.call(...args),
    prefix: `rl:${prefix}:`,
  });
}

module.exports = { makeRateStore };
