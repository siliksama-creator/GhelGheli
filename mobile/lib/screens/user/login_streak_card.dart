import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../api_client.dart';
import '../../core/assets.dart';
import '../../theme/brand_theme.dart';
import '../../theme/colors.dart';
import '../../theme/tokens.dart';
import '../../widgets/gradient_panel.dart';

/// Premium seven-day login streak card for the user dashboard.
///
/// Claiming stays explicit: opening the dashboard only loads status; points are
/// awarded once after the user taps the button. The card now accepts the
/// bootstrap copy of the status so the dashboard does not need an extra round
/// trip just to draw the first frame.
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

  /// Dense dashboard mode: keeps the claim button, progress and seven-day
  /// state visible above the fold instead of pushing card registration down.
  final bool compact;

  /// Called after a successful claim so the dashboard header/point balance can
  /// refresh immediately. The old card updated only itself; the visible points
  /// total above it stayed stale until a manual refresh.
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
    duration: const Duration(milliseconds: 5200),
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
        _justClaimed = data['claimedNow'] == true;
      });
      widget.onClaimed?.call();
      final message = data['message']?.toString() ??
          '${faNum(_int(data['claimedReward']))} امتیاز دریافت شد';
      ScaffoldMessenger.maybeOf(context)?.showSnackBar(SnackBar(
        content: Text(message, textAlign: TextAlign.center),
        behavior: SnackBarBehavior.floating,
        backgroundColor: const Color(0xFF1C8B67),
      ));
      if (_justClaimed) {
        Future<void>.delayed(const Duration(milliseconds: 1500), () {
          if (mounted) setState(() => _justClaimed = false);
        });
      }
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
    if (_loading) return _StreakSkeleton(loop: _loop);

    if (_error != null || _data == null || _data!['active'] != true) {
      return const SizedBox.shrink();
    }

    final theme = Theme.of(context);
    final brand = context.brand;
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
    final width = MediaQuery.sizeOf(context).width;
    final compact = width < 390;

    if (widget.compact) {
      return _CompactStreakSurface(
        loop: _loop,
        days: days,
        currentDay: currentDay,
        nextDay: nextDay,
        nextReward: nextReward,
        totalClaims: totalClaims,
        claimedToday: claimedToday,
        progress: progress,
        busy: _busy,
        onClaim: claimedToday || _busy ? null : _claim,
      );
    }

    return AnimatedBuilder(
      animation: _loop,
      builder: (context, _) {
        final t = _loop.value;
        final breathe = 1 + math.sin(t * math.pi * 2) * 0.025;
        final glow = (math.sin(t * math.pi * 2) + 1) / 2;
        return Container(
          clipBehavior: Clip.antiAlias,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(30),
            gradient: const LinearGradient(
              begin: Alignment.topRight,
              end: Alignment.bottomLeft,
              colors: [
                Color(0xFF142B56),
                Color(0xFF151638),
                Color(0xFF06111F),
              ],
              stops: [0.0, 0.52, 1.0],
            ),
            border: Border.all(
              color: Color.lerp(
                const Color(0xFFFFD166).withValues(alpha: 0.36),
                BrandColors.emerald.withValues(alpha: 0.46),
                glow,
              )!,
            ),
            boxShadow: [
              BoxShadow(
                color: const Color(0xFFFFB84D).withValues(alpha: 0.12 + glow * 0.06),
                blurRadius: 36,
                offset: const Offset(0, 18),
              ),
              BoxShadow(
                color: BrandColors.emerald.withValues(alpha: 0.09),
                blurRadius: 44,
                offset: const Offset(0, 24),
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
                top: -64,
                right: -36,
                child: GlowOrb(
                  color: BrandColors.emerald.withValues(alpha: 0.72),
                  size: 150,
                ),
              ),
              Positioned(
                bottom: -74,
                left: -44,
                child: GlowOrb(
                  color: BrandColors.blue.withValues(alpha: 0.70),
                  size: 170,
                ),
              ),
              Padding(
                padding: EdgeInsets.fromLTRB(
                  compact ? Gaps.md : Gaps.lg,
                  compact ? Gaps.md : Gaps.lg,
                  compact ? Gaps.md : Gaps.lg,
                  Gaps.md,
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Wrap(
                                spacing: 7,
                                runSpacing: 7,
                                crossAxisAlignment: WrapCrossAlignment.center,
                                children: [
                                  _StatusChip(
                                    claimedToday: claimedToday,
                                    canClaim: !claimedToday,
                                  ),
                                  _TinyMetric(
                                    icon: Icons.local_fire_department_rounded,
                                    text: '${faNum(totalClaims)} دریافت',
                                  ),
                                ],
                              ),
                              Gaps.vSm,
                              Text(
                                'استریک ورود ۷ روزه',
                                style: theme.textTheme.titleLarge?.copyWith(
                                  color: Colors.white,
                                  fontWeight: FontWeight.w900,
                                  height: 1.1,
                                ),
                              ),
                              Gaps.vXxs,
                              Text(
                                claimedToday
                                    ? 'امروز ذخیره شد؛ فردا زنجیره را ادامه بده و جایزهٔ بزرگ‌تر بگیر.'
                                    : 'زنجیره‌ات آماده است؛ امروز را قفل کن و امتیاز فوری بگیر.',
                                maxLines: compact ? 3 : 2,
                                overflow: TextOverflow.ellipsis,
                                style: theme.textTheme.bodySmall?.copyWith(
                                  color: Colors.white.withValues(alpha: 0.76),
                                  height: 1.55,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ],
                          ),
                        ),
                        Gaps.hSm,
                        Transform.scale(
                          scale: breathe,
                          child: _HeroArt(
                            compact: compact,
                            nextDay: nextDay,
                          ),
                        ),
                      ],
                    ),
                    Gaps.vMd,
                    _ProgressRail(
                      progress: progress,
                      label: claimedToday
                          ? 'پیشرفت هفته: ${faNum(progressDay)} از ۷'
                          : 'امروز روز ${faNum(nextDay)} است',
                    ),
                    Gaps.vMd,
                    Row(
                      children: [
                        for (var i = 0; i < 7; i++) ...[
                          Expanded(
                            child: _DayNode(
                              day: i + 1,
                              reward: days.length > i ? _int(days[i]['amount']) : 0,
                              claimed: days.length > i && days[i]['claimed'] == true,
                              current: days.length > i && days[i]['current'] == true,
                              compact: compact,
                              tick: t,
                            ),
                          ),
                          if (i != 6) SizedBox(width: compact ? 4 : 6),
                        ],
                      ],
                    ),
                    Gaps.vMd,
                    Row(
                      children: [
                        Expanded(
                          child: _RewardPreview(
                            claimedToday: claimedToday,
                            currentDay: currentDay,
                            nextDay: nextDay,
                            nextReward: nextReward,
                          ),
                        ),
                        Gaps.hSm,
                        _ClaimButton(
                          busy: _busy,
                          claimedToday: claimedToday,
                          onPressed: claimedToday || _busy ? null : _claim,
                          accent: brand.accent,
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

class _CompactStreakSurface extends StatelessWidget {
  const _CompactStreakSurface({
    required this.loop,
    required this.days,
    required this.currentDay,
    required this.nextDay,
    required this.nextReward,
    required this.totalClaims,
    required this.claimedToday,
    required this.progress,
    required this.busy,
    required this.onClaim,
  });

  final Animation<double> loop;
  final List<Map<String, dynamic>> days;
  final int currentDay;
  final int nextDay;
  final int nextReward;
  final int totalClaims;
  final bool claimedToday;
  final double progress;
  final bool busy;
  final VoidCallback? onClaim;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return AnimatedBuilder(
      animation: loop,
      builder: (context, _) {
        final glow = (math.sin(loop.value * math.pi * 2) + 1) / 2;
        return Container(
          padding: const EdgeInsets.all(Gaps.sm),
          decoration: BoxDecoration(
            borderRadius: Corners.rXl,
            gradient: const LinearGradient(
              begin: Alignment.topRight,
              end: Alignment.bottomLeft,
              colors: [Color(0xFF132A4E), Color(0xFF0B1729)],
            ),
            border: Border.all(
              color: Color.lerp(
                BrandColors.amber.withValues(alpha: 0.30),
                BrandColors.emerald.withValues(alpha: 0.42),
                glow,
              )!,
            ),
            boxShadow: [
              BoxShadow(
                color: BrandColors.emerald.withValues(alpha: 0.08 + glow * 0.04),
                blurRadius: 22,
                offset: const Offset(0, 10),
              ),
            ],
          ),
          child: Row(
            children: [
              ClipRRect(
                borderRadius: Corners.rLg,
                child: Image.asset(
                  'assets/pass/streak_hero.webp',
                  width: 58,
                  height: 58,
                  fit: BoxFit.cover,
                  cacheWidth: 160,
                ),
              ),
              Gaps.hSm,
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            claimedToday ? 'استریک امروز امن شد' : 'استریک آماده دریافت',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: theme.textTheme.titleSmall?.copyWith(
                              color: Colors.white,
                              fontWeight: FontWeight.w900,
                            ),
                          ),
                        ),
                        Text(
                          '${faNum(totalClaims)} بار',
                          style: const TextStyle(
                            color: Color(0xFFFFD166),
                            fontSize: 11,
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 5),
                    ClipRRect(
                      borderRadius: Corners.rPill,
                      child: LinearProgressIndicator(
                        minHeight: 6,
                        value: progress.clamp(0.03, 1).toDouble(),
                        color: const Color(0xFF22E7A6),
                        backgroundColor: Colors.white.withValues(alpha: 0.12),
                      ),
                    ),
                    const SizedBox(height: 6),
                    Row(
                      children: [
                        for (var i = 0; i < 7; i++) ...[
                          _MiniDayDot(
                            day: i + 1,
                            claimed: days.length > i && days[i]['claimed'] == true,
                            current: days.length > i && days[i]['current'] == true,
                          ),
                          if (i != 6) const SizedBox(width: 3),
                        ],
                        const SizedBox(width: 7),
                        Expanded(
                          child: Text(
                            claimedToday
                                ? 'روز ${faNum(currentDay)} از ۷'
                                : 'روز ${faNum(nextDay)} · ${faNum(nextReward)} امتیاز',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              color: Colors.white.withValues(alpha: 0.72),
                              fontSize: 11,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              Gaps.hXs,
              SizedBox(
                height: 42,
                child: FilledButton(
                  onPressed: onClaim,
                  style: FilledButton.styleFrom(
                    backgroundColor: const Color(0xFFFFB84D),
                    foregroundColor: const Color(0xFF25110A),
                    disabledBackgroundColor: Colors.white.withValues(alpha: 0.12),
                    disabledForegroundColor: Colors.white54,
                    padding: const EdgeInsets.symmetric(horizontal: 12),
                    shape: RoundedRectangleBorder(borderRadius: Corners.rMd),
                  ),
                  child: busy
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : Text(
                          claimedToday ? 'شد' : 'بگیر',
                          style: const TextStyle(fontWeight: FontWeight.w900),
                        ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

class _MiniDayDot extends StatelessWidget {
  const _MiniDayDot({required this.day, required this.claimed, required this.current});

  final int day;
  final bool claimed;
  final bool current;

  @override
  Widget build(BuildContext context) {
    final color = claimed
        ? BrandColors.success
        : current
            ? BrandColors.amber
            : Colors.white.withValues(alpha: 0.34);
    return AnimatedContainer(
      duration: Motion.fast,
      width: current ? 18 : 14,
      height: 18,
      decoration: BoxDecoration(
        borderRadius: Corners.rPill,
        color: color.withValues(alpha: current ? 0.24 : 0.13),
        border: Border.all(color: color.withValues(alpha: current ? 0.8 : 0.35)),
      ),
      alignment: Alignment.center,
      child: Text(
        claimed ? '✓' : faNum(day),
        style: TextStyle(
          color: color,
          fontSize: 8,
          fontWeight: FontWeight.w900,
          height: 1,
        ),
      ),
    );
  }
}

class _HeroArt extends StatelessWidget {
  const _HeroArt({required this.compact, required this.nextDay});

  final bool compact;
  final int nextDay;

  @override
  Widget build(BuildContext context) {
    final size = compact ? 86.0 : 104.0;
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(compact ? 24 : 28),
        gradient: LinearGradient(
          begin: Alignment.topRight,
          end: Alignment.bottomLeft,
          colors: [
            Colors.white.withValues(alpha: 0.12),
            BrandColors.emerald.withValues(alpha: 0.12),
            Colors.black.withValues(alpha: 0.08),
          ],
        ),
        border: Border.all(color: Colors.white.withValues(alpha: 0.14)),
        boxShadow: [
          BoxShadow(
            color: BrandColors.emerald.withValues(alpha: 0.22),
            blurRadius: 26,
            offset: const Offset(0, 12),
          ),
        ],
      ),
      child: Stack(
        fit: StackFit.expand,
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(compact ? 22 : 26),
            child: Image.asset(
              'assets/pass/streak_hero.webp',
              fit: BoxFit.cover,
              cacheWidth: 360,
            ),
          ),
          Positioned(
            top: 7,
            right: 7,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(
                borderRadius: Corners.rPill,
                color: const Color(0xFF071521).withValues(alpha: 0.72),
                border: Border.all(color: const Color(0xFFFFD166).withValues(alpha: 0.55)),
              ),
              child: Text(
                'روز ${faNum(nextDay)}',
                style: const TextStyle(
                  color: Color(0xFFFFD166),
                  fontSize: 10,
                  fontWeight: FontWeight.w900,
                  height: 1.1,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _StatusChip extends StatelessWidget {
  const _StatusChip({required this.claimedToday, required this.canClaim});

  final bool claimedToday;
  final bool canClaim;

  @override
  Widget build(BuildContext context) {
    final color = claimedToday ? BrandColors.success : BrandColors.amber;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        borderRadius: Corners.rPill,
        color: color.withValues(alpha: 0.16),
        border: Border.all(color: color.withValues(alpha: 0.42)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            claimedToday ? Icons.verified_rounded : Icons.bolt_rounded,
            size: 15,
            color: color,
          ),
          const SizedBox(width: 5),
          Text(
            claimedToday ? 'امروز دریافت شد' : 'آمادهٔ دریافت',
            style: TextStyle(
              color: color,
              fontSize: 11,
              fontWeight: FontWeight.w900,
            ),
          ),
        ],
      ),
    );
  }
}

class _TinyMetric extends StatelessWidget {
  const _TinyMetric({required this.icon, required this.text});

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 6),
      decoration: BoxDecoration(
        borderRadius: Corners.rPill,
        color: Colors.white.withValues(alpha: 0.07),
        border: Border.all(color: Colors.white.withValues(alpha: 0.10)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: Colors.white.withValues(alpha: 0.82)),
          const SizedBox(width: 5),
          Text(
            text,
            style: TextStyle(
              color: Colors.white.withValues(alpha: 0.82),
              fontSize: 11,
              fontWeight: FontWeight.w800,
            ),
          ),
        ],
      ),
    );
  }
}

class _ProgressRail extends StatelessWidget {
  const _ProgressRail({required this.progress, required this.label});

  final double progress;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Expanded(
              child: Text(
                label,
                style: TextStyle(
                  color: Colors.white.withValues(alpha: 0.78),
                  fontSize: 12,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ),
            Text(
              '${faNum((progress * 100).round())}٪',
              style: const TextStyle(
                color: Color(0xFFFFD166),
                fontSize: 12,
                fontWeight: FontWeight.w900,
              ),
            ),
          ],
        ),
        Gaps.vXs,
        Container(
          height: 9,
          clipBehavior: Clip.antiAlias,
          decoration: BoxDecoration(
            borderRadius: Corners.rPill,
            color: Colors.white.withValues(alpha: 0.10),
            border: Border.all(color: Colors.white.withValues(alpha: 0.07)),
          ),
          child: FractionallySizedBox(
            alignment: Alignment.centerRight,
            widthFactor: progress.clamp(0.02, 1.0).toDouble(),
            child: DecoratedBox(
              decoration: BoxDecoration(
                borderRadius: Corners.rPill,
                gradient: const LinearGradient(
                  colors: [Color(0xFFFFD166), Color(0xFF22E7A6), Color(0xFF4EA1FF)],
                ),
                boxShadow: [
                  BoxShadow(
                    color: BrandColors.emerald.withValues(alpha: 0.34),
                    blurRadius: 12,
                  ),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _DayNode extends StatelessWidget {
  const _DayNode({
    required this.day,
    required this.reward,
    required this.claimed,
    required this.current,
    required this.compact,
    required this.tick,
  });

  final int day;
  final int reward;
  final bool claimed;
  final bool current;
  final bool compact;
  final double tick;

  @override
  Widget build(BuildContext context) {
    final color = claimed
        ? BrandColors.success
        : current
            ? BrandColors.amber
            : Colors.white.withValues(alpha: 0.54);
    final pulse = current ? 1 + math.sin(tick * math.pi * 2) * 0.055 : 1.0;
    return Transform.scale(
      scale: pulse,
      child: AnimatedContainer(
        duration: Motion.fast,
        height: compact ? 58 : 64,
        padding: EdgeInsets.symmetric(vertical: compact ? 5 : 6, horizontal: 2),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(16),
          color: color.withValues(alpha: current ? 0.18 : claimed ? 0.14 : 0.08),
          border: Border.all(
            color: color.withValues(alpha: current ? 0.72 : claimed ? 0.45 : 0.18),
            width: current ? 1.35 : 1,
          ),
          boxShadow: current
              ? [
                  BoxShadow(
                    color: BrandColors.amber.withValues(alpha: 0.18),
                    blurRadius: 16,
                    offset: const Offset(0, 8),
                  )
                ]
              : null,
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              claimed
                  ? Icons.check_circle_rounded
                  : current
                      ? Icons.local_fire_department_rounded
                      : Icons.calendar_today_rounded,
              size: compact ? 15 : 17,
              color: color,
            ),
            const SizedBox(height: 2),
            Text(
              faNum(day),
              style: TextStyle(
                color: Colors.white.withValues(alpha: 0.94),
                fontSize: compact ? 11 : 12,
                fontWeight: FontWeight.w900,
                height: 1.0,
              ),
            ),
            if (!compact && reward > 0) ...[
              const SizedBox(height: 2),
              Text(
                '+${faNum(reward)}',
                maxLines: 1,
                overflow: TextOverflow.fade,
                style: TextStyle(
                  color: color.withValues(alpha: 0.95),
                  fontSize: 9,
                  fontWeight: FontWeight.w900,
                  height: 1.0,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _RewardPreview extends StatelessWidget {
  const _RewardPreview({
    required this.claimedToday,
    required this.currentDay,
    required this.nextDay,
    required this.nextReward,
  });

  final bool claimedToday;
  final int currentDay;
  final int nextDay;
  final int nextReward;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: Gaps.sm, vertical: Gaps.sm),
      decoration: BoxDecoration(
        borderRadius: Corners.rLg,
        color: Colors.white.withValues(alpha: 0.07),
        border: Border.all(color: Colors.white.withValues(alpha: 0.10)),
      ),
      child: Row(
        children: [
          const Icon(Icons.redeem_rounded, color: Color(0xFFFFD166), size: 20),
          Gaps.hXs,
          Expanded(
            child: Text(
              claimedToday
                  ? 'روز ${faNum(currentDay)} از ۷ محفوظ شد'
                  : 'روز ${faNum(nextDay)}: ${faNum(nextReward)} امتیاز',
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                color: Colors.white.withValues(alpha: 0.86),
                fontSize: 12,
                fontWeight: FontWeight.w800,
                height: 1.35,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _ClaimButton extends StatelessWidget {
  const _ClaimButton({
    required this.busy,
    required this.claimedToday,
    required this.accent,
    required this.onPressed,
  });

  final bool busy;
  final bool claimedToday;
  final Color accent;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    final enabled = onPressed != null;
    return Material(
      color: Colors.transparent,
      borderRadius: Corners.rLg,
      child: InkWell(
        onTap: onPressed,
        borderRadius: Corners.rLg,
        child: AnimatedContainer(
          duration: Motion.fast,
          height: 50,
          constraints: const BoxConstraints(minWidth: 118),
          padding: const EdgeInsets.symmetric(horizontal: 16),
          decoration: BoxDecoration(
            borderRadius: Corners.rLg,
            gradient: enabled
                ? const LinearGradient(
                    begin: Alignment.topRight,
                    end: Alignment.bottomLeft,
                    colors: [Color(0xFFFFE08A), Color(0xFFFFB84D), Color(0xFFFF7A45)],
                  )
                : null,
            color: enabled ? null : Colors.white.withValues(alpha: 0.11),
            border: Border.all(
              color: enabled
                  ? Colors.white.withValues(alpha: 0.24)
                  : Colors.white.withValues(alpha: 0.08),
            ),
            boxShadow: enabled
                ? [
                    BoxShadow(
                      color: accent.withValues(alpha: 0.24),
                      blurRadius: 18,
                      offset: const Offset(0, 9),
                    )
                  ]
                : null,
          ),
          child: Center(
            child: busy
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(
                      strokeWidth: 2.3,
                      valueColor: AlwaysStoppedAnimation<Color>(Color(0xFF25110A)),
                    ),
                  )
                : Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      if (enabled) ...[
                        Image.asset(
                          'assets/pass/cta_spark.png',
                          width: 20,
                          height: 20,
                          cacheWidth: 64,
                        ),
                        const SizedBox(width: 6),
                      ],
                      Text(
                        claimedToday ? 'دریافت شد' : 'دریافت',
                        style: TextStyle(
                          color: enabled ? const Color(0xFF25110A) : Colors.white54,
                          fontWeight: FontWeight.w900,
                          fontSize: 13,
                        ),
                      ),
                    ],
                  ),
          ),
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
        final shine = (math.sin(loop.value * math.pi * 2) + 1) / 2;
        final fill = Color.lerp(
          Theme.of(context).colorScheme.surface.withValues(alpha: 0.48),
          Theme.of(context).colorScheme.surfaceContainerHigh.withValues(alpha: 0.72),
          shine,
        )!;
        return Container(
          height: 224,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(30),
            color: fill,
            border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
          ),
          child: Center(
            child: Text(
              'استریک ورود در حال آماده‌سازی است…',
              style: TextStyle(color: Colors.white.withValues(alpha: 0.62)),
            ),
          ),
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
    final center = Offset(size.width * 0.55, size.height * 0.38);
    final radius = math.min(size.width, size.height) * (celebrate ? 0.44 : 0.34);
    for (var i = 0; i < 24; i++) {
      final speed = i.isEven ? 1.0 : -0.72;
      final angle = i * 2.399 + progress * math.pi * 2 * speed;
      final wobble = math.sin(progress * math.pi * 2 + i) * 0.08;
      final r = radius * (0.35 + (i % 7) * 0.085 + wobble);
      final p = center + Offset(math.cos(angle) * r, math.sin(angle) * r * 0.58);
      final a = (0.10 + (i % 5) * 0.035) * (celebrate ? 1.75 : 1.0);
      paint.color = (i % 3 == 0 ? BrandColors.amber : BrandColors.emerald)
          .withValues(alpha: a.clamp(0.06, 0.34).toDouble());
      canvas.drawCircle(p, celebrate && i % 4 == 0 ? 2.2 : 1.35, paint);
    }
  }

  @override
  bool shouldRepaint(covariant _StreakParticlesPainter oldDelegate) =>
      oldDelegate.progress != progress || oldDelegate.celebrate != celebrate;
}
