import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../api_client.dart';
import '../../core/app_config.dart';
import '../../core/assets.dart';
import '../../theme/colors.dart';
import '../../theme/tokens.dart';
import '../../widgets/gradient_panel.dart';

/// Premium compact seven-day login streak card for the user dashboard.
///
/// Designed with high visual density so card registration stays prominent above the fold.
class LoginStreakCard extends StatefulWidget {
  const LoginStreakCard({
    super.key,
    required this.api,
    this.initialData,
    this.onClaimed,
    this.compact = false,
  });

  final ApiClient api;
  final Map<String, dynamic>? initialData;
  final bool compact;
  final VoidCallback? onClaimed;

  @override
  State<LoginStreakCard> createState() => _LoginStreakCardState();
}

class _LoginStreakCardState extends State<LoginStreakCard>
    with SingleTickerProviderStateMixin {
  Map<String, dynamic>? _data;
  bool _loading = true;
  bool _busy = false;
  bool _justClaimed = false;
  String? _error;

  late final AnimationController _loop = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 4000),
  )..repeat();

  @override
  void initState() {
    super.initState();
    if (widget.initialData != null && widget.initialData!['active'] == true) {
      _data = Map<String, dynamic>.from(widget.initialData!);
      _loading = false;
    } else {
      _load();
    }
  }

  @override
  void didUpdateWidget(covariant LoginStreakCard oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (_busy) return;
    final next = widget.initialData;
    if (next != null && next['active'] == true && !identical(next, oldWidget.initialData)) {
      _data = Map<String, dynamic>.from(next);
      _loading = false;
      _error = null;
    }
  }

  @override
  void dispose() {
    _loop.dispose();
    super.dispose();
  }

  int _int(dynamic value) => NumberParser.toInt(value);

  Future<void> _load() async {
    try {
      final response = await widget.api.get('/api/login-streak', fresh: true);
      if (!mounted) return;
      setState(() {
        _data = response is Map
            ? Map<String, dynamic>.from(response)
            : <String, dynamic>{};
        _error = null;
        _loading = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _error = apiError(error);
        _loading = false;
      });
    }
  }

  Future<void> _claim() async {
    if (_busy || _data?['claimedToday'] == true) return;
    setState(() => _busy = true);
    try {
      final response = await widget.api.post('/api/login-streak/claim', {});
      if (!mounted) return;
      final data = response is Map
          ? Map<String, dynamic>.from(response)
          : <String, dynamic>{};
      setState(() {
        _data = data;
        _justClaimed = true;
      });
      widget.onClaimed?.call();
      final reward = _int(data['claimedReward']);
      final message = data['message']?.toString() ??
          '${faNum(reward > 0 ? reward : 100)} امتیاز پاداش استریک دریافت شد!';
      ScaffoldMessenger.maybeOf(context)?.showSnackBar(SnackBar(
        content: Text(message, textAlign: TextAlign.center, style: const TextStyle(fontWeight: FontWeight.w800)),
        behavior: SnackBarBehavior.floating,
        backgroundColor: const Color(0xFF10B981),
      ));
      Future<void>.delayed(const Duration(milliseconds: 2500), () {
        if (mounted) setState(() => _justClaimed = false);
      });
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.maybeOf(context)?.showSnackBar(SnackBar(
        content: Text(apiError(error), textAlign: TextAlign.center),
        behavior: SnackBarBehavior.floating,
        backgroundColor: Theme.of(context).colorScheme.error,
      ));
      await _load();
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return widget.compact
          ? _CompactStreakLoading(loop: _loop)
          : _StreakSkeleton(loop: _loop);
    }

    if (_error != null || _data == null || _data!['active'] != true) {
      if (widget.compact) return _CompactStreakUnavailable(onRetry: _load);
      return const SizedBox.shrink();
    }

    final theme = Theme.of(context);
    final days = (_data!['rewards'] as List? ?? const [])
        .whereType<Map>()
        .map((item) => Map<String, dynamic>.from(item))
        .toList();
    // طولِ چرخه = تعدادِ ردیف‌هایِ پاداش که سرور فرستاده (adminOps →
    // `streak_settings.rewards`). چرا از همین‌جا و نه از یک عددِ ثابت:
    // «۷» قبلاً داخلِ رشتهٔ فارسی سفت شده بود، یعنی ادمین اگر چرخه را
    // ۵ یا ۱۰ روزه می‌کرد، نوارِ پیشرفت درست می‌شد ولی متن همچنان
    // «چرخه ۷ روزه» را نشان می‌داد. fallback همان ۷ است.
    final cycleDays = days.isNotEmpty ? days.length : 7;
    // سقفِ clamp هم باید با چرخه بیاید، نه با ۷: با چرخهٔ ۱۰ روزه،
    // `clamp(0, 7)` روزِ هشتم را می‌انداخت روی ۷ و نوارِ پیشرفت روی
    // «روز ۷ از ۱۰» گیر می‌کرد (همان باگِ نسخهٔ وبِ ما در دور ۳۴).
    final currentDay = _int(_data!['currentDay']).clamp(0, cycleDays).toInt();
    final nextDay = _int(_data!['nextDay']).clamp(1, cycleDays).toInt();
    final nextReward = _int(_data!['nextReward']);
    final claimedToday = _data!['claimedToday'] == true;
    final progressDay = claimedToday ? currentDay : math.max(0, nextDay - 1);
    // `/ cycleDays.toDouble()` عمدي است: در دارت تقسیمِ دو `int` نتیجه‌اش
    // `num` است و `clamp(0.0, 1.0)` هم `num` برمی‌گرداند، در حالی که
    // عرضِ نوار `double` می‌خواهد — همان چیزی که کامپایلر در فازِ build
    // می‌گیرد، نه در تحلیلِ ایستا.
    final progress = (progressDay / cycleDays.toDouble()).clamp(0.0, 1.0);

    return AnimatedBuilder(
      animation: _loop,
      builder: (context, _) {
        final t = _loop.value;
        final glow = (math.sin(t * math.pi * 2) + 1) / 2;

        return Container(
          clipBehavior: Clip.antiAlias,
          margin: const EdgeInsets.symmetric(vertical: 2),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(20),
            gradient: const LinearGradient(
              begin: Alignment.topRight,
              end: Alignment.bottomLeft,
              colors: [
                Color(0xFF142B52),
                Color(0xFF0F1F3B),
                Color(0xFF081220),
              ],
              stops: [0.0, 0.52, 1.0],
            ),
            border: Border.all(
              color: Color.lerp(
                const Color(0xFFFFD166).withValues(alpha: 0.38),
                BrandColors.emerald.withValues(alpha: 0.48),
                glow,
              )!,
              width: 1.2,
            ),
            boxShadow: [
              BoxShadow(
                color: const Color(0xFFFFB84D).withValues(alpha: 0.12 + glow * 0.06),
                blurRadius: 22,
                offset: const Offset(0, 8),
              ),
            ],
          ),
          child: Stack(
            children: [
              Positioned.fill(
                child: CustomPaint(
                  painter: _StreakParticlesPainter(
                    progress: t,
                    celebrate: _justClaimed,
                  ),
                ),
              ),
              Positioned(
                top: -45,
                right: -25,
                child: GlowOrb(
                  color: const Color(0xFFFFB84D).withValues(alpha: 0.30 + glow * 0.12),
                  size: 110,
                ),
              ),

              Padding(
                padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    // ── Header Row (Compact) ──
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.center,
                      children: [
                        ClipRRect(
                          borderRadius: BorderRadius.circular(10),
                          child: Image.asset(
                            'assets/pass/streak_hero.webp',
                            width: 38,
                            height: 38,
                            fit: BoxFit.cover,
                            cacheWidth: 120,
                            errorBuilder: (_, __, ___) => Container(
                              width: 38,
                              height: 38,
                              color: const Color(0xFFFFB84D).withValues(alpha: 0.2),
                              child: const Icon(Icons.local_fire_department_rounded, color: Color(0xFFFFD166), size: 22),
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  Text(
                                    'استریک روزانه',
                                    style: theme.textTheme.titleMedium?.copyWith(
                                      color: Colors.white,
                                      fontWeight: FontWeight.w900,
                                      fontSize: 14.5,
                                    ),
                                  ),
                                  const SizedBox(width: 6),
                                  Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                    decoration: BoxDecoration(
                                      borderRadius: Corners.rPill,
                                      color: (claimedToday ? BrandColors.success : const Color(0xFFFFB84D))
                                          .withValues(alpha: 0.16),
                                      border: Border.all(
                                        color: (claimedToday ? BrandColors.success : const Color(0xFFFFB84D))
                                            .withValues(alpha: 0.40),
                                      ),
                                    ),
                                    child: Text(
                                      claimedToday ? '✓ ثبت شد' : 'هدیه آماده',
                                      style: TextStyle(
                                        color: claimedToday ? const Color(0xFF34D399) : const Color(0xFFFFD166),
                                        fontSize: 9.5,
                                        fontWeight: FontWeight.w900,
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 1),
                              Text(
                                claimedToday
                                    // «۷» هم زنده است: چرخهٔ پاداشِ ورود
                                    // عددِ قابل‌تنظیمی است که قبلاً فقط داخل
                                    // رشتهٔ فارسی نوشته شده بود — یعنی
                                    // تغییرِ چرخه در پنل، متنِ اندروید را
                                    // دروغ‌گو می‌کرد.
                                    liveText(
                                        'streak.cycleDone',
                                        'چرخه ۷ روزه · امروز روز ${faNum(currentDay)} تکمیل شد',
                                        vars: {
                                          'days': cycleDays,
                                          'day': currentDay
                                        })
                                    : liveText(
                                        'streak.cycleNext',
                                        'چرخه ۷ روزه · روز ${faNum(nextDay)} · ${faNum(nextReward)} امتیاز هدیه',
                                        vars: {
                                          'days': cycleDays,
                                          'day': nextDay,
                                          'reward': nextReward
                                        }),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(
                                  color: Colors.white.withValues(alpha: 0.70),
                                  fontSize: 10.5,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(width: 6),
                        // Claim button right in header if ready, keeping height minimal!
                        SizedBox(
                          height: 34,
                          child: ElevatedButton(
                            onPressed: claimedToday || _busy ? null : _claim,
                            style: ElevatedButton.styleFrom(
                              // ⚠️ کمینه‌عرضِ صفر لازم است. پیش‌فرضِ تم
                              // `Size.fromHeight(52)` است که یعنی
                              // کمینه‌عرضِ **بی‌نهایت**؛ در این Row
                              // خطای «BoxConstraints forces an infinite
                              // width» می‌دهد و دکمه اصلاً رندر نمی‌شود.
                              // همان باگی که در پنلِ ماموریت‌ها بود.
                              minimumSize: const Size(0, 34),
                              maximumSize: const Size(double.infinity, 34),
                              tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                              visualDensity: VisualDensity.compact,
                              backgroundColor: const Color(0xFFFFB84D),
                              foregroundColor: const Color(0xFF25110A),
                              disabledBackgroundColor: Colors.white.withValues(alpha: 0.10),
                              disabledForegroundColor: Colors.white54,
                              elevation: claimedToday ? 0 : 4,
                              shadowColor: const Color(0xFFFFB84D).withValues(alpha: 0.4),
                              padding: const EdgeInsets.symmetric(horizontal: 12),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(10),
                                side: BorderSide(
                                  color: claimedToday ? Colors.transparent : Colors.white.withValues(alpha: 0.25),
                                  width: 1,
                                ),
                              ),
                            ),
                            child: _busy
                                ? const SizedBox(
                                    width: 14,
                                    height: 14,
                                    child: CircularProgressIndicator(
                                      strokeWidth: 2.0,
                                      valueColor: AlwaysStoppedAnimation<Color>(Color(0xFF25110A)),
                                    ),
                                  )
                                : Row(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      if (!claimedToday) ...[
                                        Image.asset(
                                          'assets/pass/cta_spark.webp',
                                          width: 14,
                                          height: 14,
                                          cacheWidth: 48,
                                          errorBuilder: (_, __, ___) => const Icon(Icons.bolt_rounded, size: 14),
                                        ),
                                        const SizedBox(width: 4),
                                      ],
                                      Text(
                                        claimedToday ? 'ثبت شد ✓' : 'دریافت',
                                        style: const TextStyle(
                                          fontWeight: FontWeight.w900,
                                          fontSize: 11.5,
                                        ),
                                      ),
                                    ],
                                  ),
                          ),
                        ),
                      ],
                    ),

                    const SizedBox(height: 8),

                    // ── گره‌های روزِ چرخه (Dense & Crisp) ──
                    //
                    // تعدادِ گره‌ها و پهنای‌شان از طولِ چرخه ساخته می‌شود،
                    // نه از عددِ ۷ِ سفت‌شده. دو باگِ واقعی این‌جا بود:
                    //   • با چرخهٔ ۱۰ روزه فقط ۷ گره رسم می‌شد و سه روزِ
                    //     جایزه‌دارِ آخر هیچ‌وقت دیده نمی‌شدند؛
                    //   • با چرخهٔ ۵ روزه هفت گره روی همان عرض پخش می‌شد و
                    //     دو گرهٔ آخر (فول‌بکِ ۱۰۰/۱۵۰/۲۰۰…) دادهٔ ساختگی
                    //     نشان می‌داد.
                    // با `cycleDays == 7` خروجی بایت‌به‌بایت همان امروز است:
                    // `6 * 4` همان `(7 - 1) * 4` و تقسیم بر همان ۷.
                    LayoutBuilder(
                      builder: (context, constraints) {
                        final nodeWidth =
                            (constraints.maxWidth - ((cycleDays - 1) * 4)) /
                            cycleDays.toDouble();
                        return Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            for (var i = 0; i < cycleDays; i++)
                              _StreakDayCard(
                                day: i + 1,
                                // `(100 + i * 50)`ِ قبلی یعنی اگر سرور
                                // ردیفی نفرستد، جایزهٔ **ساختگی** روی
                                // صفحه می‌آمد. حالا صفر است و ویجت خودش
                                // آن را ساکت می‌گذارد؛ دادهٔ جعلی از
                                // نبودِ داده بدتر است.
                                reward: days.length > i ? _int(days[i]['amount']) : 0,
                                claimed: days.length > i && days[i]['claimed'] == true,
                                current: days.length > i ? days[i]['current'] == true : (i + 1 == nextDay),
                                width: nodeWidth,
                                // «روزِ آخر» هم از طولِ چرخه می‌آید: با
                                // ۶ِ سفت‌شده، در چرخهٔ ۱۰ روزه جایزهٔ
                                // طلایی به روزِ هفتم چسبیده می‌ماند.
                                isLastDay: i == cycleDays - 1,
                                tick: t,
                              ),
                          ],
                        );
                      },
                    ),

                    const SizedBox(height: 6),

                    // ── Micro Progress Bar ──
                    ClipRRect(
                      borderRadius: Corners.rPill,
                      child: Stack(
                        children: [
                          Container(
                            height: 4,
                            color: Colors.white.withValues(alpha: 0.08),
                          ),
                          FractionallySizedBox(
                            widthFactor: progress.clamp(0.03, 1.0),
                            child: Container(
                              height: 4,
                              decoration: const BoxDecoration(
                                borderRadius: BorderRadius.all(Radius.circular(8)),
                                gradient: LinearGradient(
                                  colors: [
                                    Color(0xFFFFD166),
                                    Color(0xFF22E7A6),
                                    Color(0xFF38BDF8),
                                  ],
                                ),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

class _StreakDayCard extends StatelessWidget {
  const _StreakDayCard({
    required this.day,
    required this.reward,
    required this.claimed,
    required this.current,
    required this.width,
    required this.isLastDay,
    required this.tick,
  });

  final int day;
  final int reward;
  final bool claimed;
  final bool current;
  final double width;
  final bool isLastDay;
  final double tick;

  @override
  Widget build(BuildContext context) {
    final pulse = current ? 1.0 + math.sin(tick * math.pi * 2) * 0.04 : 1.0;

    Color bg;
    Color border;
    Widget icon;

    if (claimed) {
      bg = const Color(0xFF10B981).withValues(alpha: 0.20);
      border = const Color(0xFF10B981).withValues(alpha: 0.60);
      icon = const Icon(Icons.check_circle_rounded, size: 14, color: Color(0xFF34D399));
    } else if (current) {
      bg = const Color(0xFFFFB84D).withValues(alpha: 0.24);
      border = const Color(0xFFFFD166);
      icon = const Icon(Icons.local_fire_department_rounded, size: 14, color: Color(0xFFFFD166));
    } else {
      bg = Colors.white.withValues(alpha: 0.04);
      border = Colors.white.withValues(alpha: 0.10);
      icon = Icon(
        isLastDay ? Icons.emoji_events_rounded : Icons.lock_outline_rounded,
        size: 12,
        color: isLastDay ? const Color(0xFFFFD166).withValues(alpha: 0.6) : Colors.white30,
      );
    }

    return Transform.scale(
      scale: pulse,
      child: Container(
        width: width,
        height: 52,
        padding: const EdgeInsets.symmetric(vertical: 3, horizontal: 1),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(9),
          color: bg,
          border: Border.all(
            color: border,
            width: current ? 1.3 : 0.9,
          ),
          boxShadow: current
              ? [
                  BoxShadow(
                    color: const Color(0xFFFFB84D).withValues(alpha: 0.25),
                    blurRadius: 8,
                    offset: const Offset(0, 3),
                  ),
                ]
              : null,
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(
              'روز $day',
              style: TextStyle(
                color: current ? const Color(0xFFFFD166) : claimed ? const Color(0xFF34D399) : Colors.white54,
                fontSize: 8.5,
                fontWeight: FontWeight.w800,
                height: 1.0,
              ),
            ),
            icon,
            // صفر = هیچ. همان قراردادی که `coin-parity` برای سکه گذاشته:
            // «+۰» به کاربر می‌گوید چیزی خراب است، در حالی که فقط داده
            // نرسیده. قبلاً `100 + i * 50` جای خالی را پُر می‌کرد و گاهی
            // عددِ ساختگی روی کارت می‌آمد.
            Text(
              reward > 0 ? '+${faNum(reward)}' : '·',
              maxLines: 1,
              overflow: TextOverflow.fade,
              style: TextStyle(
                color: claimed
                    ? const Color(0xFF34D399)
                    : current
                        ? const Color(0xFFFFD166)
                        : Colors.white60,
                fontSize: 8,
                fontWeight: FontWeight.w900,
                height: 1.0,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _CompactStreakLoading extends StatelessWidget {
  const _CompactStreakLoading({required this.loop});
  final Animation<double> loop;

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: loop,
      builder: (context, _) {
        final shine = (math.sin(loop.value * math.pi * 2) + 1) / 2;
        final fill = Color.lerp(
          const Color(0xFF132B54).withValues(alpha: 0.5),
          const Color(0xFF1A3D73).withValues(alpha: 0.8),
          shine,
        )!;
        return Container(
          height: 80,
          margin: const EdgeInsets.symmetric(vertical: 2),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(20),
            color: fill,
            border: Border.all(color: Colors.white.withValues(alpha: 0.10)),
          ),
          child: const Center(
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.local_fire_department_rounded, color: Color(0xFFFFD166), size: 20),
                SizedBox(width: 6),
                Text(
                  'استریک ورود در حال آماده‌سازی است…',
                  style: TextStyle(color: Colors.white70, fontWeight: FontWeight.w700, fontSize: 12),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}

class _CompactStreakUnavailable extends StatelessWidget {
  const _CompactStreakUnavailable({required this.onRetry});
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 68,
      margin: const EdgeInsets.symmetric(vertical: 2),
      padding: const EdgeInsets.symmetric(horizontal: 14),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(18),
        color: const Color(0xFF132B54).withValues(alpha: 0.4),
        border: Border.all(color: Colors.white.withValues(alpha: 0.10)),
      ),
      child: Row(
        children: [
          const Icon(Icons.local_fire_department_rounded, color: Color(0xFFFFD166), size: 24),
          const SizedBox(width: 10),
          const Expanded(
            child: Text(
              'استریک روزانه',
              style: TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 13),
            ),
          ),
          TextButton.icon(
            onPressed: onRetry,
            icon: const Icon(Icons.refresh_rounded, size: 16),
            label: const Text('تلاش مجدد', style: TextStyle(fontSize: 12)),
          ),
        ],
      ),
    );
  }
}

class _StreakSkeleton extends StatelessWidget {
  const _StreakSkeleton({required this.loop});
  final Animation<double> loop;

  @override
  Widget build(BuildContext context) {
    return _CompactStreakLoading(loop: loop);
  }
}

class _StreakParticlesPainter extends CustomPainter {
  const _StreakParticlesPainter({required this.progress, required this.celebrate});

  final double progress;
  final bool celebrate;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()..style = PaintingStyle.fill;
    final center = Offset(size.width * 0.5, size.height * 0.4);
    final radius = math.min(size.width, size.height) * (celebrate ? 0.5 : 0.35);
    for (var i = 0; i < 16; i++) {
      final speed = i.isEven ? 1.0 : -0.8;
      final angle = i * 2.4 + progress * math.pi * 2 * speed;
      final r = radius * (0.3 + (i % 5) * 0.12);
      final p = center + Offset(math.cos(angle) * r, math.sin(angle) * r * 0.6);
      final a = (0.08 + (i % 4) * 0.04) * (celebrate ? 2.0 : 1.0);
      paint.color = (i % 2 == 0 ? const Color(0xFFFFD166) : BrandColors.emerald)
          .withValues(alpha: a.clamp(0.05, 0.4).toDouble());
      canvas.drawCircle(p, celebrate && i % 3 == 0 ? 2.2 : 1.3, paint);
    }
  }

  @override
  bool shouldRepaint(covariant _StreakParticlesPainter oldDelegate) =>
      oldDelegate.progress != progress || oldDelegate.celebrate != celebrate;
}
