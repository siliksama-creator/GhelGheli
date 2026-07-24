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

  factory BrandTheme.light() => BrandTheme(
        heroGradient: BrandColors.heroGradientLight,
        leagueGradient: BrandColors.leagueGradientLight,
        goldGradient: BrandColors.goldGradient,
        cardGradient: BrandColors.cardGradient,
        success: BrandColors.success,
        warning: BrandColors.warning,
        danger: BrandColors.danger,
        info: BrandColors.info,
        glassFill: Colors.white.withValues(alpha: 0.55),
        glassBorder: Colors.white.withValues(alpha: 0.65),
        subtleBorder: BrandColors.lightBorder,
        surfaceAlt: BrandColors.lightSurfaceAlt,
        surfaceHigh: BrandColors.lightSurfaceHigh,
        softShadow: [
          BoxShadow(
              color: const Color(0xFF17284A).withValues(alpha: 0.08),
              blurRadius: 22,
              offset: const Offset(0, 8)),
        ],
        raisedShadow: [
          BoxShadow(
              color: const Color(0xFF17284A).withValues(alpha: 0.14),
              blurRadius: 34,
              offset: const Offset(0, 16)),
        ],
      );

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
}
