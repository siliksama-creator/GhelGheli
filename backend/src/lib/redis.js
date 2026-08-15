// ============================================================================
//  اتصال Redis — کاملاً اختیاری
// ============================================================================
//
// اگر REDIS_URL تنظیم نشده باشد، این ماژول هیچ کاری نمی‌کند و اپ دقیقاً مثل
// امروز تک‌پروسه بالا می‌آید. این عمدی است: نصب تازه، محیط توسعه و تست‌ها
// نباید به Redis نیاز داشته باشند.
//
// اگر تنظیم شده باشد، دو کلاینت مستقل می‌سازیم چون پروتکل pub/sub ردیس
// وقتی یک اتصال subscribe می‌کند، همان اتصال دیگر نمی‌تواند فرمان معمولی
// اجرا کند. آداپتور socket.io هر دو را می‌خواهد.
//
// ⚠️ نکتهٔ مهم دربارهٔ خطا: اگر ردیس وسط کار قطع شود، ioredis خودش تلاش
//    مجدد می‌کند و ما فقط لاگ می‌گیریم. اپ نباید کرش کند — بدترین حالت
//    این است که موقتاً رویدادها بین پروسه‌ها جابه‌جا نمی‌شوند، نه اینکه
//    کل سرویس بخوابد.

let Redis = null;
try {
  // eslint-disable-next-line global-require
  Redis = require('ioredis');
} catch {
  Redis = null; // پکیج نصب نیست — همان مسیر تک‌پروسه
}

const URL = String(process.env.REDIS_URL || '').trim();

/** آیا اصلاً باید سراغ ردیس برویم؟ */
function redisEnabled() {
  return Boolean(URL) && Boolean(Redis);
}

function makeClient(role) {
  if (!redisEnabled()) return null;
  const client = new Redis(URL, {
    // اگر ردیس بالا نیامده، بی‌نهایت تلاش نکن ولی زود هم تسلیم نشو.
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    retryStrategy: times => Math.min(times * 200, 5000),
    lazyConnect: false,
    connectionName: `ghelgheli-${role}`,
  });
  let warned = false;
  client.on('error', err => {
    // ردیس قطع شده: فقط یک‌بار سر و صدا کن، نه هر ۲۰۰ میلی‌ثانیه.
    if (!warned) {
      warned = true;
      console.error(`[redis:${role}] ${err.message}`);
    }
  });
  client.on('ready', () => {
    warned = false;
    console.log(`[redis:${role}] متصل شد`);
  });
  return client;
}

module.exports = { redisEnabled, makeClient };
