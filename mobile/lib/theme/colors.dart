// Brand color system for GhelGheli.
//
// Centralised so every surface stays in sync and any
// future rebrand only touches this file.
import 'package:flutter/material.dart';

class BrandColors {
  BrandColors._();

  // Core brand identity — emerald/teal (loyalty, growth) + electric blue
  // (energy, sport) + amber (rewards, gold tier).
  static const Color emerald = Color(0xFF00D49A);
  static const Color emeraldDeep = Color(0xFF00A87A);
  static const Color blue = Color(0xFF1C78FF);
  static const Color blueDeep = Color(0xFF0B4FCC);
  static const Color amber = Color(0xFFFFC94D);
  static const Color amberDeep = Color(0xFF7A4D00);

  // Dark theme surfaces — deep navy, never pure black, for a premium feel.
  static const Color darkBg = Color(0xFF060D18);
  static const Color darkSurface = Color(0xFF0E1826);
  static const Color darkSurfaceAlt = Color(0xFF141F30);
  static const Color darkSurfaceHigh = Color(0xFF1B2A40);
  static const Color darkBorder = Color(0x1FFFFFFF);

  // ── سطوحِ تمِ روشن حذف شدند ──
  //
  // اپ تک‌تم (تیره) شد. این پنج ثابت هیچ مصرف‌کننده‌ای نداشتند و
  // نگه داشتنشان فقط این توهم را می‌ساخت که تمِ روشن هنوز پشتیبانی
  // می‌شود. توضیحِ کاملِ چراییِ حذفِ تمِ روشن در main.dart.
  //
  //  ثابت‌های `*OnLight` (dangerOnLight و …) عمداً ماندند: آن‌ها
  //    برای متن روی سطحِ **روشنِ موضعی** استفاده می‌شوند (مثل کارتِ
  //    سفیدِ صفِ بررسی در پنل مدیریت)، نه برای تمِ روشن.

  // ═══════════════════════════════════════════════════════════════════════
  // رنگ‌های معنایی — چرا هر کدام دو نسخه دارند
  // ═══════════════════════════════════════════════════════════════════════
  //
  // گزارش مالک: «قسمت کیف پول و بعضی قسمت های دیگه با تم روشن خوب دیده
  // نمیشن».
  //
  // ریشه اینجا بود. کامنتِ قبلیِ همین بلوک می‌گفت
  // «consistent across themes» — و دقیقاً همان «سازگاری» باگ بود:
  //
  // این رنگ‌ها برای پس‌زمینهٔ **تیره** انتخاب شده‌اند. روی سطحِ تیره
  // درخشان و خوانا هستند، ولی همان‌ها روی سطحِ سفیدِ تم روشن محو
  // می‌شوند. نسبتِ کنتراستِ اندازه‌گیری‌شده روی #FFFFFF:
  //
  //     amber    ۱.۵۳:۱   ← عملاً نامرئی
  //     emerald  ۱.۹۳:۱
  //     warning  ۲.۰۰:۱
  //     success  ۲.۲۳:۱
  //     info     ۲.۶۷:۱
  //     danger   ۲.۹۹:۱
  //
  // استاندارد WCAG برای متنِ معمولی ۴.۵:۱ و برای متنِ بزرگ و آیکون
  // ۳:۱ است. یعنی **هیچ‌کدام** حتی به حداقلِ گرافیکی هم نمی‌رسیدند.
  //
  // نسخهٔ `…OnLight` هر رنگ، همان **رنگ‌مایه (hue)** را دارد ولی
  // روشنایی‌اش تا رسیدن به ≥۴.۵:۱ روی سفید پایین آمده. حفظِ hue مهم
  // است: کاربر باید همچنان «سبز = موفق» و «قرمز = خطا» را بشناسد؛
  // اگر رنگ عوض می‌شد، زبانِ بصریِ اپ بین دو تم فرق می‌کرد.
  //
  // برای انتخاب از کجا باید استفاده کرد، `BrandTheme` را ببینید:
  // `context.brand.success` خودش نسخهٔ درست را می‌دهد. مستقیم استفاده
  // کردن از این ثابت‌ها فقط جایی درست است که پس‌زمینه‌اش قطعاً تیره
  // باشد (مثل گرادیانِ کارت موجودی).
  static const Color success = Color(0xFF22C58B);
  static const Color warning = Color(0xFFF2A93B);
  static const Color danger = Color(0xFFFF5D6C);
  static const Color info = Color(0xFF4EA1FF);

  /// نسخهٔ تیره‌ترِ همان رنگ‌ها، برای نشستن روی سطحِ روشن.
  ///
  /// هر کدام با نگه داشتنِ hue و کم کردنِ روشنایی تا آستانهٔ ۴.۵:۱ روی
  /// سفید ساخته شده‌اند. با تستِ `light_theme_contrast_test.dart` قفل
  /// شده‌اند تا کسی نتواند بی‌سروصدا روشنشان کند.
  static const Color successOnLight = Color(0xFF14865E);
  static const Color warningOnLight = Color(0xFFA76707);
  static const Color dangerOnLight = Color(0xFFEC0016);
  static const Color infoOnLight = Color(0xFF0071F1);

  /// طلاییِ خوانا روی سطحِ روشن — برای نشان‌های پلاس و جوایز.
  ///
  /// `amber` روی سفید ۱.۵۳:۱ است: بدترین موردِ کل پالت.
  static const Color amberOnLight = Color(0xFF9A6B00);

  /// سبزِ برند، خوانا روی سطحِ روشن.
  static const Color emeraldOnLight = Color(0xFF00825F);

  static const List<Color> heroGradientDark = [emerald, blue];
  static const List<Color> heroGradientLight = [
    Color(0xFF00C398),
    Color(0xFF2C82FF)
  ];
  static const List<Color> goldGradient = [amber, amberDeep];
  static const List<Color> leagueGradientDark = [Color(0xFF172F56), emerald];
  static const List<Color> leagueGradientLight = [
    Color(0xFF23477F),
    Color(0xFF00C398)
  ];
  static const List<Color> cardGradient = [
    Color(0xFFFFD36B),
    Color(0xFF0B2B4F),
    emerald
  ];
}
