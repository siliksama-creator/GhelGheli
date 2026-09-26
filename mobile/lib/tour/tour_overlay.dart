// ══════════════════════════════════════════════════════════════════════════
// آموزشِ صوتیِ قلقلی — لایهٔ تور (اندروید)
// ══════════════════════════════════════════════════════════════════════════
// همان تجربهٔ وب، این بار روی اپ: صدا پخش می‌شود، انگشت روی همان بخش
// تاچ می‌کند، بقیهٔ صفحه تار می‌شود و کارتِ متن جای خودش را عوض می‌کند تا
// روی بخشِ درحالِ‌توضیح نیفتد.
//
// ── سه تصمیم که از وب به این‌جا آمد ────────────────────────────────────
//
// ۱. **تور کلیک نمی‌کند.** انگشت نمایشی است و لایهٔ تور همهٔ لمس‌ها را
//    می‌گیرد؛ اگر روی هدف کلیک می‌کرد، کاربر وسطِ آموزش وارد فروشگاه یا
//    بازی می‌شد و تور نصفه می‌مانْد.
//
// ۲. **مسیرِ ورود نشان داده می‌شود.** هر بخش سه مرحله دارد: (الف) انگشت
//    روی «درِ ورودی» (تبِ نوار پایین) می‌نشیند و تاچ می‌کند، (ب) همان
//    مسیری که کاربر می‌رفت طی می‌شود، (ج) انگشت به سمتِ هدف سفر می‌کند،
//    هاله آن‌جا می‌نشیند و **بعد** صدا شروع می‌شود — پس کلِ روایت صرفِ
//    همان بخشِ روشن می‌شود.
//
// ۳. **هر چیز داخلِ قابِ اپ.** اندازه‌ها از `MediaQuery` می‌آیند و کارت
//    قرینهِ هدف و دوخته‌شده به قاب است؛ همان باگی که در وب داشتیم
//    («از کادر خارج می‌شه») این‌جا از اول بسته است.
//
// ── افتِ محترمانه ─────────────────────────────────────────────────────
// اگر لنگرِ یک بخش روی صفحه نباشد (هنوز ساخته نشده، یا آن صفحه عوض شده)،
// تور گیر نمی‌کند: پرده می‌ماند، کارت وسطِ قاب می‌نشیند و صدا پخش می‌شود.
// هیچ‌جای این فایل `throw` ندارد — آموزش هرگز نباید اپ را متوقف کند.
import 'dart:async';
import 'dart:ui' show ImageFilter;

import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/material.dart';

import '../api_client.dart';
import 'tour_anchors.dart';
import 'tour_service.dart';

/// نقشهٔ «هر بخش از کدام در وارد می‌شود».
///
/// `nav` = نامِ مقصد در نوار پایین/شیتِ بیشتر (همان idهای وب)،
/// `sub` = زیرتبِ داخلِ صفحه (فقط «چت و بازی» زیرتب دارد).
/// `anchors` = فهرستِ لنگرها؛ اولی که روی صفحه باشد برنده است و آخری‌ها
/// جانشینِ محترمانه‌اند.
class TourPlan {
  const TourPlan(this.nav, this.anchors, {this.sub});

  final String? nav;
  final List<String> anchors;
  final String? sub;

  static const Map<String, TourPlan> steps = <String, TourPlan>{
    'home': TourPlan(null, <String>['home:hero', 'nav:home']),
    'daily': TourPlan('home', <String>['home:streak']),
    'tap': TourPlan('home', <String>['home:tapTile']),
    'wheel': TourPlan('home', <String>['home:wheelTile']),
    'cards': TourPlan('cardreg', <String>['cardreg:top', 'nav:cardreg']),
    'league': TourPlan('league', <String>['league:tabs', 'nav:league']),
    'club': TourPlan('club', <String>['club:subtabs'], sub: 'chat'),
    'invite': TourPlan('invite', <String>['invite:top', 'more:invite']),
    'duel': TourPlan('club', <String>['games:grid'], sub: 'games'),
    'cap': TourPlan('club', <String>['games:stakes', 'games:grid'], sub: 'games'),
    'missions': TourPlan('club', <String>['club:tab:growth'], sub: 'growth'),
    'pass': TourPlan('club', <String>['club:tab:pass'], sub: 'pass'),
    'coins': TourPlan('league', <String>['league:tab:vault'], sub: 'vault'),
    'shop': TourPlan('shop', <String>['shop:top', 'more:shop']),
    'wallet': TourPlan('wallet', <String>['wallet:top', 'more:wallet']),
    'profile': TourPlan('profile', <String>['profile:top', 'more:profile']),
    'support': TourPlan('support', <String>['support:top', 'more:support']),
    'outro': TourPlan('home', <String>['home:hero', 'nav:home']),
  };

  static TourPlan of(String id) =>
      steps[id] ?? const TourPlan(null, <String>[]);
}

/// طولِ نوارِ پایین — همان ۶۸ که `NavigationBar(height: 68)` می‌دهد.
const double _barHeight = 68;
const Duration _advance = Duration(milliseconds: 700);
const Duration _doorMs = Duration(milliseconds: 1500);
const Duration _enterMs = Duration(milliseconds: 1700);
const Duration _settleMs = Duration(milliseconds: 620);
const Duration _waitAnchorMs = Duration(milliseconds: 3200);

/// پخشِ صدا با همان محافظِ `game_audio.dart`: صدا هرگز چیزی را نمی‌شکند.
AudioPlayer? _safePlayer() {
  try {
    return runZonedGuarded<AudioPlayer>(
      AudioPlayer.new,
      (error, stack) => debugPrint('[tour] ساختِ پخش‌کنندهٔ صدا ناموفق: $error'),
    );
  } catch (e) {
    debugPrint('[tour] پخش‌کنندهٔ صدا ساخته نشد: $e');
    return null;
  }
}

class TourOverlay extends StatefulWidget {
  const TourOverlay({
    super.key,
    required this.api,
    required this.currentIndex,
    required this.indexFor,
    required this.goIndex,
    required this.onSubTab,
    required this.slots,
  });

  final ApiClient api;

  /// صفحهٔ فعلیِ شل (برای فهمیدنِ اینکه باید تب عوض شود یا نه).
  final int currentIndex;

  /// نامِ مقصد → شمارهٔ صفحه در شل.
  final int? Function(String name) indexFor;

  /// رفتن به تب/صفحه.
  final void Function(int index) goIndex;

  /// عوض‌کردنِ زیرتبِ صفحه (مثلاً «ماموریت» داخلِ چت‌وبازی).
  final void Function(String sub) onSubTab;

  /// تعدادِ جای نوارِ پایین (تب‌ها + «بیشتر») — برای حسابِ هندسیِ در.
  final int slots;

  @override
  State<TourOverlay> createState() => TourOverlayState();
}

class TourOverlayState extends State<TourOverlay> {
  TourData? _data;
  bool _open = false;
  bool _busy = false; // وسطِ گذارِ یک بخش؛ جلوی دوباره‌کاری را می‌گیرد
  int _index = 0;

  /// مرحلهٔ فعلی: 'door' (روی درِ ورودی) یا 'target' (روی خودِ بخش).
  String _stage = 'target';
  Rect? _doorRect;
  Rect? _targetRect;

  String _phase = 'offer'; // offer | entering | playing | waiting | error
  bool _muted = false;

  AudioPlayer? _player;
  StreamSubscription<void>? _completed;
  Timer? _advanceTimer;

  int _run = 0; // شناسهٔ اجرا؛ کارهای کهنه با آن لغو می‌شوند
  bool _autoStarted = false;

  /// اگر کاربر با لینکِ اتاقِ مشترک یا میان‌بر وسطِ اپ باز شده باشد، تورِ
  /// خودکار نباید او را به خانه بکشد؛ منتظر می‌ماند تا خودش به خانه برسد.
  bool _pendingAuto = false;

  @override
  void initState() {
    super.initState();
    TourBus.instance.addListener(_onBus);
    WidgetsBinding.instance.addPostFrameCallback((_) => _boot());
  }

  @override
  void dispose() {
    TourBus.instance.removeListener(_onBus);
    _completed?.cancel();
    _advanceTimer?.cancel();
    _player?.dispose();
    super.dispose();
  }

  void _onBus() {
    if (_data == null) return;
    start(fromStep: 0);
  }

  /// راه‌اندازی: وضعیت را از سرور می‌خواند و در صورت لزوم شروع می‌کند.
  Future<void> _boot() async {
    if (_autoStarted || widget.api.token == null) return;
    _autoStarted = true;
    final d = await fetchTour(widget.api);
    if (!mounted || d == null) return;
    setState(() => _data = d);
    if (!d.enabled || d.seen) return;
    if (widget.currentIndex != 0) {
      _pendingAuto = true;
      return;
    }
    start(fromStep: 0);
  }

  @override
  void didUpdateWidget(covariant TourOverlay old) {
    super.didUpdateWidget(old);
    if (_pendingAuto && widget.currentIndex == 0) {
      _pendingAuto = false;
      if (!_open) start(fromStep: 0);
    }
  }

  /// شروعِ تور از یک بخش. عمومی تا پروفایل («دوباره ببین») هم بتواند.
  Future<void> start({int fromStep = 0}) async {
    final d = _data;
    if (d == null || d.steps.isEmpty) return;
    _pendingAuto = false;
    setState(() {
      _open = true;
      _phase = 'entering';
      _targetRect = null;
      _doorRect = null;
      _stage = 'target';
    });
    await _show(fromStep);
  }

  Future<void> _finish({bool skipped = false}) async {
    _run += 1;
    _advanceTimer?.cancel();
    unawaited(_player?.stop());
    final d = _data;
    if (d != null) {
      unawaited(markTourSeen(widget.api, d.version, skipped: skipped));
    }
    if (!mounted) return;
    setState(() {
      _open = false;
      _targetRect = null;
      _doorRect = null;
    });
  }

  /// نمایشِ یک بخش: در → مسیر → هدف → صدا.
  Future<void> _show(int i) async {
    final d = _data;
    if (d == null || i < 0 || i >= d.steps.length) return;
    final step = d.steps[i];
    final plan = TourPlan.of(step.id);
    final run = ++_run;

    setState(() {
      _index = i;
      _busy = true;
      _phase = 'entering';
      _stage = 'target';
      _targetRect = null;
      _doorRect = null;
    });
    // ── ۱) درِ ورودی ────────────────────────────────────────────────
    //
    // هندسهٔ در **پیش از نخستین `await`** حساب می‌شود: `_slotRect` به
    // `MediaQuery` نیاز دارد و گرفتنِ context بعد از await، هم لینتِ
    // `use_build_context_synchronously` را قرمز می‌کند و هم می‌تواند روی
    // قابِ عوض‌شده حساب کند.
    final targetIndexNow = widget.currentIndex;
    final destIndex = plan.nav == null ? null : widget.indexFor(plan.nav!);
    final needTab = destIndex != null && destIndex != targetIndexNow;
    final slot = plan.nav == null ? null : _slotOf(plan.nav!);
    final door = (needTab && slot != null) ? _slotRect(slot) : null;
    setState(() {
      _doorRect = door;
      _stage = door == null ? 'target' : 'door';
    });

    await _player?.stop();
    if (!mounted || run != _run) return;

    if (door != null) {
      await Future<void>.delayed(_doorMs);
      if (!mounted || run != _run) return;
    }

    // ── ۲) همان مسیری که کاربر می‌رفت ───────────────────────────────
    if (needTab && destIndex != null) {
      widget.goIndex(destIndex);
      await Future<void>.delayed(_settleMs);
      if (!mounted || run != _run) return;
    }
    if (plan.sub != null) {
      widget.onSubTab(plan.sub!);
      await Future<void>.delayed(_settleMs);
      if (!mounted || run != _run) return;
    }

    // ── ۳) هدف ──────────────────────────────────────────────────────
    final rect = await _waitForAnchor(plan.anchors, run);
    if (!mounted || run != _run) return;
    setState(() {
      _targetRect = rect;
      _stage = 'target';
      _busy = false;
    });
    if (rect != null) {
      // سفرِ انگشت از در به هدف: همین چند صد میلی‌ثانیه «راهِ رسیدن» را
      // نشان می‌دهد و بعد صدا می‌آید.
      await Future<void>.delayed(_enterMs);
      if (!mounted || run != _run) return;
    }
    await _play(step);
  }

  /// اولین لنگرِ موجود را برمی‌گرداند (تا سقفِ زمانی).
  Future<Rect?> _waitForAnchor(List<String> anchors, int run) async {
    if (anchors.isEmpty) return null;
    final deadline = DateTime.now().add(_waitAnchorMs);
    while (DateTime.now().isBefore(deadline)) {
      if (!mounted || run != _run) return null;
      for (final id in anchors) {
        final r = TourAnchors.rectOf(id);
        if (r != null) return r;
      }
      await Future<void>.delayed(const Duration(milliseconds: 90));
    }
    return null;
  }

  Future<void> _play(TourStep step) async {
    final d = _data;
    if (d == null) return;
    if (!step.audioReady || step.audioUrl.isEmpty) {
      setState(() => _phase = 'manual');
      return;
    }
    _player ??= _safePlayer();
    final player = _player;
    if (player == null) {
      setState(() => _phase = 'manual');
      return;
    }
    try {
      await player.setReleaseMode(ReleaseMode.stop);
      await _completed?.cancel();
      _completed = player.onPlayerComplete.listen((_) {
        if (!mounted || !_open) return;
        _advanceTimer?.cancel();
        _advanceTimer = Timer(_advance, _next);
      });
    } catch (e) {
      debugPrint('[tour] آماده‌سازیِ صدا ناموفق: $e');
    }
    try {
      final url = step.audioUrl.startsWith('http')
          ? step.audioUrl
          : '${ApiClient.defaultBaseUrl}${step.audioUrl}';
      await player.stop();
      await player.play(UrlSource(url));
      if (!mounted) return;
      setState(() => _phase = 'playing');
    } catch (e) {
      debugPrint('[tour] پخشِ صدا ناموفق: $e');
      if (!mounted) return;
      setState(() => _phase = 'error');
    }
  }

  Future<void> _next() async {
    final d = _data;
    if (d == null) return;
    if (_index + 1 >= d.steps.length) {
      await _finish();
      return;
    }
    await _show(_index + 1);
  }

  /// «پخش دوباره» = همین بخش از اول، با همان انیمیشنِ ورود.
  Future<void> _replay() async {
    if (_busy) return;
    await _show(_index);
  }

  void _toggleMute() {
    final player = _player;
    final next = !_muted;
    setState(() => _muted = next);
    try {
      player?.setVolume(next ? 0 : 1);
    } catch (_) {
      // صدای خاموش/روشن هرگز نباید چیزی را بشکند.
    }
  }

  /// شمارهٔ جای این مقصد در نوار پایین (همان ترتیبِ نوار، از راست).
  int? _slotOf(String nav) {
    const order = <String>['home', 'cardreg', 'league', 'club', 'more'];
    final i = order.indexOf(nav == 'social' ? 'club' : nav);
    return i == -1 ? null : i;
  }

  /// کادرِ یک جای نوار پایین — با هندسه، نه با لنگر.
  ///
  /// چرا هندسه: آیتم‌های `NavigationBar` ویجتِ خودشان را می‌سازند و گرفتنِ
  /// `GlobalKey` از آن‌ها یعنی دست‌کاریِ داخلیِ متریال. عرضِ هر جای نوار
  /// دقیقاً `۱/تعداد` است و چون اپ راست‌به‌چپ است، اولین تب سمت راست است.
  Rect _slotRect(int slot) {
    final mq = MediaQuery.of(context);
    final size = mq.size;
    final bottom = mq.padding.bottom;
    final slots = widget.slots < 1 ? 1 : widget.slots;
    final w = size.width / slots;
    final left = size.width - (slot + 1) * w;
    return Rect.fromLTWH(left, size.height - bottom - _barHeight, w, _barHeight);
  }

  @override
  Widget build(BuildContext context) {
    if (!_open) return const SizedBox.shrink();
    final d = _data;
    if (d == null || _index >= d.steps.length) return const SizedBox.shrink();
    final step = d.steps[_index];

    final mq = MediaQuery.of(context);
    final frame = Rect.fromLTWH(0, mq.padding.top, mq.size.width,
        mq.size.height - mq.padding.top - mq.padding.bottom);
    final hole = _stage == 'door' ? _doorRect : _targetRect;
    final ring = _clampTo(frame, hole);

    return Positioned.fill(
      child: Directionality(
        textDirection: TextDirection.rtl,
        child: Material(
          type: MaterialType.transparency,
          child: Stack(
            children: <Widget>[
              // ── پرده: هرچه جز بخشِ جاری، تار و کم‌رنگ ─────────────
              if (ring == null)
                _panel(frame)
              else ...<Widget>[
                _panel(Rect.fromLTWH(frame.left, frame.top, frame.width,
                    (ring.top - frame.top).clamp(0, frame.height))),
                _panel(Rect.fromLTWH(frame.left, ring.bottom, frame.width,
                    (frame.bottom - ring.bottom).clamp(0, frame.height))),
                _panel(Rect.fromLTWH(frame.left, ring.top,
                    (ring.left - frame.left).clamp(0, frame.width), ring.height)),
                _panel(Rect.fromLTWH(ring.right, ring.top,
                    (frame.right - ring.right).clamp(0, frame.width), ring.height)),
              ],

              // ── هاله ────────────────────────────────────────────────
              if (ring != null)
                Positioned.fromRect(
                  rect: ring,
                  child: IgnorePointer(
                    child: DecoratedBox(
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(18),
                        border: Border.all(
                          color: _stage == 'door'
                              ? const Color(0xFF84CC16)
                              : const Color(0xFFFFD166),
                          width: 2.4,
                        ),
                        boxShadow: <BoxShadow>[
                          BoxShadow(
                            color: (_stage == 'door'
                                    ? const Color(0xFF84CC16)
                                    : const Color(0xFFFFD166))
                                .withAlpha(40),
                            blurRadius: 18,
                            spreadRadius: 5,
                          ),
                        ],
                      ),
                    ),
                  ),
                ),

              // ── انگشتِ خودکار ───────────────────────────────────────
              if (ring != null) _finger(ring, frame),

              // ── کارتِ متن ───────────────────────────────────────────
              _card(step, frame, ring, d.steps.length),
            ],
          ),
        ),
      ),
    );
  }

  Widget _panel(Rect r) => Positioned.fromRect(
        rect: r,
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 3.2, sigmaY: 3.2),
          child: const ColoredBox(color: Color(0xA6060F1E)),
        ),
      );

  /// انگشت: روی در می‌نشیند و تاچ می‌کند، بعد به سمتِ هدف سفر می‌کند.
  Widget _finger(Rect ring, Rect frame) {
    final to = ring.center;
    final from = _doorRect?.center;
    final target = _clampCenter(to, frame);
    final start = from == null ? target : _clampCenter(from, frame);
    return Positioned.fill(
      child: IgnorePointer(
        child: TweenAnimationBuilder<double>(
          key: ValueKey<String>('finger-$_index-$_stage'),
          tween: Tween<double>(begin: 0, end: 1),
          duration: _enterMs,
          curve: Curves.easeInOut,
          builder: (BuildContext context, double t, Widget? child) {
            final p = Offset.lerp(start, target, t) ?? target;
            // دست هرگز از قاب بیرون نمی‌زند — همان باگی که در وب داشتیم
            // («از کادر خارج می‌شه») و این‌جا از اول بسته است.
            final dx = p.dx.clamp(frame.left + 24, frame.right - 24).toDouble();
            final dy = (p.dy - 18).clamp(frame.top + 6, frame.bottom - 46).toDouble();
            return Stack(
              children: <Widget>[
                Positioned(
                  left: dx - 19,
                  top: dy,
                  child: const _TapHand(),
                ),
              ],
            );
          },
        ),
      ),
    );
  }

  Widget _card(TourStep step, Rect frame, Rect? ring, int total) {
    final width = (frame.width - 20).clamp(200.0, 520.0).toDouble();
    const cardMaxH = 320.0;
    final heightGuess = 230.0;
    double? top;
    if (ring != null) {
      final below = frame.bottom - ring.bottom - 12;
      final above = ring.top - frame.top - 12;
      if (below >= heightGuess + 8) {
        top = ring.bottom + 12;
      } else if (above >= heightGuess + 8) {
        top = ring.top - 12 - heightGuess;
      } else {
        top = below >= above ? (frame.bottom - heightGuess - 12) : (frame.top + 12);
      }
    }
    final card = Container(
      width: width,
      constraints: const BoxConstraints(maxHeight: cardMaxH),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: <Color>[Color(0xF20F172A), Color(0xF2020617)],
        ),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: const Color(0x5CFFD166)),
        boxShadow: const <BoxShadow>[
          BoxShadow(color: Color(0x8C000000), blurRadius: 30, offset: Offset(0, 12)),
        ],
      ),
      padding: const EdgeInsets.fromLTRB(13, 12, 13, 11),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          Row(
            children: <Widget>[
              _badge(),
              const Spacer(),
              Text('${_index + 1} از $total',
                  style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 11.5)),
              const SizedBox(width: 8),
              _skip(),
            ],
          ),
          const SizedBox(height: 9),
          ClipRRect(
            borderRadius: BorderRadius.circular(99),
            child: LinearProgressIndicator(
              value: (_index + 1) / total,
              minHeight: 4,
              backgroundColor: const Color(0x1AFFFFFF),
              valueColor: const AlwaysStoppedAnimation<Color>(Color(0xFFFFD166)),
            ),
          ),
          const SizedBox(height: 10),
          Flexible(
            child: SingleChildScrollView(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: <Widget>[
                  Text(step.title,
                      style: const TextStyle(
                          color: Colors.white, fontSize: 16, fontWeight: FontWeight.w900)),
                  const SizedBox(height: 6),
                  Text(step.text,
                      textAlign: TextAlign.right,
                      style: const TextStyle(
                          color: Color(0xFFD7DEE8), fontSize: 13.5, height: 1.9)),
                ],
              ),
            ),
          ),
          if (_hint() != null) ...<Widget>[
            const SizedBox(height: 8),
            Text(_hint()!,
                style: const TextStyle(color: Color(0xFFF59E0B), fontSize: 12)),
          ],
          const SizedBox(height: 11),
          Row(
            children: <Widget>[
              Expanded(flex: 3, child: _primary()),
              const SizedBox(width: 8),
              _secondary(_muted ? 'صدا خاموش' : 'صدا روشن', _toggleMute),
              if (_phase == 'playing' || _phase == 'manual' || _phase == 'error') ...<Widget>[
                const SizedBox(width: 8),
                _secondary('پخش دوباره', () => unawaited(_replay())),
              ],
            ],
          ),
        ],
      ),
    );

    if (top == null) {
      // هدفی روی صفحه نیست: کارت وسطِ قاب می‌نشیند (افتِ محترمانه).
      return Positioned.fill(
        child: Center(child: Padding(padding: const EdgeInsets.all(10), child: card)),
      );
    }
    final left = ((ring!.center.dx - width / 2).clamp(frame.left + 10, frame.right - width - 10))
        .toDouble();
    return Positioned(left: left, top: top, child: card);
  }

  String? _hint() {
    switch (_phase) {
      case 'offer':
        return 'برای شروعِ پخشِ صدا یک‌بار بزن؛ بعدش خودش جلو می‌رود.';
      case 'waiting':
        return 'پخشِ صدا شروع نشد؛ یک‌بار «پخش صدا» را بزن.';
      case 'manual':
        return 'صدای این بخش در دسترس نیست؛ متن را بخوان و «بعدی» را بزن.';
      case 'error':
        return 'صدا بارگیری نشد. اینترنت را چک کن و «پخش دوباره» را بزن.';
      case 'entering':
        return 'داریم می‌رویم سراغِ همین بخش…';
      default:
        return null;
    }
  }

  Widget _badge() => Container(
        padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
        decoration: BoxDecoration(
          color: const Color(0x1FFFD166),
          border: Border.all(color: const Color(0x4DFFD166)),
          borderRadius: BorderRadius.circular(99),
        ),
        child: const Text('آموزش صوتی قلقلی',
            style: TextStyle(
                color: Color(0xFFFFD166), fontSize: 11.5, fontWeight: FontWeight.w900)),
      );

  Widget _skip() => GestureDetector(
        onTap: () => unawaited(_finish(skipped: true)),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
          decoration: BoxDecoration(
            border: Border.all(color: const Color(0x29FFFFFF)),
            borderRadius: BorderRadius.circular(99),
          ),
          child: const Text('رد کردن',
              style: TextStyle(
                  color: Color(0xFFCBD5E1), fontSize: 11.5, fontWeight: FontWeight.w700)),
        ),
      );

  Widget _primary() {
    final isLast = (_data?.steps.length ?? 1) - 1 == _index;
    final label = _phase == 'offer'
        ? 'شروع آموزش'
        : (_phase == 'waiting' ? 'پخش صدا' : (isLast ? 'پایان' : 'بعدی'));
    return SizedBox(
      height: 44,
      child: DecoratedBox(
        decoration: BoxDecoration(
          gradient: const LinearGradient(
              colors: <Color>[Color(0xFFFFD166), Color(0xFFF59E0B)]),
          borderRadius: BorderRadius.circular(13),
        ),
        child: ElevatedButton(
          style: ElevatedButton.styleFrom(
            backgroundColor: Colors.transparent,
            shadowColor: Colors.transparent,
            foregroundColor: const Color(0xFF1A1205),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(13)),
          ),
          onPressed: () {
            if (_phase == 'offer' || _phase == 'waiting') {
              final d = _data;
              if (d != null && _index < d.steps.length) unawaited(_play(d.steps[_index]));
            } else {
              unawaited(_next());
            }
          },
          child: Text(label,
              style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w900)),
        ),
      ),
    );
  }

  Widget _secondary(String label, VoidCallback onTap) => SizedBox(
        height: 44,
        child: OutlinedButton(
          style: OutlinedButton.styleFrom(
            foregroundColor: const Color(0xFFCBD5E1),
            side: const BorderSide(color: Color(0x24FFFFFF)),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(13)),
            padding: const EdgeInsets.symmetric(horizontal: 12),
          ),
          onPressed: onTap,
          child: Text(label,
              style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700)),
        ),
      );

  /// دوختنِ کادر به قاب (با حاشیهٔ ۸ پیکسلی برای هاله).
  Rect _clampTo(Rect frame, Rect? r) {
    if (r == null) return Rect.zero;
    const pad = 8.0;
    var left = r.left - pad;
    var top = r.top - pad;
    var right = r.right + pad;
    var bottom = r.bottom + pad;
    if (left < frame.left) left = frame.left;
    if (top < frame.top) top = frame.top;
    if (right > frame.right) right = frame.right;
    if (bottom > frame.bottom) bottom = frame.bottom;
    if (right - left < 24) right = (left + 24).clamp(frame.left, frame.right);
    if (bottom - top < 24) bottom = (top + 24).clamp(frame.top, frame.bottom);
    return Rect.fromLTRB(left, top, right, bottom);
  }

  Offset _clampCenter(Offset p, Rect frame) => Offset(
        p.dx.clamp(frame.left + 30, frame.right - 30).toDouble(),
        p.dy.clamp(frame.top + 34, frame.bottom - 40).toDouble(),
      );
}

/// دستِ سفیدِ انگشت با موجِ طلایی — همان تصویرِ وب، این‌جا با `CustomPaint`.
///
/// چرا `CustomPaint` و نه SVG/asset: صفر فایلِ تازه در `pubspec` و صفر
/// وابستگی؛ دقیقاً همان مسیرِ بُردارِ وب با `Path`ِ ساده.
class _TapHand extends StatefulWidget {
  const _TapHand();

  @override
  State<_TapHand> createState() => _TapHandState();
}

class _TapHandState extends State<_TapHand> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1500),
  )..repeat();

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => SizedBox(
        width: 38,
        height: 53,
        child: Stack(
          alignment: Alignment.center,
          children: <Widget>[
            // موجِ طلاییِ رو به بیرون، هم‌زمان با ضربه.
            AnimatedBuilder(
              animation: _c,
              builder: (BuildContext context, Widget? child) {
                final t = _c.value;
                return Opacity(
                  opacity: (1 - t).clamp(0.0, 0.9),
                  child: Container(
                    width: 18 + 26 * t,
                    height: 18 + 26 * t,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      border: Border.all(color: const Color(0xE6FFD166), width: 2),
                    ),
                  ),
                );
              },
            ),
            AnimatedBuilder(
              animation: _c,
              builder: (BuildContext context, Widget? child) {
                // دو ضربه در هر چرخه: پایین‌رفتن = تاچ.
                final t = _c.value;
                final press = t < 0.25 ? 1 - t : (t > 0.35 && t < 0.6 ? 1 - (t - 0.35) : 1.0);
                return Transform.scale(scale: 0.92 + 0.08 * press, child: child);
              },
              child: CustomPaint(size: const Size(30, 44), painter: _HandPainter()),
            ),
          ],
        ),
      );
}

class _HandPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width;
    final h = size.height;
    final hand = Path()
      ..moveTo(w * 0.36, h * 0.50)
      ..lineTo(w * 0.36, h * 0.20)
      ..quadraticBezierTo(w * 0.36, h * 0.10, w * 0.46, h * 0.10)
      ..quadraticBezierTo(w * 0.56, h * 0.10, w * 0.56, h * 0.20)
      ..lineTo(w * 0.56, h * 0.46)
      ..lineTo(w * 0.63, h * 0.38)
      ..quadraticBezierTo(w * 0.70, h * 0.31, w * 0.76, h * 0.38)
      ..quadraticBezierTo(w * 0.81, h * 0.44, w * 0.76, h * 0.52)
      ..lineTo(w * 0.70, h * 0.62)
      ..quadraticBezierTo(w * 0.62, h * 0.78, w * 0.46, h * 0.78)
      ..quadraticBezierTo(w * 0.34, h * 0.78, w * 0.30, h * 0.62)
      ..lineTo(w * 0.22, h * 0.46)
      ..quadraticBezierTo(w * 0.18, h * 0.40, w * 0.22, h * 0.34)
      ..quadraticBezierTo(w * 0.28, h * 0.28, w * 0.34, h * 0.34)
      ..lineTo(w * 0.36, h * 0.40)
      ..close();
    canvas.drawShadow(hand, const Color(0x8C020617), 5, true);
    canvas.drawPath(hand, Paint()..color = Colors.white.withAlpha(243));
    canvas.drawPath(
      hand,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.4
        ..color = const Color(0x8C020617),
    );
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
