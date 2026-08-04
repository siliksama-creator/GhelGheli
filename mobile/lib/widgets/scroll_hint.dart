// نوار اسکرول همیشه‌دیده + راهنمای «پایین‌تر هم چیز هست».
//
// ═══════════════════════════════════════════════════════════════════════════
// چرا این ویجت ساخته شد
// ═══════════════════════════════════════════════════════════════════════════
//
// درخواست مالک: «یه اسکرول بار برای صفحاتی که بیشتر از صفحه نمایش دیده
// میشن باید درست کنی که کاربر متوجه بشه که برای دیدن آیتم هایی که مشخص
// نیستن باید تاچ کنه بره سمت پایین».
//
// مشکل واقعی این بود: نوار اسکرولِ پیش‌فرضِ اندروید **فقط هنگام اسکرول**
// ظاهر می‌شود. یعنی دقیقاً برای کسی که نمی‌داند صفحه اسکرول می‌شود،
// هیچ‌وقت دیده نمی‌شود — یک دایرهٔ باطل. کاربر فکر می‌کند صفحه همین است
// که می‌بیند و نصف محتوا را از دست می‌دهد.
//
// این ویجت سه نشانهٔ هم‌زمان می‌دهد:
//
//   ۱. **ریل کناری** که همیشه دیده می‌شود و نسبت دیده‌شده را نشان می‌دهد.
//      برخلاف نوار پیش‌فرض، محو نمی‌شود.
//   ۲. **محوشدگیِ لبهٔ پایین** — محتوا زیر یک گرادیان می‌رود، که زبانِ
//      بصریِ جهانیِ «بریده نشده، ادامه دارد» است.
//   ۳. **قرصِ متحرکِ «پایین‌تر»** با یک فلشِ بالا-پایین‌رو. این صریح‌ترین
//      نشانه است و به محض اینکه کاربر یک بار اسکرول کند برای همیشه در آن
//      صفحه محو می‌شود — راهنما باید یک بار آموزش بدهد، نه اینکه برای
//      همیشه جلوی چشم بماند.
//
// ═══════════════════════════════════════════════════════════════════════════
// چرا بدون ScrollController
// ═══════════════════════════════════════════════════════════════════════════
//
// راه بدیهی این بود که یک `ScrollController` بسازیم و به `Scrollbar` بدهیم.
// ولی صفحه‌های این اپ پر از اسکرول‌های تودرتوست (یک ListView افقیِ کارت‌ها
// داخل یک ListView عمودی، یا یک لیستِ داخلیِ shrinkWrap). اگر دو اسکرول‌ویو
// به یک کنترلر وصل شوند، فلاتر با assertion کرش می‌کند:
//
//     ScrollController attached to multiple scroll views
//
// به‌جای آن، اینجا فقط به `ScrollNotification` گوش می‌دهیم که یک رویدادِ
// بالارونده است و هیچ چیزی را به هم وصل نمی‌کند. `depth == 0` یعنی فقط
// اسکرولِ بیرونی حساب می‌شود، پس لیست‌های تودرتو ریل را نمی‌لرزانند.
//
// `ScrollMetricsNotification` هم گوش داده می‌شود چون **بدون هیچ اسکرولی**
// و در همان اولین چیدمان می‌آید؛ بدون آن، ریل تا اولین لمسِ کاربر ظاهر
// نمی‌شد — یعنی دقیقاً همان باگی که می‌خواهیم حل کنیم.
//
// ═══════════════════════════════════════════════════════════════════════════
// هزینهٔ اجرا
// ═══════════════════════════════════════════════════════════════════════════
//
// هر رویداد اسکرول یک `setState` کوچک روی همین ویجت می‌زند، نه روی صفحه.
// خودِ ریل و قرص داخل `RepaintBoundary` هستند، پس بازچینشِ لیست را
// تحریک نمی‌کنند. مقدارها قبل از setState مقایسه می‌شوند تا فریم‌های
// بی‌تغییر اصلاً رد نشوند.
import 'dart:math' as math;

import 'package:flutter/material.dart';

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
  ///
  /// یک AnimationController که همیشه در حال چرخش است، هر فریم یک تیک
  /// می‌گیرد حتی اگر چیزی روی صفحه نباشد — روی صفحه‌ای که اسکرول ندارد
  /// این خالص هدر دادنِ باتری است.
  ///
  /// ═════════════════════════════════════════════════════════════════════
  /// چرا از داخلِ build صدا زده نمی‌شود
  /// ═════════════════════════════════════════════════════════════════════
  ///
  /// نسخهٔ اول این را مستقیم در `build` صدا می‌زد — و این در پاسِ دومِ
  /// بازبینی به‌عنوان یک باگ شناخته شد. `repeat()` و `stop()` وضعیتِ
  /// Ticker را عوض می‌کنند و انجامش وسطِ فاز build دو مشکل دارد:
  ///
  ///   ۱. build باید **بدون اثرِ جانبی** باشد؛ فلاتر اجازه دارد یک
  ///      ویجت را چند بار در یک فریم build کند (مثلاً هنگام
  ///      اندازه‌گیریِ چیدمان) و آن‌وقت انیمیشن چند بار راه می‌افتد.
  ///   ۲. `repeat()` می‌تواند یک فریمِ تازه زمان‌بندی کند در حالی که
  ///      هنوز داخلِ همان فریم هستیم.
  ///
  /// حالا فقط از `_apply` صدا زده می‌شود — یعنی از یک گردانندهٔ رویداد،
  /// که جای درستِ اثرِ جانبی است.
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
    // ═══════════════════════════════════════════════════════════════════
    // چرا بررسیِ mounted اینجا لازم است
    // ═══════════════════════════════════════════════════════════════════
    //
    // این از یک `NotificationListener` صدا زده می‌شود. اعلانِ اسکرول
    // می‌تواند در همان فریمی برسد که درخت در حال برچیده شدن است —
    // مثلاً وقتی کاربر با یک حرکتِ سریع تب را عوض می‌کند در حالی که
    // لیست هنوز در حال لغزیدن است. آن‌وقت `setState` روی یک State
    // مرده پرتاب می‌کند.
    if (!mounted) return;
    // فقط محورِ عمودی. یک لیستِ افقیِ داخلی نباید ریلِ عمودی را تکان دهد.
    if (m.axis != Axis.vertical) return;
    final total = m.maxScrollExtent;
    final scrollable = total > 8; // آستانه: چند پیکسل سرریزِ ناخواسته اسکرول نیست
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
    // بعد از به‌روزرسانیِ حالت، تصمیم بگیر انیمیشن باید بچرخد یا نه.
    // اینجا (گردانندهٔ رویداد) جای درستش است، نه داخلِ build.
    _syncBob();
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final rail = widget.railColor ?? scheme.primary;
    // قرص فقط وقتی که: صفحه اسکرول دارد، ته آن نیستیم، و کاربر هنوز
    // نفهمیده که می‌شود اسکرول کرد.
    final showPill =
        widget.showHint && _scrollable && !_atBottom && !_touched;

    return NotificationListener<ScrollMetricsNotification>(
      // این یکی در همان اولین چیدمان می‌آید، پیش از هر لمسی.
      onNotification: (n) {
        if (n.depth == 0) _apply(n.metrics);
        return false;
      },
      child: NotificationListener<ScrollNotification>(
        onNotification: (n) {
          if (n.depth != 0) return false;
          _apply(n.metrics, userScrolled: n is ScrollUpdateNotification);
          return false;
        },
        child: Stack(
          children: [
            Positioned.fill(child: widget.child),

            // ── محوشدگیِ لبهٔ پایین ──
            //
            // IgnorePointer حیاتی است: بدون آن، این لایه لمس‌های نزدیک
            // لبهٔ پایین صفحه را می‌بلعد و دکمه‌های آنجا کار نمی‌کنند.
            if (_scrollable && !_atBottom)
              Positioned(
                left: 0,
                right: 0,
                bottom: 0,
                height: 56 + widget.padBottom,
                child: IgnorePointer(
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                        colors: [
                          scheme.surface.withValues(alpha: 0),
                          scheme.surface.withValues(alpha: 0.72),
                        ],
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
                // در چیدمانِ راست‌به‌چپ، `right` همچنان یعنی سمت راستِ
                // فیزیکی — که همان جایی است که شست کاربر آنجاست.
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
                left: 0,
                right: 0,
                bottom: 12 + widget.padBottom,
                child: IgnorePointer(
                  child: RepaintBoundary(
                    child: Center(
                      child: AnimatedBuilder(
                        animation: _bob,
                        builder: (context, child) => Transform.translate(
                          offset: Offset(
                              0, math.sin(_bob.value * math.pi * 2) * 3.5),
                          child: child,
                        ),
                        child: _HintPill(
                          label: widget.hintLabel,
                          color: rail,
                          onSurface: scheme.onSurface,
                        ),
                      ),
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

/// ریلِ باریکِ سمت راست.
///
/// ارتفاع دستگیره با نسبتِ دیده‌شده از محتوا تناسب دارد — همان قراردادی
/// که هر نوار اسکرولی دارد و کاربر بدون توضیح می‌فهمدش: دستگیرهٔ کوتاه
/// یعنی «خیلی مانده».
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
      // کف ۲۸ پیکسل: دستگیره‌ای که برای یک لیستِ ۲۰۰ آیتمی حساب شود
      // چند پیکسل می‌شود و اصلاً دیده نمی‌شود.
      final thumb = math.max(28.0, h * viewport);
      final top = (h - thumb) * fraction;
      return SizedBox(
        width: 5,
        height: h,
        child: Stack(
          children: [
            Positioned.fill(
              child: DecoratedBox(
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(999),
                  color: color.withValues(alpha: 0.10),
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
                  color: color.withValues(alpha: 0.85),
                  boxShadow: [
                    BoxShadow(
                      color: color.withValues(alpha: 0.35),
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

class _HintPill extends StatelessWidget {
  const _HintPill({
    required this.label,
    required this.color,
    required this.onSurface,
  });

  final String label;
  final Color color, onSurface;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(999),
        color: color.withValues(alpha: 0.92),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.28),
            blurRadius: 12,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            label,
            style: const TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w900,
              color: Colors.white,
              height: 1.2,
            ),
          ),
          const SizedBox(width: 5),
          const Icon(Icons.keyboard_double_arrow_down_rounded,
              size: 17, color: Colors.white),
        ],
      ),
    );
  }
}
