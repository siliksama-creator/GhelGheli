// گذر نبرد فصلی — «مسیر قلقلی»
//
// ═══════════════════════════════════════════════════════════════════════════
// چرا این صفحه از صفر بازنویسی شد
// ═══════════════════════════════════════════════════════════════════════════
//
// بازخورد صریح مالک روی نسخهٔ اول: «ظاهرش خیلی زشت و غیر قابل مفهوم
// هستش اصلا کل صفحش زشت طراحی شده ... یه اسکرول بار هم باید طراحی کنی
// که کاربرها بفهمن بعضی چیزا تو صفحه پایین تر قرار داده شده».
//
// سه اشکال ریشه‌ای داشت:
//
// ۱. **اسکرول افقی برای ۵۰ پله.** کاربر نمی‌دانست چند پله هست، کجای
//    مسیر است، و اصلاً که می‌شود اسکرول کرد. خانه‌های ۷۸ پیکسلی هم
//    آن‌قدر تنگ بودند که متن فارسی بریده می‌شد.
//
// ۲. **هیچ نشانه‌ای از ادامه داشتن صفحه نبود** — دقیقاً همان چیزی که
//    مالک گفت. حالا یک نوار پیشرفتِ اسکرول در لبه هست که همیشه دیده
//    می‌شود و شمارهٔ پله را هم نشان می‌دهد.
//
// ۳. **همه‌چیز مسطح و بی‌روح بود** — بدون تصویر، بدون انیمیشن، بدون
//    سلسله‌مراتب بصری.
//
// طراحی جدید:
//   • لیست **عمودی** — الگوی طبیعی موبایل. هر پله یک ردیف کامل با فضای
//     کافی برای متن فارسی.
//   • بنر تصویری بالای صفحه + آیکون‌های سه‌بعدی برای هر نوع جایزه.
//   • نوار پیشرفتِ اسکرول در لبه، همیشه پیدا.
//   • پرش خودکار به پلهٔ فعلی هنگام باز شدن — کاربر از جایی شروع می‌کند
//     که واقعاً آنجاست، نه از پلهٔ ۱.
//   • انیمیشن: نبض روی جایزهٔ آماده، درخشش نوار پیشرفت.
import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../api_client.dart';
import '../../core/assets.dart';
import '../../theme/brand_theme.dart';
import '../../theme/tokens.dart';
import '../../widgets/state_views.dart';

/// رنگ دو مسیر — همه‌جای صفحه از همین‌ها استفاده می‌شود تا «رایگان» و
/// «پلاس» با یک نگاه از هم جدا شوند.
const _freeColor = Color(0xFF38BDF8);
// ═══════════════════════════════════════════════════════════════════════════
// چرا این ثابت با یک تابعِ تم‌آگاه جایگزین شد
// ═══════════════════════════════════════════════════════════════════════════
//
// طلاییِ پلاس (#FFD36B) روی سطحِ سفیدِ تم روشن کنتراستِ **۱.۴۲:۱**
// دارد — بدترین موردِ کل پالت. متن‌های «فقط پلاس»، «سقف امروز پر شد»
// و برچسبِ مسیرِ پلاس در تم روشن عملاً نامرئی بودند.
//
// `context.gold` نسخهٔ درستِ تم را می‌دهد: همان hue، روشناییِ کمتر در
// تم روشن، و همان طلاییِ درخشان در تم تیره.
//
// ثابتِ زیر فقط برای گرادیان‌ها می‌ماند، جایی که پس‌زمینه همیشه تیره
// است و رنگِ ثابت درست‌تر از رنگِ تم است.
const _plusGradient = Color(0xFFFFD36B);
const _readyColor = Color(0xFFB5EF58);

class PassPage extends StatefulWidget {
  const PassPage({
    super.key,
    required this.api,
    required this.onOpenShop,
    this.onChanged,
  });

  final ApiClient api;
  final VoidCallback onOpenShop;
  final VoidCallback? onChanged;

  @override
  State<PassPage> createState() => _PassPageState();
}

class _PassPageState extends State<PassPage> with TickerProviderStateMixin {
  Map<String, dynamic>? _data;
  bool _loading = true;
  bool _busy = false;
  String? _error;

  final _scroll = ScrollController();
  double _scrollFrac = 0;

  /// نبضِ ملایم روی جایزه‌های آمادهٔ دریافت.
  ///
  /// در initState ساخته می‌شود، نه به‌صورت مقداردهیِ `late final` روی
  /// فیلد. یک `late final` تا اولین دسترسی مقداردهی نمی‌شود؛ اگر ویجت
  /// پیش از اولین build حذف شود، `dispose()` اولین جایی است که به آن
  /// دست می‌زند و `createTicker` روی عنصرِ غیرفعال صدا زده می‌شود:
  /// «Looking up a deactivated widget's ancestor is unsafe». روی گوشی
  /// واقعی هم رخ می‌دهد — کاربری که اپ را باز و فوراً بسته.
  late final AnimationController _pulse;

  @override
  void initState() {
    super.initState();
    // ═══════════════════════════════════════════════════════════════════
    // چرا اینجا repeat() صدا زده نمی‌شود
    // ═══════════════════════════════════════════════════════════════════
    //
    // این نبض فقط روی جایزه‌های **آمادهٔ دریافت** کشیده می‌شود. ولی
    // کنترلر قبلاً از همان initState بی‌قید می‌چرخید — یعنی حتی برای
    // کاربری که هیچ جایزهٔ آماده‌ای ندارد (حالت معمول: بیشتر روزها
    // هیچ پله‌ای باز نشده)، یک Ticker در هر ۱۶ میلی‌ثانیه بیدار
    // می‌شد و فریم می‌خواست.
    //
    // یک AnimationControllerِ در حال چرخش هرگز «رایگان» نیست: حتی
    // اگر هیچ AnimatedBuilderی به آن گوش ندهد، خودِ Ticker باعث
    // می‌شود موتور فلاتر برای هر فریم بیدار بماند به‌جای اینکه صفحه
    // را ساکن اعلام کند.
    //
    // حالا `_syncPulse` بعد از هر بارگذاری تصمیم می‌گیرد: اگر چیزی
    // برای گرفتن هست بچرخد، وگرنه بایستد.
    _pulse = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1600),
    );
    _scroll.addListener(_onScroll);
    _load();
  }

  /// نبض را فقط وقتی روشن نگه می‌دارد که چیزی برای گرفتن باشد.
  ///
  /// دو مصرف‌کنندهٔ نبض هر دو شرط دارند (`claimable > 0` در سربرگ و
  /// `ready` در هر کاشی)، پس وقتی هیچ‌کدام برقرار نیست، چرخیدنِ کنترلر
  /// خالص هدر دادنِ فریم و باتری است.
  void _syncPulse() {
    final claimable = NumberParser.toInt(_data?['claimable']);
    final anyReady = (_data?['tiers'] as List? ?? const [])
        .whereType<Map>()
        .any((t) => t['ready'] == true || t['claimable'] == true);
    final want = claimable > 0 || anyReady;
    if (want && !_pulse.isAnimating) {
      _pulse.repeat(reverse: true);
    } else if (!want && _pulse.isAnimating) {
      _pulse.stop();
      // به حالتِ خنثی برگرد تا کاشی‌ها در اندازهٔ درست بمانند؛
      // ایستادن روی یک مقدارِ میانی، همه را کمی بزرگ رها می‌کرد.
      _pulse.value = 0;
    }
  }

  @override
  void dispose() {
    _scroll.removeListener(_onScroll);
    // انیمیشنِ در حال اجرا را قبل از نابودی کنترلر متوقف کن، وگرنه
    // «An animation is still running even after the widget tree was
    // disposed» — روی گوشی هم نشتِ فریم است نه فقط هشدار تست.
    if (_scroll.hasClients) _scroll.jumpTo(_scroll.offset);
    _scroll.dispose();
    _pulse.dispose();
    super.dispose();
  }

  void _onScroll() {
    if (!_scroll.hasClients) return;
    final max = _scroll.position.maxScrollExtent;
    final f = max <= 0 ? 0.0 : (_scroll.offset / max).clamp(0.0, 1.0);
    if ((f - _scrollFrac).abs() > 0.004) setState(() => _scrollFrac = f);
  }

  Future<void> _load({bool jump = true}) async {
    try {
      final d = await widget.api.get('/api/pass', fresh: true);
      if (!mounted) return;
      if (d is! Map) {
        setState(() {
          _error = 'پاسخ سرور نامعتبر بود';
          _loading = false;
        });
        return;
      }
      setState(() {
        _data = Map<String, dynamic>.from(d);
        _error = null;
        _loading = false;
      });
      _syncPulse();
      if (jump) {
        // گارد mounted داخل callback لازم است، نه فقط بیرونش: بین این
        // فریم و فریم بعد، کاربر می‌تواند صفحه را ببندد.
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (mounted) _jumpToCurrent();
        });
      }
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = apiError(e);
        _loading = false;
      });
    }
  }

  /// پرش به پلهٔ فعلی.
  ///
  /// کاربری که در پلهٔ ۲۰ است نباید از پلهٔ ۱ شروع کند و بیست بار
  /// اسکرول کند تا خودش را پیدا کند.
  void _jumpToCurrent() {
    if (!mounted || !_scroll.hasClients || _data == null) return;
    final tier = NumberParser.toInt(_data!['tier']);
    if (tier <= 1) return;
    // هر ردیف ~۹۶ پیکسل؛ کمی بالاتر می‌ایستیم تا پله‌های قبلی هم دیده
    // شوند و کاربر بفهمد کجای مسیر است.
    final target = math.max(0.0, (tier - 1.6) * 96.0);
    _scroll.animateTo(
      math.min(target, _scroll.position.maxScrollExtent),
      duration: const Duration(milliseconds: 700),
      curve: Curves.easeOutCubic,
    );
  }

  Future<void> _claim(String tierId) async {
    setState(() => _busy = true);
    try {
      final r = await widget.api.post('/api/pass/claim/$tierId', {});
      if (!mounted) return;
      _toast(r is Map ? '${r['message'] ?? 'جایزه گرفتی!'}' : 'جایزه گرفتی!');
      widget.onChanged?.call();
      await _load(jump: false);
    } catch (e) {
      if (mounted) _toast(apiError(e), error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _claimAll() async {
    setState(() => _busy = true);
    try {
      final r = await widget.api.post('/api/pass/claim-all', {});
      if (!mounted) return;
      _toast(r is Map ? '${r['message'] ?? 'دریافت شد'}' : 'دریافت شد');
      widget.onChanged?.call();
      await _load(jump: false);
    } catch (e) {
      if (mounted) _toast(apiError(e), error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _toast(String text, {bool error = false}) {
    if (!mounted) return;
    ScaffoldMessenger.maybeOf(context)?.showSnackBar(SnackBar(
      content: Text(text, textAlign: TextAlign.center),
      behavior: SnackBarBehavior.floating,
      backgroundColor: error ? Theme.of(context).colorScheme.error : null,
      duration: const Duration(milliseconds: 1800),
    ));
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const LoadingView();
    if (_error != null && _data == null) {
      return RefreshIndicator(
        onRefresh: () async => _load(),
        child: ListView(
          padding: const EdgeInsets.all(Gaps.lg),
          children: [
            const SizedBox(height: 40),
            ErrorBanner(message: _error!, onRetry: _load),
          ],
        ),
      );
    }

    final d = _data ?? const {};
    if (d['active'] != true) return const _NoSeason();

    final season = Map<String, dynamic>.from(d['season'] as Map? ?? {});
    final tiers = (d['tiers'] as List? ?? const [])
        .whereType<Map>()
        .map((e) => Map<String, dynamic>.from(e))
        .toList();
    final tier = NumberParser.toInt(d['tier']);
    final tierCount = NumberParser.toInt(d['tierCount']);

    // ═══════════════════════════════════════════════════════════════════
    // چرا fit: StackFit.expand — ریشهٔ باگِ «کادر خالی بزرگ»
    // ═══════════════════════════════════════════════════════════════════
    //
    // یک `Stack` به فرزندِ **غیرPositioned** خود constraints شُل (loose)
    // می‌دهد: «هر عرضی می‌خواهی بگیر». ListView آن را به فرزندانش پاس
    // می‌دهد و در نهایت هر FilledButton پرتاب می‌کند:
    //
    //     BoxConstraints forces an infinite width
    //
    // آن خطا رندرِ کل سربرگ را می‌شکند. روی گوشیِ ریلیز خطاها پنهان‌اند،
    // پس فقط یک کادرِ خالیِ بلند با حاشیهٔ طلایی باقی می‌ماند — دقیقاً
    // همان چیزی که مالک در اسکرین‌شات فرستاد.
    //
    // `StackFit.expand` فرزند غیرPositioned را مجبور می‌کند اندازهٔ
    // Stack شود، پس عرض همیشه متناهی است. مشکل از ریشه حل می‌شود، نه با
    // وصله زدن به تک‌تک دکمه‌ها.
    return SizedBox.expand(
      child: Stack(
      fit: StackFit.expand,
      children: [
        RefreshIndicator(
          onRefresh: () async => _load(jump: false),
          child: ListView.builder(
            controller: _scroll,
            padding: const EdgeInsets.fromLTRB(Gaps.md, Gaps.md, 26, Gaps.xxl),
            // ۰ = سربرگ، ۱ = راهنمای «چطور جلو بروم»، ۲ = راهنمای مسیرها،
            // بعد پله‌ها.
            itemCount: tiers.length + 3,
            itemBuilder: (context, i) {
              if (i == 0) {
                return _Header(
                  title: '${season['name'] ?? 'فصل جاری'}',
                  daysLeft: NumberParser.toInt(season['daysLeft']),
                  tier: tier,
                  tierCount: tierCount,
                  into: NumberParser.toInt(d['intoTier']),
                  needs: NumberParser.toInt(d['tierNeeds']),
                  hasPlus: d['hasPlus'] == true,
                  claimable: NumberParser.toInt(d['claimable']),
                  tiersToday: NumberParser.toInt(d['tiersToday']),
                  maxToday: NumberParser.toInt(d['maxTiersPerDay']),
                  capReached: d['dayCapReached'] == true,
                  pending: NumberParser.toInt(d['pendingTiers']),
                  busy: _busy,
                  onOpenShop: widget.onOpenShop,
                  onClaimAll: _claimAll,
                  pulse: _pulse,
                );
              }
              if (i == 1) {
                // ═══════════════════════════════════════════════════════
                // راهنمای «چطور جلو بروم» را به بالای مسیر آوردم.
                // نسخهٔ قبلی آن را در انتهای ۵۰ پله می‌گذاشت؛ کاربر باید
                // تا ته صفحه اسکرول می‌کرد تا بفهمد این صفحه دربارهٔ چیست
                // و چطور پله باز کند. حالا درست زیر سربرگ می‌آید تا در
                // نگاه اول روشن باشد — همان الگوی گذرنبردهای مدرن.
                // ═══════════════════════════════════════════════════════
                return _HowTo(
                  sources: (d['sources'] as List? ?? const [])
                      .whereType<Map>()
                      .map((e) => Map<String, dynamic>.from(e))
                      .toList(),
                  maxToday: NumberParser.toInt(d['maxTiersPerDay']),
                );
              }
              if (i == 2) return _TrackLegend(tierCount: tierCount);
              return _TierRow(
                row: tiers[i - 3],
                currentTier: tier,
                busy: _busy,
                pulse: _pulse,
                onClaim: _claim,
              );
            },
          ),
        ),
        // ── نوار پیشرفتِ اسکرول ──
        //
        // درخواست صریح مالک: «یه اسکرول بار هم باید طراحی کنی که کاربرها
        // بفهمن بعضی چیزا تو صفحه پایین تر قرار داده شده».
        //
        // نوار پیش‌فرض فلاتر فقط هنگام اسکرول ظاهر می‌شود و روی اندروید
        // نازک و کم‌رنگ است. این یکی همیشه دیده می‌شود و شمارهٔ پله را
        // هم نشان می‌دهد.
        Positioned(
          top: 0,
          bottom: 0,
          right: 6,
          child: _ScrollRail(fraction: _scrollFrac, tierCount: tierCount),
        ),
      ],
      ),
    );
  }
}

// ── هیچ فصلی فعال نیست ────────────────────────────────────────────────────
class _NoSeason extends StatelessWidget {
  const _NoSeason();

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(Gaps.lg),
      children: [
        const SizedBox(height: 60),
        Center(
          child: Column(
            children: [
              Image.asset('assets/games/medals/medal_participation.webp', width: 64, height: 64),
              Gaps.vMd,
              Text('فصلی در جریان نیست',
                  style: Theme.of(context).textTheme.titleLarge),
              Gaps.vXs,
              Text('فصل بعدی به‌زودی شروع می‌شود',
                  style: Theme.of(context).textTheme.bodyMedium),
            ],
          ),
        ),
      ],
    );
  }
}

// ── نوار پیشرفت اسکرول ────────────────────────────────────────────────────
class _ScrollRail extends StatelessWidget {
  const _ScrollRail({required this.fraction, required this.tierCount});
  final double fraction;
  final int tierCount;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(builder: (context, c) {
      final trackH = c.maxHeight - 40;
      const thumbH = 54.0;
      final top = 20 + (trackH - thumbH) * fraction;
      return SizedBox(
        width: 14,
        child: Stack(
          children: [
            Positioned(
              top: 20,
              bottom: 20,
              left: 4,
              width: 6,
              child: DecoratedBox(
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(999),
                  color: Colors.white.withValues(alpha: 0.07),
                ),
              ),
            ),
            Positioned(
              top: top,
              left: 0,
              width: 14,
              height: thumbH,
              child: DecoratedBox(
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(999),
                  gradient: const LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [_readyColor, Color(0xFF84CC16)],
                  ),
                  boxShadow: [
                    BoxShadow(
                      color: _readyColor.withValues(alpha: 0.45),
                      blurRadius: 10,
                      spreadRadius: 1,
                    ),
                  ],
                ),
                child: Center(
                  child: RotatedBox(
                    quarterTurns: 3,
                    child: Text(
                      faNum((fraction * tierCount).round().clamp(1, tierCount)),
                      style: const TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w900,
                        color: Color(0xFF06301A),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      );
    });
  }
}

// ── سربرگ ─────────────────────────────────────────────────────────────────
class _Header extends StatelessWidget {
  const _Header({
    required this.title,
    required this.daysLeft,
    required this.tier,
    required this.tierCount,
    required this.into,
    required this.needs,
    required this.hasPlus,
    required this.claimable,
    required this.tiersToday,
    required this.maxToday,
    required this.capReached,
    required this.pending,
    required this.busy,
    required this.onOpenShop,
    required this.onClaimAll,
    required this.pulse,
  });

  final String title;
  final int daysLeft, tier, tierCount, into, needs;
  final int claimable, tiersToday, maxToday, pending;
  final bool hasPlus, capReached, busy;
  final VoidCallback onOpenShop, onClaimAll;
  final Animation<double> pulse;

  @override
  Widget build(BuildContext context) {
    // ═══════════════════════════════════════════════════════════════════
    // چرا stretch حذف شد و عرض‌ها صریح‌اند — باگِ «کادر خالی بزرگ»
    // ═══════════════════════════════════════════════════════════════════
    //
    // این Column داخل ListView است که خودش داخل Stack است. Stack به
    // فرزندِ غیرPositioned، constraints شُل می‌دهد، پس عرض تا اینجا
    // **بی‌کران** می‌رسد. با `crossAxisAlignment: stretch` همان بی‌کران
    // مستقیم به فرزندان می‌رفت و هر FilledButton پرتاب می‌کرد:
    //
    //     BoxConstraints forces an infinite width
    //
    // آن خطا رندرِ کل سربرگ را می‌شکند. روی گوشیِ ریلیز خطاها پنهان‌اند،
    // پس فقط یک کادرِ خالیِ بلند با حاشیهٔ طلایی باقی می‌ماند — دقیقاً
    // همان چیزی که مالک در اسکرین‌شات فرستاد.
    //
    // `MediaQuery.sizeOf(context).width` همیشه عرضِ **واقعیِ صفحه** را
    // می‌دهد و هرگز بی‌کران نیست، پس هر کارتی که باید تمام‌عرض باشد از
    // آن استفاده می‌کند و دکمه‌ها اندازهٔ طبیعی‌شان را می‌گیرند.
    //
    // عرض از LayoutBuilder می‌آید نه MediaQuery: ListView یک padding
    // افقی ۴۲ پیکسلی دارد، پس عرضِ واقعیِ آیتم ۳۱۸ است نه ۳۶۰. با
    // MediaQuery کارت‌ها ۴۲ پیکسل از کادر بیرون می‌زدند.
    //
    // با pass_layout_test.dart قفل شد.
    return LayoutBuilder(builder: (context, cons) {
      final w = cons.maxWidth;
      return _headerBody(context, w);
    });
  }

  Widget _headerBody(BuildContext context, double w) {
    return Column(
      children: [
        SizedBox(
          width: w,
          child: ClipRRect(
          borderRadius: BorderRadius.circular(20),
          child: Stack(
            children: [
              Image.asset(
                'assets/pass/pass_banner.webp',
                height: 132,
                width: double.infinity,
                fit: BoxFit.cover,
                // منبع ۸۲۰ پیکسل است و همان‌جا نمایش داده می‌شود؛ بدون
                // این راهنما فلاتر تمام بیت‌مپ را رزیدنت نگه می‌دارد.
                cacheWidth: 820,
                errorBuilder: (_, __, ___) => Container(
                  height: 132,
                  color: const Color(0xFF10233A),
                  alignment: Alignment.center,
                  child: Image.asset('assets/games/medals/medal_participation.webp', width: 48, height: 48),
                ),
              ),
              // گرادیان تیره، تا متن روی هر تصویری خوانا بماند
              Positioned.fill(
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                      colors: [
                        Colors.transparent,
                        Colors.black.withValues(alpha: 0.72),
                      ],
                    ),
                  ),
                ),
              ),
              Positioned(
                right: 14,
                left: 14,
                bottom: 10,
                child: Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            title,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontSize: 17,
                              fontWeight: FontWeight.w900,
                              color: Colors.white,
                            ),
                          ),
                          Text(
                            '${faNum(daysLeft)} روز تا پایان فصل',
                            style: const TextStyle(
                                fontSize: 12, color: Colors.white70),
                          ),
                        ],
                      ),
                    ),
                    _TierMedal(tier: tier, tierCount: tierCount),
                  ],
                ),
              ),
            ],
          ),
          ),
        ),
        Gaps.vMd,
        _ProgressCard(
          pct: needs > 0 ? (into / needs).clamp(0.0, 1.0) : 1.0,
          into: into,
          needs: needs,
          tier: tier,
          tierCount: tierCount,
          tiersToday: tiersToday,
          maxToday: maxToday,
          capReached: capReached,
          pending: pending,
        ),
        if (claimable > 0) ...[
          Gaps.vSm,
          AnimatedBuilder(
            animation: pulse,
            builder: (context, child) =>
                Transform.scale(scale: 1 + pulse.value * 0.015, child: child),
            child: SizedBox(
              // عرضِ متناهی — والد بی‌کران است (توضیح بالا).
              width: w,
              height: 48,
              child: FilledButton.icon(
                onPressed: busy ? null : onClaimAll,
                style: FilledButton.styleFrom(
                  backgroundColor: _readyColor,
                  foregroundColor: const Color(0xFF07240F),
                ),
                icon: Image.asset('assets/pass/reward_gift_icon.webp', width: 24, height: 24),
                label: Text('دریافت ${faNum(claimable)} جایزهٔ آماده',
                    style: const TextStyle(fontWeight: FontWeight.w900)),
              ),
            ),
          ),
        ],
        if (!hasPlus) ...[
          Gaps.vSm,
          _PlusUpsell(onOpenShop: onOpenShop),
        ],
      ],
    );
  }
}

/// مدال پلهٔ فعلی — بزرگ‌ترین عدد صفحه، چون اولین چیزی است که کاربر
/// می‌خواهد بداند.
class _TierMedal extends StatelessWidget {
  const _TierMedal({required this.tier, required this.tierCount});
  final int tier, tierCount;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 62,
      height: 62,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFFB5EF58), Color(0xFF4D9E1F)],
        ),
        boxShadow: [
          BoxShadow(
            color: _readyColor.withValues(alpha: 0.35),
            blurRadius: 14,
            spreadRadius: 1,
          ),
        ],
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(faNum(tier),
              style: const TextStyle(
                fontSize: 30,
                height: 1,
                fontWeight: FontWeight.w900,
                color: Color(0xFF07240F),
              )),
          Text('از ${faNum(tierCount)}',
              style: const TextStyle(
                fontSize: 10.5,
                height: 1.3,
                fontWeight: FontWeight.w700,
                color: Color(0xFF0B3A16),
              )),
        ],
      ),
    );
  }
}

class _ProgressCard extends StatelessWidget {
  const _ProgressCard({
    required this.pct,
    required this.into,
    required this.needs,
    required this.tier,
    required this.tierCount,
    required this.tiersToday,
    required this.maxToday,
    required this.capReached,
    required this.pending,
  });

  final double pct;
  final int into, needs, tier, tierCount, tiersToday, maxToday, pending;
  final bool capReached;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final done = tier >= tierCount;

    return Container(
      // عرض صریح از LayoutBuilder — نه MediaQuery، چون ListView حاشیهٔ
      // افقی دارد و عرضِ صفحه ۴۲ پیکسل بزرگ‌تر از عرضِ آیتم است.
      width: double.infinity,
      padding: const EdgeInsets.all(Gaps.md),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(18),
        color: theme.colorScheme.surface.withValues(alpha: 0.55),
        border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  done ? 'کل مسیر را تمام کردی!' : 'تا پلهٔ ${faNum(tier + 1)}',
                  style: const TextStyle(fontWeight: FontWeight.w800),
                ),
              ),
              if (!done)
                Text('${faNum(into)} / ${faNum(needs)}',
                    style: theme.textTheme.labelMedium),
            ],
          ),
          Gaps.vXs,
          ClipRRect(
            borderRadius: BorderRadius.circular(999),
            child: TweenAnimationBuilder<double>(
              tween: Tween(begin: 0, end: pct),
              duration: const Duration(milliseconds: 750),
              curve: Curves.easeOutCubic,
              builder: (_, v, __) => Stack(
                children: [
                  Container(
                      height: 14, color: Colors.white.withValues(alpha: 0.07)),
                  FractionallySizedBox(
                    widthFactor: v,
                    child: Container(
                      height: 14,
                      decoration: BoxDecoration(
                        gradient: const LinearGradient(
                            colors: [Color(0xFF4D9E1F), _readyColor]),
                        boxShadow: [
                          BoxShadow(
                              color: _readyColor.withValues(alpha: 0.5),
                              blurRadius: 8),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
          Gaps.vSm,
          // ── سقف روزانه ──
          //
          // تنها جایی که کاربر می‌فهمد چرا با وجود بازی کردن پله‌اش بالا
          // نمی‌رود. بدون آن، سقف شبیه باگ به‌نظر می‌رسد.
          Row(
            children: [
              Icon(capReached ? Icons.lock_clock_rounded : Icons.bolt_rounded,
                  size: 16, color: capReached ? context.gold : _readyColor),
              Gaps.hXs,
              Expanded(
                child: Text(
                  capReached
                      ? 'سقف امروز پر شد — فردا ${faNum(maxToday)} پلهٔ دیگر'
                      : 'امروز ${faNum(tiersToday)} از ${faNum(maxToday)} پله',
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: capReached ? context.gold : null,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              for (var i = 0; i < maxToday; i++)
                Padding(
                  padding: const EdgeInsets.only(left: 3),
                  child: Container(
                    width: 9,
                    height: 9,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: i < tiersToday
                          ? _readyColor
                          : Colors.white.withValues(alpha: 0.15),
                    ),
                  ),
                ),
            ],
          ),
          if (pending > 0) ...[
            Gaps.vXxs,
            Text(
              '${faNum(pending)} پله ذخیره شده — به‌محض باز شدن سقف آزاد می‌شود',
              style:
                  theme.textTheme.labelSmall?.copyWith(color: Colors.white54),
            ),
          ],
        ],
      ),
    );
  }
}

class _PlusUpsell extends StatelessWidget {
  const _PlusUpsell({required this.onOpenShop});
  final VoidCallback onOpenShop;

  @override
  Widget build(BuildContext context) {
    return Container(
      // بدون عرضِ صریح، Row داخلی بی‌کران می‌گیرد و FilledButton کرش
      // می‌کند — همان کادر خالیِ اسکرین‌شات. حالا والد (LayoutBuilder
      // در _Header) عرضِ متناهی می‌دهد، پس infinity اینجا امن است.
      width: double.infinity,
      padding: const EdgeInsets.all(Gaps.sm),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(18),
        gradient: LinearGradient(colors: [
          _plusGradient.withValues(alpha: 0.16),
          _plusGradient.withValues(alpha: 0.05),
        ]),
        border: Border.all(color: _plusGradient.withValues(alpha: 0.4)),
      ),
      child: Row(
        children: [
          const Icon(Icons.star_rounded, size: 27, color: Colors.amber),
          Gaps.hSm,
          // ═══════════════════════════════════════════════════════════
          // چرا این متن‌ها رنگِ ثابت ندارند
          // ═══════════════════════════════════════════════════════════
          //
          // گرادیانِ بالا **نیمه‌شفاف** است (alpha ۰.۱۶ و ۰.۰۵)، پس
          // سطحِ تم از پشتش دیده می‌شود. در تم تیره نتیجه تیره است و
          // متنِ سفید کار می‌کرد؛ در تم روشن نتیجه تقریباً سفید است و
          // `Colors.white70` روی آن محو می‌شد.
          //
          // این تلهٔ رایجی است: یک گرادیانِ نیمه‌شفاف، سطحِ زیرش را
          // نمی‌پوشاند و نمی‌شود مثل یک پس‌زمینهٔ تیرهٔ قطعی با آن
          // رفتار کرد.
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('مسیر طلایی قفل است',
                    style: TextStyle(
                        fontWeight: FontWeight.w900, color: context.gold)),
                const SizedBox(height: 2),
                Text('چرخش گردونه، آیتم‌های ویژه و امتیاز دو برابر',
                    style: TextStyle(
                        fontSize: 12,
                        color: Theme.of(context)
                            .colorScheme
                            .onSurface
                            .withValues(alpha: 0.75))),
              ],
            ),
          ),
          Gaps.hXs,
          // ═══════════════════════════════════════════════════════════
          // چرا دکمه داخل SizedBox با عرض ثابت است
          // ═══════════════════════════════════════════════════════════
          //
          // این Row داخل زنجیره‌ای است که در نهایت از AnimatedSwitcher
          // در HomeShell عرضِ شُل (unbounded) می‌گیرد. یک Material
          // button با عرض بی‌کران پرتاب می‌کند:
          //
          //     BoxConstraints forces an infinite width
          //
          // و آن خطا رندرِ کل سربرگ را می‌شکند؛ روی گوشیِ ریلیز فقط یک
          // کادرِ خالیِ بلند با حاشیهٔ طلایی باقی می‌ماند — دقیقاً همان
          // اسکرین‌شاتی که مالک فرستاد.
          //
          // عرض ثابت ۹۶ برای «بازکردن» کافی است و مشکل را قطعی حل
          // می‌کند: دکمه دیگر هرگز بی‌کران نمی‌بیند.
          // با pass_layout_test.dart قفل شد.
          SizedBox(
            width: 96,
            height: 40,
            child: FilledButton(
              onPressed: onOpenShop,
              style: FilledButton.styleFrom(
                backgroundColor: _plusGradient,
                foregroundColor: const Color(0xFF3A2A00),
                padding: EdgeInsets.zero,
              ),
              child: const Text('بازکردن',
                  style: TextStyle(fontWeight: FontWeight.w900)),
            ),
          ),
        ],
      ),
    );
  }
}

// ── راهنمای دو مسیر ───────────────────────────────────────────────────────
class _TrackLegend extends StatelessWidget {
  const _TrackLegend({required this.tierCount});
  final int tierCount;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: Gaps.md, bottom: Gaps.xs),
      child: Row(
        children: [
          _chip('رایگان', _freeColor),
          Gaps.hSm,
          _chip('پلاس', context.gold),
          const Spacer(),
          Text('${faNum(tierCount)} پله',
              style: Theme.of(context).textTheme.labelMedium),
        ],
      ),
    );
  }

  Widget _chip(String label, Color c) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(999),
          color: c.withValues(alpha: 0.14),
          border: Border.all(color: c.withValues(alpha: 0.4)),
        ),
        child: Text(label,
            style: TextStyle(
                fontSize: 12, fontWeight: FontWeight.w800, color: c)),
      );
}

// ── یک ردیف پله ───────────────────────────────────────────────────────────
//
// چیدمان عمودی: شمارهٔ پله سمت راست (RTL)، بعد دو جایزه کنار هم. هر
// جایزه فضای کافی برای متن فارسی دارد — مشکل اصلی نسخهٔ افقی.
class _TierRow extends StatelessWidget {
  const _TierRow({
    required this.row,
    required this.currentTier,
    required this.busy,
    required this.pulse,
    required this.onClaim,
  });

  final Map<String, dynamic> row;
  final int currentTier;
  final bool busy;
  final Animation<double> pulse;
  final void Function(String) onClaim;

  @override
  Widget build(BuildContext context) {
    final tier = NumberParser.toInt(row['tier']);
    final unlocked = row['unlocked'] == true;
    final isCurrent = tier == currentTier + 1;
    // ── نشانهٔ مایلستون هر ۵ پله ──
    //
    // ۵۰ ردیفِ کاملاً یکسان هیچ نقطهٔ اتکایی برای چشم نداشت — کاربر
    // موقعِ اسکرول نمی‌فهمید کجای مسیر است. هر پنجمین پله شمارهٔ
    // درشتِ طلایی می‌گیرد و مثلِ تابلوی کیلومترشمار کار می‌کند.
    //
    // همین تغییر در نسخهٔ وب هم اعمال شد تا دو کلاینت یک‌شکل بمانند.
    final isMilestone = tier % 5 == 0;
    final gold = context.gold;

    return Container(
      margin: const EdgeInsets.only(bottom: 9),
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 9),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(18),
        color: isCurrent
            ? _readyColor.withValues(alpha: 0.10)
            : Colors.white.withValues(alpha: unlocked ? 0.05 : 0.02),
        border: Border.all(
          color: isCurrent
              ? _readyColor
              : isMilestone
                  ? gold.withValues(alpha: 0.28)
                  : Colors.white.withValues(alpha: 0.08),
          width: isCurrent ? 1.6 : 1,
        ),
        // پلهٔ فعلی باید در یک نگاه پیدا شود — مهم‌ترین ردیفِ صفحه.
        boxShadow: isCurrent
            ? [BoxShadow(
                color: _readyColor.withValues(alpha: 0.14),
                blurRadius: 18, offset: const Offset(0, 6))]
            : null,
      ),
      child: Row(
        children: [
          _TierNumber(
              tier: tier, unlocked: unlocked, milestone: isMilestone),
          Gaps.hXs,
          Expanded(
            child: _RewardTile(
              data: row['free'] as Map?,
              unlocked: unlocked,
              track: 'free',
              busy: busy,
              pulse: pulse,
              onClaim: onClaim,
            ),
          ),
          const SizedBox(width: 6),
          Expanded(
            child: _RewardTile(
              data: row['plus'] as Map?,
              unlocked: unlocked,
              track: 'plus',
              busy: busy,
              pulse: pulse,
              onClaim: onClaim,
            ),
          ),
        ],
      ),
    );
  }
}

class _TierNumber extends StatelessWidget {
  const _TierNumber({
    required this.tier,
    required this.unlocked,
    this.milestone = false,
  });
  final int tier;
  final bool unlocked;
  final bool milestone;

  @override
  Widget build(BuildContext context) {
    final gold = context.gold;
    return Container(
      width: 44,
      height: 96,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        color: unlocked
            ? _readyColor.withValues(alpha: 0.18)
            : milestone
                ? gold.withValues(alpha: 0.14)
                : Colors.white.withValues(alpha: 0.05),
        border: milestone && !unlocked
            ? Border.all(color: gold.withValues(alpha: 0.35))
            : null,
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(unlocked ? Icons.lock_open_rounded : Icons.lock_rounded,
              size: 13,
              color: unlocked
                  ? _readyColor
                  : milestone
                      ? gold.withValues(alpha: 0.7)
                      : Colors.white.withValues(alpha: 0.32)),
          const SizedBox(height: 3),
          Text(faNum(tier),
              style: TextStyle(
                // ۱۵ → ۱۹ (و ۲۱ برای مایلستون): شمارهٔ پله مهم‌ترین
                // عددِ ردیف است و باید بی‌زحمت خوانده شود.
                fontSize: milestone ? 21 : 19,
                fontWeight: FontWeight.w900,
                color: unlocked
                    ? _readyColor
                    : milestone
                        ? gold
                        : Colors.white.withValues(alpha: 0.55),
              )),
        ],
      ),
    );
  }
}

/// یک جایزه.
class _RewardTile extends StatelessWidget {
  const _RewardTile({
    required this.data,
    required this.unlocked,
    required this.track,
    required this.busy,
    required this.pulse,
    required this.onClaim,
  });

  final Map? data;
  final bool unlocked, busy;
  final String track;
  final Animation<double> pulse;
  final void Function(String) onClaim;

  static const _art = {
    'points': 'assets/pass/icon_points.png',
    'spins': 'assets/pass/icon_spins.png',
    'shop_item': 'assets/pass/icon_item.png',
  };
  static const _fallbackArt = {
    'points': 'assets/pass/icon_points.png',
    'spins': 'assets/pass/wheel_icon.webp',
    'cash': 'assets/pass/icon_points.png',
    'shop_item': 'assets/pass/reward_gift_icon.webp',
  };

  String _label(Map m) {
    final kind = '${m['kind']}';
    final amount = NumberParser.toInt(m['amount']);
    switch (kind) {
      case 'points':
        return '${faNum(amount)} امتیاز';
      case 'spins':
        return '${faNum(amount)} چرخش';
      case 'cash':
        return '${faNum(amount)} تومان';
      default:
        return '${m['label'] ?? 'آیتم ویژه'}';
    }
  }

  @override
  Widget build(BuildContext context) {
    final color = track == 'plus' ? context.gold : _freeColor;
    final m = data;

    if (m == null) {
      return Container(
        height: 96,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(12),
          color: Colors.white.withValues(alpha: 0.02),
        ),
        child: Text('—',
            style: TextStyle(color: Colors.white.withValues(alpha: 0.2))),
      );
    }

    final claimed = m['claimed'] == true;
    final locked = m['locked'] == true;
    final ready = unlocked && !claimed && !locked;
    final kind = '${m['kind']}';

    final tile = Container(
      // ── تاریخچهٔ این عدد ──
      //
      // ۶۲ → ۸۰: وقتی برچسب دو خطی می‌شود (مثل «اسم آبی آسمانی») و
      // زیرش هم یک خط وضعیت («فقط پلاس») می‌آید، ۶۲ پیکسل ۱۴ پیکسل
      // کم می‌آورد و فلاتر نوار زرد-مشکیِ سرریز می‌کشد.
      //
      // ۸۰ → ۹۶: بزرگ کردنِ فونت‌ها (۱۱.۵→۱۴ برای برچسب و ۹.۵→۱۱.۵
      // برای وضعیت) **دقیقاً همان سرریز را برگرداند** — این بار ۱۵
      // پیکسل. یعنی همان تستی که یک بار این باگ را گرفته بود، دوباره
      // گرفتش.
      //
      //  درس: هر تغییرِ اندازهٔ فونت در این ویجت باید با ارتفاع
      //    هماهنگ شود. دو خطِ ۱۴px با height 1.35 = ۳۸، به‌علاوهٔ یک
      //    خطِ ۱۱.۵ = ۱۶، به‌علاوهٔ فاصله‌ها ≈ ۶۰. با پدینگ و حاشیهٔ
      //    امن برای فونتِ بزرگِ سیستم، ۹۶.
      height: 96,
      padding: const EdgeInsets.symmetric(horizontal: 8),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(12),
        color: ready
            ? _readyColor.withValues(alpha: 0.16)
            : color.withValues(alpha: claimed ? 0.04 : 0.08),
        border: Border.all(
          color: ready
              ? _readyColor.withValues(alpha: 0.7)
              : color.withValues(alpha: claimed ? 0.15 : 0.3),
          width: ready ? 1.6 : 1,
        ),
      ),
      child: Row(
        children: [
          SizedBox(
            width: 30,
            height: 30,
            child: _art.containsKey(kind)
                ? Image.asset(
                    _art[kind]!,
                    // ۳۰ پیکسل روی صفحه از منبع ۱۲۸ — بدون این راهنما
                    // ۵۰ ردیف × ۲ آیکون حافظهٔ زیادی هدر می‌دهد.
                    cacheWidth: 90,
                    errorBuilder: (_, __, ___) => Image.asset(_fallbackArt[kind] ?? 'assets/pass/reward_gift_icon.webp', width: 24, height: 24),
                  )
                : Center(
                    child: Image.asset(_fallbackArt[kind] ?? 'assets/pass/reward_gift_icon.webp', width: 24, height: 24)),
          ),
          const SizedBox(width: 6),
          Expanded(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  // `_label` خودش `Map` می‌گیرد؛ کپیِ اضافه هم یک
                  // تخصیصِ بی‌فایده در هر build بود و هم روی یک `m`
                  // بدشکل پرتاب می‌کرد — داخل build که هیچ catchی
                  // ندارد.
                  _label(m),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    // ── ۱۱.۵ → ۱۴ ──
                    //
                    // خواستهٔ مالک: «فونت ها هم واضح تر باشه». این
                    // متنِ اصلیِ خانه است (نامِ جایزه) و روی موبایلِ
                    // واقعی در ۱۱.۵ پیکسل تقریباً ناخوانا بود.
                    // نسخهٔ وب هم دقیقاً همین تغییر را گرفت.
                    fontSize: 14,
                    height: 1.35,
                    fontWeight: FontWeight.w900,
                    color: claimed
                        ? Colors.white.withValues(alpha: 0.4)
                        : Colors.white,
                  ),
                ),
                if (claimed)
                  const Text(' گرفتی',
                      style: TextStyle(
                          fontSize: 11.5,
                          fontWeight: FontWeight.w800,
                          color: _readyColor))
                else if (locked)
                  Text('فقط پلاس',
                      style: TextStyle(
                          fontSize: 11.5,
                          fontWeight: FontWeight.w800,
                          color: context.gold))
                else if (ready)
                  const Text('برای گرفتن بزن',
                      style: TextStyle(
                          fontSize: 11.5,
                          fontWeight: FontWeight.w900,
                          color: _readyColor)),
              ],
            ),
          ),
        ],
      ),
    );

    if (!ready) {
      return Opacity(opacity: claimed ? 0.55 : (locked ? 0.7 : 1), child: tile);
    }

    // فقط جایزهٔ آماده نبض دارد — تنها چیزی که کاربر باید رویش بزند.
    return AnimatedBuilder(
      animation: pulse,
      builder: (context, child) =>
          Transform.scale(scale: 1 + pulse.value * 0.02, child: child),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(12),
          onTap: busy ? null : () => onClaim('${m['id']}'),
          child: tile,
        ),
      ),
    );
  }
}

// ── راهنمای کسب تجربه ─────────────────────────────────────────────────────
class _HowTo extends StatelessWidget {
  const _HowTo({required this.sources, required this.maxToday});
  final List<Map<String, dynamic>> sources;
  final int maxToday;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      margin: const EdgeInsets.only(top: Gaps.md),
      padding: const EdgeInsets.all(Gaps.md),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(18),
        color: theme.colorScheme.surface.withValues(alpha: 0.5),
        border: Border.all(color: Colors.white.withValues(alpha: 0.07)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.lightbulb_outline_rounded, size: 18),
              Gaps.hXs,
              Text('چطور جلو بروم؟',
                  style: theme.textTheme.titleMedium
                      ?.copyWith(fontWeight: FontWeight.w900)),
            ],
          ),
          Gaps.vXs,
          Text(
            'با بازی کردن تجربه می‌گیری — '
            'هر روز حداکثر ${faNum(maxToday)} پله باز می‌شود، پس هر روز سر بزن.',
            style: theme.textTheme.bodySmall,
          ),
          Gaps.vSm,
          for (final s in sources)
            Padding(
              padding: const EdgeInsets.only(bottom: 6),
              child: Row(
                children: [
                  Expanded(
                    child: Text('${s['label']}',
                        style: const TextStyle(
                            fontSize: 13, fontWeight: FontWeight.w700)),
                  ),
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(999),
                      color: _readyColor.withValues(alpha: 0.14),
                    ),
                    child: Text(
                      '+${faNum(NumberParser.toInt(s['xp']))}',
                      style: const TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w900,
                          color: _readyColor),
                    ),
                  ),
                  Gaps.hXs,
                  SizedBox(
                    width: 62,
                    child: Text(
                      'تا ${faNum(NumberParser.toInt(s['dailyCap']))}',
                      textAlign: TextAlign.end,
                      style: theme.textTheme.labelSmall,
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
