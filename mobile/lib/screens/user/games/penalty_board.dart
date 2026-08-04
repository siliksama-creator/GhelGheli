// ضربات پنالتی — صفحهٔ بازی.
//
// ═══════════════════════════════════════════════════════════════════════════
// چرا این صفحه با سه بازی دیگر فرق دارد
// ═══════════════════════════════════════════════════════════════════════════
//
// بقیه «تخته»‌اند: کاربر خانه‌ای را می‌زند و مهره ظاهر می‌شود. اینجا یک
// **لحظهٔ فیزیکی** است که باید حس شود:
//
//   ۱. زننده جهت را انتخاب می‌کند و قدرت را با نگه داشتن انگشت تنظیم
//      می‌کند — نوار قدرت بالا و پایین می‌رود، مثل بازی‌های واقعی گلف
//      و پنالتی. رها کردن در لحظهٔ درست، مهارت است نه شانس.
//   ۲. دروازه‌بان ناحیهٔ شیرجه را می‌زند و منتظر می‌ماند.
//   ۳. وقتی هر دو انتخاب کردند، سرور نتیجه را می‌گوید و **بعد** انیمیشن
//      اجرا می‌شود: توپ روی یک منحنی پرتابه با چرخش حرکت می‌کند،
//      دروازه‌بان شیرجه می‌رود، و تور تکان می‌خورد.
//
// انیمیشن همیشه بعد از جواب سرور است، هرگز قبلش. اگر برعکس بود، کاربر
// نتیجه را یک لحظه زودتر می‌دید و می‌شد با پروکسی تقلب کرد — همان
// اصلی که در گردونهٔ شانس هم رعایت شده.
//
// ═══════════════════════════════════════════════════════════════════════════
// چرا فیزیک دستی و نه یک پکیج
// ═══════════════════════════════════════════════════════════════════════════
//
// یک موتور فیزیک کامل (مثل Forge2D) چند صد کیلوبایت به APK اضافه می‌کند
// برای چیزی که با یک منحنی درجه دو و کمی درون‌یابی قابل کشیدن است. بعد
// از ممیزی حافظه که نشان داد هر مگابایت چقدر گران است، این معامله
// نمی‌ارزید.
import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../../api_client.dart';
import '../../../core/assets.dart';
import '../../../theme/tokens.dart';
import 'game_audio.dart';
import 'game_scaffold.dart';
import 'game_session.dart';

const _accent = Color(0xFF38BDF8);

class PenaltyScreen extends StatefulWidget {
  const PenaltyScreen({super.key, required this.api, required this.onBack});
  final ApiClient api;
  final VoidCallback onBack;

  @override
  State<PenaltyScreen> createState() => _PenaltyScreenState();
}

class _PenaltyScreenState extends State<PenaltyScreen> {
  late final GameSession _s =
      GameSession(api: widget.api, gameId: 'penalty')..connect();

  @override
  void dispose() {
    _s.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return GameScaffold(
      session: _s,
      api: widget.api,
      title: 'ضربات پنالتی',
      accent: _accent,
      symbols: const {'X': '⚽', 'O': '🧤'},
      onBack: widget.onBack,
      boardBuilder: (_) => _PenaltyBoard(session: _s),
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════

class _PenaltyBoard extends StatefulWidget {
  const _PenaltyBoard({required this.session});
  final GameSession session;

  @override
  State<_PenaltyBoard> createState() => _PenaltyBoardState();
}

class _PenaltyBoardState extends State<_PenaltyBoard>
    with TickerProviderStateMixin {
  /// انیمیشن پرواز توپ + شیرجهٔ دروازه‌بان.
  late final AnimationController _kick = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1150),
  );

  /// نوسان نوار قدرت. کاربر نگه می‌دارد، این بالا و پایین می‌رود، رها
  /// می‌کند و همان لحظه قدرت قفل می‌شود.
  late final AnimationController _power = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 900),
  );

  int? _pickedZone;
  bool _charging = false;
  double _lockedPower = 0.7;

  /// آخرین ضربه‌ای که انیمیشنش پخش شد — تا یک ضربه دوبار پخش نشود.
  int _playedKicks = -1;

  @override
  void initState() {
    super.initState();
    widget.session.addListener(_onState);
  }

  @override
  void dispose() {
    widget.session.removeListener(_onState);
    _kick.dispose();
    _power.dispose();
    super.dispose();
  }

  /// وقتی سرور نتیجهٔ ضربه را فرستاد، انیمیشن را اجرا کن.
  void _onState() {
    final hist = (widget.session.state['history'] as List?) ?? const [];
    if (hist.length != _playedKicks && hist.isNotEmpty) {
      _playedKicks = hist.length;
      _pickedZone = null;
      _charging = false;
      _power.stop();
      _kick.forward(from: 0);
      final last = widget.session.state['lastKick'];
      if (last is Map) {
        final o = '${last['outcome']}';
        GameAudio.instance.play(o == 'goal' ? Sfx.win : Sfx.move);
      }
    } else if (hist.isEmpty && _playedKicks != -1) {
      _playedKicks = -1;
    }
  }

  bool get _amShooter {
    final role = widget.session.state['role'];
    if (role is String) return role == 'shooter';
    return widget.session.state['shooter'] == widget.session.mySymbol;
  }

  bool get _alreadyChose => widget.session.state['iChose'] == true;

  void _startCharge(int zone) {
    if (_alreadyChose || _kick.isAnimating) return;
    setState(() {
      _pickedZone = zone;
      _charging = true;
    });
    _power.repeat(reverse: true);
  }

  void _release() {
    if (!_charging || _pickedZone == null) return;
    // مقدار نوسان در لحظهٔ رها کردن = قدرت. بازهٔ ۰.۳۵ تا ۱ چون شوت
    // خیلی ضعیف هیچ‌وقت انتخاب منطقی نیست و فقط کاربر را سرخورده می‌کند.
    final p = 0.35 + _power.value * 0.65;
    _power.stop();
    setState(() {
      _charging = false;
      _lockedPower = p;
    });
    widget.session.moveObject({'zone': _pickedZone, 'power': p});
  }

  void _dive(int zone) {
    if (_alreadyChose || _kick.isAnimating) return;
    setState(() => _pickedZone = zone);
    widget.session.moveObject({'zone': zone});
  }

  @override
  Widget build(BuildContext context) {
    final st = widget.session.state;
    final score = (st['score'] as Map?) ?? const {'X': 0, 'O': 0};
    final taken = (st['taken'] as Map?) ?? const {'X': 0, 'O': 0};
    final history = (st['history'] as List?) ?? const [];
    final lastKick = st['lastKick'];
    final suddenDeath = st['suddenDeath'] == true;
    final waiting = st['waitingForOpponent'] == true;
    final me = widget.session.mySymbol ?? 'X';
    final foe = me == 'X' ? 'O' : 'X';

    return Column(
      children: [
        _Scoreboard(
          myScore: NumberParser.toInt(score[me]),
          foeScore: NumberParser.toInt(score[foe]),
          myTaken: NumberParser.toInt(taken[me]),
          foeTaken: NumberParser.toInt(taken[foe]),
          suddenDeath: suddenDeath,
          history: history,
          me: me,
        ),
        Gaps.vSm,
        Expanded(
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: AspectRatio(
                aspectRatio: 1.35,
                child: AnimatedBuilder(
                  animation: Listenable.merge([_kick, _power]),
                  builder: (context, _) => GestureDetector(
                    onTapUp: (_) => _charging ? _release() : null,
                    child: CustomPaint(
                      painter: _PitchPainter(
                        kick: _kick.value,
                        animating: _kick.isAnimating,
                        lastKick: lastKick is Map
                            ? Map<String, dynamic>.from(lastKick)
                            : null,
                        hoverZone: _pickedZone,
                        amShooter: _amShooter,
                        power: _charging
                            ? 0.35 + _power.value * 0.65
                            : _lockedPower,
                        charging: _charging,
                      ),
                      child: _ZoneGrid(
                        enabled: !_alreadyChose && !_kick.isAnimating,
                        amShooter: _amShooter,
                        picked: _pickedZone,
                        onDown: _amShooter ? _startCharge : null,
                        onTap: _amShooter ? null : _dive,
                        onUp: _amShooter ? _release : null,
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
        Gaps.vSm,
        _Prompt(
          amShooter: _amShooter,
          chose: _alreadyChose,
          waiting: waiting,
          charging: _charging,
          animating: _kick.isAnimating,
          outcome: lastKick is Map && _kick.isAnimating && _kick.value > 0.75
              ? '${lastKick['outcome']}'
              : null,
        ),
      ],
    );
  }
}

// ── تابلوی امتیاز ─────────────────────────────────────────────────────────
class _Scoreboard extends StatelessWidget {
  const _Scoreboard({
    required this.myScore,
    required this.foeScore,
    required this.myTaken,
    required this.foeTaken,
    required this.suddenDeath,
    required this.history,
    required this.me,
  });

  final int myScore, foeScore, myTaken, foeTaken;
  final bool suddenDeath;
  final List history;
  final String me;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Column(
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text('تو', style: theme.textTheme.labelLarge),
            Gaps.hSm,
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(12),
                color: _accent.withValues(alpha: 0.16),
                border: Border.all(color: _accent.withValues(alpha: 0.45)),
              ),
              child: Text(
                '${faNum(myScore)} - ${faNum(foeScore)}',
                style: const TextStyle(
                    fontSize: 22, fontWeight: FontWeight.w900, height: 1.2),
              ),
            ),
            Gaps.hSm,
            Text('حریف', style: theme.textTheme.labelLarge),
          ],
        ),
        if (suddenDeath)
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Text('⚡ مرگ ناگهانی',
                style: theme.textTheme.labelMedium
                    ?.copyWith(color: const Color(0xFFFFD36B))),
          ),
        Gaps.vXs,
        // ردیف توپ‌ها: گل سبز، مهار/بیرون خاکستری. یک نگاه کافی است.
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            for (final sym in [me, me == 'X' ? 'O' : 'X'])
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 6),
                child: Row(
                  children: [
                    for (final h in history.whereType<Map>().where(
                        (h) => h['shooter'] == sym))
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 1.5),
                        child: Container(
                          width: 11,
                          height: 11,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            color: h['outcome'] == 'goal'
                                ? const Color(0xFF84CC16)
                                : Colors.white24,
                            border: Border.all(
                                color: Colors.white.withValues(alpha: 0.25)),
                          ),
                        ),
                      ),
                  ],
                ),
              ),
          ],
        ),
      ],
    );
  }
}

// ── شبکهٔ نواحی قابل لمس ───────────────────────────────────────────────────
class _ZoneGrid extends StatelessWidget {
  const _ZoneGrid({
    required this.enabled,
    required this.amShooter,
    required this.picked,
    this.onDown,
    this.onTap,
    this.onUp,
  });

  final bool enabled, amShooter;
  final int? picked;
  final void Function(int)? onDown;
  final void Function(int)? onTap;
  final VoidCallback? onUp;

  @override
  Widget build(BuildContext context) {
    // ═══════════════════════════════════════════════════════════════════
    // چرا اینجا Directionality.ltr اجباری است — باگ «به راست می‌زنیم به
    // چپ می‌زنه»
    // ═══════════════════════════════════════════════════════════════════
    //
    // کل اپ داخل `Directionality(textDirection: rtl)` است (main.dart) و
    // یک `Row` معمولی این جهت را به ارث می‌برد: فرزند اول سمت **راست**
    // رندر می‌شود.
    //
    // ولی نقاشِ زمین ریاضیِ چپ‌به‌راست دارد:
    //     x = gl + gw * (col + 0.5) / 3      → ستون ۰ سمت چپ
    //
    // پس کاربر گوشهٔ راست را لمس می‌کرد، ناحیهٔ ۰ ثبت می‌شد، و توپ به
    // گوشهٔ **چپ** می‌رفت. دقیقاً چیزی که مالک گزارش داد. دروازه‌بان هم
    // آینه‌ای شیرجه می‌زد.
    //
    // یک دروازهٔ فوتبال جهتِ متن ندارد؛ مختصاتش فیزیکی است. پس شبکه
    // صریحاً LTR می‌شود تا با نقاش هم‌جهت بماند. متن‌های صفحه بیرون این
    // ویجت‌اند و همچنان RTL می‌مانند.
    //
    // با تست قفل شد: penalty_rtl_test.dart
    return Directionality(
      textDirection: TextDirection.ltr,
      child: LayoutBuilder(builder: (context, c) {
      final gw = c.maxWidth * 0.78;
      final gh = c.maxHeight * 0.46;
      final left = (c.maxWidth - gw) / 2;
      const top = 0.06;
      return Stack(
        children: [
          Positioned(
            left: left,
            top: c.maxHeight * top,
            width: gw,
            height: gh,
            child: Column(
              children: [
                for (var r = 0; r < 3; r++)
                  Expanded(
                    child: Row(
                      children: [
                        for (var col = 0; col < 3; col++)
                          Expanded(
                            child: _ZoneCell(
                              zone: r * 3 + col,
                              enabled: enabled,
                              selected: picked == r * 3 + col,
                              amShooter: amShooter,
                              onDown: onDown,
                              onTap: onTap,
                              onUp: onUp,
                            ),
                          ),
                      ],
                    ),
                  ),
              ],
            ),
          ),
        ],
      );
      }),
    );
  }
}

class _ZoneCell extends StatelessWidget {
  const _ZoneCell({
    required this.zone,
    required this.enabled,
    required this.selected,
    required this.amShooter,
    this.onDown,
    this.onTap,
    this.onUp,
  });

  final int zone;
  final bool enabled, selected, amShooter;
  final void Function(int)? onDown;
  final void Function(int)? onTap;
  final VoidCallback? onUp;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      // زننده: نگه‌داشتن → شارژ قدرت، رها کردن → شوت.
      onTapDown: enabled && amShooter ? (_) => onDown?.call(zone) : null,
      onTapUp: enabled && amShooter ? (_) => onUp?.call() : null,
      onTapCancel: enabled && amShooter ? () => onUp?.call() : null,
      // دروازه‌بان: یک ضربه کافی است.
      onTap: enabled && !amShooter ? () => onTap?.call(zone) : null,
      child: Container(
        margin: const EdgeInsets.all(1.5),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(6),
          color: selected
              ? _accent.withValues(alpha: 0.30)
              : Colors.white.withValues(alpha: enabled ? 0.045 : 0.015),
          border: Border.all(
            color: selected
                ? _accent
                : Colors.white.withValues(alpha: enabled ? 0.16 : 0.06),
            width: selected ? 2 : 1,
          ),
        ),
      ),
    );
  }
}

// ── نقاشی زمین، دروازه، توپ و دروازه‌بان ──────────────────────────────────
class _PitchPainter extends CustomPainter {
  _PitchPainter({
    required this.kick,
    required this.animating,
    required this.lastKick,
    required this.hoverZone,
    required this.amShooter,
    required this.power,
    required this.charging,
  });

  final double kick;
  final bool animating, amShooter, charging;
  final Map<String, dynamic>? lastKick;
  final int? hoverZone;
  final double power;

  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width, h = size.height;

    // ── چمن با نوارهای روشن/تیره، برای عمق ──
    final grass = Paint()..color = const Color(0xFF0E3B1E);
    canvas.drawRect(Offset.zero & size, grass);
    final stripe = Paint()..color = Colors.white.withValues(alpha: 0.025);
    for (var i = 0; i < 8; i++) {
      if (i.isEven) {
        final top = h * (0.52 + i * 0.06);
        canvas.drawRect(Rect.fromLTWH(0, top, w, h * 0.06), stripe);
      }
    }

    // ── محوطهٔ جریمه ──
    final line = Paint()
      ..color = Colors.white.withValues(alpha: 0.22)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2;
    canvas.drawRect(
        Rect.fromLTWH(w * 0.10, h * 0.03, w * 0.80, h * 0.62), line);

    // ── دروازه ──
    final gw = w * 0.78, gh = h * 0.46;
    final gl = (w - gw) / 2, gt = h * 0.06;

    // تور
    final net = Paint()
      ..color = Colors.white.withValues(alpha: 0.13)
      ..strokeWidth = 1;
    for (var x = 0.0; x <= gw; x += gw / 14) {
      canvas.drawLine(Offset(gl + x, gt), Offset(gl + x, gt + gh), net);
    }
    for (var y = 0.0; y <= gh; y += gh / 8) {
      canvas.drawLine(Offset(gl, gt + y), Offset(gl + gw, gt + y), net);
    }

    // تیرک‌ها
    final post = Paint()
      ..color = Colors.white
      ..style = PaintingStyle.stroke
      ..strokeWidth = 5
      ..strokeCap = StrokeCap.round;
    canvas.drawLine(Offset(gl, gt + gh), Offset(gl, gt), post);
    canvas.drawLine(Offset(gl + gw, gt + gh), Offset(gl + gw, gt), post);
    canvas.drawLine(Offset(gl, gt), Offset(gl + gw, gt), post);

    // ── نقطهٔ پنالتی ──
    final spot = Offset(w / 2, h * 0.88);
    canvas.drawCircle(
        spot, 3.5, Paint()..color = Colors.white.withValues(alpha: 0.55));

    /// مرکز یک ناحیه روی دهانهٔ دروازه.
    Offset zoneCenter(int z) {
      final c = z % 3, r = z ~/ 3;
      return Offset(gl + gw * (c + 0.5) / 3, gt + gh * (r + 0.5) / 3);
    }

    final lk = lastKick;
    final outcome = lk == null ? null : '${lk['outcome']}';
    final shotZone = lk == null ? null : NumberParser.toInt(lk['shotZone']);
    final diveZone = lk == null ? null : NumberParser.toInt(lk['diveZone']);

    // ── دروازه‌بان ──
    //
    // در حالت سکون وسط دروازه می‌ایستد؛ هنگام انیمیشن به سمت ناحیهٔ
    // انتخابی شیرجه می‌رود. حرکت با easeOut شروع می‌شود چون شیرجه
    // انفجاری است، نه یکنواخت.
    Offset keeperPos = Offset(w / 2, gt + gh * 0.72);
    double keeperTilt = 0;
    if (animating && diveZone != null) {
      final target = zoneCenter(diveZone);
      final t = Curves.easeOutCubic.transform(math.min(1, kick / 0.55));
      keeperPos = Offset.lerp(keeperPos, target, t)!;
      keeperTilt = (target.dx - w / 2) / (gw / 2) * 0.9 * t;
    }
    _drawKeeper(canvas, keeperPos, keeperTilt, gh * 0.30);

    // ── توپ ──
    Offset ball = spot;
    double ballR = math.min(w, h) * 0.033;
    if (animating && shotZone != null) {
      final target = zoneCenter(shotZone);
      // مسیر پرتابه: درون‌یابی خطی افقی + یک قوس عمودی.
      //
      // توپ در نیمهٔ راه بالاتر از خط مستقیم می‌رود (قوس)، و همان‌طور
      // که به دروازه نزدیک می‌شود کوچک‌تر می‌شود — پرسپکتیو ارزان ولی
      // مؤثر. بدون کوچک شدن، توپ روی صفحه «سُر می‌خورد» به‌جای اینکه
      // «دور شود».
      final t = math.min(1.0, kick / 0.62);
      final e = Curves.easeOutQuad.transform(t);
      final x = _lerp(spot.dx, target.dx, e);
      final arc = math.sin(e * math.pi) * (h * 0.10) * (0.5 + power * 0.5);
      final y = _lerp(spot.dy, target.dy, e) - arc;
      ball = Offset(x, y);
      ballR = _lerp(ballR, ballR * 0.55, e);

      // مهار: توپ در ناحیهٔ دروازه‌بان می‌ایستد و برمی‌گردد.
      if (outcome == 'save' && kick > 0.62) {
        final back = (kick - 0.62) / 0.38;
        ball = Offset.lerp(ball, Offset(spot.dx, spot.dy - h * 0.10), back)!;
      }
      // بیرون: از کنار تیرک رد می‌شود.
      if (outcome == 'miss') {
        final off = (shotZone % 3 == 0) ? -1.0 : (shotZone % 3 == 2 ? 1.0 : 0.0);
        final up = shotZone ~/ 3 == 0 ? -1.0 : 0.0;
        ball = Offset(ball.dx + off * gw * 0.16 * e,
            ball.dy + up * gh * 0.28 * e);
      }
    }
    _drawBall(canvas, ball, ballR, animating ? kick * 14 : 0);

    // ── نوار قدرت ──
    if (charging) {
      final barW = w * 0.06, barH = h * 0.42;
      final bx = w * 0.035, by = h * 0.30;
      final bg = RRect.fromRectAndRadius(
          Rect.fromLTWH(bx, by, barW, barH), const Radius.circular(8));
      canvas.drawRRect(bg, Paint()..color = Colors.black.withValues(alpha: 0.45));
      final fillH = barH * power;
      // سبز → زرد → قرمز: قدرت زیاد یعنی مهار سخت‌تر ولی خطای بیشتر.
      final col = Color.lerp(const Color(0xFF84CC16),
          const Color(0xFFEF4444), math.max(0, (power - 0.5) * 2))!;
      canvas.drawRRect(
        RRect.fromRectAndRadius(
            Rect.fromLTWH(bx, by + barH - fillH, barW, fillH),
            const Radius.circular(8)),
        Paint()..color = col,
      );
      canvas.drawRRect(
          bg,
          Paint()
            ..style = PaintingStyle.stroke
            ..strokeWidth = 2
            ..color = Colors.white.withValues(alpha: 0.5));
    }
  }

  static double _lerp(double a, double b, double t) => a + (b - a) * t;

  void _drawBall(Canvas canvas, Offset c, double r, double spin) {
    canvas.save();
    canvas.translate(c.dx, c.dy);
    canvas.rotate(spin);
    // سایه زیر توپ، برای اینکه روی زمین بنشیند نه شناور باشد
    canvas.drawOval(
      Rect.fromCenter(center: Offset(0, r * 1.25), width: r * 1.7, height: r * .5),
      Paint()..color = Colors.black.withValues(alpha: 0.28),
    );
    canvas.drawCircle(Offset.zero, r, Paint()..color = Colors.white);
    // پنج‌ضلعی‌های ساده — جزئیات بیشتر در این اندازه دیده نمی‌شود
    final dark = Paint()..color = const Color(0xFF16202C);
    canvas.drawCircle(Offset.zero, r * 0.34, dark);
    for (var i = 0; i < 5; i++) {
      final a = i * math.pi * 2 / 5 - math.pi / 2;
      canvas.drawCircle(
          Offset(math.cos(a) * r * 0.66, math.sin(a) * r * 0.66), r * 0.19, dark);
    }
    canvas.restore();
  }

  void _drawKeeper(Canvas canvas, Offset c, double tilt, double size) {
    canvas.save();
    canvas.translate(c.dx, c.dy);
    canvas.rotate(tilt);
    final body = Paint()..color = const Color(0xFFF59E0B);
    // تنه
    canvas.drawRRect(
      RRect.fromRectAndRadius(
          Rect.fromCenter(center: Offset.zero, width: size * 0.5, height: size),
          Radius.circular(size * 0.18)),
      body,
    );
    // سر
    canvas.drawCircle(Offset(0, -size * 0.68), size * 0.22,
        Paint()..color = const Color(0xFFFFDBAC));
    // دست‌ها — هنگام شیرجه باز می‌شوند
    final arm = Paint()
      ..color = const Color(0xFFF59E0B)
      ..strokeWidth = size * 0.16
      ..strokeCap = StrokeCap.round;
    final spread = size * (0.55 + tilt.abs() * 0.5);
    canvas.drawLine(Offset(-size * 0.2, -size * 0.25),
        Offset(-spread, -size * 0.55), arm);
    canvas.drawLine(Offset(size * 0.2, -size * 0.25),
        Offset(spread, -size * 0.55), arm);
    // دستکش‌ها
    final glove = Paint()..color = const Color(0xFF22D3EE);
    canvas.drawCircle(Offset(-spread, -size * 0.55), size * 0.13, glove);
    canvas.drawCircle(Offset(spread, -size * 0.55), size * 0.13, glove);
    canvas.restore();
  }

  @override
  bool shouldRepaint(covariant _PitchPainter old) =>
      old.kick != kick ||
      old.animating != animating ||
      old.hoverZone != hoverZone ||
      old.power != power ||
      old.charging != charging ||
      old.lastKick != lastKick;
}

// ── راهنمای پایین صفحه ────────────────────────────────────────────────────
class _Prompt extends StatelessWidget {
  const _Prompt({
    required this.amShooter,
    required this.chose,
    required this.waiting,
    required this.charging,
    required this.animating,
    this.outcome,
  });

  final bool amShooter, chose, waiting, charging, animating;
  final String? outcome;

  @override
  Widget build(BuildContext context) {
    String text;
    Color color = Colors.white70;

    if (outcome != null) {
      switch (outcome) {
        case 'goal':
          text = '⚽ گل شد!';
          color = const Color(0xFF84CC16);
          break;
        case 'save':
          text = '🧤 مهار شد!';
          color = const Color(0xFF38BDF8);
          break;
        default:
          text = '❌ بیرون رفت!';
          color = const Color(0xFFEF4444);
      }
    } else if (animating) {
      text = '...';
    } else if (charging) {
      text = 'رها کن تا شوت بزنی — هرچه بالاتر، محکم‌تر';
      color = const Color(0xFFFFD36B);
    } else if (chose || waiting) {
      text = 'منتظر حریف...';
    } else if (amShooter) {
      text = '⚽ تو می‌زنی — انگشتت را روی یک گوشه نگه دار';
      color = const Color(0xFFFFD36B);
    } else {
      text = '🧤 تو دروازه‌بانی — حدس بزن کجا می‌زند';
      color = const Color(0xFF38BDF8);
    }

    return AnimatedSwitcher(
      duration: const Duration(milliseconds: 220),
      child: Padding(
        key: ValueKey(text),
        padding: const EdgeInsets.symmetric(horizontal: Gaps.md, vertical: 4),
        child: Text(
          text,
          textAlign: TextAlign.center,
          style: TextStyle(
              fontSize: 15, fontWeight: FontWeight.w800, color: color),
        ),
      ),
    );
  }
}
