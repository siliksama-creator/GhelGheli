import 'dart:async';
import 'dart:math' as math;

import '../../theme/tokens.dart';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart'
    show ValueListenable, ValueNotifier;
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../api_client.dart';
import '../../core/app_config.dart';
import '../../services/app_updater.dart';
import '../../services/image_disk_cache.dart';
import '../../widgets/app_bar_logo.dart';
import '../../widgets/notification_bell.dart';
import '../../widgets/scroll_hint.dart';
import '../../widgets/update_dialog.dart';
import 'social_page.dart';
import 'dashboard_page.dart';
import 'inventory_page.dart';
import 'league_page.dart';
import 'profile_page.dart';
import 'card_reg_page.dart';
import 'shop_page.dart';
import 'pass_page.dart';
import 'wallet_page.dart';
import 'support_page.dart';
import 'wheel_page.dart';
import 'referral_page.dart';
import 'points_ledger_page.dart';
import 'recommended_apps_page.dart';
// آموزشِ صوتیِ قلقلی — لایهٔ تور، لنگرها و گذرگاهِ «دوباره ببین».
import '../../tour/tour_anchors.dart';
import '../../tour/tour_overlay.dart';
import '../../tour/tour_service.dart';

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

  // ── کاشیِ خانه → بازکردنِ مستقیمِ بازی (خواستهٔ مالک، ۳۱ شهریور ۱۴۰۵) ──
  // کاشیِ ضربه‌زن در داشبورد کاربر را مستقیم به خودِ بازی می‌برد، نه به
  // فهرستِ بازی‌ها. nonce باعث می‌شود بازکردنِ دوبارهٔ همان بازی هم
  // از راهِ didUpdateWidget برسد (نه فقط mountِ تازه).
  String? _pendingGameId;
  int _pendingGameNonce = 0;
  StreamSubscription<String>? _fcmRefreshSubscription;

  Future<void> _confirmLogout(BuildContext context) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('خروج از حساب کاربری'),
        content: const Text(
          'آیا مطمئن هستید که می‌خواهید از حساب خود خارج شوید؟',
        ),
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
                  child: const Text(
                    'انصراف',
                    style: TextStyle(fontWeight: FontWeight.w700),
                  ),
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
                  child: const Text(
                    'خروج',
                    style: TextStyle(fontWeight: FontWeight.w700),
                  ),
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
  List<Map<String, dynamic>> _pendingGrants = const [];

  /// ── برنامه‌های پیشنهادی ───────────────────────────────────────────────
  ///
  /// خواستهٔ مالک (۲۶ شهریور): «یک قسمت برنامهٔ پیشنهادی در قسمت (بیشتر)
  /// وب و اندروید... در صورتی که ادمین تیکِ فعال را زد، این قسمت در
  /// اپلیکیشن و وب‌سایت نمایش داده بشه.»
  ///
  /// این پرچم تعیین می‌کند ردیفِ شیت دیده شود یا نه. **مقدارِ اولیه
  /// `true` است** — عمداً خوش‌بینانه: تا وقتی سرور جواب نداده، یا وقتی
  /// اینترنت قطع است، ردیف پنهان نمی‌شود. پنهان‌کردنِ محتوا به‌خاطرِ یک
  /// قطعیِ گذرا بدهی است به کاربری که به این صفحه نیاز دارد.
  bool _appsReady = true;
  DateTime? _appsProbedAt;

  /// شمارندهٔ «بازدیدِ تب» — با هر جابه‌جاییِ تب یکی بالا می‌رود و به
  /// `ScrollHint.resetToken` می‌رود. نتیجه: با برگشتن به یک تب، راهنمای
  /// اسکرول یک بار دیگر آموزش می‌دهد (آینهٔ `resetKey` در وب/پنل).
  int _visitTick = 0;

  /// هر بار فهرستِ شیتِ «بیشتر» عوض می‌شود (مثلاً ردیفِ «برنامه‌های
  /// پیشنهادی» روشن/خاموش می‌شود) یکی بالا می‌رود؛ شیتِ باز هم از آن
  /// خبردار می‌شود و فهرست و شمارش را تازه می‌کند. بدون این، شیت با
  /// فهرستِ لحظهٔ بازشدن قفل می‌شد. آینهٔ `visibleMore` در وب.
  final ValueNotifier<int> _moreRevision = ValueNotifier<int>(0);

  /// آیا بخشِ «برنامه‌های پیشنهادی» روشن است و چیزی برای نشان دادن دارد؟
  ///
  /// یک درخواستِ کوچک (۱۰ مورد) — همان چیزی که خودِ صفحه می‌گیرد. همین
  /// است که وعدهٔ «بدونِ نیاز به آپدیت» را واقعی می‌کند: ادمین برنامه‌ای
  /// اضافه می‌کند و کاربر با همان نسخهٔ نصب‌شده ردیف را می‌بیند.
  ///
  /// ⚠️ خطای شبکه ردیف را پنهان **نمی‌کند**؛ فقط اطلاعاتِ کهنه می‌ماند.
  Future<void> _probeApps({bool force = false}) async {
    final last = _appsProbedAt;
    if (!force &&
        last != null &&
        DateTime.now().difference(last) < const Duration(seconds: 60)) {
      return; // تازه پرسیده‌ایم؛ شیت را شلوغ نکن
    }
    _appsProbedAt = DateTime.now();
    try {
      final res = await widget.api.get('/api/recommended-apps?page=1&per_page=10');
      if (!mounted || res is! Map) return;
      final m = Map<String, dynamic>.from(res);
      final items = (m['items'] as List? ?? const []);
      final enabled = m['enabled'] != false;
      final info = m['page'] is Map
          ? Map<String, dynamic>.from(m['page'] as Map)
          : const <String, dynamic>{};
      final total = (info['total'] as num?)?.toInt() ?? items.length;
      final ready = enabled && total > 0;
      if (ready != _appsReady && mounted) {
        setState(() => _appsReady = ready);
        _moreRevision.value++;
      }
    } catch (_) {
      // عمداً بی‌صدا: پیش‌کاوشِ منو هرگز نباید چیزی را بشکند یا پیام بدهد.
    }
  }

  // A subtle one-shot "welcome" entrance the moment the user lands on the
  // home shell after logging in — fades and lifts the whole shell into
  // place instead of just snapping onto the screen, so the first thing a
  // user feels after signing in is a small, polished moment of delight.
  late final AnimationController _entrance = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 520),
  )..forward();
  late final Animation<double> _entranceFade = CurvedAnimation(
    parent: _entrance,
    curve: Curves.easeOut,
  );
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
  //   • بدتر: `ValueKey(_index)` در AnimatedSwitcher صفحهٔ قبلی را بعد
  //     از fade از درخت حذف می‌کرد. Widget object در Map می‌ماند ولی
  //     **State آن dispose می‌شد**؛ برگشت یعنی initState و API load تازه.
  //   • بازی ضربه‌زن بدترین حالت بود: با خروج از تب، session محلی و
  //     تصویرهای آماده دور ریخته می‌شدند.
  //
  // راه‌حل: هر صفحه **یک بار** ساخته و نگه داشته می‌شود. ساختِ تنبل
  // است، پس صفحه‌ای که کاربر هرگز باز نکند هیچ هزینه‌ای ندارد — این
  // مهم است چون قبلاً هر ۱۲ تا از لحظهٔ اول ساخته می‌شدند.
  //
  // نکتهٔ ظریف: `InventoryPage` هم State زنده دارد، ولی config آن بعد از
  // bootstrap با `_refreshInventoryPageConfig` عوض می‌شود تا کارت تازه را
  // ببیند بدون اینکه search/sort/scroll کاربر از بین برود.
  final Map<int, Widget> _pageCache = {};

  /// صفحهٔ [i] را یک بار می‌سازد و همان **State زنده** را نگه می‌دارد.
  ///
  /// نکتهٔ مهم: صرفاً نگه داشتن Widget object کافی نیست. نسخهٔ قبلی آن
  /// object را داخل AnimatedSwitcher می‌گذاشت؛ با تعویض تب، subtree از
  /// درخت حذف و State آن dispose می‌شد. وقتی برمی‌گشتیم همان Widget object
  /// یک State تازه می‌ساخت و initState دوباره API/تصویرها را لود می‌کرد.
  /// این همان علت واقعی «هر بار تب را عوض می‌کنم دوباره لود می‌کند» بود.
  ///
  /// `_buildPersistentPages` پایین همهٔ صفحه‌های بازشده را با Offstage در
  /// درخت نگه می‌دارد و TickerMode انیمیشنِ تب پنهان را متوقف می‌کند.
  Widget _pageAt(int i) => _pageCache.putIfAbsent(i, () => _buildPage(i));

  /// وقتی bootstrap کلکسیون تازه‌ای آورد، config ویجتِ «ثبت کارت» (که
  /// کلکسیون داخلش نشسته) عوض می‌شود ولی slot/key ثابت می‌ماند؛ بنابراین
  /// search/sort/scroll State حفظ و فقط `widget.items` تازه می‌شود.
  void _refreshCardRegPageConfig() {
    if (_pageCache.containsKey(cardRegIndex)) {
      _pageCache[cardRegIndex] = _buildPage(cardRegIndex);
    }
  }

  void _refreshDashboardConfig() {
    if (_pageCache.containsKey(0)) {
      _pageCache[0] = _buildPage(0);
    }
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
          onOpenInventory: () => setState(() => _index = cardRegIndex),
          onOpenTap: () => setState(() {
            _index = 4;
            _pendingGameId = 'tap';
            _pendingGameNonce = DateTime.now().microsecondsSinceEpoch;
          }),
          pendingGrants: _pendingGrants,
        );
      case cardRegIndex:
        // تبِ «ثبت کارت» — جایگزینِ تبِ «جوایز» (خواستهٔ مالک، ۳۱ شهریور):
        // فرمِ ثبتِ کارت با عکس + کلکسیون کامل؛ همان دو بخشی که در وب هم
        // در تبِ cardreg نشستند. داده از پوسته می‌آید (bootstrap) تا با
        // بقیهٔ اپ یک منبعِ حقیقت داشته باشد.
        return CardRegPage(
          api: widget.api,
          items: _inventory,
          grants: _pendingGrants,
          onRefresh: _loadProfile,
        );
      case 2:
        return WalletPage(api: widget.api, reloadProfile: _loadProfile);
      case 3:
        return LeaguePage(api: widget.api);
      case 4:
        return SocialPage(
          api: widget.api,
          externalGameId: _pendingGameId,
          externalGameNonce: _pendingGameNonce,
          onOpenShop: () => setState(() => _index = shopIndex),
          // آلرتِ قرمزِ تبِ گذر نبرد از همین شمارنده تغذیه می‌شود؛
          // داده‌اش از /api/bootstrap می‌آید، پس درخواستِ اضافه ندارد.
          passClaimable: _passClaimable,
        );
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
      // ── دفتر امتیازات (خواستهٔ مالک: از پروفایل به «بیشتر») ──
      // قبلاً دو ردیفِ آخرِ پروفایل بود؛ کاربر باید تا ته صفحهٔ ویرایشِ
      // اطلاعات شخصی اسکرول می‌کرد تا ببیند امتیازش از کجا آمده.
      case ledgerIndex:
        return PointsLedgerPage(api: widget.api);
      case recommendedAppsIndex:
        return RecommendedAppsPage(api: widget.api);
      case inventoryIndex:
        return InventoryPage(
          items: _inventory,
          grants: _pendingGrants,
          api: widget.api,
          onRefresh: _loadProfile,
        );
      default:
        // ایندکسِ ناشناخته نباید کرش بدهد؛ به خانه برمی‌گردیم.
        return DashboardPage(
          api: widget.api,
          reloadProfile: _loadProfile,
          pendingGrants: _pendingGrants,
        );
    }
  }

  /// شمارهٔ صفحهٔ «ثبت کارت» (تبِ دومِ نوار پایین). جایگزینِ تبِ قدیمیِ
  /// «جوایز» شد؛ ایندکس ۱ عمداً همان است تا بقیهٔ شماره‌ها جابه‌جا نشوند
  /// (همان درسِ RangeError که navigation_test گرفت).
  static const cardRegIndex = 1;

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

  /// شمارهٔ صفحهٔ دفتر امتیازات/سکه.
  ///
  /// ⚠️ ۱۲ = اولین شمارهٔ آزاد. شماره‌ها نباید جابه‌جا شوند: در چند جای
  ///    این فایل ثابت‌اند و `_destinations[i]` با همان ایندکس خوانده
  ///    می‌شود — جابه‌جایی یعنی RangeError و کرشِ کلِ اپ (همان چیزی که
  ///    navigation_test قبلاً گرفت).
  static const ledgerIndex = 12;

  /// شمارهٔ صفحهٔ «برنامه‌های پیشنهادی».
  ///
  /// ⚠️ ۱۳ = شمارهٔ آزادِ بعدی. دقیقاً مثل `ledgerIndex`، **فقط در انتها**
  ///    اضافه می‌شود: درجِ وسط یعنی جابه‌جا شدنِ همهٔ ایندکس‌ها و RangeError
  ///    و کرشِ کاملِ اپ (همان چیزی که navigation_test قبلاً گرفت).
  static const recommendedAppsIndex = 13;

  // UI FIX: seven destinations squeezed into one bar made every icon and
  // label tiny (and the Persian labels were truncating). Material's own
  // guidance caps a navigation bar at five.
  //
  // کیف پول از نوار پایین به «بیشتر» منتقل شد و به‌جایش یک ورودی بزرگ و
  // واضح در هدر داشبورد (همان‌جا که «سلام ...» نوشته شده) نشسته است. آنجا
  // موجودی واقعی هم دیده می‌شود، پس هم دم‌دست‌تر است و هم اطلاعات بیشتری
  // می‌دهد تا یک آیکون کوچک در نوار پایین.
  /// چهار تبِ نوار پایین — با چیدمانِ سرور (tabOrder) وگرنه پیش‌فرض.
  /// idهای قراردادیِ این چهار تا: home, cardreg, league, social.
  List<int> get _navIndexes {
    const defaultOrder = [0, 1, 3, 4];
    const idOf = {0: 'home', 1: 'cardreg', 3: 'league', 4: 'social'};
    int pos(int page) {
      final i = _tabOrder.indexOf(idOf[page]!);
      return i < 0 ? 999 : i; // تبِ جاافتاده از ترتیبِ سرور به انتها می‌رود
    }
    final order = defaultOrder.toList()..sort((a, b) => pos(a).compareTo(pos(b)));
    return order;
  }
  // «دعوت دوستان» (۸) به شیت اضافه شد.
  //
  // قبلاً تنها راه رسیدن به آن، یک میان‌بر در داشبورد بود. کاربری که آن
  // کارت را رد می‌کرد یا اسکرول می‌کرد، دیگر هیچ راهی به صفحهٔ دعوت
  // نداشت — یعنی سیستمِ رشدِ اپ عملاً پنهان بود. کیف پول (۲)، پشتیبانی
  // (۵) و پروفایل (۶) از قبل اینجا بودند.
  // ⚠️ گذر نبرد عمداً **در این فهرست نیست**.
  //
  // سه ورودی برایش وجود داشت: آیکونِ شیلد در نوار بالا، تبِ «گذر نبرد»
  // داخل «چت و بازی»، و ردیفِ شیتِ «بیشتر». سومی حذف شد چون دومی
  // دقیقاً کنارِ جایی نشسته که XP تولید می‌شود و همیشه دمِ دست است؛
  // نگه‌داشتنِ هر سه فقط شیت را شلوغ می‌کرد.
  //
  // ⚠️ `passIndex` (۱۰) همچنان یک صفحهٔ کامل و زنده است و باید در
  //    `_destinations`/`_pages` بماند — حذفِ آن از این‌جا فقط یک ردیفِ
  //    منو را برمی‌دارد، نه خودِ صفحه را. آیکونِ نوار بالا و تبِ داخلِ
  //    «چت و بازی» هر دو مستقیم به همین ایندکس می‌پرند.
  /// فهرستِ شیتِ «بیشتر» — با چیدمانِ سرور (tabOrder) وگرنه پیش‌فرض.
  ///
  /// 🔴 دورِ ۳۲ — فروشگاه اولِ فهرست. آینهٔ `MORE_TABS` در `main.jsx`.
  /// تا پیش از این، تنها راهِ رسیدن به فروشگاه آیکونِ کوچکِ نوارِ بالا بود
  /// (خط ۶۵۱) و کاربر گزارش داد «شاپ درست وجود ندارد» — آیکونِ بی‌برچسب
  /// دیده نمی‌شود. فروشگاه تنها مسیرِ درآمدیِ اپ است و باید مقصدِ نام‌دار
  /// داشته باشد. میان‌برِ هدر سرِ جایش می‌ماند.
  List<int> get _moreIndexes {
    // دفتر امتیازات کنارِ پروفایل می‌آید (هر دو «دادهٔ من» هستند) ولی
    // بالاتر از پشتیبانی: مالی است و بیشتر از پشتیبانی باز می‌شود.
    // «برنامه‌های پیشنهادی» آخرِ فهرست می‌آید (هم‌تراز با وب): ردیفِ محتوایی
    // است که ادمین می‌سازد، نه ابزارِ روزمره‌ای که هر روز باز شود.
    const defaultOrder = [
      shopIndex, 2, referralIndex, ledgerIndex, 5, 6, recommendedAppsIndex];
    const idOf = {
      shopIndex: 'shop', 2: 'wallet',
      referralIndex: 'invite', ledgerIndex: 'ledger', 5: 'support',
      6: 'profile', recommendedAppsIndex: 'apps',
    };
    int pos(int page) {
      final i = _tabOrder.indexOf(idOf[page]!);
      return i < 0 ? 999 : i;
    }
    final order = defaultOrder.toList()..sort((a, b) => pos(a).compareTo(pos(b)));
    // تیکِ «فعال» در پنل، مالکِ دیده‌شدنِ این ردیف است. مقصدِ شمارهٔ ۱۳ سرِ
    // جایش می‌ماند، پس خاموش‌کردن از پنل هیچ‌چیز را نمی‌شکند.
    if (!_appsReady) order.remove(recommendedAppsIndex);
    return order;
  }

  /// شمارهٔ صفحهٔ کیف پول — از هدر داشبورد مستقیم به آن پرش می‌شود.
  static const _walletIndex = 2;

  /// نگاشتِ «نامِ مقصدِ تور» به شمارهٔ صفحه — همان idهای وب تا دو کلاینت از
  /// هم جدا نشوند (گاردِ `testOnboarding.js` همین نام‌ها را قفل می‌کند).
  ///
  /// چرا با نام و نه با شماره: متن و ترتیبِ آموزش روی سرور است؛ اگر سرور
  /// بگوید «سراغِ فروشگاه برو»، اپ باید خودش بداند فروشگاه کدام شماره است —
  /// نه اینکه سرور عددِ داخلیِ اپ را بداند.
  int? _tourIndexFor(String name) {
    switch (name) {
      case 'home':
        return 0;
      case 'cardreg':
        return cardRegIndex;
      case 'league':
        return 3;
      case 'club':
        return 4;
      case 'support':
        return 5;
      case 'profile':
        return 6;
      case 'wheel':
        return wheelIndex;
      case 'invite':
        return referralIndex;
      case 'shop':
        return shopIndex;
      case 'pass':
        return passIndex;
      case 'wallet':
        return _walletIndex;
      default:
        return null;
    }
  }

  /// وارونِ بالا — شیتِ «بیشتر» با این نام، لنگرِ ردیفِ خودش را می‌سازد.
  String _tourNameOfIndex(int i) {
    switch (i) {
      case 5:
        return 'support';
      case 6:
        return 'profile';
      default:
        break;
    }
    if (i == wheelIndex) return 'wheel';
    if (i == referralIndex) return 'invite';
    if (i == shopIndex) return 'shop';
    if (i == passIndex) return 'pass';
    if (i == _walletIndex) return 'wallet';
    return 'page$i';
  }

  static const _destinations = [
    NavigationDestination(
      icon: Icon(Icons.home_outlined),
      selectedIcon: Icon(Icons.home_rounded),
      label: 'خانه',
    ),
    NavigationDestination(
      icon: Icon(Icons.credit_card_outlined),
      selectedIcon: Icon(Icons.credit_card_rounded),
      label: 'ثبت کارت',
    ),
    NavigationDestination(
      icon: Icon(Icons.account_balance_wallet_outlined),
      selectedIcon: Icon(Icons.account_balance_wallet_rounded),
      label: 'کیف پول',
    ),
    NavigationDestination(
      icon: Icon(Icons.emoji_events_outlined),
      selectedIcon: Icon(Icons.emoji_events_rounded),
      label: 'لیگ',
    ),
    NavigationDestination(
      icon: Icon(Icons.sports_esports_outlined),
      selectedIcon: Icon(Icons.sports_esports_rounded),
      label: 'چت و بازی',
    ),
    NavigationDestination(
      icon: Icon(Icons.support_agent_outlined),
      selectedIcon: Icon(Icons.support_agent_rounded),
      label: 'پشتیبانی',
    ),
    NavigationDestination(
      icon: Icon(Icons.person_outline_rounded),
      selectedIcon: Icon(Icons.person_rounded),
      label: 'پروفایل',
    ),
    // ۷، ۸ و ۹ در نوار پایین نیستند، ولی شیتِ «بیشتر» با همین ایندکسِ
    // صفحه در این لیست جست‌وجو می‌کند. تا وقتی این سه ردیف نبودند،
    // گذاشتنِ «دعوت دوستان» در شیت باعث RangeError و کرشِ کاملِ اپ
    // می‌شد — تستِ navigation_test.dart دقیقاً همین را گرفت.
    NavigationDestination(
      icon: Icon(Icons.casino_outlined),
      selectedIcon: Icon(Icons.casino_rounded),
      label: 'گردونه',
    ),
    NavigationDestination(
      icon: Icon(Icons.handshake_outlined),
      selectedIcon: Icon(Icons.handshake_rounded),
      label: 'دعوت دوستان',
    ),
    NavigationDestination(
      icon: Icon(Icons.storefront_outlined),
      selectedIcon: Icon(Icons.storefront_rounded),
      label: 'فروشگاه',
    ),
    NavigationDestination(
      icon: Icon(Icons.rocket_launch_outlined),
      selectedIcon: Icon(Icons.rocket_launch_rounded),
      label: 'گذر نبرد',
    ),
    NavigationDestination(
      icon: Icon(Icons.style_outlined),
      selectedIcon: Icon(Icons.style_rounded),
      label: 'کلکسیون',
    ),
    // ۱۲ — دفتر امتیازات. ترتیبِ این آرایه = شمارهٔ صفحه؛ اینجا آخر است
    // تا هیچ ایندکسِ قبلی جابه‌جا نشود.
    NavigationDestination(
      icon: Icon(Icons.receipt_long_outlined),
      selectedIcon: Icon(Icons.receipt_long_rounded),
      label: 'دفتر امتیازات',
    ),
    // ۱۳ — برنامه‌های پیشنهادی (خواستهٔ مالک). مثلِ ۱۲ در انتها اضافه شد؛
    // شیتِ «بیشتر» با همین شماره در این آرایه و در `_titles` جست‌وجو
    // می‌کند، پس بودنش اینجا اجباری است (وگرنه RangeError).
    NavigationDestination(
      icon: Icon(Icons.link_outlined),
      selectedIcon: Icon(Icons.link_rounded),
      label: 'برنامه‌های پیشنهادی',
    ),
  ];

  @override
  void initState() {
    super.initState();
    _loadProfile();
    // Firebase init + permission prompt can take seconds on a cold start and
    // nothing on screen depends on it, so let the first frames render first.
    WidgetsBinding.instance.addPostFrameCallback((_) => _registerFcm());
    // پیکربندی کلاینت: درگاه نسخه + بنر اطلاعیه — بدون نیاز به آپدیت.
    unawaited(_checkClientConfig());
    // بخشِ «برنامه‌های پیشنهادی»: اگر ادمین تیک را برداشته باشد یا هنوز
    // برنامه‌ای ثبت نشده باشد، ردیفِ شیت نباید نمایش داده شود.
    unawaited(_probeApps(force: true));
  }

  /// بنر اطلاعیهٔ مدیریتی (از /api/config) — null یعنی فعال نیست.
  Map<String, dynamic>? _announcement;

  /// چیدمان تب‌ها از /api/config — آرایهٔ idهای قراردادی؛ خالی = پیش‌فرض.
  /// نگاشتِ idها به شمارهٔ صفحه: home=0, rewards=1, wallet=2, league=3,
  /// social=4, support=5, profile=6, wheel=7, invite=8, shop=9, pass=10,
  /// inventory=11.
  List<String> _tabOrder = const [];

  /// از /api/config می‌خواند: اگر نسخهٔ اپ از حداقلِ تعیین‌شده پایین‌تر
  /// باشد دیالوگ آپدیت نشان می‌دهد (اختیاری/اجباری) و اگر اطلاعیه فعال
  /// باشد بنر بالای صفحه می‌آید.
  Future<void> _checkClientConfig() async {
    try {
      final res = await widget.api.get('/api/config', fresh: true);
      if (!mounted || res is! Map) return;
      final m = Map<String, dynamic>.from(res);
      final app = m['app'] is Map
          ? Map<String, dynamic>.from(m['app'] as Map)
          : <String, dynamic>{};
      final min = app['minVersion'] is Map
          ? Map<String, dynamic>.from(app['minVersion'] as Map)
          : <String, dynamic>{};
      final force = app['forceUpdate'] is Map
          ? Map<String, dynamic>.from(app['forceUpdate'] as Map)
          : <String, dynamic>{};
      final urls = app['updateUrl'] is Map
          ? Map<String, dynamic>.from(app['updateUrl'] as Map)
          : <String, dynamic>{};
      const current = String.fromEnvironment(
        'APP_RELEASE', defaultValue: '1.1.17');
      final minStr = '${min['android'] ?? ''}';
      // ── نسخهٔ منتشرشده روی سرور (پنل «انتشار اپ») ──────────────────────
      //
      // ⚠️ پیش از این، دیالوگ **فقط** وقتی می‌آمد که ادمین «حداقلِ نسخه» را
      // بالا می‌برد؛ پس نسخهٔ تازه منتشر می‌شد و کاربر پیامی نمی‌گرفت، مگر
      // ادمین یادش می‌ماند تیکِ حداقلِ نسخه را هم بزند. حالا وجودِ نسخهٔ
      // تازه‌تر از نسخهٔ نصب‌شده کافی است — همان انتظاری که ادمین از دکمهٔ
      // «انتشار» دارد.
      final rel = app['release'] is Map
          ? Map<String, dynamic>.from(app['release'] as Map)
          : <String, dynamic>{};
      final latest = '${rel['version'] ?? ''}'.trim();
      final notes = '${rel['notes'] ?? ''}'.trim();
      final sizeBytes =
          rel['sizeBytes'] is num ? (rel['sizeBytes'] as num).toInt() : 0;
      // اثرِ انگشتِ فایل برای راستی‌آزماییِ بعد از دانلود — اگر خالی
      // باشد، دانلودر فقط حجم را می‌سنجد و رد می‌شود.
      final sha = '${rel['sha256'] ?? ''}'.trim();
      final urlA = '${urls['android'] ?? ''}'.trim();
      final belowMin = minStr.isNotEmpty && _versionLower(current, minStr);
      final newerExists = latest.isNotEmpty && _versionLower(current, latest);
      // ⚠️ بی لینک، دیالوگ نمی‌آید: دکمه‌ای که هیچ کاری نمی‌کند از نبودنِ
      // دیالوگ بدتر است (کاربر گیر می‌افتد). لینک را خودِ سرور از نسخهٔ
      // منتشرشده می‌سازد، پس در حالتِ سالم همیشه هست.
      if (urlA.isNotEmpty && (belowMin || newerExists)) {
        unawaited(_showUpdateDialog(
          // «اجباری» فقط وقتی معنا دارد که نسخهٔ کاربر از حداقل پایین‌تر
          // باشد؛ وگرنه یک تیکِ اشتباه، همه را از اپ بیرون می‌انداخت.
          forced: belowMin && force['android'] == true,
          url: urlA,
          current: current,
          // اگر واقعاً «حداقلِ نسخه» در کار نیست (حالتِ «نسخهٔ تازه‌تر
          // منتشر شد»)، رشتهٔ خالی می‌فرستیم تا سطرِ «حداقلِ لازم X» نشان
          // داده نشود — وگرنه جمله با عددِ مساوی، کاربر را گیج می‌کند.
          min: belowMin ? minStr : '',
          latest: latest,
          notes: notes,
          sizeBytes: sizeBytes,
          sha256: sha,
        ));
      }
      final tabOrder = (m['tabOrder'] as List? ?? const [])
          .map((e) => '$e')
          .toList();
      if (tabOrder.isNotEmpty) {
        setState(() => _tabOrder = tabOrder);
      }
      final ann = m['announcement'] is Map
          ? Map<String, dynamic>.from(m['announcement'] as Map)
          : null;
      if (ann?['active'] == true) {
        setState(() => _announcement = ann);
      }
      final feat = m['features'] is Map
          ? Map<String, dynamic>.from(m['features'] as Map)
          : null;
      final maint = feat?['maintenance'] is Map
          ? Map<String, dynamic>.from(feat!['maintenance'] as Map)
          : null;
      if (maint?['active'] == true && mounted) {
        setState(() {
          _announcement ??= {
            'active': true,
            'text': maint!['message'] ??
                'سرویس موقتاً در دسترس نیست. کمی بعد دوباره سر بزن.',
            'accent': 'orange',
          };
        });
      }
      // همان بدنه را به منبعِ یکتای متن/عدد می‌دهیم تا صفحه‌هایی که fetchِ
      // جدا نمی‌زنند (راهنمای سکه، برچسب آواتار، طول کد اتاق…) هم از همین
      // config زنده تغذیه شوند — بدونِ هیچ درخواستِ اضافه.
      AppConfig.instance.apply(m);
    } catch (_) {
      // پیکربندی best-effort است؛ شکستش نباید چیزی را بشکند.
    }
  }

  /// مقایسهٔ سادهٔ نسخه (۱.۲.۳ < ۱.۱۰.۰). true اگر a پایین‌تر از b باشد.
  ///
  /// ⚠️ بخشِ build (مثل `+19` در `1.1.17+19`) جدا و نادیده گرفته می‌شود:
  /// قبلاً `int.tryParse('17+19')` مقدار ۰ می‌داد و نسخهٔ برابر همیشه
  /// «پایین‌تر» تشخیص داده می‌شد — یعنی دیالوگِ آپدیت برای کاربرانی که
  /// آخرین نسخه را داشتند هم نمایش داده می‌شد.
  ///
  /// ⚠️ اگر نسخه قابل‌تشخیص نباشد (مثل `android-unknown`)، false
  /// برمی‌گردد تا هرگز به‌اشتباه کاربر را مجبور به آپدیت نکند.
  bool _versionLower(String a, String b) {
    List<int?> parts(String v) {
      final clean = v.split('+').first.trim();
      return clean
          .split('.')
          .map((x) => int.tryParse(x))
          .toList();
    }
    final as = parts(a);
    final bs = parts(b);
    if (as.any((x) => x == null) || bs.any((x) => x == null)) return false;
    final an = as.map((x) => x!).toList();
    final bn = bs.map((x) => x!).toList();
    for (var i = 0; i < (an.length > bn.length ? an.length : bn.length); i++) {
      final x = i < an.length ? an[i] : 0;
      final y = i < bn.length ? bn[i] : 0;
      if (x != y) return x < y;
    }
    return false;
  }

  /// دیالوگِ آپدیتِ داخل‌اپی (مهر ۱۴۰۵): دانلودِ خودکار + نصب.
  ///
  /// تا دیروز این‌جا یک `AlertDialog` با دکمهٔ «به‌روزرسانی» بود که مرورگر
  /// را باز می‌کرد؛ حالا `showAppUpdateDialog` (در `widgets/update_dialog.dart`)
  /// به‌محض آمدن، دانلود را شروع می‌کند و بعد نصب‌کننده را باز می‌کند.
  /// در حالتِ اجباری هیچ راهِ بستنی نیست تا کاربر بدونِ آپدیت نتواند
  /// با اپ کار کند. بدنه و کارتِ نسخه هم به همان فایل منتقل شدند تا
  /// این شلِ ۱۸۰۰ خطی یک مسئولیت کمتر داشته باشد.
  Future<void> _showUpdateDialog({
    required bool forced,
    required String url,
    // دو عددِ نسخه هم از فراخوانی می‌آیند، نه از const: این‌ها از
    // `app.minVersion` و `--dart-define=APP_RELEASE` می‌آیند و اگر
    // دیالوگ خودش می‌خواند، منبعِ حقیقتِ دوم می‌شد.
    required String current,
    required String min,
    // نسخهٔ منتشرشده + پیامِ ادمین + حجمِ فایل + اثرِ انگشت (از `app.release`).
    required String latest,
    required String notes,
    required int sizeBytes,
    required String sha256,
  }) async {
    if (!mounted) return;
    await showAppUpdateDialog(
      context: context,
      info: AppUpdateInfo(
        version: latest,
        notes: notes,
        sizeBytes: sizeBytes,
        sha256: sha256,
        url: url,
        forced: forced,
        current: current,
        min: min,
      ),
    );
  }

  @override
  void dispose() {
    _fcmRefreshSubscription?.cancel();
    _entrance.dispose();
    _moreRevision.dispose();
    super.dispose();
  }

  Future<void> _loadProfile() async {
    // /api/bootstrap به‌جای /api/profile: همان داده را می‌دهد به‌علاوهٔ
    // جوایز و وضعیت گردونه، در یک رفت‌وبرگشت. داشبورد هم از همین
    // می‌خواند، پس این پاسخ عملاً کش گرم را برای هر دو پر می‌کند.
    try {
      final d = await widget.api.get('/api/bootstrap');
      unawaited(ImageDiskCache.instance.prewarmPayload(d));
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
        final pg = m['pendingGrants'];
        if (pg is List) {
          _pendingGrants = pg
              .whereType<Map>()
              .map((e) => Map<String, dynamic>.from(e))
              .toList();
        }
        // بنرِ صندوقِ خانه حالا از همین فهرست می‌آید (DashboardPage.pendingGrants)
        // پس page-cacheِ خانه هم باید تازه شود — وگرنه همان بنرِ کهنه
        // سرِجایش می‌ماند؛ دقیقاً باگی که df9303c می‌خواست ببندد ولی
        // فراخوانی‌اش در همان کامیتِ خراب گم شد.
        if (pg is List) {
          _refreshDashboardConfig();
        }
        if (inv is List || pg is List) {
          _refreshCardRegPageConfig();
        }
        final p = m['pass'];
        if (p is Map) {
          _passClaimable = (p['claimable'] as num?)?.toInt() ?? 0;
          final maxT = (p['maxTiersPerDay'] as num?)?.toInt() ?? 2;
          // سقف در سرور هم اعمال می‌شود؛ این clamp محافظ دوم است تا اگر
          // روزی سرور عدد بزرگ‌تری فرستاد، نشان «۷» نشان ندهد.
          _passTiersToday = ((p['tiersToday'] as num?)?.toInt() ?? 0).clamp(
            0,
            maxT,
          );
        }
      });
    } catch (_) {
      // Non-fatal: dashboard/profile pages fetch their own data too.
    }
  }

  Future<void> _saveFcmToken(String token) async {
    if (token.trim().isEmpty) return;
    await widget.api.patch('/api/profile', {'fcmToken': token});
  }

  Future<void> _registerFcm() async {
    try {
      await Firebase.initializeApp();
      final messaging = FirebaseMessaging.instance;
      await messaging.requestPermission();

      // FCM may rotate a registration token after restore, reinstall, or an
      // app-data reset. Register both the current value and every rotation;
      // otherwise pushes work only until the first token refresh.
      _fcmRefreshSubscription ??= messaging.onTokenRefresh.listen(
        (token) => _saveFcmToken(token).catchError((_) {}),
        onError: (_) {},
      );
      final token = await messaging.getToken();
      if (token != null) await _saveFcmToken(token);
    } catch (_) {
      // Push notifications are optional; ignore failures (e.g. no Firebase config).
    }
  }

  static const List<String> _titles = [
    'خانه',
    'ثبت کارت',
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
    'دفتر امتیازات',
    // ۱۳ — برنامه‌های پیشنهادی
    'برنامه‌های پیشنهادی',
  ];

  /// متن قرصِ راهنمای اسکرول، برای هر صفحه.
  ///
  /// چرا متن‌ها فرق دارند: یک «پایین‌تر هم هست» عمومی، بعد از دو بار
  /// دیده شدن نامرئی می‌شود. ولی «بازی‌های بیشتری پایین‌تر است» به
  /// کاربر می‌گوید **چه چیزی** را دارد از دست می‌دهد و همان است که
  /// انگشتش را حرکت می‌دهد. صفحه‌هایی که اینجا نیستند متن پیش‌فرض
  /// می‌گیرند.
  /// ⚠️ متن‌ها **حرف‌به‌حرف** با `SCROLL_HINTS` در `userweb/src/main.jsx`
  /// یکسان‌اند؛ گاردِ `userweb/tool/scroll-hint.mjs` همین را قفل می‌کند
  /// (کلید ↔ ایندکسِ زیر نگاشت می‌شود). دو کلاینت نباید برای یک صفحه دو
  /// جملهٔ متفاوت بگویند — کاربری که هم وب دارد هم اپ، تفاوت را «باگ»
  /// می‌بیند.
  ///
  /// ردیفِ «دفتر امتیازات» (۱۲) از قلم افتاده بود: صفحه‌اش در شیت بود ولی
  /// راهنمای خودش را نداشت و متنِ عمومی می‌گرفت.
  static const Map<int, String> _scrollHints = {
    0: 'میان‌برها و کارت‌ها پایین‌ترند',
    1: 'ثبت کارت و کلکسیون پایین‌ترند',
    2: 'تاریخچهٔ تراکنش‌ها پایین‌تر است',
    3: 'ادامهٔ جدول پایین‌تر است',
    4: 'بازی‌ها و ماموریت‌ها پایین‌ترند',
    5: 'تیکت‌ها و راهنما پایین‌ترند',
    6: 'تنظیمات پروفایل پایین‌تر است',
    7: 'جوایز و شرایط پایین‌تر است',
    8: 'راهنمای دعوت پایین‌تر است',
    9: 'محصولات بیشتری پایین‌تر است',
    10: 'پله‌های گذر نبرد پایین‌تر است',
    12: 'ادامهٔ دفتر پایین‌تر است',
    13: 'برنامه‌های بیشتری پایین‌تر است',
  };

  /// Which bar slot to highlight — the "more" slot when a sheet-only page
  /// is open, otherwise the matching tab.
  int get _barSelection {
    final i = _navIndexes.indexOf(_index);
    return i == -1 ? _navIndexes.length : i;
  }

  void _onNavTap(int slot) {
    // ── چرا این‌جا config تازه می‌شود ─────────────────────────────────────
    // کاربر گفت: «متنی را در پنل عوض کردم و در اپ ندیدم.» علتش این بود که
    // تنها محرکِ تازه‌سازی، برگشتن از پس‌زمینه بود؛ اپِ باز همان کش را
    // نشان می‌داد. جابه‌جاییِ تب، ارزان‌ترین جای ممکن برای تازه‌کردن است
    // (config کوچک است و `refresh()` خودش ۲۰ ثانیه خفه‌کن دارد).
    unawaited(AppConfig.instance.refresh());
    if (slot < _navIndexes.length) {
      setState(() {
        _index = _navIndexes[slot];
        _visitTick++; // تبِ تازه = راهنمای تازه
      });
    } else {
      _openMore();
    }
  }

  Future<void> _openMore() async {
    // شیتِ «بیشتر» جایی است که کاربر دنبالِ «دفتر امتیازات» و بقیهٔ
    // صفحه‌ها می‌گردد؛ همین لحظه متن/عددِ زنده هم تازه می‌شود.
    unawaited(AppConfig.instance.refresh());
    // و بخشِ «برنامه‌های پیشنهادی» هم: ادمین می‌تواند همان لحظه برنامه‌ای
    // اضافه یا تیک را خاموش کرده باشد — بدونِ آپدیتِ اپ. (خفه‌کنِ ۶۰
    // ثانیه‌ای داخلی یعنی این خط شیت را کند نمی‌کند.)
    unawaited(_probeApps());
    final picked = await showModalBottomSheet<int>(
      context: context,
      showDragHandle: true,
      // `isScrollControlled`: بدون آن، Material ارتفاعِ شیت را به ~۵۶٪
      // صفحه محدود می‌کند و روی گوشیِ کوتاه آخرین ردیف زیرِ لبه می‌ماند.
      // با آن، خودمان سقف می‌گذاریم (۷۲٪) تا شیت تمامِ صفحه را هم نگیرد.
      isScrollControlled: true,
      builder: (sheetContext) => _MoreSheet(
        revision: _moreRevision,
        // فهرستِ زنده از پوسته — نه یک کپیِ لحظهٔ بازشدن.
        indexes: () => _moreIndexes,
        titles: _titles,
        selected: _index,
        iconOf: (i, selected) => selected
            ? (_destinations[i].selectedIcon as Icon).icon
            : (_destinations[i].icon as Icon).icon,
        onPick: (i) => Navigator.pop(sheetContext, i),
        // نامِ توریِ هر ردیف — لنگرِ شیت با همین ساخته می‌شود.
        tourNameOf: _tourNameOfIndex,
      ),
    );
    if (picked != null && mounted) {
      setState(() {
        _index = picked;
        _visitTick++; // مقصدِ تازه از شیت هم «تبِ تازه» است
      });
    }
  }

  /// تب‌های دیده‌شده را در درخت نگه می‌دارد؛ تب ندیده اصلاً ساخته نمی‌شود.
  ///
  /// Offstage به‌تنهایی State را حفظ می‌کند، و TickerMode تضمین می‌کند
  /// انیمیشن‌های فروشگاه/گردونه/بازی وقتی پنهان‌اند CPU/GPU نگیرند.
  /// نتیجه: بازگشت به تب، همان scroll و همان تصویر decodeشده را فوراً
  /// نشان می‌دهد و هیچ initState یا درخواست تکراری اجرا نمی‌شود.
  Widget _buildPersistentPages() {
    _pageAt(_index); // ساختِ تنبلِ فقط صفحه‌ای که همین حالا باز شده.
    return Stack(
      fit: StackFit.expand,
      children: [
        for (final entry in _pageCache.entries)
          Offstage(
            key: ValueKey('page-slot-${entry.key}'),
            offstage: entry.key != _index,
            child: TickerMode(
              enabled: entry.key == _index,
              child: ScrollHint(
                hintLabel: _scrollHints[entry.key] ?? 'پایین‌تر هم هست',
                // padBottom برای نوار پایین تا قرص روی تب‌ها ننشیند
                padBottom: 8,
                // تبِ فعال با هر بازدید «تازه» می‌شود. تب‌های پنهان `null`
                // می‌گیرند تا بی‌دلیل reset نخورند.
                resetToken: entry.key == _index ? _visitTick : null,
                child: entry.value,
              ),
            ),
          ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    // آموزشِ صوتی روی **کلِ** شل می‌نشیند (شاملِ نوار پایین و نوار بالا)؛
    // اگر داخلِ `body` بود، هالهٔ «درِ ورود» هیچ‌وقت روی تب‌های نوار پایین
    // کشیده نمی‌شد و مهم‌ترین بخشِ روایت («چطور وارد این قسمت می‌شویم»)
    // دیده نمی‌شد.
    return Stack(
      children: <Widget>[
        Scaffold(
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
                style: Theme.of(context).textTheme.titleMedium
                    ?.copyWith(fontWeight: FontWeight.w900),
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
            icon: const Icon(
              Icons.logout_rounded,
              size: 20,
              color: Color(0xFFFF6B6B),
            ),
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
        child: Column(
          children: [
            if (_announcement != null)
              _AnnouncementBanner(
                announcement: _announcement!,
                onDismiss: () => setState(() => _announcement = null),
                onOpenShop: () => setState(() => _index = shopIndex),
              ),
            Expanded(
              child: FadeTransition(
                opacity: _entranceFade,
                child: SlideTransition(
                  position: _entranceSlide,
            // AnimatedSwitcher قبلی subtree تبِ قبلی را dispose می‌کرد؛
            // ظاهرش fade بود ولی هزینه‌اش init/API/image load دوباره بود.
            // جابه‌جایی حالا فوری است و State واقعی هر تب زنده می‌ماند.
                  child: _buildPersistentPages(),
                ),
              ),
            ),
          ],
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
            icon: Icon(
              _moreIndexes.contains(_index)
                  ? Icons.more_horiz_rounded
                  : Icons.more_horiz_outlined,
            ),
            selectedIcon: const Icon(Icons.more_horiz_rounded),
            label: 'بیشتر',
          ),
        ],
      ),
        ),
        // ── آموزشِ صوتیِ قلقلی ───────────────────────────────────────
        // چرا داخلِ شل و نه در `Overlay` سیستم: تور باید تب عوض کند و
        // بداند کاربر کجاست — و این‌ها کارِ همین State است. `key` هم عوض
        // نمی‌شود تا وضعیتِ تور با هر بازسازی از دست نرود.
        TourOverlay(
          api: widget.api,
          currentIndex: _index,
          indexFor: _tourIndexFor,
          goIndex: (int i) => setState(() => _index = i),
          onSubTab: TourBus.instance.setSocialTab,
          slots: _navIndexes.length + 1,
        ),
      ],
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
                  backgroundColor: Theme.of(context).colorScheme.primary
                      .withValues(alpha: 0.18),
                )
              : null,
          icon: RotationTransition(
            turns: _spinCtrl,
            child: Image.asset(
              'assets/pass/wheel_icon.webp',
              width: 24,
              height: 24,
              cacheWidth: 72,
            ),
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
                    color:
                        Theme.of(context).appBarTheme.backgroundColor ??
                        Theme.of(context).colorScheme.surface,
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
    final badgeNum = math.min(
      claimable > 0
          ? (widget.tiersToday > 0 ? widget.tiersToday : claimable)
          : 0,
      2,
    );

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
                  backgroundColor: Theme.of(context).colorScheme.primary
                      .withValues(alpha: 0.18),
                )
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
                          const Color(0xFF00E5FF)
                              .withValues(alpha: 0.35 * glowPulse),
                          const Color(0xFF38BDF8)
                              .withValues(alpha: 0.15 * glowPulse),
                          Colors.transparent,
                        ],
                      ),
                      boxShadow: [
                        BoxShadow(
                          color: const Color(0xFF00E5FF)
                              .withValues(alpha: 0.30 * glowPulse),
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
                            color: const Color(0xFFFF2A4B)
                                .withValues(alpha: 0.75),
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
              backgroundColor: Theme.of(context).colorScheme.primary
                  .withValues(alpha: 0.18),
            )
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
                          color: const Color(0xFFFFB300).withValues(
                            alpha:
                                0.35 + 0.20 * math.sin(t * 2 * math.pi).abs(),
                          ),
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
                        colors: [
                          Color(0xFFFFDF70),
                          Color(0xFFFF9F43),
                          Color(0xFFFF5252),
                        ],
                      ),
                      boxShadow: [
                        BoxShadow(
                          color: const Color(0xFFFF9F43)
                              .withValues(alpha: 0.45),
                          blurRadius: 8,
                          offset: const Offset(0, 3),
                        ),
                      ],
                    ),
                    child: const Center(
                      child: Icon(
                        Icons.shopping_basket_rounded,
                        size: 18,
                        color: Color(0xFF230E00),
                      ),
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
                            BoxShadow(color: Color(0xFFFFE08A), blurRadius: 8),
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


/// بنر اطلاعیهٔ مدیریتی — از /api/config، بدون نیاز به آپدیت اپ.
class _AnnouncementBanner extends StatelessWidget {
  const _AnnouncementBanner({
    required this.announcement,
    required this.onDismiss,
    this.onOpenShop,
  });

  final Map<String, dynamic> announcement;
  final VoidCallback onDismiss;
  /// اگر لینک به فروشگاه اشاره کند، به‌جای مرورگر خارجی تب فروشگاه باز می‌شود.
  final VoidCallback? onOpenShop;

  static bool _isShopLink(String link) {
    final l = link.toLowerCase();
    if (l.isEmpty) return false;
    if (l == 'shop' || l == '/shop' || l.endsWith('/shop')) return true;
    if (l.contains('ghelghelishop') && l.contains('shop')) return true;
    if (l.contains('/shop') || l.contains('tab=shop') || l.contains('page=shop')) {
      return true;
    }
    // متن‌های رایج داشبورد
    if (l.contains('فروشگاه')) return true;
    return false;
  }

  @override
  Widget build(BuildContext context) {
    final text = '${announcement['text'] ?? ''}';
    final link = '${announcement['link'] ?? ''}';
    final accent = announcement['accent'] == 'green'
        ? const Color(0xFF22E7A6)
        : announcement['accent'] == 'blue'
            ? const Color(0xFF38BDF8)
            : announcement['accent'] == 'orange'
                ? const Color(0xFFF97316)
                : const Color(0xFFFFD166);
    final openShop = onOpenShop != null && (_isShopLink(link) || text.contains('فروشگاه'));
    return Material(
      color: accent.withValues(alpha: 0.14),
      child: InkWell(
        onTap: openShop
            ? () {
                onOpenShop!();
              }
            : link.isNotEmpty
                ? () => launchUrl(Uri.parse(link),
                    mode: LaunchMode.externalApplication).catchError((_) => false)
                : null,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          child: Row(
            children: [
              Icon(Icons.campaign_rounded, size: 18, color: accent),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  text,
                  style: TextStyle(
                      color: accent,
                      fontWeight: FontWeight.w700,
                      fontSize: 12.5),
                ),
              ),
              GestureDetector(
                onTap: onDismiss,
                child: const Icon(Icons.close_rounded,
                    size: 16, color: Colors.white54),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// ══ شیتِ «بیشتر» ═══════════════════════════════════════════════════════════
///
/// خواستهٔ مالک (۲۹ شهریور): «این دکمهٔ بیشتر همه‌چیز رو کامل نشون نمی‌ده؛
/// یه سری چیزا خوب نشون داده نمی‌شن.» نسخهٔ قبلی یک `SingleChildScrollView`
/// برهنه بود: نه سرصفحه داشت (کاربر نمی‌دانست چند مقصد وجود دارد)، نه
/// نشانه‌ای که «پایین‌تر هم ردیف هست» (با ۸ ردیف روی گوشیِ کوتاه، ردیفِ
/// آخر بیرونِ قاب می‌ماند و بی‌نشانه به نظر می‌رسد «فهرست تمام شده»)، و
/// سقفِ ارتفاعش را Material تعیین می‌کرد.
///
/// قراردادِ تازه — همان سه چیزی که وب گرفت (`main.jsx`، شیتِ `moreSheet`):
///   ۱. سرصفحهٔ ثابت «همهٔ بخش‌ها» + شمارِ بخش‌ها (عددِ فارسی)،
///   ۲. ناحیهٔ اسکرولِ جدا با محوشدگیِ **شرطیِ** بالا/پایین،
///   ۳. سقفِ ۷۲٪ صفحه + فاصلهٔ ایمنِ پایین تا ردیفِ آخر زیرِ نوارِ سیستم
///      گم نشود.
///
/// ردیف‌ها همچنان `ListTile` هستند (تست‌های `navigation_test.dart` روی
/// همان نوع ویجت می‌گردند) و فهرست زنده است: با روشن/خاموش شدنِ
/// «برنامه‌های پیشنهادی» در پنل، شیتِ باز هم ردیفش را اضافه/حذف می‌کند.
class _MoreSheet extends StatefulWidget {
  const _MoreSheet({
    required this.revision,
    required this.indexes,
    required this.titles,
    required this.selected,
    required this.iconOf,
    required this.onPick,
    required this.tourNameOf,
  });

  /// با هر تغییرِ فهرست (مثلاً آماده شدنِ ردیفِ برنامه‌ها) بالا می‌رود.
  final ValueListenable<int> revision;
  final List<int> Function() indexes;
  final List<String> titles;
  final int selected;
  final IconData? Function(int index, bool selected) iconOf;
  final ValueChanged<int> onPick;

  /// نامِ توریِ هر صفحه (مثل `wallet`) — با آن `more:wallet` ساخته می‌شود
  /// تا انگشتِ تور روی همین ردیف بنشیند.
  final String Function(int index) tourNameOf;

  @override
  State<_MoreSheet> createState() => _MoreSheetState();
}

class _MoreSheetState extends State<_MoreSheet> {
  final ScrollController _ctrl = ScrollController();
  bool _above = false;
  bool _below = false;

  @override
  void initState() {
    super.initState();
    _ctrl.addListener(_syncFades);
    WidgetsBinding.instance.addPostFrameCallback((_) => _syncFades());
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  /// محوشدگی فقط وقتی که واقعاً سرریزِ آن سمت وجود دارد.
  void _syncFades() {
    if (!mounted) return;
    if (!_ctrl.hasClients) return;
    final off = _ctrl.offset;
    final max = _ctrl.position.maxScrollExtent;
    final above = off > 6;
    final below = off < max - 6;
    if (above != _above || below != _below) {
      setState(() {
        _above = above;
        _below = below;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final maxH = MediaQuery.sizeOf(context).height * 0.72;
    final safeBottom = MediaQuery.viewPaddingOf(context).bottom;

    return ValueListenableBuilder<int>(
      valueListenable: widget.revision,
      builder: (context, _, __) {
        final items = widget.indexes();
        return ConstrainedBox(
          constraints: BoxConstraints(maxHeight: maxH),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              // ── سرصفحهٔ ثابت ──
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 0, 20, 6),
                child: Row(
                  children: [
                    const Text(
                      'همهٔ بخش‌ها',
                      style: TextStyle(
                          fontSize: 15, fontWeight: FontWeight.w900),
                    ),
                    const Spacer(),
                    Text(
                      '${faNum(items.length)} بخش',
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        color: scheme.onSurface.withValues(alpha: 0.62),
                      ),
                    ),
                  ],
                ),
              ),
              Divider(
                height: 1,
                thickness: 1,
                color: scheme.onSurface.withValues(alpha: 0.08),
              ),
              // ── ناحیهٔ اسکرول + محوشدگیِ شرطی ──
              Flexible(
                child: Stack(
                  children: [
                    ListView.builder(
                      controller: _ctrl,
                      shrinkWrap: true,
                      padding: EdgeInsets.only(
                          top: 4, bottom: safeBottom + 12),
                      itemCount: items.length,
                      itemBuilder: (context, i) {
                        final page = items[i];
                        final isOn = widget.selected == page;
                        return TourAnchor(
                          id: 'more:${widget.tourNameOf(page)}',
                          child: ListTile(
                            leading: Icon(widget.iconOf(page, isOn)),
                            title: Text(widget.titles[page]),
                            selected: isOn,
                            onTap: () => widget.onPick(page),
                          ),
                        );
                      },
                    ),
                    if (_above)
                      Positioned(
                        left: 0,
                        right: 0,
                        top: 0,
                        height: 22,
                        child: IgnorePointer(
                          child: DecoratedBox(
                            decoration: BoxDecoration(
                              gradient: LinearGradient(
                                begin: Alignment.bottomCenter,
                                end: Alignment.topCenter,
                                colors: [
                                  scheme.surface.withValues(alpha: 0),
                                  scheme.surface.withValues(alpha: 0.9),
                                ],
                              ),
                            ),
                          ),
                        ),
                      ),
                    if (_below)
                      Positioned(
                        left: 0,
                        right: 0,
                        bottom: 0,
                        height: 34,
                        child: IgnorePointer(
                          child: DecoratedBox(
                            decoration: BoxDecoration(
                              gradient: LinearGradient(
                                begin: Alignment.topCenter,
                                end: Alignment.bottomCenter,
                                colors: [
                                  scheme.surface.withValues(alpha: 0),
                                  scheme.surface.withValues(alpha: 0.92),
                                ],
                              ),
                            ),
                          ),
                        ),
                      ),
                  ],
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}
