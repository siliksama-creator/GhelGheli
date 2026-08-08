/// Shared, presentation-agnostic helpers used across the whole app.
/// Business logic here is intentionally unchanged from the original
/// implementation — only the location moved so it can be reused cleanly.
library;

const List<String> avatarFiles = [
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
];

/// Asset path for a stored avatar key.
///
/// A purchased club crest can stand in for an avatar. It is stored as
/// `club:<slug>` — a bundled avatar filename never contains a colon, so the
/// two namespaces cannot collide — and resolves to the same shop artwork the
/// badge uses rather than a duplicated file.
String avatarAsset(Object? key) {
  final k = (key ?? avatarFiles.first).toString();
  if (k.startsWith('club:')) return 'assets/shop/club_${k.substring(5)}.webp';
  // ═══════════════════════════════════════════════════════════════════════
  // چرا .png به .webp تبدیل می‌شود
  // ═══════════════════════════════════════════════════════════════════════
  //
  // کلیدِ ذخیره‌شده در دیتابیس `avatar_1_football.png` است و همان‌طور
  // می‌ماند — سرور آن را در یک لیست سفید اعتبارسنجی می‌کند
  // (`AVATAR_KEYS`) و عوض کردنش یعنی مهاجرتِ دیتابیس و شکستنِ نسخه‌های
  // قدیمیِ اپ.
  //
  // ولی خودِ فایل‌ها به WebP تبدیل شدند: ۲٬۴۰۸ کیلوبایت PNG در ۳۸۴×۳۸۴
  // → ۱۷۴ کیلوبایت WebP در ۲۵۶×۲۵۶ (۹۳٪ کوچک‌تر)، و حافظهٔ دیکدِ هر
  // آواتار از ۰.۵۶ به ۰.۲۵ مگابایت رسید. آواتارها حداکثر در ۹۲ پیکسل
  // منطقی دیده می‌شوند، پس ۲۵۶ حتی برای نمایشگر ۳x هم بیش از کافی است.
  //
  // وب‌اپ از اول همین نگاشت را داشت (`avatarUrl` در userweb/src/lib/
  // api.js)؛ این کپیِ سمتِ اپ بود که جا افتاده بود.
  return 'assets/avatars/${k.replaceAll('.png', '.webp')}';
}

/// Asset path for a club crest, by slug.
String clubAssetOf(String slug) => 'assets/shop/club_$slug.webp';

/// Asset path for a league/trophy medal by rank.
///
/// رتبهٔ ۱-۳ جامِ طلا/نقره/برنز می‌گیرد؛ بقیه مدالِ آبیِ «حضور». این‌ها
/// به‌جای ایموجیِ  هستند — تصاویرِ WebPِ تولیدشدهٔ ۲۰۲۶ با
/// پس‌زمینهٔ شفاف (۱۳-۱۵KB). در لیگ و پروفایل یکسان استفاده می‌شوند تا
/// دو صفحه همیشه هم‌نظر باشند.
String medalAsset(int rank) {
  if (rank == 1) return 'assets/games/medals/medal_gold.webp';
  if (rank == 2) return 'assets/games/medals/medal_silver.webp';
  if (rank == 3) return 'assets/games/medals/medal_bronze.webp';
  return 'assets/games/medals/medal_participation.webp';
}

class NumberParser {
  NumberParser._();
  static int toInt(Object? v) => int.tryParse('$v') ?? 0;
}
