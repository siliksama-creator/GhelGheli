import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../api_client.dart';
import '../../services/image_disk_cache.dart';
import '../../core/assets.dart';
import '../../theme/colors.dart';
import '../../theme/tokens.dart';
import '../../widgets/app_card.dart';
import '../../widgets/section_header.dart';
import '../../widgets/state_views.dart';
import '../shared/hero_header.dart';
import 'inventory_page.dart';
import 'login_streak_card.dart';
import '../../widgets/photo_card_box.dart';

/// Home / dashboard tab: points header, card-code redemption and card
/// inventory carousel.
class DashboardPage extends StatefulWidget {
  final ApiClient api;
  final Future<void> Function() reloadProfile;

  final VoidCallback? onOpenProfile;
  final VoidCallback? onOpenWallet;
  final VoidCallback? onOpenWheel;
  final VoidCallback? onOpenReferral;
  final VoidCallback? onOpenInventory;

  const DashboardPage({
    super.key,
    required this.api,
    required this.reloadProfile,
    this.onOpenProfile,
    this.onOpenWallet,
    this.onOpenWheel,
    this.onOpenReferral,
    this.onOpenInventory,
  });

  @override
  State<DashboardPage> createState() => _DashboardPageState();
}

class _DashboardPageState extends State<DashboardPage> {
  Map<String, dynamic>? _data;
  List<Map<String, dynamic>> _rewards = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    // ── چرا اول کش، بعد شبکه ──
    //
    // گزارشِ مالک: «هر بار ... به اینوتوری میرم باید منتظر بمونم کارت ها
    // لود بشن». اندازه‌گیری: سرور ۴ms، ولی رفت‌وبرگشتِ شبکه ۴۷۰ تا
    // ۱۰۳۰ms. سرور بیکار است؛ مشکل انتظار است نه فشار.
    //
    // پس آخرین دادهٔ شناخته‌شده بلافاصله رسم می‌شود و تازه‌سازی در
    // پس‌زمینه انجام می‌گیرد. اگر چیزی عوض نشده باشد سرور ۳۰۴ می‌دهد
    // (صفر بایت) و صفحه اصلاً دوباره رسم نمی‌شود.
    _paintCached();
    _load();
  }

  /// آخرین اسنپ‌شات را بدونِ هیچ درخواستی رسم می‌کند.
  void _paintCached() {
    final cached = widget.api.cachedSnapshot('/api/bootstrap');
    if (cached is! Map || cached['user'] is! Map) return;
    _apply(Map<String, dynamic>.from(cached));
  }

  void _apply(Map<String, dynamic> m) {
    setState(() {
      _data = <String, dynamic>{
        'user': m['user'],
        'inventory': m['inventory'] ?? const [],
        'leaguePayouts': m['leaguePayouts'] ?? const [],
        if (m['loginStreak'] != null) 'loginStreak': m['loginStreak'],
        if (m['cosmetics'] != null) 'cosmetics': m['cosmetics'],
        if (m['pendingGrants'] != null) 'pendingGrants': m['pendingGrants'],
      };
      _error = null;
      _loading = false;
    });
  }

  Future<void> _load() async {
    try {
      final boot = await widget.api.get('/api/bootstrap');
      unawaited(ImageDiskCache.instance.prewarmPayload(boot));
      if (!mounted) return;
      final m = boot is Map
          ? Map<String, dynamic>.from(boot)
          : <String, dynamic>{};
      if (m['user'] is! Map) {
        setState(() {
          _error = 'پاسخ سرور ناقص بود';
          _loading = false;
        });
        return;
      }
      setState(() {
        _data = <String, dynamic>{
          'user': m['user'],
          'inventory': m['inventory'] ?? const [],
          'leaguePayouts': m['leaguePayouts'] ?? const [],
          if (m['loginStreak'] != null) 'loginStreak': m['loginStreak'],
          if (m['cosmetics'] != null) 'cosmetics': m['cosmetics'],
          if (m['pendingGrants'] != null) 'pendingGrants': m['pendingGrants'],
        };
        _rewards = List<Map<String, dynamic>>.from(
            ((m['rewards'] as List?) ?? const [])
                .whereType<Map>()
                .map((e) => Map<String, dynamic>.from(e)));
        _error = null;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = apiError(e);
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const LoadingView();

    if (_error != null && _data == null) {
      return RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.all(Gaps.md),
          children: [
            const SizedBox(height: 40),
            ErrorBanner(message: _error!, onRetry: _load),
          ],
        ),
      );
    }

    final user = _data?['user'];
    final inventory =
        List<Map<String, dynamic>>.from(_data?['inventory'] ?? []);
    final points = NumberParser.toInt(user?['current_points']);
    final sorted = [..._rewards]..sort((a, b) =>
        NumberParser.toInt(a['required_points'])
            .compareTo(NumberParser.toInt(b['required_points'])));
    Map<String, dynamic>? nextReward;
    for (final r in sorted) {
      if (points < NumberParser.toInt(r['required_points'])) {
        nextReward = r;
        break;
      }
    }
    nextReward ??= sorted.isNotEmpty ? sorted.last : null;

    final theme = Theme.of(context);

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(Gaps.md, Gaps.sm, Gaps.md, Gaps.xxl),
        children: [
          if ((_data?['pendingGrants'] is List) &&
              (_data!['pendingGrants'] as List).isNotEmpty) ...[
            InkWell(
              onTap: widget.onOpenInventory,
              child: Container(
                width: double.infinity,
                padding: const EdgeInsets.all(Gaps.md),
                decoration: BoxDecoration(
                  borderRadius: Corners.rXl,
                  border: Border.all(
                      color: const Color(0xFFFFD166).withValues(alpha: 0.6)),
                  gradient: const LinearGradient(
                    colors: [Color(0xFF2A1140), Color(0xFF0D1B2C)],
                  ),
                ),
                child: Text(
                  'صندوق کارت برنده‌ای — از کلکسیون بازش کن  ·  '
                  '${faNum((_data!['pendingGrants'] as List).length)} صندوق',
                  style: const TextStyle(
                      color: Color(0xFFFFD166),
                      fontWeight: FontWeight.w900,
                      fontSize: 13),
                ),
              ),
            ),
            Gaps.vSm,
          ],
          HeroHeader(
            points: points,
            nickname: user?['nickname'] ?? 'قهرمان',
            nextReward: nextReward,
            user: user is Map ? Map<String, dynamic>.from(user) : null,
            cosmetics: _data?['cosmetics'] as Map<String, dynamic>?,
            onOpenProfile: widget.onOpenProfile,
            onOpenWallet: widget.onOpenWallet,
          ),
          Gaps.vSm,
          LoginStreakCard(
            api: widget.api,
            compact: true,
            initialData: _data?['loginStreak'] is Map
                ? Map<String, dynamic>.from(_data!['loginStreak'] as Map)
                : null,
            onClaimed: () {
              _load();
              widget.reloadProfile();
            },
          ),
          Gaps.vSm,
          // ── ۳ کاشی جذاب متحرک وسط داشبورد ──
          Row(
            children: [
              Expanded(
                child: _AnimatedQuickTile(
                  icon: Image.asset('assets/pass/wheel_icon.webp', width: 26, height: 26),
                  title: 'گردونه',
                  subtitle: 'گردونه شانس',
                  tint: const Color(0xFFF59E0B),
                  glowColor: const Color(0xFFFFB300),
                  animOffset: 0.0,
                  onTap: widget.onOpenWheel,
                ),
              ),
              Gaps.hXs,
              Expanded(
                child: _AnimatedQuickTile(
                  icon: Image.asset(
                    'assets/games/social_mission_badge.png',
                    width: 30,
                    height: 30,
                    cacheWidth: 90,
                  ),
                  title: 'دعوت و کسب درآمد',
                  subtitle: 'دوستان',
                  tint: const Color(0xFF84CC16),
                  glowColor: const Color(0xFFA3E635),
                  animOffset: 0.33,
                  onTap: widget.onOpenReferral,
                ),
              ),
              Gaps.hXs,
              Expanded(
                child: _AnimatedQuickTile(
                  icon: Image.asset(
                    'assets/games/card_duel_glow.webp',
                    width: 29,
                    height: 29,
                    cacheWidth: 87,
                  ),
                  title: 'کلکسیون',
                  subtitle: '${faNum(inventory.length)} نوع',
                  tint: const Color(0xFF38BDF8),
                  glowColor: const Color(0xFF60A5FA),
                  animOffset: 0.66,
                  onTap: widget.onOpenInventory,
                ),
              ),
            ],
          ),
          Gaps.vSm,

          // ── بخش ثبت کارت‌های قلقلی ──
          AppCard(
            padding: const EdgeInsets.all(Gaps.md),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      width: 58,
                      height: 58,
                      decoration: BoxDecoration(
                        borderRadius: Corners.rLg,
                        gradient: LinearGradient(
                          colors: [
                            BrandColors.emerald.withValues(alpha: 0.22),
                            BrandColors.blue.withValues(alpha: 0.12),
                          ],
                        ),
                        border: Border.all(color: BrandColors.emerald.withValues(alpha: 0.35)),
                      ),
                      child: Image.asset('assets/brand/card_scan_glow.webp', cacheWidth: 150),
                    ),
                    Gaps.hSm,
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Expanded(
                                child: Text('ثبت کارت‌های قلقلی',
                                    style: theme.textTheme.titleMedium
                                        ?.copyWith(fontWeight: FontWeight.w900, fontSize: 14)),
                              ),
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                                decoration: BoxDecoration(
                                  borderRadius: Corners.rPill,
                                  color: BrandColors.amber.withValues(alpha: 0.16),
                                  border: Border.all(color: BrandColors.amber.withValues(alpha: 0.45)),
                                ),
                                child: const Text('ثبت سریع',
                                    style: TextStyle(
                                        color: BrandColors.amber,
                                        fontSize: 10,
                                        fontWeight: FontWeight.w900)),
                              ),
                            ],
                          ),
                          const SizedBox(height: 4),
                          const Text(
                            'عکس کارت و کدش را همین‌جا ثبت کن.',
                            style: TextStyle(
                              color: Color(0xFFCBD5E1),
                              fontSize: 11.5,
                              height: 1.45,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                Gaps.vSm,
                PhotoCardBox(
                  api: widget.api,
                  embedded: true,
                  onRegistered: () {
                    _load();
                    widget.reloadProfile();
                  },
                ),
              ],
            ),
          ),

          Gaps.vXl,
          SectionHeader(
            title: 'کلکسیون من',
            trailing: inventory.length > 6 && widget.onOpenInventory != null
                ? TextButton(
                    onPressed: widget.onOpenInventory,
                    child: Text('همه (${faNum(inventory.length)})'),
                  )
                : null,
          ),
          if (inventory.isEmpty)
            const AppCard(
              child: EmptyState(
                  icon: Icons.style_outlined,
                  title: 'هنوز کارتی در کلکسیون شما نیست',
                  message: 'بعد از ثبت، کارت‌ها اینجا دیده می‌شوند.',
                  image: 'assets/games/empty_collection.webp'),
            )
          else
            Builder(builder: (_) {
              final recent =
                  filterAndSort(inventory, sort: InvSort.recent).take(6).toList();
              return GridView.builder(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                padding: EdgeInsets.zero,
                gridDelegate:
                    const SliverGridDelegateWithMaxCrossAxisExtent(
                  maxCrossAxisExtent: 200,
                  mainAxisSpacing: Gaps.sm,
                  crossAxisSpacing: Gaps.sm,
                  childAspectRatio: 0.66,
                ),
                itemCount: recent.length,
                itemBuilder: (_, i) => InventoryTile(item: recent[i]),
              );
            }),
        ],
      ),
    );
  }
}

/// کاشی میان‌بر جذاب با انیمیشن ملایم شناور و درخشش نور
class _AnimatedQuickTile extends StatefulWidget {
  const _AnimatedQuickTile({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.tint,
    required this.glowColor,
    required this.animOffset,
    this.onTap,
  });

  final Widget icon;
  final String title;
  final String subtitle;
  final Color tint;
  final Color glowColor;
  final double animOffset;
  final VoidCallback? onTap;

  @override
  State<_AnimatedQuickTile> createState() => _AnimatedQuickTileState();
}

class _AnimatedQuickTileState extends State<_AnimatedQuickTile>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 2600),
  )..repeat();

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _ctrl,
      builder: (context, _) {
        final phase = (_ctrl.value + widget.animOffset) % 1.0;
        final floatY = math.sin(phase * 2 * math.pi) * 2.0;
        final glowPulse = 0.4 + 0.35 * math.sin(phase * 2 * math.pi).abs();

        return Transform.translate(
          offset: Offset(0, floatY),
          child: InkWell(
            borderRadius: BorderRadius.circular(16),
            onTap: widget.onTap,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 10),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(16),
                gradient: LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [
                    widget.tint.withValues(alpha: 0.18),
                    widget.tint.withValues(alpha: 0.05),
                  ],
                ),
                border: Border.all(
                  color: widget.tint.withValues(alpha: 0.35 + 0.25 * glowPulse),
                  width: 1.2,
                ),
                boxShadow: [
                  BoxShadow(
                    color: widget.glowColor.withValues(alpha: 0.18 * glowPulse),
                    blurRadius: 10,
                    offset: const Offset(0, 4),
                  ),
                ],
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    width: 40,
                    height: 40,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: widget.tint.withValues(alpha: 0.18),
                      boxShadow: [
                        BoxShadow(
                          color: widget.glowColor.withValues(alpha: 0.35 * glowPulse),
                          blurRadius: 8,
                        ),
                      ],
                    ),
                    child: Center(child: widget.icon),
                  ),
                  const SizedBox(height: 5),
                  Text(
                    widget.title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontWeight: FontWeight.w900,
                      fontSize: 12,
                      color: Colors.white,
                    ),
                  ),
                  const SizedBox(height: 1),
                  Text(
                    widget.subtitle,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      color: widget.tint,
                      fontSize: 9.5,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}
