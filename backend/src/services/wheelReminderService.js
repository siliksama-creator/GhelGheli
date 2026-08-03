// یادآور چرخش رایگان گردونه
//
// ═══════════════════════════════════════════════════════════════════════════
// خواستهٔ مالک و چیزی که از آن برداشت شد
// ═══════════════════════════════════════════════════════════════════════════
//
// «اعلام بازگشت چرخه رایگان هم درست کن فقط ساعتی در روز که به ساعت ایران
//  باعث مزاحمت خواب و استراحت نشه»
//
// یعنی دو شرط، و دومی از اولی مهم‌تر است:
//   ۱. کاربر باید بفهمد چرخش رایگانِ امروزش آماده است.
//   ۲. این اطلاع‌رسانی **هرگز** نباید کسی را از خواب بیدار کند.
//
// ═══════════════════════════════════════════════════════════════════════════
// چرا ساعت ۱۸:۳۰ به وقت تهران
// ═══════════════════════════════════════════════════════════════════════════
//
// چرخش‌ها نیمه‌شب تهران ریست می‌شوند (wheelService.tehranDay). ساده‌ترین
// کار این بود که همان لحظه اعلان بفرستیم — که فاجعه است: ۰۰:۰۰ وسط خواب
// مردم است.
//
// ۱۸:۳۰ انتخاب شد چون:
//   • بعد از ساعت کاری و مدرسه است، پس کاربر واقعاً می‌تواند بازی کند.
//   • هنوز ۵.۵ ساعت تا ریست بعدی مانده، پس «فرصت از دست رفتن» واقعی است
//     و پیام بی‌فایده نیست.
//   • قبل از شام و خواب است؛ نه صبح زود، نه آخر شب.
//
// و یک محافظ سخت‌گیرانه: حتی اگر کسی بعداً cron را عوض کند یا سرور در
// منطقهٔ زمانی دیگری اجرا شود، تابع `withinQuietHours` **خودش** بررسی
// می‌کند و بین ۲۲:۰۰ تا ۰۹:۰۰ به وقت تهران هیچ اعلانی نمی‌فرستد.
// دو لایه، چون یک لایه یعنی یک تغییرِ ساده در cron می‌تواند نیمه‌شب
// هزاران گوشی را روشن کند.
const { pool } = require('../config/db');
const { createNotification } = require('./notificationService');

/** ساعت فعلی به وقت تهران، به صورت عدد ۰ تا ۲۳. */
function tehranHour(now = new Date()) {
  return Number(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Tehran', hour: '2-digit', hour12: false,
  }).format(now));
}

/** روز جاری به وقت تهران (YYYY-MM-DD). */
function tehranDay(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
}

/**
 * ساعت‌های ممنوع: ۲۲:۰۰ تا ۰۹:۰۰ به وقت تهران.
 *
 * این تابع منبعِ حقیقت است، نه زمان‌بندی cron. هر مسیری که بخواهد اعلانِ
 * تبلیغاتی/یادآور بفرستد باید اول از اینجا رد شود.
 */
function withinQuietHours(now = new Date()) {
  const h = tehranHour(now);
  return h >= 22 || h < 9;
}

/**
 * به کسانی که چرخش استفاده‌نشده دارند یادآوری می‌کند.
 *
 * فقط به کاربرانی می‌رود که:
 *   • حساب فعال دارند،
 *   • توکن پوش دارند (وگرنه اعلان درون‌برنامه‌ای انباشته می‌شود),
 *   • **امروز اصلاً نچرخانده‌اند** — کسی که چرخانده نباید پیام بگیرد،
 *   • در ۳۰ روز گذشته فعال بوده‌اند؛ کاربر رهاکرده را با اعلان
 *     نمی‌شود برگرداند، فقط آزارش می‌دهد.
 */
async function sendDailyReminder({ force = false } = {}) {
  if (!force && withinQuietHours()) {
    console.log('[wheel-reminder] در ساعات استراحت — ارسال نشد');
    return { sent: 0, skipped: 'quiet_hours' };
  }

  const day = tehranDay();
  const { rows } = await pool.query(
    `SELECT u.id
       FROM users u
      WHERE u.status = 'active'
        AND u.fcm_token IS NOT NULL
        AND u.updated_at > NOW() - INTERVAL '30 days'
        AND NOT EXISTS (
              -- spun_day همان روزِ تهران است که wheelService موقع ثبت
              -- چرخش ذخیره می‌کند؛ پس نه تبدیل منطقهٔ زمانی لازم است و
              -- نه محاسبه روی هر ردیف.
              SELECT 1 FROM wheel_spins s
               WHERE s.user_id = u.id AND s.spun_day = $1::date
            )
      LIMIT 5000`,
    [day]);

  let sent = 0;
  for (const r of rows) {
    try {
      await createNotification(
        r.id, 'wheel',
        'چرخش رایگان امروزت آماده است 🎡',
        'تا نیمه‌شب فرصت داری بچرخانی — فردا این شانس از بین می‌رود.');
      sent++;
    } catch { /* یک کاربر ناموفق نباید بقیه را متوقف کند */ }
  }
  console.log(`[wheel-reminder] ${sent} یادآور ارسال شد`);
  return { sent, total: rows.length };
}

module.exports = { sendDailyReminder, withinQuietHours, tehranHour, tehranDay };
