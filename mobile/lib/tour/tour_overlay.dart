// ══════════════════════════════════════════════════════════════════════════
// آموزشِ صوتیِ قلقلی — لایهٔ تور (اندروید)
// ══════════════════════════════════════════════════════════════════════════
// همان تجربهٔ وب، این بار روی اپ: صدا پخش می‌شود، انگشت روی همان بخش
// تاچ می‌کند، بقیهٔ صفحه تار می‌شود و کارتِ متن جای خودش را عوض می‌کند تا
// روی بخشِ درحالِ‌توضیح نیفتد.
//
// ── سه تصمیم که از وب به این‌جا آمد ────────────────────────────────────
//
// ۱. **تور کلیک نمی‌کند.** انگشت نمایشی است و لایهٔ تور همهٔ لمس‌ها را
//    می‌گیرد؛ اگر روی هدف کلیک می‌کرد، کاربر وسطِ آموزش وارد فروشگاه یا
//    بازی می‌شد و تور نصفه می‌مانْد.
//
// ۲. **مسیرِ ورود نشان داده می‌شود.** هر بخش سه مرحله دارد: (الف) انگشت
//    روی «درِ ورودی» (تبِ نوار پایین) می‌نشیند و تاچ می‌کند، (ب) همان
//    مسیری که کاربر می‌رفت طی می‌شود، (ج) انگشت به سمتِ هدف سفر می‌کند،
//    هاله آن‌جا می‌نشیند و **بعد** صدا شروع می‌شود — پس کلِ روایت صرفِ
//    همان بخشِ روشن می‌شود.
//
// ۳. **هر چیز داخلِ قابِ اپ.** اندازه‌ها از `MediaQuery` می‌آیند و کارت
//    قرینهِ هدف و دوخته‌شده به قاب است؛ همان باگی که در وب داشتیم
//    («از کادر خارج می‌شه») این‌جا از اول بسته است.
//
// ── افتِ محترمانه ─────────────────────────────────────────────────────
// اگر لنگرِ یک بخش روی صفحه نباشد (هنوز ساخته نشده، یا آن صفحه عوض شده)،
// تور گیر نمی‌کند: پرده می‌ماند، کارت وسطِ قاب می‌نشیند و صدا پخش می‌شود.
// هیچ‌جای این فایل `throw` ندارد — آموزش هرگز نباید اپ را متوقف کند.
import 'dart:async';

import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/material.dart';

import '../api_client.dart';
import 'tour_anchors.dart';
import 'tour_service.dart';

/// نقشهٔ «هر بخش از کدام در وارد می‌شود».
///
/// `nav` = نامِ مقصد در نوار پایین/شیتِ بیشتر (همان idهای وب)،
/// `sub` = زیرتبِ داخلِ صفحه (فقط «چت و بازی» زیرتب دارد).
/// `anchors` = فهرستِ لنگرها؛ اولی که روی صفحه باشد برنده است و آخری‌ها
/// جانشینِ محترمانه‌اند.
class TourPlan {
  const TourPlan(this.nav, this.anchors, {this.sub});

  final String? nav;
  final List<String> anchors;
  final String? sub;

  static const Map<String, TourPlan> steps = <String, TourPlan>{
    'home': TourPlan(null, <String>['home:hero', 'nav:home']),
    'daily': TourPlan('home', <String>['home:streak']),
    'tap': TourPlan('home', <String>['home:tapTile']),
    'wheel': TourPlan('home', <String>['home:wheelTile']),
    'cards': TourPlan('cardreg', <String>['cardreg:top', 'nav:cardreg']),
    'league': TourPlan('league', <String>['league:tabs', 'nav:league']),
    'club': TourPlan('club', <String>['club:subtabs'], sub: 'chat'),
    'invite': TourPlan('invite', <String>['invite:top', 'more:invite', 'nav:more']),
    // هر بخش **باید** دستِ‌کم یک لنگرِ موجود داشته باشد؛ وگرنه تور به
    // «کارتِ وسطِ قاب» می‌افتد و کاربر نمی‌بیند منظور کدام قسمت است.
    // `nav:x` لنگرِ هندسی است (جای همان تب در نوار پایین).
    'duel': TourPlan('club', <String>['games:grid', 'nav:club'], sub: 'games'),
    'cap': TourPlan('club', <String>['games:stakes', 'games:grid', 'nav:club'],
        sub: 'games'),
    'missions': TourPlan('club', <String>['club:tab:growth', 'club:subtabs'],
        sub: 'growth'),
    'pass': TourPlan('club', <String>['club:tab:pass', 'club:subtabs'],
        sub: 'pass'),
    // `#i/n` = قطعهٔ i از n قطعهٔ مساویِ همان لنگر. تب‌های `SegmentedButton`
    // ویجتِ جدا ندارند که بتوان پیچیدشان دور، ولی عرضشان دقیقاً برابر است —
    // پس هاله روی همان تب می‌نشیند. «صندوق سکه» تبِ سوم از چهار است
    // (ترتیبِ `segments` در `league_page.dart`).
    'coins': TourPlan('league',
        <String>['league:tabs#2/4', 'league:tabs', 'nav:league']),
    'shop': TourPlan('shop', <String>['shop:top', 'more:shop', 'nav:more']),
    'wallet': TourPlan('wallet', <String>['wallet:top', 'more:wallet', 'nav:more']),
    'profile': TourPlan('profile', <String>['profile:top', 'more:profile', 'nav:more']),
    'support': TourPlan('support', <String>['support:top', 'more:support', 'nav:more']),
    'outro': TourPlan('home', <String>['home:hero', 'nav:home']),
  };

  static TourPlan of(String id) =>
      steps[id] ?? const TourPlan(null, <String>[]);
}

/// طولِ نوارِ پایین — همان ۶۸ که `NavigationBar(height: 68)` می‌دهد.
const double _barHeight = 68;
const Duration _advance = Duration(milliseconds: 700);

/// ── زمان‌بندیِ «پیش از صدا» ─────────────────────────────────────────────
///
/// این عددها فقط طولِ انیمیشن نیستند؛ **تأخیرِ پیش از پخشِ صدا** هستند.
/// در `_runStep` صدا بعد از مکثِ «در»، سکونِ ناوبری و سفرِ انگشت می‌آید.
/// با مقادیرِ قبلی یعنی ۱٫۵ + ۰٫۶۲ + ۱٫۷ ≈ ۳٫۸ ثانیه سکوت، و تازه دانلودِ
/// فایلِ صوتی هم روی همان مسیر می‌نشست. کاربر نزدیکِ چهار ثانیه تصویرِ
/// بی‌صدا می‌دید.
///
/// کوتاه‌تر شدند بی‌آن‌که روایت از هم بپاشد: حرکت هنوز خوانده می‌شود، فقط
/// کش‌دار نیست. همراه با پیش‌بارگیری در `_runStep`، زمانِ دانلود هم از
/// مسیرِ بحرانی بیرون رفته است. اعداد با وب (`userweb/src/tour/Tour.jsx`)
/// هم‌راستا نگه داشته شده‌اند تا تجربهٔ دو سکو یکی باشد.
const Duration _doorMs = Duration(milliseconds: 900);
const Duration _enterMs = Duration(milliseconds: 900);
const Duration _settleMs = Duration(milliseconds: 380);
/// چند بار برای پیدا شدنِ لنگرِ یک بخش صبر کنیم و با چه فاصله‌ای —
/// ۴۴ × ۵۰ms ≈ ۲٫۲ ثانیه. چرا «تعدادِ تلاش» و نه ساعتِ دیوار: در تستِ
/// ویجت زمانِ شبیه‌سازی‌شده جلو می‌رود ولی ساعتِ واقعی نه، پس سقفِ
/// زمانی عملاً بی‌پایان می‌شد. فاصله هم از ۹۰ به ۵۰ رسید تا لنگر زودتر
/// دیده شود و سقفِ کل از ۳٫۲ ثانیه پایین‌تر بیاید.
const int _anchorTries = 44;
const Duration _anchorPollMs = Duration(milliseconds: 50);

/// سقفِ کادرِ تمرکز — هاله باید روی «یک تکه» بنشیند، نه روی کلِ صفحه.
///
/// چرا لازم شد (۵ مهر ۱۴۰۵): لنگرِ بعضی بخش‌ها در وب و اندروید **کلِ
/// صفحه** است (مثلِ «کیف پول» و «دعوت دوستان» که روی `<section>`ِ تمام‌صفحه
/// نشسته‌اند). هاله هم‌اندازهٔ قاب می‌شد، «سوراخ» برابرِ قاب می‌شد، چهار
/// پنلِ سایه همگی صفر می‌شدند و کارت جای نشستن نداشت → تور عملاً غیب
/// می‌شد. حالا فقط **بالای** آن تکه هاله می‌گیرد (جایی که عنوان است).
const double _focusMaxW = 0.92; // از عرضِ قاب
const double _focusMaxH = 0.46; // از ارتفاعِ قاب
const double _focusMin = 44;    // کوچک‌تر از این دیگر چیزی نشان نمی‌دهد
/// چند تلاشِ نخست فقط لنگرهای اصلی دیده می‌شوند (تا صفحه برسد)؛ بعد از آن
/// جانشینِ همیشه‌حاضرِ `nav:…` هم آزاد است تا هاله هرگز گم نشود.
const int _coreTries = 30; // ۳۰ × ۵۰ms ≈ ۱٫۵ ثانیه

/// پخشِ صدا با همان محافظِ `game_audio.dart`: صدا هرگز چیزی را نمی‌شکند.
AudioPlayer? _safePlayer() {
  try {
    return runZonedGuarded<AudioPlayer>(
      AudioPlayer.new,
      (error, stack) => debugPrint('[tour] ساختِ پخش‌کنندهٔ صدا ناموفق: $error'),
    );
  } catch (e) {
    debugPrint('[tour] پخش‌کنندهٔ صدا ساخته نشد: $e');
    return null;
  }
}

class TourOverlay extends StatefulWidget {
  const TourOverlay({
    super.key,
    required this.api,
    required this.currentIndex,
    required this.indexFor,
    required this.goIndex,
    required this.onSubTab,
    required this.slots,
  });

  final ApiClient api;

  /// صفحهٔ فعلیِ شل (برای فهمیدنِ اینکه باید تب عوض شود یا نه).
  final int currentIndex;

  /// نامِ مقصد → شمارهٔ صفحه در شل.
  final int? Function(String name) indexFor;

  /// رفتن به تب/صفحه.
  final void Function(int index) goIndex;

  /// عوض‌کردنِ زیرتبِ صفحه (مثلاً «ماموریت» داخلِ چت‌وبازی).
  final void Function(String sub) onSubTab;

  /// تعدادِ جای نوارِ پایین (تب‌ها + «بیشتر») — برای حسابِ هندسیِ در.
  final int slots;

  @override
  State<TourOverlay> createState() => TourOverlayState();
}

class TourOverlayState extends State<TourOverlay> {
  TourData? _data;
  bool _open = false;
  int _index = 0;

  /// مرحلهٔ فعلی: 'door' (روی درِ ورودی) یا 'target' (روی خودِ بخش).
  String _stage = 'target';
  Rect? _doorRect;
  Rect? _targetRect;

  String _phase = 'offer'; // offer | entering | playing | waiting | error
  bool _muted = false;

  AudioPlayer? _player;
  StreamSubscription<void>? _completed;
  Timer? _advanceTimer;
  Timer? _retryTimer;

  /// نشانی‌ای که منبعش از پیش ست و بافر شده است (در صورتِ موفقیتِ
  /// `_prepareAudio`). اگر با نشانیِ بخشِ جاری یکی باشد، `_play` به‌جای
  /// `play(UrlSource(...))` فقط `resume` می‌گیرد و فایل بی‌درنگ پخش می‌شود.
  /// mismatched بودنش هم بی‌خطر است: `_play` به مسیرِ عادی برمی‌گردد.
  String? _preparedUrl;

  /// مستطیلِ جای هر تبِ نوار پایین (از راست). در `didChangeDependencies`
  /// پر می‌شود — نگاه کنید به توضیحِ `_rebuildSlots`.
  List<Rect>? _slots;

  int _run = 0; // شناسهٔ اجرا؛ کارهای کهنه با آن لغو می‌شوند
  bool _autoStarted = false;

  /// اگر کاربر با لینکِ اتاقِ مشترک یا میان‌بر وسطِ اپ باز شده باشد، تورِ
  /// خودکار نباید او را به خانه بکشد؛ منتظر می‌ماند تا خودش به خانه برسد.
  bool _pendingAuto = false;

  @override
  void initState() {
    super.initState();
    TourBus.instance.addListener(_onBus);
    WidgetsBinding.instance.addPostFrameCallback((_) => _boot());
  }

  @override
  void dispose() {
    TourBus.instance.removeListener(_onBus);
    _completed?.cancel();
    _advanceTimer?.cancel();
    _retryTimer?.cancel();
    _player?.dispose();
    super.dispose();
  }

  void _onBus() {
    // اگر خواندنِ اولیهٔ وضعیت موفق نشده باشد (اینترنتِ لحظهٔ ورود)،
    // دکمهٔ «دوباره ببین» نباید بی‌اثر باشد: یک بار دیگر می‌خوانیم.
    if (_data == null) {
      unawaited(_bootForced());
      return;
    }
    unawaited(start(fromStep: 0));
  }

  Future<void> _bootForced() async {
    final res = await fetchTour(widget.api);
    final d = res.data;
    if (!mounted || d == null) return;
    setState(() => _data = d);
    unawaited(start(fromStep: 0));
  }

  /// راه‌اندازی: وضعیت را از سرور می‌خواند و در صورت لزوم شروع می‌کند.
  ///
  /// `retry` = همان تلاشِ دومِ محدود. اگر خواندنِ اولیه شکست بخورد (اینترنتِ
  /// لنگِ لحظهٔ ورود) کاربر آموزش را **هرگز** نمی‌دید؛ فقط با کشتن و بازکردنِ
  /// دوبارهٔ اپ. حالا یک بار با تأخیرِ کوتاه دوباره تلاش می‌شود — آینهٔ
  /// `BOOT_RETRY_MS` در وب.
  Future<void> _boot({bool retry = false}) async {
    if (widget.api.token == null) return;
    if (!retry && _autoStarted) return;
    _autoStarted = true;
    final res = await fetchTour(widget.api);
    if (!mounted) return;
    final d = res.data;
    if (d == null) {
      // تلاشِ دوباره فقط وقتی ارزش دارد که خطا گذرا بوده باشد. اگر سرور
      // جوابِ قطعی داده (۴۰۴/۴۰۳/طرحِ عوض‌شده)، تکرارش فقط ترافیک و
      // لاگِ الکی است — همان چیزی که تستِ «فقط یک بار» گرفت.
      if (!retry && res.retryable) {
        _retryTimer?.cancel();
        _retryTimer = Timer(const Duration(seconds: 6), () {
          if (mounted && _data == null) unawaited(_boot(retry: true));
        });
      }
      return;
    }
    setState(() => _data = d);
    if (!d.enabled || d.seen) return;
    if (widget.currentIndex != 0) {
      _pendingAuto = true;
      return;
    }
    unawaited(start(fromStep: 0));
  }

  @override
  void didUpdateWidget(covariant TourOverlay oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (_pendingAuto && widget.currentIndex == 0) {
      _pendingAuto = false;
      if (!_open) unawaited(start(fromStep: 0));
    }
  }

  /// شروعِ تور از یک بخش. عمومی تا پروفایل («دوباره ببین») هم بتواند.
  Future<void> start({int fromStep = 0}) async {
    final d = _data;
    if (d == null || d.steps.isEmpty) return;
    _pendingAuto = false;
    setState(() {
      _open = true;
      _phase = 'entering';
      _targetRect = null;
      _doorRect = null;
      _stage = 'target';
    });
    await _show(fromStep);
  }

  Future<void> _finish({bool skipped = false}) async {
    _run += 1;
    _advanceTimer?.cancel();
    unawaited(_player?.stop());
    final d = _data;
    if (d != null) {
      unawaited(markTourSeen(widget.api, d.version, skipped: skipped));
    }
    if (!mounted) return;
    setState(() {
      _open = false;
      _targetRect = null;
      _doorRect = null;
    });
  }

  /// نمایشِ یک بخش: در → مسیر → هدف → صدا.
  Future<void> _show(int i) async {
    final d = _data;
    if (d == null || i < 0 || i >= d.steps.length) return;
    final step = d.steps[i];
    final plan = TourPlan.of(step.id);
    final run = ++_run;

    setState(() {
      _index = i;
      _phase = 'entering';
      _stage = 'target';
      _targetRect = null;
      _doorRect = null;
    });
    // ── ۱) درِ ورودی ────────────────────────────────────────────────
    //
    // هندسهٔ در **پیش از نخستین `await`** حساب می‌شود: `_slotRect` به
    // `MediaQuery` نیاز دارد و گرفتنِ context بعد از await، هم لینتِ
    // `use_build_context_synchronously` را قرمز می‌کند و هم می‌تواند روی
    // قابِ عوض‌شده حساب کند.
    final targetIndexNow = widget.currentIndex;
    final destIndex = plan.nav == null ? null : widget.indexFor(plan.nav!);
    final needTab = destIndex != null && destIndex != targetIndexNow;
    final slot = plan.nav == null ? null : _slotOf(plan.nav!);
    final door = (needTab && slot != null) ? _slotRect(slot) : null;
    setState(() {
      _doorRect = door;
      _stage = door == null ? 'target' : 'door';
    });

    await _player?.stop();
    if (!mounted || run != _run) return;

    // ── صدا را همین حالا بیاور، نه بعد از انیمیشن ──────────────────────
    //
    // پایینِ همین تابع، پیش از پخش، چند انتظارِ پشت‌سرهم داریم: مکثِ «در»،
    // سکونِ ناوبری، جست‌وجویِ لنگر و سفرِ انگشت. اگر دانلودِ فایلِ صوتی
    // بعد از همهٔ این‌ها شروع شود، کاربر مدتِ انیمیشن **به‌علاوهٔ** مدتِ
    // دانلود سکوت می‌شنود — و روی اینترنتِ واقعیِ موبایل، همین بخشِ دوم
    // بود که «صدا خیلی دیر می‌آید» را می‌ساخت.
    //
    // اینجا دانلود با آن انتظارها موازی می‌شود. `unawaited` عمدی است: منتظر
    // ماندنش همان تأخیری را برمی‌گرداند که داریم حذفش می‌کنیم، و شکستش
    // هم بی‌اثر است چون `_play` در آن صورت با `UrlSource` سراغِ همان
    // نشانی می‌رود.
    unawaited(_prepareAudio(step));

    if (door != null) {
      await Future<void>.delayed(_doorMs);
      if (!mounted || run != _run) return;
    }

    // ── ۲) همان مسیری که کاربر می‌رفت ───────────────────────────────
    if (needTab) {
      widget.goIndex(destIndex);
      await Future<void>.delayed(_settleMs);
      if (!mounted || run != _run) return;
    }
    if (plan.sub != null) {
      widget.onSubTab(plan.sub!);
      await Future<void>.delayed(_settleMs);
      if (!mounted || run != _run) return;
    }

    // ── ۳) هدف ──────────────────────────────────────────────────────
    final rect = await _waitForAnchor(plan.anchors, run);
    if (!mounted || run != _run) return;
    setState(() {
      _targetRect = rect;
      _stage = 'target';
    });
    if (rect != null) {
      // سفرِ انگشت از در به هدف: همین چند صد میلی‌ثانیه «راهِ رسیدن» را
      // نشان می‌دهد و بعد صدا می‌آید.
      await Future<void>.delayed(_enterMs);
      if (!mounted || run != _run) return;
    }
    await _play(step);
  }

  /// اولین لنگرِ موجود را برمی‌گرداند.
  ///
  /// چرا «تعدادِ تلاش» و نه ساعتِ دیوار: نسخهٔ اول با `DateTime.now()` سقف
  /// می‌گذاشت. در تستِ ویجت، زمانِ شبیه‌سازی‌شده جلو می‌رود ولی ساعتِ واقعی
  /// نه — پس حلقه عملاً بی‌پایان می‌شد و تستِ تور قابلِ نوشتن نبود. سقفِ
  /// تلاش در تست و روی گوشی یکسان رفتار می‌کند (۳۶ × ۹۰ms ≈ ۳٫۲ ثانیه).
  Future<Rect?> _waitForAnchor(List<String> anchors, int run) async {
    if (anchors.isEmpty) return null;
    for (var i = 0; i < _anchorTries; i++) {
      if (!mounted || run != _run) return null;
      // تا `_coreTries` فقط لنگرهای اصلی دیده می‌شوند تا صفحه برسد؛ بعد از
      // آن جانشینِ همیشه‌حاضرِ `nav:…` هم آزاد است تا هاله هرگز گم نشود.
      final allowFallback = i >= _coreTries;
      for (final id in anchors) {
        if (!allowFallback && id.startsWith('nav:')) continue;
        final r = _rectOfId(id);
        if (r != null) return r;
      }
      await Future<void>.delayed(_anchorPollMs);
    }
    // هیچ‌کدام از لنگرها روی صفحه نبود: افتِ محترمانه (کارتِ وسطِ قاب).
    debugPrint('[tour] لنگرِ این بخش پیدا نشد: ${anchors.join(' | ')}');
    return null;
  }

  /// نشانیِ کامل و قابل‌پخشِ فایلِ صوتیِ یک بخش.
  ///
  /// یک‌جا نگه داشته شده چون دو نقطه به آن نیاز دارند (`_prepareAudio` و
  /// `_play`) و اگر هر کدام نشانی را جداگانه می‌ساختند، تفاوتِ یک حرف
  /// می‌توانست باعث شود پیش‌بارگیری بی‌اثر شود بی‌آن‌که کسی بفهمد.
  String _audioUrlOf(TourStep step) {
    final base = widget.api.baseUrl.isNotEmpty
        ? widget.api.baseUrl
        : ApiClient.defaultBaseUrl;
    return step.audioUrl.startsWith('http')
        ? step.audioUrl
        : '$base${step.audioUrl}';
  }

  /// فایلِ صوتیِ [step] را از همین حالا می‌آورد و بافر می‌کند.
  ///
  /// فقط `setSourceUrl` را صدا می‌زند — پخشی در کار نیست. مستنداتِ
  /// `audioplayers`: «منابع از لحظه‌ای که این متد را صدا بزنید شروع به
  /// دریافت و بافر شدن می‌کنند». شکستش عمداً بی‌صدا است: نه این‌جا
  /// `throw` می‌کنیم و نه فازی عوض می‌کنیم؛ `_play` خودش در صورتِ نبودِ
  /// منبعِ آماده مسیرِ عادی را می‌رود. آموزش هرگز نباید اپ را متوقف کند.
  Future<void> _prepareAudio(TourStep step) async {
    if (!step.audioReady || step.audioUrl.isEmpty) return;
    _player ??= _safePlayer();
    final player = _player;
    if (player == null) return;
    final url = _audioUrlOf(step);
    try {
      await player.setReleaseMode(ReleaseMode.stop);
      await player.setSourceUrl(url);
      _preparedUrl = url;
    } catch (e) {
      debugPrint('[tour] پیش‌بارگیریِ صدا ناموفق: $e');
    }
  }

  Future<void> _play(TourStep step) async {
    final d = _data;
    if (d == null) return;
    if (!step.audioReady || step.audioUrl.isEmpty) {
      setState(() => _phase = 'manual');
      return;
    }
    _player ??= _safePlayer();
    final player = _player;
    if (player == null) {
      setState(() => _phase = 'manual');
      return;
    }
    try {
      await player.setReleaseMode(ReleaseMode.stop);
      await _completed?.cancel();
      _completed = player.onPlayerComplete.listen((_) {
        if (!mounted || !_open) return;
        _advanceTimer?.cancel();
        _advanceTimer = Timer(_advance, _next);
      });
    } catch (e) {
      debugPrint('[tour] آماده‌سازیِ صدا ناموفق: $e');
    }
    try {
      final url = _audioUrlOf(step);
      if (_preparedUrl == url) {
        // از پیش آماده شده: `setSourceUrl` در ابتدای `_show` فایل را آورده
        // و بافر کرده است. اینجا فقط به ابتدای فایل برمی‌گردیم و پخش
        // می‌کنیم — و دیگر `stop()` نمی‌زنیم، چون اگرچه منبع را آزاد
        // نمی‌کند، جایگاه را از دست می‌دهیم و کلِ پیش‌بارگیری بی‌اثر
        // می‌شد. مستنداتِ `audioplayers` هم دقیقاً همین را توصیه می‌کند:
        // «برای کاهش تأخیرِ آماده‌سازی، منبع را از پیش ست کن و جداگانه
        // resume بگیر».
        // جایگاه همین حالا صفر است: `stop()` در ابتدای `_show`، پیش از
        // پیش‌بارگیری، صدا زده شده. پس اینجا `seek` لازم نیست — و در
        // واقع زیان‌آور است، چون `seek` منتظرِ رویدادِ seek-complete
        // می‌ماند و اگر پلیر هنوز آن را نفرستاده باشد تا پایانِ مهلت
        // معطل می‌ماند و با خطا بیرون می‌آید؛ یعنی به‌جای صدایِ سریع،
        // بی‌صدا می‌شدیم.
        await player.resume();
      } else {
        await player.stop();
        await player.play(UrlSource(url));
      }
      if (!mounted) return;
      setState(() => _phase = 'playing');
    } catch (e) {
      debugPrint('[tour] پخشِ صدا ناموفق: $e');
      if (!mounted) return;
      setState(() => _phase = 'error');
    }
  }

  Future<void> _next() async {
    final d = _data;
    if (d == null) return;
    if (_index + 1 >= d.steps.length) {
      await _finish();
      return;
    }
    await _show(_index + 1);
  }

  /// دکمهٔ صدا: فقط صدای همین بخش را از نو پخش می‌کند — **بدون** پیمودنِ
  /// دوبارهٔ مسیرِ ورود. (نسخهٔ قبلی همین دکمه کلِ بخش را از اول اجرا
  /// می‌کرد: در ← سفر ← هدف؛ برای شنیدنِ دوبارهٔ یک جمله، چهار ثانیه
  /// انیمیشنِ بی‌ربط بود.)
  void _playCurrent() {
    final d = _data;
    if (d == null || _index >= d.steps.length) return;
    unawaited(_play(d.steps[_index]));
  }

  void _toggleMute() {
    final player = _player;
    final next = !_muted;
    setState(() => _muted = next);
    try {
      player?.setVolume(next ? 0 : 1);
    } catch (_) {
      // صدای خاموش/روشن هرگز نباید چیزی را بشکند.
    }
  }

  /// شمارهٔ جای این مقصد در نوار پایین (همان ترتیبِ نوار، از راست).
  int? _slotOf(String nav) {
    const order = <String>['home', 'cardreg', 'league', 'club', 'more'];
    final i = order.indexOf(nav == 'social' ? 'club' : nav);
    return i == -1 ? null : i;
  }

  /// هندسهٔ جای تب‌های نوار پایین — یک بار در هر تغییرِ قاب کشیده می‌شود.
  ///
  /// چرا این‌جا و نه سرِ نیاز: مسیرِ پخش بعد از چند `await` به این مستطیل‌ها
  /// نیاز دارد و گرفتنِ `MediaQuery` از context بعد از await، لینتِ
  /// `use_build_context_synchronously` را قرمز می‌کند و می‌تواند روی قابِ
  /// عوض‌شده حساب کند.
  void _rebuildSlots() {
    final mq = MediaQuery.of(context);
    final size = mq.size;
    final bottom = mq.padding.bottom;
    final slots = widget.slots < 1 ? 1 : widget.slots;
    final w = size.width / slots;
    _slots = <Rect>[
      for (var i = 0; i < slots; i++)
        Rect.fromLTWH(
          size.width - (i + 1) * w,
          size.height - bottom - _barHeight,
          w,
          _barHeight,
        ),
    ];
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _rebuildSlots();
  }

  /// کادرِ جای یک تبِ نوار پایین — با هندسه، نه با لنگر.
  ///
  /// چرا هندسه: آیتم‌های `NavigationBar` ویجتِ خودشان را می‌سازند و گرفتنِ
  /// `GlobalKey` از آن‌ها یعنی دست‌کاریِ داخلیِ متریال. عرضِ هر جای نوار
  /// دقیقاً `۱/تعداد` است و چون اپ راست‌به‌چپ است، اولین تب سمت راست است.
  Rect? _slotRect(int slot) {
    final slots = _slots;
    if (slots == null || slot < 0 || slot >= slots.length) return null;
    return slots[slot];
  }

  /// کادرِ یک id: لنگرِ ثبت‌شده، جای هندسیِ تب (`nav:x`)، یا برشی از یک
  /// لنگر (`base#i/n`).
  ///
  /// برش برای تب‌های `SegmentedButton` لازم شد: آن‌ها ویجتِ جدا ندارند که
  /// بتوان `TourAnchor` دورشان پیچید، ولی `SegmentedButton` به همهٔ
  /// قطعه‌ها عرضِ **برابر** می‌دهد — پس تقسیمِ عرضِ خودِ نوار، همان تب را
  /// می‌دهد. چون اپ راست‌به‌چپ است، قطعهٔ صفر سمتِ راست است.
  Rect? _rectOfId(String id) {
    final hash = id.indexOf('#');
    if (hash > 0) {
      final base = _rectOfId(id.substring(0, hash));
      final spec = id.substring(hash + 1).split('/');
      if (base == null || spec.length != 2) return null;
      final i = int.tryParse(spec[0]);
      final n = int.tryParse(spec[1]);
      if (i == null || n == null || n < 1 || i < 0 || i >= n) return null;
      final w = base.width / n;
      return Rect.fromLTWH(
          base.right - (i + 1) * w, base.top, w, base.height);
    }
    if (id.startsWith('nav:')) {
      final slot = _slotOf(id.substring(4));
      return slot == null ? null : _slotRect(slot);
    }
    return TourAnchors.rectOf(id);
  }

  @override
  Widget build(BuildContext context) {
    if (!_open) return const SizedBox.shrink();
    final d = _data;
    if (d == null || _index >= d.steps.length) return const SizedBox.shrink();
    final step = d.steps[_index];

    final mq = MediaQuery.of(context);
    final frame = Rect.fromLTWH(0, mq.padding.top, mq.size.width,
        mq.size.height - mq.padding.top - mq.padding.bottom);
    // لنگر می‌تواند کلِ صفحه باشد («کیف پول»، «دعوت دوستان»): پیش از هر
    // چیز به اندازهٔ یک تکه کوچک می‌شود تا سوراخ از قاب بزرگ‌تر نشود.
    final hole = _stage == 'door' ? _doorRect : _targetRect;
    final Rect? ring = _clampTo(frame, _limitFocus(hole, frame));

    return Positioned.fill(
      child: Directionality(
        textDirection: TextDirection.rtl,
        child: Material(
          type: MaterialType.transparency,
          child: Stack(
            children: <Widget>[
              // ── پرده: هرچه جز بخشِ جاری، تار و کم‌رنگ ─────────────
              if (ring == null)
                _panel(frame)
              else ...<Widget>[
                _panel(Rect.fromLTWH(frame.left, frame.top, frame.width,
                    (ring.top - frame.top).clamp(0, frame.height))),
                _panel(Rect.fromLTWH(frame.left, ring.bottom, frame.width,
                    (frame.bottom - ring.bottom).clamp(0, frame.height))),
                _panel(Rect.fromLTWH(frame.left, ring.top,
                    (ring.left - frame.left).clamp(0, frame.width), ring.height)),
                _panel(Rect.fromLTWH(ring.right, ring.top,
                    (frame.right - ring.right).clamp(0, frame.width), ring.height)),
              ],

              // ── هاله ────────────────────────────────────────────────
              if (ring != null)
                Positioned.fromRect(
                  rect: ring,
                  child: IgnorePointer(
                    child: DecoratedBox(
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(18),
                        border: Border.all(
                          color: _stage == 'door'
                              ? const Color(0xFF84CC16)
                              : const Color(0xFFFFD166),
                          width: 2.4,
                        ),
                        boxShadow: <BoxShadow>[
                          BoxShadow(
                            color: (_stage == 'door'
                                    ? const Color(0xFF84CC16)
                                    : const Color(0xFFFFD166))
                                .withAlpha(40),
                            blurRadius: 18,
                            spreadRadius: 5,
                          ),
                        ],
                      ),
                    ),
                  ),
                ),

              // ── انگشتِ خودکار ───────────────────────────────────────
              if (ring != null) _finger(ring, frame),

              // ── کارتِ متن ───────────────────────────────────────────
              _card(step, frame, ring, d.steps.length),
            ],
          ),
        ),
      ),
    );
  }

  /// سایه: تیره‌کردنِ ملایم، **بدون تارکردن**.
  ///
  /// چرا تار نیست (خواستهٔ مالک، ۵ مهر ۱۴۰۵): «تار شدنِ نقاطی که توضیح
  /// نمیده باعث گیج شدن آموزش شده.» تار، نقشهٔ اپ را از چشم می‌اندازد و
  /// کاربر نمی‌فهمد این بخش کجای برنامه است؛ تیره‌کردن همان سلسله‌مراتب را
  /// می‌دهد و زمینه را نگه می‌دارد. سودِ جنبی: `BackdropFilter` روی اندروید
  /// از گران‌ترین کارهاست — حذفش چهار لایهٔ ترکیبِ زنده را از هر فریم
  /// برمی‌دارد (تور روی گوشی‌های ضعیف هم روان می‌ماند).
  Widget _panel(Rect r) => Positioned.fromRect(
        rect: r,
        child: const ColoredBox(color: Color(0x8C060F1E)),
      );

  /// انگشت: روی در می‌نشیند و تاچ می‌کند، بعد به سمتِ هدف سفر می‌کند.
  Widget _finger(Rect ring, Rect frame) {
    final to = ring.center;
    final from = _doorRect?.center;
    final target = _clampCenter(to, frame);
    final start = from == null ? target : _clampCenter(from, frame);
    return Positioned.fill(
      child: IgnorePointer(
        child: TweenAnimationBuilder<double>(
          key: ValueKey<String>('finger-$_index-$_stage'),
          tween: Tween<double>(begin: 0, end: 1),
          duration: _enterMs,
          curve: Curves.easeInOut,
          builder: (BuildContext context, double t, Widget? child) {
            final p = Offset.lerp(start, target, t) ?? target;
            // دست هرگز از قاب بیرون نمی‌زند — همان باگی که در وب داشتیم
            // («از کادر خارج می‌شه») و این‌جا از اول بسته است.
            final dx = p.dx.clamp(frame.left + 24, frame.right - 24).toDouble();
            final dy = (p.dy - 18).clamp(frame.top + 6, frame.bottom - 46).toDouble();
            return Stack(
              children: <Widget>[
                Positioned(
                  left: dx - 19,
                  top: dy,
                  child: const _TapHand(),
                ),
              ],
            );
          },
        ),
      ),
    );
  }

  /// کادرِ تمرکز را به اندازهٔ «یک تکه» کوچک می‌کند (فقط بالای آن نگه
  /// داشته می‌شود — جایی که عنوان و خلاصه است).
  ///
  /// لنگرِ بعضی بخش‌ها کلِ صفحه است؛ هالهٔ هم‌اندازهٔ قاب یعنی سوراخ = کلِ
  /// قاب، یعنی نه سایه می‌ماند و نه جا برای کارت — همان «غیب شدنِ» تور.
  Rect? _limitFocus(Rect? r, Rect frame) {
    if (r == null) return null;
    final maxW = frame.width * _focusMaxW < _focusMin
        ? _focusMin
        : frame.width * _focusMaxW;
    final maxH = frame.height * _focusMaxH < _focusMin
        ? _focusMin
        : frame.height * _focusMaxH;
    final w = r.width > maxW ? maxW : (r.width < _focusMin ? _focusMin : r.width);
    final h = r.height > maxH ? maxH : (r.height < _focusMin ? _focusMin : r.height);
    return Rect.fromLTWH(r.left, r.top, w, h);
  }

  Widget _card(TourStep step, Rect frame, Rect? ring, int total) {
    final width = (frame.width - 20).clamp(200.0, 520.0).toDouble();
    const cardMaxH = 320.0;
    const heightGuess = 230.0;
    double? top;
    if (ring != null) {
      final below = frame.bottom - ring.bottom - 12;
      final above = ring.top - frame.top - 12;
      if (below >= heightGuess + 8) {
        top = ring.bottom + 12;
      } else if (above >= heightGuess + 8) {
        top = ring.top - 12 - heightGuess;
      } else {
        top = below >= above ? (frame.bottom - heightGuess - 12) : (frame.top + 12);
      }
    }
    final card = Container(
      width: width,
      constraints: const BoxConstraints(maxHeight: cardMaxH),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: <Color>[Color(0xF20F172A), Color(0xF2020617)],
        ),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: const Color(0x5CFFD166)),
        boxShadow: const <BoxShadow>[
          BoxShadow(color: Color(0x8C000000), blurRadius: 30, offset: Offset(0, 12)),
        ],
      ),
      padding: const EdgeInsets.fromLTRB(13, 12, 13, 11),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          Row(
            children: <Widget>[
              _badge(),
              const Spacer(),
              Text('${faNum(_index + 1)} از ${faNum(total)}',
                  style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 11.5)),
              const SizedBox(width: 8),
              _skip(),
            ],
          ),
          const SizedBox(height: 9),
          ClipRRect(
            borderRadius: BorderRadius.circular(99),
            child: LinearProgressIndicator(
              value: (_index + 1) / total,
              minHeight: 4,
              backgroundColor: const Color(0x1AFFFFFF),
              valueColor: const AlwaysStoppedAnimation<Color>(Color(0xFFFFD166)),
            ),
          ),
          const SizedBox(height: 10),
          Flexible(
            child: SingleChildScrollView(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: <Widget>[
                  Text(step.title,
                      style: const TextStyle(
                          color: Colors.white, fontSize: 16, fontWeight: FontWeight.w900)),
                  const SizedBox(height: 6),
                  Text(step.text,
                      textAlign: TextAlign.right,
                      style: const TextStyle(
                          color: Color(0xFFD7DEE8), fontSize: 13.5, height: 1.9)),
                ],
              ),
            ),
          ),
          if (_hint() != null) ...<Widget>[
            const SizedBox(height: 8),
            Text(_hint()!,
                style: const TextStyle(color: Color(0xFFF59E0B), fontSize: 12)),
          ],
          const SizedBox(height: 11),
          // ── ⚠️ دکمهٔ اصلی یک ردیفِ خودش ────────────────────────────────
          //
          // نسخهٔ اول هر سه دکمه را در یک `Row` می‌گذاشت: «بعدی» با
          // `Expanded` (عرضِ محدود) و دو دکمهٔ دیگر بی‌`Expanded`. `Row`
          // به فرزندِ غیرِ‌فِلکس **عرضِ بی‌نهایت** می‌دهد (تا اندازهٔ
          // ذاتی‌اش را بسنجد) و دکمهٔ متریال با آن می‌ترکد:
          //
          //     BoxConstraints forces an infinite width
          //
          // این خطا در اولین اجرای واقعیِ تور (تستِ ویجت، ۵ مهر) بیرون زد؛
          // یعنی کارتِ تور روی گوشی هم خراب می‌شد. حالا دکمهٔ اصلی تمام‌عرض
          // است و دو دکمهٔ کمکی کنارِ هم با `Expanded` (عرضِ محدود) —
          // روی موبایل هم خوانا‌تر است.
          SizedBox(width: double.infinity, height: 44, child: _primary()),
          const SizedBox(height: 8),
          Row(
            children: <Widget>[
              Expanded(
                child: _secondary(
                    (_phase == 'playing' || _phase == 'error')
                        ? 'پخش دوباره'
                        : 'پخش صدا',
                    _playCurrent),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _secondary(_muted ? 'صدا خاموش' : 'صدا روشن', _toggleMute),
              ),
            ],
          ),
        ],
      ),
    );

    if (top == null) {
      // هدفی روی صفحه نیست: کارت وسطِ قاب می‌نشیند (افتِ محترمانه).
      return Positioned.fill(
        child: Center(child: Padding(padding: const EdgeInsets.all(10), child: card)),
      );
    }
    final left = ((ring!.center.dx - width / 2).clamp(frame.left + 10, frame.right - width - 10))
        .toDouble();
    return Positioned(left: left, top: top, child: card);
  }

  String? _hint() {
    switch (_phase) {
      case 'offer':
        return 'برای شنیدنِ صدا «پخش صدا» را بزن؛ بعدش خودش جلو می‌رود.';
      case 'waiting':
        return 'پخشِ صدا شروع نشد؛ یک‌بار «پخش صدا» را بزن.';
      case 'manual':
        return 'صدای این بخش در دسترس نیست؛ متن را بخوان و «بعدی» را بزن.';
      case 'error':
        return 'صدا بارگیری نشد. اینترنت را چک کن و «پخش دوباره» را بزن.';
      case 'entering':
        return 'داریم می‌رویم سراغِ همین بخش…';
      default:
        return null;
    }
  }

  Widget _badge() => Container(
        padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
        decoration: BoxDecoration(
          color: const Color(0x1FFFD166),
          border: Border.all(color: const Color(0x4DFFD166)),
          borderRadius: BorderRadius.circular(99),
        ),
        child: const Text('آموزش صوتی قلقلی',
            style: TextStyle(
                color: Color(0xFFFFD166), fontSize: 11.5, fontWeight: FontWeight.w900)),
      );

  Widget _skip() => GestureDetector(
        onTap: () => unawaited(_finish(skipped: true)),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
          decoration: BoxDecoration(
            border: Border.all(color: const Color(0x29FFFFFF)),
            borderRadius: BorderRadius.circular(99),
          ),
          child: const Text('رد کردن',
              style: TextStyle(
                  color: Color(0xFFCBD5E1), fontSize: 11.5, fontWeight: FontWeight.w700)),
        ),
      );

  /// دکمهٔ اصلی **همیشه** «بعدی» است.
  ///
  /// چرا (خواستهٔ مالک، ۵ مهر ۱۴۰۵): «تور آنلوردینگ در موبایل دکمهٔ بعدی
  /// نداشت.» پیش از این نقشِ این دکمه با فاز عوض می‌شد و در فازهای `offer` و
  /// `waiting` می‌شد «شروع آموزش»/«پخش صدا» — یعنی اگر پخشِ خودکار رد می‌شد
  /// یا فایلِ صدا نمی‌آمد، **هیچ راهی برای رفتن به بخشِ بعد نبود** و کاربر
  /// همان‌جا گیر می‌کرد. حالا پیشروی همیشه در دست است و صدا ابزارِ جداگانهٔ
  /// خودش را دارد.
  Widget _primary() {
    final isLast = (_data?.steps.length ?? 1) - 1 == _index;
    final label = isLast ? 'پایان' : 'بعدی';
    return SizedBox(
      height: 44,
      child: DecoratedBox(
        decoration: BoxDecoration(
          gradient: const LinearGradient(
              colors: <Color>[Color(0xFFFFD166), Color(0xFFF59E0B)]),
          borderRadius: BorderRadius.circular(13),
        ),
        child: ElevatedButton(
          style: ElevatedButton.styleFrom(
            backgroundColor: Colors.transparent,
            shadowColor: Colors.transparent,
            foregroundColor: const Color(0xFF1A1205),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(13)),
          ),
          onPressed: () => unawaited(_next()),
          child: Text(label,
              style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w900)),
        ),
      ),
    );
  }

  Widget _secondary(String label, VoidCallback onTap) => SizedBox(
        height: 44,
        child: OutlinedButton(
          style: OutlinedButton.styleFrom(
            foregroundColor: const Color(0xFFCBD5E1),
            side: const BorderSide(color: Color(0x24FFFFFF)),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(13)),
            padding: const EdgeInsets.symmetric(horizontal: 12),
          ),
          onPressed: onTap,
          child: Text(label,
              style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700)),
        ),
      );

  /// دوختنِ کادر به قاب (با حاشیهٔ ۸ پیکسلی برای هاله).
  ///
  /// `null` برمی‌گرداند اگر لنگر روی صفحه نباشد — نه یک مستطیلِ صفر. با
  /// `Rect.zero` هالهٔ صفرسایز در گوشهٔ قاب کشیده می‌شد و پنل‌های پرده
  /// حولِ همان نقطه چیده می‌شدند.
  Rect? _clampTo(Rect frame, Rect? r) {
    if (r == null) return null;
    const pad = 8.0;
    var left = r.left - pad;
    var top = r.top - pad;
    var right = r.right + pad;
    var bottom = r.bottom + pad;
    if (left < frame.left) left = frame.left;
    if (top < frame.top) top = frame.top;
    if (right > frame.right) right = frame.right;
    if (bottom > frame.bottom) bottom = frame.bottom;
    if (right - left < 24) right = (left + 24).clamp(frame.left, frame.right);
    if (bottom - top < 24) bottom = (top + 24).clamp(frame.top, frame.bottom);
    return Rect.fromLTRB(left, top, right, bottom);
  }

  Offset _clampCenter(Offset p, Rect frame) => Offset(
        p.dx.clamp(frame.left + 30, frame.right - 30).toDouble(),
        p.dy.clamp(frame.top + 34, frame.bottom - 40).toDouble(),
      );
}

/// دستِ سفیدِ انگشت با موجِ طلایی — همان تصویرِ وب، این‌جا با `CustomPaint`.
///
/// چرا `CustomPaint` و نه SVG/asset: صفر فایلِ تازه در `pubspec` و صفر
/// وابستگی؛ دقیقاً همان مسیرِ بُردارِ وب با `Path`ِ ساده.
class _TapHand extends StatefulWidget {
  const _TapHand();

  @override
  State<_TapHand> createState() => _TapHandState();
}

class _TapHandState extends State<_TapHand> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1500),
  )..repeat();

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => SizedBox(
        width: 38,
        height: 53,
        child: Stack(
          alignment: Alignment.center,
          children: <Widget>[
            // موجِ طلاییِ رو به بیرون، هم‌زمان با ضربه.
            AnimatedBuilder(
              animation: _c,
              builder: (BuildContext context, Widget? child) {
                final t = _c.value;
                return Opacity(
                  opacity: (1 - t).clamp(0.0, 0.9),
                  child: Container(
                    width: 18 + 26 * t,
                    height: 18 + 26 * t,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      border: Border.all(color: const Color(0xE6FFD166), width: 2),
                    ),
                  ),
                );
              },
            ),
            AnimatedBuilder(
              animation: _c,
              builder: (BuildContext context, Widget? child) {
                // دو ضربه در هر چرخه: پایین‌رفتن = تاچ.
                final t = _c.value;
                final press = t < 0.25 ? 1 - t : (t > 0.35 && t < 0.6 ? 1 - (t - 0.35) : 1.0);
                return Transform.scale(scale: 0.92 + 0.08 * press, child: child);
              },
              child: CustomPaint(size: const Size(30, 44), painter: _HandPainter()),
            ),
          ],
        ),
      );
}

class _HandPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width;
    final h = size.height;
    final hand = Path()
      ..moveTo(w * 0.36, h * 0.50)
      ..lineTo(w * 0.36, h * 0.20)
      ..quadraticBezierTo(w * 0.36, h * 0.10, w * 0.46, h * 0.10)
      ..quadraticBezierTo(w * 0.56, h * 0.10, w * 0.56, h * 0.20)
      ..lineTo(w * 0.56, h * 0.46)
      ..lineTo(w * 0.63, h * 0.38)
      ..quadraticBezierTo(w * 0.70, h * 0.31, w * 0.76, h * 0.38)
      ..quadraticBezierTo(w * 0.81, h * 0.44, w * 0.76, h * 0.52)
      ..lineTo(w * 0.70, h * 0.62)
      ..quadraticBezierTo(w * 0.62, h * 0.78, w * 0.46, h * 0.78)
      ..quadraticBezierTo(w * 0.34, h * 0.78, w * 0.30, h * 0.62)
      ..lineTo(w * 0.22, h * 0.46)
      ..quadraticBezierTo(w * 0.18, h * 0.40, w * 0.22, h * 0.34)
      ..quadraticBezierTo(w * 0.28, h * 0.28, w * 0.34, h * 0.34)
      ..lineTo(w * 0.36, h * 0.40)
      ..close();
    canvas.drawShadow(hand, const Color(0x8C020617), 5, true);
    canvas.drawPath(hand, Paint()..color = Colors.white.withAlpha(243));
    canvas.drawPath(
      hand,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.4
        ..color = const Color(0x8C020617),
    );
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
