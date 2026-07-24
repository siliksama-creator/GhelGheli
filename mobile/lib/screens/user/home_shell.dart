import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';

import '../../api_client.dart';
import 'chat_page.dart';
import 'dashboard_page.dart';
import 'league_page.dart';
import 'profile_page.dart';
import 'rewards_page.dart';
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

  late final List<Widget> _pages = [
    DashboardPage(api: widget.api, reloadProfile: _loadProfile),
    RewardsPage(api: widget.api),
    LeaguePage(api: widget.api),
    ChatPage(api: widget.api),
    SupportPage(api: widget.api),
    ProfilePage(api: widget.api, reloadProfile: _loadProfile),
  ];

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
        icon: Icon(Icons.emoji_events_outlined),
        selectedIcon: Icon(Icons.emoji_events_rounded),
        label: 'لیگ'),
    NavigationDestination(
        icon: Icon(Icons.chat_bubble_outline_rounded),
        selectedIcon: Icon(Icons.chat_bubble_rounded),
        label: 'چت روم'),
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
    _registerFcm();
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
      if (token != null)
        await widget.api.patch('/api/profile', {'fcmToken': token});
    } catch (_) {
      // Push notifications are optional; ignore failures (e.g. no Firebase config).
    }
  }

  static const List<String> _titles = [
    'خانه',
    'جوایز',
    'لیگ',
    'چت روم',
    'پشتیبانی',
    'پروفایل'
  ];

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
          IconButton(
            tooltip: widget.dark ? 'حالت روشن' : 'حالت تیره',
            onPressed: widget.onTheme,
            icon: Icon(widget.dark
                ? Icons.light_mode_rounded
                : Icons.dark_mode_rounded),
          ),
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
        selectedIndex: _index,
        onDestinationSelected: (i) => setState(() => _index = i),
        destinations: _destinations,
      ),
    );
  }
}

