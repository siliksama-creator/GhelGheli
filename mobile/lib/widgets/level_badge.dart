// نشانِ لولِ بازیکن.
//
// ═══════════════════════════════════════════════════════════════════════════
// چرا «Level 7» و نه «سطح ۷»
// ═══════════════════════════════════════════════════════════════════════════
//
// مالک نمونهٔ نمایش را صریح داد: «در قسمت بازی ها هم Level 0 مثلا اینطوری
// نشون داده بشه نیاز نیست بنویسی سطح ۰».
//
// پس برچسب لاتین می‌ماند و **عدد هم لاتین** است، نه فارسی. این عمدی و
// سازگار است: «Level ۷» ترکیبِ ناجوری از دو خط است که در یک نشانِ کوچک
// بد دیده می‌شود. بقیهٔ اپ همچنان عددِ فارسی دارد؛ این یک استثنای
// خواسته‌شده است.
//
// ═══════════════════════════════════════════════════════════════════════════
// چرا رنگ با لول عوض می‌شود
// ═══════════════════════════════════════════════════════════════════════════
//
// نشانِ لول در فهرست‌های شلوغ (لیگ، چت) کنارِ ده‌ها نامِ دیگر می‌نشیند.
// اگر همه یک رنگ باشند، عدد باید خوانده شود تا معنا پیدا کند — یعنی
// عملاً هیچ‌کس نمی‌خواندش.
//
// با پنج ردهٔ رنگی، چشم بدونِ خواندن می‌فهمد «این یکی خیلی جلوتر است».
// همان کاری که رده‌بندیِ بازی‌های رقابتی می‌کند.
//
// رنگ‌ها از `context.brand` می‌آیند، پس در تم روشن هم کنتراستِ کافی
// دارند — این دقیقاً همان دسته باگی بود که در کیف پول رفع شد.
import 'package:flutter/material.dart';

import '../api_client.dart' show faNum;
import '../theme/brand_theme.dart';
import '../theme/tokens.dart';

/// ردهٔ یک لول، برای رنگ و نماد.
enum LevelTier { rookie, bronze, silver, gold, legend }

LevelTier tierOf(int level) {
  if (level >= 90) return LevelTier.legend;
  if (level >= 60) return LevelTier.gold;
  if (level >= 30) return LevelTier.silver;
  if (level >= 10) return LevelTier.bronze;
  return LevelTier.rookie;
}

/// نشانِ فشرده — برای کنارِ نام در فهرست‌ها و نوار حریف.
///
/// عمداً بسیار کوچک است: در یک ردیفِ چت باید کنارِ نام، نشانِ پلاس و
/// نشانِ باشگاه جا شود بدون اینکه نام را بیرون بیندازد.
class LevelBadge extends StatelessWidget {
  const LevelBadge({
    super.key,
    required this.level,
    this.compact = true,
  });

  final int level;

  /// حالت فشرده فقط عدد را نشان می‌دهد؛ حالت کامل «Level N».
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    final scheme = Theme.of(context).colorScheme;
    final tier = tierOf(level);

    final color = switch (tier) {
      LevelTier.legend => brand.accent,
      LevelTier.gold => brand.warning,
      LevelTier.silver => brand.info,
      LevelTier.bronze => brand.success,
      // ردهٔ اول عمداً خنثی است: نشانِ رنگیِ پررنگ برای کسی که تازه
      // شروع کرده، هم بی‌معناست و هم فهرست را شلوغ می‌کند.
      LevelTier.rookie => scheme.outline,
    };

    return Container(
      padding: EdgeInsets.symmetric(
        horizontal: compact ? 5 : 8,
        vertical: compact ? 1 : 3,
      ),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(compact ? 5 : 7),
        color: color.withValues(alpha: 0.14),
        border: Border.all(color: color.withValues(alpha: 0.55)),
      ),
      child: Text(
        // عددِ لاتین — درخواست صریح مالک. توضیح در سرصفحهٔ فایل.
        compact ? '$level' : 'Level $level',
        // Directionality صریح: عددِ لاتین داخل رابطِ راست‌به‌چپ وگرنه
        // در کنارِ متنِ فارسی جای اشتباه می‌افتد.
        textDirection: TextDirection.ltr,
        style: TextStyle(
          fontSize: compact ? 10 : 12,
          height: 1.25,
          fontWeight: FontWeight.w900,
          color: color,
          // ارقامِ هم‌عرض: بدون این، عوض شدنِ ۹ به ۱۰ کلِ ردیف را
          // یک پیکسل جابه‌جا می‌کند و در فهرستِ زندهٔ چت دیده می‌شود.
          fontFeatures: const [FontFeature.tabularFigures()],
        ),
      ),
    );
  }
}

/// کارتِ کاملِ لول با نوار پیشرفت — برای صفحهٔ بازی‌ها و پروفایل.
class LevelCard extends StatelessWidget {
  const LevelCard({
    super.key,
    required this.level,
    required this.into,
    required this.needed,
    required this.progress,
    required this.isMax,
    this.xp = 0,
  });

  final int level;
  final int into;
  final int needed;
  final double progress;
  final bool isMax;
  final int xp;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final brand = context.brand;
    final tier = tierOf(level);
    final color = switch (tier) {
      LevelTier.legend => brand.accent,
      LevelTier.gold => brand.warning,
      LevelTier.silver => brand.info,
      LevelTier.bronze => brand.success,
      LevelTier.rookie => theme.colorScheme.primary,
    };

    return Container(
      padding: const EdgeInsets.all(Gaps.md),
      decoration: BoxDecoration(
        borderRadius: Corners.rLg,
        color: color.withValues(alpha: 0.08),
        border: Border.all(color: color.withValues(alpha: 0.35)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              LevelBadge(level: level, compact: false),
              Gaps.hSm,
              Expanded(
                child: Text(
                  _tierLabel(tier),
                  style: theme.textTheme.labelLarge?.copyWith(
                    fontWeight: FontWeight.w800,
                    color: color,
                  ),
                ),
              ),
              if (isMax)
                Text('🏆', style: theme.textTheme.titleMedium)
              else
                Text(
                  // «۱۲۳ / ۴۵۶» — پیشرفت تا لولِ بعد.
                  '${faNum(into)} / ${faNum(needed)}',
                  style: theme.textTheme.labelSmall?.copyWith(
                    color: theme.colorScheme.onSurface.withValues(alpha: 0.7),
                    fontFeatures: const [FontFeature.tabularFigures()],
                  ),
                ),
            ],
          ),
          Gaps.vXs,
          // نوار پیشرفت.
          //
          // ClipRRect بیرونی لازم است: بدون آن، در پیشرفتِ نزدیک صفر
          // گوشه‌های گردِ نوارِ داخلی از قابِ بیرونی بیرون می‌زنند.
          ClipRRect(
            borderRadius: BorderRadius.circular(999),
            child: Stack(
              children: [
                Container(
                  height: 8,
                  color: theme.colorScheme.onSurface.withValues(alpha: 0.10),
                ),
                // انیمیشنِ پرشدن: وقتی کاربر از صفحهٔ بازی برمی‌گردد و
                // XP گرفته، نوار «رشد» را نشان می‌دهد نه یک پرشِ ناگهانی.
                TweenAnimationBuilder<double>(
                  tween: Tween(begin: 0, end: isMax ? 1.0 : progress),
                  duration: const Duration(milliseconds: 700),
                  curve: Curves.easeOutCubic,
                  builder: (context, v, _) => FractionallySizedBox(
                    widthFactor: v.clamp(0.0, 1.0),
                    child: Container(
                      height: 8,
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          colors: [color.withValues(alpha: 0.65), color],
                        ),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
          Gaps.vXs,
          Text(
            isMax
                ? 'به بالاترین لول رسیدی! 🏆'
                : 'با هر بازی آنلاین امتیاز می‌گیری — برد امتیاز بیشتری دارد',
            style: theme.textTheme.bodySmall?.copyWith(
              color: theme.colorScheme.onSurface.withValues(alpha: 0.65),
            ),
          ),
        ],
      ),
    );
  }

  static String _tierLabel(LevelTier t) => switch (t) {
        LevelTier.legend => 'افسانه‌ای',
        LevelTier.gold => 'طلایی',
        LevelTier.silver => 'نقره‌ای',
        LevelTier.bronze => 'برنزی',
        LevelTier.rookie => 'تازه‌کار',
      };
}
