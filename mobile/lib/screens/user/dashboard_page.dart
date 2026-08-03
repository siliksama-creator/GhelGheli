import 'package:flutter/material.dart';

import '../../api_client.dart';
import '../../core/assets.dart';
import '../../theme/tokens.dart';
import '../../widgets/app_card.dart';
import '../../widgets/section_header.dart';
import '../../widgets/state_views.dart';
import '../shared/football_card.dart';
import '../shared/hero_header.dart';

/// Home / dashboard tab: points header, card-code redemption and card
/// inventory carousel. Same three API calls as the legacy `DashboardPage`.
class DashboardPage extends StatefulWidget {
  final ApiClient api;
  final Future<void> Function() reloadProfile;

  /// Jumps to the profile tab (used by the hero header + completion nudge).
  final VoidCallback? onOpenProfile;

  /// پرش مستقیم به کیف پول از هدر داشبورد.
  final VoidCallback? onOpenWallet;

  /// میان‌برهای گردونه و دعوت دوستان روی داشبورد.
  final VoidCallback? onOpenWheel;
  final VoidCallback? onOpenReferral;

  /// Light/dark switch, surfaced at the top of the dashboard.
  final VoidCallback? onToggleTheme;
  final bool isDark;

  const DashboardPage({
    super.key,
    required this.api,
    required this.reloadProfile,
    this.onOpenProfile,
    this.onOpenWallet,
    this.onOpenWheel,
    this.onOpenReferral,
    this.onToggleTheme,
    this.isDark = true,
  });

  @override
  State<DashboardPage> createState() => _DashboardPageState();
}

class _DashboardPageState extends State<DashboardPage> {
  Map<String, dynamic>? _data;
  List<Map<String, dynamic>> _rewards = [];
  final _code = TextEditingController();
  String? _message;
  bool _messageIsError = false;
  bool _sending = false;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _code.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    // try/catch لازم است، نه یک احتیاط اضافه.
    //
    // این متد قبلاً هیچ محافظتی نداشت. هر شکستی — توکن منقضی، شبکهٔ لرزان،
    // یک ۵۰۰ گذرا، حتی تایم‌اوت — استثنا پرتاب می‌کرد و خط `_loading =
    // false` **هرگز** اجرا نمی‌شد. داشبورد صفحهٔ اول بعد از ورود است، پس
    // کاربر تا ابد روی چرخنده می‌ماند بدون پیام و بدون دکمهٔ تلاش دوباره.
    // این همان «صفحات اپ بعد ورود لود نمیشن» است.
    //
    // Fetched together instead of one-after-the-other: the dashboard used to
    // wait for the SUM of both round trips before it could paint.
    try {
      final results = await widget.api.getAll(['/api/profile', '/api/rewards']);
      if (!mounted) return;
      setState(() {
        _data = Map<String, dynamic>.from(results[0]);
        _rewards = List<Map<String, dynamic>>.from(results[1]);
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

  Future<void> _redeem() async {
    setState(() {
      _sending = true;
      _message = null;
    });
    try {
      final r =
          await widget.api.post('/api/cards/redeem', {'code': _code.text});
      // The user can close this screen while the request is in flight;
      // calling setState after that throws "setState() called after
      // dispose()" and the error surfaces as a red screen in release mode.
      if (!mounted) return;
      setState(() {
        _message = '${r['message']} +${faNum(r['addedPoints'])} امتیاز';
        _messageIsError = false;
      });
      _code.clear();
      await _load();
      await widget.reloadProfile();
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _message = apiError(e);
        _messageIsError = true;
      });
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const LoadingView();

    // خطا و هیچ دادهٔ قبلی: راه خروج بده، نه صفحهٔ خالی یا چرخندهٔ ابدی.
    if (_error != null && _data == null) {
      return RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.all(Gaps.lg),
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
        padding: const EdgeInsets.fromLTRB(Gaps.lg, Gaps.md, Gaps.lg, Gaps.xxl),
        children: [
          HeroHeader(
            points: points,
            nickname: user?['nickname'] ?? 'قهرمان',
            nextReward: nextReward,
            user: user is Map ? Map<String, dynamic>.from(user) : null,
            onOpenProfile: widget.onOpenProfile,
            onOpenWallet: widget.onOpenWallet,
            onToggleTheme: widget.onToggleTheme,
            isDark: widget.isDark,
          ),
          Gaps.vMd,
          // دو میان‌بر: گردونهٔ روزانه و دعوت دوستان. روی داشبورد هستند چون
          // هر دو کاری‌اند که کاربر باید هر روز انجام دهد؛ اگر فقط از نوار
          // بالا باز می‌شدند، بیشترِ کاربرها هیچ‌وقت پیدایشان نمی‌کردند.
          Row(
            children: [
              Expanded(
                child: _QuickTile(
                  icon: '🎡',
                  title: 'گردونهٔ شانس',
                  subtitle: 'هر روز یک چرخش رایگان',
                  tint: const Color(0xFFF59E0B),
                  onTap: widget.onOpenWheel,
                ),
              ),
              Gaps.hXs,
              Expanded(
                child: _QuickTile(
                  icon: '🤝',
                  title: 'دعوت دوستان',
                  subtitle: '۵٪ امتیازشان + ۳ چرخش',
                  tint: const Color(0xFF84CC16),
                  onTap: widget.onOpenReferral,
                ),
              ),
            ],
          ),
          Gaps.vMd,
          AppCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                ClipRRect(
                  borderRadius: Corners.rLg,
                  // cacheWidth, not cacheHeight. With BoxFit.cover in a box
                  // WIDER than the source, the scale is set by WIDTH and the
                  // height is cropped — so the old `cacheHeight: 390`
                  // constrained the axis that does not bind. It produced a
                  // 700px-wide bitmap for a box needing ~1050px on a 412dp
                  // screen at 3x: softer than necessary AND still carrying
                  // the cropped-away rows.
                  //
                  // The asset itself is now pre-cropped to the displayed
                  // aspect (see tools/crop_banners.py), so decoding at its
                  // native 820 width costs less than the old hint did while
                  // being sharp instead of upscaled.
                  child: Image.asset('assets/brand/card_pack_banner.webp',
                      height: 130, fit: BoxFit.cover, cacheWidth: 820),
                ),
                Gaps.vMd,
                Text('ثبت کد کارت‌های قلقلی',
                    style: theme.textTheme.titleLarge),
                Gaps.vXxs,
                Text(
                  'پک کارت‌های قلقلی به‌صورت فیزیکی در فروشگاه‌ها و سوپرمارکت‌ها به فروش می‌رسند.',
                  style: theme.textTheme.bodySmall,
                ),
                Gaps.vMd,
                TextField(
                  controller: _code,
                  textCapitalization: TextCapitalization.characters,
                  decoration: const InputDecoration(
                      prefixIcon: Icon(Icons.qr_code_2_rounded),
                      labelText: 'کد طولانی روی کارت'),
                ),
                Gaps.vSm,
                FilledButton.icon(
                  icon: _sending
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(
                              strokeWidth: 2.2, color: Colors.white))
                      : const Icon(Icons.add_card_rounded),
                  label:
                      Text(_sending ? 'در حال ثبت...' : 'ثبت و دریافت امتیاز'),
                  onPressed: _sending ? null : _redeem,
                ),
                if (_message != null) ...[
                  Gaps.vSm,
                  _messageIsError
                      ? ErrorBanner(message: _message!)
                      : Container(
                          padding: const EdgeInsets.all(Gaps.sm),
                          decoration: BoxDecoration(
                            color: theme.colorScheme.primary
                                .withValues(alpha: 0.12),
                            borderRadius: Corners.rMd,
                          ),
                          child: Row(
                            children: [
                              Icon(Icons.check_circle_rounded,
                                  color: theme.colorScheme.primary, size: 18),
                              Gaps.hXs,
                              Expanded(
                                  child: Text(_message!,
                                      style: theme.textTheme.bodySmall)),
                            ],
                          ),
                        ),
                ],
              ],
            ),
          ),
          Gaps.vXl,
          const SectionHeader(title: 'موجودی کارت‌ها'),
          if (inventory.isEmpty)
            const AppCard(
              child: EmptyState(
                  icon: Icons.style_outlined,
                  title: 'هنوز کارتی در موجودی شما نیست',
                  message: 'یک کد کارت را ثبت کن تا اینجا نمایش داده شود.'),
            )
          else
            SizedBox(
              height: 222,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: inventory.length,
                separatorBuilder: (_, __) => Gaps.hMd,
                itemBuilder: (_, i) => FootballCard(item: inventory[i]),
              ),
            ),
        ],
      ),
    );
  }
}


/// کاشی میان‌بر روی داشبورد.
class _QuickTile extends StatelessWidget {
  const _QuickTile({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.tint,
    this.onTap,
  });

  final String icon;
  final String title;
  final String subtitle;
  final Color tint;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Material(
      color: tint.withValues(alpha: 0.10),
      borderRadius: Corners.rLg,
      child: InkWell(
        onTap: onTap,
        borderRadius: Corners.rLg,
        child: Container(
          // ۴۸ کف اندازهٔ هدف لمسی طبق راهنمای دسترس‌پذیری متریال.
          constraints: const BoxConstraints(minHeight: 48),
          padding: const EdgeInsets.symmetric(
              horizontal: Gaps.sm, vertical: Gaps.md),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(icon, style: const TextStyle(fontSize: 26)),
              Gaps.vXxs,
              Text(title,
                  textAlign: TextAlign.center,
                  style: theme.textTheme.labelLarge
                      ?.copyWith(fontWeight: FontWeight.w800)),
              Text(subtitle,
                  textAlign: TextAlign.center,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.labelSmall?.copyWith(
                    color:
                        theme.colorScheme.onSurface.withValues(alpha: 0.6),
                  )),
            ],
          ),
        ),
      ),
    );
  }
}
