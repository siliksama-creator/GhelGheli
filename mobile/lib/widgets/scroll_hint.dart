// نوار اسکرول همیشه‌دیده + راهنمای «پایین‌تر هم چیز هست».
//
// ═══════════════════════════════════════════════════════════════════════════
// چرا این ویجت ساخته شد و چگونه بهبود یافت
// ═══════════════════════════════════════════════════════════════════════════
//
// درخواست مالک: «یه اسکرول بار برای صفحاتی که بیشتر از صفحه نمایش دیده
// میشن باید درست کنی که کاربر متوجه بشه که برای دیدن آیتم هایی که مشخص
// نیستن باید تاچ کنه بره سمت پایین».
//
// در بازبینی جدید، تجربهٔ کاربری از یک نشانِ ایستای صرف به یک المان
// تعاملی و حرفه‌ای ارتقا پیدا کرد:
//
//   ۱. **قرص تعاملی با تاچ و بازخورد هپتیک:** کاربر با لمس قرص راهنما،
//      به‌صورت نرم و هوشمند به سمت پایین هدایت می‌شود (animateTo).
//   ۲. **طراحی گلس‌مورفیسم تیره و هماهنگ با تم:** پس‌زمینهٔ سرمه‌ای تیره با
//      کنتراست بالا، حاشیهٔ ظریف لایم نئونی و آیکون انیمیشن‌دار چورون رو به پایین.
//   ۳. **ریل و دستگیرهٔ ظریف (۳.۵px):** نمایش نسبت دیده شده بدون اشغال دید کاربر.
//   ۴. **محوشدگیِ پیوسته و لطیفِ لبهٔ پایین:** استفاده از گرادیان چندپله‌ای
//      بدون قفل کردن رویدادهای لمسی پایین صفحه (IgnorePointer).
//   ۵. **عدم نشت منابع و بهینه‌سازی Ticker:** کنترلر انیمیشن فقط در زمان
//      نمایش فعال است و در dispose به شکل کامل تمیز می‌شود.
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

class ScrollHint extends StatefulWidget {
  const ScrollHint({
    super.key,
    required this.child,
    this.hintLabel = 'پایین‌تر هم هست',
    this.showHint = true,
    this.railColor,
    this.padBottom = 0,
  });

  /// هر ویجتِ اسکرول‌شونده — ListView، GridView، SingleChildScrollView...
  final Widget child;

  /// متن قرصِ راهنما.
  final String hintLabel;

  /// خاموش کردن قرص برای صفحه‌هایی که خودشان دکمهٔ شناور دارند و قرص
  /// رویشان می‌افتد.
  final bool showHint;

  final Color? railColor;

  /// اگر صفحه نوار پایینِ خودش را دارد، قرص باید بالاتر بنشیند.
  final double padBottom;

  @override
  State<ScrollHint> createState() => _ScrollHintState();
}

class _ScrollHintState extends State<ScrollHint>
    with SingleTickerProviderStateMixin {
  double _fraction = 0; // چقدر از مسیر پیموده شده (۰..۱)
  double _viewport = 1; // چه کسری از کل محتوا در یک صفحه جا می‌شود
  bool _scrollable = false;
  bool _atBottom = true;
  bool _touched = false; // آیا کاربر یک بار اسکرول کرده
  BuildContext? _scrollableContext;

  /// نوسانِ فلشِ راهنما. یک کنترلر برای هر صفحه — نه یکی برای هر عنصر.
  late final AnimationController _bob;

  @override
  void initState() {
    super.initState();
    _bob = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1400),
    );
  }

  @override
  void dispose() {
    _bob.dispose();
    super.dispose();
  }

  /// انیمیشن فقط وقتی می‌چرخد که قرص واقعاً دیده می‌شود.
  void _syncBob() {
    final visible =
        widget.showHint && _scrollable && !_atBottom && !_touched;
    if (visible && !_bob.isAnimating) {
      _bob.repeat(reverse: true);
    } else if (!visible && _bob.isAnimating) {
      _bob.stop();
    }
  }

  void _apply(ScrollMetrics m, {bool userScrolled = false}) {
    if (!mounted) return;
    if (m.axis != Axis.vertical) return;
    final total = m.maxScrollExtent;
    final scrollable = total > 8; // آستانه سرریز
    final frac = total <= 0 ? 0.0 : (m.pixels / total).clamp(0.0, 1.0);
    final vp = (m.viewportDimension) /
        math.max(1.0, m.viewportDimension + total);
    final bottom = m.extentAfter <= 24;

    final touched = _touched || userScrolled;
    if (scrollable == _scrollable &&
        (frac - _fraction).abs() < 0.002 &&
        (vp - _viewport).abs() < 0.002 &&
        bottom == _atBottom &&
        touched == _touched) {
      return;
    }
    setState(() {
      _scrollable = scrollable;
      _fraction = frac;
      _viewport = vp;
      _atBottom = bottom;
      _touched = touched;
    });
    _syncBob();
  }

  void _handleTapScroll() {
    HapticFeedback.lightImpact();
    final ctx = _scrollableContext;
    if (ctx != null) {
      final scrollable = Scrollable.maybeOf(ctx);
      if (scrollable != null && scrollable.position.hasPixels) {
        final pos = scrollable.position;
        final target = math.min(pos.pixels + 340.0, pos.maxScrollExtent);
        pos.animateTo(
          target,
          duration: const Duration(milliseconds: 420),
          curve: Curves.easeOutCubic,
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final rail = widget.railColor ?? scheme.primary;
    final showPill =
        widget.showHint && _scrollable && !_atBottom && !_touched;

    return NotificationListener<ScrollMetricsNotification>(
      onNotification: (n) {
        if (n.depth == 0) {
          _scrollableContext = n.context;
          _apply(n.metrics);
        }
        return false;
      },
      child: NotificationListener<ScrollNotification>(
        onNotification: (n) {
          if (n.depth != 0) return false;
          _scrollableContext = n.context;
          _apply(n.metrics, userScrolled: n is ScrollUpdateNotification);
          return false;
        },
        child: Stack(
          children: [
            Positioned.fill(child: widget.child),

            // ── محوشدگیِ لبهٔ پایین ──
            if (_scrollable && !_atBottom)
              Positioned(
                left: 0,
                right: 0,
                bottom: 0,
                height: 52 + widget.padBottom,
                child: IgnorePointer(
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                        colors: [
                          scheme.surface.withValues(alpha: 0),
                          scheme.surface.withValues(alpha: 0.35),
                          scheme.surface.withValues(alpha: 0.88),
                        ],
                        stops: const [0.0, 0.45, 1.0],
                      ),
                    ),
                  ),
                ),
              ),

            // ── ریل کناری ──
            if (_scrollable)
              Positioned(
                top: 8,
                bottom: 8 + widget.padBottom,
                right: 3,
                child: RepaintBoundary(
                  child: _Rail(
                    fraction: _fraction,
                    viewport: _viewport,
                    color: rail,
                  ),
                ),
              ),

            // ── قرص راهنما ──
            if (showPill)
              Positioned(
                right: 18,
                bottom: 12 + widget.padBottom,
                child: RepaintBoundary(
                  child: AnimatedBuilder(
                    animation: _bob,
                    builder: (context, child) => Transform.translate(
                      offset: Offset(
                          0, math.sin(_bob.value * math.pi * 2) * 2.5),
                      child: child,
                    ),
                    child: _HintPill(
                      label: widget.hintLabel,
                      color: rail,
                      onSurface: scheme.onSurface,
                      onTap: _handleTapScroll,
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

/// ریلِ باریکِ سمت راست (۳.۵px) با تم تیره و هایلایت لایم.
class _Rail extends StatelessWidget {
  const _Rail({
    required this.fraction,
    required this.viewport,
    required this.color,
  });

  final double fraction, viewport;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(builder: (context, c) {
      final h = c.maxHeight;
      final thumb = math.max(28.0, h * viewport);
      final top = (h - thumb) * fraction;
      return SizedBox(
        width: 3.5,
        height: h,
        child: Stack(
          children: [
            Positioned.fill(
              child: DecoratedBox(
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(999),
                  color: Colors.white.withValues(alpha: 0.08),
                ),
              ),
            ),
            Positioned(
              top: top,
              left: 0,
              right: 0,
              height: thumb,
              child: DecoratedBox(
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(999),
                  gradient: const LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [
                      Color(0xFFB5EF58),
                      Color(0xFF00D49A),
                    ],
                  ),
                  boxShadow: const [
                    BoxShadow(
                      color: Color(0x55B5EF58),
                      blurRadius: 6,
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      );
    });
  }
}

/// قرص راهنما با استایل گلس‌مورفیسم تیره، حاشیه لایم، نقطه راهنما و چورون تعاملی.
class _HintPill extends StatelessWidget {
  const _HintPill({
    required this.label,
    required this.color,
    required this.onSurface,
    this.onTap,
  });

  final String label;
  final Color color, onSurface;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(999),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 148),
          child: Ink(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6.5),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(999),
              gradient: const LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [
                  Color(0xF20F243E),
                  Color(0xF6071424),
                ],
              ),
              border: Border.all(
                color: const Color(0x66B5EF58),
                width: 1.1,
              ),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.45),
                  blurRadius: 14,
                  offset: const Offset(0, 5),
                ),
                const BoxShadow(
                  color: Color(0x24B5EF58),
                  blurRadius: 10,
                ),
              ],
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 5,
                  height: 5,
                  margin: const EdgeInsets.only(left: 4),
                  decoration: const BoxDecoration(
                    shape: BoxShape.circle,
                    color: Color(0xFFB5EF58),
                    boxShadow: [
                      BoxShadow(
                        color: Color(0x80B5EF58),
                        blurRadius: 4,
                      ),
                    ],
                  ),
                ),
                Flexible(
                  child: Text(
                    label.length > 16 ? 'ادامه پایین‌تر' : label,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w800,
                      color: Color(0xFFEEF8FF),
                      height: 1.15,
                    ),
                  ),
                ),
                const SizedBox(width: 4),
                const Icon(
                  Icons.keyboard_arrow_down_rounded,
                  size: 16,
                  color: Color(0xFFB5EF58),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
