import 'package:flutter/material.dart';

import '../../api_client.dart';
import '../../core/assets.dart';
import '../../theme/brand_theme.dart';
import '../../theme/tokens.dart';

/// Seven-day login streak card for the user dashboard.
///
/// Claiming is deliberately explicit: opening the dashboard only loads the
/// status; the points are awarded once after the user taps the button.
class LoginStreakCard extends StatefulWidget {
  const LoginStreakCard({super.key, required this.api});

  final ApiClient api;

  @override
  State<LoginStreakCard> createState() => _LoginStreakCardState();
}

class _LoginStreakCardState extends State<LoginStreakCard> {
  Map<String, dynamic>? _data;
  bool _loading = true;
  bool _busy = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
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
    if (_busy) return;
    setState(() => _busy = true);
    try {
      final response = await widget.api.post('/api/login-streak/claim', {});
      if (!mounted) return;
      final data = response is Map
          ? Map<String, dynamic>.from(response)
          : <String, dynamic>{};
      setState(() => _data = data);
      final message = data['message']?.toString() ??
          '${_int(data['claimedReward'])} امتیاز دریافت شد';
      ScaffoldMessenger.maybeOf(context)?.showSnackBar(SnackBar(
        content: Text(message, textAlign: TextAlign.center),
        behavior: SnackBarBehavior.floating,
        backgroundColor: const Color(0xFF1C8B67),
      ));
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
    final theme = Theme.of(context);
    if (_loading) {
      return Container(
        height: 136,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(24),
          color: theme.colorScheme.surface.withValues(alpha: 0.42),
        ),
        child: const Center(child: CircularProgressIndicator(strokeWidth: 2)),
      );
    }

    if (_error != null || _data == null || _data!['active'] != true) {
      return const SizedBox.shrink();
    }

    final days = (_data!['rewards'] as List? ?? const [])
        .whereType<Map>()
        .map((item) => Map<String, dynamic>.from(item))
        .toList();
    final currentDay = _int(_data!['currentDay']);
    final nextDay = _int(_data!['nextDay']).clamp(1, 7);
    final nextReward = _int(_data!['nextReward']);
    final claimedToday = _data!['claimedToday'] == true;
    final themeGold = context.gold;

    return Container(
      padding: const EdgeInsets.fromLTRB(Gaps.md, Gaps.md, Gaps.md, Gaps.sm),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(24),
        gradient: const LinearGradient(
          begin: Alignment.topRight,
          end: Alignment.bottomLeft,
          colors: [Color(0xFF211640), Color(0xFF0C182B)],
        ),
        border: Border.all(color: const Color(0xFFFFB84D).withValues(alpha: 0.32)),
        boxShadow: [
          BoxShadow(
            color: const Color(0xFFFF8A3D).withValues(alpha: 0.12),
            blurRadius: 22,
            offset: const Offset(0, 10),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Container(
                width: 58,
                height: 58,
                padding: const EdgeInsets.all(3),
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: const Color(0xFFFFA24B).withValues(alpha: 0.14),
                  border: Border.all(color: const Color(0xFFFFB84D).withValues(alpha: 0.42)),
                ),
                child: Image.asset('assets/pass/streak_icon.webp'),
              ),
              Gaps.hSm,
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('استریک ورود',
                        style: theme.textTheme.titleMedium?.copyWith(
                          color: Colors.white,
                          fontWeight: FontWeight.w900,
                        )),
                    const SizedBox(height: 3),
                    Text(
                      claimedToday
                          ? 'امروز جایزه‌ات را گرفتی؛ فردا برای روز بعد برگرد.'
                          : 'هر روز یک بار وارد شو و امتیاز بگیر.',
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: Colors.white.withValues(alpha: 0.70),
                        height: 1.45,
                      ),
                    ),
                  ],
                ),
              ),
              Text(faNum(_int(_data!['totalClaims'])),
                  style: theme.textTheme.titleLarge?.copyWith(
                    color: themeGold,
                    fontWeight: FontWeight.w900,
                  )),
            ],
          ),
          Gaps.vSm,
          Row(
            children: [
              for (var i = 0; i < 7; i++) ...[
                Expanded(child: _DayPill(
                  day: i + 1,
                  reward: days.length > i ? _int(days[i]['amount']) : 0,
                  claimed: days.length > i && days[i]['claimed'] == true,
                  current: days.length > i && days[i]['current'] == true,
                  gold: themeGold,
                )),
                if (i != 6) Gaps.hXxs,
              ],
            ],
          ),
          Gaps.vSm,
          Row(
            children: [
              Expanded(
                child: Text(
                  claimedToday
                      ? 'روز $currentDay از ۷ تکمیل شد'
                      : 'روز $nextDay — پاداش ${faNum(nextReward)} امتیاز',
                  style: theme.textTheme.labelMedium?.copyWith(
                    color: Colors.white.withValues(alpha: 0.78),
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              SizedBox(
                height: 38,
                child: FilledButton(
                  onPressed: claimedToday || _busy ? null : _claim,
                  style: FilledButton.styleFrom(
                    backgroundColor: const Color(0xFFFFB84D),
                    foregroundColor: const Color(0xFF25110A),
                    disabledBackgroundColor: Colors.white.withValues(alpha: 0.12),
                    disabledForegroundColor: Colors.white.withValues(alpha: 0.52),
                    padding: const EdgeInsets.symmetric(horizontal: 14),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(13),
                    ),
                  ),
                  child: _busy
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : Text(claimedToday ? 'دریافت شد' : 'دریافت امتیاز',
                          style: const TextStyle(fontWeight: FontWeight.w900)),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _DayPill extends StatelessWidget {
  const _DayPill({
    required this.day,
    required this.reward,
    required this.claimed,
    required this.current,
    required this.gold,
  });

  final int day;
  final int reward;
  final bool claimed;
  final bool current;
  final Color gold;

  @override
  Widget build(BuildContext context) {
    final color = claimed ? const Color(0xFF53E0A4) : gold;
    return AnimatedContainer(
      duration: const Duration(milliseconds: 220),
      height: 49,
      padding: const EdgeInsets.symmetric(vertical: 4),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(12),
        color: color.withValues(alpha: current ? 0.24 : 0.10),
        border: Border.all(
          color: color.withValues(alpha: current ? 0.9 : 0.30),
          width: current ? 1.4 : 1,
        ),
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(claimed ? Icons.check_rounded : Icons.calendar_today_rounded,
              size: 13, color: color),
          const SizedBox(height: 1),
          Text('$day',
              style: TextStyle(
                color: Colors.white.withValues(alpha: 0.90),
                fontSize: 12,
                fontWeight: FontWeight.w900,
              )),
        ],
      ),
    );
  }
}
