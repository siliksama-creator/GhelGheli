// Rewards: two admin-defined groups, each with its own progress bar, prize
// artwork and required-card strip.
//
// Mirrors userweb/src/screens/Rewards.jsx — same endpoint
// (GET /api/reward-groups), same progress maths, same claim confirmation.
import 'package:flutter/material.dart';

import '../../api_client.dart';
import '../../theme/tokens.dart';
import '../../widgets/app_card.dart';
import '../../widgets/async_section.dart';
import '../../widgets/safe_image.dart';
import '../../widgets/state_views.dart';

const _accents = <String, Color>{
  'emerald': Color(0xFF00D49A),
  'gold': Color(0xFFFFC53D),
  'blue': Color(0xFF60A5FA),
  'purple': Color(0xFFA855F7),
  'rose': Color(0xFFF87171),
  'slate': Color(0xFF94A3B8),
};

class RewardsPage extends StatefulWidget {
  final ApiClient api;
  const RewardsPage({super.key, required this.api});

  @override
  State<RewardsPage> createState() => _RewardsPageState();
}

class _RewardsPageState extends State<RewardsPage> {
  late Future<dynamic> _future = widget.api.get('/api/reward-groups');
  String? _claiming;

  Future<void> _reload() async {
    setState(() => _future = widget.api.get('/api/reward-groups'));
    await _future;
  }

  Future<void> _confirmAndClaim(
      Map<String, dynamic> tier, Map<String, dynamic> group) async {
    final isCash = tier['rewardType'] == 'cash';
    final cost = tier['requiredPoints'] as num? ?? 0;
    final have = group['earnedPoints'] as num? ?? 0;
    final left = (have - cost).clamp(0, 1 << 40);

    // Spelled out as a list of consequences rather than a paragraph:
    // claiming is irreversible, and the two effects (points spent, bar reset)
    // are easy to skim past in prose. Wording matches the web client.
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('مطمئنی می‌خوای این جایزه رو بگیری؟'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('${tier['name']}',
                style: Theme.of(ctx).textTheme.titleSmall?.copyWith(
                    fontWeight: FontWeight.w800,
                    color: const Color(0xFF84CC16))),
            Gaps.vSm,
            _ConfirmLine(
              icon: '📉',
              title: '${faNum(cost)} امتیاز از امتیازت کم می‌شه',
              note: 'الان ${faNum(have)} امتیاز داری، '
                  'بعدش ${faNum(left)} امتیاز می‌مونه',
            ),
            Gaps.vXs,
            _ConfirmLine(
              icon: '🔄',
              title: 'نوار پیشرفت «${group['name']}» از صفر شروع می‌شه',
              note: 'برای جایزهٔ بعدی این گروه باید دوباره امتیاز جمع کنی',
            ),
            Gaps.vXs,
            _ConfirmLine(
              icon: isCash ? '💰' : '🎁',
              title: isCash
                  ? '${faNum(tier['cashAmount'])} تومان همین الان به کیف پولت اضافه می‌شه'
                  : 'جایزه بعد از تایید مدیر برات فرستاده می‌شه',
              note: isCash
                  ? 'می‌تونی از بخش کیف پول برداشتش کنی'
                  : 'عکسش هم توی پروفایلت ثبت می‌مونه',
            ),
            Gaps.vSm,
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(
                  horizontal: Gaps.sm, vertical: Gaps.xs),
              decoration: BoxDecoration(
                color: const Color(0xFFFFD36B).withValues(alpha: 0.12),
                borderRadius: Corners.rMd,
                border: Border.all(
                    color: const Color(0xFFFFD36B).withValues(alpha: 0.35)),
              ),
              child: const Text('این کار برگشت‌پذیر نیست.',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                      fontSize: 12.5, color: Color(0xFFFFD36B))),
            ),
          ],
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('نه، فعلاً نه')),
          FilledButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('آره، جایزه‌مو بگیر')),
        ],
      ),
    );
    if (ok != true || !mounted) return;

    setState(() => _claiming = tier['id'] as String?);
    try {
      final r = await widget.api.post('/api/rewards/${tier['id']}/claim', {});
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('${r['message'] ?? 'ثبت شد'}')));
      await _reload();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(apiError(e))));
    } finally {
      if (mounted) setState(() => _claiming = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      onRefresh: _reload,
      child: AsyncSection<dynamic>(
        future: _future,
        onRetry: _reload,
        builder: (context, data) {
          final map = Map<String, dynamic>.from(data as Map);
          final groups = List<Map<String, dynamic>>.from(
              (map['groups'] as List? ?? [])
                  .map((g) => Map<String, dynamic>.from(g as Map)))
              .where((g) => (g['tiers'] as List? ?? []).isNotEmpty)
              .toList();

          if (groups.isEmpty) {
            return ListView(
              padding: const EdgeInsets.all(Gaps.lg),
              children: const [
                EmptyState(
                    icon: Icons.card_giftcard_outlined,
                    title: 'هنوز جایزه‌ای تعریف نشده است'),
              ],
            );
          }

          return ListView(
            padding:
                const EdgeInsets.fromLTRB(Gaps.lg, Gaps.md, Gaps.lg, Gaps.xxl),
            children: [
              for (final g in groups) ...[
                _GroupCard(
                  group: g,
                  claiming: _claiming,
                  onClaim: (t) => _confirmAndClaim(t, g),
                ),
                Gaps.vMd,
              ],
            ],
          );
        },
      ),
    );
  }
}

class _GroupCard extends StatelessWidget {
  const _GroupCard({
    required this.group,
    required this.onClaim,
    this.claiming,
  });

  final Map<String, dynamic> group;
  final void Function(Map<String, dynamic> tier) onClaim;
  final String? claiming;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final accent = _accents[group['accent']] ?? _accents['emerald']!;
    final tiers = List<Map<String, dynamic>>.from(
        (group['tiers'] as List? ?? [])
            .map((t) => Map<String, dynamic>.from(t as Map)));
    final next = group['nextTier'] == null
        ? null
        : Map<String, dynamic>.from(group['nextTier'] as Map);
    final progress = (group['progress'] as num?)?.toDouble() ?? 0;
    final earned = group['earnedPoints'] ?? 0;

    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              if (group['imageUrl'] != null)
                ClipRRect(
                  borderRadius: Corners.rMd,
                  child: SafeImage(
                      url: fullAssetUrl(group['imageUrl']),
                      width: 46,
                      height: 46),
                ),
              if (group['imageUrl'] != null) Gaps.hSm,
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('${group['name']}',
                        style: theme.textTheme.titleMedium
                            ?.copyWith(fontWeight: FontWeight.w800)),
                    if (group['description'] != null)
                      Text('${group['description']}',
                          style: theme.textTheme.bodySmall),
                  ],
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(
                    horizontal: Gaps.sm, vertical: 4),
                decoration: BoxDecoration(
                    color: accent, borderRadius: Corners.rPill),
                child: Text(
                  group['groupType'] == 'cash'
                      ? 'نقدی'
                      : group['groupType'] == 'physical'
                          ? 'فیزیکی'
                          : 'ترکیبی',
                  style: const TextStyle(
                      color: Color(0xFF04101C),
                      fontWeight: FontWeight.w800,
                      fontSize: 11),
                ),
              ),
            ],
          ),
          Gaps.vMd,

          // ── progress bar ────────────────────────────────────────────────
          Container(
            padding: const EdgeInsets.all(Gaps.sm),
            decoration: BoxDecoration(
              color: theme.colorScheme.onSurface.withValues(alpha: 0.04),
              borderRadius: Corners.rLg,
            ),
            child: Column(
              children: [
                Row(
                  children: [
                    if (next?['imageUrl'] != null)
                      ClipRRect(
                        borderRadius: Corners.rSm,
                        child: SafeImage(
                            url: fullAssetUrl(next!['imageUrl']),
                            width: 50,
                            height: 50),
                      ),
                    if (next?['imageUrl'] != null) Gaps.hXs,
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            next == null
                                ? 'همهٔ جوایز این گروه دریافت شد'
                                : '${next['name']}',
                            style: theme.textTheme.titleSmall
                                ?.copyWith(fontWeight: FontWeight.w800),
                          ),
                          if (next != null)
                            Text(
                              (next['requiredPoints'] as num) > (earned as num)
                                  ? '${faNum((next['requiredPoints'] as num) - earned)} امتیاز تا دریافت'
                                  : 'آمادهٔ دریافت!',
                              style: theme.textTheme.bodySmall,
                            ),
                        ],
                      ),
                    ),
                    Text('${faNum((progress * 100).round())}٪',
                        style: theme.textTheme.titleMedium?.copyWith(
                            color: accent, fontWeight: FontWeight.w900)),
                  ],
                ),
                Gaps.vXs,
                ClipRRect(
                  borderRadius: Corners.rPill,
                  child: TweenAnimationBuilder<double>(
                    tween: Tween(begin: 0, end: progress.clamp(0.0, 1.0)),
                    duration: Motion.slow,
                    curve: Motion.emphasized,
                    builder: (_, v, __) => LinearProgressIndicator(
                      value: v,
                      minHeight: 13,
                      backgroundColor:
                          theme.colorScheme.onSurface.withValues(alpha: 0.08),
                      valueColor: AlwaysStoppedAnimation(accent),
                    ),
                  ),
                ),
                Gaps.vXxs,
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(faNum(earned), style: theme.textTheme.labelSmall),
                    Text(next == null ? '—' : faNum(next['requiredPoints']),
                        style: theme.textTheme.labelSmall),
                  ],
                ),
                if ((next?['requiredCards'] as List? ?? []).isNotEmpty) ...[
                  Gaps.vXs,
                  Align(
                    alignment: AlignmentDirectional.centerStart,
                    child: Text('کارت‌های لازم:',
                        style: theme.textTheme.labelSmall),
                  ),
                  Gaps.vXxs,
                  SizedBox(
                    height: 76,
                    child: ListView.separated(
                      scrollDirection: Axis.horizontal,
                      itemCount: (next!['requiredCards'] as List).length,
                      separatorBuilder: (_, __) => Gaps.hXs,
                      itemBuilder: (_, i) {
                        final c = Map<String, dynamic>.from(
                            (next['requiredCards'] as List)[i] as Map);
                        final met = c['met'] == true;
                        return Opacity(
                          opacity: met ? 1 : 0.5,
                          child: Column(
                            children: [
                              Container(
                                decoration: BoxDecoration(
                                  borderRadius: Corners.rSm,
                                  border: Border.all(
                                      color: met
                                          ? const Color(0xFFB5EF58)
                                          : theme.colorScheme.onSurface
                                              .withValues(alpha: 0.15),
                                      width: 2),
                                ),
                                child: ClipRRect(
                                  borderRadius: Corners.rSm,
                                  child: SafeImage(
                                      url: fullAssetUrl(c['imageUrl']),
                                      width: 50,
                                      height: 50),
                                ),
                              ),
                              Text('${faNum(c['have'])}/${faNum(c['quantity'])}',
                                  style: theme.textTheme.labelSmall?.copyWith(
                                      color: met
                                          ? const Color(0xFFB5EF58)
                                          : null)),
                            ],
                          ),
                        );
                      },
                    ),
                  ),
                ],
              ],
            ),
          ),
          Gaps.vMd,

          // ── tiers ───────────────────────────────────────────────────────
          for (final t in tiers) ...[
            _TierRow(
              tier: t,
              accent: accent,
              busy: claiming == t['id'],
              onClaim: () => onClaim(t),
            ),
            Gaps.vXs,
          ],
        ],
      ),
    );
  }
}

class _TierRow extends StatelessWidget {
  const _TierRow({
    required this.tier,
    required this.accent,
    required this.onClaim,
    this.busy = false,
  });

  final Map<String, dynamic> tier;
  final Color accent;
  final VoidCallback onClaim;
  final bool busy;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final eligible = tier['eligible'] == true;
    final isCash = tier['rewardType'] == 'cash';

    return Container(
      padding: const EdgeInsets.all(Gaps.sm),
      decoration: BoxDecoration(
        color: theme.colorScheme.onSurface.withValues(alpha: 0.03),
        borderRadius: Corners.rLg,
        border: Border.all(
            color: eligible
                ? accent
                : theme.colorScheme.onSurface.withValues(alpha: 0.08)),
      ),
      child: Row(
        children: [
          ClipRRect(
            borderRadius: Corners.rSm,
            child: SafeImage(
                url: fullAssetUrl(tier['imageUrl']), width: 54, height: 54),
          ),
          Gaps.hSm,
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Flexible(
                      child: Text('${tier['name']}',
                          overflow: TextOverflow.ellipsis,
                          style: theme.textTheme.titleSmall
                              ?.copyWith(fontWeight: FontWeight.w800)),
                    ),
                    Gaps.hXxs,
                    Text(isCash ? '💰' : '🎁',
                        style: const TextStyle(fontSize: 13)),
                  ],
                ),
                Text(
                  isCash && (tier['cashAmount'] as num? ?? 0) > 0
                      ? '${faNum(tier['requiredPoints'])} امتیاز · ${faNum(tier['cashAmount'])} تومان'
                      : '${faNum(tier['requiredPoints'])} امتیاز',
                  style: theme.textTheme.bodySmall,
                ),
                if ((tier['requiredCards'] as List? ?? []).isNotEmpty)
                  Wrap(
                    spacing: Gaps.xxs,
                    children: [
                      for (final raw in (tier['requiredCards'] as List))
                        () {
                          final c = Map<String, dynamic>.from(raw as Map);
                          final met = c['met'] == true;
                          return Text(
                            '${c['name']} ${faNum(c['have'])}/${faNum(c['quantity'])}',
                            style: theme.textTheme.labelSmall?.copyWith(
                                color: met ? const Color(0xFFB5EF58) : null),
                          );
                        }(),
                    ],
                  ),
              ],
            ),
          ),
          Gaps.hXs,
          if (eligible)
            FilledButton(
              onPressed: busy ? null : onClaim,
              style: FilledButton.styleFrom(backgroundColor: accent),
              child: Text(busy ? '...' : 'دریافت'),
            )
          else
            Text(
              tier['pointsMet'] == true ? 'کارت کم داری' : 'امتیاز کم',
              style: theme.textTheme.labelSmall,
            ),
        ],
      ),
    );
  }
}


/// One consequence line in the claim confirmation.
class _ConfirmLine extends StatelessWidget {
  const _ConfirmLine({
    required this.icon,
    required this.title,
    required this.note,
  });

  final String icon;
  final String title;
  final String note;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(icon, style: const TextStyle(fontSize: 17)),
        Gaps.hXs,
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: theme.textTheme.bodyMedium),
              Text(note,
                  style: theme.textTheme.labelSmall?.copyWith(
                      color: theme.colorScheme.onSurface
                          .withValues(alpha: 0.6))),
            ],
          ),
        ),
      ],
    );
  }
}
