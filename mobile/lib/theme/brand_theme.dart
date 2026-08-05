// Custom [ThemeExtension] carrying brand-specific tokens (gradients,
// semantic status colors, glass surfaces) that Material 3's [ColorScheme]
// doesn't model directly. Access via `context.brand`.
import 'package:flutter/material.dart';
import 'colors.dart';

class BrandTheme extends ThemeExtension<BrandTheme> {
  final List<Color> heroGradient;
  final List<Color> leagueGradient;
  final List<Color> goldGradient;
  final List<Color> cardGradient;
  final Color success;
  final Color warning;
  final Color danger;
  final Color info;

  /// طلاییِ نشان‌ها (پلاس، جوایز، گذر نبرد).
  ///
  /// جدا از `goldGradient` است چون آن یک گرادیانِ تزئینی روی سطحِ
  /// تیره است، ولی این یک **رنگِ جوهر** است که مستقیم روی سطحِ تم
  /// می‌نشیند — و `amber` روی سفید ۱.۵۳:۱ است، یعنی بدترین موردِ کل
  /// پالت.
  final Color accent;
  final Color glassFill;
  final Color glassBorder;
  final Color subtleBorder;
  final Color surfaceAlt;
  final Color surfaceHigh;
  final List<BoxShadow> softShadow;
  final List<BoxShadow> raisedShadow;

  const BrandTheme({
    required this.heroGradient,
    required this.leagueGradient,
    required this.goldGradient,
    required this.cardGradient,
    required this.success,
    required this.warning,
    required this.danger,
    required this.info,
    required this.accent,
    required this.glassFill,
    required this.glassBorder,
    required this.subtleBorder,
    required this.surfaceAlt,
    required this.surfaceHigh,
    required this.softShadow,
    required this.raisedShadow,
  });

  factory BrandTheme.dark() => BrandTheme(
        heroGradient: BrandColors.heroGradientDark,
        leagueGradient: BrandColors.leagueGradientDark,
        goldGradient: BrandColors.goldGradient,
        cardGradient: BrandColors.cardGradient,
        success: BrandColors.success,
        warning: BrandColors.warning,
        danger: BrandColors.danger,
        info: BrandColors.info,
        accent: BrandColors.amber,
        glassFill: Colors.white.withValues(alpha: 0.06),
        glassBorder: Colors.white.withValues(alpha: 0.10),
        subtleBorder: BrandColors.darkBorder,
        surfaceAlt: BrandColors.darkSurfaceAlt,
        surfaceHigh: BrandColors.darkSurfaceHigh,
        softShadow: [
          BoxShadow(
              color: Colors.black.withValues(alpha: 0.28),
              blurRadius: 24,
              offset: const Offset(0, 10)),
        ],
        raisedShadow: [
          BoxShadow(
              color: Colors.black.withValues(alpha: 0.40),
              blurRadius: 40,
              offset: const Offset(0, 18)),
        ],
      );

  /// ═════════════════════════════════════════════════════════════════════
  /// چرا نسخهٔ روشن رنگ‌های معناییِ **متفاوتی** دارد
  /// ═════════════════════════════════════════════════════════════════════
  ///
  /// این تابع قبلاً دقیقاً همان `BrandColors.success/warning/danger/info`
  /// را می‌داد که نسخهٔ تیره می‌دهد. آن رنگ‌ها برای نشستن روی سطحِ
  /// تیره طراحی شده‌اند و روی سفید محو می‌شوند — اندازه‌گیری‌شده:
  /// amber ۱.۵۳:۱، success ۲.۲۳:۱، danger ۲.۹۹:۱، همه زیر حداقلِ WCAG.
  ///
  /// این ریشهٔ گزارشِ «با تم روشن خوب دیده نمیشن» بود. حالا هر کدام
  /// نسخهٔ `…OnLight` خودشان را می‌گیرند: همان hue، روشناییِ کمتر،
  /// کنتراست ≥۴.۵:۱.
  ///
  /// **نکتهٔ مهم برای آینده:** به‌جای `BrandColors.danger` مستقیم، از
  /// `context.brand.danger` استفاده کنید تا خودکار نسخهٔ درستِ تم
  /// انتخاب شود. استفادهٔ مستقیم فقط جایی درست است که پس‌زمینه قطعاً
  /// تیره باشد (مثل گرادیانِ کارت موجودی).
  // `BrandTheme.light()` حذف شد — اپ تک‌تم (تیره) است.
  // توضیحِ کاملِ چرایی در main.dart.


  @override
  BrandTheme copyWith({
    List<Color>? heroGradient,
    List<Color>? leagueGradient,
    List<Color>? goldGradient,
    List<Color>? cardGradient,
    Color? success,
    Color? warning,
    Color? danger,
    Color? info,
    Color? accent,
    Color? glassFill,
    Color? glassBorder,
    Color? subtleBorder,
    Color? surfaceAlt,
    Color? surfaceHigh,
    List<BoxShadow>? softShadow,
    List<BoxShadow>? raisedShadow,
  }) {
    return BrandTheme(
      heroGradient: heroGradient ?? this.heroGradient,
      leagueGradient: leagueGradient ?? this.leagueGradient,
      goldGradient: goldGradient ?? this.goldGradient,
      cardGradient: cardGradient ?? this.cardGradient,
      success: success ?? this.success,
      warning: warning ?? this.warning,
      danger: danger ?? this.danger,
      info: info ?? this.info,
      accent: accent ?? this.accent,
      glassFill: glassFill ?? this.glassFill,
      glassBorder: glassBorder ?? this.glassBorder,
      subtleBorder: subtleBorder ?? this.subtleBorder,
      surfaceAlt: surfaceAlt ?? this.surfaceAlt,
      surfaceHigh: surfaceHigh ?? this.surfaceHigh,
      softShadow: softShadow ?? this.softShadow,
      raisedShadow: raisedShadow ?? this.raisedShadow,
    );
  }

  @override
  BrandTheme lerp(ThemeExtension<BrandTheme>? other, double t) {
    if (other is! BrandTheme) return this;
    return BrandTheme(
      heroGradient: heroGradient,
      leagueGradient: leagueGradient,
      goldGradient: goldGradient,
      cardGradient: cardGradient,
      success: Color.lerp(success, other.success, t)!,
      warning: Color.lerp(warning, other.warning, t)!,
      danger: Color.lerp(danger, other.danger, t)!,
      info: Color.lerp(info, other.info, t)!,
      accent: Color.lerp(accent, other.accent, t)!,
      glassFill: Color.lerp(glassFill, other.glassFill, t)!,
      glassBorder: Color.lerp(glassBorder, other.glassBorder, t)!,
      subtleBorder: Color.lerp(subtleBorder, other.subtleBorder, t)!,
      surfaceAlt: Color.lerp(surfaceAlt, other.surfaceAlt, t)!,
      surfaceHigh: Color.lerp(surfaceHigh, other.surfaceHigh, t)!,
      softShadow: t < 0.5 ? softShadow : other.softShadow,
      raisedShadow: t < 0.5 ? raisedShadow : other.raisedShadow,
    );
  }
}

extension BrandThemeX on BuildContext {
  BrandTheme get brand => Theme.of(this).extension<BrandTheme>()!;

  /// ═════════════════════════════════════════════════════════════════════
  /// طلاییِ «پلاس» که در هر دو تم خوانا است
  /// ═════════════════════════════════════════════════════════════════════
  ///
  /// طلاییِ برند (#FFD36B) روی سطحِ سفید کنتراستِ **۱.۴۲:۱** دارد —
  /// بدترین موردِ کل پالت و عملاً نامرئی. ولی همین رنگ روی سطحِ تیره
  /// درخشان است و نباید عوضش کرد.
  ///
  /// این getter نسخهٔ درستِ تم را می‌دهد، پس هر جایی که یک نشانِ طلایی
  /// **روی سطحِ تم** می‌نشیند (نه روی گرادیانِ تیره) باید از این
  /// استفاده کند.
  ///
  /// نمونهٔ استفادهٔ درست: متنِ «فقط پلاس» در گذر نبرد.
  /// نمونهٔ استفادهٔ نادرست: طلاییِ داخلِ گرادیانِ کارتِ فوتبالی —
  /// آنجا پس‌زمینه همیشه تیره است و رنگِ ثابت درست‌تر است.
  Color get gold => brand.accent;
}
