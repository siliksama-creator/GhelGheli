part of '../card_duel_page.dart';

/// ═══════════════════════════════════════════════════════════════════════
/// نمایشِ سینماتیکِ راند — چهار فاز، مو‌به‌مو مثلِ نسخهٔ وب
/// ═══════════════════════════════════════════════════════════════════════
///
/// نسخهٔ قبلی یک `TweenAnimationBuilder` ساده بود: کلِ کارت با هم بزرگ
/// می‌شد و همهٔ اطلاعات از فریمِ اول روی صفحه بود. کامل ولی بی‌تعلیق —
/// کاربر نتیجه را می‌دید قبل از اینکه بفهمد چه شد.
///
/// حالا دقیقاً همان چهار فازِ وب:
///   ۱. charge  (۴۵۰ms) — دو کارت از دو طرف هجوم می‌آورند
///   ۲. impact  (۳۰۰ms) — فلاش، حلقهٔ ضربه، لرزش، و ویژگیِ راند
///   ۳. numbers (۵۵۰ms) — دو عددِ قدرت با شمارشِ صعودی
///   ۴. verdict          — مهرِ برنده و توضیح
///
/// ── چرا StatefulWidget و نه فقط TweenAnimationBuilder ──
///
/// فازها باید محتوا را **از درخت حذف** کنند نه فقط شفافش کنند، وگرنه
/// TalkBack عددِ برنده را قبل از موعد می‌خواند و تعلیق بی‌معنی می‌شود.
/// این با تویین تنها ممکن نیست.
///
/// ⚠️ درسِ ثبت‌شدهٔ این پروژه: `late final AnimationController` روی فیلد
/// یک بار باگ داد. اینجا کنترلر در `initState` ساخته و در `dispose` بسته
/// می‌شود، و `didUpdateWidget` برای راندِ تازه ریستش می‌کند — بدونِ آن،
/// راندِ دوم به بعد اصلاً انیمیشن نداشت (همان باگی که در وب با `key` حل شد).
enum _RevealPhase { charge, impact, numbers, verdict }

class _ClashStage extends StatefulWidget {
  const _ClashStage({
    required this.round,
    required this.mine,
    required this.color,
    this.opponentRole = 'حریف',
  });
  final Map<String, dynamic>? round;
  final String mine;
  final Color color;
  final String opponentRole;

  @override
  State<_ClashStage> createState() => _ClashStageState();
}

class _ClashStageState extends State<_ClashStage>
    with SingleTickerProviderStateMixin {
  // ── زمان‌بندیِ نمایشِ نتیجه ──
  //
  // مجموعِ فازها: ۶۰۰ + ۴۰۰ + ۹۰۰ = ۱۹۰۰ms تا حکم.
  //
  // ⚠️ باید کمتر از `resultHoldMs` سرور (۳۲۰۰ms) بماند وگرنه راندِ
  //    بعد وسطِ انیمیشن شروع می‌شود — دقیقاً همان چیزی که مالک گزارش
  //    کرد: «سریع میاد بدون اینکه لود بشه میره». با این عدد، فازِ
  //    «حکم» ۱٫۹ ثانیه فرصتِ دیده‌شدن دارد.
  //
  //    نسخهٔ قبل ۱۳۰۰ms بود و سرور هیچ مکثی نداشت، پس نتیجه عملاً
  //    بلافاصله با اعلانِ راندِ بعد پوشانده می‌شد.
  static const _total = Duration(milliseconds: 1900);
  static const _chargeEnd = 600 / 1900;
  static const _impactEnd = 1000 / 1900;
  // ⚠️ حتماً `1.0` و نه `1`: استنتاجِ نوع آن را int می‌کرد و
  // `Curves.transform(int)` خطای کامپایل می‌داد.
  static const _numbersEnd = 1.0;

  late final AnimationController _c = AnimationController(
    vsync: this,
    duration: _total,
  );

  // آینهٔ وب: برای راندِ طوفانی و وقتِ اضافه، لحظهٔ برخورد ضربهٔ سنگین و
  // لحظهٔ حکمِ وقتِ اضافه ضربهٔ متوسط می‌زند. هیچ زمانی به _total اضافه
  // نمی‌شود پس گاردِ زمان‌بندیِ سرور را رد نمی‌کند؛ فقط «حسِ» لحظهٔ مهم.
  _RevealPhase? _lastHaptic;

  @override
  void initState() {
    super.initState();
    if (widget.round != null) _c.forward();
    _c.addListener(_onAnimationTick);
  }

  void _onAnimationTick() {
    final p = _phase;
    if (p == _lastHaptic) return;
    _lastHaptic = p;
    final round = widget.round;
    if (round == null) return;
    final view = CardDuelRoundPerspective.from(round, widget.mine);
    if (p == _RevealPhase.impact) {
      if (view.isStorm || view.inOvertime) HapticFeedback.heavyImpact();
    } else if (p == _RevealPhase.verdict && view.inOvertime) {
      HapticFeedback.mediumImpact();
    }
  }

  @override
  void didUpdateWidget(covariant _ClashStage old) {
    super.didUpdateWidget(old);
    // راندِ تازه = انیمیشن از اول. بدونِ این مقایسه، هر rebuildِ بی‌ربط
    // (مثلاً تیک ساعت) انیمیشن را ریست می‌کرد و صحنه می‌لرزید.
    final before = old.round?['round'];
    final now = widget.round?['round'];
    if (before != now && widget.round != null) {
      _lastHaptic = null;
      _c
        ..reset()
        ..forward();
    }
  }

  @override
  void dispose() {
    _c.removeListener(_onAnimationTick);
    _c.dispose();
    super.dispose();
  }

  _RevealPhase get _phase {
    final t = _c.value;
    if (t < _chargeEnd) return _RevealPhase.charge;
    if (t < _impactEnd) return _RevealPhase.impact;
    if (t < _numbersEnd) return _RevealPhase.numbers;
    return _RevealPhase.verdict;
  }

  /// پیشرفتِ ۰..۱ داخلِ یک بازهٔ مشخص — برای انیمیشنِ هر فاز جداگانه.
  double _span(double from, double to) =>
      ((_c.value - from) / (to - from)).clamp(0.0, 1.0);

  @override
  Widget build(BuildContext context) =>
      AnimatedBuilder(animation: _c, builder: (context, _) => _build(context));

  Widget _build(BuildContext context) {
    final round = widget.round;
    final mine = widget.mine;
    final color = widget.color;
    if (round == null) {
      return Container(
        height: 210,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          borderRadius: Corners.rXl,
          gradient: RadialGradient(
            colors: [color.withValues(alpha: 0.16), const Color(0xFF07111D)],
          ),
          border: Border.all(color: Colors.white10),
        ),
        child: const Text(
          'منتظر برخورد اول…',
          style: TextStyle(color: Colors.white54, fontWeight: FontWeight.w800),
        ),
      );
    }
    final view = CardDuelRoundPerspective.from(round, mine);
    final myCard = view.mine;
    final otherCard = view.theirs;
    final myPower = view.myPower;
    final otherPower = view.theirPower;
    final iWon = view.iWon;
    final draw = view.draw;
    final opponentRole = widget.opponentRole;
    final isStorm = view.isStorm;
    final inOvertime = view.inOvertime;
    final awardVal = view.awardForWinner;
    // در وقت اضافه عددهای دو طرف قدرتِ کل ترکیب‌اند، نه تک‌کارت.
    final showMyPower = inOvertime ? view.mySquad : myPower;
    final showOtherPower = inOvertime ? view.theirSquad : otherPower;
    final verdictText = !view.contractValid
        ? 'خطای همگام‌سازی'
        : inOvertime
            ? iWon
                ? 'وقت اضافه: +${faNum(awardVal)} تو'
                : 'وقت اضافه: +${faNum(awardVal)} $opponentRole'
            : draw
                ? (isStorm ? 'مساوی؛ وقت اضافه' : 'مساوی')
                : iWon
                    ? '+${faNum(view.myAward > 0 ? view.myAward : awardVal)} تو'
                    : '+${faNum(view.theirAward > 0 ? view.theirAward : awardVal)} $opponentRole';
    final winnerSummary = inOvertime
        ? iWon
            ? 'در وقت اضافه قدرت ترکیب تو (${faNum(showMyPower)}) سنگین‌تر بود؛ ${faNum(awardVal)} امتیاز گرفتی.'
            : 'در وقت اضافه ترکیب $opponentRole (${faNum(showOtherPower)}) سنگین‌تر بود؛ ${faNum(awardVal)} امتیاز رفت.'
        : draw
            ? (isStorm
                ? 'راند دو‌امتیازی مساوی شد؛ کار به وقت اضافه کشید.'
                : 'عدد نهایی تو و $opponentRole هر دو ${faNum(myPower)} شد؛ امتیازی اضافه نشد.')
            : iWon
                ? 'کارت تو «${myCard['name'] ?? 'بدون نام'}» با ${faNum(myPower)} در برابر ${faNum(otherPower)} برد${isStorm ? ' و دو امتیاز گرفت' : ' یک امتیاز به تو اضافه شد'}.'
                : 'کارت $opponentRole «${otherCard['name'] ?? 'بدون نام'}» با ${faNum(otherPower)} در برابر ${faNum(myPower)} برد${isStorm ? ' و دو امتیاز گرفت' : ' یک امتیاز به $opponentRole اضافه شد'}.';
    // رنگِ برچسبِ معیارِ راند در این صحنه — آینهٔ چیپِ `.duelClashFocus` وب.
    // اولویت: وقت اضافه ⇒ آبی، طوفان ⇒ نارنجی، وگرنه رنگِ خودِ ویژگی.
    final focusTint = _FocusBannerState._statColors[
        '${round['focusKey'] ?? ''}'] ?? Colors.white60;
    final phase = _phase;
    final outcome = draw
        ? _gold
        : iWon
            ? _emerald
            : _rose;
    final showNumbers =
        phase == _RevealPhase.numbers || phase == _RevealPhase.verdict;
    final showVerdict = phase == _RevealPhase.verdict;

    // فاز ۱ — هجوم از دو طرف.
    final charge = Curves.easeOutCubic.transform(_span(0, _chargeEnd));
    // فاز ۲ — لرزش و فلاش.
    final impactT = _span(_chargeEnd, _impactEnd);
    // موجِ دایره‌ای که از مرکز بیرون می‌زند.
    final ringT = Curves.easeOut.transform(impactT);
    // لرزشِ میرا: دامنه با پیشرفتِ فاز کم می‌شود.
    final shake = phase == _RevealPhase.impact
        ? math.sin(impactT * math.pi * 6) * 5 * (1 - impactT)
        : 0.0;
    // فاز ۳ — شمارشِ صعودی عددها.
    final countT = Curves.easeOutCubic.transform(
      _span(_impactEnd, _numbersEnd),
    );

    return Semantics(
      label: 'نتیجه راند ${faNum(round['round'])}. $winnerSummary',
      child: Transform.translate(
        offset: Offset(shake, 0),
        child: Stack(
          children: [
            // فلاشِ سفیدِ لحظهٔ برخورد + حلقهٔ ضربه.
            if (phase == _RevealPhase.impact)
              Positioned.fill(
                child: IgnorePointer(
                  child: Center(
                    child: Opacity(
                      opacity: (1 - impactT).clamp(0.0, 1.0) * 0.9,
                      child: Container(
                        width: 26 + ringT * 320,
                        height: 26 + ringT * 320,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          border: Border.all(
                            color: outcome,
                            width: 2.5 * (1 - ringT) + 0.5,
                          ),
                          gradient: RadialGradient(
                            colors: [
                              Colors.white.withValues(
                                alpha: 0.30 * (1 - impactT),
                              ),
                              Colors.transparent,
                            ],
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                borderRadius: Corners.rXl,
                gradient: LinearGradient(
                  colors: [
                    outcome.withValues(alpha: 0.16),
                    const Color(0xFF07111D),
                  ],
                ),
                border: Border.all(
                  color: outcome.withValues(alpha: 0.55),
                  width: 1.4,
                ),
                boxShadow: [
                  BoxShadow(
                    color: outcome.withValues(alpha: showVerdict ? .30 : .16),
                    blurRadius: showVerdict ? 34 : 22,
                  ),
                ],
              ),
              child: Column(
                children: [
                  Row(
                    textDirection: TextDirection.rtl,
                    children: [
                      // کارتِ من همیشه سمت راست؛ حریف همیشه سمت چپ.
                      Expanded(
                        child: Stack(
                          clipBehavior: Clip.none,
                          children: [
                            Opacity(
                              opacity: charge,
                              child: Transform.translate(
                                offset: Offset(38 * (1 - charge), 0),
                                child: Transform.rotate(
                                  angle: 0.12 * (1 - charge),
                                  child: _ClashCardOwner(
                                    owner: 'تو',
                                    tint: _emerald,
                                    card: myCard,
                                    winner: showVerdict && iWon,
                                    loser: showVerdict && !draw && !iWon,
                                  ),
                                ),
                              ),
                            ),
                            if (view.myLuck != 0)
                              Positioned(
                                top: 0,
                                right: 4,
                                child: _LuckChip(value: view.myLuck),
                              ),
                          ],
                        ),
                      ),
                      Expanded(
                        child: Column(
                          children: [
                            Text(
                              '${faNum(round['round'])} • ${inOvertime ? 'وقت اضافه' : (round['focusLabel'] ?? round['title'])}',
                              style: TextStyle(
                                fontSize: 12,
                                color: inOvertime
                                    ? const Color(0xFF7DD3FC)
                                    : (isStorm
                                        ? const Color(0xFFFFB066)
                                        : focusTint),
                                fontWeight: FontWeight.w900,
                              ),
                              textAlign: TextAlign.center,
                            ),
                            if (isStorm || inOvertime)
                              Container(
                                margin: const EdgeInsets.only(top: 4, bottom: 2),
                                padding: const EdgeInsets.symmetric(
                                    horizontal: 10, vertical: 3),
                                decoration: BoxDecoration(
                                  borderRadius: BorderRadius.circular(999),
                                  gradient: LinearGradient(colors: inOvertime
                                      ? const [Color(0xFF38BDF8), Color(0xFF6366F1)]
                                      : const [Color(0xFFFF7A1A), Color(0xFFFF4D2E)]),
                                ),
                                child: Text(
                                  inOvertime ? 'وقت اضافه' : 'راند دو‌امتیازی',
                                  style: const TextStyle(
                                    color: Colors.white,
                                    fontWeight: FontWeight.w900,
                                    fontSize: 11,
                                  ),
                                ),
                              ),
                            const SizedBox(height: 7),
                            Column(
                              children: [
                                _RoundPowerLine(
                                  owner: inOvertime ? 'ترکیب تو' : 'تو',
                                  value: showNumbers ? showMyPower * countT : 0,
                                  visible: showNumbers,
                                  lead: showVerdict && iWon,
                                  color: _emerald,
                                ),
                                const SizedBox(height: 3),
                                _RoundPowerLine(
                                  owner: inOvertime ? 'ترکیب $opponentRole' : opponentRole,
                                  value: showNumbers ? showOtherPower * countT : 0,
                                  visible: showNumbers,
                                  lead: showVerdict && !draw && !iWon,
                                  color: _rose,
                                ),
                              ],
                            ),
                            const SizedBox(height: 7),
                            // مهرِ برنده: از بزرگ و چرخیده می‌کوبد روی جایش.
                            if (showVerdict)
                              TweenAnimationBuilder<double>(
                                key: ValueKey('stamp-${round['round']}'),
                                tween: Tween(begin: 0, end: 1),
                                duration: const Duration(milliseconds: 420),
                                curve: Curves.easeOutBack,
                                builder: (_, t, child) => Opacity(
                                  opacity: t.clamp(0.0, 1.0),
                                  child: Transform.rotate(
                                    angle: -0.22 * (1 - t),
                                    child: Transform.scale(
                                      scale: 0.6 +
                                          0.4 * t +
                                          1.2 * (1 - t) * (1 - t),
                                      child: child,
                                    ),
                                  ),
                                ),
                                child: Container(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 10,
                                    vertical: 5,
                                  ),
                                  decoration: BoxDecoration(
                                    color: outcome.withValues(alpha: 0.18),
                                    borderRadius: BorderRadius.circular(99),
                                    border: Border.all(
                                      color: outcome.withValues(alpha: 0.5),
                                    ),
                                  ),
                                  child: Text(
                                    verdictText,
                                    style: TextStyle(
                                      color: outcome,
                                      fontWeight: FontWeight.w900,
                                      letterSpacing: 0.6,
                                    ),
                                  ),
                                ),
                              ),
                            // جملهٔ رواییِ فارسیِ بانمک (ساختهٔ بک‌اند)؛
                            // فقط در دوئل طوفان می‌آید و آینهٔ وب است.
                            if (showVerdict)
                              Builder(builder: (_) {
                                final narr = mine == 'O'
                                    ? (round['narrO'] as Map?)
                                    : (round['narrX'] as Map?);
                                final head = '${narr?['headline'] ?? ''}';
                                if (head.isEmpty) return const SizedBox.shrink();
                                return Padding(
                                  padding: const EdgeInsets.only(top: 7),
                                  child: Container(
                                    constraints: const BoxConstraints(maxWidth: 210),
                                    padding: const EdgeInsets.symmetric(
                                        horizontal: 10, vertical: 5),
                                    decoration: BoxDecoration(
                                      color: Colors.white.withValues(alpha: .06),
                                      borderRadius: BorderRadius.circular(12),
                                      border: Border.all(
                                        color: Colors.white.withValues(alpha: .12),
                                      ),
                                    ),
                                    child: Text(
                                      head,
                                      textAlign: TextAlign.center,
                                      style: const TextStyle(
                                        color: Color(0xFFE7F2FB),
                                        fontSize: 11,
                                        height: 1.5,
                                        fontWeight: FontWeight.w800,
                                      ),
                                    ),
                                  ),
                                );
                              }),
                          ],
                        ),
                      ),
                      // کارتِ حریف از چپ.
                      Expanded(
                        child: Stack(
                          clipBehavior: Clip.none,
                          children: [
                            Opacity(
                              opacity: charge,
                              child: Transform.translate(
                                offset: Offset(-38 * (1 - charge), 0),
                                child: Transform.rotate(
                                  angle: -0.12 * (1 - charge),
                                  child: _ClashCardOwner(
                                    owner: opponentRole,
                                    tint: _rose,
                                    card: otherCard,
                                    winner: showVerdict && !draw && !iWon,
                                    loser: showVerdict && iWon,
                                  ),
                                ),
                              ),
                            ),
                            if (view.theirLuck != 0)
                              Positioned(
                                top: 0,
                                left: 4,
                                child: _LuckChip(value: view.theirLuck),
                              ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            if (showVerdict && !draw)
              Positioned.fill(
                child: _VictoryBurst(
                  key: ValueKey('burst-${round['round']}'),
                  color: outcome,
                  towardRight: iWon,
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _VictoryBurst extends StatelessWidget {
  const _VictoryBurst({
    super.key,
    required this.color,
    required this.towardRight,
  });
  final Color color;
  final bool towardRight;

  static const _rays = <Offset>[
    Offset(-72, -58),
    Offset(-86, 4),
    Offset(-58, 58),
    Offset(-8, -82),
    Offset(12, 78),
    Offset(62, -62),
    Offset(84, 2),
    Offset(62, 58),
  ];

  @override
  Widget build(BuildContext context) => IgnorePointer(
        child: TweenAnimationBuilder<double>(
          tween: Tween(begin: 0, end: 1),
          duration: const Duration(milliseconds: 850),
          curve: Curves.easeOutCubic,
          builder: (_, t, __) => Stack(
            children: [
              for (var i = 0; i < _rays.length; i++)
                Align(
                  alignment: Alignment(towardRight ? .62 : -.62, 0),
                  child: Transform.translate(
                    offset: _rays[i] * t,
                    child: Opacity(
                      opacity: (1 - t).clamp(0.0, 1.0),
                      child: Icon(
                        i.isEven ? Icons.star_rounded : Icons.circle,
                        size: i.isEven ? 13 : 7,
                        color: i % 3 == 0 ? _gold : color,
                        shadows: [Shadow(color: color, blurRadius: 12)],
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),
      );
}

class _ClashCardOwner extends StatelessWidget {
  const _ClashCardOwner({
    required this.owner,
    required this.tint,
    required this.card,
    required this.winner,
    required this.loser,
  });
  final String owner;
  final Color tint;
  final Map<String, dynamic> card;
  final bool winner;
  final bool loser;

  @override
  Widget build(BuildContext context) => Semantics(
        label:
            '$owner، ${card['name'] ?? 'کارت بدون نام'}${winner ? '، برندهٔ این راند' : loser ? '، بازندهٔ این راند' : ''}',
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(
                color: tint.withValues(alpha: .16),
                borderRadius: BorderRadius.circular(99),
                border: Border.all(color: tint.withValues(alpha: .55)),
                boxShadow: winner
                    ? [
                        BoxShadow(
                            color: tint.withValues(alpha: .42), blurRadius: 18)
                      ]
                    : const [],
              ),
              child: Text(
                owner,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  color: tint,
                  fontSize: 11.5,
                  fontWeight: FontWeight.w900,
                ),
              ),
            ),
            const SizedBox(height: 5),
            AspectRatio(
              aspectRatio: 0.68,
              child: PlayerCard(
                card: card,
                compact: true,
                showStats: false,
                winner: winner,
                loser: loser,
              ),
            ),
          ],
        ),
      );
}

/// چیپ شانس روی کارتِ صحنهٔ برخورد (دوئل طوفان).
///
/// شانس باید «دیدنی» باشد: سبز یعنی عددِ امروز بالا پرید، قرمز یعنی توپ
/// نچرخید. صفر نشان داده نمی‌شود تا شلوغ نشود. فقط نمایشِ همان عددی است
/// که در حکم وارد شده — هیچ منطق تازه‌ای اینجا نیست.
class _LuckChip extends StatelessWidget {
  const _LuckChip({required this.value});
  final int value;

  @override
  Widget build(BuildContext context) {
    if (value == 0) return const SizedBox.shrink();
    final good = value > 0;
    final bg = good ? const Color(0xFF0FB37F) : const Color(0xFFE23B57);
    final fg = good ? const Color(0xFF042016) : Colors.white;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: good
              ? const [Color(0xFF22E7A6), Color(0xFF0FB37F)]
              : const [Color(0xFFFB7185), Color(0xFFE23B57)],
        ),
        borderRadius: BorderRadius.circular(999),
        boxShadow: [
          BoxShadow(color: bg.withValues(alpha: .5), blurRadius: 10),
        ],
      ),
      child: Text(
        good ? '+${faNum(value)}' : '−${faNum(value.abs())}',
        style: TextStyle(
          color: fg,
          fontSize: 11,
          fontWeight: FontWeight.w900,
          height: 1.1,
        ),
      ),
    );
  }
}

class _RoundPowerLine extends StatelessWidget {
  const _RoundPowerLine({
    required this.owner,
    required this.value,
    required this.visible,
    required this.lead,
    required this.color,
  });
  final String owner;
  final num value;
  final bool visible;
  final bool lead;
  final Color color;

  @override
  Widget build(BuildContext context) => Semantics(
        label: visible
            ? 'عدد نهایی $owner ${faNum(value.round())}'
            : 'عدد $owner پنهان است',
        child: Container(
          margin: const EdgeInsets.symmetric(vertical: 2),
          padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
          decoration: BoxDecoration(
            color: color.withValues(alpha: lead ? .20 : .09),
            borderRadius: BorderRadius.circular(10),
            border:
                Border.all(color: color.withValues(alpha: lead ? .62 : .24)),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            mainAxisAlignment: MainAxisAlignment.center,
            textDirection: TextDirection.rtl,
            children: [
              Text(
                '$owner:',
                style: TextStyle(
                  color: color,
                  fontSize: 11.5,
                  fontWeight: FontWeight.w900,
                ),
              ),
              const SizedBox(width: 4),
              _PowerNumber(
                value: value,
                visible: visible,
                lead: lead,
                color: color,
              ),
            ],
          ),
        ),
      );
}

/// عددِ قدرت با شمارشِ صعودی.
///
/// جدا شد چون دو بار استفاده می‌شود و منطقِ «برنده بزرگ‌تر و طلایی» نباید
/// در دو جا کپی شود.
class _PowerNumber extends StatelessWidget {
  const _PowerNumber({
    required this.value,
    required this.visible,
    required this.lead,
    required this.color,
  });
  final num value;
  final bool visible;
  final bool lead;
  final Color color;

  @override
  Widget build(BuildContext context) => AnimatedDefaultTextStyle(
        duration: const Duration(milliseconds: 300),
        curve: Curves.easeOutBack,
        style: TextStyle(
          fontFamily: 'Vazirmatn',
          fontSize: lead ? 26 : 22,
          fontWeight: FontWeight.w900,
          color: !visible ? Colors.white38 : color,
          shadows: lead
              ? [Shadow(color: color.withValues(alpha: .70), blurRadius: 18)]
              : const <Shadow>[],
        ),
        // ⚠️ چرا «؟» به‌جای Opacity(0)
        //
        // نسخهٔ قبلی عدد را نامرئی می‌کرد ولی جایش خالی می‌ماند، پس در
        // فازهای charge/impact وسطِ صحنه یک حفرهٔ بی‌معنی بود. حالا
        // علامتِ سؤال نشان می‌دهد «عدد هست ولی هنوز فاش نشده» — همان
        // قراردادی که نسخهٔ وب هم دارد، تا دو پلتفرم یک حس بدهند.
        //
        // عرض هم ثابت می‌ماند، پس در لحظهٔ فاش شدنِ عدد ردیف نمی‌پرد.
        child: Text(
          visible ? faNum(value.round()) : '؟',
          textDirection: TextDirection.ltr,
        ),
      );
}

class _Finale extends StatelessWidget {
  const _Finale({
    required this.session,
    required this.color,
    required this.onAgain,
    required this.onEdit,
    required this.onShare,
    required this.sharing,
    required this.mvp,
    required this.privateLobby,
  });
  final GameSession session;
  final Color color;
  final VoidCallback onAgain;
  final VoidCallback onEdit;
  final VoidCallback onShare;
  final bool sharing;
  final Map<String, dynamic>? mvp;
  final bool privateLobby;

  @override
  Widget build(BuildContext context) {
    final won = session.iWon;
    final draw = session.winner == 'DRAW';
    final history = (session.state['history'] as List? ?? const [])
        .whereType<Map>()
        .toList();
    final score = session.state['score'] is Map
        ? session.state['score'] as Map
        : const {};
    final me = session.mySymbol ?? 'X';
    final other = me == 'X' ? 'O' : 'X';
    // روایتِ پایان نبرد را بک‌اند می‌سازد (state.narration)؛ اگر نبود
    // (کلاسیک/کلاینت قدیمی) همان جملهٔ فارسیِ ساده.
    final narration = session.state['narration'] is Map
        ? Map<String, dynamic>.from(session.state['narration'] as Map)
        : const <String, dynamic>{};
    final headline = '${narration['headline'] ?? ''}';
    final achievement = narration['achievement'] is Map
        ? Map<String, dynamic>.from(narration['achievement'] as Map)
        : const <String, dynamic>{};
    final fallbackHeadline = draw
        ? 'پایه‌پایه؛ هیچ‌کس کم نیاورد'
        : won
            ? 'بردی؛ آرنا مالِ توست'
            : 'این دور مالِ حریف بود؛ انتقام شیرین‌تره';
    return Stack(
      clipBehavior: Clip.hardEdge,
      children: [
        Container(
          padding: const EdgeInsets.all(Gaps.md),
          decoration: BoxDecoration(
            borderRadius: Corners.rXl,
            gradient: const LinearGradient(
              colors: [Color(0xFF17304C), Color(0xFF050A12)],
            ),
            border: Border.all(color: color),
          ),
          child: Column(
            children: [
              Text(
                headline.isNotEmpty ? headline : fallbackHeadline,
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 26,
                  height: 1.4,
                  fontWeight: FontWeight.w900,
                  color: draw
                      ? _gold
                      : won
                          ? _emerald
                          : _rose,
                ),
              ),
              if (achievement.isNotEmpty)
                Container(
                  margin: const EdgeInsets.only(top: 8),
                  padding: const EdgeInsets.symmetric(
                      horizontal: 14, vertical: 6),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(999),
                    gradient: const LinearGradient(
                      colors: [Color(0x33FFD166), Color(0x2EFF7A1A)],
                    ),
                    border: Border.all(color: _gold.withValues(alpha: .4)),
                  ),
                  child: Text(
                    '${achievement['label'] ?? ''}',
                    style: const TextStyle(
                      color: _gold,
                      fontWeight: FontWeight.w900,
                      fontSize: 13,
                    ),
                  ),
                ),
              Text(
                'تو ${faNum(score[me])} — ${session.vsBot ? 'ربات' : 'حریف'} ${faNum(score[other])}',
                textAlign: TextAlign.center,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 24,
                  fontWeight: FontWeight.w900,
                ),
              ),
              if (!session.vsBot || session.finishReason == 'disconnect') ...[
                Gaps.vXs,
                Text(
                  session.finishReason == 'disconnect'
                      ? session.resultText
                      : draw
                          ? 'امتیاز تو: ۰ (ورودی کامل برگشت)'
                          : won
                              // امتیازِ مثبت برای برنده — سودِ خالص:
                              // پاتِ دریافتی منهای ورودیِ خودش (خواستهٔ مالک).
                              ? '+${faNum((session.netPot - session.stake).clamp(0, 1 << 31))} امتیاز · تسویه شد'
                              : '−${faNum(session.stake)} امتیاز',
                  textAlign: TextAlign.center,
                  style: const TextStyle(fontSize: 12, color: Colors.white60),
                ),
              ],
              // سکهٔ لیگ — درست زیرِ خطِ تسویه، جایی که چشم بعد از دیدنِ
              // امتیاز می‌رود. `coinsWinner` نمادِ برندهٔ خودِ تسویه است،
              // که حتی وقتی مسابقه با قطعِ ارتباط تمام شده هم درست است.
              if (session.coinsAwarded > 0) ...[
                Gaps.vXs,
                CoinAward(
                  amount: session.coinsAwarded,
                  mine: session.coinsWinner == me,
                ),
              ],
              Gaps.vSm,
              if (history.isNotEmpty)
                _RoundPips(
                  total: 5,
                  current: 5,
                  history: history,
                  mine: me,
                  color: color,
                  storm: (session.state['storm'] as List?)?.cast<dynamic>(),
                ),
              if (history.isNotEmpty) ...[
                Gaps.vSm,
                Theme(
                  data: Theme.of(context)
                      .copyWith(dividerColor: Colors.transparent),
                  child: ExpansionTile(
                    tilePadding: EdgeInsets.zero,
                    collapsedIconColor: Colors.white70,
                    iconColor: Colors.white,
                    title: const Text(
                      'جزئیات راندها',
                      style: TextStyle(
                        fontSize: 12.5,
                        fontWeight: FontWeight.w900,
                        color: Colors.white,
                      ),
                    ),
                    children: [
                      for (final raw in history)
                        _FinalRoundBreakdown(
                          round: Map<String, dynamic>.from(raw),
                          mySymbol: me,
                          opponentRole: session.vsBot ? 'ربات' : 'حریف',
                        ),
                    ],
                  ),
                ),
              ],
              if (mvp != null) ...[
                Gaps.vSm,
                SizedBox(
                  width: 140,
                  height: 196,
                  child: PlayerCard(
                    card: mvp!,
                    compact: true,
                    showStats: false,
                    winner: true,
                  ),
                ),
                Text(
                  'MVP · ${mvp!['name']}',
                  style: const TextStyle(fontWeight: FontWeight.w900),
                ),
              ],
              Gaps.vSm,
              OutlinedButton.icon(
                onPressed: sharing ? null : onShare,
                icon: const Icon(Icons.ios_share_rounded, size: 17),
                label: Text(
                  sharing ? 'در حال ساخت…' : 'اشتراک',
                ),
              ),
              Gaps.vSm,
              Row(
                children: [
                  Expanded(
                    child: FilledButton(
                      onPressed: session.rematchWaiting ? null : onAgain,
                      child: Text(
                        session.rematchWaiting
                            ? 'منتظر حریف…'
                            : session.rematchAvailable
                                ? 'دوباره'
                                : privateLobby
                                    ? 'بازگشت به لابی'
                                    : 'دوباره',
                      ),
                    ),
                  ),
                  Gaps.hXs,
                  Expanded(
                    child: OutlinedButton(
                      onPressed: onEdit,
                      child: const Text('ترکیب'),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
        if (session.stakePayoutSequence > 0)
          Positioned.fill(
            child: IgnorePointer(
              child: _StakePayoutFlight(
                key: ValueKey(session.stakePayoutSequence),
                amount: session.stakePayoutAmount,
                mineWon: session.stakePayoutWinner == me,
                balanceAfter: session.stakeWinnerBalanceAfter,
                opponentRole: session.vsBot ? 'ربات' : 'حریف',
              ),
            ),
          ),
      ],
    );
  }
}
