import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../api_client.dart';
import '../../core/assets.dart';
import '../../theme/colors.dart';
import '../../theme/tokens.dart';
import '../../widgets/gradient_panel.dart';

/// Premium seven-day login streak card for the user dashboard.
///
/// Fully responsive, highly visible, and styled with high-end 2026 gaming aesthetics.
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
    duration: const Duration(milliseconds: 4800),
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
    final currentDay = _int(_data!['currentDay']).clamp(0, 7).toInt();
    final nextDay = _int(_data!['nextDay']).clamp(1, 7).toInt();
    final nextReward = _int(_data!['nextReward']);
    final totalClaims = _int(_data!['totalClaims']);
    final claimedToday = _data!['claimedToday'] == true;
    final progressDay = claimedToday ? currentDay : math.max(0, nextDay - 1);
    final progress = (progressDay / 7.0).clamp(0.0, 1.0);

    return AnimatedBuilder(
      animation: _loop,
      builder: (context, _) {
        final t = _loop.value;
        final glow = (math.sin(t * math.pi * 2) + 1) / 2;

        return Container(
          clipBehavior: Clip.antiAlias,
          margin: const EdgeInsets.symmetric(vertical: 4),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(26),
            gradient: const LinearGradient(
              begin: Alignment.topRight,
              end: Alignment.bottomLeft,
              colors: [
                Color(0xFF152E58),
                Color(0xFF10203C),
                Color(0xFF081322),
              ],
              stops: [0.0, 0.52, 1.0],
            ),
            border: Border.all(
              color: Color.lerp(
                const Color(0xFFFFD166).withValues(alpha: 0.42),
                BrandColors.emerald.withValues(alpha: 0.52),
                glow,
              )!,
              width: 1.3,
            ),
            boxShadow: [
              BoxShadow(
                color: const Color(0xFFFFB84D).withValues(alpha: 0.14 + glow * 0.08),
                blurRadius: 30,
                offset: const Offset(0, 12),
              ),
              BoxShadow(
                color: BrandColors.emerald.withValues(alpha: 0.10),
                blurRadius: 36,
                offset: const Offset(0, 18),
              ),
            ],
          ),
          child: Stack(
            children: [
              // Particles and ambient background
              Positioned.fill(
                child: CustomPaint(
                  painter: _StreakParticlesPainter(
                    progress: t,
                    celebrate: _justClaimed,
                  ),
                ),
              ),
              Positioned(
                top: -55,
                right: -35,
                child: GlowOrb(
                  color: const Color(0xFFFFB84D).withValues(alpha: 0.35 + glow * 0.15),
                  size: 150,
                ),
              ),
              Positioned(
                bottom: -55,
                left: -35,
                child: GlowOrb(
                  color: BrandColors.emerald.withValues(alpha: 0.30),
                  size: 150,
                ),
              ),

              Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    // ── Header Row ──
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.center,
                      children: [
                        ClipRRect(
                          borderRadius: BorderRadius.circular(14),
                          child: Image.asset(
                            'assets/pass/streak_hero.webp',
                            width: 52,
                            height: 52,
                            fit: BoxFit.cover,
                            cacheWidth: 160,
                            errorBuilder: (_, __, ___) => Container(
                              width: 52,
                              height: 52,
                              color: const Color(0xFFFFB84D).withValues(alpha: 0.2),
                              child: const Icon(Icons.local_fire_department_rounded, color: Color(0xFFFFD166), size: 28),
                            ),
                          ),
                        ),
                        const SizedBox(width: 12),
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
                                      fontSize: 16,
                                    ),
                                  ),
                                  const SizedBox(width: 8),
                                  Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                                    decoration: BoxDecoration(
                                      borderRadius: Corners.rPill,
                                      color: (claimedToday ? BrandColors.success : const Color(0xFFFFB84D))
                                          .withValues(alpha: 0.18),
                                      border: Border.all(
                                        color: (claimedToday ? BrandColors.success : const Color(0xFFFFB84D))
                                            .withValues(alpha: 0.45),
                                      ),
                                    ),
                                    child: Text(
                                      claimedToday ? '✓ ذخیره شد' : '🔥 هدیه امروز آماده',
                                      style: TextStyle(
                                        color: claimedToday ? const Color(0xFF34D399) : const Color(0xFFFFD166),
                                        fontSize: 10.5,
                                        fontWeight: FontWeight.w900,
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 3),
                              Text(
                                claimedToday
                                    ? 'چرخه ۷ روزه · امروز روز ${faNum(currentDay)} تکمیل شد'
                                    : 'چرخه ۷ روزه · روز ${faNum(nextDay)} · ${faNum(nextReward)} امتیاز هدیه',
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(
                                  color: Colors.white.withValues(alpha: 0.74),
                                  fontSize: 11.5,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),

                    const SizedBox(height: 14),

                    // ── 7-Day Interactive Nodes ──
                    LayoutBuilder(
                      builder: (context, constraints) {
                        final nodeWidth = (constraints.maxWidth - (6 * 5)) / 7;
                        return Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            for (var i = 0; i < 7; i++)
                              _StreakDayCard(
                                day: i + 1,
                                reward: days.length > i ? _int(days[i]['amount']) : (100 + i * 50),
                                claimed: days.length > i && days[i]['claimed'] == true,
                                current: days.length > i ? days[i]['current'] == true : (i + 1 == nextDay),
                                width: nodeWidth,
                                isLastDay: i == 6,
                                tick: t,
                              ),
                          ],
                        );
                      },
                    ),

                    const SizedBox(height: 14),

                    // ── Progress Bar & Summary ──
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Text(
                              'پیشرفت چرخه هفتگی: ${faNum(progressDay)} از ۷ روز',
                              style: TextStyle(
                                color: Colors.white.withValues(alpha: 0.78),
                                fontSize: 11.5,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                            Text(
                              '${faNum((progress * 100).round())}٪',
                              style: const TextStyle(
                                color: Color(0xFF34D399),
                                fontSize: 12,
                                fontWeight: FontWeight.w900,
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 6),
                        ClipRRect(
                          borderRadius: Corners.rPill,
                          child: Stack(
                            children: [
                              Container(
                                height: 7,
                                color: Colors.white.withValues(alpha: 0.10),
                              ),
                              FractionallySizedBox(
                                widthFactor: progress.clamp(0.03, 1.0),
                                child: Container(
                                  height: 7,
                                  decoration: const BoxDecoration(
                                    borderRadius: BorderRadius.all(Radius.circular(10)),
                                    gradient: LinearGradient(
                                      colors: [
                                        Color(0xFFFFD166),
                                        Color(0xFF22E7A6),
                                        Color(0xFF38BDF8),
                                      ],
                                    ),
                                    boxShadow: [
                                      BoxShadow(
                                        color: Color(0xFF22E7A6),
                                        blurRadius: 8,
                                      ),
                                    ],
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),

                    const SizedBox(height: 14),

                    // ── Action Row ──
                    Row(
                      children: [
                        Expanded(
                          child: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                            decoration: BoxDecoration(
                              borderRadius: Corners.rMd,
                              color: Colors.white.withValues(alpha: 0.06),
                              border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
                            ),
                            child: Row(
                              children: [
                                const Icon(Icons.card_giftcard_rounded, color: Color(0xFFFFD166), size: 18),
                                const SizedBox(width: 6),
                                Expanded(
                                  child: Text(
                                    claimedToday
                                        ? 'روز ${faNum(currentDay)} دریافت شد · مجموع ${faNum(totalClaims)} بار'
                                        : 'پاداش امروز: ${faNum(nextReward)} امتیاز هدیه',
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: TextStyle(
                                      color: Colors.white.withValues(alpha: 0.88),
                                      fontSize: 11.5,
                                      fontWeight: FontWeight.w800,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                        const SizedBox(width: 10),
                        SizedBox(
                          height: 42,
                          child: ElevatedButton(
                            onPressed: claimedToday || _busy ? null : _claim,
                            style: ElevatedButton.styleFrom(
                              backgroundColor: const Color(0xFFFFB84D),
                              foregroundColor: const Color(0xFF25110A),
                              disabledBackgroundColor: Colors.white.withValues(alpha: 0.12),
                              disabledForegroundColor: Colors.white54,
                              elevation: claimedToday ? 0 : 6,
                              shadowColor: const Color(0xFFFFB84D).withValues(alpha: 0.5),
                              padding: const EdgeInsets.symmetric(horizontal: 16),
                              shape: RoundedRectangleBorder(
                                borderRadius: Corners.rLg,
                                side: BorderSide(
                                  color: claimedToday ? Colors.transparent : Colors.white.withValues(alpha: 0.3),
                                  width: 1,
                                ),
                              ),
                            ),
                            child: _busy
                                ? const SizedBox(
                                    width: 18,
                                    height: 18,
                                    child: CircularProgressIndicator(
                                      strokeWidth: 2.2,
                                      valueColor: AlwaysStoppedAnimation<Color>(Color(0xFF25110A)),
                                    ),
                                  )
                                : Row(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      if (!claimedToday) ...[
                                        Image.asset(
                                          'assets/pass/cta_spark.png',
                                          width: 18,
                                          height: 18,
                                          cacheWidth: 64,
                                          errorBuilder: (_, __, ___) => const Icon(Icons.bolt_rounded, size: 18),
                                        ),
                                        const SizedBox(width: 5),
                                      ],
                                      Text(
                                        claimedToday ? 'دریافت شد ✓' : 'دریافت پاداش',
                                        style: const TextStyle(
                                          fontWeight: FontWeight.w900,
                                          fontSize: 13,
                                        ),
                                      ),
                                    ],
                                  ),
                          ),
                        ),
                      ],
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
      icon = const Icon(Icons.check_circle_rounded, size: 16, color: Color(0xFF34D399));
    } else if (current) {
      bg = const Color(0xFFFFB84D).withValues(alpha: 0.24);
      border = const Color(0xFFFFD166);
      icon = const Icon(Icons.local_fire_department_rounded, size: 16, color: Color(0xFFFFD166));
    } else {
      bg = Colors.white.withValues(alpha: 0.05);
      border = Colors.white.withValues(alpha: 0.12);
      icon = Icon(
        isLastDay ? Icons.emoji_events_rounded : Icons.lock_outline_rounded,
        size: 14,
        color: isLastDay ? const Color(0xFFFFD166).withValues(alpha: 0.6) : Colors.white38,
      );
    }

    return Transform.scale(
      scale: pulse,
      child: Container(
        width: width,
        height: 66,
        padding: const EdgeInsets.symmetric(vertical: 5, horizontal: 2),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(12),
          color: bg,
          border: Border.all(
            color: border,
            width: current ? 1.5 : 1.0,
          ),
          boxShadow: current
              ? [
                  BoxShadow(
                    color: const Color(0xFFFFB84D).withValues(alpha: 0.30),
                    blurRadius: 10,
                    offset: const Offset(0, 4),
                  ),
                ]
              : isLastDay && !claimed
                  ? [
                      BoxShadow(
                        color: const Color(0xFFFFD166).withValues(alpha: 0.12),
                        blurRadius: 8,
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
                color: current ? const Color(0xFFFFD166) : claimed ? const Color(0xFF34D399) : Colors.white60,
                fontSize: 9.5,
                fontWeight: FontWeight.w800,
                height: 1.0,
              ),
            ),
            icon,
            Text(
              '+${faNum(reward)}',
              maxLines: 1,
              overflow: TextOverflow.fade,
              style: TextStyle(
                color: claimed
                    ? const Color(0xFF34D399)
                    : current
                        ? const Color(0xFFFFD166)
                        : Colors.white70,
                fontSize: 9,
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
          height: 100,
          margin: const EdgeInsets.symmetric(vertical: 4),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(24),
            color: fill,
            border: Border.all(color: Colors.white.withValues(alpha: 0.10)),
          ),
          child: const Center(
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.local_fire_department_rounded, color: Color(0xFFFFD166)),
                SizedBox(width: 8),
                Text(
                  'استریک ورود در حال آماده‌سازی است…',
                  style: TextStyle(color: Colors.white70, fontWeight: FontWeight.w700),
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
      height: 90,
      margin: const EdgeInsets.symmetric(vertical: 4),
      padding: const EdgeInsets.symmetric(horizontal: 16),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(20),
        color: const Color(0xFF132B54).withValues(alpha: 0.4),
        border: Border.all(color: Colors.white.withValues(alpha: 0.10)),
      ),
      child: Row(
        children: [
          const Icon(Icons.local_fire_department_rounded, color: Color(0xFFFFD166), size: 28),
          const SizedBox(width: 12),
          const Expanded(
            child: Text(
              'استریک روزانه',
              style: TextStyle(color: Colors.white, fontWeight: FontWeight.w800),
            ),
          ),
          TextButton.icon(
            onPressed: onRetry,
            icon: const Icon(Icons.refresh_rounded, size: 18),
            label: const Text('تلاش مجدد'),
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
    for (var i = 0; i < 20; i++) {
      final speed = i.isEven ? 1.0 : -0.8;
      final angle = i * 2.4 + progress * math.pi * 2 * speed;
      final r = radius * (0.3 + (i % 6) * 0.12);
      final p = center + Offset(math.cos(angle) * r, math.sin(angle) * r * 0.6);
      final a = (0.08 + (i % 4) * 0.04) * (celebrate ? 2.0 : 1.0);
      paint.color = (i % 2 == 0 ? const Color(0xFFFFD166) : BrandColors.emerald)
          .withValues(alpha: a.clamp(0.05, 0.4).toDouble());
      canvas.drawCircle(p, celebrate && i % 3 == 0 ? 2.5 : 1.5, paint);
    }
  }

  @override
  bool shouldRepaint(covariant _StreakParticlesPainter oldDelegate) =>
      oldDelegate.progress != progress || oldDelegate.celebrate != celebrate;
}
