// Club rosters — a tab inside the league page.
//
// Mirrors userweb/src/screens/Clubs.jsx. Two levels: the grid of clubs with
// member counts, then one club's roster. Members are ordered by this month's
// league points, so the roster doubles as a per-club leaderboard instead of
// an alphabetical phone book. Every row opens that user's public profile.
import 'package:flutter/material.dart';

import '../../api_client.dart';
import '../../core/cosmetics.dart';
import '../../theme/tokens.dart';
import '../../widgets/app_card.dart';
import '../../widgets/async_section.dart';
import '../../widgets/avatar_image.dart';
import '../../widgets/state_views.dart';
import '../shared/public_profile_sheet.dart';

class ClubsTab extends StatefulWidget {
  final ApiClient api;
  const ClubsTab({super.key, required this.api});

  @override
  State<ClubsTab> createState() => _ClubsTabState();
}

class _ClubsTabState extends State<ClubsTab> {
  late Future<dynamic> _future = widget.api.get('/api/clubs');
  Map<String, dynamic>? _open;

  Future<void> _reload() async {
    setState(() => _future = widget.api.get('/api/clubs'));
    await _future;
  }

  @override
  Widget build(BuildContext context) {
    if (_open != null) {
      return _Roster(
        api: widget.api,
        club: _open!,
        onBack: () => setState(() => _open = null),
      );
    }

    return RefreshIndicator(
      onRefresh: _reload,
      child: AsyncSection<dynamic>(
        future: _future,
        onRetry: _reload,
        builder: (context, data) {
          final d = Map<String, dynamic>.from(data as Map);
          final clubs = List<Map<String, dynamic>>.from(
              ((d['clubs'] as List?) ?? const [])
                  .map((e) => Map<String, dynamic>.from(e)));
          final mine = ((d['mine'] as List?) ?? const [])
              .map((e) => '${(e as Map)['slug']}')
              .toSet();
          final theme = Theme.of(context);

          return ListView(
            padding: const EdgeInsets.fromLTRB(0, Gaps.sm, 0, Gaps.xxl),
            children: [
              Text(
                'هوادارهای هر باشگاه را ببین. با خرید نشان باشگاه از فروشگاه '
                'عضو می‌شوی و اسمت اینجا می‌آید.',
                style: theme.textTheme.bodySmall,
              ),
              Gaps.vMd,
              GridView.builder(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
                  maxCrossAxisExtent: 132,
                  mainAxisExtent: 148,
                  crossAxisSpacing: Gaps.xs,
                  mainAxisSpacing: Gaps.xs,
                ),
                itemCount: clubs.length,
                itemBuilder: (_, i) {
                  final c = clubs[i];
                  final isMine = mine.contains('${c['slug']}');
                  final count = (c['memberCount'] as num?)?.toInt() ?? 0;

                  return InkWell(
                    onTap: () => setState(() => _open = c),
                    borderRadius: Corners.rLg,
                    child: Container(
                      padding: const EdgeInsets.all(Gaps.xs),
                      decoration: BoxDecoration(
                        color: isMine
                            ? const Color(0xFFB5EF58).withValues(alpha: 0.07)
                            : theme.colorScheme.onSurface
                                .withValues(alpha: 0.03),
                        borderRadius: Corners.rLg,
                        border: Border.all(
                          color: isMine
                              ? const Color(0xFFB5EF58).withValues(alpha: 0.45)
                              : theme.colorScheme.onSurface
                                  .withValues(alpha: 0.08),
                        ),
                      ),
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Image.asset(
                            clubAsset('${c['slug']}'),
                            width: 52,
                            height: 52,
                            // 16 crests in this grid at 512px each is 17 MB
                            // decoded — nearly half the whole image cache —
                            // to draw them at 52px. 156 = 52 at 3x.
                            cacheWidth: 156,
                            fit: BoxFit.contain,
                            errorBuilder: (_, __, ___) =>
                                const Icon(Icons.shield_outlined, size: 52),
                          ),
                          Gaps.vXxs,
                          Text('${c['name']}',
                              maxLines: 2,
                              textAlign: TextAlign.center,
                              overflow: TextOverflow.ellipsis,
                              style: theme.textTheme.labelSmall
                                  ?.copyWith(fontWeight: FontWeight.w800)),
                          Gaps.vXxs,
                          Text(
                            count > 0
                                ? '${faNum(count)} هوادار'
                                : 'بدون هوادار',
                            style: theme.textTheme.labelSmall,
                          ),
                        ],
                      ),
                    ),
                  );
                },
              ),
            ],
          );
        },
      ),
    );
  }
}

class _Roster extends StatefulWidget {
  const _Roster({required this.api, required this.club, required this.onBack});

  final ApiClient api;
  final Map<String, dynamic> club;
  final VoidCallback onBack;

  @override
  State<_Roster> createState() => _RosterState();
}

class _RosterState extends State<_Roster> {
  late Future<dynamic> _future =
      widget.api.get('/api/clubs/${widget.club['slug']}/members');

  Future<void> _reload() async {
    setState(() =>
        _future = widget.api.get('/api/clubs/${widget.club['slug']}/members'));
    await _future;
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            IconButton(
              onPressed: widget.onBack,
              icon: const Icon(Icons.arrow_forward, size: 20),
              tooltip: 'همهٔ باشگاه‌ها',
            ),
            Image.asset(clubAsset('${widget.club['slug']}'),
                width: 36,
                height: 36,
                cacheWidth: 108,
                fit: BoxFit.contain,
                errorBuilder: (_, __, ___) =>
                    const Icon(Icons.shield_outlined, size: 36)),
            Gaps.hXs,
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('${widget.club['name']}',
                      style: theme.textTheme.titleSmall
                          ?.copyWith(fontWeight: FontWeight.w900)),
                  Text(
                      '${faNum(widget.club['memberCount'] ?? 0)} هوادار',
                      style: theme.textTheme.labelSmall),
                ],
              ),
            ),
          ],
        ),
        Gaps.vXs,
        Expanded(
          child: RefreshIndicator(
            onRefresh: _reload,
            child: AsyncSection<dynamic>(
              future: _future,
              onRetry: _reload,
              builder: (context, data) {
                final members = List<Map<String, dynamic>>.from(
                    ((data as Map)['members'] as List? ?? const [])
                        .map((e) => Map<String, dynamic>.from(e)));

                if (members.isEmpty) {
                  return ListView(
                    children: const [
                      AppCard(
                        child: EmptyState(
                          icon: Icons.shield_outlined,
                          title: 'هنوز کسی عضو این باشگاه نشده',
                          message: 'اولین نفر باش!',
                        ),
                      ),
                    ],
                  );
                }

                return ListView.builder(
                  padding: const EdgeInsets.only(bottom: Gaps.xxl),
                  itemCount: members.length,
                  itemBuilder: (_, i) {
                    final m = members[i];
                    return InkWell(
                      onTap: () =>
                          showPublicProfile(context, widget.api, m['userId']),
                      borderRadius: Corners.rLg,
                      child: Container(
                        margin: const EdgeInsets.only(bottom: 6),
                        padding: const EdgeInsets.all(Gaps.sm),
                        decoration: BoxDecoration(
                          color: theme.colorScheme.onSurface
                              .withValues(alpha: 0.03),
                          borderRadius: Corners.rLg,
                          border: Border.all(
                              color: theme.colorScheme.onSurface
                                  .withValues(alpha: 0.07)),
                        ),
                        child: Row(
                          children: [
                            SizedBox(
                              width: 30,
                              child: Text('#${faNum(m['rank'])}',
                                  style: theme.textTheme.labelSmall),
                            ),
                            AvatarImage(
                                keyName: m['profileAvatarKey'],
                                imageUrl: m['profileImageUrl'],
                                radius: 16),
                            Gaps.hXs,
                            Expanded(
                              child: Text('${m['nickname']}',
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: theme.textTheme.bodyMedium
                                      ?.copyWith(fontWeight: FontWeight.w700)),
                            ),
                            // "۰ امتیاز ماه" next to every name reads as a
                            // broken counter, especially just after the
                            // monthly reset when nobody has points yet. Fall
                            // back to the lifetime total and say which is
                            // being shown.
                            Builder(builder: (_) {
                              final monthly =
                                  (m['monthlyPoints'] as num?)?.toInt() ?? 0;
                              final lifetime =
                                  (m['lifetimePoints'] as num?)?.toInt() ?? 0;
                              final label = monthly > 0
                                  ? '${faNum(monthly)} امتیاز ماه'
                                  : lifetime > 0
                                      ? '${faNum(lifetime)} امتیاز کل'
                                      : 'تازه‌وارد';
                              return Text(label,
                                  style: theme.textTheme.labelSmall?.copyWith(
                                      color: (monthly > 0 || lifetime > 0)
                                          ? const Color(0xFF6BA31F)
                                          : null,
                                      fontWeight: FontWeight.w800));
                            }),
                          ],
                        ),
                      ),
                    );
                  },
                );
              },
            ),
          ),
        ),
      ],
    );
  }
}
