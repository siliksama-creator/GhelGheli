import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';

import '../../api_client.dart';
import '../../widgets/notification_bell.dart';
import 'social_page.dart';
import 'dashboard_page.dart';
import 'league_page.dart';
import 'profile_page.dart';
import 'rewards_page.dart';
import 'shop_page.dart';
import 'wallet_page.dart';
import 'support_page.dart';
import 'wheel_page.dart';
import 'referral_page.dart';

/// Root shell for the regular user app: top bar + animated page switcher +
/// bottom navigation. Functionally identical to the legacy `HomeShell`
/// (same 6 tabs, same profile reload plumbing, same FCM registration).
class HomeShell extends StatefulWidget {
  final ApiClient api;
  final VoidCallback onLogout;
  final bool dark;
  final VoidCallback onTheme;

  const HomeShell(
      {super.key,
      required this.api,
      required this.onLogout,
      required this.dark,
      required this.onTheme});

  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell>
    with SingleTickerProviderStateMixin {
  int _index = 0;
  Map<String, dynamic>? _profile;

  /// تعداد چرخش گردونهٔ در دسترس، برای نشانِ کنار آیکون نوار بالا.
  ///
  /// مالک: «کنار آیکون گردونه در صفحه اصلی تعداد شانس روز گردونه برای
  /// کاربرا مشخص باشه». null یعنی هنوز نمی‌دانیم — نشان اصلاً کشیده
  /// نمی‌شود تا از یک «۰» گذرا که بعد به «۱» می‌پرد جلوگیری شود.
  int? _spins;

  /// حساب تست مالک: به‌جای «۹۹۹۹۹۹» نشانِ «∞» نشان داده می‌شود.
  bool _unlimitedSpins = false;

  // A subtle one-shot "welcome" entrance the moment the user lands on the
  // home shell after logging in — fades and lifts the whole shell into
  // place instead of just snapping onto the screen, so the first thing a
  // user feels after signing in is a small, polished moment of delight.
  late final AnimationController _entrance = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 520),
  )..forward();
  late final Animation<double> _entranceFade =
      CurvedAnimation(parent: _entrance, curve: Curves.easeOut);
  late final Animation<Offset> _entranceSlide = Tween(
    begin: const Offset(0, 0.04),
    end: Offset.zero,
  ).animate(CurvedAnimation(parent: _entrance, curve: Curves.easeOutCubic));

  List<Widget> get _pages => [
    DashboardPage(
      api: widget.api,
      reloadProfile: _loadProfile,
      onOpenProfile: () => setState(() => _index = 6),
      onOpenWallet: () => setState(() => _index = _walletIndex),
      onOpenWheel: () => setState(() => _index = wheelIndex),
      onOpenReferral: () => setState(() => _index = referralIndex),
      onToggleTheme: widget.onTheme,
      isDark: widget.dark,
    ),
    _RewardsShopTab(api: widget.api),
    WalletPage(api: widget.api, reloadProfile: _loadProfile),
    LeaguePage(api: widget.api),
    SocialPage(api: widget.api),
    SupportPage(api: widget.api),
    ProfilePage(api: widget.api, reloadProfile: _loadProfile),
    // ۷ و ۸ در نوار پایین نیستند: از آیکون گردونه در نوار بالا و از
    // میان‌برهای داشبورد باز می‌شوند. نوار پایین طبق راهنمای متریال
    // حداکثر پنج مقصد دارد و شلوغ کردنش همان مشکلی بود که قبلاً حل شد.
    WheelPage(
      api: widget.api,
      onChanged: _loadProfile,
      // بعد از هر چرخش، نشانِ نوار بالا فوراً به‌روز می‌شود — وگرنه کاربر
      // می‌چرخاند و عدد کنار آیکون هنوز قدیمی است.
      onSpinsChanged: (n, unlimited) {
        if (!mounted) return;
        if (n != _spins || unlimited != _unlimitedSpins) {
          setState(() {
            _spins = n;
            _unlimitedSpins = unlimited;
          });
        }
      },
    ),
    ReferralPage(api: widget.api),
  ];

  /// شمارهٔ صفحهٔ گردونه — از آیکون نوار بالا مستقیم به آن پرش می‌شود.
  static const wheelIndex = 7;
  static const referralIndex = 8;

  // UI FIX: seven destinations squeezed into one bar made every icon and
  // label tiny (and the Persian labels were truncating). Material's own
  // guidance caps a navigation bar at five.
  //
  // کیف پول از نوار پایین به «بیشتر» منتقل شد و به‌جایش یک ورودی بزرگ و
  // واضح در هدر داشبورد (همان‌جا که «سلام ...» نوشته شده) نشسته است. آنجا
  // موجودی واقعی هم دیده می‌شود، پس هم دم‌دست‌تر است و هم اطلاعات بیشتری
  // می‌دهد تا یک آیکون کوچک در نوار پایین.
  static const _navIndexes = [0, 1, 3, 4];
  static const _moreIndexes = [2, 5, 6];

  /// شمارهٔ صفحهٔ کیف پول — از هدر داشبورد مستقیم به آن پرش می‌شود.
  static const _walletIndex = 2;

  static const _destinations = [
    NavigationDestination(
        icon: Icon(Icons.home_outlined),
        selectedIcon: Icon(Icons.home_rounded),
        label: 'خانه'),
    NavigationDestination(
        icon: Icon(Icons.card_giftcard_outlined),
        selectedIcon: Icon(Icons.card_giftcard_rounded),
        label: 'جوایز'),
    NavigationDestination(
        icon: Icon(Icons.account_balance_wallet_outlined),
        selectedIcon: Icon(Icons.account_balance_wallet_rounded),
        label: 'کیف پول'),
    NavigationDestination(
        icon: Icon(Icons.emoji_events_outlined),
        selectedIcon: Icon(Icons.emoji_events_rounded),
        label: 'لیگ'),
    NavigationDestination(
        icon: Icon(Icons.sports_esports_outlined),
        selectedIcon: Icon(Icons.sports_esports_rounded),
        label: 'چت و بازی'),
    NavigationDestination(
        icon: Icon(Icons.support_agent_outlined),
        selectedIcon: Icon(Icons.support_agent_rounded),
        label: 'پشتیبانی'),
    NavigationDestination(
        icon: Icon(Icons.person_outline_rounded),
        selectedIcon: Icon(Icons.person_rounded),
        label: 'پروفایل'),
  ];

  @override
  void initState() {
    super.initState();
    _loadProfile();
    // Firebase init + permission prompt can take seconds on a cold start and
    // nothing on screen depends on it, so let the first frames render first.
    WidgetsBinding.instance.addPostFrameCallback((_) => _registerFcm());
  }

  @override
  void dispose() {
    _entrance.dispose();
    super.dispose();
  }

  Future<void> _loadProfile() async {
    // /api/bootstrap به‌جای /api/profile: همان داده را می‌دهد به‌علاوهٔ
    // جوایز و وضعیت گردونه، در یک رفت‌وبرگشت. داشبورد هم از همین
    // می‌خواند، پس این پاسخ عملاً کش گرم را برای هر دو پر می‌کند.
    try {
      final d = await widget.api.get('/api/bootstrap');
      if (!mounted || d is! Map) return;
      final m = Map<String, dynamic>.from(d);
      // پاسخ ناقص را «موفق» حساب نکن — وگرنه هدر با نام خالی رندر می‌شود.
      if (m['user'] is! Map) return;
      final w = m['wheel'];
      setState(() {
        _profile = <String, dynamic>{
          'user': m['user'],
          'inventory': m['inventory'] ?? const [],
          'leaguePayouts': m['leaguePayouts'] ?? const [],
        };
        // شمارندهٔ گردونه هم از همین پاسخ می‌آید، پس نشانِ نوار بالا
        // هم‌زمان با بقیهٔ هدر ظاهر می‌شود نه نیم ثانیه بعد.
        if (w is Map) {
          _spins = (w['spinsLeft'] as num?)?.toInt() ?? _spins;
          _unlimitedSpins = w['unlimited'] == true;
        }
      });
    } catch (_) {
      // Non-fatal: dashboard/profile pages fetch their own data too.
    }
  }

  Future<void> _registerFcm() async {
    try {
      await Firebase.initializeApp();
      await FirebaseMessaging.instance.requestPermission();
      final token = await FirebaseMessaging.instance.getToken();
      if (token != null) {
        await widget.api.patch('/api/profile', {'fcmToken': token});
      }
    } catch (_) {
      // Push notifications are optional; ignore failures (e.g. no Firebase config).
    }
  }

  static const List<String> _titles = [
    'خانه',
    'جوایز',
    'کیف پول',
    'لیگ',
    'چت و بازی',
    'پشتیبانی',
    'پروفایل',
    'گردونهٔ شانس',
    'دعوت دوستان'
  ];

  /// Which bar slot to highlight — the "more" slot when a sheet-only page
  /// is open, otherwise the matching tab.
  int get _barSelection {
    final i = _navIndexes.indexOf(_index);
    return i == -1 ? _navIndexes.length : i;
  }

  void _onNavTap(int slot) {
    if (slot < _navIndexes.length) {
      setState(() => _index = _navIndexes[slot]);
    } else {
      _openMore();
    }
  }

  Future<void> _openMore() async {
    final picked = await showModalBottomSheet<int>(
      context: context,
      showDragHandle: true,
      builder: (sheetContext) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            for (final i in _moreIndexes)
              ListTile(
                leading: Icon(_index == i
                    ? (_destinations[i].selectedIcon as Icon).icon
                    : (_destinations[i].icon as Icon).icon),
                title: Text(_titles[i]),
                selected: _index == i,
                onTap: () => Navigator.pop(sheetContext, i),
              ),
            ListTile(
              leading: Icon(
                  widget.dark ? Icons.light_mode_rounded : Icons.dark_mode_rounded),
              title: Text(widget.dark ? 'حالت روشن' : 'حالت تیره'),
              onTap: () {
                Navigator.pop(sheetContext);
                widget.onTheme();
              },
            ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
    if (picked != null && mounted) setState(() => _index = picked);
  }

  @override
  Widget build(BuildContext context) {
    final nickname = _profile?['user']?['nickname'];
    return Scaffold(
      appBar: AppBar(
        titleSpacing: 20,
        title: Row(
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(8),
              child: Image.asset('assets/brand/logo.webp',
                  width: 30, height: 30, fit: BoxFit.cover,
                  // 30 logical px on screen, from a 720x595 source. Without
                  // this hint Flutter decoded the full 1.63 MB bitmap and
                  // kept it resident for the entire session — the app bar is
                  // on every screen — to draw a 30px square. 90px covers a
                  // 3x display.
                  cacheWidth: 90),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                _index == 0 && nickname != null
                    ? 'سلام $nickname 👋'
                    : _titles[_index],
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ],
        ),
        actions: [
          // The theme switch moved into the "بیشتر" sheet, leaving the bar
          // uncluttered with just notifications + logout.
          // میان‌بر گردونه — درخواست مالک: «در صفحه اصلی بالا آیکون کوچیک
          // گردونه باشه که به صفحه گردونه منتقل بشن».
          _WheelButton(
            spins: _spins,
            unlimited: _unlimitedSpins,
            onPressed: () => setState(() => _index = wheelIndex),
          ),
          NotificationBell(api: widget.api),
          IconButton(
              tooltip: 'خروج',
              onPressed: widget.onLogout,
              icon: const Icon(Icons.logout_rounded)),
          const SizedBox(width: 4),
        ],
      ),
      body: FadeTransition(
        opacity: _entranceFade,
        child: SlideTransition(
          position: _entranceSlide,
          child: AnimatedSwitcher(
            duration: const Duration(milliseconds: 260),
            switchInCurve: Curves.easeOut,
            switchOutCurve: Curves.easeIn,
            transitionBuilder: (child, animation) =>
                FadeTransition(opacity: animation, child: child),
            child: KeyedSubtree(key: ValueKey(_index), child: _pages[_index]),
          ),
        ),
      ),
      bottomNavigationBar: NavigationBar(
        // Taller bar + always-visible labels: the default height with seven
        // items clipped the Persian text.
        height: 68,
        labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
        selectedIndex: _barSelection,
        onDestinationSelected: _onNavTap,
        destinations: [
          for (final i in _navIndexes) _destinations[i],
          NavigationDestination(
            icon: Icon(_moreIndexes.contains(_index)
                ? Icons.more_horiz_rounded
                : Icons.more_horiz_outlined),
            selectedIcon: const Icon(Icons.more_horiz_rounded),
            label: 'بیشتر',
          ),
        ],
      ),
    );
  }
}



/// Rewards and the shop share one tab.
///
/// An eighth bottom-nav destination would crowd the bar past the point where
/// Persian labels stay readable, and the two belong together: both are where
/// a user spends what they have earned.
class _RewardsShopTab extends StatefulWidget {
  const _RewardsShopTab({required this.api});
  final ApiClient api;

  @override
  State<_RewardsShopTab> createState() => _RewardsShopTabState();
}

class _RewardsShopTabState extends State<_RewardsShopTab> {
  int _sub = 0;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
          child: SegmentedButton<int>(
            segments: const [
              ButtonSegment(value: 0, label: Text('جوایز'), icon: Icon(Icons.card_giftcard_rounded)),
              ButtonSegment(value: 1, label: Text('فروشگاه'), icon: Icon(Icons.storefront_rounded)),
            ],
            selected: {_sub},
            onSelectionChanged: (v) => setState(() => _sub = v.first),
          ),
        ),
        Expanded(
          child: _sub == 0
              ? RewardsPage(api: widget.api)
              : ShopPage(api: widget.api),
        ),
      ],
    );
  }
}


/// آیکون گردونه با نشانِ تعداد چرخش.
///
/// نشان روی خود دکمه می‌نشیند تا در نگاه اول دیده شود؛ اگر فقط داخل صفحهٔ
/// گردونه بود، کاربر باید وارد می‌شد تا بفهمد اصلاً چرخشی دارد یا نه.
class _WheelButton extends StatelessWidget {
  const _WheelButton({
    required this.spins,
    required this.unlimited,
    required this.onPressed,
  });

  final int? spins;
  final bool unlimited;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final n = spins ?? 0;
    final label = unlimited ? '∞' : faNum(n);
    return Stack(
      clipBehavior: Clip.none,
      children: [
        IconButton(
          tooltip: n > 0 ? '$n چرخش گردونه داری' : 'گردونهٔ شانس',
          onPressed: onPressed,
          icon: const Text('🎡', style: TextStyle(fontSize: 20)),
        ),
        if (n > 0)
          Positioned(
            top: 4,
            right: 2,
            child: IgnorePointer(
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 4),
                constraints: const BoxConstraints(minWidth: 17, minHeight: 17),
                decoration: BoxDecoration(
                  color: const Color(0xFFF43F5E),
                  borderRadius: BorderRadius.circular(999),
                  // حلقهٔ هم‌رنگ نوار بالا: بدون آن، نشان روی لبهٔ آیکون
                  // محو می‌شود.
                  border: Border.all(
                    color: Theme.of(context).appBarTheme.backgroundColor
                        ?? Theme.of(context).colorScheme.surface,
                    width: 2,
                  ),
                ),
                child: Center(
                  child: Text(
                    label,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 10,
                      fontWeight: FontWeight.w900,
                      height: 1.1,
                    ),
                  ),
                ),
              ),
            ),
          ),
      ],
    );
  }
}
