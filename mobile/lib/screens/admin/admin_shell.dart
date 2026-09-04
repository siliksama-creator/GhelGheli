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
import 'admin_game_economy.dart';
import 'admin_wheel.dart';
import 'admin_card_box.dart';
import 'admin_settings.dart';
import 'admin_live_copy.dart';
import 'admin_support.dart';
import 'admin_users.dart';
import 'admin_wallet.dart';
import 'admin_shop.dart';
import 'admin_pass.dart';
import 'admin_missions.dart';
import 'admin_engine.dart';
import '../../widgets/scroll_hint.dart';

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

  // ترتیبِ منو = ترتیبِ NAVِ وب (admin/src/main.jsx)، یعنی دسته‌به‌دسته.
  // هر پنج فهرستِ این فایل با هم هم‌شاخص‌اند: یکی جابه‌جا شود، بقیه هم باید
  // جابه‌جا شوند — گاردِ admin-copy-parity تعدادِ هر پنج را می‌شمارد و
  // برچسبِ گروه‌ها را با وب واژه‌به‌واژه مقایسه می‌کند.
  late final List<Widget> _pages = [
    AdminDashboard(api: widget.api),
    AdminAnalytics(api: widget.api),
    AdminMetrics(api: widget.api),
    AdminPhotoCards(api: widget.api),
    AdminShop(api: widget.api),
    AdminCardBox(api: widget.api),
    AdminPass(api: widget.api),
    AdminMissions(api: widget.api),
    AdminRewards(api: widget.api),
    AdminWallet(api: widget.api),
    AdminLeague(api: widget.api),
    AdminGameRewards(api: widget.api),
    AdminGameEconomy(api: widget.api),
    AdminWheel(api: widget.api),
    AdminUsers(api: widget.api),
    AdminPoints(api: widget.api),
    AdminChat(api: widget.api),
    AdminSupport(api: widget.api),
    AdminNotifications(api: widget.api),
    AdminSettings(api: widget.api),
    AdminLiveCopy(api: widget.api),
    AdminEngine(api: widget.api),
    AdminAdmins(api: widget.api),
  ];

  static const _titles = [
    'داشبورد',
    'تحلیل رشد و خطا',
    'مانیتورینگ سرور',
    'ثبت کارت',
    'فروشگاه',
    'صندوق کارت',
    'گذر نبرد',
    'ماموریت‌ها',
    'جوایز',
    'کیف پول',
    'لیگ ماهانه',
    'امتیاز بازی',
    'اقتصاد بازی',
    'گردونه شانس',
    'کاربران',
    'ریز امتیازات',
    'چت',
    'پشتیبانی',
    'اطلاعیه‌ها',
    'تنظیمات',
    'متن‌های زنده',
    'موتور',
    'ادمین‌ها',
  ];
  static const _icons = [
    Icons.dashboard_rounded,
    Icons.insights_rounded,
    Icons.analytics_rounded,
    Icons.document_scanner_rounded,
    Icons.storefront_rounded,
    Icons.inventory_2_rounded,
    Icons.layers_rounded,
    Icons.flag_rounded,
    Icons.card_giftcard_rounded,
    Icons.account_balance_wallet_rounded,
    Icons.emoji_events_rounded,
    Icons.sports_esports_rounded,
    Icons.monetization_on_rounded,
    Icons.casino_rounded,
    Icons.people_alt_rounded,
    Icons.trending_up_rounded,
    Icons.chat_bubble_rounded,
    Icons.support_agent_rounded,
    Icons.campaign_rounded,
    Icons.settings_rounded,
    Icons.text_snippet_rounded,
    Icons.tune_rounded,
    Icons.admin_panel_settings_rounded,
  ];

  // توضیحِ یک‌خطیِ هر صفحه زیر عنوانش — همان هدفِ زیرنویسِ پنل وب:
  // مدیر قبل از هر دکمه‌ای بداند این صفحه چه می‌کند و تغییراتش کجا
  // می‌نشیند.
  static const _subtitles = [
    'خلاصهٔ یک‌نگاهی: کاربران، فروش، بازی‌ها و هشدارها — فقط خواندنی.',
    'نمودار رشد، قیف بازی‌ها و صندوق خطاهای اپ — فقط خواندنی.',
    'سلامت سرور و سرویس‌ها — فقط مانیتورینگ.',
    'ثبت کارت‌های فیزیکی با عکس؛ کارتِ تأییدشده وارد کاتالوگِ صندوق و دوئل می‌شود.',
    'آیتم‌های فروشگاه — هر تغییری همان لحظه در فروشگاهِ کاربران می‌نشیند، بدون آپدیت اپ.',
    'شانسِ هر کلاس، قیمت و روشن/خاموش‌کردن فروش صندوق + تاریخچهٔ خریدها.',
    'فصل‌های گذر نبرد، پله‌های XP و جایزهٔ هر پله — قابل تغییر بدون آپدیت.',
    'ماموریت‌های روزانه و هفتگی + جایزهٔ هر ماموریت و جایزهٔ تکمیلِ همه.',
    'ساخت و ویرایش جایزه‌ها و تأیید درخواست‌های کاربران.',
    'تراکنش‌های کیف پول، برداشت‌ها و واریز/برداشت دستی.',
    'لیگ ماهانه: شروع و پایان فصل و جوایز نفرات برتر.',
    'امتیازِ هر بازی و ضریب‌های جایزه.',
    'اهرم‌های اقتصادی بازی‌ها: هزینه‌ها، جوایز و سقف‌های روزانه.',
    'جایزه‌های گردونه و شانسِ هر بخش؛ جمع شانس‌ها باید ۱۰۰٪ باشد.',
    'جست‌وجوی کاربر، پروفایل و موجودی + ابزارهای دستی (امتیاز، بن، حذف).',
    'دفترِ امتیاز: هر کاربر چه مقدار، از کجا گرفت و کجا خرج کرد.',
    'پیامِ سنجاق‌شدهٔ بالای چت، فیلتر کلمات و گزارش‌های کاربران.',
    'تیکت‌های کاربران: پاسخ بدهید یا ببندید.',
    'ارسال اطلاعیهٔ push به همه یا گروهی از کاربران.',
    'تنظیمات چت و پیامک + نسخهٔ اجباری، بنر اطلاعیه و چیدمان تب‌ها.',
    'هرچه کاربر در وب و اندروید می‌خواند: جمله‌ها و عددهایش، با پیش‌نمایشِ زنده.',
    'سقف‌ها و اعدادِ عملیاتی سیستم — هر عدد توضیح دارد.',
    'حساب‌های ادمین و نقش‌ها + کارنامهٔ تغییرات.',
  ];

  // گروه‌ها (۳.۲). همین کلیدها و همین ترتیب، عضوِ ششمِ هر ردیفِ NAV در
  // `admin/src/main.jsx` است. فهرستِ *جدا* نگه داشته شد، نه چسبیده به
  // `_titles`: آن فهرست در AppBar برای عنوانِ خودِ صفحه خوانده می‌شود و
  // آلوده‌کردنش یعنی «داشبورد · امروزِ سیستم» در تیترِ صفحه.
  static const _adminNavGroups = [
    'today',
    'today',
    'today',
    'cards',
    'cards',
    'cards',
    'rewards',
    'rewards',
    'rewards',
    'rewards',
    'rewards',
    'games',
    'games',
    'games',
    'people',
    'people',
    'talk',
    'talk',
    'talk',
    'config',
    'config',
    'config',
    'admin',
  ];

  static const _groupLabels = {
    'today': 'امروزِ سیستم',
    'cards': 'کارت و فروشگاه',
    'rewards': 'جایزه و درآمد',
    'games': 'بازی‌ها',
    'people': 'کاربران',
    'talk': 'گفت‌وگو و اطلاع‌رسانی',
    'config': 'پیکربندیِ متن و اپ',
    'admin': 'حساب‌های ادمین',
  };

  void _select(int i) => setState(() => _index = i);

  /// شاخصِ صفحاتی که نقشِ ادمینِ واردشده اجازهٔ دیدنشان دارد.
  ///
  /// فقط برای رابط کاربری است (بک‌اند در هر صورت ۴۰۳ می‌دهد). فهرست‌های
  /// ثابتِ `_pages/_titles/...` دست‌نخورده می‌مانند تا با NAVِ وب و گاردِ
  /// admin-copy-parity یکی بمانند؛ اینجا فقط زیرمجموعه‌ای از شاخص‌ها رندر
  /// می‌شود.
  ///   observer     → فقط داشبورد (۰) و پشتیبانی (۱۷)
  ///   support      → همه به‌جز «ادمین‌ها» (۲۲) که super_admin-only است
  ///   super_admin  → همه
  List<int> get _allowedIndices {
    final role = widget.api.adminRole;
    if (role == 'super_admin') {
      return List<int>.generate(_pages.length, (i) => i);
    }
    if (role == 'observer') return const [0, 17];
    return [for (var i = 0; i < _pages.length; i++) if (i != 22) i];
  }

  @override
  Widget build(BuildContext context) {
    final isWide = Breakpoints.isTablet(MediaQuery.sizeOf(context).width);
    final allowed = _allowedIndices;
    // اگر شاخص فعلی برای این نقش مجاز نبود (نشستِ قدیمی)، به نخستین
    // صفحهٔ مجاز برمی‌گردیم — بعد از فریم تا در میانهٔ build setState نزنیم.
    if (!allowed.contains(_index)) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) setState(() => _index = allowed.first);
      });
    }
    final currentIndex =
        allowed.contains(_index) ? _index : allowed.first;

    // زیرفهرست‌های فیلترشده برای منو — فهرست‌های ثابت دست‌نخورده می‌مانند
    // (گاردِ پاریتی تعداد کامل را می‌شمارد) و فقط آیتم‌های مجاز رندر می‌شوند.
    final navTitles = [for (final i in allowed) _titles[i]];
    final navIcons = <IconData>[for (final i in allowed) _icons[i]];
    final navGroups = [for (final i in allowed) _adminNavGroups[i]];

    final scaffold = Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text('مدیریت قلقلی — ${_titles[currentIndex]}',
                style: const TextStyle(fontSize: 17)),
            Text(
              _subtitles[currentIndex],
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontSize: 10.5, color: Colors.white60),
            ),
          ],
        ),
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
                  index: allowed.indexOf(currentIndex),
                  titles: navTitles,
                  icons: navIcons,
                  groups: navGroups,
                  groupLabels: _groupLabels,
                  onSelect: (pos) {
                    _select(allowed[pos]);
                    Navigator.pop(context);
                  },
                  onLogout: widget.onLogout,
                ),
              ),
            ),
      body: _AdminBackdrop(
        child: AnimatedSwitcher(
          duration: Motion.normal,
          child: KeyedSubtree(
            key: ValueKey(currentIndex),
            child: ScrollHint(
              hintLabel: 'پایین‌تر هم هست',
              child: _pages[currentIndex],
            ),
          ),
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
                    index: allowed.indexOf(currentIndex),
                    titles: navTitles,
                    icons: navIcons,
                    groups: navGroups,
                    groupLabels: _groupLabels,
                    onSelect: (pos) => _select(allowed[pos]),
                    onLogout: widget.onLogout),
              ),
            ),
          ),
          const VerticalDivider(width: 1),
          Expanded(
            child: Scaffold(
              appBar: AppBar(
                title: Text('مدیریت قلقلی — ${_titles[currentIndex]}'),
                actions: const [SizedBox(width: 8)],
              ),
              body: _AdminBackdrop(
                child: AnimatedSwitcher(
                  duration: Motion.normal,
                  child: KeyedSubtree(
                    key: ValueKey(currentIndex),
                    child: ScrollHint(
                      hintLabel: 'پایین‌تر هم هست',
                      child: _pages[currentIndex],
                    ),
                  ),
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

  /// کلیدِ گروهِ هر آیتم (هم‌شاخصِ `titles`) و نامِ فارسیِ گروه‌ها.
  /// بی‌`groups` منو همان‌طورِ قبلی و بی‌سرتیتر رندر می‌شود؛ یعنی افزودنِ
  /// دسته‌بندی (۳.۲) در حالتِ خراب، نیم‌کاره نمی‌گذارد.
  final List<String> groups;
  final Map<String, String> groupLabels;
  final ValueChanged<int> onSelect;
  final VoidCallback onLogout;

  const _AdminNavList(
      {required this.index,
      required this.titles,
      required this.icons,
      this.groups = const [],
      this.groupLabels = const {},
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
        for (var i = 0; i < titles.length; i++) ...[
          // سرتیترِ گروه فقط قبلِ اولین آیتمِ هر دسته — همان قاعدهٔ پنل وب،
          // چون یک «نقشهٔ ذهنی» باید برای هر دو پنل کافی باشد.
          if (groups.length == titles.length &&
              (i == 0 || groups[i] != groups[i - 1]))
            Padding(
              padding: EdgeInsets.only(
                  top: i == 0 ? 0 : Gaps.md, bottom: 4, right: Gaps.xs),
              child: Text(
                groupLabels[groups[i]] ?? '',
                style: const TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w900,
                    letterSpacing: .2,
                    color: Color(0x99FFFFFF)),
              ),
            ),
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
        ],
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
