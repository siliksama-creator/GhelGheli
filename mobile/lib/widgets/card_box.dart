import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../api_client.dart';
import '../core/money.dart';
import '../services/bazaar_billing.dart';
import 'rarity_card_frame.dart';

/// صندوقِ کارت — آینهٔ دقیقِ `userweb/src/components/CardBox.jsx`.
///
///  چرا این فایل وجود دارد: بک‌اندِ صندوق کامل و زنده بود (`overview`,
///    `buy`, `history`) ولی **هیچ کلاینتی صدایش نمی‌زد**. کاربری که کارتِ
///    فیزیکی نداشت، در دوئل پیام «حداقل پنج کارت لازم داری» می‌گرفت و هیچ
///    راهی برای گرفتنشان نبود — بن‌بستِ کامل. صندوق دقیقاً برای همین ساخته
///    شده بود و فقط درِ ورودی‌اش جا مانده بود.
///
/// ── دورِ ۲۸: از «یک ردیفِ دیگر» به «قهرمانِ صفحه» ──
///
/// تا دیروز صندوق یک کارتِ مستطیلی بود که بینِ پلن‌های پلاس و چیپ‌های
/// دسته‌بندی گم می‌شد؛ هم‌وزنِ یک آیتمِ ظاهریِ ده‌هزار تومانی دیده می‌شد در
/// حالی که تنها درِ ورود به دوئل است. سه چیز عوض شد:
///
///   ۱. **بنرِ شاخص** با تصویرِ ترنسپرنتِ صندوق، نه آیکونِ کوچکِ کنارِ تیتر.
///   ۲. **باز شدنِ انیمیشنی**: لرزش ← انفجارِ نور ← تعویضِ درِ بسته با باز.
///   ۳. **رونماییِ کارت‌ها** روی تمامِ صفحه، یکی‌یکی و با رنگِ سطحِ خودشان.
///
/// دو جا رندر می‌شود: فروشگاه، و درست همان‌جا که دوئل بن‌بست می‌شود.
class CardBox extends StatefulWidget {
  const CardBox({
    super.key,
    required this.api,
    this.onGranted,
    this.compact = false,
  });

  final ApiClient api;
  final VoidCallback? onGranted;

  /// حالتِ فشرده — جایی که صندوق داخلِ بن‌بستِ دوئل می‌نشیند و نباید کلِ
  /// صفحه را بگیرد: تصویرِ کوچک‌تر و متنِ کمکی پنهان.
  final bool compact;

  @override
  State<CardBox> createState() => _CardBoxState();
}

/// مرحلهٔ نمایش، جدا از وضعیتِ شبکه.
///
/// اگر این دو یکی می‌شدند، پرداختِ سریع باعث می‌شد انیمیشن نصفه بپرد و
/// پرداختِ کند باعث می‌شد صندوق قبل از رسیدنِ کارت‌ها باز شود.
enum _Phase { idle, shaking, bursting }

class _CardBoxState extends State<CardBox> with TickerProviderStateMixin {
  static const _gold = Color(0xFFFFD166);
  static const _orange = Color(0xFFF97316);

  Map<String, dynamic>? _data;
  String _error = '';
  bool _busy = false;
  _Phase _phase = _Phase.idle;

  late final AnimationController _idleCtrl = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 3600),
  )..repeat(reverse: true);

  late final AnimationController _shakeCtrl = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 420),
  );

  late final AnimationController _burstCtrl = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 900),
  );

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _idleCtrl.dispose();
    _shakeCtrl.dispose();
    _burstCtrl.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final res = await widget.api.get('/api/card-box/overview', fresh: true);
      if (!mounted) return;
      setState(() => _data = Map<String, dynamic>.from(res as Map));
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = 'صندوق در دسترس نیست');
    }
  }

  Future<void> _buy() async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _error = '';
      _phase = _Phase.shaking;
    });
    _shakeCtrl.repeat();
    try {
      // همان سه‌گامِ فروشگاه: سفارش از سرور، پرداخت در بازار، تحویل بعد
      // از راستی‌آزماییِ سرور. کلاینت هیچ‌وقت خودش «تحویل شد» نمی‌گوید.
      final order = Map<String, dynamic>.from(
          await widget.api.post('/api/card-box/buy', const {}) as Map);
      final orderId = '${order['orderId']}';
      final token = await BazaarBilling.purchase(
        productId: '${order['productId']}',
        payload: orderId,
      );
      final result = Map<String, dynamic>.from(
          await widget.api.post('/api/purchase/verify', {
        'orderId': orderId,
        'purchaseToken': token,
      }) as Map);
      if (!mounted) return;

      final cards = (result['cards'] as List?) ?? const [];
      _shakeCtrl.stop();
      setState(() => _phase = _Phase.bursting);
      unawaited(_burstCtrl.forward(from: 0));
      await _load();
      widget.onGranted?.call();

      // در باز می‌شود، نور می‌ترکد، بعد صحنهٔ رونمایی می‌آید.
      await Future<void>.delayed(const Duration(milliseconds: 620));
      if (!mounted) return;
      if (cards.isNotEmpty) {
        await showGeneralDialog<void>(
          context: context,
          barrierDismissible: false,
          barrierLabel: 'کارت‌های صندوق',
          barrierColor: Colors.transparent,
          transitionDuration: const Duration(milliseconds: 300),
          pageBuilder: (_, __, ___) => _RevealScreen(cards: cards),
          transitionBuilder: (_, anim, __, child) =>
              FadeTransition(opacity: anim, child: child),
        );
      }
      if (!mounted) return;
      setState(() => _phase = _Phase.idle);
    } on BillingUnavailable {
      if (mounted) {
        setState(() {
          _error = 'خرید درون‌برنامه‌ای روی این دستگاه فعال نیست';
          _phase = _Phase.idle;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = 'خرید انجام نشد';
          _phase = _Phase.idle;
        });
      }
    } finally {
      _shakeCtrl.stop();
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final data = _data;
    if (data == null) {
      return Container(
        padding: const EdgeInsets.all(26),
        alignment: Alignment.center,
        child: Text(
          _error.isEmpty ? 'در حال باز کردن صندوق…' : _error,
          style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 12),
        ),
      );
    }

    final size = (data['size'] as num?)?.toInt() ?? 5;
    final owned = (data['ownedCards'] as num?)?.toInt() ?? 0;
    final needsBox = data['needsBox'] == true;
    final odds = (data['odds'] as List?) ?? const [];
    final narrow = MediaQuery.sizeOf(context).width < 390 || widget.compact;

    return Container(
      margin: EdgeInsets.symmetric(vertical: widget.compact ? 12 : 14),
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(26),
        border: Border.all(color: _gold.withValues(alpha: 0.55), width: 1.5),
        gradient: const LinearGradient(
          begin: Alignment.topRight,
          end: Alignment.bottomLeft,
          colors: [Color(0xFF0D1B2C), Color(0xFF141033), Color(0xFF2A1140)],
          stops: [0, 0.62, 1],
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.42),
            blurRadius: 60,
            offset: const Offset(0, 20),
          ),
        ],
      ),
      child: Stack(
        children: [
          // هالهٔ نارنجیِ گوشهٔ بالا — همان `radial-gradient` نسخهٔ وب
          Positioned(
            top: -70,
            right: -50,
            child: Container(
              width: 190,
              height: 190,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: RadialGradient(colors: [
                  _orange.withValues(alpha: 0.3),
                  _orange.withValues(alpha: 0),
                ]),
              ),
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 13),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.center,
                  children: [
                    SizedBox(
                      width: narrow ? 104 : 150,
                      height: narrow ? 104 : 150,
                      child: _ChestStage(
                        idle: _idleCtrl,
                        shake: _shakeCtrl,
                        burst: _burstCtrl,
                        phase: _phase,
                      ),
                    ),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              const Expanded(
                                child: Text(
                                  'صندوق کارت',
                                  style: TextStyle(
                                    fontSize: 20,
                                    fontWeight: FontWeight.w900,
                                    color: _gold,
                                    letterSpacing: -0.2,
                                  ),
                                ),
                              ),
                              const SizedBox(width: 8),
                              Container(
                                padding: const EdgeInsets.symmetric(
                                    horizontal: 12, vertical: 7),
                                decoration: BoxDecoration(
                                  color: Colors.black.withValues(alpha: 0.34),
                                  borderRadius: BorderRadius.circular(14),
                                  border: Border.all(
                                      color: _gold.withValues(alpha: 0.45)),
                                ),
                                child: Text(
                                  Money.withUnit(data['price']),
                                  style: const TextStyle(
                                      color: _gold,
                                      fontWeight: FontWeight.w900,
                                      fontSize: 13.5),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 8),
                          Text(
                            needsBox
                                ? 'برای شروعِ دوئل به ${faNum(size)} کارت نیاز'
                                    ' داری. این صندوق دقیقاً همان‌قدر کارتِ'
                                    ' تصادفی می‌دهد و هر کارت امتیاز هم دارد.'
                                : 'کلکسیونت آمادهٔ دوئل است. هر صندوق'
                                    ' ${faNum(size)} کارتِ تصادفیِ دیگر با'
                                    ' امتیازشان اضافه می‌کند.',
                            style: const TextStyle(
                                fontSize: 11.5,
                                height: 1.75,
                                color: Color(0xFFC3CEDD)),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: Row(
                  children: [
                    for (final o in odds)
                      Expanded(
                        child: Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 3),
                          child: _OddChip(
                            rarity: '${(o as Map)['rarity']}',
                            percent: (o['percent'] as num?)?.toDouble() ?? 0,
                          ),
                        ),
                      ),
                  ],
                ),
              ),
              const SizedBox(height: 13),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: Row(
                  children: [
                    Expanded(
                      child: RichText(
                        text: TextSpan(
                          style: const TextStyle(
                              fontSize: 11, color: Color(0xFFDBE6F2)),
                          children: [
                            const TextSpan(text: 'کارت‌های فعال تو: '),
                            TextSpan(
                              text: faNum(owned),
                              style: const TextStyle(
                                  color: _gold, fontWeight: FontWeight.w900),
                            ),
                            TextSpan(
                                text: needsBox
                                    ? ' از ${faNum(size)}'
                                    : ' · آمادهٔ دوئل'),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    DecoratedBox(
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(14),
                        boxShadow: _busy
                            ? const []
                            : [
                                BoxShadow(
                                  color: _orange.withValues(alpha: 0.34),
                                  blurRadius: 22,
                                  offset: const Offset(0, 8),
                                ),
                              ],
                      ),
                      child: ElevatedButton(
                        onPressed: _busy ? null : _buy,
                        style: ElevatedButton.styleFrom(
                          backgroundColor: _gold,
                          foregroundColor: const Color(0xFF1A0F02),
                          elevation: 0,
                          padding: const EdgeInsets.symmetric(
                              horizontal: 20, vertical: 13),
                          shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(14)),
                          textStyle: const TextStyle(
                              fontWeight: FontWeight.w900, fontSize: 13.5),
                        ),
                        child: Text(
                            _busy ? 'در حال باز کردن…' : 'باز کردن صندوق'),
                      ),
                    ),
                  ],
                ),
              ),
              if (!widget.compact)
                const Padding(
                  padding: EdgeInsets.fromLTRB(16, 11, 16, 15),
                  child: Text(
                    'شانسِ هر سطح بالا نوشته شده و برای همه یکسان است.'
                    ' کارت‌ها به کلکسیون اضافه می‌شوند و در دوئل قابل'
                    ' بازی‌اند.',
                    style: TextStyle(
                        fontSize: 10, color: Color(0xFF8FA0B4), height: 1.65),
                  ),
                )
              else
                const SizedBox(height: 13),
              if (_error.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 14),
                  child: Text(_error,
                      style: const TextStyle(
                          color: Color(0xFFFCA5A5), fontSize: 11)),
                ),
            ],
          ),
          // روبانِ «ویژه» — همان `.cardBoxRibbon` نسخهٔ وب
          Positioned(
            top: 15,
            left: -40,
            child: Transform.rotate(
              angle: -0.663,
              child: Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 44, vertical: 5),
                decoration: const BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: [_gold, _orange],
                  ),
                ),
                child: const Text(
                  'ویژه',
                  style: TextStyle(
                    color: Color(0xFF2A1002),
                    fontWeight: FontWeight.w900,
                    fontSize: 10,
                    letterSpacing: 0.4,
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// صحنهٔ صندوق: هالهٔ تپنده + پرتوهای چرخان + خودِ صندوق.
///
/// تصویرِ بسته و باز دو فایلِ جدا با قابِ مربعِ هم‌اندازه‌اند، پس لحظهٔ
/// تعویض هیچ پرشِ اندازه‌ای رخ نمی‌دهد.
class _ChestStage extends StatelessWidget {
  const _ChestStage({
    required this.idle,
    required this.shake,
    required this.burst,
    required this.phase,
  });

  final AnimationController idle;
  final AnimationController shake;
  final AnimationController burst;
  final _Phase phase;

  @override
  Widget build(BuildContext context) {
    final open = phase == _Phase.bursting;
    return AnimatedBuilder(
      animation: Listenable.merge([idle, shake, burst]),
      builder: (context, _) {
        final t = idle.value;
        final b = burst.value;

        // شناورِ آرام در حالتِ عادی، لرزشِ تند هنگامِ باز شدن
        Offset offset;
        double angle;
        if (phase == _Phase.shaking) {
          final s = shake.value * 2 * math.pi;
          offset = Offset(3 * _sin(s), 1.6 * _sin(s * 2));
          angle = 0.052 * _sin(s);
        } else {
          offset = Offset(0, -7 * (t - 0.5) * 2);
          angle = 0.017 * (t - 0.5) * 2;
        }

        // ترکیدنِ نور: بزرگ می‌شود، بعد کمی جمع می‌شود
        final glowScale = open
            ? (b < 0.55 ? 0.6 + b / 0.55 * 1.1 : 1.7 - (b - 0.55) / 0.45 * 0.55)
            : 0.93 + 0.14 * t;
        final popScale = open
            ? (b < 0.35 ? 0.86 + b / 0.35 * 0.27 : 1.13 - (b - 0.35) / 0.65 * 0.13)
            : 1.0;

        return Stack(
          alignment: Alignment.center,
          children: [
            Transform.scale(
              scale: glowScale,
              child: Container(
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: RadialGradient(colors: [
                    const Color(0xFFFFD166).withValues(alpha: 0.45),
                    const Color(0xFFF97316).withValues(alpha: 0.16),
                    const Color(0xFFF97316).withValues(alpha: 0),
                  ], stops: const [0, 0.45, 0.7]),
                ),
              ),
            ),
            if (open && b < 1)
              Opacity(
                opacity: b < 0.35 ? b / 0.35 : (1 - (b - 0.35) / 0.65),
                child: Transform.rotate(
                  angle: b * 1.0,
                  child: Transform.scale(
                    scale: 0.5 + b,
                    child: CustomPaint(
                      size: const Size.square(220),
                      painter: _RaysPainter(),
                    ),
                  ),
                ),
              ),
            Transform.translate(
              offset: offset,
              child: Transform.rotate(
                angle: angle,
                child: Transform.scale(
                  scale: popScale,
                  child: Image.asset(
                    open
                        ? 'assets/shop/card_box_open.webp'
                        : 'assets/shop/card_box_closed.webp',
                    fit: BoxFit.contain,
                    filterQuality: FilterQuality.medium,
                  ),
                ),
              ),
            ),
          ],
        );
      },
    );
  }

  static double _sin(double x) => math.sin(x);
}

/// پرتوهای نوریِ لحظهٔ باز شدن — معادلِ `conic-gradient` نسخهٔ وب.
class _RaysPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final radius = size.width / 2;
    final paint = Paint()..style = PaintingStyle.fill;
    for (var i = 0; i < 12; i++) {
      final a = i * math.pi / 6; // ۳۰ درجه
      paint.color = (i.isEven ? const Color(0xFFFFD166) : const Color(0xFFF97316))
          .withValues(alpha: 0.55);
      final path = Path()
        ..moveTo(center.dx, center.dy)
        ..lineTo(center.dx + radius * _cos(a - 0.03),
            center.dy + radius * _sin(a - 0.03))
        ..lineTo(center.dx + radius * _cos(a + 0.03),
            center.dy + radius * _sin(a + 0.03))
        ..close();
      canvas.drawPath(path, paint);
    }
  }

  static double _sin(double x) => math.sin(x);
  static double _cos(double x) => math.cos(x);

  @override
  bool shouldRepaint(covariant _RaysPainter oldDelegate) => false;
}

/// صحنهٔ رونمایی: کارت‌ها یکی‌یکی و با رنگِ سطحِ خودشان رو می‌آیند.
///
/// روی تمامِ صفحه است، نه یک فهرستِ افقیِ ریز در پایینِ بنر — چون لحظهٔ
/// گرفتنِ جایزه تنها لحظه‌ای است که کاربر واقعاً می‌خواهد نگاه کند.
class _RevealScreen extends StatefulWidget {
  const _RevealScreen({required this.cards});

  final List<dynamic> cards;

  @override
  State<_RevealScreen> createState() => _RevealScreenState();
}

class _RevealScreenState extends State<_RevealScreen> {
  int _revealed = 0;

  @override
  void initState() {
    super.initState();
    for (var i = 0; i < widget.cards.length; i++) {
      Future<void>.delayed(Duration(milliseconds: 260 * i + 180), () {
        if (mounted) setState(() => _revealed = i + 1);
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final done = _revealed >= widget.cards.length;
    return Material(
      color: Colors.transparent,
      child: DecoratedBox(
        decoration: const BoxDecoration(
          gradient: RadialGradient(
            center: Alignment(0, -0.16),
            radius: 1.0,
            colors: [Color(0xF02A1140), Color(0xF704080F)],
          ),
        ),
        child: SafeArea(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(18),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Text(
                    'صندوق باز شد',
                    style: TextStyle(
                        fontSize: 19,
                        fontWeight: FontWeight.w900,
                        color: Color(0xFFFFD166)),
                  ),
                  const SizedBox(height: 8),
                  RichText(
                    text: TextSpan(
                      style: const TextStyle(
                          fontSize: 11.5, color: Color(0xFFA9B7C8)),
                      children: [
                        TextSpan(
                          text: '${faNum(widget.cards.length)} کارت',
                          style: const TextStyle(
                              color: Color(0xFF22E7A6),
                              fontWeight: FontWeight.w900,
                              fontSize: 12),
                        ),
                        const TextSpan(text: ' به کلکسیونت اضافه شد'),
                      ],
                    ),
                  ),
                  const SizedBox(height: 18),
                  Wrap(
                    spacing: 11,
                    runSpacing: 11,
                    alignment: WrapAlignment.center,
                    children: [
                      for (var i = 0; i < widget.cards.length; i++)
                        _PrizeCard(
                          card: Map<String, dynamic>.from(
                              widget.cards[i] as Map),
                          shown: i < _revealed,
                        ),
                    ],
                  ),
                  const SizedBox(height: 20),
                  AnimatedOpacity(
                    opacity: done ? 1 : 0,
                    duration: const Duration(milliseconds: 260),
                    child: ElevatedButton(
                      onPressed:
                          done ? () => Navigator.of(context).pop() : null,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFFFFD166),
                        foregroundColor: const Color(0xFF1A0F02),
                        padding: const EdgeInsets.symmetric(
                            horizontal: 34, vertical: 13),
                        shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(14)),
                        textStyle: const TextStyle(
                            fontWeight: FontWeight.w900, fontSize: 13.5),
                      ),
                      child: const Text('عالی'),
                    ),
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

class _PrizeCard extends StatelessWidget {
  const _PrizeCard({required this.card, required this.shown});

  final Map<String, dynamic> card;
  final bool shown;

  @override
  Widget build(BuildContext context) {
    final rarity = '${card['rarity']}';
    final accent = (rarityColors[rarity] ?? const [Color(0xFF94A3B8)]).first;
    final label = rarityLabels[rarity] ?? rarity;
    final points = (card['pointValue'] as num?)?.toInt() ?? 0;

    return AnimatedScale(
      scale: shown ? 1 : 0.7,
      duration: const Duration(milliseconds: 500),
      curve: Curves.easeOutBack,
      child: AnimatedOpacity(
        opacity: shown ? 1 : 0,
        duration: const Duration(milliseconds: 320),
        child: Container(
          width: 98,
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 12),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: accent, width: 1.5),
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [
                Colors.white.withValues(alpha: 0.13),
                Colors.black.withValues(alpha: 0.4),
              ],
            ),
            boxShadow: [
              BoxShadow(
                color: accent.withValues(alpha: 0.42),
                blurRadius: 22,
                spreadRadius: -6,
              ),
            ],
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                    fontSize: 9.5,
                    fontWeight: FontWeight.w900,
                    color: accent,
                    letterSpacing: 0.3),
              ),
              const SizedBox(height: 6),
              SizedBox(
                height: 34,
                child: Center(
                  child: Text(
                    '${card['name'] ?? 'کارت'}',
                    maxLines: 2,
                    textAlign: TextAlign.center,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                        fontSize: 11.5,
                        fontWeight: FontWeight.w900,
                        color: Colors.white,
                        height: 1.5),
                  ),
                ),
              ),
              const SizedBox(height: 6),
              Text(
                '${faNum(points)} امتیاز',
                style: const TextStyle(
                    fontSize: 10,
                    color: Color(0xFFFFD166),
                    fontWeight: FontWeight.w900),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _OddChip extends StatelessWidget {
  const _OddChip({required this.rarity, required this.percent});

  final String rarity;
  final double percent;

  @override
  Widget build(BuildContext context) {
    final accent = (rarityColors[rarity] ?? const [Color(0xFF94A3B8)]).first;
    final label = rarityLabels[rarity] ?? rarity;
    // درصد یک‌رقمِ اعشار: «۳٫۵٪» خواناست، «۳.۵۰۰٪» نه. عددِ صحیح هم
    // بی‌خودی «٫۰» نگیرد.
    //
    // جداکنندهٔ اعشار را خودِ `faNum` فارسی می‌کند.
    final text = percent == percent.roundToDouble()
        ? faNum(percent.round())
        : faNum(percent.toStringAsFixed(1));
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 7, horizontal: 4),
      decoration: BoxDecoration(
        color: Colors.black.withValues(alpha: 0.26),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.white.withValues(alpha: 0.1)),
      ),
      child: Column(
        children: [
          Text('$text٪',
              style: TextStyle(
                  color: accent, fontWeight: FontWeight.w900, fontSize: 14)),
          const SizedBox(height: 2),
          Text(label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontSize: 9.5, color: Color(0xFF9AA8BA))),
        ],
      ),
    );
  }
}
