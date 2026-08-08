import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/material.dart';

import '../../api_client.dart';
import '../../core/assets.dart';
import '../../theme/colors.dart';
import '../../theme/tokens.dart';

class LoginStreakCard extends StatefulWidget {
  const LoginStreakCard({
    super.key,
    required this.api,
    this.initialData,
    this.onClaimed,
    this.compact = false, // Ignored visually, we always render 2026 massive beautiful UI!
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
    duration: const Duration(milliseconds: 6000),
  )..repeat();

  @override
  void initState() {
    super.initState();
    if (widget.initialData != null) {
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
    if (next != null && !identical(next, oldWidget.initialData)) {
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
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final response = await widget.api.get('/api/login-streak', fresh: true);
      if (!mounted) return;
      setState(() {
        _data = response is Map ? Map<String, dynamic>.from(response) : <String, dynamic>{};
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
      final data = response is Map ? Map<String, dynamic>.from(response) : <String, dynamic>{};
      setState(() {
        _data = data;
        _justClaimed = data['claimedNow'] == true;
      });
      widget.onClaimed?.call();
      final message = data['message']?.toString() ?? '${faNum(_int(data['claimedReward']))} امتیاز دریافت شد';
      ScaffoldMessenger.maybeOf(context)?.showSnackBar(SnackBar(
        content: Text(message, textAlign: TextAlign.center, style: const TextStyle(fontWeight: FontWeight.w800)),
        behavior: SnackBarBehavior.floating,
        backgroundColor: BrandColors.success,
        shape: RoundedRectangleBorder(borderRadius: Corners.rXl),
      ));
      if (_justClaimed) {
        Future<void>.delayed(const Duration(milliseconds: 2500), () {
          if (mounted) setState(() => _justClaimed = false);
        });
      }
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.maybeOf(context)?.showSnackBar(SnackBar(
        content: Text(apiError(error), textAlign: TextAlign.center),
        behavior: SnackBarBehavior.floating,
        backgroundColor: BrandColors.danger,
      ));
      await _load();
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return widget.compact ? _CompactStreakLoading(loop: _loop) : _StreakSkeleton(loop: _loop);
    }

    if (_error != null || _data == null || _data!['active'] != true) {
      if (widget.compact) return _CompactStreakUnavailable(onRetry: _load);
      return _ErrorStreakCard(loop: _loop, onRetry: _load, error: _error ?? 'استریک در دسترس نیست');
    }

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
    final progress = (progressDay / 7).clamp(0.0, 1.0).toDouble();

    return _StunningStreakCard(
      loop: _loop,
      days: days,
      currentDay: currentDay,
      nextDay: nextDay,
      nextReward: nextReward,
      totalClaims: totalClaims,
      claimedToday: claimedToday,
      progress: progress,
      busy: _busy,
      justClaimed: _justClaimed,
      onClaim: claimedToday || _busy ? null : _claim,
    );
  }
}

class _StunningStreakCard extends StatelessWidget {
  const _StunningStreakCard({
    required this.loop,
    required this.days,
    required this.currentDay,
    required this.nextDay,
    required this.nextReward,
    required this.totalClaims,
    required this.claimedToday,
    required this.progress,
    required this.busy,
    required this.justClaimed,
    required this.onClaim,
  });

  final Animation<double> loop;
  final List<Map<String, dynamic>> days;
  final int currentDay, nextDay, nextReward, totalClaims;
  final bool claimedToday, busy, justClaimed;
  final double progress;
  final VoidCallback? onClaim;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return AnimatedBuilder(
      animation: loop,
      builder: (context, _) {
        final t = loop.value;
        final floatY = math.sin(t * math.pi * 2) * 6;
        final glow = (math.sin(t * math.pi * 2) + 1) / 2;
        
        return RepaintBoundary(
          child: Container(
            margin: const EdgeInsets.symmetric(vertical: 4),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(32),
              image: const DecorationImage(
                image: AssetImage('assets/pass/streak_bg_2026.png'),
                fit: BoxFit.cover,
                opacity: 0.85,
              ),
              border: Border.all(
                color: Color.lerp(
                  BrandColors.amber.withValues(alpha: 0.4),
                  BrandColors.emerald.withValues(alpha: 0.6),
                  glow,
                )!,
                width: 1.5,
              ),
              boxShadow: [
                BoxShadow(
                  color: BrandColors.emerald.withValues(alpha: 0.15 + glow * 0.1),
                  blurRadius: 40,
                  offset: const Offset(0, 15),
                ),
              ],
            ),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(32),
              child: BackdropFilter(
                filter: ui.ImageFilter.blur(sigmaX: 10, sigmaY: 10),
                child: Container(
                  color: Colors.black.withValues(alpha: 0.3),
                  padding: const EdgeInsets.all(20),
                  child: Stack(
                    clipBehavior: Clip.none,
                    children: [
                      // Animated Particles
                      Positioned.fill(
                        child: CustomPaint(
                          painter: _StreakParticlesPainter(progress: t, celebrate: justClaimed),
                        ),
                      ),
                      
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Container(
                                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                                      decoration: BoxDecoration(
                                        borderRadius: Corners.rPill,
                                        gradient: LinearGradient(
                                          colors: claimedToday
                                              ? [BrandColors.success.withValues(alpha: 0.2), BrandColors.success.withValues(alpha: 0.05)]
                                              : [BrandColors.amber.withValues(alpha: 0.2), BrandColors.amber.withValues(alpha: 0.05)],
                                        ),
                                        border: Border.all(
                                          color: claimedToday ? BrandColors.success.withValues(alpha: 0.5) : BrandColors.amber.withValues(alpha: 0.5),
                                        ),
                                      ),
                                      child: Row(
                                        mainAxisSize: MainAxisSize.min,
                                        children: [
                                          Icon(
                                            claimedToday ? Icons.check_circle : Icons.local_fire_department,
                                            color: claimedToday ? BrandColors.success : BrandColors.amber,
                                            size: 14,
                                          ),
                                          const SizedBox(width: 6),
                                          Text(
                                            claimedToday ? 'محفوظ شد' : 'آماده دریافت',
                                            style: TextStyle(
                                              color: claimedToday ? BrandColors.success : BrandColors.amber,
                                              fontSize: 12,
                                              fontWeight: FontWeight.w900,
                                            ),
                                          ),
                                        ],
                                      ),
                                    ),
                                    const SizedBox(height: 12),
                                    Text(
                                      'استریک ورود ۷ روزه',
                                      style: theme.textTheme.titleLarge?.copyWith(
                                        color: Colors.white,
                                        fontWeight: FontWeight.w900,
                                        letterSpacing: -0.5,
                                      ),
                                    ),
                                    const SizedBox(height: 6),
                                    Text(
                                      '${faNum(totalClaims)} بار دریافت موفق داشته‌اید.',
                                      style: TextStyle(color: Colors.white.withValues(alpha: 0.7), fontSize: 13),
                                    ),
                                  ],
                                ),
                              ),
                              
                              Transform.translate(
                                offset: Offset(0, floatY),
                                child: Image.asset(
                                  'assets/pass/streak_hero.webp',
                                  width: 80,
                                  height: 80, cacheWidth: 200,
                                ),
                              ),
                            ],
                          ),
                          
                          const SizedBox(height: 24),
                          
                          // Days Rail
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: days.map((dayData) {
                              final d = NumberParser.toInt(dayData['day']);
                              final r = NumberParser.toInt(dayData['amount']);
                              final c = dayData['claimed'] == true;
                              final cur = dayData['current'] == true;
                              return _DayPill(day: d, reward: r, claimed: c, current: cur, tick: t);
                            }).toList(),
                          ),
                          
                          const SizedBox(height: 24),
                          
                          // Bottom Actions
                          Row(
                            children: [
                              Expanded(
                                child: _RewardInfo(
                                  claimedToday: claimedToday,
                                  currentDay: currentDay,
                                  nextDay: nextDay,
                                  nextReward: nextReward,
                                ),
                              ),
                              const SizedBox(width: 16),
                              _ClaimBtn(
                                busy: busy,
                                claimedToday: claimedToday,
                                onPressed: onClaim,
                                glow: glow,
                              ),
                            ],
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        );
      },
    );
  }
}

class _DayPill extends StatelessWidget {
  const _DayPill({required this.day, required this.reward, required this.claimed, required this.current, required this.tick});
  final int day, reward;
  final bool claimed, current;
  final double tick;

  @override
  Widget build(BuildContext context) {
    final color = claimed ? BrandColors.success : (current ? BrandColors.amber : Colors.white54);
    final scale = current ? 1.05 + math.sin(tick * math.pi * 2) * 0.05 : 1.0;
    
    return Transform.scale(
      scale: scale,
      child: Container(
        width: 42,
        height: 60,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(14),
          color: color.withValues(alpha: current ? 0.2 : claimed ? 0.1 : 0.05),
          border: Border.all(color: color.withValues(alpha: current ? 0.8 : claimed ? 0.4 : 0.1), width: current ? 1.5 : 1),
          boxShadow: current ? [BoxShadow(color: color.withValues(alpha: 0.3), blurRadius: 12)] : null,
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(claimed ? Icons.check_rounded : (current ? Icons.local_fire_department_rounded : Icons.calendar_today_rounded),
                 size: 14, color: color),
            const SizedBox(height: 4),
            Text(faNum(day), style: TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w900)),
            const SizedBox(height: 2),
            Text('+${faNum(reward)}', style: TextStyle(color: color, fontSize: 9, fontWeight: FontWeight.w800)),
          ],
        ),
      ),
    );
  }
}

class _RewardInfo extends StatelessWidget {
  const _RewardInfo({required this.claimedToday, required this.currentDay, required this.nextDay, required this.nextReward});
  final bool claimedToday;
  final int currentDay, nextDay, nextReward;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
      decoration: BoxDecoration(
        color: Colors.black.withValues(alpha: 0.4),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.white.withValues(alpha: 0.1)),
      ),
      child: Row(
        children: [
          Icon(Icons.auto_awesome, color: BrandColors.amber, size: 18),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              claimedToday ? 'روز ${faNum(currentDay)} از ۷ تکمیل شد' : 'فردا: ${faNum(nextReward)} امتیاز ویژه',
              style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w800),
            ),
          ),
        ],
      ),
    );
  }
}

class _ClaimBtn extends StatelessWidget {
  const _ClaimBtn({required this.busy, required this.claimedToday, required this.onPressed, required this.glow});
  final bool busy, claimedToday;
  final VoidCallback? onPressed;
  final double glow;

  @override
  Widget build(BuildContext context) {
    final enabled = onPressed != null;
    return GestureDetector(
      onTap: onPressed,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 300),
        height: 48,
        padding: const EdgeInsets.symmetric(horizontal: 24),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(16),
          gradient: enabled
              ? LinearGradient(colors: [BrandColors.amber, Color(0xFFFF7A45)])
              : null,
          color: enabled ? null : Colors.white.withValues(alpha: 0.1),
          boxShadow: enabled ? [BoxShadow(color: BrandColors.amber.withValues(alpha: 0.4 + glow * 0.2), blurRadius: 20, offset: const Offset(0, 8))] : null,
        ),
        child: Center(
          child: busy
              ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2.5))
              : Text(
                  claimedToday ? 'دریافت شد' : 'دریافت پاداش',
                  style: TextStyle(
                    color: enabled ? Colors.black : Colors.white54,
                    fontWeight: FontWeight.w900,
                    fontSize: 14,
                  ),
                ),
        ),
      ),
    );
  }
}

class _CompactStreakLoading extends StatelessWidget {
  const _CompactStreakLoading({required this.loop}); final Animation<double> loop;
  @override Widget build(BuildContext context) => AnimatedBuilder(animation: loop, builder: (context, _) => Container(
    margin: const EdgeInsets.symmetric(vertical: 4), padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 16),
    decoration: BoxDecoration(borderRadius: BorderRadius.circular(24), gradient: LinearGradient(colors: [BrandColors.emerald.withValues(alpha: .22), BrandColors.blue.withValues(alpha: .12)]), border: Border.all(color: BrandColors.emerald.withValues(alpha: .35))),
    child: Row(children: [Transform.rotate(angle: loop.value * math.pi * 2, child: const Icon(Icons.local_fire_department_rounded, color: BrandColors.amber, size: 30)), Gaps.hSm, const Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text('استریک روزانه', style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w900)), SizedBox(height: 3), Text('در حال آماده‌سازی چرخه ۷ روزه…', style: TextStyle(color: Colors.white70, fontSize: 12))]))]),
  ));
}
class _CompactStreakUnavailable extends StatelessWidget {
  const _CompactStreakUnavailable({required this.onRetry}); final VoidCallback onRetry;
  @override Widget build(BuildContext context) => InkWell(onTap: onRetry, borderRadius: BorderRadius.circular(24), child: Container(
    margin: const EdgeInsets.symmetric(vertical: 4), padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 15),
    decoration: BoxDecoration(borderRadius: BorderRadius.circular(24), color: const Color(0xFF132B35), border: Border.all(color: BrandColors.amber.withValues(alpha: .45))),
    child: const Row(children: [Icon(Icons.local_fire_department_rounded, color: BrandColors.amber, size: 30), Gaps.hSm, Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text('استریک روزانه', style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w900)), SizedBox(height: 3), Text('برای دریافت پاداش، دوباره تلاش کنید', style: TextStyle(color: Colors.white70, fontSize: 12))])), Icon(Icons.refresh_rounded, color: Colors.white70)]),
  ));
}

class _ErrorStreakCard extends StatelessWidget {
  const _ErrorStreakCard({required this.loop, required this.onRetry, required this.error});
  final Animation<double> loop;
  final VoidCallback onRetry;
  final String error;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onRetry,
      child: Container(
        margin: const EdgeInsets.symmetric(vertical: 4),
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(32),
          color: BrandColors.danger.withValues(alpha: 0.1),
          border: Border.all(color: BrandColors.danger.withValues(alpha: 0.3), width: 1.5),
        ),
        child: Row(
          children: [
            Icon(Icons.error_outline_rounded, color: BrandColors.danger, size: 32),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('استریک در دسترس نیست', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                  Text('برای تلاش مجدد ضربه بزنید', style: TextStyle(color: Colors.white70, fontSize: 12)),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _StreakSkeleton extends StatelessWidget {
  const _StreakSkeleton({required this.loop});
  final Animation<double> loop;

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: loop,
      builder: (context, _) {
        final shimmer = (math.sin(loop.value * math.pi * 2) + 1) / 2;
        return Container(
          height: 200,
          margin: const EdgeInsets.symmetric(vertical: 4),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(32),
            color: Colors.white.withValues(alpha: 0.05 + shimmer * 0.05),
            border: Border.all(color: Colors.white.withValues(alpha: 0.1)),
          ),
          child: const Center(child: CircularProgressIndicator(color: Colors.white24)),
        );
      },
    );
  }
}

class _StreakParticlesPainter extends CustomPainter {
  const _StreakParticlesPainter({required this.progress, required this.celebrate});
  final double progress;
  final bool celebrate;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()..style = PaintingStyle.fill;
    final center = Offset(size.width * 0.8, size.height * 0.2);
    final radius = math.min(size.width, size.height) * (celebrate ? 0.6 : 0.4);
    for (var i = 0; i < 20; i++) {
      final angle = i * 2.4 + progress * math.pi * 2;
      final r = radius * (0.3 + (i % 5) * 0.1);
      final p = center + Offset(math.cos(angle) * r, math.sin(angle) * r * 0.8);
      paint.color = BrandColors.amber.withValues(alpha: (0.1 + (i % 3) * 0.1) * (celebrate ? 2.0 : 1.0));
      canvas.drawCircle(p, celebrate ? 3.0 : 1.5, paint);
    }
  }

  @override
  bool shouldRepaint(covariant _StreakParticlesPainter oldDelegate) => true;
}
