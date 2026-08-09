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
//      می‌کند — نوار قدرت بالا و پایین می‌رود و روی آن یک **پنجرهٔ
//      طلایی** هست: رها کردن داخل آن پنجره «ضربهٔ تمیز» است.
//   ۲. دروازه‌بان ناحیهٔ شیرجه را می‌زند و منتظر می‌ماند.
//   ۳. وقتی هر دو انتخاب کردند، سرور نتیجه را می‌گوید و **بعد** انیمیشن
//      اجرا می‌شود: توپ روی یک منحنی پرتابه با چرخش حرکت می‌کند،
//      دروازه‌بان شیرجه می‌رود، و **تور با فیزیک واقعی موج برمی‌دارد**.
//
// انیمیشن همیشه بعد از جواب سرور است، هرگز قبلش. اگر برعکس بود، کاربر
// نتیجه را یک لحظه زودتر می‌دید و می‌شد با پروکسی تقلب کرد — همان
// اصلی که در گردونهٔ شانس هم رعایت شده.
//
// ═══════════════════════════════════════════════════════════════════════════
// آنچه در این بازنگری عوض شد و چرا
// ═══════════════════════════════════════════════════════════════════════════
//
// نقد مالک، سه بخش:
//
// ۱. «کاربر گل زد اصلا بفهمه گل زده — هیچ اتفاقی توی تور دروازه الان
//    نمیوفته»
//    → تورِ ثابت با یک شبکهٔ جرم-فنر واقعی جایگزین شد (penalty_net.dart).
//      حالا موج دقیقاً از نقطهٔ برخورد شروع می‌شود و بازتاب می‌کند. کنارش
//      یک جشنِ گل: فلاش سبز روی دهانهٔ دروازه، پرچمِ بزرگِ «گل!»، و
//      ذرات. سه نشانهٔ هم‌زمان، چون یکی از آن‌ها در گوشیِ کوچک یا زیر
//      نور آفتاب ممکن است دیده نشود.
//
// ۲. «نگه میداره محکم تر میزنه — ایده جالبی پشتش راه انداخته نشده»
//    → «پنجرهٔ تمیز». نوار قدرت دیگر یک شیبِ ساده نیست؛ در هر ضربه یک
//      بازهٔ باریکِ تصادفی روی نوار روشن می‌شود که رها کردن داخلش، خطا
//      را به یک‌سوم و شانس مهار را به ۷۰٪ می‌رساند. جای پنجره هر ضربه
//      عوض می‌شود، پس حفظ کردنی نیست: باید نگاه کنی و به‌موقع رها کنی.
//      منطق و قضاوتش کاملاً سمت سرور است (penalty.js) — اینجا فقط
//      نمایش داده می‌شود.
//
// ۳. «همه امتیازها و اسکورها و تو بردی تو باختی باید تو دید باشه و تو
//    چشم باشه»
//    → تابلوی امتیاز بزرگ‌تر و با کنتراست بالا شد، و نتیجهٔ هر ضربه
//      به‌جای یک خط متنِ کوچکِ پایین صفحه، یک پرچمِ بزرگ وسط دروازه است.
//
// ═══════════════════════════════════════════════════════════════════════════
// چرا فیزیک دستی و نه یک پکیج
// ═══════════════════════════════════════════════════════════════════════════
//
// یک موتور فیزیک کامل (مثل Forge2D) چند صد کیلوبایت به APK اضافه می‌کند
// برای چیزی که با یک منحنی درجه دو و یک شبکهٔ فنرِ ۱۳۵ گره‌ای قابل کشیدن
// است. بعد از ممیزی حافظه که نشان داد هر مگابایت چقدر گران است، این
// معامله نمی‌ارزید. جزئیاتِ بودجهٔ اجرا در سرصفحهٔ penalty_net.dart.
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';

import '../../../api_client.dart';
import '../../../core/assets.dart';
import '../../../theme/tokens.dart';
import 'game_audio.dart';
import 'game_scaffold.dart';
import 'game_session.dart';
import 'penalty_net.dart';

const _accent = Color(0xFF38BDF8);
const _goalGreen = Color(0xFF84CC16);
const _saveBlue = Color(0xFF38BDF8);
const _missRed = Color(0xFFEF4444);
const _gold = Color(0xFFFFD36B);

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
      symbols: const {'X': 'assets/pass/football_icon.webp', 'O': 'assets/pass/glove_icon.webp'},
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
  /// انیمیشن پرواز توپ + شیرجهٔ دروازه‌بان + جشن.
  ///
  /// از ۱۱۵۰ به ۱۹۰۰ رفت: ۶۲٪ اولش پروازِ توپ است و بقیه به جشن و
  /// موجِ تور می‌رسد. با ۱۱۵۰، لحظهٔ گل تمام می‌شد پیش از آنکه تور
  /// درست موج بردارد — یعنی همان چیزی که مالک گفت «هیچ اتفاقی نمی‌افتد».
  late final AnimationController _kick;

  /// نوسان نوار قدرت. کاربر نگه می‌دارد، این بالا و پایین می‌رود، رها
  /// می‌کند و همان لحظه قدرت قفل می‌شود.
  late final AnimationController _power;

  /// شبیه‌سازِ تور. **یک نمونه برای کل عمر صفحه** — هیچ تخصیصی در حلقهٔ
  /// فریم انجام نمی‌دهد و وقتی آرام گرفت خودش می‌خوابد.
  final NetSim _net = NetSim();

  /// تیکرِ فیزیکِ تور. جدا از `_kick` است چون عمرِ متفاوتی دارد: موج تور
  /// ممکن است بعد از پایان انیمیشنِ ضربه هنوز ادامه داشته باشد، و
  /// برعکس، در ضربهٔ بیرون‌رفته اصلاً روشن نمی‌شود.
  ///
  /// چرا Ticker و نه AnimationController: کنترلر یک بازهٔ زمانیِ مشخص
  /// می‌خواهد، ولی این شبیه‌سازی وقتی تمام می‌شود که انرژی تمام شود —
  /// نه در یک لحظهٔ ازپیش‌معلوم.
  late final Ticker _netTicker;
  Duration _lastTick = Duration.zero;

  /// آیا توپ در این ضربه به تور خورده (تا فقط یک بار تکانه بزنیم).
  bool _netHit = false;

  int? _pickedZone;
  bool _charging = false;
  double _lockedPower = 0.7;

  /// آخرین ضربه‌ای که انیمیشنش پخش شد — تا یک ضربه دوبار پخش نشود.
  int _playedKicks = -1;

  @override
  void initState() {
    super.initState();
    // در initState ساخته می‌شوند، نه `late final` روی فیلد — وگرنه اگر
    // ویجت پیش از اولین build حذف شود، dispose() اولین جایی است که
    // createTicker را روی عنصرِ غیرفعال صدا می‌زند و فلاتر پرتاب می‌کند:
    // «Looking up a deactivated widget's ancestor is unsafe».
    _kick = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1900),
    );
    _power = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 900),
    );
    _netTicker = createTicker(_onNetTick);
    _kick.addListener(_onKickFrame);
    widget.session.addListener(_onState);
  }

  @override
  void dispose() {
    widget.session.removeListener(_onState);
    _kick.removeListener(_onKickFrame);
    _netTicker.dispose();
    _kick.dispose();
    _power.dispose();
    super.dispose();
  }

  /// گام فیزیکِ تور.
  ///
  /// وقتی شبیه‌ساز می‌خوابد، تیکر **متوقف می‌شود** — نه اینکه بی‌کار
  /// بچرخد. یک Ticker روشن یعنی درخواستِ فریم در هر ۱۶ میلی‌ثانیه حتی
  /// اگر هیچ چیز عوض نشود، و دقیقاً همان چیزی است که باتری را در
  /// صفحه‌های بازی می‌خورد.
  void _onNetTick(Duration elapsed) {
    final dt = (elapsed - _lastTick).inMicroseconds / 1e6;
    _lastTick = elapsed;
    if (dt <= 0) return;
    final changed = _net.step(dt);
    if (_net.settled) {
      _netTicker.stop();
      _lastTick = Duration.zero;
    }
    if (changed && mounted) setState(() {});
  }

  /// در لحظهٔ برخورد توپ با تور، تکانه را به شبیه‌ساز می‌دهد.
  ///
  /// چرا اینجا و نه در `_onState`: نتیجه از سرور خیلی زودتر می‌رسد.
  /// تور باید دقیقاً همان فریمی موج بردارد که توپ به آن می‌رسد، وگرنه
  /// چشم ناهماهنگی را می‌گیرد و کل جلوه فرو می‌ریزد.
  void _onKickFrame() {
    if (_netHit || !_kick.isAnimating) return;
    // ۰.۶۲ = لحظه‌ای که توپ به دهانهٔ دروازه می‌رسد (همان عددی که نقاش
    // برای پایانِ مسیرِ پرتابه استفاده می‌کند).
    if (_kick.value < 0.62) return;
    final last = widget.session.state['lastKick'];
    if (last is! Map) return;
    final outcome = '${last['outcome']}';
    // فقط گل به تور می‌خورد. مهار یعنی توپ در دستکش مانده، و بیرون یعنی
    // اصلاً وارد چارچوب نشده.
    if (outcome != 'goal') {
      _netHit = true;
      return;
    }
    final z = NumberParser.toInt(last['shotZone']);
    final power = (last['power'] as num?)?.toDouble() ?? 0.7;
    // مختصات نسبیِ ناحیه روی دهانهٔ دروازه (۰..۱).
    final u = ((z % 3) + 0.5) / 3;
    final v = ((z ~/ 3) + 0.5) / 3;
    _net.hit(u, v, power);
    _netHit = true;
    if (!_netTicker.isActive) {
      _lastTick = Duration.zero;
      _netTicker.start();
    }
  }

  /// وقتی سرور نتیجهٔ ضربه را فرستاد، انیمیشن را اجرا کن.
  void _onState() {
    final hist = (widget.session.state['history'] as List?) ?? const [];
    if (hist.length != _playedKicks && hist.isNotEmpty) {
      _playedKicks = hist.length;
      _pickedZone = null;
      _charging = false;
      _netHit = false;
      _power.stop();
      _kick.forward(from: 0);
      final last = widget.session.state['lastKick'];
      if (last is Map) {
        final o = '${last['outcome']}';
        GameAudio.instance.play(o == 'goal' ? Sfx.win : Sfx.move);
      }
    } else if (hist.isEmpty && _playedKicks != -1) {
      _playedKicks = -1;
      _net.reset();
    }
  }

  bool get _amShooter {
    final role = widget.session.state['role'];
    if (role is String) return role == 'shooter';
    return widget.session.state['shooter'] == widget.session.mySymbol;
  }

  bool get _alreadyChose => widget.session.state['iChose'] == true;

  /// پنجرهٔ «ضربهٔ تمیز» که سرور برای این ضربه فرستاده.
  ///
  /// اگر سرور نفرستاده بود (نسخهٔ قدیمی‌ترِ بک‌اند)، `null` برمی‌گردد و
  /// نوار دقیقاً مثل قبل کار می‌کند — بدون خطا، فقط بدون پنجره.
  ({double min, double max})? get _sweet {
    final s = widget.session.state['sweet'];
    if (s is! Map) return null;
    final lo = (s['min'] as num?)?.toDouble();
    final hi = (s['max'] as num?)?.toDouble();
    if (lo == null || hi == null || hi <= lo) return null;
    return (min: lo, max: hi);
  }

  void _startCharge(int zone) {
    if (widget.session.phase != GamePhase.playing || _alreadyChose || _kick.isAnimating) return;
    setState(() {
      _pickedZone = zone;
      _charging = true;
    });
    _power.repeat(reverse: true);
  }

  void _release() {
    if (widget.session.phase != GamePhase.playing || !_charging || _pickedZone == null) return;
    // مقدار نوسان در لحظهٔ رها کردن = قدرت. بازهٔ ۰.۳۵ تا ۱ چون شوت
    // خیلی ضعیف هیچ‌وقت انتخاب منطقی نیست و فقط کاربر را سرخورده می‌کند.
    final p = 0.35 + _power.value * 0.65;
    _power.stop();
    setState(() {
      _charging = false;
      _lockedPower = p;
    });
    // بازخوردِ فوریِ «تمیز زدی»: کاربر نباید تا رسیدن توپ منتظر بماند
    // تا بفهمد زمان‌بندی‌اش درست بود. پنجره سمت سرور هم دوباره بررسی
    // می‌شود؛ این فقط نمایش است.
    final sw = _sweet;
    if (sw != null && p >= sw.min && p <= sw.max) {
      GameAudio.instance.play(Sfx.matchFound, volume: 0.7);
    }
    widget.session.moveObject({'zone': _pickedZone, 'power': p});
  }

  void _dive(int zone) {
    if (widget.session.phase != GamePhase.playing || _alreadyChose || _kick.isAnimating) return;
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

    // پرچمِ نتیجه از ۵۵٪ انیمیشن (کمی پیش از رسیدنِ توپ) تا آخر می‌ماند.
    // شروعِ زودتر باعث می‌شد نتیجه پیش از دیدنِ برخورد لو برود.
    final showOutcome =
        lastKick is Map && _kick.isAnimating && _kick.value > 0.60;

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
        Center(
          // ── ارتفاع‌محور (نه فقط عرض‌محور): رفعِ «برای بازی باید اسکرول کنم» ──
          // زمینِ پنالتی (بخشِ قابل لمس) قبلاً فقط با `AspectRatio(1.30)`
          // و `maxWidth:430` اندازه می‌گرفت. یعنی ارتفاعش تابعِ عرضِ صفحه
          // بود: هرچه گوشی پهن‌تر، زمین بلندتر — بدونِ هیچ اتصالی به ارتفاعِ
          // واقعیِ در دسترس. وقتی ارتفاعِ زمین + نوار بالا + تابلوی امتیاز +
          // راهنمای پایین از ارتفاعِ صفحهٔ موبایل بیشتر می‌شد، زمین به زیرِ
          // خطِ پیمایش می‌افتاد و کاربر مجبور بود برای ضربه زدن اسکرول کند.
          //
          // حالا زمین روی یک بومِ ۱.۳۰ سوار است و کلِ آن داخل یک
          // `FittedBox(fit: contain)` با یک `maxHeight` واقعی قرار دارد.
          // FittedBox زمین را **مقیاس می‌کند** تا هم در عرض و هم در ارتفاعِ
          // در دسترس جا شود و نسبت ۱.۳۰ دست‌نخورده بماند. روی گوشیِ کوچک
          // زمین جمع‌وجورتر می‌شود و کلِ صفحه (نوار بالا + زمین + تابلوی
          // امتیاز + راهنما) در یک نگاه جا می‌شود — بدون اسکرول.
          child: LayoutBuilder(builder: (context, c) {
            final media = MediaQuery.sizeOf(context);
            // کلِ قدِ صفحه، منهای آنچه بالای/پایینِ زمین مصرف می‌شود:
            // هدر اسکافولد (~۷۲)، نوار رقابت (~۵۶)، بنر نوبت (~۴۰)،
            // تابلوی امتیاز (~۹۶) و راهنمای پایین (~۶۴). عددِ محافظه‌کارانه
            // برای فضای ناامنِ iOS/اندروید هم در نظر گرفته شده.
            final chrome = media.height * 0.40;
            final avail = (media.height - chrome).clamp(180.0, 430.0);
            final pitchH = (c.maxWidth / 1.30).clamp(0.0, avail);
            return ConstrainedBox(
              constraints: BoxConstraints(maxWidth: 430, maxHeight: avail),
              child: FittedBox(
                fit: BoxFit.contain,
                child: SizedBox(
                  width: pitchH * 1.30,
                  height: pitchH,
                  child: AnimatedBuilder(
                    animation: Listenable.merge([_kick, _power]),
                    builder: (context, _) => Stack(
                      children: [
                        Positioned.fill(
                          child: GestureDetector(
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
                                sweet: _sweet,
                                net: _net,
                                netEpoch: _net.peakDepth,
                                obstacleZone: (lastKick is Map && lastKick['obstacleZone'] != null)
                                    ? NumberParser.toInt(lastKick['obstacleZone'])
                                    : (st['obstacleZone'] as int?),
                              ),
                              child: _ZoneGrid(
                                enabled: widget.session.phase == GamePhase.playing && !_alreadyChose && !_kick.isAnimating,
                                amShooter: _amShooter,
                                picked: _pickedZone,
                                obstacleZone: st['obstacleZone'] as int?,
                                onDown: _amShooter ? _startCharge : null,
                                onTap: _amShooter ? null : _dive,
                                onUp: _amShooter ? _release : null,
                              ),
                            ),
                          ),
                        ),
                        // ── پرچمِ نتیجه، وسطِ دروازه ──
                        //
                        // درخواست مالک: «هر نوشته‌ای که میاد باید تو دید باشه
                        // و تو چشم باشه». متنِ ریزِ پایین صفحه دیده نمی‌شد.
                        if (showOutcome)
                          Positioned.fill(
                            child: IgnorePointer(
                              child: _OutcomeFlag(
                                outcome: '${lastKick['outcome']}',
                                clean: lastKick['clean'] == true,
                                mine: lastKick['shooter'] == me,
                                t: ((_kick.value - 0.60) / 0.40)
                                    .clamp(0.0, 1.0),
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
                ),
              ),
            );
          }),
        ),
        Gaps.vSm,
        _Prompt(
          amShooter: _amShooter,
          chose: _alreadyChose,
          waiting: waiting,
          charging: _charging,
          animating: _kick.isAnimating,
          hasSweet: _sweet != null,
        ),
      ],
    );
  }
}

// ── تابلوی امتیاز ─────────────────────────────────────────────────────────
//
// بزرگ‌تر و پرکنتراست‌تر از نسخهٔ قبل. مالک: «همه امتیاز هاش و اسکور هاش
// ... باید تو دید باشه و تو چشم باشه». تابلوی قبلی ۲۲ پیکسل روی یک
// پس‌زمینهٔ کم‌رنگ بود؛ روی گوشی در نور روز خوانده نمی‌شد.
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
    final leading = myScore > foeScore;
    final trailing = myScore < foeScore;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: Gaps.md, vertical: Gaps.xs),
      decoration: BoxDecoration(
        borderRadius: Corners.rLg,
        gradient: LinearGradient(
          colors: [
            Colors.black.withValues(alpha: 0.35),
            _accent.withValues(alpha: 0.12),
          ],
        ),
        border: Border.all(color: _accent.withValues(alpha: 0.35)),
      ),
      child: Column(
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              _SideLabel(text: 'تو', highlight: leading),
              Gaps.hSm,
              // عددها با فاصلهٔ ثابت (tabular) تا موقع عوض شدن ۰ به ۱
              // کل تابلو نلرزد.
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 18, vertical: 5),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(14),
                  color: Colors.black.withValues(alpha: 0.45),
                  border: Border.all(color: _accent.withValues(alpha: 0.65), width: 1.5),
                ),
                child: Text(
                  '${faNum(myScore)} - ${faNum(foeScore)}',
                  style: const TextStyle(
                    fontSize: 30,
                    fontWeight: FontWeight.w900,
                    height: 1.15,
                    color: Colors.white,
                    fontFeatures: [FontFeature.tabularFigures()],
                    shadows: [
                      Shadow(color: Colors.black87, blurRadius: 6),
                    ],
                  ),
                ),
              ),
              Gaps.hSm,
              _SideLabel(text: 'حریف', highlight: trailing),
            ],
          ),
          if (suddenDeath)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 10, vertical: 2),
                decoration: BoxDecoration(
                  borderRadius: Corners.rPill,
                  color: _gold.withValues(alpha: 0.22),
                  border: Border.all(color: _gold),
                ),
                child: const Text('مرگ ناگهانی',
                    style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w900,
                        color: _gold)),
              ),
            ),
          Gaps.vXs,
          // ردیف توپ‌ها: گل سبز، مهار/بیرون خاکستری. یک نگاه کافی است.
          //
          // حلقهٔ طلایی دور یک نشان یعنی آن ضربه «تمیز» بوده — بازخوردِ
          // ماندگارِ زمان‌بندیِ خوب، نه فقط یک جلوهٔ لحظه‌ای.
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              for (final sym in [me, me == 'X' ? 'O' : 'X'])
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 7),
                  child: Row(
                    children: [
                      for (final h in history
                          .whereType<Map>()
                          .where((h) => h['shooter'] == sym))
                        Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 2),
                          child: Container(
                            width: 14,
                            height: 14,
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              color: h['outcome'] == 'goal'
                                  ? _goalGreen
                                  : Colors.white24,
                              border: Border.all(
                                color: h['clean'] == true
                                    ? _gold
                                    : Colors.white.withValues(alpha: 0.30),
                                width: h['clean'] == true ? 2 : 1,
                              ),
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

class _SideLabel extends StatelessWidget {
  const _SideLabel({required this.text, required this.highlight});
  final String text;
  final bool highlight;

  @override
  Widget build(BuildContext context) {
    return Text(
      text,
      style: TextStyle(
        fontSize: 15,
        fontWeight: FontWeight.w900,
        color: highlight ? _goalGreen : Colors.white70,
      ),
    );
  }
}

// ── پرچمِ نتیجهٔ ضربه ──────────────────────────────────────────────────────
//
// چرا یک ویجت جدا و نه متن پایین صفحه: مالک گفت نوشته‌ها «تو چشم» نیستند.
// این پرچم وسطِ همان جایی می‌نشیند که چشم کاربر همان لحظه آنجاست (دهانهٔ
// دروازه) و با یک جهشِ کوچک وارد می‌شود تا حرکت، نگاه را قفل کند.
class _OutcomeFlag extends StatelessWidget {
  const _OutcomeFlag({
    required this.outcome,
    required this.clean,
    required this.mine,
    required this.t,
  });

  final String outcome;
  final bool clean, mine;
  final double t;

  @override
  Widget build(BuildContext context) {
    late final String text;
    late final Color color;
    switch (outcome) {
      case 'goal':
        text = mine ? 'گل زدی!' : 'گل خوردی';
        color = mine ? _goalGreen : _missRed;
        break;
      case 'save':
        text = mine ? 'مهار شد' : 'مهارش کردی!';
        color = mine ? _missRed : _saveBlue;
        break;
      default:
        text = mine ? 'بیرون رفت' : 'بیرون زد';
        color = mine ? _missRed : _goalGreen;
    }

    // ورود: جهش از ۰.۶ تا ۱.۰۸ و برگشت به ۱. خروج: محو شدن در ۲۰٪ آخر.
    final inT = Curves.easeOutBack.transform(math.min(1, t / 0.28));
    final scale = 0.6 + inT * 0.4;
    final opacity = t > 0.82 ? (1 - (t - 0.82) / 0.18).clamp(0.0, 1.0) : 1.0;

    return Center(
      child: Opacity(
        opacity: opacity,
        child: Transform.scale(
          scale: scale,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                padding: const EdgeInsets.symmetric(
                    horizontal: 22, vertical: 10),
                decoration: BoxDecoration(
                  borderRadius: Corners.rPill,
                  color: Colors.black.withValues(alpha: 0.72),
                  border: Border.all(color: color, width: 2.5),
                  boxShadow: [
                    BoxShadow(
                        color: color.withValues(alpha: 0.55), blurRadius: 22),
                  ],
                ),
                child: Text(
                  text,
                  style: TextStyle(
                    fontSize: 26,
                    fontWeight: FontWeight.w900,
                    color: color,
                    height: 1.2,
                    shadows: const [
                      Shadow(color: Colors.black, blurRadius: 8),
                    ],
                  ),
                ),
              ),
              if (clean) ...[
                const SizedBox(height: 6),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 12, vertical: 3),
                  decoration: BoxDecoration(
                    borderRadius: Corners.rPill,
                    color: _gold.withValues(alpha: 0.92),
                  ),
                  child: const Text('ضربهٔ تمیز',
                      style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w900,
                          color: Color(0xFF1A1206))),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

// ── شبکهٔ نواحی قابل لمس ───────────────────────────────────────────────────
class _ZoneGrid extends StatelessWidget {
  const _ZoneGrid({
    required this.enabled,
    required this.amShooter,
    required this.picked,
    this.obstacleZone,
    this.onDown,
    this.onTap,
    this.onUp,
  });

  final bool enabled, amShooter;
  final int? picked;
  final int? obstacleZone;
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
                                isObstacle: obstacleZone == r * 3 + col,
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
    this.isObstacle = false,
    this.onDown,
    this.onTap,
    this.onUp,
  });

  final int zone;
  final bool enabled, selected, amShooter, isObstacle;
  final void Function(int)? onDown;
  final void Function(int)? onTap;
  final VoidCallback? onUp;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTapDown: enabled && amShooter ? (_) => onDown?.call(zone) : null,
      onTapUp: enabled && amShooter ? (_) => onUp?.call() : null,
      onTapCancel: enabled && amShooter ? () => onUp?.call() : null,
      onTap: enabled && !amShooter ? () => onTap?.call(zone) : null,
      child: Container(
        margin: const EdgeInsets.all(1.5),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(6),
          color: selected
              ? _accent.withValues(alpha: 0.30)
              : isObstacle
                  ? const Color(0xFFFF9F43).withValues(alpha: 0.22)
                  : Colors.white.withValues(alpha: enabled ? 0.045 : 0.015),
          border: Border.all(
            color: selected
                ? _accent
                : isObstacle
                    ? const Color(0xFFFF9F43).withValues(alpha: 0.65)
                    : Colors.white.withValues(alpha: enabled ? 0.16 : 0.06),
            width: (selected || isObstacle) ? 2 : 1,
          ),
        ),
        child: isObstacle
            ? const Center(
                child: Icon(Icons.shield_rounded, size: 16, color: Color(0xFFFF9F43)),
              )
            : null,
      ),
    );
  }
}

// ── نقاشی زمین، دروازه، تور، توپ و دروازه‌بان ─────────────────────────────
class _PitchPainter extends CustomPainter {
  _PitchPainter({
    required this.kick,
    required this.animating,
    required this.lastKick,
    required this.hoverZone,
    required this.amShooter,
    required this.power,
    required this.charging,
    required this.sweet,
    required this.net,
    required this.netEpoch,
    this.obstacleZone,
  });

  final double kick;
  final bool animating, amShooter, charging;
  final Map<String, dynamic>? lastKick;
  final int? hoverZone;
  final double power;
  final ({double min, double max})? sweet;
  final NetSim net;
  final int? obstacleZone;

  /// یک عددِ نماینده از حالتِ تور.
  ///
  /// `shouldRepaint` نمی‌تواند ۱۳۵ گره را مقایسه کند (گران‌تر از خودِ
  /// نقاشی می‌شد). بیشترین عمق یک خلاصهٔ ارزان است که هر وقت تور تکان
  /// بخورد عوض می‌شود.
  final double netEpoch;

  // Paintهای مشترک، یک بار ساخته می‌شوند.
  //
  // چرا فیلدِ استاتیک: `paint()` در هر فریم صدا زده می‌شود و ساختنِ
  // ۱۰ شیء Paint در هر فریم یعنی ۶۰۰ تخصیص در ثانیه فقط برای زباله‌روب.
  static final _grass = Paint()..color = const Color(0xFF0E3B1E);
  static final _stripe = Paint()..color = Colors.white.withValues(alpha: 0.025);
  static final _line = Paint()
    ..color = Colors.white.withValues(alpha: 0.22)
    ..style = PaintingStyle.stroke
    ..strokeWidth = 2;
  static final _post = Paint()
    ..color = Colors.white
    ..style = PaintingStyle.stroke
    ..strokeWidth = 5
    ..strokeCap = StrokeCap.round;
  static final _netPaint = Paint()
    ..color = Colors.white.withValues(alpha: 0.15)
    ..style = PaintingStyle.stroke
    ..strokeWidth = 1;
  static final _netHot = Paint()
    ..color = Colors.white.withValues(alpha: 0.55)
    ..style = PaintingStyle.stroke
    ..strokeWidth = 1.6;

  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width, h = size.height;

    // ── چمن با نوارهای روشن/تیره، برای عمق ──
    canvas.drawRect(Offset.zero & size, _grass);
    for (var i = 0; i < 8; i++) {
      if (i.isEven) {
        final top = h * (0.52 + i * 0.06);
        canvas.drawRect(Rect.fromLTWH(0, top, w, h * 0.06), _stripe);
      }
    }

    // ── محوطهٔ جریمه ──
    canvas.drawRect(
        Rect.fromLTWH(w * 0.10, h * 0.03, w * 0.80, h * 0.62), _line);

    // ── دروازه ──
    final gw = w * 0.78, gh = h * 0.46;
    final gl = (w - gw) / 2, gt = h * 0.06;

    final lk = lastKick;
    final outcome = lk == null ? null : '${lk['outcome']}';
    final shotZone = lk == null ? null : NumberParser.toInt(lk['shotZone']);
    final diveZone = lk == null ? null : NumberParser.toInt(lk['diveZone']);
    final isGoal = animating && outcome == 'goal';

    // ── فلاشِ سبزِ گل، پشتِ تور ──
    //
    // اولین چیزی که چشم می‌گیرد. قبل از هر متنی، دهانهٔ دروازه یک لحظه
    // سبز می‌شود — همان کاری که تابلوهای ورزشگاه می‌کنند.
    if (isGoal && kick > 0.60) {
      final ft = ((kick - 0.60) / 0.40).clamp(0.0, 1.0);
      // اوج در ۱۵٪ اول و بعد افول — یک تپش، نه یک روشناییِ ثابت.
      final a = ft < 0.15 ? ft / 0.15 : (1 - (ft - 0.15) / 0.85) * 0.75;
      if (a > 0) {
        canvas.drawRect(
          Rect.fromLTWH(gl, gt, gw, gh),
          Paint()
            ..shader = RadialGradient(
              colors: [
                _goalGreen.withValues(alpha: 0.42 * a),
                _goalGreen.withValues(alpha: 0.06 * a),
                Colors.transparent,
              ],
              stops: const [0, 0.55, 1],
            ).createShader(Rect.fromLTWH(gl, gt, gw, gh)),
        );
      }
    }

    _drawNet(canvas, gl, gt, gw, gh);

    // تیرک‌ها — بعد از تور کشیده می‌شوند تا تور پشتشان بماند.
    canvas.drawLine(Offset(gl, gt + gh), Offset(gl, gt), _post);
    canvas.drawLine(Offset(gl + gw, gt + gh), Offset(gl + gw, gt), _post);
    canvas.drawLine(Offset(gl, gt), Offset(gl + gw, gt), _post);

    /// مرکز یک ناحیه روی دهانهٔ دروازه.
    Offset zoneCenter(int z) {
      final c = z % 3, r = z ~/ 3;
      return Offset(gl + gw * (c + 0.5) / 3, gt + gh * (r + 0.5) / 3);
    }

    // ── مانع / مدافع ──
    final obst = (lk != null && lk['obstacleZone'] != null)
        ? NumberParser.toInt(lk['obstacleZone'])
        : obstacleZone;
    if (obst != null && obst >= 0 && obst < 9) {
      _drawObstacle(canvas, zoneCenter(obst), gw / 3.0, gh / 3.0);
    }

    // ── نقطهٔ پنالتی ──
    final spot = Offset(w / 2, h * 0.88);
    canvas.drawCircle(
        spot, 3.5, Paint()..color = Colors.white.withValues(alpha: 0.55));

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
    final keeperInFront = animating && outcome == 'save' && kick > 0.38;
    if (!keeperInFront) _drawKeeper(canvas, keeperPos, keeperTilt, gh * 0.30);

    // ── توپ ──
    Offset ball = spot;
    double ballR = math.min(w, h) * 0.033;
    var drawBall = true;
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

      // گل: توپ داخل تور فرو می‌رود و همان‌جا با تور پایین می‌افتد.
      //
      // قبلاً توپ سرِ ناحیه می‌ایستاد و یخ می‌زد — همان «هیچ اتفاقی
      // نمی‌افتد»ی که مالک دید. حالا توپ در جیبِ تور می‌نشیند و با
      // آن پایین می‌آید.
      if (outcome == 'goal' && kick > 0.62) {
        final after = ((kick - 0.62) / 0.38).clamp(0.0, 1.0);
        final settle = Curves.easeOutCubic.transform(after);
        ball = Offset(
          ball.dx,
          ball.dy + gh * 0.30 * settle,
        );
        ballR *= 1 - 0.15 * settle;
      }
      // مهار: توپ در ناحیهٔ دروازه‌بان می‌ایستد و برمی‌گردد.
      if (outcome == 'save' && kick > 0.62) {
        final back = (kick - 0.62) / 0.38;
        ball = Offset.lerp(ball, Offset(spot.dx, spot.dy - h * 0.10), back)!;
      }
      // بیرون: از کنار تیرک رد می‌شود و از قاب خارج می‌شود.
      if (outcome == 'miss') {
        final off = (shotZone % 3 == 0) ? -1.0 : (shotZone % 3 == 2 ? 1.0 : 0.0);
        final up = shotZone ~/ 3 == 0 ? -1.0 : 0.0;
        final over = math.max(0.0, (kick - 0.62) / 0.38);
        ball = Offset(ball.dx + off * gw * (0.16 * e + 0.55 * over),
            ball.dy + up * gh * (0.28 * e + 0.9 * over));
        if (over > 0.85) drawBall = false;
      }
    }
    if (drawBall) _drawBall(canvas, ball, ballR, animating ? kick * 14 : 0);
    if (keeperInFront) _drawKeeper(canvas, keeperPos, keeperTilt, gh * 0.30);

    // ── ذراتِ جشنِ گل ──
    if (isGoal && kick > 0.62) {
      _drawConfetti(canvas, zoneCenter(shotZone!),
          ((kick - 0.62) / 0.38).clamp(0.0, 1.0), math.min(w, h));
    }

    // ── نوار قدرت ──
    if (charging) _drawPowerBar(canvas, w, h);
  }

  void _drawObstacle(Canvas canvas, Offset center, double w, double h) {
    final rect = Rect.fromCenter(center: center, width: w * 0.76, height: h * 0.76);
    // Glowing defensive aura
    canvas.drawCircle(
      center,
      w * 0.42,
      Paint()
        ..shader = RadialGradient(
          colors: [
            const Color(0xFFFF9F43).withValues(alpha: 0.55),
            const Color(0xFFFF9F43).withValues(alpha: 0.12),
            Colors.transparent,
          ],
        ).createShader(Rect.fromCircle(center: center, radius: w * 0.42)),
    );
    // Barrier shield
    final rrect = RRect.fromRectAndRadius(rect, const Radius.circular(8));
    canvas.drawRRect(
      rrect,
      Paint()..color = const Color(0xFFFF9F43).withValues(alpha: 0.32),
    );
    canvas.drawRRect(
      rrect,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2.2
        ..color = const Color(0xFFFF9F43),
    );
    final p = Paint()
      ..color = const Color(0xFFFFEAA7)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2.4
      ..strokeCap = StrokeCap.round;
    final r = w * 0.18;
    canvas.drawLine(Offset(center.dx - r, center.dy), Offset(center.dx + r, center.dy), p);
    canvas.drawLine(Offset(center.dx, center.dy - r), Offset(center.dx, center.dy + r), p);
    canvas.drawCircle(center, r * 0.4, Paint()..color = const Color(0xFFFF9F43));
  }

  /// تورِ زنده.
  ///
  /// همهٔ خطوط در **دو** مسیر جمع می‌شوند (عادی و «داغ») و با دو
  /// `drawPath` کشیده می‌شوند. کشیدنِ ۳۵۰ خط جدا با `drawLine` در هر
  /// فریم، همان چیزی است که یک صفحهٔ بازی را روی گوشیِ ضعیف به ۲۰ فریم
  /// می‌رساند.
  void _drawNet(Canvas canvas, double gl, double gt, double gw, double gh) {
    const cols = NetSim.cols, rows = NetSim.rows;
    final calm = Path();
    final hot = Path();

    double px(int c, int r) =>
        gl + gw * c / (cols - 1) + net.offX(c, r, gw);
    double py(int c, int r) =>
        gt + gh * r / (rows - 1) + net.offY(c, r, gh);

    // آستانهٔ «داغ»: بندهایی که بیشتر از این کشیده شده‌اند پررنگ‌تر
    // کشیده می‌شوند، پس ناحیهٔ برخورد خودش را نشان می‌دهد.
    //
    // عدد از اندازه‌گیری آمد، نه حدس: با ۰.۰۶ حدود ۹۲ گره از ۱۳۵ داغ
    // می‌شدند — یعنی تقریباً کلِ تور روشن می‌شد و «ناحیهٔ برخورد» دیگر
    // معنایی نداشت. با ۰.۲۵ فقط جیبِ اطراف توپ روشن می‌ماند، که همان
    // چیزی است که چشم باید ببیند.
    const hotAt = 0.25;

    // بندهای افقی
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols - 1; c++) {
        final d = math.max(net.depth(c, r).abs(), net.depth(c + 1, r).abs());
        final p = d > hotAt ? hot : calm;
        p.moveTo(px(c, r), py(c, r));
        p.lineTo(px(c + 1, r), py(c + 1, r));
      }
    }
    // بندهای عمودی
    for (var c = 0; c < cols; c++) {
      for (var r = 0; r < rows - 1; r++) {
        final d = math.max(net.depth(c, r).abs(), net.depth(c, r + 1).abs());
        final p = d > hotAt ? hot : calm;
        p.moveTo(px(c, r), py(c, r));
        p.lineTo(px(c, r + 1), py(c, r + 1));
      }
    }

    canvas.drawPath(calm, _netPaint);
    canvas.drawPath(hot, _netHot);
  }

  /// نوار قدرت با پنجرهٔ «ضربهٔ تمیز».
  ///
  /// پنجره یک نوار طلاییِ روشن روی ریل است. کاربر باید همان لحظه که
  /// نشانگر از آن رد می‌شود انگشتش را بردارد.
  void _drawPowerBar(Canvas canvas, double w, double h) {
    final barW = w * 0.075, barH = h * 0.46;
    final bx = w * 0.030, by = h * 0.28;
    final rect = Rect.fromLTWH(bx, by, barW, barH);
    final bg = RRect.fromRectAndRadius(rect, const Radius.circular(9));
    canvas.drawRRect(bg, Paint()..color = Colors.black.withValues(alpha: 0.55));

    /// تبدیل قدرت (۰.۳۵..۱) به موقعیت y روی نوار.
    double yFor(double p) {
      final f = ((p - 0.35) / 0.65).clamp(0.0, 1.0);
      return by + barH * (1 - f);
    }

    // پنجرهٔ تمیز — پیش از پرشدگی، تا زیرِ آن دیده شود.
    final sw = sweet;
    if (sw != null) {
      final top = yFor(sw.max), bottom = yFor(sw.min);
      canvas.drawRRect(
        RRect.fromRectAndRadius(
            Rect.fromLTRB(bx - 2, top, bx + barW + 2, bottom),
            const Radius.circular(6)),
        Paint()..color = _gold.withValues(alpha: 0.45),
      );
      canvas.drawRRect(
        RRect.fromRectAndRadius(
            Rect.fromLTRB(bx - 2, top, bx + barW + 2, bottom),
            const Radius.circular(6)),
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = 2
          ..color = _gold,
      );
    }

    final fillH = barH * ((power - 0.35) / 0.65).clamp(0.0, 1.0);
    final inSweet = sw != null && power >= sw.min && power <= sw.max;
    // داخل پنجره طلایی، بیرونش سبز→قرمز. یعنی رنگ خودش می‌گوید «الان».
    final col = inSweet
        ? _gold
        : Color.lerp(_goalGreen, _missRed,
            ((power - 0.5) * 2).clamp(0.0, 1.0))!;
    canvas.drawRRect(
      RRect.fromRectAndRadius(
          Rect.fromLTWH(bx, by + barH - fillH, barW, fillH),
          const Radius.circular(9)),
      Paint()..color = col.withValues(alpha: inSweet ? 0.95 : 0.80),
    );

    // نشانگرِ سطح — یک خطِ سفیدِ تیز. بدون آن، لبهٔ پرشدگی در ناحیهٔ
    // طلایی گم می‌شود.
    final y = by + barH - fillH;
    canvas.drawLine(
      Offset(bx - 3, y),
      Offset(bx + barW + 3, y),
      Paint()
        ..color = Colors.white
        ..strokeWidth = 2.5
        ..strokeCap = StrokeCap.round,
    );

    canvas.drawRRect(
        bg,
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = 2
          ..color = Colors.white.withValues(alpha: inSweet ? 0.95 : 0.5));
  }

  /// ذراتِ جشن.
  ///
  /// بدون آرایه و بدون حالت: موقعیت هر ذره تابعی از اندیس و زمان است،
  /// پس هیچ چیزی بین فریم‌ها نگه داشته نمی‌شود و هیچ تخصیصی رخ نمی‌دهد.
  /// ۱۴ ذره — بیشتر از این روی دهانهٔ دروازه شلوغ می‌شود و خودِ تور را
  /// می‌پوشاند.
  void _drawConfetti(Canvas canvas, Offset origin, double t, double scale) {
    const n = 14;
    final fade = 1 - t;
    if (fade <= 0) return;
    final p = Paint();
    for (var i = 0; i < n; i++) {
      // زاویه‌های نامنظم ولی قطعی: ضریب اول عدد اول است تا ذرات دسته
      // نشوند.
      final a = (i * 2.39996) % (math.pi * 2);
      final speed = 0.45 + ((i * 37) % 100) / 100 * 0.75;
      final d = t * scale * 0.42 * speed;
      // جاذبه روی ذرات، تا سقوط کنند نه اینکه صاف پرواز کنند.
      final gy = t * t * scale * 0.30;
      final pos = Offset(
        origin.dx + math.cos(a) * d,
        origin.dy + math.sin(a) * d * 0.7 + gy,
      );
      p.color = (i.isEven ? _goalGreen : Colors.white)
          .withValues(alpha: fade * 0.85);
      final r = scale * 0.011 * (0.6 + (i % 3) * 0.25) * fade;
      canvas.drawCircle(pos, r, p);
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
      old.sweet != sweet ||
      old.netEpoch != netEpoch ||
      old.lastKick != lastKick;
}

// ── راهنمای پایین صفحه ────────────────────────────────────────────────────
//
// نتیجهٔ ضربه از اینجا برداشته شد و به `_OutcomeFlag` وسطِ دروازه رفت.
// اینجا فقط راهنمای «حالا چه کار کنم» می‌ماند — دو نقش متفاوت که قبلاً
// در یک خط متن قاطی شده بودند.
class _Prompt extends StatelessWidget {
  const _Prompt({
    required this.amShooter,
    required this.chose,
    required this.waiting,
    required this.charging,
    required this.animating,
    required this.hasSweet,
  });

  final bool amShooter, chose, waiting, charging, animating, hasSweet;

  @override
  Widget build(BuildContext context) {
    String text;
    Color color = Colors.white70;

    if (animating) {
      text = '...';
    } else if (charging) {
      text = hasSweet
          ? 'داخل نوار طلایی رها کن — ضربهٔ تمیز!'
          : 'رها کن تا شوت بزنی — هرچه بالاتر، محکم‌تر';
      color = _gold;
    } else if (chose || waiting) {
      text = 'منتظر حریف...';
    } else if (amShooter) {
      text = 'تو می‌زنی — انگشتت را روی یک گوشه نگه دار';
      color = _gold;
    } else {
      text = 'تو دروازه‌بانی — حدس بزن کجا می‌زند';
      color = _saveBlue;
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
              fontSize: 16, fontWeight: FontWeight.w900, color: color),
        ),
      ),
    );
  }
}
