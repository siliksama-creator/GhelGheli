// گردونهٔ شانس — نسخهٔ اندروید.
//
// ─────────────────────────────────────────────────────────────────────────
// چرا CustomPainter و نه SVG
//
// نسخهٔ وب یک فایل SVG می‌کشد، ولی فلاتر بدون پکیج flutter_svg نمی‌تواند
// SVG بخواند. اضافه کردن یک پکیج ۴۰۰ کیلوبایتی فقط برای یک صفحه، آن هم
// وقتی همین شکل با چند خط Canvas قابل کشیدن است، معامله‌ای است که نمی‌ارزد
// — به‌خصوص بعد از ممیزی حافظه که نشان داد هر مگابایت اضافه چقدر گران است.
//
// مزیت دوم: چون خودمان می‌کشیم، برچسب‌ها از همان جوایزی می‌آیند که سرور
// فرستاده. اگر مدیر فردا جایزه‌ای را عوض کند، اپ بدون انتشار نسخهٔ جدید
// درست نشان می‌دهد — با تصویر ثابت این ممکن نبود.
//
// ─────────────────────────────────────────────────────────────────────────
// چرا انیمیشن بعد از جواب سرور شروع می‌شود
//
// اول POST، بعد چرخش. جایزه را همیشه سرور انتخاب می‌کند و گردونه فقط روی
// همان می‌ایستد. اگر برعکس بود، هر کسی با یک پروکسی می‌توانست نتیجه را
// عوض کند.
import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../api_client.dart';
import '../../core/app_config.dart';
import '../../utils/fa_date.dart';
import '../../theme/tokens.dart';
import 'games/game_audio.dart';

/// یک برش، همان‌طور که سرور توصیفش می‌کند.
class WheelPrize {
  const WheelPrize({
    required this.label,
    required this.kind,
    required this.value,
    required this.color,
    required this.sliceOrder,
    this.percent = 0,
    this.grantId,
  });

  final String label;
  final String kind; // 'points' یا 'cash' یا 'card_box' …
  final int value;
  final Color color;
  final int sliceOrder;
  /// شانس این برش به درصد، از سرور. صفر یعنی سرور قدیمی است و جدول نشان داده نمی‌شود.
  final double percent;
  final String? grantId;

  static WheelPrize fromJson(Map<String, dynamic> j) {
    // رنگ از سرور می‌آید تا دو کلاینت هرگز اختلاف نداشته باشند.
    // پارس ناموفق نباید صفحه را خالی کند؛ سبز پیش‌فرض بدتر از کرش نیست.
    Color parse(Object? v) {
      final s = (v ?? '').toString().replaceFirst('#', '');
      final n = int.tryParse(s, radix: 16);
      if (n == null) return const Color(0xFF84CC16);
      return Color(s.length <= 6 ? (0xFF000000 | n) : n);
    }

    int asInt(Object? v) =>
        v is int ? v : (v is num ? v.toInt() : int.tryParse('$v') ?? 0);

    return WheelPrize(
      label: (j['label'] ?? '').toString(),
      kind: (j['kind'] ?? 'points').toString(),
      value: asInt(j['value']),
      color: parse(j['color']),
      sliceOrder: asInt(j['sliceOrder']),
      percent: j['percent'] is num ? (j['percent'] as num).toDouble() : 0,
      grantId: j['grantId'] == null ? null : '${j['grantId']}',
    );
  }
}

class WheelPage extends StatefulWidget {
  const WheelPage({
    super.key,
    required this.api,
    this.onChanged,
    this.onSpinsChanged,
  });

  final ApiClient api;

  /// تعداد چرخش باقی‌مانده و پرچم نامحدود، برای نشانِ کنار آیکون نوار بالا.
  final void Function(int spins, bool unlimited)? onSpinsChanged;

  /// وقتی جایزه‌ای داده شد صدا زده می‌شود تا امتیاز/موجودی هدر تازه شود.
  /// بدون این، کاربر جایزه را می‌بیند ولی عدد بالای صفحه هنوز قدیمی است.
  final VoidCallback? onChanged;

  @override
  State<WheelPage> createState() => _WheelPageState();
}

class _WheelPageState extends State<WheelPage>
    with TickerProviderStateMixin {
  // دو کنترلر مستقل (_spinCtl و _glowCtl). SingleTicker فقط یکی را
  // تحمل می‌کند و در دیباگ assert می‌ترکاند — صفحهٔ گردونه وسط چرخش
  // قرمز می‌شد.
  // مالک: «گردونه یکم بیشتر بچرخه برای هیجان بیشتر».
  //
  // ۵.۶ ثانیه و ۹ دور کامل. بیشتر از این، انتظار حس می‌شود نه هیجان —
  // مخصوصاً برای کاربری که روزی چند بار می‌چرخاند.
  //
  // این دو پیش‌فرض‌اند نه ثابت: سرور در پاسخِ /api/wheel مقدارِ
  // spinDurationMs و spinRotations را می‌فرستد (قابل تنظیم از پنل ادمین)
  // و کلاینت همان را اجرا می‌کند — بدون آپدیت.
  Duration _spinDuration = const Duration(milliseconds: 5600);
  double _fullSpins = 9.0;

  late final AnimationController _spinCtl = AnimationController(
    vsync: this,
    duration: _spinDuration,
  );

  /// نبضِ درخشش روی برشِ برنده، بعد از توقف گردونه.
  ///
  /// سه بار نبض می‌زند و بس. یک درخشش دائمی، پس‌زمینهٔ بصری می‌شود و
  /// معنایش را از دست می‌دهد؛ سه نبض دقیقاً همان‌قدر هست که چشم بگیردش.
  late final AnimationController _glowCtl = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 520),
  );

  int _winnerIndex = -1;

  List<WheelPrize> _prizes = const [];
  // چرخش‌های اخیر — همان بخشِ «تاریخچه» که وب نشان می‌دهد؛ کاربر باید
  // ببیند چرخشش ثبت شده حتی اگر اعلانِ نتیجه را از دست داده باشد.
  List<Map<String, dynamic>> _history = const [];
  int _spinsLeft = 0;
  int _bonusSpins = 0;
  int _dailyQuota = 1;
  bool _unlimited = false;
  int _invitesPerDaily = 10;
  int _maxInvitesDaily = 50;
  int _spinsPerReferral = 3;
  // «هر آستانه = چند چرخشِ روزانه» — از `live_rules` تا جملهٔ راهنما با
  // عددِ واقعیِ گردونه یکی بماند (قبلاً «۱» داخلِ متن سفت نوشته شده بود).
  int _spinThreshold = 1;
  int _resetInMs = 0;
  bool _loading = true;
  bool _spinning = false;
  String? _error;
  WheelPrize? _result;

  // چرخش تجمعی است و هرگز ریست نمی‌شود: اگر صفر شود، گردونه بین دو چرخش
  // به عقب می‌پرد.
  double _fromTurns = 0;
  double _toTurns = 0;

  final math.Random _rnd = math.Random();

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _spinCtl.dispose();
    _glowCtl.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final results = await Future.wait<dynamic>([
        widget.api.get('/api/wheel'),
        // تاریخچه جدا می‌آید و شکستِ آن نباید گردونه را از کار بیندازد.
        widget.api.get('/api/wheel/history').catchError((_) => <String, dynamic>{}),
      ]);
      if (!mounted) return;
      final map = Map<String, dynamic>.from(results[0] as Map);
      final hist = results[1] is Map ? results[1] as Map : const {};
      setState(() {
        _history = (hist['spins'] as List? ?? const [])
            .whereType<Map>()
            .map((e) => Map<String, dynamic>.from(e))
            .toList();
        _prizes = (map['prizes'] as List? ?? [])
            .whereType<Map>()
            .map((e) => WheelPrize.fromJson(Map<String, dynamic>.from(e)))
            .toList()
          ..sort((a, b) => a.sliceOrder.compareTo(b.sliceOrder));
        _spinsLeft = (map['spinsLeft'] as num?)?.toInt() ?? 0;
        _bonusSpins = (map['bonusSpins'] as num?)?.toInt() ?? 0;
        _dailyQuota = (map['dailyQuota'] as num?)?.toInt() ?? 1;
        _unlimited = map['unlimited'] == true;
        _resetInMs = (map['resetInMs'] as num?)?.toInt() ?? 0;
        _spinDuration = Duration(
            milliseconds: (map['spinDurationMs'] as num?)?.toInt() ?? 5600);
        _fullSpins = (map['spinRotations'] as num?)?.toDouble() ?? 9.0;
        _loading = false;
        _error = null;
      });
      // اعداد راهنمای دعوت از /api/config — نه ثابت ۱۰/۵۰/۳ داخل APK.
      try {
        final cfg = await widget.api.get('/api/config');
        // این صفحه هم `/api/config` را خودش می‌گیرد؛ همان بدنه را به منبع
        // می‌دهیم تا «منبعِ یکتا» شعارِ معماری نماند: بیِ این خط، متنِ
        // زندهٔ این صفحه تا باری که home_shell config را می‌گیرد (یا تا
        // بازگشت از پس‌زمینه) کهنه می‌ماند — یعنی کاربر عددِ امروز را در
        // جدول می‌بیند و جملهٔ دیروز را در توضیح. برای تستِ «۲۰ تغییرِ
        // پنل» بدترین حالت همین است: پنل کار می‌کند ولی نصفِ صفحه نه.
        if (mounted && cfg is Map) AppConfig.instance.apply(cfg);
        if (mounted && cfg is Map && cfg['referral'] is Map) {
          final r = Map<String, dynamic>.from(cfg['referral'] as Map);
          setState(() {
            _invitesPerDaily = (r['invitesPerDailySpin'] as num?)?.toInt() ?? _invitesPerDaily;
            _maxInvitesDaily = (r['maxInvitesForDaily'] as num?)?.toInt() ?? _maxInvitesDaily;
            _spinsPerReferral = (r['spinsPerReferral'] as num?)?.toInt() ?? _spinsPerReferral;
            _spinThreshold =
                (r['spinsPerDailyThreshold'] as num?)?.toInt() ?? _spinThreshold;
          });
        }
      } catch (_) {}
      widget.onSpinsChanged?.call(_spinsLeft, _unlimited);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = 'گردونه در دسترس نیست';
      });
    }
  }

  Future<void> _spin() async {
    if (_spinning || _spinsLeft <= 0 || _prizes.isEmpty) return;
    setState(() {
      _spinning = true;
      _result = null;
    });

    try {
      final res = await widget.api.post('/api/wheel/spin', const {});
      if (!mounted) return;
      // castهای دفاعی: جایزه واریز *شده* است، پس یک پاسخ عجیب نباید با
      // کرش تمام شود — کاربر فکر می‌کند جایزه‌اش را نگرفته.
      final map = res is Map
          ? Map<String, dynamic>.from(res)
          : <String, dynamic>{};
      if (map['prize'] is! Map) {
        // چرخش ثبت شده ولی نمی‌دانیم چه چیزی؛ فقط تازه‌سازی کن.
        if (mounted) setState(() => _spinning = false);
        await _load();
        return;
      }
      final prize =
          WheelPrize.fromJson(Map<String, dynamic>.from(map['prize'] as Map));

      final n = _prizes.length;
      var idx = _prizes.indexWhere((p) => p.sliceOrder == prize.sliceOrder);
      // اگر سرور برشی فرستاد که در فهرست محلی نیست (کاتالوگ عوض شده و اپ
      // هنوز نسخهٔ قدیمی را دارد)، به‌جای کرش روی برش اول می‌ایستیم و بعد
      // فهرست را تازه می‌کنیم — جایزه به‌هرحال داده شده.
      if (idx < 0) idx = 0;

      final seg = 1.0 / n;
      // مرکز برش idx باید بالای گردونه (زیر سوزن) بایستد.
      final target = 1.0 - (idx + 0.5) * seg;
      // کمی پراکندگی داخل خود برش تا چرخش‌ها یک‌شکل نباشند. ۷۰٪ عرض برش،
      // پس هیچ‌وقت از مرز رد نمی‌شود و سوزن روی برش اشتباه نمی‌ایستد.
      final jitter = (_rnd.nextDouble() - 0.5) * seg * 0.7;

      _fromTurns = _toTurns;
      // به جلو تا اولین نقطه‌ای که هم چند دور کامل خورده و هم روی هدف است.
      final base = _fromTurns + _fullSpins;
      final frac = (target + jitter) - (base % 1.0);
      _toTurns = base + (frac < 0 ? frac + 1.0 : frac);

      GameAudio.instance.play(Sfx.tick, volume: 0.5);
      // درخشش قبلی خاموش شود تا وسط چرخشِ تازه روی برش قدیمی نماند.
      _glowCtl.stop();
      _glowCtl.value = 0;
      _winnerIndex = -1;
      // RESPECT THE USER'S SETTING. کسی که از سیستم‌عامل خواسته انیمیشن
      // کمتر باشد، نتیجه را بلافاصله می‌بیند — بازی از دست نمی‌رود، فقط
      // تعلیقش حذف می‌شود. WCAG 2.3.3، و نسخهٔ وب هم همین کار را با
      // prefers-reduced-motion می‌کند.
      final reduce = mounted &&
          (MediaQuery.maybeDisableAnimationsOf(context) ?? false);
      if (reduce) {
        _spinCtl.value = 1;
        // مدتِ تازه از سرور: ادمین می‌تواند طولِ چرخش را عوض کند و
        // همان لحظه روی این کنترلر بنشیند.
        _spinCtl.duration = _spinDuration;
      } else {
        // `forward` یک Future برمی‌گرداند که وقتی انیمیشن تمام شود
        // کامل می‌شود. عمداً منتظرش نمی‌مانیم و به‌جایش روی
        // `_spinDuration` تکیه می‌کنیم: اگر ویجت وسطِ چرخش dispose شود،
        // آن Future **هرگز** کامل نمی‌شود و این تابع برای همیشه معلق
        // می‌ماند. تأخیرِ زمانی چنین وابستگی‌ای ندارد و بعدش هم
        // `mounted` بررسی می‌شود.
        unawaited(_spinCtl.forward(from: 0));
        await Future<void>.delayed(_spinDuration);
      }
      if (!mounted) return;

      setState(() {
        _result = prize;
        _spinsLeft = (map['spinsLeft'] as num?)?.toInt() ?? 0;
        _bonusSpins = (map['bonusSpins'] as num?)?.toInt() ?? 0;
        _dailyQuota = (map['dailyQuota'] as num?)?.toInt() ?? _dailyQuota;
        _unlimited = map['unlimited'] == true;
        _resetInMs = (map['resetInMs'] as num?)?.toInt() ?? _resetInMs;
        _spinning = false;
      });
      widget.onSpinsChanged?.call(_spinsLeft, _unlimited);
      GameAudio.instance.play(prize.kind == 'cash' ? Sfx.win : Sfx.matchFound);
      // لرزش یک جلوهٔ جانبی است: روی دستگاهی بدون موتور لرزش یا با
      // مجوزِ رد شده صرفاً کاری نمی‌کند. منتظر ماندنش هیچ چیزی به کاربر
      // نمی‌دهد و فقط نمایش نتیجه را عقب می‌اندازد.
      unawaited(HapticFeedback.heavyImpact());
      // سه نبضِ درخشش روی برشی که سوزن رویش ایستاده.
      _winnerIndex = idx;
      if (reduce) {
        // درخشش می‌ماند (اطلاعات است، نه تزئین) ولی نبض نمی‌زند.
        _glowCtl.value = 1;
      } else {
        // نبضِ درخشش عمداً رها می‌شود: این یک جلوهٔ تزئینی است که باید
        // در پس‌زمینه بزند در حالی که کاربر نتیجه را می‌خواند. منتظر
        // ماندنش یعنی تابع تا پایان شش نبض بلوکه شود، و اگر کاربر
        // صفحه را ببندد آن Future هرگز کامل نمی‌شود.
        unawaited(_glowCtl.repeat(reverse: true, count: 6));
      }
      widget.onChanged?.call();
    } catch (e) {
      if (!mounted) return;
      setState(() => _spinning = false);
      // apiError پیام فارسی سرور را بیرون می‌کشد؛ مثلاً «چرخش امروزت
      // تمام شده» که خیلی مفیدتر از یک خطای عمومی است.
      final msg = apiError(e);
      ScaffoldMessenger.maybeOf(context)?.showSnackBar(
        SnackBar(content: Text(msg), behavior: SnackBarBehavior.floating),
      );
      // ═══════════════════════════════════════════════════════════════
      // چرا اینجا await و چرا خطایش بلعیده می‌شود
      // ═══════════════════════════════════════════════════════════════
      //
      // این فراخوانی **داخل یک catch** است: بعد از یک چرخشِ ناموفق،
      // تعداد چرخش‌های باقی‌مانده را از سرور تازه می‌کنیم چون ممکن است
      // سرور چرخش را مصرف کرده باشد ولی پاسخ در راه گم شده باشد.
      //
      // قبلاً بدون await رها بود. اگر خودِ این تازه‌سازی هم شکست
      // می‌خورد (که در همان قطعیِ شبکه‌ای که چرخش را شکست، محتمل است)
      // یک استثنای مدیریت‌نشده به zone می‌رفت و در حالت دیباگ صفحهٔ
      // قرمز می‌داد — یعنی یک خطای شبکهٔ ساده به کرشِ ظاهری تبدیل
      // می‌شد.
      //
      // خطا اینجا عمداً بلعیده می‌شود: کاربر همین الان پیام خطای اصلی
      // را گرفته و یک پیام دومِ «تازه‌سازی هم نشد» فقط سردرگمی است.
      // خودِ `_load` وضعیت خطا را در UI منعکس می‌کند.
      try {
        await _load();
      } catch (_) {
        // بی‌صدا: پیام اصلی همین الان نمایش داده شد.
      }
    }
  }

  /// شمارش معکوس فارسی. رو به بالا گرد می‌شود — «۱ ساعت» وقتی ۹۰ دقیقه
  /// مانده وعده‌ای است که زیرش می‌زنیم.
  String _countdown(int ms) {
    final mins = ms ~/ 60000;
    if (mins < 1) return 'کمتر از یک دقیقه';
    if (mins < 60) return '${faNum(mins)} دقیقه';
    return '${faNum((mins / 60).ceil())} ساعت';
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_error != null && _prizes.isEmpty) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(_error!, style: theme.textTheme.bodyMedium),
            Gaps.vSm,
            TextButton(onPressed: _load, child: const Text('تلاش دوباره')),
          ],
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.all(Gaps.md),
        children: [
          Text(' گردونهٔ شانس',
              textAlign: TextAlign.center,
              style: theme.textTheme.titleLarge
                  ?.copyWith(fontWeight: FontWeight.w900)),
          Gaps.vMd,
          Center(
            child: LayoutBuilder(builder: (context, c) {
              // مربع، محدود به عرض موجود و سقف ۳۶۰ — روی تبلت نباید کل
              // صفحه را بگیرد.
              final side = math.min(c.maxWidth, 360.0);
              return SizedBox(
                width: side,
                height: side + 18, // جا برای سوزن بالای دیسک
                child: Stack(
                  alignment: Alignment.topCenter,
                  children: [
                    Positioned(
                      top: 18,
                      child: SizedBox(
                        width: side,
                        height: side,
                        child: AnimatedBuilder(
                          animation: _spinCtl,
                          builder: (context, child) {
                            // easeOutQuint به‌جای Quart: انتهای نرم‌تر،
                            // یعنی گردونه در ثانیهٔ آخر آرام‌آرام روی
                            // جایزه می‌نشیند به‌جای اینکه ناگهان بایستد.
                            // این همان «هیجان» است که مالک خواست.
                            final t = Curves.easeOutQuint
                                .transform(_spinCtl.value);
                            final turns =
                                _fromTurns + (_toTurns - _fromTurns) * t;
                            return Transform.rotate(
                              angle: turns * 2 * math.pi,
                              child: child,
                            );
                          },
                          // دیسک یک بار ساخته می‌شود و فقط چرخانده می‌شود:
                          // بازسازی‌اش در هر فریم یعنی محاسبهٔ دوبارهٔ ۹ مسیر
                          // و ۹ چیدمان متن، ۶۰ بار در ثانیه.
                          // AnimatedBuilder روی نبضِ درخشش، *داخل* عنصر
                          // چرخان: چرخش و درخشش دو انیمیشن مستقل‌اند و
                          // ادغامشان یعنی دیسک در هر فریمِ چرخش هم دوباره
                          // رسم شود — ۹ مسیر و ۱۲ چیدمان متن، ۶۰ بار در
                          // ثانیه، برای چیزی که فقط می‌چرخد.
                          child: RepaintBoundary(
                            child: AnimatedBuilder(
                              animation: _glowCtl,
                              builder: (context, _) => CustomPaint(
                                painter: _WheelPainter(
                                  _prizes,
                                  winnerIndex: _winnerIndex,
                                  glow: Curves.easeInOut
                                      .transform(_glowCtl.value),
                                ),
                                size: Size.square(side),
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),
                    // سر شخصیت نمی‌چرخد: بیرون از Transform است.
                    Positioned(
                      top: 18 + side * 0.5 - side * 0.135,
                      child: Image.asset(
                        'assets/wheel/hub_head.webp',
                        width: side * 0.27,
                        height: side * 0.27,
                        // منبع ۳۲۰px است و اینجا حدود ۹۷ لاجیکال پیکسل
                        // کشیده می‌شود؛ ۲۹۰ برای ۳x کافی است و از دیکد
                        // کامل ارزان‌تر.
                        cacheWidth: 290,
                        errorBuilder: (_, __, ___) => const SizedBox.shrink(),
                      ),
                    ),
                    // سوزن، ثابت بالای گردونه.
                    const Positioned(top: 0, child: _Pointer()),
                  ],
                ),
              );
            }),
          ),
          Gaps.vLg,
          Center(
            child: _AnimeSpinButton(
              spinning: _spinning,
              spinsLeft: _spinsLeft,
              unlimited: _unlimited,
              onPressed: (_spinsLeft > 0 && !_spinning) ? _spin : null,
            ),
          ),
          if (_spinsLeft <= 0) ...[
            Gaps.vXs,
            Center(
              child: Container(
                padding: const EdgeInsets.symmetric(
                    horizontal: Gaps.md, vertical: Gaps.xs),
                decoration: BoxDecoration(
                  color: const Color(0xFF84CC16).withValues(alpha: 0.12),
                  borderRadius: Corners.rPill,
                ),
                child: Text(
                  'شانس بعدی تا ${_countdown(_resetInMs)} دیگر',
                  style: theme.textTheme.labelLarge?.copyWith(
                    color: const Color(0xFFA3E635),
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
            ),
          ],
          if (_prizes.isNotEmpty && _prizes.any((p) => p.percent > 0)) ...[
            Gaps.vMd,
            _OddsCard(prizes: _prizes),
          ],
          // ⚠️ منبعِ چرخشِ جایزه یکی نیست: `users.bonus_spins` هم از
          // دعوت دوستان پر می‌شود و هم از پله‌های نوع `spins` در گذر
          // نبرد. متنِ قبلی همیشه «از دعوت دوستان» می‌گفت و روی حسابی
          // بدون هیچ دعوتی، ادعای نادرست نشان می‌داد.
          if (_bonusSpins > 0) ...[
            Gaps.vXs,
            Center(
              child: Text(
                '${faNum(_bonusSpins)} چرخش جایزه داری',
                style: theme.textTheme.bodySmall?.copyWith(
                  color: theme.colorScheme.onSurface.withValues(alpha: 0.65),
                ),
              ),
            ),
          ],
          if (_result != null) ...[
            Gaps.vLg,
            // ValueKey روی برچسب: اگر دو چرخش پیاپی یک جایزه بدهند، کلید
            // عوض نمی‌شود و didUpdateWidget انیمیشن را دوباره اجرا می‌کند.
            _ResultCard(
              key: const ValueKey('wheelResult'),
              prize: _result!,
              api: widget.api,
              onOpened: widget.onChanged,
            ),
          ],
          if (_history.isNotEmpty) ...[
            Gaps.vMd,
            _HistoryCard(spins: _history),
          ],
          Gaps.vLg,
          // قوانین — مالک خواست همه‌چیز برای کاربر توضیح داده شود. بدون
          // این، کاربر نمی‌داند چرا امروز ۱ چرخش دارد و دوستش ۳ تا، و فکر
          // می‌کند سیستم خراب است.
          _RulesCard(
            dailyQuota: _dailyQuota,
            unlimited: _unlimited,
            invitesPerDaily: _invitesPerDaily,
            maxInvitesDaily: _maxInvitesDaily,
            spinsPerReferral: _spinsPerReferral,
            spinThreshold: _spinThreshold,
          ),
          Gaps.vLg,
        ],
      ),
    );
  }
}

/// سوزن — مثلث رو به پایین که به برش برنده اشاره می‌کند.
class _Pointer extends StatelessWidget {
  const _Pointer();

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 34,
      height: 44,
      child: CustomPaint(painter: _PointerPainter()),
    );
  }
}

class _PointerPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width, h = size.height;
    final path = Path()
      ..moveTo(w / 2, h)
      ..lineTo(w * 0.12, h * 0.34)
      ..arcToPoint(Offset(w * 0.88, h * 0.34),
          radius: Radius.circular(w * 0.44), clockwise: true)
      ..close();

    canvas.drawPath(
      path,
      Paint()
        ..shader = const LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [Color(0xFFFDE68A), Color(0xFFF59E0B), Color(0xFFB45309)],
        ).createShader(Offset.zero & size),
    );
    canvas.drawPath(
      path,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2.5
        ..strokeJoin = StrokeJoin.round
        ..color = const Color(0xFF7C2D12),
    );
    canvas.drawCircle(Offset(w / 2, h * 0.34), w * 0.16,
        Paint()..color = const Color(0xFFFFFBEB));
    canvas.drawCircle(
      Offset(w / 2, h * 0.34),
      w * 0.16,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2.5
        ..color = const Color(0xFF7C2D12),
    );
  }

  @override
  bool shouldRepaint(covariant _PointerPainter oldDelegate) => false;
}

/// خود گردونه.
///
/// برش‌ها از نظر بصری مساوی‌اند و احتمال واقعی در وزن‌های سرور است. این
/// استاندارد صنعت است و فریب نیست: سوزن واقعاً روی همان برشی می‌ایستد که
/// سرور انتخاب کرده. اگر برش «۱۰۰ امتیاز» با احتمال ۷۴٪ سه‌چهارم دایره را
/// می‌گرفت، دیگر گردونه به‌نظر نمی‌رسید.
class _WheelPainter extends CustomPainter {
  _WheelPainter(this.prizes, {this.winnerIndex = -1, this.glow = 0});

  final List<WheelPrize> prizes;

  /// برشِ برنده، برای درخشش بعد از توقف. ‎-1 یعنی هیچ.
  final int winnerIndex;

  /// شدت درخشش، ۰ تا ۱ — از یک انیمیشن نبض‌دار می‌آید.
  final double glow;

  @override
  void paint(Canvas canvas, Size size) {
    if (prizes.isEmpty) return;
    final c = Offset(size.width / 2, size.height / 2);
    final rOuter = size.width * 0.468;
    final rRim = size.width * 0.492;
    final rInner = size.width * 0.150; // سوراخ مرکزی برای سر شخصیت
    final seg = 2 * math.pi / prizes.length;

    // برش‌ها به‌صورت قطاعِ حلقه: از مرکز شروع نمی‌شوند تا حفرهٔ وسط شفاف
    // بماند و سر شخصیت داخل یک لکهٔ تیره گم نشود.
    for (var i = 0; i < prizes.length; i++) {
      final start = -math.pi / 2 + i * seg;
      final path = Path()
        ..arcTo(Rect.fromCircle(center: c, radius: rOuter), start, seg, true)
        ..arcTo(Rect.fromCircle(center: c, radius: rInner), start + seg, -seg,
            false)
        ..close();

      final base = prizes[i].color;
      canvas.drawPath(
        path,
        Paint()
          ..shader = RadialGradient(
            colors: [base, _darken(base, 0.42)],
            stops: const [0.30, 1.0],
          ).createShader(Rect.fromCircle(center: c, radius: rOuter)),
      );
      canvas.drawPath(
        path,
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = 1.6
          ..color = const Color(0xFF0B1220),
      );

      // درخشش روی برشِ برنده.
      //
      // مهم‌ترین بازخورد بصری کل صفحه: بدون آن، کاربر باید سوزن را با متنِ
      // کارت نتیجه تطبیق بدهد تا مطمئن شود گردونه واقعاً همان‌جا ایستاده.
      // با آن، پاسخ در نگاه اول معلوم است — و همین «قابل اعتماد بودن»
      // است که یک گردونهٔ خوب را از یک انیمیشن تصادفی جدا می‌کند.
      if (i == winnerIndex && glow > 0) {
        canvas.drawPath(
          path,
          Paint()
            ..color = Colors.white.withValues(alpha: 0.30 * glow)
            ..blendMode = BlendMode.plus,
        );
        canvas.drawPath(
          path,
          Paint()
            ..style = PaintingStyle.stroke
            ..strokeWidth = 3.5
            ..color = Colors.white.withValues(alpha: 0.85 * glow)
            ..maskFilter = MaskFilter.blur(BlurStyle.normal, 4 * glow),
        );
      }
    }

    // حلقهٔ طلایی بیرونی
    canvas.drawCircle(
      c,
      (rOuter + rRim) / 2,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = rRim - rOuter
        ..shader = const LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [
            Color(0xFFFDE68A), Color(0xFFF59E0B),
            Color(0xFFB45309), Color(0xFFFDE68A),
          ],
        ).createShader(Rect.fromCircle(center: c, radius: rRim)),
    );

    // لامپ‌های دور حلقه
    final bulb = Paint()..color = const Color(0xFFFFFBEB);
    final bulbEdge = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.2
      ..color = const Color(0xFF92400E);
    final rBulb = (rOuter + rRim) / 2;
    final bulbCount = prizes.length * 2;
    for (var i = 0; i < bulbCount; i++) {
      final a = -math.pi / 2 + (i + 0.5) * (2 * math.pi / bulbCount);
      final p = c + Offset(math.cos(a), math.sin(a)) * rBulb;
      canvas.drawCircle(p, size.width * 0.007, bulb);
      canvas.drawCircle(p, size.width * 0.007, bulbEdge);
    }

    // برچسب‌ها، در دو خط، چرخیده در امتداد شعاع.
    for (var i = 0; i < prizes.length; i++) {
      final mid = -math.pi / 2 + (i + 0.5) * seg;
      final pos = c + Offset(math.cos(mid), math.sin(mid)) * (size.width * 0.34);

      // در نیمهٔ چپ متن برعکس می‌شود تا هیچ برچسبی وارونه خوانده نشود.
      var rot = mid + math.pi / 2;
      final deg = (rot * 180 / math.pi) % 360;
      if (deg > 90 && deg < 270) rot += math.pi;

      canvas.save();
      canvas.translate(pos.dx, pos.dy);
      canvas.rotate(rot);

      final parts = _split(prizes[i]);

      // اندازهٔ فونت با تعداد برش‌ها و طول عدد تنظیم می‌شود.
      //
      // با ۱۲ برش، عرضِ در دسترسِ هر برش حدود دو سوم حالت ۹ برشی است، و
      // «۱۰۰٬۰۰۰» دو برابر «۱۰۰» جا می‌گیرد. بدون این تنظیم، برچسب‌های
      // بلند از مرز برش بیرون می‌زنند و روی هم می‌افتند — همان چیزی که
      // در رندر اول نسخهٔ وب اتفاق افتاد.
      final fit = (9 / prizes.length).clamp(0.62, 1.0);
      final digits = parts.$1.replaceAll(RegExp(r'[^\u06F0-\u06F9]'), '').length;
      final lenScale = digits <= 3 ? 1.0 : (digits <= 5 ? 0.84 : 0.70);
      final vSize = size.width * 0.058 * fit * lenScale;
      final uSize = size.width * 0.030 * fit;

      _text(canvas, parts.$1, vSize, FontWeight.w900,
          Offset(0, -uSize * 0.62));
      _text(canvas, parts.$2, uSize, FontWeight.w700,
          Offset(0, vSize * 0.62), opacity: 0.95);

      canvas.restore();
    }
  }

  /// «۵۰٬۰۰۰ تومان» -> ('۵۰٬۰۰۰', 'تومان'). دو خطی بودن لازم است: یک‌خطی
  /// از عرض برش بیرون می‌زند و روی برش کناری می‌افتد.
  (String, String) _split(WheelPrize p) {
    final i = p.label.lastIndexOf(' ');
    if (i <= 0) return (p.label, '');
    return (p.label.substring(0, i), p.label.substring(i + 1));
  }

  /// برچسب‌های shape‌شده، کش‌شده بین فریم‌ها.
  ///
  /// TextPainter.layout() یکی از گران‌ترین کارهایی است که می‌شود داخل
  /// paint() انجام داد، و این پینتر ۲۴ برچسب دارد (عدد + واحد، برای ۱۲
  /// برش). هنگام نبضِ درخشش، paint در هر فریم صدا زده می‌شود — یعنی
  /// بدون کش، ۲۴ چیدمان متن در هر فریم برای متنی که هرگز عوض نمی‌شود.
  ///
  /// کلید شامل اندازه و وزن است، پس گردونه در دو اندازهٔ مختلف (موبایل و
  /// تبلت) برچسب‌های هم را خراب نمی‌کند. کش static است چون بین
  /// نمونه‌های پینتر — که در هر فریم دوباره ساخته می‌شوند — باید بماند.
  static final Map<String, TextPainter> _labelCache = {};

  void _text(Canvas canvas, String s, double size, FontWeight w, Offset at,
      {double opacity = 1}) {
    if (s.isEmpty) return;
    final key = '$s|${size.toStringAsFixed(1)}|${w.value}|'
        '${opacity.toStringAsFixed(2)}';
    final cached = _labelCache[key];
    if (cached != null) {
      cached.paint(canvas, at + Offset(-cached.width / 2, -cached.height / 2));
      return;
    }
    final tp = TextPainter(
      text: TextSpan(
        text: s,
        style: TextStyle(
          color: Colors.white.withValues(alpha: opacity),
          fontSize: size,
          fontWeight: w,
          fontFamily: 'Vazirmatn',
          // ارتفاع خط فشرده: پیش‌فرض وزیرمتن برای متن پاراگرافی تنظیم شده
          // و دو خط برچسب را بی‌دلیل از هم دور می‌کند.
          height: 1.0,
          // دو سایه: یکی تیره و نزدیک برای خوانایی روی رنگ روشن، یکی
          // پخش‌تر برای جدا کردن متن از پس‌زمینهٔ شلوغ. با یک سایه، متن
          // روی برش زرد کم‌رنگ می‌شد.
          shadows: const [
            Shadow(color: Color(0xCC000000), blurRadius: 2, offset: Offset(0, 1)),
            Shadow(color: Color(0x66000000), blurRadius: 6),
          ],
        ),
      ),
      textDirection: TextDirection.rtl,
      textAlign: TextAlign.center,
      // متن هرگز نباید بشکند: یک برچسب دوخطیِ ناخواسته از برش بیرون می‌زند.
      maxLines: 1,
    )..layout();
    // کران بالا: اندازهٔ گردونه با عرض صفحه عوض می‌شود و بدون سقف، یک
    // چرخش صفحه در حین بازی می‌تواند کش را بی‌نهایت بزرگ کند.
    if (_labelCache.length > 96) _labelCache.clear();
    _labelCache[key] = tp;
    tp.paint(canvas, at + Offset(-tp.width / 2, -tp.height / 2));
  }

  Color _darken(Color c, double amount) {
    final h = HSLColor.fromColor(c);
    return h.withLightness((h.lightness * (1 - amount)).clamp(0.0, 1.0))
        .toColor();
  }

  @override
  bool shouldRepaint(covariant _WheelPainter old) =>
      old.prizes != prizes ||
      old.winnerIndex != winnerIndex ||
      old.glow != glow;
}

/// کارت نتیجه، با ورودِ فنری.
///
/// چرا انیمیشن دارد: لحظهٔ رسیدن جایزه تنها بازخوردی است که کاربر بعد از
/// ۵.۶ ثانیه انتظار می‌گیرد. ظاهر شدنِ ناگهانی، آن لحظه را به یک تغییرِ
/// بی‌صدا در چیدمان تبدیل می‌کند.
///
/// StatefulWidget است نه یک AnimatedContainer ساده، چون باید **هر بار**
/// که جایزهٔ تازه‌ای می‌آید دوباره اجرا شود — نه فقط بار اول.
class _ResultCard extends StatefulWidget {
  const _ResultCard({
    super.key,
    required this.prize,
    this.api,
    this.onOpened,
  });

  final WheelPrize prize;
  final ApiClient? api;
  final VoidCallback? onOpened;

  @override
  State<_ResultCard> createState() => _ResultCardState();
}

class _ResultCardState extends State<_ResultCard>
    with SingleTickerProviderStateMixin {
  late final AnimationController _in = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 620),
  )..forward();

  @override
  void didUpdateWidget(covariant _ResultCard old) {
    super.didUpdateWidget(old);
    // جایزهٔ تازه = ورود تازه. بدون این، چرخش دوم کارت را بی‌حرکت
    // به‌روز می‌کرد و حس «برنده شدم» از بین می‌رفت.
    if (old.prize.label != widget.prize.label ||
        old.prize.value != widget.prize.value) {
      _in.forward(from: 0);
    }
  }

  @override
  void dispose() {
    _in.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _in,
      builder: (context, child) {
        // elasticOut یک «تاپ» کوچک می‌دهد؛ easeOut جداگانه برای شفافیت
        // تا کارت در حال بزرگ شدن، محو هم نباشد.
        final scale = Curves.elasticOut.transform(_in.value);
        final fade = Curves.easeOut.transform(
            (_in.value * 2.2).clamp(0.0, 1.0));
        return Opacity(
          opacity: fade,
          child: Transform.scale(scale: 0.6 + 0.4 * scale, child: child),
        );
      },
      child: _buildCard(context),
    );
  }

  Widget _buildCard(BuildContext context) {
    final theme = Theme.of(context);
    final prize = widget.prize;
    final isCash = prize.kind == 'cash';
    final isBox = prize.kind == 'card_box';
    final tint = isCash || isBox
        ? const Color(0xFFFCD34D)
        : const Color(0xFF67E8F9);
    return Container(
      padding: const EdgeInsets.symmetric(
          horizontal: Gaps.lg, vertical: Gaps.md),
      decoration: BoxDecoration(
        color: tint.withValues(alpha: 0.14),
        borderRadius: Corners.rLg,
        border: Border.all(color: tint.withValues(alpha: 0.35)),
        boxShadow: [
          BoxShadow(
            color: tint.withValues(alpha: isCash ? 0.28 : 0.16),
            blurRadius: 28,
            spreadRadius: -6,
          ),
        ],
      ),
      child: Column(
        children: [
          Text(isCash || isBox ? ' برنده شدی!' : ' گرفتی!',
              style: theme.textTheme.titleMedium
                  ?.copyWith(color: tint, fontWeight: FontWeight.w800)),
          Gaps.vXxs,
          Text(prize.label,
              style: theme.textTheme.headlineSmall
                  ?.copyWith(color: tint, fontWeight: FontWeight.w900)),
          if (isBox) ...[
            Gaps.vXxs,
            Text('صندوق به کلکسیونت اضافه شد — همین‌جا بازش کن',
                style: theme.textTheme.bodySmall?.copyWith(color: tint)),
            if (prize.grantId != null && widget.api != null) ...[
              Gaps.vXs,
              FilledButton(
                onPressed: () async {
                  try {
                    final r = await widget.api!
                        .post('/api/grants/${prize.grantId}/open', const {});
                    if (!context.mounted) return;
                    final cards =
                        (r is Map ? r['cards'] as List? : null) ?? const [];
                    final names = cards
                        .whereType<Map>()
                        .map((c) => '${c['name'] ?? 'کارت'}')
                        .join('، ');
                    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
                      content: Text(names.isEmpty
                          ? 'صندوق باز شد'
                          : 'صندوق باز شد: $names'),
                    ));
                    widget.onOpened?.call();
                  } catch (e) {
                    if (context.mounted) {
                      ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(content: Text(apiError(e))));
                    }
                  }
                },
                child: const Text('باز کردن صندوق'),
              ),
            ],
          ],
        ],
      ),
    );
  }
}


String formatWheelChance(double p) {
  if (p <= 0) return '${faNum(0)}٪';
  if (p >= 1) return '${faNum((p * 10).round() / 10)}٪';
  if (p >= 0.01) return '${faNum((p * 100).round() / 100)}٪';
  final n = (100 / p).round();
  return '۱ در ${faNum(n < 1 ? 1 : n)}';
}


/// جدول شانس زنده — همان عددی که پنل ذخیره کرده.
///
/// این جدول قبلاً ساخته ولی **هیچ‌وقت سوار نشده** بود (کلاسِ مرده): تستِ
/// پاریتی «اندروید شانس هر جایزه را از سرور نشان می‌دهد» فقط به‌خاطرِ
/// متنِ همان کلاسِ مرده سبز بود. حالا واقعاً در صفحه نمایش داده می‌شود
/// وقتی سرور درصد بفرستد — هم‌تراز با جدولِ وب.
class _OddsCard extends StatelessWidget {
  const _OddsCard({required this.prizes});
  final List<WheelPrize> prizes;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      padding: const EdgeInsets.all(Gaps.md),
      decoration: BoxDecoration(
        color: theme.colorScheme.onSurface.withValues(alpha: 0.04),
        borderRadius: Corners.rLg,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('شانس هر جایزه',
              style: theme.textTheme.titleSmall?.copyWith(
                fontWeight: FontWeight.w800,
                color: const Color(0xFFA3E635),
              )),
          Gaps.vXs,
          for (final p in prizes)
            Padding(
              padding: const EdgeInsets.only(bottom: 5),
              child: Row(
                children: [
                  Container(
                    width: 10,
                    height: 10,
                    decoration: BoxDecoration(
                      color: p.color,
                      borderRadius: BorderRadius.circular(3),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(p.label, style: theme.textTheme.bodySmall),
                  ),
                  Text(
                    formatWheelChance(p.percent),
                    style: theme.textTheme.bodySmall
                        ?.copyWith(fontWeight: FontWeight.w900),
                  ),
                ],
              ),
            ),
          Text(
            'این عددها از پنل می‌آیند. برش‌ها از نظر اندازه مساوی‌اند؛ '
            'جایزه را سرور با همین شانس‌ها انتخاب می‌کند.',
            style: theme.textTheme.bodySmall?.copyWith(
              color: theme.colorScheme.onSurface.withValues(alpha: 0.62),
              height: 1.55,
            ),
          ),
        ],
      ),
    );
  }
}


/// چرخش‌های اخیر — آینهٔ بخشِ `wheelHistory` وب.
///
/// تا این دور فقط وب تاریخچهٔ ۸ چرخشِ آخر را نشان می‌داد؛ کاربر اندروید
/// بعد از هر چرخش فقط اعلانِ لحظه‌ای را می‌دید. ثبتِ سرور (`wheel_spins`)
/// روی هر دو پلتفرم بود — این‌جا فقط همان داده نمایش داده می‌شود.
class _HistoryCard extends StatelessWidget {
  const _HistoryCard({required this.spins});

  final List<Map<String, dynamic>> spins;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final visible = spins.take(8).toList();
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(Gaps.md),
      decoration: BoxDecoration(
        color: theme.colorScheme.onSurface.withValues(alpha: 0.04),
        borderRadius: Corners.rLg,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('چرخش‌های اخیر',
              style: theme.textTheme.titleSmall?.copyWith(
                fontWeight: FontWeight.w800,
                color: const Color(0xFFA3E635),
              )),
          Gaps.vXs,
          for (final h in visible)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 4),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      '${h['label'] ?? ''}',
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: h['kind'] == 'cash'
                            ? const Color(0xFFFDE68A)
                            : null,
                        fontWeight:
                            h['kind'] == 'cash' ? FontWeight.w800 : null,
                      ),
                    ),
                  ),
                  Text(
                    faDate(h['at']),
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: theme.colorScheme.onSurface.withValues(alpha: 0.55),
                      fontSize: 11,
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}


/// توضیح قوانین گردونه.
class _RulesCard extends StatelessWidget {
  const _RulesCard({
    required this.dailyQuota,
    this.unlimited = false,
    this.invitesPerDaily = 10,
    this.maxInvitesDaily = 50,
    this.spinsPerReferral = 3,
    this.spinThreshold = 1,
  });

  final int dailyQuota;
  final bool unlimited;
  final int invitesPerDaily;
  final int maxInvitesDaily;
  final int spinsPerReferral;
  final int spinThreshold;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final dim = theme.colorScheme.onSurface.withValues(alpha: 0.72);

    Widget row(String text) => Padding(
          padding: const EdgeInsets.only(bottom: Gaps.xs),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('•  ', style: TextStyle(color: dim, height: 1.7)),
              Expanded(
                child: Text(text,
                    style: theme.textTheme.bodySmall
                        ?.copyWith(color: dim, height: 1.7)),
              ),
            ],
          ),
        );

    return Container(
      padding: const EdgeInsets.all(Gaps.md),
      decoration: BoxDecoration(
        color: theme.colorScheme.onSurface.withValues(alpha: 0.04),
        borderRadius: Corners.rLg,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('گردونه چطور کار می‌کند؟',
              style: theme.textTheme.titleSmall?.copyWith(
                fontWeight: FontWeight.w800,
                color: const Color(0xFFA3E635),
              )),
          Gaps.vXs,
          if (unlimited)
            row('این حساب چرخش نامحدود دارد (حالت تست).')
          else
            row('هر روز ${faNum(dailyQuota)} چرخش رایگان داری'
                '${dailyQuota > 1 ? ' (به‌خاطر دوستانی که دعوت کردی)' : ''}.'),
          row('چرخاندن گردونه هیچ هزینه‌ای ندارد و هیچ‌وقت نخواهد داشت.'),
          // همان `referral.dailySpinRule` که وب و صفحهٔ دعوت می‌خوانند —
          // سه جا، یک جمله. قبلاً این‌جا «به ازای هر …» بود و در صفحهٔ دعوت
          // «هر … = ۱ چرخش»؛ یعنی یک ویرایشِ ادمین فقط یکی از دو صفحه را
          // عوض می‌کرد و کاربر دو قانونِ متفاوت می‌دید.
          row(liveText(
              'referral.dailySpinRule',
              'هر ${faNum(invitesPerDaily)} دعوت موفق = '
              '${faNum(spinThreshold)} چرخش روزانه دائمی به گردونه شانس '
              '(تا سقف ${faNum(maxInvitesDaily)} نفر).',
              vars: {
                'invitesPerDailySpin': invitesPerDaily,
                'spinsPerDailyThreshold': spinThreshold,
                'maxInvitesForDaily': maxInvitesDaily,
              })),
          row('هر دعوت موفق، ${faNum(spinsPerReferral)} چرخش فوری هم به تو و هم به دوستت '
              'می‌دهد.'),
          // لحنِ جمله زنده است، ساعتِ ریست نه: نیمه‌شب تهران منطقِ سرور است
          // (بند ۴ نقشه‌راه)؛ ادمین فقط می‌تواند جمله را نرم‌تر یا جدی‌تر کند.
          row(liveText('wheel.resetNote',
              'سهمیهٔ روزانه هر شب ساعت ۱۲ به وقت تهران تازه می‌شود.')),
          row('جایزه‌های بزرگ عمداً خیلی کم‌یاب‌اند؛ بیشتر چرخش‌ها امتیاز '
              'می‌دهند. جایزه را سرور انتخاب می‌کند، نه گوشی تو.'),
        ],
      ),
    );
  }
}

/// دکمه انیمه‌ای و درخشان گردونه شانس با پالس نوری و گرادیان طلایی
class _AnimeSpinButton extends StatefulWidget {
  const _AnimeSpinButton({
    required this.spinning,
    required this.spinsLeft,
    required this.unlimited,
    required this.onPressed,
  });

  final bool spinning;
  final int spinsLeft;
  final bool unlimited;
  final VoidCallback? onPressed;

  @override
  State<_AnimeSpinButton> createState() => _AnimeSpinButtonState();
}

class _AnimeSpinButtonState extends State<_AnimeSpinButton>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 2000),
  )..repeat();

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final enabled = widget.onPressed != null;

    final label = widget.spinning
        ? 'در حال چرخش…'
        : widget.spinsLeft > 0
            ? (widget.unlimited
                ? 'بچرخون (نامحدود)'
                : 'بچرخون — ${faNum(widget.spinsLeft)} شانس')
            : 'شانس امروزت تمام شد';

    if (!enabled) {
      return Container(
        padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 14),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(24),
          color: Colors.white.withValues(alpha: 0.08),
          border: Border.all(color: Colors.white12),
        ),
        child: Text(
          label,
          style: const TextStyle(color: Colors.white38, fontSize: 15, fontWeight: FontWeight.w800),
        ),
      );
    }

    return AnimatedBuilder(
      animation: _ctrl,
      builder: (context, _) {
        final t = _ctrl.value;
        final pulse = 0.88 + 0.24 * (t < 0.5 ? t * 2 : (1 - t) * 2);

        return InkWell(
          borderRadius: BorderRadius.circular(26),
          onTap: widget.onPressed,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 36, vertical: 15),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(26),
              gradient: const LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [Color(0xFFFFDF70), Color(0xFFFF9F43), Color(0xFFFF5252)],
              ),
              boxShadow: [
                BoxShadow(
                  color: const Color(0xFFFF9F43).withValues(alpha: 0.55 * pulse),
                  blurRadius: 18 * pulse,
                  spreadRadius: 2,
                  offset: const Offset(0, 4),
                ),
              ],
              border: Border.all(color: const Color(0xFFFFF7C2), width: 1.5),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.auto_awesome, color: Color(0xFF230E00), size: 20),
                const SizedBox(width: 8),
                Text(
                  label,
                  style: const TextStyle(
                    color: Color(0xFF230E00),
                    fontSize: 16,
                    fontWeight: FontWeight.w900,
                    letterSpacing: 0.5,
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
