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
/// یه جشنِ کوچیک براش بگیره، بعد چند ثانیه بره — و اصلاً اگه یکم دیرتر هم
/// بره هیچ اختلالی در ادامهٔ کارِ کاربر ایجاد نکنه.»
///
/// آینهٔ وب: `userweb/src/components/RewardMoment.jsx` + استایل‌های
/// `.moment*` در `userweb/src/styles/brand-mark.css`. گاردِ
/// `userweb/tool/reward-parity.mjs` این دو را با هم می‌سنجد.
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
  bool get isResult => kind == RewardKind.win || kind == RewardKind.loss || kind == RewardKind.draw;

  bool get isWorthShowing =>
      isResult || hasAmount || (note != null && note!.isNotEmpty) || (item != null && item!.isNotEmpty);
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
  late final AnimationController _in = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 520),
  )..forward();
  late final AnimationController _spin = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 4200),
  )..repeat();
  late final AnimationController _rise = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1500),
  )..forward();
  late final AnimationController _sweep = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1150),
  )..forward();
  late final AnimationController _out = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: _leaveMs),
  );

  // ── پاپِ نشان ──────────────────────────────────────────────────────────
  // در وب `.momentIcon` با `momentPop` می‌آید: از مقیاسِ ۰٫۴ شروع می‌کند،
  // تا ۱٫۱۴ از مقصد رد می‌شود و می‌نشیند روی ۱ — و این همان چیزی است که
  // «جشن» را از «یک کارت که ظاهر شد» جدا می‌کند. اندروید این انیمیشن را
  // نداشت و نشان هم‌زمان با خودِ کارت می‌آمد، بی‌هیچ تأکیدی.
  //
  // حالتِ فولادی در وب کوتاه‌تر است (`.42s` در برابر `.6s`): باخت نباید
  // به اندازهٔ برد جشن گرفته شود.
  // ⚠️ `late final` اینجا یک جزئیاتِ ظریف ولی حیاتی است، نه سلیقه.
  // `StatefulElement` ابتدا `createState()` را صدا می‌زند و **بعد**، در
  // بدنهٔ constructor، `state._widget = widget` را ست می‌کند. یعنی هر
  // مقداردهیِ فیلدی که در لحظهٔ ساخت اجرا شود، `widget` را null می‌بیند و
  // `State.widget` با خطای null برمی‌گرداند. چون این فیلدها `late`اند،
  // مقداردهی تا اولین خواندن (در `build`) عقب می‌افتد و آن‌جا `widget` ست
  // است. اگر روزی `late` را بردارید، همین خط اپ را روی ویجتِ اول می‌کشد.
  late final AnimationController _pop = AnimationController(
    vsync: this,
    duration: Duration(
        milliseconds: widget.data.kind == RewardKind.loss ? 420 : 600),
  )..forward();

  /// مقیاسِ نشان. منحنی عمداً از ۱ هم می‌گذرد (`y1 = 1.5`) تا همان جهشِ
  /// ۱٫۱۴ وب را بسازد — بدون نیاز به keyframeهای دستی.
  late final Animation<double> _popScale = Tween<double>(begin: 0.4, end: 1.0)
      .animate(
          CurvedAnimation(parent: _pop, curve: const Cubic(0.2, 1.5, 0.4, 1)));

  /// نشان تا ۶۰٪ِ انیمیشن کامل دیده می‌شود (همان `60%{opacity:1}` وب).
  late final Animation<double> _popFade = Tween<double>(begin: 0.0, end: 1.0)
      .animate(CurvedAnimation(
          parent: _pop, curve: const Interval(0.0, 0.6)));

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
  void dispose() {
    if (identical(RewardMoment._exit, _exitHook)) RewardMoment._exit = null;
    _in.dispose();
    _spin.dispose();
    _rise.dispose();
    _sweep.dispose();
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
      return AppConfig.instance.text('reward.lossLine', 'سکه‌هایت سرِ جایشان است — چیزی از دست ندادی');
    }
    if (d.kind == RewardKind.draw) {
      return AppConfig.instance.text('reward.drawLine', 'هیچ‌کس کم نیاورد؛ یک دستِ دیگر؟');
    }
    if (d.kind == RewardKind.win) {
      return AppConfig.instance.text('reward.winLine', 'حسابِ این برد در پروفایلت ثبت شد');
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

  /// پالتِ هر حالت — هیچ رنگِ قرمزِ تندی برای باخت (تصمیمِ مالک).
  Color get _border {
    switch (widget.data.kind) {
      case RewardKind.loss:
        return const Color(0x4494A3B8);
      case RewardKind.draw:
        return const Color(0x6638BDF8);
      case RewardKind.win:
        return const Color(0x66FFD166);
      case RewardKind.gain:
        return const Color(0x55B5EF58);
    }
  }

  List<Color> get _gradient {
    switch (widget.data.kind) {
      case RewardKind.loss:
        return const [Color(0xFF161C26), Color(0xFF0B1520), Color(0xFF141A22)];
      case RewardKind.draw:
        return const [Color(0xFF0D2740), Color(0xFF0A2033), Color(0xFF151B3A)];
      case RewardKind.win:
        return const [Color(0xFF2A2410), Color(0xFF0A2033), Color(0xFF0D2A20)];
      case RewardKind.gain:
        return const [Color(0xFF0F2F27), Color(0xFF0A2033), Color(0xFF132038)];
    }
  }

  List<Color> get _iconGradient {
    switch (widget.data.kind) {
      case RewardKind.loss:
        return const [Color(0xFFE2E8F0), Color(0xFF8FA3B8)];
      case RewardKind.draw:
        return const [Color(0xFFBFE9FF), Color(0xFF0B8ED0)];
      case RewardKind.win:
        return const [Color(0xFFFFE9A3), Color(0xFFE0A51D)];
      case RewardKind.gain:
        return const [Color(0xFFB5EF58), Color(0xFF00D49A)];
    }
  }

  Color get _iconInk {
    switch (widget.data.kind) {
      case RewardKind.loss:
        return const Color(0xFF0D1620);
      case RewardKind.draw:
        return const Color(0xFF04202E);
      case RewardKind.win:
        return const Color(0xFF2A1A00);
      case RewardKind.gain:
        return const Color(0xFF06220F);
    }
  }

  Color get _subColor {
    switch (widget.data.kind) {
      case RewardKind.loss:
        return const Color(0xFFA8B8C8);
      case RewardKind.draw:
        return const Color(0xFF8ED8F8);
      case RewardKind.win:
        return const Color(0xFFFFD166);
      case RewardKind.gain:
        return const Color(0xFFB5EF58);
    }
  }

  @override
  Widget build(BuildContext context) {
    final d = widget.data;
    final isLoss = d.kind == RewardKind.loss;
    final icon = d.kind == RewardKind.gain
        ? (_sourceIcons[d.source] ?? 'gift')
        : (_kindIcons[d.kind] ?? 'gift');

    // ⚠️ فول‌بکِ هر چیپ عمداً خودش عدد را دارد و نه `{amount}`: `text()` وقتی
    // قالبِ زندهٔ سرور نرسیده باشد فول‌بک را بی‌دست‌زدن برمی‌گرداند، پس
    // قالبِ ناپر روی صفحهٔ کاربرِ آفلاین به‌صورت آکولاد چاپ می‌شد. `vars`
    // می‌ماند تا وقتی ادمین قالب را از پنل عوض می‌کند همان‌جا پر شود.
    final chips = <Widget>[
      if (d.points > 0)
        _chip('star', AppConfig.instance.text('reward.points',
            '+${faNum(d.points)} امتیاز', vars: {'amount': d.points})),
      if (d.coins > 0)
        _chip('coins', AppConfig.instance.text('reward.coins',
            '+${faNum(d.coins)} سکه', vars: {'amount': d.coins})),
      if (d.xp > 0)
        _chip('bolt', AppConfig.instance.text('reward.xp',
            '+${faNum(d.xp)} تجربه', vars: {'amount': d.xp})),
      if (d.level > 0)
        _chip(
            'medal',
            AppConfig.instance.text('reward.level', 'لولِ ${faNum(d.level)}',
                vars: {'level': d.level}),
            highlight: true),
      if (d.item != null && d.item!.isNotEmpty) _chip('item', d.item!),
    ];

    final curve = CurvedAnimation(parent: _in, curve: Curves.easeOutBack);
    return IgnorePointer(
      child: Align(
        // ۱۸٪ از بالای صفحه: بالاتر از نوارِ ناوبریِ پایین و از نوارِ
        // پیشرفتِ بازی‌ها (همان `padding-top: max(64px,18vh)` وب).
        alignment: const Alignment(0, -0.62),
        child: FadeTransition(
          opacity: _in,
          child: SlideTransition(
            position: Tween<Offset>(begin: const Offset(0, 0.18), end: Offset.zero)
                .animate(curve),
            child: ScaleTransition(
              scale: Tween<double>(begin: 0.9, end: 1).animate(curve),
              child: AnimatedBuilder(
                animation: _out,
                builder: (_, child) {
                  final t = _out.value;
                  // وب هنگامِ رفتن، کارت را علاوه بر محو شدن **تار** و کمی
                  // کوچک هم می‌کند (`filter:blur(3px)` و `scale(.965)`)؛
                  // اندروید فقط محو و جابه‌جا می‌شد و همین باعث می‌شد رفتنش
                  // «بریدن» به‌نظر برسد نه «دور شدن».
                  Widget out = child!;
                  if (t > 0) {
                    out = ImageFiltered(
                      imageFilter:
                          ImageFilter.blur(sigmaX: 3 * t, sigmaY: 3 * t),
                      child: out,
                    );
                  }
                  return Opacity(
                    opacity: 1 - t,
                    child: Transform.translate(
                      offset: Offset(0, -12 * t),
                      child: Transform.scale(
                        scale: 1 - 0.035 * t,
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
                    margin: const EdgeInsets.symmetric(horizontal: 13),
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                        colors: _gradient,
                      ),
                      borderRadius: BorderRadius.circular(22),
                      border: Border.all(color: _border),
                      boxShadow: const [
                        BoxShadow(color: Color(0xC4000000), blurRadius: 66, offset: Offset(0, 26)),
                      ],
                    ),
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(21),
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
                          Positioned(
                            top: -46,
                            right: -38,
                            child: Opacity(
                              // وب: `.momentHalo{opacity:.5}` و برای فولادی
                              // `.22`. اینجا هم همان دو عددند تا شدتِ هاله در
                              // دو سکو یکی باشد.
                              opacity: isLoss ? 0.22 : 0.5,
                              child: RotationTransition(
                                turns: _spin,
                                child: Container(
                                  width: 152,
                                  height: 152,
                                  decoration: BoxDecoration(
                                    shape: BoxShape.circle,
                                    gradient: SweepGradient(colors: [
                                      // 0xaa در وب = ۰٫۶۶۷؛ شفافیتِ بالا این
                                      // عدد را به همان شدتِ وب می‌رساند.
                                      _subColor.withValues(alpha: 0.667),
                                      Colors.transparent,
                                      _iconGradient.last.withValues(alpha: 0.667),
                                      Colors.transparent,
                                      _subColor.withValues(alpha: 0.667),
                                    ]),
                                  ),
                                ),
                              ),
                            ),
                          ),
                          Positioned.fill(
                            child: AnimatedBuilder(
                              animation: _sweep,
                              builder: (_, __) => CustomPaint(
                                painter: _MomentShine(p: _sweep.value),
                              ),
                            ),
                          ),
                          // هایلایتِ داخلیِ لبهٔ بالا — همان
                          // `inset 0 1px 0 #ffffff1f` وب که به کارت عمق
                          // می‌دهد و لبه‌اش را از زمینه جدا می‌کند. در
                          // اندروید نبود، برای همین کارت تخت و «بریده»
                          // دیده می‌شد. ClipRRectِ بیرونی آن را در گوشه‌های
                          // گرد کوتاه می‌کند، دقیقاً مثلِ یک inset.
                          Positioned(
                            top: 0,
                            left: 0,
                            right: 0,
                            child: IgnorePointer(
                              child: Container(
                                height: 1,
                                color: isLoss
                                    ? const Color(0x14FFFFFF)
                                    : const Color(0x1FFFFFFF),
                              ),
                            ),
                          ),
                          Padding(
                            padding: const EdgeInsets.fromLTRB(14, 14, 16, 14),
                            child: Row(
                              crossAxisAlignment: CrossAxisAlignment.center,
                              children: [
                                ScaleTransition(
                                  scale: _popScale,
                                  child: FadeTransition(
                                    opacity: _popFade,
                                    child: Container(
                                      width: 50,
                                      height: 50,
                                      decoration: BoxDecoration(
                                        shape: BoxShape.circle,
                                        gradient: RadialGradient(
                                          center: const Alignment(-0.4, -0.5),
                                          colors: _iconGradient,
                                        ),
                                        boxShadow: [
                                          BoxShadow(color: _iconGradient.last.withValues(alpha: 0.35), blurRadius: 26),
                                        ],
                                      ),
                                      child: Center(
                                        child: UiIcon(icon, size: 28, color: _iconInk),
                                      ),
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
                                          style: const TextStyle(
                                              fontSize: 15,
                                              fontWeight: FontWeight.w900,
                                              color: Color(0xFFEAF6FF))),
                                      const SizedBox(height: 2),
                                      Text(_subtitleOf(d),
                                          maxLines: 2,
                                          overflow: TextOverflow.ellipsis,
                                          style: TextStyle(
                                              fontSize: 12,
                                              fontWeight: FontWeight.w800,
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
                                                for (var i = 0; i < chips.length; i++)
                                                  _MomentChipIn(
                                                    index: i,
                                                    animation: _in,
                                                    child: chips[i],
                                                  ),
                                              ]),
                                        ),
                                      if (d.note != null && d.note!.isNotEmpty)
                                        Padding(
                                          padding: const EdgeInsets.only(top: 6),
                                          child: Text(d.note!,
                                              style: TextStyle(
                                                  fontSize: 12.5,
                                                  fontWeight: FontWeight.w900,
                                                  color: _subColor)),
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
      ),
    );
  }

  /// [highlight] برای دستاورد (لول) — باید از موجودی (امتیاز/سکه) متمایز
  /// باشد. آینهٔ `.momentChip[data-kind='level']` در وب.
  Widget _chip(String icon, String label, {bool highlight = false}) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
        decoration: BoxDecoration(
          color: highlight ? const Color(0x2EFFD166) : const Color(0x12FFFFFF),
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

/// ۱۴ ذرهٔ ریزِ بالا‌رونده. بی‌تصادفِ زمانِ اجرا تا اسکرین‌شات‌ها یکسان بمانند.
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
    for (var i = 0; i < 14; i++) {
      final start = ((i % 6) * 0.09) + (i * 0.05);
      final t = ((p - start) / 0.72).clamp(0.0, 1.0);
      if (t <= 0) continue;
      final opacity = t < 0.25 ? t / 0.25 : (1 - (t - 0.25) / 0.75);
      final paint = Paint()..color = _colors[i % _colors.length].withValues(alpha: opacity * 0.86);
      final x = ((i * 41) % 100) / 100 * size.width;
      final y = size.height - 6 - (t * 70);
      canvas.drawCircle(Offset(x, y), 2.5, paint);
    }
  }

  @override
  bool shouldRepaint(_MomentParticles old) => old.p != p;
}

/// درخششِ کشیده روی سطحِ کارت — یک بار، سریع، بی‌تکرار.
class _MomentShine extends CustomPainter {
  _MomentShine({required this.p});

  final double p;

  @override
  void paint(Canvas canvas, Size size) {
    if (p <= 0 || p >= 1) return;
    final w = size.width * 0.38;
    final x = -w + (p * (size.width + w * 2));
    final rect = Rect.fromLTWH(x, 0, w, size.height);
    final paint = Paint()
      ..shader = const LinearGradient(colors: [Color(0x00FFFFFF), Color(0x2EFFFFFF), Color(0x00FFFFFF)])
          .createShader(rect);
    canvas.drawRect(rect, paint);
  }

  @override
  bool shouldRepaint(_MomentShine old) => old.p != p;
}

/// ورودِ پله‌ایِ چیپ‌ها — همان `momentChipIn` وب.
///
/// در وب، چیپ‌هایِ لحظهٔ جایزه یکی‌یکی و با تأخیرِ ۰/۰٫۰۷/۰٫۱۴/۰٫۲۱ ثانیه
/// می‌آیند (`.momentRow .momentChip:nth-child(n)`). این پله‌ای بودن بخشِ
/// زیادی از جذابیتِ کارت است: چشم دنبالِ چیپِ بعدی می‌رود و هر کدام جداگانه
/// «ثبت» می‌شود. در اندروید همه با هم ظاهر می‌شدند و کارت ساکن به‌نظر
/// می‌رسید — همان تفاوتی که «تو وب عالیه، تو اندروید زشته» از آن می‌آید.
///
/// تأخیرها بر حسبِ **کسرِ** انیمیشنِ ورودِ کارت (۵۲۰ms) بیان شده‌اند، نه
/// میلی‌ثانیه، تا با هر تغییری در طولِ ورودِ کارت هماهنگ بمانند.
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
  static const double _span = 0.34 / 0.52;

  /// گامِ تأخیر: ۰٫۰۷ ثانیه از ۰٫۵۲ ثانیه.
  static const double _step = 0.07 / 0.52;

  @override
  Widget build(BuildContext context) {
    // وب فقط برای چهار چیپِ اول تأخیر تعریف کرده. از پنجم به بعد همان
    // آخرین پله را می‌گیریم تا چیپی دیرتر از خودِ کارت نیاید و ناگهان
    // تنها در قاب ظاهر نشود.
    final step = index <= 3 ? index : 3;
    final start = (step * _step).clamp(0.0, 1.0);
    final curved = CurvedAnimation(
      parent: animation,
      curve: Interval(
        start,
        (start + _span).clamp(0.0, 1.0),
        // همان `cubic-bezier(.2,1.3,.4,1)` وب: کمی از مقصد رد می‌شود و
        // برمی‌گردد.
        curve: const Cubic(0.2, 1.3, 0.4, 1),
      ),
    );
    return FadeTransition(
      opacity: curved,
      child: SlideTransition(
        position:
            Tween<Offset>(begin: const Offset(0, 0.35), end: Offset.zero)
                .animate(curved),
        child: child,
      ),
    );
  }
}
