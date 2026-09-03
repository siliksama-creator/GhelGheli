/**
 * تنها فهرستِ آواتارهای موجود در باندل — منبعِ یکتا برای سرور و تست‌ها.
 *
 * ── چرا این فایل جدا شد (فاز ۲ نقشه‌راه یکپارچه‌سازی) ──────────────────
 *
 * پیش از این، فهرستِ ۱۰ آواتار داخل `server.js` به‌صورت یک `Set` نوشته
 * شده بود. مشکل فقط سبکیِ کد نبود: «تعداد آواتارها» در متنِ هر دو کلاینت
 * هاردکد بود («۱۰ مدل اختصاصی»)، پس افزودن آواتارِ تازه یعنی سه تغییر
 * جدا در سه جا + یک آپدیتِ اجباریِ اپ.
 *
 * حالا همین آرایه تنها حقیقت است:
 *   • `safeAvatarKey` همان Set را از اینجا می‌سازد (اعتبارسنجی دست‌نخورده)
 *   • `GET /api/avatars` و `avatars` در `/api/config` از همین ساخته می‌شود
 *   • کلاینت‌ها «چند مدل؟» را از پاسخ می‌خوانند، نه از متنِ خودشان
 *   • تستِ اعتبارسنجی هم همین فایل را می‌خواند تا لیستِ دوباره‌نوشته‌شده
 *     در تست، گاردِ جعلی نسازد
 *
 * ⚠️ ترتیب و نامِ فایل‌ها قراردادِ هر دو کلاینت است:
 *   - اندروید: `assets/avatars/<name>.png` داخل APK (mobile/lib/core/assets.dart)
 *   - وب: `/avatars/<name>.webp` از ریشهٔ `userweb/public/`
 * پس افزودن آواتارِ تازه یعنی: فایل در هر دو + یک ردیف اینجا. **بدون**
 * هیچ تغییرِ متنی در کلاینت‌ها — «۱۰» دیگر عددِ هیچ فایلِ UI نیست.
 *
 * `.png` در انتهای نام **عمدی** است: کلید در دیتابیس همین رشته است و
 * حذفش یعنی مهاجرتِ داده و شکستنِ نسخه‌های قدیمی.
 */
const AVATAR_LIST = Object.freeze([
  'avatar_1_football.png',
  'avatar_2_trophy.png',
  'avatar_3_star.png',
  'avatar_4_rocket.png',
  'avatar_5_lion.png',
  'avatar_6_tiger.png',
  'avatar_7_eagle.png',
  'avatar_8_target.png',
  'avatar_9_bolt.png',
  'avatar_10_crown.png',
]);

const AVATAR_KEYS = new Set(AVATAR_LIST);

/** نمایشِ انسانیِ «football» از «avatar_1_football.png» — برای پنل/e2e. */
const avatarLabel = (key) =>
  String(key).replace(/^avatar_\d+_/, '').replace(/\.png$/, '').replace(/_/g, ' ');

module.exports = { AVATAR_LIST, AVATAR_KEYS, avatarLabel };
