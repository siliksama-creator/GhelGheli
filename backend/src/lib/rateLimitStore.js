// ============================================================================
//  Storeِ مشترکِ محدودکنندهٔ نرخ (Redis) برای حالتِ چندپروسه‌ای
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
// اگر REDIS_URL فعال باشد یک RedisStore مشترک برمی‌گردانیم تا شمارندهٔ
// هر کاربر/IP درست مثلِ حالت تک‌پروسه، یکتا و سراسری باشد. اگر Redis
// نباشد (محیط توسعه/CI بدونِ ردیس)، null برمی‌گردد و express-rate-limit
// به همان store حافظه‌ایِ پیش‌فرض می‌افتد — یعنی رفتارِ امروز.

function redisRateLimitStore() {
  // دوری از وابستگیِ اجباری در نصب‌های بدونِ ردیس: پکیج فقط وقتی
  // require می‌شود که REDIS_URL باشد.
  if (!String(process.env.REDIS_URL || '').trim()) return null;
  let RedisStore;
  try {
    // eslint-disable-next-line global-require
    ({ RedisStore } = require('rate-limit-redis'));
  } catch {
    console.error('[ratelimit] rate-limit-redis نصب نیست؛ store حافظه‌ای استفاده می‌شود (در حالت چندپروسه دقیق نیست)');
    return null;
  }
  // eslint-disable-next-line global-require
  const { makeClient } = require('./redis');
  const client = makeClient('ratelimit');
  if (!client) return null;
  return new RedisStore({
    // sendCommand: ioredis خام — مستقیم از خودِ کلاینت استفاده می‌کنیم تا
    // connection دومیِ بی‌مورد ساخته نشود.
    sendCommand: (...args) => client.call(...args),
    prefix: 'rl:',
  });
}

module.exports = { redisRateLimitStore };
