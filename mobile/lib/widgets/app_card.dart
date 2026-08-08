// A general-purpose elevated content card used all across the app in place
// of the old ad-hoc `CardShell`. Provides a consistent radius, background,
// border and soft shadow driven by the current [BrandTheme], and adapts
// automatically between light and dark mode.
import 'package:flutter/material.dart';
import '../theme/brand_theme.dart';
import '../theme/colors.dart';
import '../theme/tokens.dart';

class AppCard extends StatelessWidget {
  final Widget child;
  final EdgeInsetsGeometry padding;
  final double? maxWidth;
  final Color? color;
  final VoidCallback? onTap;
  final bool elevated;

  // ═══════════════════════════════════════════════════════════════════════
  // سرآیندِ اختیاری — `title` / `subtitle` / `action`
  // ═══════════════════════════════════════════════════════════════════════
  //
  // ── چرا اضافه شد ──
  //
  // صفحه‌های تازهٔ پنلِ مدیریت (`admin_points`, `admin_league`) این سه
  // پارامتر را پاس می‌دادند در حالی که وجود نداشتند، و ۱۱ خطای
  // کامپایل می‌ساختند — یعنی اپ اصلاً build نمی‌شد.
  //
  // دو راه بود:
  //
  //   الف) هر ۱۱ فراخوانی را دستی به `Column` تبدیل کنم
  //   ب) خودِ `AppCard` این الگو را پشتیبانی کند
  //
  // راهِ (الف) امتحان شد و **خراب بود**: هر تبدیل نیاز به یک سطحِ
  // بستنِ اضافه داشت و ویرایشِ خودکار پرانتزها را نامتوازن کرد
  // (۱۹ خطا به ۳۱ رسید). برگردانده شد.
  //
  // راهِ (ب) درست‌تر هم هست: الگوی «کارت با سرآیند» در کلِ پنل تکرار
  // می‌شود و جایش در خودِ کامپوننت است، نه کپی‌شده در هر صفحه.
  //
  //  هر سه اختیاری‌اند، پس هیچ فراخوانیِ موجودی نمی‌شکند.
  final String? title;
  final String? subtitle;
  final Widget? action;

  const AppCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(Gaps.md),
    this.maxWidth,
    this.color,
    this.onTap,
    this.elevated = true,
    this.title,
    this.subtitle,
    this.action,
  });

  /// محتوا با سرآیند، اگر سرآیندی داده شده باشد.
  Widget _withHeader(BuildContext context) {
    if (title == null && subtitle == null && action == null) return child;
    final onSurface = Theme.of(context).colorScheme.onSurface;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        if (title != null || action != null)
          Row(
            children: [
              if (title != null)
                Expanded(
                  child: Text(
                    title!,
                    style: const TextStyle(
                        fontSize: 15, fontWeight: FontWeight.w900),
                  ),
                )
              else
                const Spacer(),
              // `Flexible` تا دکمهٔ بلند روی صفحهٔ باریک سرریز نکند —
              // همان درسی که در فرمِ ثبت کارت گرفته شد.
              if (action != null) Flexible(child: action!),
            ],
          ),
        if (subtitle != null) ...[
          Gaps.vXxs,
          Text(
            subtitle!,
            style: TextStyle(
                fontSize: 12, color: onSurface.withValues(alpha: 0.7)),
          ),
        ],
        Gaps.vSm,
        child,
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final brand = context.brand;
    final cardGradient = color == null
        ? LinearGradient(
            begin: Alignment.topRight,
            end: Alignment.bottomLeft,
            colors: [
              Color.lerp(scheme.surfaceContainerHigh, BrandColors.emerald, 0.055)!,
              Color.lerp(scheme.surfaceContainer, BrandColors.blue, 0.030)!,
              scheme.surfaceContainerLow,
            ],
          )
        : null;
    final content = AnimatedContainer(
      duration: Motion.fast,
      constraints:
          maxWidth != null ? BoxConstraints(maxWidth: maxWidth!) : null,
      padding: padding,
      decoration: BoxDecoration(
        borderRadius: Corners.rXl,
        color: color,
        gradient: cardGradient,
        border: Border.all(
          color: color == null ? brand.glassBorder : brand.subtleBorder,
        ),
        boxShadow: elevated
            ? [
                ...brand.softShadow,
                BoxShadow(
                  color: BrandColors.emerald.withValues(alpha: 0.055),
                  blurRadius: 26,
                  offset: const Offset(0, 14),
                ),
              ]
            : null,
      ),
      child: _withHeader(context),
    );

    if (onTap == null) return content;
    return Material(
      color: Colors.transparent,
      borderRadius: Corners.rXl,
      child: InkWell(
        onTap: onTap,
        borderRadius: Corners.rXl,
        child: content,
      ),
    );
  }
}
