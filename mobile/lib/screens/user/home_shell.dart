import 'dart:math' as math;
import '../../theme/tokens.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';

import '../../api_client.dart';
import '../../widgets/app_bar_logo.dart';
import '../../widgets/notification_bell.dart';
import '../../widgets/scroll_hint.dart';
import 'social_page.dart';
import 'dashboard_page.dart';
import 'inventory_page.dart';
import 'league_page.dart';
import 'profile_page.dart';
import 'rewards_page.dart';
import 'shop_page.dart';
import 'pass_page.dart';
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

  // `dark` و `onTheme` حذف شدند — اپ فقط تمِ تیره دارد. توضیح در main.dart.
  const HomeShell({super.key, required this.api, required this.onLogout});

  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell>
    with SingleTickerProviderStateMixin {
  int _index = 0;

  Future<void> _confirmLogout(BuildContext context) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('خروج از حساب کاربری'),
        content: const Text('آیا مطمئن هستید که می‌خواهید از حساب خود خارج شوید؟'),
        actionsPadding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
        actions: [
          Row(
            children: [
              Expanded(
                child: OutlinedButton(
                  style: OutlinedButton.styleFrom(
                    minimumSize: const Size.fromHeight(46),
                    shape: RoundedRectangleBorder(borderRadius: Corners.rLg),
                  ),
                  onPressed: () => Navigator.pop(ctx, false),
                  child: const Text('انصراف', style: TextStyle(fontWeight: FontWeight.w700)),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: FilledButton(
                  style: FilledButton.styleFrom(
                    backgroundColor: const Color(0xFFEF4444),
                    foregroundColor: Colors.white,
                    minimumSize: const Size.fromHeight(46),
                    shape: RoundedRectangleBorder(borderRadius: Corners.rLg),
                  ),
                  onPressed: () => Navigator.pop(ctx, true),
                  child: const Text('خروج', style: TextStyle(fontWeight: FontWeight.w700)),
                ),
              ),
            ],
          ),
        ],
      ),
    );
    if (ok == true) {
      widget.onLogout();
    }
  }

  // `_profile` حذف شد: تنها مصرف‌کننده‌اش «سلام <نام>» در نوار بالا بود
  // که به درخواست مالک برداشته شد. نگه داشتنِ یک کپیِ بی‌مصرف از پروفایل
  // در حافظه، هم بی‌فایده است و هم این توهم را می‌سازد که نوار بالا به
  // آن وابسته است.

  /// تعداد چرخش گردونهٔ در دسترس، برای نشانِ کنار آیکون نوار بالا.
  ///
  /// مالک: «کنار آیکون گردونه در صفحه اصلی تعداد شانس روز گردونه برای
  /// کاربرا مشخص باشه». null یعنی هنوز نمی‌دانیم — نشان اصلاً کشیده
  /// نمی‌شود تا از یک «۰» گذرا که بعد به «۱» می‌پرد جلوگیری شود.
  int? _spins;

  /// حساب تست مالک: به‌جای «۹۹۹۹۹۹» نشانِ «∞» نشان داده می‌شود.
  bool _unlimitedSpins = false;

  /// تعداد جوایز آمادهٔ دریافت در گذر نبرد — برای نشانِ نوار بالا.
  ///
  /// از همان /api/bootstrap می‌آید، پس هیچ درخواست اضافه‌ای ندارد. نشان
  /// مهم‌ترین بخش است: کاربر باید بدون باز کردن صفحه بفهمد چیزی منتظرش
  /// است.
  int _passClaimable = 0;

  /// تعداد پله‌ای که **امروز** باز شده — عددِ روی نشانِ قرمز.
  ///
  /// درخواست مالک: «وقتی بتل پس کاربر باز میشه کنار آیکون بتل پس ۱ قرمز
  /// میاد اگه دوتا باز شده ۲ میاد ولی سقف باز شدن ۲ هستش».
  ///
  /// عمداً از `_passClaimable` جداست: «چند جایزه می‌توانی بگیری» یک چیز
  /// است، «امروز چند پله باز شد» چیز دیگری. عددی که هر روز از صفر شروع
  /// می‌شود حس پیشرفتِ روزانه می‌سازد و کاربر را فردا برمی‌گرداند؛
  /// عددی که فقط بالا می‌رود بعد از یک هفته بی‌معنی است.
  int _passTiersToday = 0;

  /// کارت‌های کلکسیون.
  ///
  /// از همان پاسخِ `/api/bootstrap` که `_loadProfile` می‌گیرد پر می‌شود،
  /// پس صفحهٔ کلکسیون هیچ درخواستِ اضافه‌ای نمی‌زند. با ۵۰ کارت، یک
  /// درخواستِ اضافه یعنی نیم ثانیه انتظارِ بی‌دلیل هر بار که تب باز
  /// می‌شود.
  List<Map<String, dynamic>> _inventory = const [];

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

  // ═══════════════════════════════════════════════════════════════════════
  // چرا صفحه‌ها کش می‌شوند و نه در هر build ساخته
  // ═══════════════════════════════════════════════════════════════════════
  //
  // گزارش مالک: «میریم داخل بازی ضربه زن و یکم بازی میکنیم و برمیگردیم
  // میریم سراغ قسمت های دیگه، سرعت کار با اپلیکیشن به مرور کم میشه و
  // لودینگ هایی به وجود میاد».
  //
  // ریشه: `_pages` یک **getter** بود. هر بار که خوانده می‌شد، هر ۱۲
  // ویجتِ صفحه از نو **ساخته** می‌شد — و در `build` خوانده می‌شد.
  //
  // پوستهٔ خانه ۱۳ جا `setState` دارد (تغییر تب، رسیدن نتیجهٔ
  // bootstrap، عوض شدن شمارندهٔ گردونه، نشانِ گذر نبرد، …). یعنی هر
  // یک از این‌ها ۱۲ شیءِ ویجتِ تازه می‌ساخت که ۱۱ تایشان اصلاً روی
  // صفحه نبودند.
  //
  // چرا این «به مرور» بدتر می‌شود و نه از اول:
  //   • ساختِ ویجت خودش ارزان است، ولی ۱۲ تا × ده‌ها setState یعنی
  //     هزاران شیءِ کوتاه‌عمر. فشارِ تخصیص، GC را مرتب بیدار می‌کند و
  //     هر بیدار شدن یک وقفهٔ کوچک است — همان «لودینگ‌های نه‌چندان
  //     طولانی ولی محسوس».
  //   • بدتر: `ValueKey(_index)` در AnimatedSwitcher باعث می‌شود فلاتر
  //     زیردرختِ صفحه را با نمونهٔ **جدید** تطبیق دهد. چون نوعِ ویجت
  //     یکی است State بازاستفاده می‌شود، ولی کلِ زیردرخت هر بار دوباره
  //     پیمایش و مقایسه می‌شود.
  //   • بازی ضربه‌زن بدترین حالت است: `TapGameScreen` را می‌ساخت حتی
  //     وقتی کاربر در تبِ کیف پول بود.
  //
  // راه‌حل: هر صفحه **یک بار** ساخته و نگه داشته می‌شود. ساختِ تنبل
  // است، پس صفحه‌ای که کاربر هرگز باز نکند هیچ هزینه‌ای ندارد — این
  // مهم است چون قبلاً هر ۱۲ تا از لحظهٔ اول ساخته می‌شدند.
  //
  //  نکتهٔ ظریف: `InventoryPage` به `_inventory` وابسته است که با
  //    هر bootstrap عوض می‌شود. برای همین **عمداً کش نمی‌شود** —
  //    توضیح در `_buildPage`.
  final Map<int, Widget> _pageCache = {};

  /// صفحهٔ [i] را می‌سازد یا از کش می‌دهد.
  Widget _pageAt(int i) {
    // صفحهٔ کلکسیون از کش مستثناست: ورودی‌اش (`_inventory`) داده است،
    // نه فقط callback. اگر کش شود، کارتی که کاربر همین حالا ثبت کرده
    // تا ری‌استارتِ اپ در کلکسیون دیده نمی‌شود.
    //
    // هزینه‌اش ناچیز است: یک ویجتِ سبک که فقط وقتی همین تب باز است
    // ساخته می‌شود.
    if (i == inventoryIndex) return _buildPage(i);
    return _pageCache.putIfAbsent(i, () => _buildPage(i));
  }

  /// تنها جایی که یک صفحه واقعاً ساخته می‌شود.
  ///
  /// `switch` و نه ساختنِ کلِ لیست و برداشتنِ عنصرِ i-ام: آن کار همان
  /// باگی بود که این تغییر قرار است رفعش کند — ۱۲ ویجت می‌ساخت تا
  /// یکی را برگرداند.
  Widget _buildPage(int i) {
    switch (i) {
      case 0:
        return DashboardPage(
          api: widget.api,
          reloadProfile: _loadProfile,
          onOpenProfile: () => setState(() => _index = 6),
          onOpenWallet: () => setState(() => _index = _walletIndex),
          onOpenWheel: () => setState(() => _index = wheelIndex),
          onOpenReferral: () => setState(() => _index = referralIndex),
          onOpenInventory: () => setState(() => _index = inventoryIndex),
        );
      case 1:
        return RewardsPage(api: widget.api);
      case 2:
        return WalletPage(api: widget.api, reloadProfile: _loadProfile);
      case 3:
        return LeaguePage(api: widget.api);
      case 4:
        return SocialPage(api: widget.api);
      case 5:
        return SupportPage(api: widget.api);
      case 6:
        return ProfilePage(api: widget.api, reloadProfile: _loadProfile);
      // ۷ به بعد در نوار پایین نیستند: از آیکون گردونه در نوار بالا و از
      // میان‌برهای داشبورد و شیتِ «بیشتر» باز می‌شوند.
      case wheelIndex:
        return WheelPage(
          api: widget.api,
          onChanged: _loadProfile,
          // بعد از هر چرخش، نشانِ نوار بالا فوراً به‌روز می‌شود — وگرنه
          // کاربر می‌چرخاند و عدد کنار آیکون هنوز قدیمی است.
          onSpinsChanged: (n, unlimited) {
            if (!mounted) return;
            if (n != _spins || unlimited != _unlimitedSpins) {
              setState(() {
                _spins = n;
                _unlimitedSpins = unlimited;
              });
            }
          },
        );
      case referralIndex:
        return ReferralPage(api: widget.api);
      case shopIndex:
        return ShopPage(api: widget.api);
      case passIndex:
        return PassPage(
          api: widget.api,
          onOpenShop: () => setState(() => _index = shopIndex),
          onChanged: _loadProfile,
        );
    // ── چرا در **انتهای** لیست ──
    // ایندکس‌های این آرایه در چند جای دیگر ثابت‌اند (wheelIndex=7،
    // shopIndex=9 و …) و شیتِ «بیشتر» هم با همین شماره‌ها کار می‌کند.
    // درج در وسط یعنی جابه‌جا شدنِ همهٔ آن‌ها و — همان‌طور که
    // navigation_test قبلاً گرفت — RangeError و کرشِ کاملِ اپ.
      case inventoryIndex:
        return InventoryPage(items: _inventory, onRefresh: _loadProfile);
      default:
        // ایندکسِ ناشناخته نباید کرش بدهد؛ به خانه برمی‌گردیم.
        return DashboardPage(api: widget.api, reloadProfile: _loadProfile);
    }
  }

  /// شمارهٔ صفحهٔ گردونه — از آیکون نوار بالا مستقیم به آن پرش می‌شود.
  static const wheelIndex = 7;
  static const referralIndex = 8;

  /// شمارهٔ صفحهٔ فروشگاه.
  ///
  /// درخواست مالک: «آیکون فروشگاه باید کنار آیکون گردونه باشه».
  ///
  /// قبلاً فروشگاه یک زیرتبِ SegmentedButton داخل تبِ «جوایز» بود — یعنی
  /// برای رسیدن به جایی که کاربر پول خرج می‌کند، باید اول «جوایز» را
  /// می‌زد و بعد متوجه می‌شد دکمهٔ دومی هم آن بالا هست. یک قدم اضافه و
  /// نامرئی، دقیقاً روی مسیر درآمدزاترین صفحهٔ اپ.
  ///
  /// حالا فروشگاه یک مقصد مستقل است که از آیکون همیشه‌حاضرِ نوار بالا،
  /// کنار گردونه، مستقیم باز می‌شود.
  static const shopIndex = 9;

  /// شمارهٔ صفحهٔ گذر نبرد.
  static const passIndex = 10;

  /// شمارهٔ صفحهٔ کلکسیون کارت‌ها.
  static const inventoryIndex = 11;

  // UI FIX: seven destinations squeezed into one bar made every icon and
  // label tiny (and the Persian labels were truncating). Material's own
  // guidance caps a navigation bar at five.
  //
  // کیف پول از نوار پایین به «بیشتر» منتقل شد و به‌جایش یک ورودی بزرگ و
  // واضح در هدر داشبورد (همان‌جا که «سلام ...» نوشته شده) نشسته است. آنجا
  // موجودی واقعی هم دیده می‌شود، پس هم دم‌دست‌تر است و هم اطلاعات بیشتری
  // می‌دهد تا یک آیکون کوچک در نوار پایین.
  static const _navIndexes = [0, 1, 3, 4];
  // «دعوت دوستان» (۸) به شیت اضافه شد.
  //
  // قبلاً تنها راه رسیدن به آن، یک میان‌بر در داشبورد بود. کاربری که آن
  // کارت را رد می‌کرد یا اسکرول می‌کرد، دیگر هیچ راهی به صفحهٔ دعوت
  // نداشت — یعنی سیستمِ رشدِ اپ عملاً پنهان بود. کیف پول (۲)، پشتیبانی
  // (۵) و پروفایل (۶) از قبل اینجا بودند.
  static const _moreIndexes = [
    inventoryIndex, 2, referralIndex, passIndex, 5, 6];

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
    // ۷، ۸ و ۹ در نوار پایین نیستند، ولی شیتِ «بیشتر» با همین ایندکسِ
    // صفحه در این لیست جست‌وجو می‌کند. تا وقتی این سه ردیف نبودند،
    // گذاشتنِ «دعوت دوستان» در شیت باعث RangeError و کرشِ کاملِ اپ
    // می‌شد — تستِ navigation_test.dart دقیقاً همین را گرفت.
    NavigationDestination(
        icon: Icon(Icons.casino_outlined),
        selectedIcon: Icon(Icons.casino_rounded),
        label: 'گردونه'),
    NavigationDestination(
        icon: Icon(Icons.handshake_outlined),
        selectedIcon: Icon(Icons.handshake_rounded),
        label: 'دعوت دوستان'),
    NavigationDestination(
        icon: Icon(Icons.storefront_outlined),
        selectedIcon: Icon(Icons.storefront_rounded),
        label: 'فروشگاه'),
    NavigationDestination(
        icon: Icon(Icons.rocket_launch_outlined),
        selectedIcon: Icon(Icons.rocket_launch_rounded),
        label: 'گذر نبرد'),
    NavigationDestination(
        icon: Icon(Icons.style_outlined),
        selectedIcon: Icon(Icons.style_rounded),
        label: 'کلکسیون'),
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
        // شمارندهٔ گردونه هم از همین پاسخ می‌آید، پس نشانِ نوار بالا
        // هم‌زمان با بقیهٔ هدر ظاهر می‌شود نه نیم ثانیه بعد.
        if (w is Map) {
          _spins = (w['spinsLeft'] as num?)?.toInt() ?? _spins;
          _unlimitedSpins = w['unlimited'] == true;
        }
        final inv = m['inventory'];
        if (inv is List) {
          _inventory = inv
              .whereType<Map>()
              .map((e) => Map<String, dynamic>.from(e))
              .toList();
        }
        final p = m['pass'];
        if (p is Map) {
          _passClaimable = (p['claimable'] as num?)?.toInt() ?? 0;
          final maxT = (p['maxTiersPerDay'] as num?)?.toInt() ?? 2;
          // سقف در سرور هم اعمال می‌شود؛ این clamp محافظ دوم است تا اگر
          // روزی سرور عدد بزرگ‌تری فرستاد، نشان «۷» نشان ندهد.
          _passTiersToday =
              ((p['tiersToday'] as num?)?.toInt() ?? 0).clamp(0, maxT);
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
    'دعوت دوستان',
    'فروشگاه',
    'گذر نبرد',
    'کلکسیون کارت‌ها',
  ];

  /// متن قرصِ راهنمای اسکرول، برای هر صفحه.
  ///
  /// چرا متن‌ها فرق دارند: یک «پایین‌تر هم هست» عمومی، بعد از دو بار
  /// دیده شدن نامرئی می‌شود. ولی «بازی‌های بیشتری پایین‌تر است» به
  /// کاربر می‌گوید **چه چیزی** را دارد از دست می‌دهد و همان است که
  /// انگشتش را حرکت می‌دهد. صفحه‌هایی که اینجا نیستند متن پیش‌فرض
  /// می‌گیرند.
  static const Map<int, String> _scrollHints = {
    0: 'میان‌برها و کارت‌ها پایین‌ترند',
    1: 'جوایز بیشتری پایین‌تر هست',
    2: 'تاریخچهٔ تراکنش‌ها پایین‌تر است',
    3: 'ادامهٔ جدول پایین‌تر است',
    4: 'بازی‌های بیشتری پایین‌تر است',
    7: 'جایزه‌ها و شرایط پایین‌تر است',
    8: 'راهنمای دعوت پایین‌تر است',
    9: 'محصولات بیشتری پایین‌تر است',
  };

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
      // اسکرول‌پذیر: با اضافه شدن «دعوت دوستان»، شیت روی گوشی کوتاه
      // ۳۹ پیکسل سرریز می‌کرد (نوار زرد-مشکی) و آخرین گزینه بریده
      // می‌شد. تستِ navigation_test.dart همین را گرفت. SingleChild
      // ScrollView + shrinkWrap یعنی هر تعداد گزینه‌ای که بعداً اضافه
      // شود هم جا می‌شود.
      builder: (sheetContext) => SafeArea(
        child: SingleChildScrollView(
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
            // ردیفِ «حالت روشن/تیره» حذف شد — اپ تک‌تم است.
            const SizedBox(height: 8),
          ],
          ),
        ),
      ),
    );
    if (picked != null && mounted) setState(() => _index = picked);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        titleSpacing: 4,
        title: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            const AppBarLogo(),
            const SizedBox(width: 4),
            Flexible(
              child: Text(
                _titles[_index],
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context).textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.w900,
                ),
              ),
            ),
          ],
        ),
        actions: [
          // The theme switch moved into the "بیشتر" sheet, leaving the bar
          // uncluttered with just notifications + logout.
          // میان‌بر گردونه — درخواست مالک: «در صفحه اصلی بالا آیکون کوچیک
          // گردونه باشه که به صفحه گردونه منتقل بشن».
          // فروشگاه کنار گردونه — درخواست مالک.
          //
          // هر دو میان‌بر به صفحه‌هایی می‌روند که در نوار پایین جا
          // نمی‌شوند (متریال حداکثر پنج مقصد) ولی مهم‌ترین‌اند: یکی جایی
          // که کاربر جایزه می‌گیرد، یکی جایی که خرج می‌کند.
          _PassButton(
            claimable: _passClaimable,
            tiersToday: _passTiersToday,
            selected: _index == passIndex,
            onPressed: () => setState(() => _index = passIndex),
          ),
          _ShopButton(
            selected: _index == shopIndex,
            onPressed: () => setState(() => _index = shopIndex),
          ),
          _WheelButton(
            spins: _spins,
            unlimited: _unlimitedSpins,
            selected: _index == wheelIndex,
            onPressed: () => setState(() => _index = wheelIndex),
          ),
          NotificationBell(api: widget.api),
          IconButton(
            tooltip: 'خروج از حساب',
            icon: const Icon(Icons.logout_rounded, size: 20, color: Color(0xFFFF6B6B)),
            onPressed: () => _confirmLogout(context),
          ),
          // حذفِ دکمهٔ تکراری
          const SizedBox(width: 4),
        ],
      ),
      body: DecoratedBox(
        // Subtle always-on aurora: the Android app no longer feels like raw
        // dark cards on a flat black sheet. It is cheap (pure gradients),
        // consistent across pages, and stays behind every scrollable child.
        decoration: const BoxDecoration(
          gradient: RadialGradient(
            center: Alignment(0.78, -0.92),
            radius: 1.12,
            colors: [Color(0x331C78FF), Color(0x00060D18)],
          ),
        ),
        child: FadeTransition(
          opacity: _entranceFade,
          child: SlideTransition(
          position: _entranceSlide,
          child: AnimatedSwitcher(
            duration: const Duration(milliseconds: 260),
            switchInCurve: Curves.easeOut,
            switchOutCurve: Curves.easeIn,
            transitionBuilder: (child, animation) =>
                FadeTransition(opacity: animation, child: child),
            // ═══════════════════════════════════════════════════════════
            // نوار اسکرول برای همهٔ صفحه‌ها، از یک نقطه
            // ═══════════════════════════════════════════════════════════
            //
            // درخواست مالک: «یه اسکرول بار برای صفحاتی که بیشتر از صفحه
            // نمایش دیده میشن باید درست کنی که کاربر متوجه بشه که برای
            // دیدن آیتم هایی که مشخص نیستن باید تاچ کنه بره سمت پایین».
            //
            // چرا اینجا و نه داخل تک‌تک صفحه‌ها: ۱۱ صفحهٔ کاربر هر کدام
            // ساختار اسکرول متفاوتی دارند (ListView، ListView.builder،
            // RefreshIndicator، Column+Expanded، تب‌های تودرتو). وصله
            // زدن به هر کدام یعنی ۱۱ جای متفاوت که فردا یکی‌شان یادش
            // می‌رود. ScrollHint فقط به ScrollNotification گوش می‌دهد،
            // پس هر اسکرولی در هر عمقی از صفحه را می‌گیرد.
            //
            // داخل KeyedSubtree است نه بیرونش: هر صفحه باید حالت اسکرول
            // خودش را داشته باشد. اگر بیرون بود، رفتن از یک صفحهٔ
            // اسکرول‌شده به یک صفحهٔ کوتاه، ریل را با موقعیتِ صفحهٔ
            // قبلی نشان می‌داد.
            //
            // گذر نبرد استثناست: ریلِ اختصاصیِ خودش را دارد که شمارهٔ
            // پله را هم نشان می‌دهد. دو ریل کنار هم فقط شلوغی است.
            child: KeyedSubtree(
              key: ValueKey(_index),
              child: _index == passIndex
                  ? _pageAt(_index)
                  : ScrollHint(
                      hintLabel: _scrollHints[_index] ?? 'پایین‌تر هم هست',
                      child: _pageAt(_index),
                    ),
            ),
          ),
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



/// آیکون گردونه با نشانِ تعداد چرخش.
///
/// نشان روی خود دکمه می‌نشیند تا در نگاه اول دیده شود؛ اگر فقط داخل صفحهٔ
/// گردونه بود، کاربر باید وارد می‌شد تا بفهمد اصلاً چرخشی دارد یا نه.
class _WheelButton extends StatefulWidget {
  const _WheelButton({
    required this.spins,
    required this.unlimited,
    required this.selected,
    required this.onPressed,
  });

  final int? spins;
  final bool unlimited;
  final bool selected;
  final VoidCallback onPressed;

  @override
  State<_WheelButton> createState() => _WheelButtonState();
}

class _WheelButtonState extends State<_WheelButton>
    with SingleTickerProviderStateMixin {
  late final AnimationController _spinCtrl = AnimationController(
    vsync: this,
    duration: const Duration(seconds: 12),
  )..repeat();

  @override
  void dispose() {
    _spinCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final n = widget.spins ?? 0;
    final label = widget.unlimited ? '∞' : faNum(n);
    return Stack(
      clipBehavior: Clip.none,
      children: [
        IconButton(
          tooltip: n > 0 ? '$n چرخش گردونه داری' : 'گردونهٔ شانس',
          onPressed: widget.onPressed,
          style: widget.selected
              ? IconButton.styleFrom(
                  backgroundColor:
                      Theme.of(context).colorScheme.primary.withValues(alpha: 0.18))
              : null,
          icon: RotationTransition(
            turns: _spinCtrl,
            child: Image.asset('assets/pass/wheel_icon.webp', width: 24, height: 24, cacheWidth: 72),
          ),
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

class _PassButton extends StatefulWidget {
  const _PassButton({
    required this.claimable,
    required this.tiersToday,
    required this.selected,
    required this.onPressed,
  });

  final int claimable, tiersToday;
  final bool selected;
  final VoidCallback onPressed;

  @override
  State<_PassButton> createState() => _PassButtonState();
}

class _PassButtonState extends State<_PassButton>
    with SingleTickerProviderStateMixin {
  late final AnimationController _anim = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 3000),
  )..repeat();

  @override
  void dispose() {
    _anim.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final claimable = widget.claimable;
    final badgeNum = math.min(claimable > 0 ? (widget.tiersToday > 0 ? widget.tiersToday : claimable) : 0, 2);

    return AnimatedBuilder(
      animation: _anim,
      builder: (context, _) {
        final t = _anim.value;
        final floatY = math.sin(t * 2 * math.pi) * 1.2;
        final glowPulse = 0.40 + 0.25 * math.sin(t * 2 * math.pi).abs();

        return IconButton(
          tooltip: 'گذر نبرد فصلی',
          onPressed: widget.onPressed,
          style: widget.selected
              ? IconButton.styleFrom(
                  backgroundColor:
                      Theme.of(context).colorScheme.primary.withValues(alpha: 0.18))
              : null,
          icon: SizedBox(
            width: 36,
            height: 36,
            child: Stack(
              clipBehavior: Clip.none,
              alignment: Alignment.center,
              children: [
                // هاله درخشش سایبری بسیار شیک و ملایم
                Positioned(
                  child: Container(
                    width: 28,
                    height: 28,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      gradient: RadialGradient(
                        colors: [
                          const Color(0xFF00E5FF).withValues(alpha: 0.35 * glowPulse),
                          const Color(0xFF38BDF8).withValues(alpha: 0.15 * glowPulse),
                          Colors.transparent,
                        ],
                      ),
                      boxShadow: [
                        BoxShadow(
                          color: const Color(0xFF00E5FF).withValues(alpha: 0.30 * glowPulse),
                          blurRadius: 10,
                          spreadRadius: 1,
                        ),
                      ],
                    ),
                  ),
                ),
                // شیلد گذر نبرد با حرکت شناور آرام
                Transform.translate(
                  offset: Offset(0, floatY),
                  child: Image.asset(
                    'assets/pass/pass_shield.png',
                    width: 26,
                    height: 26,
                    cacheWidth: 80,
                    fit: BoxFit.contain,
                  ),
                ),
                // نشانگر قرمز تعداد پله‌های بازشده روزانه (۱ یا ۲)
                if (badgeNum > 0)
                  Positioned(
                    top: -3,
                    right: -3,
                    child: Container(
                      width: 17,
                      height: 17,
                      decoration: BoxDecoration(
                        color: const Color(0xFFFF2A4B),
                        shape: BoxShape.circle,
                        border: Border.all(color: Colors.white, width: 1.2),
                        boxShadow: [
                          BoxShadow(
                            color: const Color(0xFFFF2A4B).withValues(alpha: 0.75),
                            blurRadius: 8,
                            spreadRadius: 1,
                          ),
                        ],
                      ),
                      child: Center(
                        child: Text(
                          faNum(badgeNum),
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
              ],
            ),
          ),
        );
      },
    );
  }
}

class _ShopButton extends StatefulWidget {
  const _ShopButton({required this.selected, required this.onPressed});

  final bool selected;
  final VoidCallback onPressed;

  @override
  State<_ShopButton> createState() => _ShopButtonState();
}

class _ShopButtonState extends State<_ShopButton>
    with SingleTickerProviderStateMixin {
  late final AnimationController _animCtrl = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 2400),
  )..repeat();

  @override
  void dispose() {
    _animCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return IconButton(
      tooltip: 'فروشگاه',
      onPressed: widget.onPressed,
      style: widget.selected
          ? IconButton.styleFrom(
              backgroundColor:
                  Theme.of(context).colorScheme.primary.withValues(alpha: 0.18))
          : null,
      icon: AnimatedBuilder(
        animation: _animCtrl,
        builder: (context, _) {
          final t = _animCtrl.value;
          final basketOffset = math.sin(t * 2 * math.pi) * 1.5;
          final starFloat = -math.sin(t * 2 * math.pi) * 3.5;
          final starScale = 0.85 + 0.25 * math.sin(t * 2 * math.pi).abs();
          final starRot = t * 2 * math.pi;

          return SizedBox(
            width: 36,
            height: 36,
            child: Stack(
              clipBehavior: Clip.none,
              alignment: Alignment.center,
              children: [
                // Glowing background aura
                Positioned(
                  child: Container(
                    width: 28,
                    height: 28,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      boxShadow: [
                        BoxShadow(
                          color: const Color(0xFFFFB300).withValues(alpha: 0.35 + 0.20 * math.sin(t * 2 * math.pi).abs()),
                          blurRadius: 12,
                          spreadRadius: 2,
                        ),
                      ],
                    ),
                  ),
                ),
                // Animated Basket container
                Transform.translate(
                  offset: Offset(0, basketOffset),
                  child: Container(
                    width: 32,
                    height: 30,
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(9),
                      gradient: const LinearGradient(
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                        colors: [Color(0xFFFFDF70), Color(0xFFFF9F43), Color(0xFFFF5252)],
                      ),
                      boxShadow: [
                        BoxShadow(
                          color: const Color(0xFFFF9F43).withValues(alpha: 0.45),
                          blurRadius: 8,
                          offset: const Offset(0, 3),
                        ),
                      ],
                    ),
                    child: const Center(
                      child: Icon(Icons.shopping_basket_rounded, size: 18, color: Color(0xFF230E00)),
                    ),
                  ),
                ),
                // Animated Star inside/above the basket
                Positioned(
                  top: 2 + starFloat,
                  child: Transform.rotate(
                    angle: starRot * 0.5,
                    child: Transform.scale(
                      scale: starScale,
                      child: const DecoratedBox(
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          boxShadow: [
                            BoxShadow(
                              color: Color(0xFFFFE08A),
                              blurRadius: 8,
                            ),
                          ],
                        ),
                        child: Icon(
                          Icons.star_rounded,
                          size: 15,
                          color: Color(0xFFFFF7C2),
                        ),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}


