part of '../card_duel_page.dart';

/// ═══════════════════════════════════════════════════════════════════════
/// اعلانِ سینماییِ شروعِ راند — وسطِ صفحه، بزرگ، دو ثانیه
/// ═══════════════════════════════════════════════════════════════════════
///
/// ── خواستهٔ مالک ──
///
///   «وقتی راند شروع میشه اینکه مبارزه هر راند سر چی هستش باید با
///    انیمیشن زیبا وسط صفحه نشون داده بشه»
///
/// ── چرا بنرِ قبلی کافی نبود ──
///
/// `_FocusBanner` یک نوارِ افقی در جریانِ ستون است. سه اشکال داشت:
///
///   ۱. **دیده نمی‌شد.** بینِ تابلوی امتیاز و صحنهٔ برخورد گم بود و
///      چشم مستقیم سراغِ کارت‌ها می‌رفت.
///   ۲. **ارتفاع می‌گرفت.** حدود ۹۰ پیکسل از بودجهٔ عمودیِ صفحه را
///      مصرف می‌کرد و همان چیزی بود که کاربر را مجبور به اسکرول می‌کرد.
///   ۳. **حسِ رویداد نداشت.** شروعِ راند یک لحظهٔ دراماتیک است، نه یک
///      برچسبِ ثابت.
///
/// ── این ویجت ──
///
/// یک overlay تمام‌صفحه که با شروعِ هر راند ۲.۸ ثانیه دیده می‌شود:
/// پس‌زمینه تار می‌شود، آیکنِ ویژگی با مدار، پرتو و ذرات وارد می‌شود،
/// («سریع‌ترین کارتت را بفرست!») بزرگ نوشته می‌شود و یک راهنمای یک‌خطی
/// برای گروهِ سنیِ پایین زیرش می‌آید.
///
/// چون overlay است، **هیچ ارتفاعی از چیدمان نمی‌گیرد** — یعنی هم‌زمان
/// مشکلِ اسکرول را هم حل می‌کند.
///
/// `AbsorbPointer`: انتخاب تا پایان معرفی عمداً قفل است؛ تایمر هم روی
/// سرور یخ می‌ماند، پس کاربر نه زمان از دست می‌دهد و نه اشتباهی می‌زند.
class _RoundIntroOverlay extends StatefulWidget {
  const _RoundIntroOverlay({
    required this.focus,
    required this.roundNumber,
    required this.totalRounds,
    this.mod,
    this.modAnnounce,
  });

  final Map<String, dynamic>? focus;
  final int roundNumber;
  final int totalRounds;
  // دوئل طوفان: 'storm' یعنی این راند دو‌امتیازی است.
  final String? mod;
  final Map<String, dynamic>? modAnnounce;

  @override
  State<_RoundIntroOverlay> createState() => _RoundIntroOverlayState();
}

class _RoundIntroOverlayState extends State<_RoundIntroOverlay>
    with SingleTickerProviderStateMixin {
  // ⚠️ چرا `late final` نیست:
  //
  // قبلاً این فیلد `late final AnimationController _c = AnimationController(...)`
  // بود. مقداردهیِ تنبل یعنی کنترلر فقط در **اولین دسترسی** ساخته
  // می‌شود. اگر ویجت بدونِ `focus` رندر می‌شد، `build` زودتر
  // `SizedBox.shrink` برمی‌گرداند و هیچ‌وقت به `_c` دست نمی‌زد.
  //
  // بعد در `dispose()` خطِ `_c.dispose()` برای اولین بار به `_c`
  // دسترسی می‌گرفت و **همان‌جا** کنترلر را می‌ساخت — روی یک ویجتِ
  // از قبل غیرفعال‌شده. `AnimationController` برای `vsync: this` باید
  // `TickerMode` را از درختِ والد بخواند و آن موقع درخت دیگر پایدار
  // نیست:
  //
  //     Looking up a deactivated widget's ancestor is unsafe.
  //
  // یعنی «آزاد کردنِ منبع» خودش منبع می‌ساخت. کنترلر حالا مشتاقانه در
  // `initState` ساخته می‌شود تا همیشه دقیقاً یک بار ساخته و یک بار
  // آزاد شود.
  AnimationController? _c;

  @override
  void initState() {
    super.initState();
    _c = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 2800),
    );
    if (_hasFocus) _c!.forward();
  }

  bool get _hasFocus => '${widget.focus?['stat'] ?? ''}'.isNotEmpty;

  @override
  void didUpdateWidget(covariant _RoundIntroOverlay old) {
    super.didUpdateWidget(old);
    // راندِ تازه → اعلانِ تازه. بدونِ این، فقط راندِ اول اعلان داشت.
    if (old.roundNumber != widget.roundNumber && _hasFocus) {
      _c
        ?..reset()
        ..forward();
    }
  }

  @override
  void dispose() {
    _c?.dispose();
    _c = null;
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (!_hasFocus) return const SizedBox.shrink();
    final stat = '${widget.focus?['stat'] ?? ''}';
    final hint = '${widget.focus?['hint'] ?? ''}';
    final isStorm = widget.mod == 'storm';
    // راند دو‌امتیازی هالهٔ آتشی می‌گیرد تا یک نگاه معلوم باشد.
    final tint = isStorm
        ? const Color(0xFFFF7A1A)
        : (_FocusBannerState._statColors[stat] ?? _cyan);
    final icon = isStorm
        ? Icons.local_fire_department_rounded
        : (_FocusBannerState._statIcons[stat] ?? Icons.stars_rounded);
    final statName = isStorm
        ? 'طوفان!'
        : (_FocusBannerState._statNames[stat] ?? '');
    final kicker = isStorm ? 'راند دو‌امتیازی' : 'معیار این راند';
    final subLine = isStorm
        ? '${widget.modAnnounce?['sub'] ?? 'برنده ۲ امتیاز می‌برد؛ مساوی یعنی وقت اضافه'}'
        : 'بالاترین عدد برنده است';
    final announce = '${widget.modAnnounce?['text'] ?? ''}';

    return Semantics(
      label: isStorm
          ? 'راند دو‌امتیازی! ${announce.isNotEmpty ? announce : 'برنده این راند دو امتیاز می‌برد.'}'
          : 'راند ${widget.roundNumber} از ${widget.totalRounds}. نبرد $statName. $hint',
      child: AnimatedBuilder(
        animation: _c!,
        builder: (context, _) {
          final v = _c!.value;
          if (v >= 1.0) return const SizedBox.shrink();

          // ── تایم‌لاینِ صحنه ──
          //
          // هر مرحله منحنیِ خودش را دارد. قبلاً یک `easeOutBack` روی کلِ
          // صحنه بود و همه‌چیز با هم می‌آمد، پس چشم نمی‌دانست کجا را
          // نگاه کند. حالا ترتیب هست: پرده → مدال → نام معیار → شمارش.
          final curtain = Curves.easeOutCubic.transform(
            (v / 0.14).clamp(0.0, 1.0),
          );
          final enter = Curves.easeOutBack.transform(
            ((v - 0.05) / 0.22).clamp(0.0, 1.0),
          );
          final nameIn = Curves.easeOutBack.transform(
            ((v - 0.17) / 0.20).clamp(0.0, 1.0),
          );
          final exit = Curves.easeInCubic.transform(
            ((v - 0.88) / 0.12).clamp(0.0, 1.0),
          );
          final opacity = (1 - exit).clamp(0.0, 1.0);

          // موجِ ضربه‌ای که در لحظهٔ نشستنِ مدال بیرون می‌زند.
          final shock = ((v - 0.20) / 0.30).clamp(0.0, 1.0);
          final spin = (1 - enter) * .55;
          final scale = 0.48 + 0.52 * enter;

          final beat = v < .50
              ? '۳'
              : v < .64
                  ? '۲'
                  : v < .78
                      ? '۱'
                      : 'انتخاب!';
          final beatPhase = v < .50
              ? (v / .50)
              : v < .64
                  ? ((v - .50) / .14)
                  : v < .78
                      ? ((v - .64) / .14)
                      : ((v - .78) / .22);
          final beatScale = 1 + .18 * (1 - beatPhase.clamp(0.0, 1.0));

          return AbsorbPointer(
            absorbing: true,
            child: Opacity(
              opacity: opacity,
              child: Stack(
                fit: StackFit.expand,
                children: [
                  // ── لایهٔ ۱: پرده ──
                  //
                  // گرادیانِ قبلی تخت بود. حالا زیرِ آن یک بافتِ
                  // شعاعیِ متحرک هست تا پس‌زمینه «زنده» باشد، و لبه‌ها
                  // تیره‌تر (vignette) تا نگاه به مرکز کشیده شود.
                  DecoratedBox(
                    decoration: BoxDecoration(
                      gradient: RadialGradient(
                        colors: [
                          tint.withValues(alpha: .30 * curtain),
                          const Color(0xFA060A14),
                          const Color(0xFF03060C),
                        ],
                        stops: const [.02, .58, 1],
                        radius: .98,
                      ),
                    ),
                  ),
                  // پرتوهای پس‌زمینه + موجِ ضربه.
                  Positioned.fill(
                    child: CustomPaint(
                      painter: _RoundIntroBackdropPainter(
                        progress: v,
                        shock: shock,
                        color: tint,
                      ),
                    ),
                  ),
                  // ── لایهٔ ۲: محتوا ──
                  Center(
                    child: SingleChildScrollView(
                      physics: const NeverScrollableScrollPhysics(),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          // نشانِ راند — با نوارِ پیشرفتِ راندها، تا
                          // کاربر بدونِ خواندنِ متنِ بیشتر بفهمد کجای
                          // مسابقه است.
                          Opacity(
                            opacity: curtain,
                            child: Transform.translate(
                              offset: Offset(0, -10 * (1 - curtain)),
                              child: Container(
                                padding: const EdgeInsets.fromLTRB(
                                    14, 6, 14, 7),
                                decoration: BoxDecoration(
                                  color: Colors.black.withValues(alpha: .38),
                                  borderRadius: BorderRadius.circular(99),
                                  border: Border.all(
                                    color: tint.withValues(alpha: .46),
                                  ),
                                ),
                                child: Column(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    Text(
                                      'راند ${faNum(widget.roundNumber)} از ${faNum(widget.totalRounds)}',
                                      style: const TextStyle(
                                        fontSize: 13,
                                        fontWeight: FontWeight.w900,
                                        color: Colors.white,
                                        letterSpacing: .2,
                                      ),
                                    ),
                                    const SizedBox(height: 5),
                                    Row(
                                      mainAxisSize: MainAxisSize.min,
                                      children: List.generate(
                                        widget.totalRounds,
                                        (index) {
                                          final done =
                                              index < widget.roundNumber - 1;
                                          final now = index ==
                                              widget.roundNumber - 1;
                                          return Container(
                                            width: now ? 18 : 7,
                                            height: 4,
                                            margin: const EdgeInsets
                                                .symmetric(horizontal: 2),
                                            decoration: BoxDecoration(
                                              borderRadius:
                                                  BorderRadius.circular(9),
                                              color: now
                                                  ? tint
                                                  : done
                                                      ? tint.withValues(
                                                          alpha: .55)
                                                      : Colors.white
                                                          .withValues(
                                                              alpha: .20),
                                            ),
                                          );
                                        },
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                          ),
                          const SizedBox(height: 20),
                          // ── مدالِ معیار ──
                          Transform.rotate(
                            angle: spin,
                            child: Transform.scale(
                              scale: scale,
                              child: SizedBox(
                                width: 148,
                                height: 148,
                                child: Stack(
                                  alignment: Alignment.center,
                                  children: [
                                    CustomPaint(
                                      size: const Size.square(148),
                                      painter: _RoundIntroEmblemPainter(
                                        progress: v,
                                        color: tint,
                                      ),
                                    ),
                                    Transform.rotate(
                                      angle: v * 3.2,
                                      child: Container(
                                        width: 138,
                                        height: 138,
                                        decoration: BoxDecoration(
                                          shape: BoxShape.circle,
                                          border: Border.all(
                                            color:
                                                tint.withValues(alpha: .30),
                                            width: 1,
                                          ),
                                        ),
                                      ),
                                    ),
                                    // قرصِ مرکزی: گرادیانِ دوسویه به‌جای
                                    // رنگِ تخت، با هالهٔ دولایه.
                                    Container(
                                      width: 106,
                                      height: 106,
                                      decoration: BoxDecoration(
                                        shape: BoxShape.circle,
                                        gradient: RadialGradient(
                                          colors: [
                                            Color.lerp(tint, Colors.white,
                                                    .22)!
                                                .withValues(alpha: .34),
                                            tint.withValues(alpha: .16),
                                            const Color(0xFF071120),
                                          ],
                                          stops: const [0, .55, 1],
                                        ),
                                        border:
                                            Border.all(color: tint, width: 3),
                                        boxShadow: [
                                          BoxShadow(
                                            color:
                                                tint.withValues(alpha: .70),
                                            blurRadius: 46,
                                            spreadRadius: 4,
                                          ),
                                          BoxShadow(
                                            color:
                                                tint.withValues(alpha: .28),
                                            blurRadius: 90,
                                            spreadRadius: 18,
                                          ),
                                        ],
                                      ),
                                      child: Icon(
                                        icon,
                                        color: Colors.white,
                                        size: 54,
                                        shadows: [
                                          Shadow(color: tint, blurRadius: 22),
                                        ],
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                          ),
                          const SizedBox(height: 16),
                          Opacity(
                            opacity: nameIn.clamp(0.0, 1.0),
                            child: Text(
                              kicker,
                              style: TextStyle(
                                fontSize: 12.5,
                                fontWeight: FontWeight.w800,
                                color: tint.withValues(alpha: .95),
                                letterSpacing: 1.2,
                              ),
                            ),
                          ),
                          const SizedBox(height: 4),
                          // ── نامِ معیار ──
                          //
                          // ۴۲px با وزنِ ۹۰۰ **واقعی** (Vazirmatn-Black
                          // تازه به pubspec اضافه شد؛ پیش از آن w900 به
                          // ExtraBoldِ مصنوعی‌ضخیم‌شده سقوط می‌کرد).
                          // گرادیانِ روی متن با `ShaderMask` عمق می‌دهد.
                          Transform.translate(
                            offset: Offset(0, 14 * (1 - nameIn)),
                            child: Transform.scale(
                              scale: .80 + .20 * nameIn,
                              child: ShaderMask(
                                shaderCallback: (rect) => LinearGradient(
                                  begin: Alignment.topCenter,
                                  end: Alignment.bottomCenter,
                                  colors: [
                                    Colors.white,
                                    Color.lerp(tint, Colors.white, .55)!,
                                    tint,
                                  ],
                                  stops: const [0, .55, 1],
                                ).createShader(rect),
                                child: Text(
                                  statName,
                                  textAlign: TextAlign.center,
                                  style: TextStyle(
                                    fontSize: 42,
                                    height: 1.14,
                                    fontWeight: FontWeight.w900,
                                    color: Colors.white,
                                    letterSpacing: -.5,
                                    shadows: [
                                      Shadow(color: tint, blurRadius: 34),
                                      const Shadow(
                                        color: Colors.black,
                                        blurRadius: 10,
                                        offset: Offset(0, 3),
                                      ),
                                    ],
                                  ),
                                ),
                              ),
                            ),
                          ),
                          const SizedBox(height: 9),
                          // خطِ تزئینیِ زیرِ نام — باز می‌شود.
                          Container(
                            width: 132 * nameIn.clamp(0.0, 1.0),
                            height: 2,
                            decoration: BoxDecoration(
                              borderRadius: BorderRadius.circular(9),
                              gradient: LinearGradient(
                                colors: [
                                  tint.withValues(alpha: 0),
                                  tint,
                                  tint.withValues(alpha: 0),
                                ],
                              ),
                            ),
                          ),
                          const SizedBox(height: 9),
                          Opacity(
                            opacity: nameIn.clamp(0.0, 1.0),
                            child: Text(
                              isStorm
                                  ? 'برنده ۲ امتیاز می‌برد'
                                  : 'بالاترین عدد برنده است',
                              style: TextStyle(
                                fontSize: 13.5,
                                color: isStorm
                                    ? const Color(0xFFFFD9B0)
                                    : Colors.white70,
                                fontWeight: FontWeight.w900,
                              ),
                            ),
                          ),
                          if (isStorm)
                            Opacity(
                              opacity: nameIn.clamp(0.0, 1.0),
                              child: Padding(
                                padding: const EdgeInsets.only(top: 4),
                                child: Text(
                                  subLine,
                                  textAlign: TextAlign.center,
                                  style: const TextStyle(
                                    fontSize: 11.5,
                                    color: Colors.white60,
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                              ),
                            ),
                          const SizedBox(height: 18),
                          Transform.scale(
                            scale: beatScale,
                            child: Text(
                              beat,
                              key: ValueKey(beat),
                              style: TextStyle(
                                fontSize: beat == 'انتخاب!' ? 20 : 27,
                                fontWeight: FontWeight.w900,
                                color:
                                    beat == 'انتخاب!' ? _emerald : Colors.white,
                                letterSpacing: beat == 'انتخاب!' ? .5 : 0,
                                shadows: [
                                  Shadow(
                                    color: beat == 'انتخاب!' ? _emerald : tint,
                                    blurRadius: 22,
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}

/// پس‌زمینهٔ صحنهٔ اعلان: پرتوهای چرخان + موجِ ضربه‌ای.
///
/// چرا `CustomPainter` و نه چند `Container`: این‌ها ده‌ها شکلِ محوشونده‌اند
/// که هر فریم تغییر می‌کنند. با ویجت یعنی ده‌ها لایهٔ ترکیب در هر فریم؛
/// با یک `Canvas` یک پاسِ نقاشی.
class _RoundIntroBackdropPainter extends CustomPainter {
  const _RoundIntroBackdropPainter({
    required this.progress,
    required this.shock,
    required this.color,
  });

  final double progress;
  final double shock;
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final center = size.center(Offset.zero);
    final reach = size.longestSide;

    // پرتوهای کم‌رنگِ چرخان — «نورِ استادیوم».
    final rayFade = math.sin(math.pi * progress.clamp(0.0, 1.0)).abs();
    final rayPaint = Paint()
      ..color = color.withValues(alpha: .05 * rayFade)
      ..style = PaintingStyle.fill;
    canvas.save();
    canvas.translate(center.dx, center.dy);
    canvas.rotate(progress * .5);
    for (var index = 0; index < 10; index++) {
      final a = index * math.pi / 5;
      final path = Path()
        ..moveTo(0, 0)
        ..lineTo(math.cos(a - .052) * reach, math.sin(a - .052) * reach)
        ..lineTo(math.cos(a + .052) * reach, math.sin(a + .052) * reach)
        ..close();
      canvas.drawPath(path, rayPaint);
    }
    canvas.restore();

    // موجِ ضربه در لحظهٔ نشستنِ مدال.
    if (shock > 0 && shock < 1) {
      final ringPaint = Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 3 * (1 - shock)
        ..color = color.withValues(alpha: .42 * (1 - shock));
      canvas.drawCircle(center, 70 + reach * .48 * shock, ringPaint);
      final second = (shock - .18).clamp(0.0, 1.0);
      if (second > 0 && second < 1) {
        canvas.drawCircle(
          center,
          70 + reach * .40 * second,
          ringPaint
            ..strokeWidth = 2 * (1 - second)
            ..color = color.withValues(alpha: .26 * (1 - second)),
        );
      }
    }
  }

  @override
  bool shouldRepaint(covariant _RoundIntroBackdropPainter old) =>
      old.progress != progress || old.shock != shock || old.color != color;
}

class _RoundIntroEmblemPainter extends CustomPainter {
  const _RoundIntroEmblemPainter({required this.progress, required this.color});

  final double progress;
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final center = size.center(Offset.zero);
    final pulse = math.sin(math.pi * progress).abs();

    // ── تیغه‌های شعاعی ──
    // قبلاً ۱۲ خطِ هم‌ضخامت بودند. حالا بلندی‌شان یکی‌درمیان فرق دارد و
    // ضخامتشان با نبض کم و زیاد می‌شود، پس حلقه «می‌تپد».
    final rayPaint = Paint()
      ..strokeCap = StrokeCap.round
      ..strokeWidth = 2.2
      ..color = color.withValues(alpha: .18 + .48 * pulse);
    for (var index = 0; index < 16; index++) {
      final angle = index * math.pi / 8 + progress * .9;
      final inner = 58.0 + 3 * math.sin(progress * math.pi * 4 + index);
      final outer = 66.0 + 6 * pulse + (index.isEven ? 5 : 0);
      canvas.drawLine(
        center + Offset(math.cos(angle), math.sin(angle)) * inner,
        center + Offset(math.cos(angle), math.sin(angle)) * outer,
        rayPaint,
      );
    }

    // ── دو کمانِ چرخان در خلافِ هم ──
    final arcPaint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round
      ..strokeWidth = 2.6
      ..color = color.withValues(alpha: .62);
    final rect = Rect.fromCircle(center: center, radius: 68);
    canvas.drawArc(rect, progress * math.pi * 2, math.pi * .78, false, arcPaint);
    canvas.drawArc(
      rect,
      progress * math.pi * 2 + math.pi,
      math.pi * .42,
      false,
      arcPaint,
    );
    final innerArc = Rect.fromCircle(center: center, radius: 60);
    canvas.drawArc(
      innerArc,
      -progress * math.pi * 2.6,
      math.pi * .30,
      false,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeCap = StrokeCap.round
        ..strokeWidth = 1.6
        ..color = Colors.white.withValues(alpha: .34),
    );

    // ── ذراتِ مداری ──
    final dotPaint = Paint()
      ..color = Colors.white.withValues(alpha: .35 + .5 * pulse);
    for (var index = 0; index < 8; index++) {
      final angle = -progress * 2.2 + index * math.pi / 4;
      final r = 71.0 + 3 * math.sin(progress * math.pi * 3 + index);
      canvas.drawCircle(
        center + Offset(math.cos(angle), math.sin(angle)) * r,
        index.isEven ? 2.4 : 1.5,
        dotPaint,
      );
    }
  }

  @override
  bool shouldRepaint(covariant _RoundIntroEmblemPainter oldDelegate) =>
      oldDelegate.progress != progress || oldDelegate.color != color;
}

@visibleForTesting
class CardDuelRoundIntroForTest extends StatelessWidget {
  const CardDuelRoundIntroForTest({
    super.key,
    required this.focus,
    required this.roundNumber,
    required this.totalRounds,
  });

  final Map<String, dynamic>? focus;
  final int roundNumber;
  final int totalRounds;

  @override
  Widget build(BuildContext context) => _RoundIntroOverlay(
        focus: focus,
        roundNumber: roundNumber,
        totalRounds: totalRounds,
      );
}

/// کادرِ «معیارِ راند» برای تست — همان ویجتی که در نبردِ زنده داخلِ ردیفِ
/// ساعت می‌نشیند، بی‌واسطه و با ورودیِ ساختگی.
///
/// چرا لازم است: `_FocusBanner` خصوصی است و تا دورِ ۲۹ شهریور هیچ‌جا
/// استفاده نمی‌شد؛ یعنی رفتارش هیچ‌وقت — نه در اپ و نه در تست — اجرا
/// نمی‌شد و دو باگِ پنهان داشت (key نداشتن و SingleTickerProvider با دو
/// کنترلر). این قلاب همان مسیر را در تست اجراپذیر می‌کند.
@visibleForTesting
class CardDuelFocusBoxForTest extends StatelessWidget {
  const CardDuelFocusBoxForTest({
    super.key,
    required this.focus,
    this.roundNumber = 1,
    this.dense = false,
    this.storm = false,
  });

  final Map<String, dynamic>? focus;
  final int roundNumber;
  final bool dense;
  final bool storm;

  @override
  Widget build(BuildContext context) => _FocusBanner(
        focus: focus,
        fallbackTitle: '',
        roundNumber: roundNumber,
        dense: dense,
        storm: storm,
      );
}

@visibleForTesting
class CardDuelScoreboardForTest extends StatelessWidget {
  const CardDuelScoreboardForTest({
    super.key,
    required this.myScore,
    required this.theirScore,
    this.lastWinner = '',
    this.roundIndex = 1,
  });

  final int myScore;
  final int theirScore;
  final String lastWinner;

  /// راندِ جاری — حرارتِ نبرد از همین و امتیازها ساخته می‌شود، پس تست
  /// می‌تواند لحظهٔ سرنوشت‌ساز را بازسازی کند.
  final int roundIndex;

  @override
  Widget build(BuildContext context) => _Scoreboard(
        myName: 'بازیکن من',
        theirName: 'ربات تست',
        myScore: myScore,
        theirScore: theirScore,
        color: _cyan,
        myPlayer: const {},
        theirPlayer: const {'isBot': true},
        title: 'نبرد تکنیکی',
        roundLabel: '۲/۵',
        lastWinner: lastWinner,
        mySymbol: 'X',
        opponentRole: 'ربات',
        tension: DuelTension.from(
          myScore: myScore,
          theirScore: theirScore,
          roundIndex: roundIndex,
        ),
      );
}

@visibleForTesting
class CardDuelFocusRibbonForTest extends StatelessWidget {
  const CardDuelFocusRibbonForTest({
    super.key,
    required this.card,
    required this.stat,
    required this.roundIndex,
    required this.previousRoundWon,
  });

  final Map card;
  final String stat;
  final int roundIndex;
  final bool previousRoundWon;

  @override
  Widget build(BuildContext context) => _FocusStatRibbon(
        card: card,
        stat: stat,
        tint: _cyan,
        roundIndex: roundIndex,
        previousRoundWon: previousRoundWon,
      );
}

/// نوارِ باریکِ بالای صفحه حین نبرد — جایگزینِ `_ArenaHero`.
///
/// `_ArenaHero` ۹۶dp ارتفاع می‌گیرد و عنوان/توضیحِ حالت را نشان می‌دهد.
/// آن اطلاعات قبل از شروعِ بازی لازم است، نه وسطش. تنها چیزی که حین
/// نبرد واقعاً لازم است دکمهٔ برگشت است.
///
/// این نوار ۳۴dp است — یعنی ۶۲dp از سرریزِ عمودیِ صفحه کم می‌کند و
/// بخشِ بزرگی از دلیلِ اسکرول را حذف می‌کند.
class _CompactMatchBar extends StatelessWidget {
  const _CompactMatchBar({
    required this.onBack,
    required this.modeColor,
    required this.modeTitle,
  });

  final VoidCallback onBack;
  final Color modeColor;
  final String modeTitle;

  @override
  Widget build(BuildContext context) => SizedBox(
        height: 34,
        child: Row(
          children: [
            IconButton(
              onPressed: onBack,
              icon: const Icon(Icons.arrow_back_rounded, size: 20),
              padding: EdgeInsets.zero,
              constraints: const BoxConstraints(minWidth: 34, minHeight: 34),
              tooltip: 'خروج از نبرد',
            ),
            const SizedBox(width: 6),
            Icon(Icons.sports_mma_rounded, size: 15, color: modeColor),
            const SizedBox(width: 5),
            Expanded(
              child: Text(
                modeTitle,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontSize: 12.5,
                  fontWeight: FontWeight.w900,
                  color: modeColor,
                ),
              ),
            ),
          ],
        ),
      );
}

@visibleForTesting
class CardDuelStakePayoutForTest extends StatelessWidget {
  const CardDuelStakePayoutForTest({
    super.key,
    required this.amount,
    required this.mineWon,
    this.balanceAfter,
    this.opponentRole = 'حریف',
  });

  final int amount;
  final bool mineWon;
  final int? balanceAfter;
  final String opponentRole;

  @override
  Widget build(BuildContext context) => _StakePayoutFlight(
        amount: amount,
        mineWon: mineWon,
        balanceAfter: balanceAfter,
        opponentRole: opponentRole,
      );
}

/// ═══════════════════════════════════════════════════════════════════════
/// کارتِ توضیحِ وقتِ اضافه — آینهٔ اندرویدِ صحنهٔ وب
/// ═══════════════════════════════════════════════════════════════════════
///
/// خواستهٔ مالک (۸ مهر ۱۴۰۵): «راند شش بدون هیچ اکشنی و توضیحی سریع
/// تموم میشه.» وقتِ اضافه اکشنِ بازیکن ندارد (قدرتِ کلِ ترکیب داوری
/// می‌کند)، پس «درست ساخته شدن» یعنی توضیحِ کامل و زمانِ کافی: این کارت
/// یک ثانیه بعد از مهرِ تساوی بالا می‌آید (همان ضربِ وب) و می‌گوید چرا
/// وقت اضافه شد، اعداد چه بودند و دو امتیاز به کی نشست. همهٔ متن‌ها از
/// بک‌اند (narrateOvertime) می‌آیند تا وب و اندروید یک جمله بگویند.
class _OvertimePanel extends StatefulWidget {
  const _OvertimePanel({required this.round, required this.mine});

  final Map<String, dynamic> round;
  final String mine;

  @override
  State<_OvertimePanel> createState() => _OvertimePanelState();
}

class _OvertimePanelState extends State<_OvertimePanel> {
  bool _shown = false;

  @override
  void initState() {
    super.initState();
    // یک ثانیه تأخیر = همان ضربِ وب (phase 'overtime' یک ثانیه پس از
    // verdict). بدونِ تأخیر، توضیح روی لحظهٔ برخورد می‌افتاد.
    Future.delayed(const Duration(milliseconds: 1000), () {
      if (mounted) setState(() => _shown = true);
    });
  }

  @override
  Widget build(BuildContext context) {
    final ot = widget.round['overtime'] is Map
        ? Map<String, dynamic>.from(widget.round['overtime'] as Map)
        : const <String, dynamic>{};
    final narr = widget.round[widget.mine == 'O' ? 'narrO' : 'narrX'];
    final otNarr = narr is Map && narr['overtime'] is Map
        ? Map<String, dynamic>.from(narr['overtime'] as Map)
        : const <String, dynamic>{};
    final theme = Theme.of(context);
    final iWon = '${ot['winner']}' == widget.mine;
    return AnimatedOpacity(
      opacity: _shown ? 1 : 0,
      duration: const Duration(milliseconds: 420),
      child: Container(
        margin: const EdgeInsets.only(top: 6),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(14),
          color: const Color(0xFF081420).withValues(alpha: .92),
          border: Border.all(
            color: const Color(0xFF7DD3FC).withValues(alpha: .55),
          ),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Icon(Icons.schedule_rounded,
                    size: 15, color: Color(0xFF7DD3FC)),
                Gaps.hXs,
                Text('${otNarr['title'] ?? 'وقت اضافه — راندِ سرنوشت'}',
                    style: theme.textTheme.labelLarge?.copyWith(
                      color: const Color(0xFF7DD3FC),
                      fontWeight: FontWeight.w900,
                    )),
              ],
            ),
            Gaps.vXs,
            Text(
              '${otNarr['announce'] ?? 'تساویِ دو‌امتیازی! قدرتِ کلِ ترکیب تصمیم می‌گیرد.'}',
              textAlign: TextAlign.center,
              style: theme.textTheme.bodySmall?.copyWith(
                fontWeight: FontWeight.w800,
                height: 1.5,
              ),
            ),
            if (otNarr['line'] != null) ...[
              Gaps.vXs,
              Text('${otNarr['line']}',
                  textAlign: TextAlign.center,
                  style: theme.textTheme.labelSmall?.copyWith(height: 1.5)),
            ],
            if (otNarr['result'] != null) ...[
              Gaps.vXs,
              Text('${otNarr['result']}',
                  textAlign: TextAlign.center,
                  style: theme.textTheme.labelMedium?.copyWith(
                    color: iWon ? const Color(0xFF22E7A6) : const Color(0xFFFB7185),
                    fontWeight: FontWeight.w900,
                  )),
            ],
          ],
        ),
      ),
    );
  }
}
