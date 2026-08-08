// Assembles the full Material 3 [ThemeData] for GhelGheli — light & dark —
// combining the color, typography and brand-extension tokens declared
// alongside this file, plus consistent component themes (buttons, inputs,
// cards, nav bar, dialogs, sheets) so every screen looks hand-crafted
// instead of relying on Flutter's raw defaults.
// Required for CupertinoPageTransitionsBuilder below. Some Flutter versions
// re-export it from material.dart (their analyzer then calls this import
// "unnecessary"), but others do NOT — dropping this import broke the CI
// build with "CupertinoPageTransitionsBuilder isn't defined". Keep it, and
// silence the version-dependent lint.
// ignore: unnecessary_import
import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'brand_theme.dart';
import 'colors.dart';
import 'tokens.dart';
import 'typography.dart';

class AppTheme {
  AppTheme._();

  static ThemeData dark() => _build(brightness: Brightness.dark);

  // ── چرا `light()` حذف شد ──
  //
  // اپ تک‌تم شد. نگه داشتنِ سازندهٔ تمِ روشن یعنی کدی که هیچ‌کس اجرا
  // نمی‌کند ولی هر تغییرِ رنگی باید در آن هم اعمال شود — و چون اجرا
  // نمی‌شود، هیچ‌وقت معلوم نمی‌شد که از قلم افتاده.
  //
  // `brightness` به‌عنوان پارامتر ماند تا امضای `_build` و ساختارش
  // دست‌نخورده بماند؛ فقط تنها فراخوانی‌اش تیره است.

  static ThemeData _build({required Brightness brightness}) {
    // تک‌تم: فقط طرحِ رنگِ تیره. شاخهٔ روشن حذف شد.
    const colorScheme = ColorScheme.dark(
      primary: BrandColors.emerald,
      onPrimary: Color(0xFF00281D),
      primaryContainer: Color(0xFF0B4536),
      onPrimaryContainer: Color(0xFFB9FFE9),
      secondary: BrandColors.blue,
      onSecondary: Colors.white,
      secondaryContainer: Color(0xFF0E2A55),
      onSecondaryContainer: Color(0xFFD3E4FF),
      tertiary: BrandColors.amber,
      onTertiary: Color(0xFF241900),
      surface: BrandColors.darkSurface,
      onSurface: Color(0xFFEAF1FB),
      surfaceContainerLowest: BrandColors.darkBg,
      surfaceContainerLow: BrandColors.darkSurface,
      surfaceContainer: BrandColors.darkSurfaceAlt,
      surfaceContainerHigh: BrandColors.darkSurfaceHigh,
      surfaceContainerHighest: Color(0xFF223349),
      outline: Color(0xFF35486A),
      outlineVariant: Color(0xFF223349),
      error: BrandColors.danger,
      // ═══════════════════════════════════════════════════════════
      // چرا onError در تم تیره سفید نیست
      // ═══════════════════════════════════════════════════════════
      //
      // `danger` (#FF5D6C) یک قرمزِ **روشن** است — عمداً، چون
      // باید روی سطحِ تیرهٔ اپ بدرخشد. ولی متنِ سفید روی همان
      // رنگ فقط ۲.۹۹:۱ می‌دهد: برچسبِ دکمه‌های خطا و اسنک‌بارها
      // کم‌رنگ و سخت‌خوان بود.
      //
      // این همان الگویی است که خودِ Material 3 برای تم تیره
      // به‌کار می‌برد: رنگِ ظرف روشن، جوهرِ رویش تیره. با
      // #2A0206 کنتراست به ۶.۳۴:۱ می‌رسد.
      //
      onError: Color(0xFF2A0206),
    );

    const onSurfaceMuted = Color(0xFF9FB0C8);
    final textTheme =
        AppTypography.textTheme(colorScheme.onSurface, onSurfaceMuted);
    final brandExt = BrandTheme.dark();

    return ThemeData(
      useMaterial3: true,
      brightness: brightness,
      colorScheme: colorScheme,
      fontFamily: AppTypography.fontFamily,
      textTheme: textTheme,
      scaffoldBackgroundColor: BrandColors.darkBg,
      splashFactory: InkSparkle.splashFactory,
      visualDensity: VisualDensity.standard,
      extensions: [brandExt],
      appBarTheme: AppBarTheme(
        backgroundColor: Colors.transparent,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: false,
        titleTextStyle: textTheme.titleLarge,
        iconTheme: IconThemeData(color: colorScheme.onSurface),
      ),
      cardTheme: CardThemeData(
        color: colorScheme.surfaceContainer,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(borderRadius: Corners.rLg),
        clipBehavior: Clip.antiAlias,
      ),
      navigationBarTheme: NavigationBarThemeData(
        height: 68,
        elevation: 0,
        backgroundColor: colorScheme.surfaceContainerLow,
        surfaceTintColor: Colors.transparent,
        indicatorColor:
            colorScheme.primary.withValues(alpha: 0.22),
        indicatorShape: RoundedRectangleBorder(borderRadius: Corners.rPill),
        labelTextStyle: WidgetStateProperty.resolveWith((states) {
          final selected = states.contains(WidgetState.selected);
          return textTheme.labelSmall!.copyWith(
            color: selected ? colorScheme.primary : onSurfaceMuted,
            fontWeight: selected ? FontWeight.w800 : FontWeight.w600,
          );
        }),
        iconTheme: WidgetStateProperty.resolveWith((states) {
          final selected = states.contains(WidgetState.selected);
          return IconThemeData(
              color: selected ? colorScheme.primary : onSurfaceMuted, size: 24);
        }),
      ),
      navigationDrawerTheme: NavigationDrawerThemeData(
        backgroundColor: colorScheme.surfaceContainerLow,
        surfaceTintColor: Colors.transparent,
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: colorScheme.surfaceContainerHigh
            .withValues(alpha: 0.55),
        contentPadding:
            const EdgeInsets.symmetric(horizontal: Gaps.md, vertical: Gaps.md),
        hintStyle: textTheme.bodyMedium?.copyWith(color: onSurfaceMuted),
        labelStyle: textTheme.bodyMedium?.copyWith(color: onSurfaceMuted),
        floatingLabelStyle: textTheme.bodyMedium
            ?.copyWith(color: colorScheme.primary, fontWeight: FontWeight.w700),
        border: OutlineInputBorder(
            borderRadius: Corners.rMd, borderSide: BorderSide.none),
        enabledBorder: OutlineInputBorder(
          borderRadius: Corners.rMd,
          borderSide: BorderSide(color: colorScheme.outlineVariant, width: 1),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: Corners.rMd,
          borderSide: BorderSide(color: colorScheme.primary, width: 1.6),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: Corners.rMd,
          borderSide: BorderSide(color: colorScheme.error, width: 1.4),
        ),
        focusedErrorBorder: OutlineInputBorder(
          borderRadius: Corners.rMd,
          borderSide: BorderSide(color: colorScheme.error, width: 1.8),
        ),
        prefixIconColor: onSurfaceMuted,
        suffixIconColor: onSurfaceMuted,
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          minimumSize: const Size.fromHeight(TouchTarget.comfortable),
          padding: const EdgeInsets.symmetric(horizontal: Gaps.lg),
          shape: RoundedRectangleBorder(borderRadius: Corners.rLg),
          backgroundColor: colorScheme.primary,
          foregroundColor: colorScheme.onPrimary,
          disabledBackgroundColor:
              colorScheme.onSurface.withValues(alpha: 0.12),
          disabledForegroundColor:
              colorScheme.onSurface.withValues(alpha: 0.46),
          elevation: 0,
          shadowColor: colorScheme.primary.withValues(alpha: 0.28),
          textStyle: textTheme.labelLarge?.copyWith(fontSize: 15),
        ).copyWith(
          overlayColor: WidgetStateProperty.resolveWith((states) {
            if (states.contains(WidgetState.pressed)) {
              return Colors.white.withValues(alpha: 0.18);
            }
            if (states.contains(WidgetState.hovered) ||
                states.contains(WidgetState.focused)) {
              return Colors.white.withValues(alpha: 0.10);
            }
            return null;
          }),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          minimumSize: const Size.fromHeight(TouchTarget.comfortable),
          padding: const EdgeInsets.symmetric(horizontal: Gaps.lg),
          shape: RoundedRectangleBorder(borderRadius: Corners.rLg),
          side: BorderSide(color: colorScheme.outline.withValues(alpha: 0.78)),
          foregroundColor: colorScheme.onSurface,
          backgroundColor: Colors.white.withValues(alpha: 0.035),
          textStyle: textTheme.labelLarge?.copyWith(fontSize: 15),
        ).copyWith(
          overlayColor: WidgetStateProperty.resolveWith((states) {
            if (states.contains(WidgetState.pressed)) {
              return colorScheme.primary.withValues(alpha: 0.12);
            }
            if (states.contains(WidgetState.hovered) ||
                states.contains(WidgetState.focused)) {
              return colorScheme.primary.withValues(alpha: 0.08);
            }
            return null;
          }),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          minimumSize: const Size(0, TouchTarget.min),
          padding: const EdgeInsets.symmetric(
              horizontal: Gaps.md, vertical: Gaps.xs),
          shape: RoundedRectangleBorder(borderRadius: Corners.rSm),
          textStyle: textTheme.labelLarge,
        ),
      ),
      iconButtonTheme: IconButtonThemeData(
        style: IconButton.styleFrom(
          minimumSize: const Size(TouchTarget.min, TouchTarget.min),
          shape: RoundedRectangleBorder(borderRadius: Corners.rLg),
          backgroundColor: Colors.white.withValues(alpha: 0.045),
          foregroundColor: colorScheme.onSurface,
          side: BorderSide(color: Colors.white.withValues(alpha: 0.075)),
        ).copyWith(
          overlayColor: WidgetStateProperty.resolveWith((states) {
            if (states.contains(WidgetState.pressed)) {
              return colorScheme.primary.withValues(alpha: 0.16);
            }
            if (states.contains(WidgetState.hovered) ||
                states.contains(WidgetState.focused)) {
              return colorScheme.primary.withValues(alpha: 0.10);
            }
            return null;
          }),
        ),
      ),
      chipTheme: ChipThemeData(
        backgroundColor: colorScheme.surfaceContainerHigh,
        selectedColor: colorScheme.primary.withValues(alpha: 0.2),
        disabledColor: colorScheme.surfaceContainerHigh.withValues(alpha: 0.5),
        labelStyle:
            textTheme.labelMedium?.copyWith(color: colorScheme.onSurface),
        padding:
            const EdgeInsets.symmetric(horizontal: Gaps.sm, vertical: Gaps.xxs),
        shape: RoundedRectangleBorder(
            borderRadius: Corners.rPill,
            side: BorderSide(color: colorScheme.outlineVariant)),
        side: BorderSide.none,
      ),
      dividerTheme: DividerThemeData(
          color: colorScheme.outlineVariant, thickness: 1, space: Gaps.xl),
      dialogTheme: DialogThemeData(
        backgroundColor: colorScheme.surfaceContainer,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(borderRadius: Corners.rXl),
        titleTextStyle: textTheme.titleLarge,
        contentTextStyle: textTheme.bodyMedium,
      ),
      bottomSheetTheme: BottomSheetThemeData(
        backgroundColor: colorScheme.surfaceContainer,
        surfaceTintColor: Colors.transparent,
        showDragHandle: true,
        dragHandleColor: colorScheme.outline,
        shape: const RoundedRectangleBorder(
          borderRadius:
              BorderRadius.vertical(top: Radius.circular(Corners.xxl)),
        ),
      ),
      snackBarTheme: SnackBarThemeData(
        backgroundColor: colorScheme.inverseSurface,
        contentTextStyle:
            textTheme.bodyMedium?.copyWith(color: colorScheme.onInverseSurface),
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: Corners.rMd),
        insetPadding: const EdgeInsets.all(Gaps.md),
      ),
      progressIndicatorTheme: ProgressIndicatorThemeData(
        color: colorScheme.primary,
        circularTrackColor: colorScheme.surfaceContainerHighest,
        linearTrackColor: colorScheme.surfaceContainerHighest,
      ),
      switchTheme: SwitchThemeData(
        thumbColor: WidgetStateProperty.resolveWith(
          (s) => s.contains(WidgetState.selected)
              ? colorScheme.primary
              : colorScheme.outline,
        ),
        trackColor: WidgetStateProperty.resolveWith(
          (s) => s.contains(WidgetState.selected)
              ? colorScheme.primary.withValues(alpha: 0.35)
              : colorScheme.surfaceContainerHighest,
        ),
      ),
      listTileTheme: ListTileThemeData(
        shape: RoundedRectangleBorder(borderRadius: Corners.rMd),
        contentPadding:
            const EdgeInsets.symmetric(horizontal: Gaps.md, vertical: Gaps.xxs),
        titleTextStyle: textTheme.titleSmall,
        subtitleTextStyle: textTheme.bodySmall,
        iconColor: onSurfaceMuted,
      ),
      segmentedButtonTheme: SegmentedButtonThemeData(
        style: SegmentedButton.styleFrom(
          minimumSize: const Size(0, TouchTarget.min),
          shape: RoundedRectangleBorder(borderRadius: Corners.rMd),
          textStyle: textTheme.labelMedium,
        ),
      ),
      tooltipTheme: TooltipThemeData(
        decoration: BoxDecoration(
            color: colorScheme.inverseSurface, borderRadius: Corners.rSm),
        textStyle:
            textTheme.bodySmall?.copyWith(color: colorScheme.onInverseSurface),
      ),
      pageTransitionsTheme: const PageTransitionsTheme(
        builders: {
          TargetPlatform.android: FadeForwardsPageTransitionsBuilder(),
          TargetPlatform.iOS: CupertinoPageTransitionsBuilder(),
        },
      ),
    );
  }
}
