import 'package:flutter/material.dart';

import '../../api_client.dart';
import '../../theme/tokens.dart';
import '../../widgets/hero_logo.dart';
import 'admin_admins.dart';
import 'admin_cards.dart';
import 'admin_chat.dart';
import 'admin_dashboard.dart';
import 'admin_league.dart';
import 'admin_notifications.dart';
import 'admin_rewards.dart';
import 'admin_settings.dart';
import 'admin_support.dart';
import 'admin_users.dart';

/// Root shell for the in-app admin console: responsive layout that shows a
/// permanent side rail on tablets/desktop and a drawer + bottom nav on
/// phones, replacing the legacy drawer-only `AdminShell` for much easier
/// one-handed navigation across ten sections.
class AdminShell extends StatefulWidget {
  final ApiClient api;
  final VoidCallback onLogout;
  final bool dark;
  final VoidCallback onTheme;

  const AdminShell(
      {super.key,
      required this.api,
      required this.onLogout,
      required this.dark,
      required this.onTheme});

  @override
  State<AdminShell> createState() => _AdminShellState();
}

class _AdminShellState extends State<AdminShell> {
  int _index = 0;

  late final List<Widget> _pages = [
    AdminDashboard(api: widget.api),
    AdminCards(api: widget.api),
    AdminRewards(api: widget.api),
    AdminLeague(api: widget.api),
    AdminUsers(api: widget.api),
    AdminChat(api: widget.api),
    AdminSupport(api: widget.api),
    AdminNotifications(api: widget.api),
    AdminSettings(api: widget.api),
    AdminAdmins(api: widget.api),
  ];

  static const _titles = [
    'داشبورد',
    'کارت و کد',
    'جوایز',
    'لیگ',
    'کاربران',
    'چت',
    'پشتیبانی',
    'اطلاعیه‌ها',
    'تنظیمات',
    'ادمین‌ها'
  ];
  static const _icons = [
    Icons.dashboard_rounded,
    Icons.credit_card_rounded,
    Icons.card_giftcard_rounded,
    Icons.emoji_events_rounded,
    Icons.people_alt_rounded,
    Icons.chat_bubble_rounded,
    Icons.support_agent_rounded,
    Icons.campaign_rounded,
    Icons.settings_rounded,
    Icons.admin_panel_settings_rounded,
  ];

  void _select(int i) => setState(() => _index = i);

  @override
  Widget build(BuildContext context) {
    final isWide = Breakpoints.isTablet(MediaQuery.sizeOf(context).width);

    final scaffold = Scaffold(
      appBar: AppBar(
        title: Text('مدیریت قلقلی — ${_titles[_index]}'),
        actions: [
          IconButton(
              onPressed: widget.onTheme,
              icon: Icon(widget.dark
                  ? Icons.light_mode_rounded
                  : Icons.dark_mode_rounded)),
          IconButton(
              onPressed: widget.onLogout,
              icon: const Icon(Icons.logout_rounded)),
          const SizedBox(width: 4),
        ],
      ),
      drawer: isWide
          ? null
          : Drawer(
              child: SafeArea(
                child: _AdminNavList(
                  index: _index,
                  titles: _titles,
                  icons: _icons,
                  onSelect: (i) {
                    _select(i);
                    Navigator.pop(context);
                  },
                  onLogout: widget.onLogout,
                ),
              ),
            ),
      body: AnimatedSwitcher(
        duration: Motion.normal,
        child: KeyedSubtree(key: ValueKey(_index), child: _pages[_index]),
      ),
    );

    if (!isWide) return scaffold;

    return Scaffold(
      body: Row(
        children: [
          SizedBox(
            width: 248,
            child: Material(
              color: Theme.of(context).colorScheme.surfaceContainerLow,
              child: SafeArea(
                child: _AdminNavList(
                    index: _index,
                    titles: _titles,
                    icons: _icons,
                    onSelect: _select,
                    onLogout: widget.onLogout),
              ),
            ),
          ),
          const VerticalDivider(width: 1),
          Expanded(
            child: Scaffold(
              appBar: AppBar(
                title: Text('مدیریت قلقلی — ${_titles[_index]}'),
                actions: [
                  IconButton(
                      onPressed: widget.onTheme,
                      icon: Icon(widget.dark
                          ? Icons.light_mode_rounded
                          : Icons.dark_mode_rounded)),
                  const SizedBox(width: 8),
                ],
              ),
              body: AnimatedSwitcher(
                duration: Motion.normal,
                child:
                    KeyedSubtree(key: ValueKey(_index), child: _pages[_index]),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _AdminNavList extends StatelessWidget {
  final int index;
  final List<String> titles;
  final List<IconData> icons;
  final ValueChanged<int> onSelect;
  final VoidCallback onLogout;

  const _AdminNavList(
      {required this.index,
      required this.titles,
      required this.icons,
      required this.onSelect,
      required this.onLogout});

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(Gaps.md),
      children: [
        const Padding(
            padding: EdgeInsets.symmetric(vertical: Gaps.md),
            child: HeroLogo(logoWidth: 96, logoHeight: 80, titleSize: 18)),
        const Divider(),
        for (var i = 0; i < titles.length; i++)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 2),
            child: ListTile(
              selected: index == i,
              selectedTileColor:
                  Theme.of(context).colorScheme.primary.withValues(alpha: 0.12),
              shape: RoundedRectangleBorder(borderRadius: Corners.rMd),
              leading: Icon(icons[i]),
              title: Text(titles[i]),
              onTap: () => onSelect(i),
            ),
          ),
        const Divider(),
        ListTile(
          leading: const Icon(Icons.logout_rounded),
          title: const Text('خروج'),
          shape: RoundedRectangleBorder(borderRadius: Corners.rMd),
          onTap: onLogout,
        ),
      ],
    );
  }
}
