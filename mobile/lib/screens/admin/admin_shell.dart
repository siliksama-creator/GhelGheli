import 'package:flutter/material.dart';

import '../../api_client.dart';
import '../../theme/colors.dart';
import '../../theme/tokens.dart';
import '../../widgets/hero_logo.dart';
import 'admin_admins.dart';
import 'admin_photo_cards.dart';
import 'admin_chat.dart';
import 'admin_dashboard.dart';
import 'admin_league.dart';
import 'admin_points.dart';
import 'admin_metrics.dart';
import 'admin_analytics.dart';
import 'admin_notifications.dart';
import 'admin_rewards.dart';
import 'admin_game_rewards.dart';
import 'admin_settings.dart';
import 'admin_support.dart';
import 'admin_users.dart';
import 'admin_wallet.dart';

/// Root shell for the in-app admin console: responsive layout that shows a
/// permanent side rail on tablets/desktop and a drawer + bottom nav on
/// phones, replacing the legacy drawer-only `AdminShell` for much easier
/// one-handed navigation across ten sections.
class AdminShell extends StatefulWidget {
  final ApiClient api;
  final VoidCallback onLogout;

  // `dark` و `onTheme` حذف شدند — اپ تک‌تم است (توضیح در main.dart).
  const AdminShell({super.key, required this.api, required this.onLogout});

  @override
  State<AdminShell> createState() => _AdminShellState();
}

class _AdminShellState extends State<AdminShell> {
  int _index = 0;

  late final List<Widget> _pages = [
    AdminDashboard(api: widget.api),
    // ═══════════════════════════════════════════════════════════════════
    // چرا تبِ «کارت و کد» حذف شد
    // ═══════════════════════════════════════════════════════════════════
    //
    // دو تب وجود داشت که هر دو «کارت تعریف می‌کردند»: `AdminCards`
    // (سیستمِ قدیمیِ کد-تنها، جدولِ `card_codes`) و `AdminPhotoCards`
    // (سیستمِ فعلی، جدولِ `photo_card_codes`).
    //
    // مسیرِ قدیمی از سمتِ کاربر حذف شده — فرمِ «فقط کد» نه در وب‌اپ هست
    // و نه در داشبوردِ اندروید. پس کدی که در تبِ قدیمی ساخته می‌شد
    // **هیچ‌وقت قابلِ خرج کردن نبود**: مدیر پیامِ «ثبت شد» می‌گرفت، کد
    // را چاپ می‌کرد، و کاربر با آن به هیچ‌جا نمی‌رسید. بدونِ هیچ خطایی.
    //
    //  فقط رابط رفت، نه داده: جدول و مسیرهای سرور دست‌نخورده‌اند چون
    //    کدهای مصرف‌شده در تاریخچهٔ کاربران به آن‌ها ارجاع دارند.
    AdminPhotoCards(api: widget.api),
    AdminRewards(api: widget.api),
    AdminWallet(api: widget.api),
    AdminLeague(api: widget.api),
    AdminPoints(api: widget.api),
    AdminUsers(api: widget.api),
    AdminChat(api: widget.api),
    AdminGameRewards(api: widget.api),
    AdminSupport(api: widget.api),
    AdminNotifications(api: widget.api),
    AdminSettings(api: widget.api),
    AdminAdmins(api: widget.api),
    AdminAnalytics(api: widget.api),
    AdminMetrics(api: widget.api),
  ];

  static const _titles = [
    'داشبورد',
    'ثبت کارت',
    'جوایز',
    'کیف پول',
    'لیگ',
    'ریز امتیازات',
    'کاربران',
    'چت',
    'امتیاز بازی',
    'پشتیبانی',
    'اطلاعیه‌ها',
    'تنظیمات',
    'ادمین‌ها',
    'تحلیل رشد و خطا',
    'مانیتورینگ'
  ];
  static const _icons = [
    Icons.dashboard_rounded,
    Icons.document_scanner_rounded,
    Icons.card_giftcard_rounded,
    Icons.account_balance_wallet_rounded,
    Icons.emoji_events_rounded,
    Icons.trending_up_rounded,
    Icons.people_alt_rounded,
    Icons.chat_bubble_rounded,
    Icons.sports_esports_rounded,
    Icons.support_agent_rounded,
    Icons.campaign_rounded,
    Icons.settings_rounded,
    Icons.admin_panel_settings_rounded,
    Icons.insights_rounded,
    Icons.analytics_rounded,
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
      body: _AdminBackdrop(
        child: AnimatedSwitcher(
          duration: Motion.normal,
          child: KeyedSubtree(key: ValueKey(_index), child: _pages[_index]),
        ),
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
                actions: const [SizedBox(width: 8)],
              ),
              body: _AdminBackdrop(
                child: AnimatedSwitcher(
                  duration: Motion.normal,
                  child: KeyedSubtree(
                      key: ValueKey(_index), child: _pages[_index]),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _AdminBackdrop extends StatelessWidget {
  const _AdminBackdrop({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      // همان حس بصریِ اپ کاربر، ولی کمی رسمی‌تر برای پنل مدیریت: سطح
      // تیرهٔ تخت نبود، اما به خاطر گرادیان‌های ارزان هیچ هزینهٔ رندر
      // قابل‌توجهی هم اضافه نمی‌شود.
      decoration: const BoxDecoration(
        color: BrandColors.darkBg,
        gradient: RadialGradient(
          center: Alignment(0.86, -0.98),
          radius: 1.18,
          colors: [Color(0x2522C58B), Color(0x00060D18)],
        ),
      ),
      child: child,
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
        Container(
          margin: const EdgeInsets.only(bottom: Gaps.sm),
          padding: const EdgeInsets.symmetric(
              horizontal: Gaps.md, vertical: Gaps.lg),
          decoration: BoxDecoration(
            borderRadius: Corners.rXl,
            gradient: const LinearGradient(
              begin: Alignment.topRight,
              end: Alignment.bottomLeft,
              colors: [Color(0xFF12345F), Color(0xFF0B1B31)],
            ),
            border: Border.all(color: Colors.white.withValues(alpha: 0.10)),
            boxShadow: [
              BoxShadow(
                color: BrandColors.emerald.withValues(alpha: 0.10),
                blurRadius: 24,
                offset: const Offset(0, 12),
              ),
            ],
          ),
          child: const Column(
            children: [
              HeroLogo(logoWidth: 96, logoHeight: 80, titleSize: 18),
              SizedBox(height: 8),
              Text('پنل مدیریت ۲۰۲۶',
                  style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800)),
            ],
          ),
        ),
        const Divider(),
        for (var i = 0; i < titles.length; i++)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 2),
            child: ListTile(
              selected: index == i,
              selectedTileColor:
                  Theme.of(context).colorScheme.primary.withValues(alpha: 0.14),
              selectedColor: BrandColors.emerald,
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
