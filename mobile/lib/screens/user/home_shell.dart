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
import 'wallet_page.dart';
import 'support_page.dart';

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
      onToggleTheme: widget.onTheme,
      isDark: widget.dark,
    ),
    RewardsPage(api: widget.api),
    WalletPage(api: widget.api, reloadProfile: _loadProfile),
    LeaguePage(api: widget.api),
    SocialPage(api: widget.api),
    SupportPage(api: widget.api),
    ProfilePage(api: widget.api, reloadProfile: _loadProfile),
  ];

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
    try {
      final d = await widget.api.get('/api/profile');
      if (mounted) setState(() => _profile = Map<String, dynamic>.from(d));
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
    'پروفایل'
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
                  width: 30, height: 30, fit: BoxFit.cover),
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

