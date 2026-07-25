import 'package:flutter/material.dart';

import '../../api_client.dart';
import '../../core/assets.dart';
import '../../theme/brand_theme.dart';
import '../../theme/tokens.dart';
import '../../widgets/avatar_image.dart';

/// Compact dashboard hero: greeting, avatar, points and reward progress.
///
/// Rewritten to be much denser than the original (which used xl padding, a
/// 34pt number and a 68px thumbnail, eating most of the first screen). The
/// avatar/greeting is now a tap target that opens the profile, and an
/// inline "complete your profile" nudge appears while required fields are
/// still missing — so the user can finish their details without hunting
/// through the navigation.
class HeroHeader extends StatelessWidget {
  final int points;
  final String nickname;
  final Map<String, dynamic>? nextReward;

  /// Full user object, used for the avatar and completeness check.
  final Map<String, dynamic>? user;

  /// Opens the profile tab.
  final VoidCallback? onOpenProfile;

  /// Toggles light/dark. Lives here (top of the dashboard) because that's
  /// where it was most reachable.
  final VoidCallback? onToggleTheme;
  final bool isDark;

  const HeroHeader({
    super.key,
    required this.points,
    required this.nickname,
    this.nextReward,
    this.user,
    this.onOpenProfile,
    this.onToggleTheme,
    this.isDark = true,
  });

  /// Profile fields we consider essential for payouts/prizes.
  static const _required = <String, String>{
    'first_name': 'نام',
    'last_name': 'نام خانوادگی',
    'age': 'سن',
    'province': 'استان',
    'city': 'شهر',
    'bank_account': 'شماره کارت',
  };

  List<String> get _missing {
    final u = user;
    if (u == null) return const [];
    return _required.entries
        .where((e) => '${u[e.key] ?? ''}'.trim().isEmpty)
        .map((e) => e.value)
        .toList();
  }

  @override
  Widget build(BuildContext context) {
    final required = NumberParser.toInt(nextReward?['required_points']);
    final remaining = required > points ? required - points : 0;
    final progress = required > 0 ? (points / required).clamp(0.0, 1.0) : 0.0;
    final brand = context.brand;
    final missing = _missing;
    final done = _required.length - missing.length;

    return Container(
      padding: const EdgeInsets.fromLTRB(Gaps.md, Gaps.sm, Gaps.md, Gaps.sm),
      decoration: BoxDecoration(
        borderRadius: Corners.rXl,
        gradient: LinearGradient(
            colors: brand.heroGradient,
            begin: Alignment.topLeft,
            end: Alignment.bottomRight),
        boxShadow: [
          BoxShadow(
              color: brand.heroGradient.last.withValues(alpha: 0.28),
              blurRadius: 22,
              offset: const Offset(0, 10))
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // ── greeting + points + theme switch, all on one line ──
          Row(
            children: [
              InkWell(
                onTap: onOpenProfile,
                borderRadius: Corners.rPill,
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    AvatarImage(
                      imageUrl: user?['profile_image_url'],
                      keyName: user?['profile_avatar_key'],
                      radius: 19,
                    ),
                    Gaps.hXs,
                    ConstrainedBox(
                      constraints: const BoxConstraints(maxWidth: 130),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            'سلام $nickname 👋',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                                fontSize: 14.5,
                                fontWeight: FontWeight.w800,
                                color: Colors.white),
                          ),
                          const Row(
                            children: [
                              Text('پروفایل من',
                                  style: TextStyle(
                                      color: Colors.white70,
                                      fontSize: 11,
                                      fontWeight: FontWeight.w600)),
                              SizedBox(width: 2),
                              Icon(Icons.chevron_left_rounded,
                                  size: 13, color: Colors.white70),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              const Spacer(),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(faNum(points),
                      style: const TextStyle(
                          fontSize: 23,
                          fontWeight: FontWeight.w900,
                          color: Colors.white,
                          height: 1.1)),
                  const Text('امتیاز',
                      style: TextStyle(
                          color: Colors.white70,
                          fontWeight: FontWeight.w600,
                          fontSize: 10.5)),
                ],
              ),
              if (onToggleTheme != null)
                IconButton(
                  onPressed: onToggleTheme,
                  visualDensity: VisualDensity.compact,
                  tooltip: isDark ? 'حالت روشن' : 'حالت تیره',
                  icon: Icon(
                    isDark
                        ? Icons.light_mode_rounded
                        : Icons.dark_mode_rounded,
                    color: Colors.white,
                    size: 20,
                  ),
                ),
            ],
          ),

          // ── reward progress ──
          Gaps.vXs,
          ClipRRect(
            borderRadius: Corners.rPill,
            child: TweenAnimationBuilder<double>(
              duration: Motion.hero,
              curve: Motion.emphasized,
              tween: Tween(begin: 0, end: progress),
              builder: (_, v, __) => LinearProgressIndicator(
                value: v,
                minHeight: 6,
                color: Colors.white,
                backgroundColor: Colors.white.withValues(alpha: 0.22),
              ),
            ),
          ),
          const SizedBox(height: 5),
          Text(
            nextReward == null
                ? 'هنوز جایزه‌ای تعریف نشده است'
                : remaining == 0
                    ? 'به جایزه ${nextReward!['name']} رسیدی 🎉'
                    : 'تا ${nextReward!['name']}: ${faNum(remaining)} امتیاز',
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.w700,
                fontSize: 11.5),
          ),

          // ── profile completion nudge (only while something is missing) ──
          if (missing.isNotEmpty) ...[
            const SizedBox(height: 7),
            _CompletionBar(
              done: done,
              total: _required.length,
              missing: missing,
              onTap: onOpenProfile,
            ),
          ],
        ],
      ),
    );
  }
}

class _CompletionBar extends StatelessWidget {
  const _CompletionBar({
    required this.done,
    required this.total,
    required this.missing,
    this.onTap,
  });

  final int done;
  final int total;
  final List<String> missing;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    // Show at most two field names inline; the rest become "+N مورد".
    final shown = missing.take(2).join('، ');
    final extra = missing.length - 2;
    return Material(
      color: Colors.black.withValues(alpha: 0.22),
      borderRadius: Corners.rMd,
      child: InkWell(
        onTap: onTap,
        borderRadius: Corners.rMd,
        child: Padding(
          padding: const EdgeInsets.symmetric(
              horizontal: Gaps.xs, vertical: 6),
          child: Row(
            children: [
              const Icon(Icons.badge_outlined,
                  size: 15, color: Color(0xFFFFD36B)),
              Gaps.hXxs,
              Expanded(
                child: Text(
                  'تکمیل پروفایل ($done از $total): $shown'
                  '${extra > 0 ? ' +$extra مورد' : ''}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                      color: Colors.white,
                      fontSize: 11,
                      fontWeight: FontWeight.w700),
                ),
              ),
              const Text('تکمیل',
                  style: TextStyle(
                      color: Color(0xFFFFD36B),
                      fontSize: 11,
                      fontWeight: FontWeight.w800)),
              const Icon(Icons.chevron_left_rounded,
                  size: 15, color: Color(0xFFFFD36B)),
            ],
          ),
        ),
      ),
    );
  }
}
