// نوار اسکرول همیشه‌دیده + راهنمای «پایین‌تر هم چیز هست».
//
// ═══════════════════════════════════════════════════════════════════════════
// قراردادِ واحد (این فایل آینهٔ وب و پنل است)
// ═══════════════════════════════════════════════════════════════════════════
//
// خواستهٔ مالک (۲۹ شهریور): «هر تبی که کاربرا نیاز دارن به اسکرول کنن،
// راهنمایی نشون داده بشه؛ یکپارچه و برای همیشه درستش کن.»
//
// نسخهٔ مرجعِ وب: `userweb/src/components/ScrollHint.jsx` و پنل:
// `admin/src/components/ScrollHint.jsx`. هر سه یک قرارداد دارند:
//
//   • سه نشانه، **فقط** وقتی سرریزِ واقعی هست: محوشدگیِ لبهٔ پایین، ریلِ
//     باریک با دستگیره، و قرصِ راهنما با جملهٔ همان صفحه + چورونِ متحرک.
//   • قرص **تعاملی** است: یک لمس = حدود یک صفحه پایین (۶۲٪ ارتفاعِ نما) —
//     همان ضریبی که در وب/پنل هست، نه یک عددِ دلخواهِ سومی.
//   • «دیده شد» فقط با اسکرولِ **کاربر** ثبت می‌شود. تفکیکِ نسخهٔ قبلی
//     اشتباه بود: هر `ScrollUpdateNotification` — از جمله اسکرولِ
//     برنامه‌ای (`animateTo` خودِ همین قرص، پرش‌های صفحه) — «کاربر رفت»
//     شمرده می‌شد؛ نتیجه: قرص پیش از آنکه کاربر ببیندش بی‌صدا می‌رفت.
//     حالا ملاک `dragDetails != null` (لمس/کشیدنِ کاربر) است.
//   • `resetToken`: با برگشت به یک تب، راهنما یک بار دیگر آموزش می‌دهد
//     (آینهٔ `resetKey` در وب/پنل). بدون این، کاربری که یک بار در «خانه»
//     اسکرول کرده بود، تا پایانِ عمرِ اپ هیچ‌جا راهنما نمی‌دید — چون
//     ویجت‌ها زنده می‌مانند (`Offstage` + کشِ صفحه‌ها).
//   • آستانه‌ها با وب یکی است: سرریزِ واقعی > ۲۴px، «تهِ صفحه» = ≤ ۲۸px
//     فاصله از انتها.
//
// ریزِ زیبایی‌شناسی (خواستهٔ «اندروید درست و زیبا»): قرص پهن‌تر از قبل است
// و **متنِ خودِ صفحه** را نشان می‌دهد. نسخهٔ قبلی هر جملهٔ بلندتر از ۱۶
// نویسه را با «ادامه پایین‌تر» عوض می‌کرد — یعنی دقیقاً همان چیزی که قرار
// بود پیام بدهد («چه چیزی را دارم از دست می‌دهم») به یک متنِ بی‌خاصیت بدل
// می‌شد و عملاً هیچ صفحه‌ای جملهٔ خودش را نمی‌دید.
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart' show ScrollDirection;
import 'package:flutter/services.dart';

class ScrollHint extends StatefulWidget {
  const ScrollHint({
    super.key,
    required this.child,
    this.hintLabel = 'پایین‌تر هم هست',
    this.showHint = true,
    this.railColor,
    this.padBottom = 0,
    this.resetToken,
  });

  /// هر ویجتِ اسکرول‌شونده — ListView، GridView، SingleChildScrollView...
  final Widget child;

  /// متن قرصِ راهنما (جملهٔ همان صفحه).
  final String hintLabel;

  /// خاموش کردن قرص برای صفحه‌هایی که خودشان دکمهٔ شناور دارند و قرص
  /// رویشان می‌افتد.
  final bool showHint;

  final Color? railColor;

  /// اگر صفحه نوار پایینِ خودش را دارد، قرص باید بالاتر بنشیند.
  final double padBottom;

  /// عوض شدنِ این مقدار = «این تب تازه باز شد»؛ قرص دوباره فعال می‌شود.
  final Object? resetToken;

  @override
  State<ScrollHint> createState() => _ScrollHintState();
}

class _ScrollHintState extends State<ScrollHint>
    with SingleTickerProviderStateMixin {
  double _fraction = 0; // چقدر از مسیر پیموده شده (۰..۱)
  double _viewport = 1; // چه کسری از کل محتوا در یک صفحه جا می‌شود
  bool _scrollable = false;
  bool _atBottom = true;
  bool _touched = false; // آیا کاربر یک بار خودش اسکرول کرده
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

  @override
  void didUpdateWidget(covariant ScrollHint oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.resetToken != widget.resetToken) {
      _resetVisit();
    } else if (oldWidget.showHint != widget.showHint) {
      _syncBob();
    }
  }

  /// تبِ تازه: «دیده شد» صفر می‌شود تا راهنما یک بار دیگر نشان داده شود.
  void _resetVisit() {
    if (!mounted) return;
    _touched = false;
    setState(() {});
    _remeasure();
    _syncBob();
  }

  /// سنجشِ دوباره از روی موقعیتِ فعلی (بدونِ انتظار برای نوتیفیکیشن بعدی).
  void _remeasure() {
    final ctx = _scrollableContext;
    if (ctx == null) return;
    final scrollable = Scrollable.maybeOf(ctx);
    final pos = scrollable?.position;
    if (pos != null && pos.hasPixels) _apply(pos);
  }

  /// انیمیشن فقط وقتی می‌چرخد که قرص واقعاً دیده می‌شود.
  void _syncBob() {
    final visible = widget.showHint && _scrollable && !_atBottom && !_touched;
    if (visible && !_bob.isAnimating) {
      _bob.repeat(reverse: true);
    } else if (!visible && _bob.isAnimating) {
      _bob.stop();
    }
  }

  void _apply(ScrollMetrics m, {bool userScrolled = false}) {
    if (!mounted) return;
    if (m.axis != Axis.vertical) return;
    // آستانه‌ها هم‌اندازهٔ وب/پنل: سرریزِ واقعی، نه چند پیکسل.
    final scrollable = m.maxScrollExtent > 24;
    final frac =
        m.maxScrollExtent <= 0 ? 0.0 : (m.pixels / m.maxScrollExtent).clamp(0.0, 1.0);
    final vp = m.viewportDimension /
        math.max(1.0, m.viewportDimension + m.maxScrollExtent);
    final bottom = m.extentAfter <= 28;

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

  /// یک لمس روی قرص = ~۰٫۶۲ صفحه پایین (همان ضریبِ وب و پنل).
  void _handleTapScroll() {
    HapticFeedback.lightImpact();
    final ctx = _scrollableContext;
    if (ctx == null) return;
    final scrollable = Scrollable.maybeOf(ctx);
    final pos = scrollable?.position;
    if (pos == null || !pos.hasPixels) return;
    final step = pos.viewportDimension * 0.62;
    final target = math.min(pos.pixels + step, pos.maxScrollExtent);
    pos.animateTo(
      target,
      duration: const Duration(milliseconds: 420),
      curve: Curves.easeOutCubic,
    );
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final rail = widget.railColor ?? scheme.primary;
    final showPill = widget.showHint && _scrollable && !_atBottom && !_touched;

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
          // ⚠️ فقط کشیدنِ کاربر «دیده شد» است. `animateTo` هم
          //    `ScrollUpdateNotification` می‌فرستد ولی `dragDetails` ندارد.
          final byUser = (n is ScrollStartNotification && n.dragDetails != null) ||
              (n is ScrollUpdateNotification && n.dragDetails != null) ||
              n is UserScrollNotification && n.direction != ScrollDirection.idle;
          _apply(n.metrics, userScrolled: byUser);
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
                height: 64 + widget.padBottom,
                child: IgnorePointer(
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                        colors: [
                          scheme.surface.withValues(alpha: 0),
                          scheme.surface.withValues(alpha: 0.5),
                          scheme.surface.withValues(alpha: 0.92),
                        ],
                        stops: const [0.0, 0.55, 1.0],
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
                right: 5,
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

/// ریلِ باریکِ سمت راست (۴px — هم‌اندازهٔ وب) با تم تیره و هایلایت لایم.
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
      final thumb = math.max(30.0, h * viewport);
      final top = (h - thumb) * fraction;
      return SizedBox(
        width: 4,
        height: h,
        child: Stack(
          children: [
            Positioned.fill(
              child: DecoratedBox(
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(999),
                  color: Colors.white.withValues(alpha: 0.09),
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
                      blurRadius: 8,
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
///
/// پهنای بیشینه ۲۳۲px است (هم‌اندازهٔ وب) تا جملهٔ واقعیِ صفحه جا شود؛
/// فقط اگر جمله از این هم بلندتر بود، با «…» کوتاه می‌شود.
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
      child: Semantics(
        button: true,
        label: '$label — پایین‌تر برو',
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(999),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 232),
            child: Ink(
              padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 7),
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
                    margin: const EdgeInsets.only(left: 5),
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
                      label,
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
                  const SizedBox(width: 5),
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
      ),
    );
  }
}
