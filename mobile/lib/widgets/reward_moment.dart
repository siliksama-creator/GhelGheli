import 'dart:async';
import 'dart:math' as math;
import 'dart:ui' show ImageFilter;

import 'package:flutter/material.dart';

import '../api_client.dart';
import '../core/app_config.dart';
import 'ui_icon.dart';

/// ═══════════════════════════════════════════════════════════════════════════
/// «لحظهٔ جایزه» — تنها سیستمِ نمایشِ جایزه/نتیجه در اپ (به‌جز دوئل کارت و پنالتی)
/// ═══════════════════════════════════════════════════════════════════════════
///
/// خواستهٔ مالک (۲۹ شهریور): «هر وقت کاربر امتیاز/سکه/هدیه/آیتمی به دست
/// می‌آورد، دیگه یه گوشه ننویسه "شما ۱۰۰۰ امتیاز دریافت کردید" یا "شما بازی
/// رو بردید"/"شما باختید". به‌جاش یه سیستمِ خوشگلِ زیبای انیمیشنیِ جذاب،
/// یکپارچه در وب و اندروید، که یه لحظه اون چیزی که به دست آورده رو نشون بده،
/// یه جشنِ کوچیک براش بگیره، بعد چند ثانیه بره — و اصلاً اگه یه کم دیرتر هم
/// بره هیچ اختلالی در ادامهٔ کارِ کاربر ایجاد نکنه.»
///
/// آینهٔ وب: `userweb/src/components/RewardMoment.jsx` + استایل‌های
/// `.moment*` در `userweb/src/styles/brand-mark.css`. گاردِ
/// `userweb/tool/reward-parity.mjs` این دو را با هم می‌سنجد.
///
/// ── هم‌سانیِ عددی با وب (بازبینی ۴ مهر) ─────────────────────────────────
///
/// هر عددِ این فایل از CSS وب *استخراج* شده است، نه حدس زده:
///   • ورودِ کارت: `momentIn .52s cubic-bezier(.16,1,.3,1)` با
///     `translateY(20px) scale(.9)` و opacity روی همان منحنی.
///   • پاپِ نشان: keyframeهای `momentPop` — `.4 → 1.14 (در ۶۰٪) → 1` با
///     bezier(.2,1.5,.4,1) روی هر دو بازه و ۴۰ms تأخیر (فولادی ۴۲۰ms).
///   • چیپ‌ها: `momentChipIn .34s cubic-bezier(.2,1.3,.4,1)` با
///     `translateY(6px) scale(.86)` و پله‌های ۰/۷۰/۱۴۰/۲۱۰ms — و در وب فقط
///     `nth-child(2..4)` تأخیر دارند، پس چیپِ پنجم به بعد بدونِ تأخیر است.
///   • خروج: `transition`های `isLeaving` — opacity با `ease`، ترنسفورم با
///     `cubic-bezier(.4,0,1,1)` و blur با `ease`، هر سه ۴۲۰ms.
///   • هاله/درخشش/ذره‌ها: رنگ‌ها، مکان‌ها و پنجرهٔ زمانیِ ۲٫۶ ثانیه‌ایِ ذره‌ها
///     عیناً از `.momentHalo`/`.momentShine`/`.momentParticles`.
///   • `prefers-reduced-motion` وب = `MediaQuery.disableAnimationsOf` اینجا.
///   • رسانهٔ `max-width:400px` وب = `compact` اینجا.
///
/// ── لحن‌ها (KIND_TONE وب) ────────────────────────────────────────────────
///
/// در وب `KIND_TONE = { gain:'gold', win:'gold', draw:'sky', loss:'steel' }`
/// است و `data-tone` همیشه ست می‌شود — یعنی پالتِ لایمِ پایهٔ `.momentCard`
/// در وب **هرگز رندر نمی‌شود**. اندروید قبلاً gain را لایم می‌کشید (از همان
/// پالتِ پایه خوانده بود) و کارتِ جایزهٔ معمولی در دو سکو دو رنگِ متفاوت
/// داشت — همان واگراییِ «یکپارچه نبودن». حالا gain و win هر دو طلایی‌اند.
///
/// ── چهار قاعده‌ای که «بی‌اختلال بودن» را می‌سازند ─────────────────────────
///
///  ۱. `IgnorePointer` دورِ کلِ لایه: هیچ لمسی را نمی‌خورد.
///  ۲. `Overlay` (نه `SnackBar`): به `Scaffold`ِ یک صفحه چسبیده نیست، پس با
///     عوض‌کردنِ تب یا رفتن به بازیِ تمام‌صفحه ناپدید نمی‌شود.
///  ۳. هیچ‌وقت بیش از یکی روی صفحه نیست (صف) و صف سقف دارد.
///  ۴. خروجِ نرم: قبل از برداشتنِ لایه، محو می‌شود؛ تایمرها در `dispose`
///     پاک می‌شوند تا کارت روی صفحه «گیر» نکند.
///
/// ── چرا متن از سرور ──────────────────────────────────────────────────────
///
/// همهٔ عنوان‌ها و جمله‌ها کلیدِ `reward.*` در قراردادِ متنِ زنده‌اند؛ پس
/// (الف) وب و اندروید هرگز دو جملهٔ متفاوت نشان نمی‌دهند و (ب) مالک می‌تواند
/// لحنِ باخت (تصمیمِ خودش: «نرم و آرام») را از پنل عوض کند، بدونِ آپدیتِ اپ.
enum RewardKind { gain, win, loss, draw }

enum RewardSource {
  mission,
  daily,
  custom,
  wheel,
  streak,
  pass,
  shop,
  tap,
  memory,
  league,
}

class RewardMomentData {
  const RewardMomentData({
    required this.source,
    this.kind = RewardKind.gain,
    this.points = 0,
    this.coins = 0,
    this.xp = 0,
    this.level = 0,
    this.item,
    this.note,
  });

  final RewardSource source;
  final RewardKind kind;
  final int points;
  final int coins;
  final int xp;

  /// لولِ تازه‌ای که کاربر همین حالا گرفته (۰ یعنی لولی عوض نشده).
  ///
  /// قبلاً ضربه‌زن لول را داخلِ `note` می‌فرستاد و چون `note` جایگزینِ
  /// چیپ‌ها می‌شد، امتیاز و سکهٔ همان لحظه دیده نمی‌شد. حالا لول فیلدِ
  /// مستقل است و کنارِ بقیه می‌نشیند.
  final int level;

  /// نامِ آیتمِ به‌دست‌آمده (آیتمِ فروشگاه، هدیهٔ گذر نبرد).
  final String? item;

  /// جملهٔ کوتاهِ توضیحیِ سرور (برچسبِ گردونه، نامِ پلن، تعدادِ «دریافت
  /// همه»). سطرِ **اضافه** است، نه جایگزینِ مقدارها.
  final String? note;

  bool get hasAmount => points > 0 || coins > 0 || xp > 0 || level > 0;

  /// نتیجهٔ بازی (برد/باخت/تساوی) خودش پیام است و بی‌عدد هم نمایش داده
  /// می‌شود — همان قاعدهٔ `rewardMoment.js` در وب.
  bool get isResult =>
      kind == RewardKind.win ||
      kind == RewardKind.loss ||
      kind == RewardKind.draw;

  bool get isWorthShowing =>
      isResult ||
      hasAmount ||
      (note != null && note!.isNotEmpty) ||
      (item != null && item!.isNotEmpty);
}

/// سقفِ صف — همان عددی که وب (`QUEUE_LIMIT`) دارد.
const int _queueLimit = 4;

/// محوِ نرم قبل از برداشتن (آینهٔ `LEAVE_MS` وب).
const int _leaveMs = 420;

/// مدتِ نمایش از پنل (قاعدهٔ `rewardSeconds`) با فول‌بکِ امروزِ محصول.
int _visibleMs() {
  final sec = AppConfig.instance.rule('rewardSeconds', 4);
  return math.max(1500, sec * 1000);
}

// ═══════════════════════════════════════════════════════════════════════════
// ثابت‌های حرکت — مستقیماً از `brand-mark.css` وب خوانده شده‌اند.
// ═══════════════════════════════════════════════════════════════════════════

/// `momentIn .52s cubic-bezier(.16,1,.3,1)` — منحنیِ استانداردِ موشنِ وب.
/// برخلافِ easeOutBack از مقصد رد نمی‌شود؛ ورودِ کارت در وب overshoot ندارد.
const Cubic _kInCurve = Cubic(0.16, 1.0, 0.3, 1.0);
const int _kInMs = 520;

/// `momentPop .6s .04s cubic-bezier(.2,1.5,.4,1)` (فولادی: `.42s`).
/// CSS این bezier را بینِ **هر جفت** keyframe اعمال می‌کند، پس بازهٔ دوم
/// (۱٫۱۴ → ۱) هم همان منحنی را دارد و کمی زیرِ ۱ می‌زند و می‌نشیند.
const Cubic _kPopCurve = Cubic(0.2, 1.5, 0.4, 1.0);
const int _kPopDelayMs = 40;
const int _kPopMs = 600;
const int _kPopMsSteel = 420;

/// `momentChipIn .34s cubic-bezier(.2,1.3,.4,1)` با پله‌های ۷۰ms.
/// تأخیرها بر حسبِ **کسرِ** انیمیشنِ ورودِ کارت بیان شده‌اند تا با هر
/// تغییری در طولِ ورود هماهنگ بمانند.
const Cubic _kChipCurve = Cubic(0.2, 1.3, 0.4, 1.0);
const int _kChipMs = 340;
const int _kChipStepMs = 70;
const int _kChipTimelineMs =
    _kChipMs + 3 * _kChipStepMs; // تا پایانِ چیپِ چهارم: 550ms
const double _kChipSpan = _kChipMs / _kChipTimelineMs;
const double _kChipStep = _kChipStepMs / _kChipTimelineMs;

/// `transition`های خروجِ `.momentCard.isLeaving`:
/// `opacity .4s ease`، `transform .4s cubic-bezier(.4,0,1,1)`، `filter .4s ease`.
const Cubic _kOutTransform = Cubic(0.4, 0.0, 1.0, 1.0);

/// `momentSweep 1.15s .12s ease-out 1 both`.
const int _kSweepDelayMs = 120;
const int _kSweepMs = 1150;

/// `momentRise 1.5s ease-out calc(var(--i)*.05s + var(--d)) both` با
/// `--d: (i%6)*.09s`. بزرگ‌ترین تأخیرِ ذره‌ها ۱٫۱ ثانیه است، پس پنجرهٔ
/// کاملِ میدانِ ذره ۲٫۶ ثانیه می‌شود — نه ۱٫۵ تا.
const double _kRiseSec = 1.5;
const int _kRiseTotalMs = 2600;

/// صفِ لحظه‌ها — یک منبعِ واحد برای کلِ اپ (آینهٔ `rewardMoment.js` در وب).
class RewardMoment {
  RewardMoment._();

  static final List<RewardMomentData> _queue = <RewardMomentData>[];
  static OverlayEntry? _entry;
  static Timer? _timer;
  static bool _busy = false;

  /// ثبتِ یک لحظه. اگر نه عددی باشد نه آیتمی نه نتیجه‌ای، هیچ‌چیز نشان داده
  /// نمی‌شود («دعوت فرستاده شد» جشن ندارد).
  static void moment(BuildContext context, RewardMomentData data) {
    if (!data.isWorthShowing) return;
    if (_queue.length >= _queueLimit) return;
    _queue.add(data);
    if (_busy) return;
    final overlay = Overlay.maybeOf(context, rootOverlay: true);
    if (overlay == null) {
      _queue.clear();
      return;
    }
    _showIn(overlay);
  }

  /// نمایشِ سرِ صف روی همان `Overlay`ی که **یک بار** گرفته شده.
  ///
  /// ⚠️ `BuildContext` را به تایمر نمی‌دهیم: استفاده از context بعد از یک
  /// فاصلهٔ async، الگوی خطاداری است که همین تحلیل‌گر گرفته بود
  /// (`use_build_context_synchronously`). `OverlayState` خودش وضعیتِ
  /// mount‌بودن را می‌گوید.
  static void _showIn(OverlayState overlay) {
    _busy = true;
    final data = _queue.removeAt(0);
    _entry = OverlayEntry(builder: (_) => _RewardMomentOverlay(data: data));
    overlay.insert(_entry!);
    final total = _visibleMs();
    _timer = Timer(Duration(milliseconds: math.max(600, total - _leaveMs)), () {
      // خروجِ نرم، بعد برداشتنِ لایه؛ اگر گره از درخت رفته باشد فقط صف را
      // جلو می‌اندازیم. هیچ‌جای این مسیر «منتظرِ» کاربر نمی‌ماند.
      _exit?.call();
      Future<void>.delayed(const Duration(milliseconds: _leaveMs), () {
        // نگهبان لازم است: `OverlayEntry.remove()` دوباره‌صدا‌زدن را در
        // حالتِ دیباگ assertion می‌کند، و این مسیر با `dispose`/`reset`
        // می‌تواند هم‌زمان شود (کاربری که وسطِ نمایش از صفحه بیرون می‌رود).
        final entry = _entry;
        if (entry != null && entry.mounted) entry.remove();
        _entry = null;
        _exit = null;
        if (_queue.isNotEmpty && overlay.mounted) {
          _showIn(overlay);
        } else {
          // صف را پاک می‌کنیم: اگر درخت رفته باشد، لحظهٔ کهنه نباید روزی
          // روی صحنهٔ تازه ظاهر شود.
          _queue.clear();
          _busy = false;
        }
      });
    });
  }

  /// قلابِ خروج که کارتِ روی صفحه در `initState` می‌گذارد (محو + بالا رفتن).
  static VoidCallback? _exit;

  /// فقط برای تست‌ها: پاک‌کردنِ صف و بستنِ لایه.
  @visibleForTesting
  static void reset() {
    _timer?.cancel();
    _timer = null;
    _entry?.remove();
    _entry = null;
    _exit = null;
    _queue.clear();
    _busy = false;
  }

  /// فقط برای تست‌ها: چند لحظه در صف است.
  @visibleForTesting
  static int get queueLength => _queue.length;

  /// فقط برای تست‌ها: آیا کارتی روی صفحه است.
  @visibleForTesting
  static bool get showing => _entry != null;
}

class _RewardMomentOverlay extends StatefulWidget {
  const _RewardMomentOverlay({required this.data});

  final RewardMomentData data;

  @override
  State<_RewardMomentOverlay> createState() => _RewardMomentOverlayState();
}

class _RewardMomentOverlayState extends State<_RewardMomentOverlay>
    with TickerProviderStateMixin {
  // ── کنترلرهای انیمیشن ────────────────────────────────────────────────────
  //
  // ⚠️ `late final` اینجا یک جزئیاتِ ظریف ولی حیاتی است، نه سلیقه.
  // `StatefulElement` ابتدا `createState()` را صدا می‌زند و **بعد**، در
  // بدنهٔ constructor، `state._widget = widget` را ست می‌کند. یعنی هر
  // مقداردهیِ فیلدی که در لحظهٔ ساخت اجرا شود، `widget` را null می‌بیند و
  // `State.widget` با خطای null برمی‌گرداند. چون این فیلدها `late`اند،
  // مقداردهی تا اولین خواندن عقب می‌افتد و آن‌جا `widget` ست است.
  //
  // شروعِ حرکت‌ها در `didChangeDependencies` است (نه `initState`) چون
  // `MediaQuery.disableAnimationsOf` یک inherited widget است و در initState
  // خوانده نمی‌شود.

  /// آینهٔ `prefers-reduced-motion` وب: کاربر «حذفِ انیمیشن» را خواسته است.
  /// وب در این حالت کارت را بی‌حرکت می‌کند (animation-duration:.01s)، هاله
  /// ساکن می‌ماند و درخشش/ذره‌ها `display:none` می‌شوند — ولی خودِ کارت
  /// **حذف نمی‌شود** (تنها نشانهٔ «چیزی گرفتم» است).
  late final bool _reduced;
  bool _started = false;

  Duration _d(int ms) => Duration(milliseconds: _reduced ? 10 : ms);

  late final AnimationController _in =
      AnimationController(vsync: this, duration: _d(_kInMs));
  late final AnimationController _spin = AnimationController(
      vsync: this, duration: const Duration(milliseconds: 4200));
  late final AnimationController _rise = AnimationController(
      vsync: this, duration: const Duration(milliseconds: _kRiseTotalMs));
  late final AnimationController _sweep = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: _kSweepDelayMs + _kSweepMs));
  // CSS چیپ‌ها مستقل از ورودِ کارت زمان‌بندی شده‌اند: انیمیشنِ .34s با
  // پلهٔ آخرِ .21s یعنی کل خط زمانی دقیقاً .55s است.
  late final AnimationController _chips = AnimationController(
      vsync: this, duration: const Duration(milliseconds: _kChipTimelineMs));
  late final AnimationController _out = AnimationController(
      vsync: this, duration: const Duration(milliseconds: _leaveMs));
  late final AnimationController _pop = AnimationController(
      vsync: this,
      duration: _d(_kPopDelayMs +
          (widget.data.kind == RewardKind.loss ? _kPopMsSteel : _kPopMs)));

  /// قلابِ محوِ خروج — تا در `dispose` بتوانیم مطمئن شویم قلابِ روی صف
  /// **مالِ همین کارت** است و قلابِ کارتِ بعدی را پاک نمی‌کنیم (صف کارت‌ها را
  /// پشت‌سرهم نشان می‌دهد). tear-offِ یک متدِ نمونه در دارت canonicalize
  /// می‌شود، پس `identical(RewardMoment._exit, _exitHook)` مثل قبل دقیقاً
  /// همان نمونهٔ ثابت را تشخیص می‌دهد (بدونِ lintِ
  /// prefer_function_declarations_over_variables).
  void _exitHook() => _out.forward();

  @override
  void initState() {
    super.initState();
    RewardMoment._exit = _exitHook;
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_started) return;
    _started = true;
    _reduced = MediaQuery.disableAnimationsOf(context);
    _in.forward();
    _pop.forward();
    _chips.forward();
    if (!_reduced) {
      // وب با reduced-motion: هاله `animation:none` (ساکن)، درخشش و ذره‌ها
      // `display:none`. اینجا یعنی این سه کنترلر اصلاً حرکت نمی‌کنند:
      // _spin روی صفر می‌ماند (هاله ثابت)، _sweep/_rise روی صفر می‌مانند و
      // نقاشِ هر دو در مقدارِ صفر چیزی بیرونِ قاب/نامرئی می‌کشد.
      _spin.repeat();
      _sweep.forward();
      _rise.forward();
    }
  }

  @override
  void dispose() {
    if (identical(RewardMoment._exit, _exitHook)) RewardMoment._exit = null;
    _in.dispose();
    _spin.dispose();
    _rise.dispose();
    _sweep.dispose();
    _chips.dispose();
    _out.dispose();
    _pop.dispose();
    super.dispose();
  }

  /// عنوانِ لحظه، از قراردادِ متنِ زنده.
  ///
  /// ⚠️ عمداً `switch` است و نه نگاشتِ `{source: 'reward.x'}`: گاردِ
  /// `live-copy-coverage` مصرفِ کلید را از شکلِ فراخوانی می‌فهمد
  /// (`AppConfig.instance.text('reward.x', …)`). با نگاشت، ده کلیدِ
  /// `reward.*` «مرده» گزارش می‌شدند — و راست می‌گفت: متنی که ادمین
  /// ویرایش می‌کند از چشمِ ابزار جایی خوانده نمی‌شد.
  String _titleOf(RewardMomentData d) {
    if (d.kind == RewardKind.loss) {
      return AppConfig.instance.text('reward.lossTitle', 'این دور تمام شد');
    }
    if (d.kind == RewardKind.draw) {
      return AppConfig.instance.text('reward.drawTitle', 'پایاپای');
    }
    if (d.kind == RewardKind.win) {
      return AppConfig.instance.text('reward.winTitle', 'بردِ تو ثبت شد');
    }
    switch (d.source) {
      case RewardSource.daily:
        return AppConfig.instance.text('reward.daily', 'جایزهٔ روزانه');
      case RewardSource.custom:
        return AppConfig.instance.text('reward.custom', 'ماموریت اختصاصی');
      case RewardSource.wheel:
        return AppConfig.instance.text('reward.wheel', 'جایزهٔ گردونه');
      case RewardSource.streak:
        return AppConfig.instance.text('reward.streak', 'پاداش زنجیرهٔ ورود');
      case RewardSource.pass:
        return AppConfig.instance.text('reward.pass', 'پاداش گذر نبرد');
      case RewardSource.shop:
        return AppConfig.instance.text('reward.shop', 'خریدِ فروشگاه');
      case RewardSource.tap:
        return AppConfig.instance.text('reward.tap', 'دستاورد ضربه‌زن');
      case RewardSource.memory:
        return AppConfig.instance.text('reward.memory', 'نبرد جفت‌یاب');
      case RewardSource.league:
        return AppConfig.instance.text('reward.league', 'جایزهٔ لیگ');
      case RewardSource.mission:
        return AppConfig.instance.text('reward.mission', 'جایزهٔ ماموریت');
    }
  }

  String _subtitleOf(RewardMomentData d) {
    if (d.kind == RewardKind.loss) {
      return AppConfig.instance.text(
          'reward.lossLine', 'سکه‌هایت سرِ جایشان است — چیزی از دست ندادی');
    }
    if (d.kind == RewardKind.draw) {
      return AppConfig.instance
          .text('reward.drawLine', 'هیچ‌کس کم نیاورد؛ یک دستِ دیگر؟');
    }
    if (d.kind == RewardKind.win) {
      return AppConfig.instance
          .text('reward.winLine', 'حسابِ این برد در پروفایلت ثبت شد');
    }
    return AppConfig.instance.text('reward.received', 'دریافت شد');
  }

  /// ⚠️ هر نامی این‌جا بیاید باید در **هر دو** مجموعهٔ آیکون باشد (وب
  /// `IconAsset.jsx` و اندروید `ui_icon.dart`)؛ گاردِ `icon-parity` و
  /// `reward-parity` همین را می‌سنجند.
  static const Map<RewardSource, String> _sourceIcons = <RewardSource, String>{
    RewardSource.mission: 'check',
    RewardSource.daily: 'gift',
    RewardSource.custom: 'sparkle',
    RewardSource.wheel: 'party',
    RewardSource.streak: 'flame',
    RewardSource.pass: 'medal',
    RewardSource.shop: 'shop',
    RewardSource.tap: 'bolt',
    RewardSource.memory: 'target',
    RewardSource.league: 'crown',
  };

  static const Map<RewardKind, String> _kindIcons = <RewardKind, String>{
    RewardKind.win: 'trophy',
    RewardKind.loss: 'shield',
    RewardKind.draw: 'handshake',
    RewardKind.gain: 'gift',
  };

  // ── پالت — آینهٔ `KIND_TONE` وب: gain/win طلایی، draw آسمانی، loss فولادی ──
  //
  // هیچ رنگِ قرمزِ تندی برای باخت (تصمیمِ مالک). پالتِ لایمِ پایهٔ CSS در وب
  // هرگز رندر نمی‌شود (data-tone همیشه ست است)؛ پس اینجا هم gain طلایی است،
  // نه لایم — «یکپارچه دقیقاً مثلِ وب».

  bool get _isLoss => widget.data.kind == RewardKind.loss;
  bool get _isDraw => widget.data.kind == RewardKind.draw;

  Color get _border {
    if (_isLoss) return const Color(0x4494A3B8); // #94a3b844
    if (_isDraw) return const Color(0x6638BDF8); // #38bdf866
    return const Color(0x66FFD166); // #ffd16666 (طلاییِ gain/win)
  }

  LinearGradient get _cardGradient {
    // `linear-gradient(135deg,…)` = از گوشهٔ بالا-چپ به پایین-راست.
    // stop میانی در وب برای هر لحن یک عددِ متفاوت است: ۵۸٪ / ۶۰٪ / ۶۲٪.
    if (_isLoss) {
      return const LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: [Color(0xFF161C26), Color(0xFF0B1520), Color(0xFF141A22)],
        stops: [0.0, 0.62, 1.0],
      );
    }
    if (_isDraw) {
      return const LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: [Color(0xFF0D2740), Color(0xFF0A2033), Color(0xFF151B3A)],
        stops: [0.0, 0.60, 1.0],
      );
    }
    return const LinearGradient(
      begin: Alignment.topLeft,
      end: Alignment.bottomRight,
      colors: [Color(0xFF2A2410), Color(0xFF0A2033), Color(0xFF0D2A20)],
      stops: [0.0, 0.58, 1.0],
    );
  }

  /// سایهٔ بیرونیِ کارت: فولادی در وب کوتاه‌تر و سبک‌تر است
  /// (`0 22px 54px #000000b0` در برابرِ `0 26px 66px #000000c4`).
  List<BoxShadow> get _cardShadow => _isLoss
      ? const [
          BoxShadow(
              color: Color(0xB0000000), blurRadius: 54, offset: Offset(0, 22)),
        ]
      : const [
          BoxShadow(
              color: Color(0xC4000000), blurRadius: 66, offset: Offset(0, 26)),
        ];

  RadialGradient get _iconFill {
    // `radial-gradient(circle at 30% 24%, c1, c2 72%)` — مرکزِ ۳۰٪/۲۴٪ یعنی
    // `Alignment(-0.4, -0.52)`؛ و «۷۲٪» در CSS نسبت به شعاعِ
    // farthest-corner است (≈۱٫۰۳ برابرِ ضلعِ جعبه از آن مرکز)، نه نسبت به
    // نصفِ عرض. شعاعِ ۰٫۵ در فلاتر رنگِ دوم را زودتر از وب می‌نشاند.
    if (_isLoss) {
      return const RadialGradient(
        center: Alignment(-0.4, -0.52),
        radius: 1.033,
        colors: [Color(0xFFE2E8F0), Color(0xFF8FA3B8)],
        stops: [0.0, 0.74],
      );
    }
    if (_isDraw) {
      return const RadialGradient(
        center: Alignment(-0.4, -0.52),
        radius: 1.033,
        colors: [Color(0xFFBFE9FF), Color(0xFF0B8ED0)],
        stops: [0.0, 0.72],
      );
    }
    return const RadialGradient(
      center: Alignment(-0.4, -0.52),
      radius: 1.033,
      colors: [Color(0xFFFFE9A3), Color(0xFFE0A51D)],
      stops: [0.0, 0.72],
    );
  }

  Color get _iconInk {
    if (_isLoss) return const Color(0xFF0D1620);
    if (_isDraw) return const Color(0xFF04202E);
    return const Color(0xFF2A1A00);
  }

  /// سایهٔ نشان — در وب هر لحن هالهٔ رنگیِ خودش را دارد به‌علاوهٔ یک drop
  /// مشترک (`0 6px 18px #00000055`)؛ فولادی هیچ هالهٔ رنگی ندارد و به‌جایش
  /// یک حلقهٔ داخلیِ ۱ پیکسلی `inset 0 0 0 1px #ffffff33` می‌گیرد.
  List<BoxShadow> get _iconShadow {
    const drop = BoxShadow(
        color: Color(0x55000000), blurRadius: 18, offset: Offset(0, 6));
    if (_isLoss) return const [drop];
    if (_isDraw) {
      return const [BoxShadow(color: Color(0x5538BDF8), blurRadius: 26), drop];
    }
    return const [BoxShadow(color: Color(0x66FFD166), blurRadius: 26), drop];
  }

  /// حلقهٔ داخلیِ نشانِ فولادی (فلاتر inset-shadow ندارد؛ `Border` داخلیِ
  /// BoxDecoration دقیقاً همان `inset 0 0 0 1px` است).
  BoxBorder? get _iconBorder =>
      _isLoss ? Border.all(color: const Color(0x33FFFFFF), width: 1) : null;

  Color get _subColor {
    if (_isLoss) return const Color(0xFFA8B8C8);
    if (_isDraw) return const Color(0xFF8ED8F8);
    return const Color(0xFFFFD166);
  }

  /// رنگ‌های هالهٔ چرخان — در وب **ثابت** است و از لحنِ کارت نمی‌آید:
  /// `conic-gradient(from 0deg,#ffd16600,#ffd166aa,#22e7a600,#38bdf8aa,#ffd16600)`
  /// برای همهٔ لحن‌ها، و فقط فولادی
  /// `conic-gradient(from 0deg,#94a3b800,#cbd5e1aa,#94a3b800)` می‌گیرد.
  /// `from 0deg` یعنی از بالا، ساعت‌گرد — در فلاتر `startAngle: -pi/2`.
  List<Color> get _haloColors => _isLoss
      ? const [Color(0x0094A3B8), Color(0xAACBD5E1), Color(0x0094A3B8)]
      : const [
          Color(0x00FFD166),
          Color(0xAAFFD166),
          Color(0x0022E7A6),
          Color(0xAA38BDF8),
          Color(0x00FFD166),
        ];

  /// موقعیتِ پیشرفتِ پاپِ نشان (۰..۱) با احتسابِ تأخیرِ ۴۰ms وب.
  double get _popT {
    if (_reduced) return 1.0;
    final dur = _isLoss ? _kPopMsSteel : _kPopMs;
    return ((_pop.value * (_kPopDelayMs + dur) - _kPopDelayMs) / dur)
        .clamp(0.0, 1.0);
  }

  /// بازسازیِ دقیقِ `@keyframes momentPop`:
  /// `0%{scale(.4)} 60%{scale(1.14)} 100%{scale(1)}` با bezier(.2,1.5,.4,1)
  /// روی هر بازه. یک tweenِ سادهٔ `.4→1` با این منحنی فقط تا ≈۱٫۰۵ بالا
  /// می‌رفت — همان «پاپِ بی‌جون»ی که از وب کم داشت.
  double _popScaleAt(double t) => t <= 0.6
      ? 0.4 + (1.14 - 0.4) * _kPopCurve.transform(t / 0.6)
      : 1.14 + (1.0 - 1.14) * _kPopCurve.transform((t - 0.6) / 0.4);

  /// `0%{opacity:0} 60%{opacity:1}` — همان منحنیِ بازه (می‌تواند بالای ۱
  /// بزند؛ CSS هم clamp می‌کند، پس اینجا هم clamp).
  double _popOpacityAt(double t) =>
      t <= 0.6 ? _kPopCurve.transform(t / 0.6).clamp(0.0, 1.0) : 1.0;

  @override
  Widget build(BuildContext context) {
    final d = widget.data;
    final isLoss = d.kind == RewardKind.loss;
    final icon = d.kind == RewardKind.gain
        ? (_sourceIcons[d.source] ?? 'gift')
        : (_kindIcons[d.kind] ?? 'gift');

    // ── رسانهٔ `max-width:400px` وب: کارت روی گوشیِ باریک جمع‌تر می‌شود ──
    final screen = MediaQuery.sizeOf(context);
    final compact = screen.width <= 400;
    final iconSize = compact ? 44.0 : 50.0;
    final radius = compact ? 19.0 : 22.0;
    final cardMargin = compact ? 9.0 : 13.0;
    final cardPadding = compact
        ? const EdgeInsets.fromLTRB(12, 12, 13, 12)
        : const EdgeInsets.fromLTRB(14, 14, 16, 14);
    final titleSize = compact ? 14.0 : 15.0;
    // `.momentHost{padding-top:max(64px,18vh)}` — لبهٔ بالای کارت، نه مرکزش.
    final topPad = math.max(64.0, 0.18 * screen.height);

    // ⚠️ فول‌بکِ هر چیپ عمداً خودش عدد را دارد و نه `{amount}`: `text()` وقتی
    // قالبِ زندهٔ سرور نرسیده باشد فول‌بک را بی‌دست‌زدن برمی‌گرداند، پس
    // قالبِ ناپر روی صفحهٔ کاربرِ آفلاین به‌صورت آکولاد چاپ می‌شد. `vars`
    // می‌ماند تا وقتی ادمین قالب را از پنل عوض می‌کند همان‌جا پر شود.
    final chips = <Widget>[
      if (d.points > 0)
        _chip(
            'star',
            AppConfig.instance.text(
                'reward.points', '+${faNum(d.points)} امتیاز',
                vars: {'amount': d.points})),
      if (d.coins > 0)
        _chip(
            'coins',
            AppConfig.instance.text('reward.coins', '+${faNum(d.coins)} سکه',
                vars: {'amount': d.coins})),
      if (d.xp > 0)
        _chip(
            'bolt',
            AppConfig.instance.text('reward.xp', '+${faNum(d.xp)} تجربه',
                vars: {'amount': d.xp})),
      if (d.level > 0)
        _chip(
            'medal',
            AppConfig.instance.text('reward.level', 'لولِ ${faNum(d.level)}',
                vars: {'level': d.level}),
            highlight: true),
      if (d.item != null && d.item!.isNotEmpty) _chip('item', d.item!),
    ];

    return IgnorePointer(
      child: Align(
        alignment: Alignment.topCenter,
        child: Padding(
          padding: EdgeInsets.only(top: topPad),
          // ── ورودِ کارت: `momentIn .52s cubic-bezier(.16,1,.3,1) both` ──
          // opacity و transform هر دو روی **همان منحنی** (وب یک animation
          // دارد که هر دو را با هم می‌برد؛ پیاده‌سازیِ قبلی opacity را خطی
          // و حرکت را با easeOutBackِ overshoot‌دار می‌برد).
          child: AnimatedBuilder(
            animation: _in,
            builder: (_, child) {
              final t = _kInCurve.transform(_in.value);
              return Opacity(
                opacity: t.clamp(0.0, 1.0),
                child: Transform.translate(
                  offset: Offset(0, 20 * (1 - t)),
                  child: Transform.scale(scale: 0.9 + 0.1 * t, child: child),
                ),
              );
            },
            child: AnimatedBuilder(
              animation: _out,
              builder: (_, child) {
                final t = _out.value;
                // وب هنگامِ رفتن سه transition جدا دارد: opacity با `ease`،
                // transform با `cubic-bezier(.4,0,1,1)` و blur با `ease`.
                // پیاده‌سازیِ قبلی هر سه را خطی می‌برد.
                final te = Curves.ease.transform(t);
                final tt = _kOutTransform.transform(t);
                Widget out = child!;
                if (t > 0) {
                  out = ImageFiltered(
                    imageFilter:
                        ImageFilter.blur(sigmaX: 3 * te, sigmaY: 3 * te),
                    child: out,
                  );
                }
                return Opacity(
                  opacity: (1 - te).clamp(0.0, 1.0),
                  child: Transform.translate(
                    offset: Offset(0, -12 * tt),
                    child: Transform.scale(
                      scale: 1 - 0.035 * tt,
                      child: out,
                    ),
                  ),
                );
              },
              child: Semantics(
                liveRegion: true,
                label: _titleOf(d),
                child: Container(
                  constraints: const BoxConstraints(maxWidth: 430),
                  margin: EdgeInsets.symmetric(horizontal: cardMargin),
                  decoration: BoxDecoration(
                    gradient: _cardGradient,
                    borderRadius: BorderRadius.circular(radius),
                    border: Border.all(color: _border),
                    boxShadow: _cardShadow,
                  ),
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(radius - 1),
                    child: Stack(
                      children: [
                        // ذره‌ها فقط برای برد و جایزه — برای باخت هیچ حرکتِ
                        // شادی نیست تا حسِ مسخره‌شدن ندهد.
                        if (!isLoss)
                          Positioned.fill(
                            child: AnimatedBuilder(
                              animation: _rise,
                              builder: (_, __) => CustomPaint(
                                painter: _MomentParticles(p: _rise.value),
                              ),
                            ),
                          ),
                        // هالهٔ چرخان — `top:-42px;right:-34px;150px` با
                        // `opacity:.5` (فولادی `.22`) و `filter:blur(2px)`.
                        Positioned(
                          top: -42,
                          right: -34,
                          child: Opacity(
                            opacity: isLoss ? 0.22 : 0.5,
                            child: ImageFiltered(
                              imageFilter:
                                  ImageFilter.blur(sigmaX: 2, sigmaY: 2),
                              child: RotationTransition(
                                turns: _spin,
                                child: Container(
                                  width: 150,
                                  height: 150,
                                  decoration: BoxDecoration(
                                    shape: BoxShape.circle,
                                    gradient: SweepGradient(
                                      // `conic-gradient(from 0deg,…)` = از
                                      // بالا، ساعت‌گرد.
                                      startAngle: -math.pi / 2,
                                      colors: _haloColors,
                                    ),
                                  ),
                                ),
                              ),
                            ),
                          ),
                        ),
                        // درخششِ کشیده — `momentSweep 1.15s .12s ease-out`.
                        Positioned.fill(
                          child: AnimatedBuilder(
                            animation: _sweep,
                            builder: (_, __) => CustomPaint(
                              painter: _MomentShine(
                                p: ((_sweep.value *
                                                (_kSweepDelayMs + _kSweepMs) -
                                            _kSweepDelayMs) /
                                        _kSweepMs)
                                    .clamp(0.0, 1.0),
                                steel: isLoss,
                              ),
                            ),
                          ),
                        ),
                        // هایلایتِ داخلیِ لبهٔ بالا — همان
                        // `inset 0 1px 0 #ffffff1f` وب (فولادی `#ffffff14`)
                        // که به کارت عمق می‌دهد. ClipRRectِ بیرونی آن را در
                        // گوشه‌های گرد کوتاه می‌کند، دقیقاً مثلِ یک inset.
                        Positioned(
                          top: 0,
                          left: 0,
                          right: 0,
                          child: SizedBox(
                            height: 1,
                            child: ColoredBox(
                              color: isLoss
                                  ? const Color(0x14FFFFFF)
                                  : const Color(0x1FFFFFFF),
                            ),
                          ),
                        ),
                        Padding(
                          padding: cardPadding,
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.center,
                            children: [
                              // ── پاپِ نشان: momentPop با تأخیرِ ۴۰ms ──
                              AnimatedBuilder(
                                animation: _pop,
                                builder: (_, child) {
                                  final t = _popT;
                                  return Opacity(
                                    opacity: _popOpacityAt(t),
                                    child: Transform.scale(
                                      scale: _popScaleAt(t),
                                      child: child,
                                    ),
                                  );
                                },
                                child: Container(
                                  width: iconSize,
                                  height: iconSize,
                                  decoration: BoxDecoration(
                                    shape: BoxShape.circle,
                                    gradient: _iconFill,
                                    border: _iconBorder,
                                    boxShadow: _iconShadow,
                                  ),
                                  child: Center(
                                    child: UiIcon(icon,
                                        size: compact ? 27 : 30,
                                        color: _iconInk),
                                  ),
                                ),
                              ),
                              const SizedBox(width: 13),
                              Expanded(
                                child: Column(
                                  mainAxisSize: MainAxisSize.min,
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(_titleOf(d),
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                        style: TextStyle(
                                            fontSize: titleSize,
                                            fontWeight: FontWeight.w900,
                                            color: const Color(0xFFEAF6FF))),
                                    const SizedBox(height: 2),
                                    Text(_subtitleOf(d),
                                        maxLines: 2,
                                        overflow: TextOverflow.ellipsis,
                                        style: TextStyle(
                                            fontSize: 12,
                                            // وب: `.momentSub` وزنِ ۸۰۰ دارد
                                            // ولی فولادی ۷۰۰ — لحنِ آرامِ
                                            // باخت از تایپوگرافی هم می‌آید.
                                            fontWeight: isLoss
                                                ? FontWeight.w700
                                                : FontWeight.w800,
                                            color: _subColor)),
                                    // مقدار همیشه دیده می‌شود؛ `note`
                                    // فقط یک سطرِ توضیحیِ اضافه است.
                                    // قبلاً این سه `else if` بودند و
                                    // وجودِ note مقدارها را خاموش می‌کرد.
                                    if (chips.isNotEmpty)
                                      Padding(
                                        padding: const EdgeInsets.only(top: 6),
                                        child: Wrap(
                                            spacing: 6,
                                            runSpacing: 6,
                                            children: [
                                              for (var i = 0;
                                                  i < chips.length;
                                                  i++)
                                                _MomentChipIn(
                                                  index: i,
                                                  animation: _chips,
                                                  child: chips[i],
                                                ),
                                            ]),
                                      ),
                                    // `.momentNote` وب **همیشه** طلایی است
                                    // (#ffd166) و رنگِ لحن را نمی‌گیرد.
                                    if (d.note != null && d.note!.isNotEmpty)
                                      Padding(
                                        padding: const EdgeInsets.only(top: 6),
                                        child: Text(d.note!,
                                            style: const TextStyle(
                                                fontSize: 12.5,
                                                fontWeight: FontWeight.w900,
                                                color: Color(0xFFFFD166))),
                                      ),
                                  ],
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  /// [highlight] برای دستاورد (لول) — باید از موجودی (امتیاز/سکه) متمایز
  /// باشد. آینهٔ `.momentChip[data-kind='level']` در وب: پس‌زمینهٔ
  /// **گرادیانِ** طلایی→نارنجی (`#ffd16636 → #f9731626`)، نه رنگِ تخت.
  Widget _chip(String icon, String label, {bool highlight = false}) =>
      Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
        decoration: BoxDecoration(
          gradient: highlight
              ? const LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [Color(0x36FFD166), Color(0x26F97316)],
                )
              : null,
          color: highlight ? null : const Color(0x12FFFFFF),
          border: Border.all(
              color: highlight
                  ? const Color(0x73FFD166)
                  : const Color(0x26FFFFFF)),
          borderRadius: BorderRadius.circular(99),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            UiIcon(icon,
                size: 17,
                color: highlight ? const Color(0xFFFFE6A8) : Colors.white),
            const SizedBox(width: 5),
            Text(label,
                style: TextStyle(
                    fontSize: 12.5,
                    fontWeight: FontWeight.w900,
                    color: highlight ? const Color(0xFFFFE6A8) : Colors.white,
                    fontFeatures: const [FontFeature.tabularFigures()])),
          ],
        ),
      );
}

/// ۱۴ ذرهٔ ریزِ بالا‌رونده. بی‌تصادفِ زمانِ اجرا تا اسکرین‌شات‌ها یکسان بماند.
///
/// آینهٔ دقیقِ `.momentParticles span` وب:
///   • `left: (i*41)%100٪` و `bottom:-6px` (مرکزِ ذره ۳٫۵ پیکسل زیرِ لبهٔ
///     پایین شروع می‌شود و با `translateY(-70px)` بالا می‌رود)،
///   • تأخیرِ هر ذره `i*.05s + (i%6)*.09s` — پس میدانِ کامل ۲٫۶ ثانیه است،
///   • `momentRise`: opacity در دو بازهٔ ease-out (اوجِ ۰٫۹ در ۲۲٪) و
///     جای/مقیاس در یک بازهٔ ease-out از ۰٪ تا ۱۰۰٪ (`scale(.6)→(1.05)`).
class _MomentParticles extends CustomPainter {
  _MomentParticles({required this.p});

  final double p;

  static const List<Color> _colors = <Color>[
    Color(0xFFFFD166),
    Color(0xFF00D49A),
    Color(0xFF38BDF8),
    Color(0xFFA78BFA),
    Color(0xFFF472B6),
  ];

  @override
  void paint(Canvas canvas, Size size) {
    final elapsed = p * (_kRiseTotalMs / 1000.0); // ثانیه
    for (var i = 0; i < 14; i++) {
      final delay = i * 0.05 + (i % 6) * 0.09;
      final raw = (elapsed - delay) / _kRiseSec;
      if (raw <= 0) continue;
      final t = raw.clamp(0.0, 1.0);
      final e = Curves.easeOut.transform(t);
      final opacity = t < 0.22
          ? 0.9 * Curves.easeOut.transform(t / 0.22)
          : 0.9 * (1 - Curves.easeOut.transform((t - 0.22) / 0.78));
      if (opacity <= 0.002) continue;
      final paint = Paint()
        ..color = _colors[i % _colors.length].withValues(alpha: opacity);
      final x = ((i * 41) % 100) / 100 * size.width + 2.5;
      final y = size.height + 3.5 - 70 * e;
      canvas.drawCircle(Offset(x, y), 2.5 * (0.6 + 0.45 * e), paint);
    }
  }

  @override
  bool shouldRepaint(_MomentParticles old) => old.p != p;
}

/// درخششِ کشیده روی سطحِ کارت — یک بار، سریع، بی‌تکرار.
///
/// هندسهٔ وب: باندی به عرضِ ۳۸٪ کارت که از `translateX(-140%)` به
/// `translateX(+140%)` می‌رود (درصد نسبت به **عرضِ خودِ باند**) با
/// `ease-out` و ۱۲۰ms تأخیر؛ و چون `fill: both` است، در پایان همان‌جا سمتِ
/// راست می‌ایستد (لبهٔ چپش در ۵۳٪ عرضِ کارت). فولادی
/// `#ffffff1a` است و بقیه `#ffffff2e`.
class _MomentShine extends CustomPainter {
  _MomentShine({required this.p, required this.steel});

  final double p;
  final bool steel;

  @override
  void paint(Canvas canvas, Size size) {
    final t = Curves.easeOut.transform(p);
    final w = size.width * 0.38;
    final left = (-1.4 + 2.8 * t) * w;
    final rect = Rect.fromLTWH(left, 0, w, size.height);
    final paint = Paint()
      ..shader = LinearGradient(colors: [
        const Color(0x00FFFFFF),
        steel ? const Color(0x1AFFFFFF) : const Color(0x2EFFFFFF),
        const Color(0x00FFFFFF),
      ]).createShader(rect);
    canvas.drawRect(rect, paint);
  }

  @override
  bool shouldRepaint(_MomentShine old) => old.p != p || old.steel != steel;
}

/// ورودِ پله‌ایِ چیپ‌ها — همان `momentChipIn` وب.
///
/// در وب، چیپ‌هایِ لحظهٔ جایزه یکی‌یکی و با تأخیرِ ۰/۰٫۰۷/۰٫۱۴/۰٫۲۱ ثانیه
/// می‌آیند (`.momentRow .momentChip:nth-child(n)`) و هر کدام از
/// `translateY(6px) scale(.86)` با bezier(.2,1.3,.4,1) — که کمی از مقصد رد
/// می‌شود و می‌نشیند — به `none` می‌رسند. این پله‌ای بودن بخشِ زیادی از
/// جذابیتِ کارت است: چشم دنبالِ چیپِ بعدی می‌رود و هر کدام جداگانه «ثبت»
/// می‌شود.
///
/// دو نکتهٔ هم‌سانی که قبلاً رعایت نشده بود:
///   ۱. وب برای چیپِ پنجم به بعد **هیچ** تأخیری تعریف نکرده (فقط
///      `nth-child(2..4)`) — یعنی چیپِ پنجم با تأخیرِ صفر می‌آید. قبلاً
///      اندروید آن را روی آخرین پله می‌گذاشت.
///   ۲. scale(.86) و جابه‌جاییِ ۶ پیکسلیِ ثابت؛ قبلاً فقط slideِ درصدی بود.
class _MomentChipIn extends StatelessWidget {
  const _MomentChipIn({
    required this.index,
    required this.animation,
    required this.child,
  });

  final int index;
  final Animation<double> animation;
  final Widget child;

  /// طولِ هر پله بر حسبِ کسر: ۰٫۳۴ ثانیه از ۰٫۵۲ ثانیه.
  static const double _span = _kChipSpan;

  /// گامِ تأخیر: ۰٫۰۷ ثانیه از ۰٫۵۲ ثانیه.
  static const double _step = _kChipStep;

  @override
  Widget build(BuildContext context) {
    // وب: nth-child(2)→.07s، (3)→.14s، (4)→.21s و بقیه بدونِ تأخیر.
    final step = (index >= 1 && index <= 3) ? index : 0;
    final start = (step * _step).clamp(0.0, 1.0);
    final curved = CurvedAnimation(
      parent: animation,
      curve: Interval(
        start,
        (start + _span).clamp(0.0, 1.0),
        curve: _kChipCurve,
      ),
    );
    return AnimatedBuilder(
      animation: curved,
      builder: (_, child) {
        // منحنی از ۱ رد می‌شود (y1=1.3) — دقیقاً مثلِ CSS که آن‌جا هم
        // transform کمی از مقصد overshoot می‌کند؛ opacity ولی clamp می‌شود
        // (همان کاری که مرورگر می‌کند).
        final t = curved.value;
        return Opacity(
          opacity: t.clamp(0.0, 1.0),
          child: Transform.translate(
            offset: Offset(0, 6 * (1 - t)),
            child: Transform.scale(scale: 0.86 + 0.14 * t, child: child),
          ),
        );
      },
      child: child,
    );
  }
}
