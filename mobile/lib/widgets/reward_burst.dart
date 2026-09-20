import 'dart:async';

import 'package:flutter/material.dart';

import '../api_client.dart';
import '../core/app_config.dart';
import 'ui_icon.dart';

/// جشنِ کوچکِ «دریافت شد» — وسطِ نما، روی هر صفحه‌ای.
///
/// ── چه چیزی را حل می‌کند ─────────────────────────────────────────────────
///
/// گزارشِ مالک: «کاربر باید جلوی چشمش ببیند که جایزه را گرفت — بدونِ ایموجی
/// و یکپارچه در وب و اندروید». پیش از این پیامِ دریافت در `_notice` پنلِ
/// ماموریت (و `SnackBar` پایینِ صفحه در چند جای دیگر) می‌نشست؛ کاربرِ
/// درحالِ‌اسکرول یا کسی که تب را عوض کرده بود هیچ‌وقت نمی‌دیدش.
///
/// ── چرا `Overlay` و نه `SnackBar` ────────────────────────────────────────
///
/// `SnackBar` به `Scaffold`ِ همان صفحه چسبیده است: اگر کاربر بین دو تب
/// جابه‌جا شود، پیام با صفحه می‌رود. `Overlay` روی کلِ ناوبری می‌نشیند، پس
/// مثل وب (`position: fixed`) همیشه در دید است — و این شرطِ آینگی است.
/// `IgnorePointer` هم لازم است وگرنه جشن کلیکِ کاربر روی دکمهٔ زیرش را
/// می‌خورد.
///
/// ── قواعدِ مشترک با وب ───────────────────────────────────────────────────
///
///  • **بدون ایموجی**؛ آیکون از `UiIcon` (همان مجموعهٔ SVGِ وب).
///  • **متن از سرور** با کلیدهای `reward.*`ِ قراردادِ متنِ زنده — پس ادمین
///    می‌تواند بدونِ آپدیت عوضش کند، و دو کلاینت هرگز واگرا نمی‌شوند.
///  • **۲٬۴ ثانیه** نمایش — همان `VISIBLE_MS` در
///    `userweb/src/components/RewardBurst.jsx`.
///  • **صِف** برای جایزه‌های پشت‌سرهم (مثل «دریافتِ همهٔ ماموریت‌ها»).
enum RewardSource { mission, daily, custom, wheel, streak }

class RewardBurstData {
  const RewardBurstData({
    required this.source,
    this.points = 0,
    this.coins = 0,
    this.xp = 0,
    this.note,
  });

  final RewardSource source;
  final int points;
  final int coins;
  final int xp;

  /// متنِ آمادهٔ سرور (برچسبِ جایزهٔ گردونه مثل «۱۰۰ امتیاز»). وقتی بیاید،
  /// جای چیپ‌های عددی می‌نشیند تا دو روایتِ متفاوت برای یک جایزه ساخته نشود.
  final String? note;

  bool get hasAmount => points > 0 || coins > 0 || xp > 0;
}

const _visibleMs = 2400;

/// صفِ جشن — یک منبعِ واحد برای کلِ اپ (آینهٔ گذرگاهِ `lib/rewards.js` در وب).
class RewardBurst {
  RewardBurst._();

  static final List<RewardBurstData> _queue = <RewardBurstData>[];
  static OverlayEntry? _entry;
  static Timer? _timer;
  static bool _busy = false;

  /// ثبتِ یک جایزه برای نمایش. اگر جایزه‌ای مقدار نداشته باشد، کاری نمی‌کند
  /// (جشنِ بی‌عدد بی‌معناست) — همان قاعده‌ای که `celebrateReward` در وب دارد.
  static void celebrate(BuildContext context, RewardBurstData data) {
    if (!data.hasAmount && (data.note == null || data.note!.isEmpty)) return;
    _queue.add(data);
    if (_busy) return;
    // `context` فقط برای پیدا کردنِ Overlay لازم است؛ بعد از اولین نمایش،
    // از `_entry` استفاده می‌کنیم تا به والدی که ممکن است unmount شود
    // وابسته نمانیم.
    _show(context);
  }

  static void _show(BuildContext context) {
    final overlay = Overlay.maybeOf(context, rootOverlay: true);
    if (overlay == null) return;
    _busy = true;
    final data = _queue.removeAt(0);
    _entry = OverlayEntry(
      builder: (_) => _RewardBurstOverlay(data: data),
    );
    overlay.insert(_entry!);
    _timer = Timer(const Duration(milliseconds: _visibleMs), () {
      _entry?.remove();
      _entry = null;
      if (_queue.isEmpty) {
        _busy = false;
      } else if (overlay.mounted) {
        _show(context);
      } else {
        _busy = false;
      }
    });
  }

  /// فقط برای تست‌ها: پاک‌کردنِ صف و بستنِ لایه.
  @visibleForTesting
  static void reset() {
    _timer?.cancel();
    _entry?.remove();
    _entry = null;
    _queue.clear();
    _busy = false;
  }
}

class _RewardBurstOverlay extends StatefulWidget {
  const _RewardBurstOverlay({required this.data});

  final RewardBurstData data;

  @override
  State<_RewardBurstOverlay> createState() => _RewardBurstOverlayState();
}

class _RewardBurstOverlayState extends State<_RewardBurstOverlay>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 420),
  )..forward();

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  /// عنوانِ جشن از قراردادِ متنِ زنده.
  ///
  /// ⚠️ عمداً `switch` است و نه یک نگاشتِ `{source: 'reward.x'}`: گاردِ
  /// `live-copy-coverage` مصرفِ کلید را از شکلِ فراخوانی می‌فهمد
  /// (`AppConfig.instance.text('reward.x', …)`). با نگاشت، پنج کلیدِ
  /// `reward.*` «مرده» گزارش می‌شدند — و راست می‌گفت: متنِ قابلِ‌ویرایشِ
  /// ادمین از چشمِ ابزار جایی خوانده نمی‌شد.
  String _titleOf(RewardSource source) {
    switch (source) {
      case RewardSource.daily:
        return AppConfig.instance.text('reward.daily', 'جایزهٔ روزانه');
      case RewardSource.custom:
        return AppConfig.instance.text('reward.custom', 'ماموریت اختصاصی');
      case RewardSource.wheel:
        return AppConfig.instance.text('reward.wheel', 'جایزهٔ گردونه');
      case RewardSource.streak:
        return AppConfig.instance.text('reward.streak', 'پاداش زنجیرهٔ ورود');
      case RewardSource.mission:
        return AppConfig.instance.text('reward.mission', 'جایزهٔ ماموریت');
    }
  }

  // ⚠️ کلیدها باید در هر دو مجموعهٔ آیکون باشند (وب `IconAsset.jsx` و
  // اندروید `ui_icon.dart`)؛ گاردِ `icon-parity` همین را می‌سنجد.
  static const _icons = <RewardSource, String>{
    RewardSource.mission: 'check',
    RewardSource.daily: 'gift',
    RewardSource.custom: 'sparkle',
    RewardSource.wheel: 'party',
    RewardSource.streak: 'flame',
  };

  @override
  Widget build(BuildContext context) {
    final d = widget.data;
    // ⚠️ فول‌بکِ هر چیپ عمداً خودش عدد را دارد و نه `{amount}`: `text()`
    // وقتی قالبِ زندهٔ سرور نرسیده باشد فول‌بک را بی‌دست‌زدن برمی‌گرداند، پس
    // قالبِ ناپر روی صفحهٔ کاربرِ آفلاین به‌صورت آکولاد چاپ می‌شد. `vars`
    // می‌ماند تا وقتی ادمین قالب را از پنل عوض می‌کند همان‌جا پر شود.
    final chips = <Widget>[
      if (d.points > 0)
        _chip('star', AppConfig.instance.text('reward.points',
            '${faNum(d.points)} امتیاز', vars: {'amount': d.points})),
      if (d.coins > 0)
        _chip('coins', AppConfig.instance.text('reward.coins',
            '${faNum(d.coins)} سکه', vars: {'amount': d.coins})),
      if (d.xp > 0)
        _chip('bolt', AppConfig.instance.text('reward.xp',
            '${faNum(d.xp)} تجربه', vars: {'amount': d.xp})),
    ];

    final curve = CurvedAnimation(parent: _c, curve: Curves.easeOutBack);
    return IgnorePointer(
      child: Align(
        // همان ۱۸٪ ارتفاعِ وب: کمی بالاتر از مرکز تا روی نوارِ ناوبریِ پایین
        // و نوارِ پیشرفتِ بازی نیفتد.
        alignment: const Alignment(0, -0.55),
        child: FadeTransition(
          opacity: _c,
          child: ScaleTransition(
            scale: Tween<double>(begin: 0.92, end: 1).animate(curve),
            child: Semantics(
              liveRegion: true,
              label: 'دریافت شد',
              child: Container(
                constraints: const BoxConstraints(maxWidth: 420),
                margin: const EdgeInsets.symmetric(horizontal: 16),
                padding: const EdgeInsets.fromLTRB(12, 12, 16, 12),
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: [Color(0xFF10322A), Color(0xFF0B2135), Color(0xFF0D2A20)],
                  ),
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(color: const Color(0x66B5EF58)),
                  boxShadow: const [
                    BoxShadow(color: Color(0xBB000000), blurRadius: 60, offset: Offset(0, 22)),
                  ],
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      width: 46,
                      height: 46,
                      decoration: const BoxDecoration(
                        shape: BoxShape.circle,
                        gradient: RadialGradient(
                          center: Alignment(-0.4, -0.5),
                          colors: [Color(0xFFB5EF58), Color(0xFF00D49A)],
                        ),
                        boxShadow: [BoxShadow(color: Color(0x55B5EF58), blurRadius: 22)],
                      ),
                      child: Center(
                        child: UiIcon(_icons[d.source]!, size: 26, color: const Color(0xFF06220F)),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Flexible(
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(_titleOf(d.source),
                              style: const TextStyle(
                                  fontSize: 14.5,
                                  fontWeight: FontWeight.w900,
                                  color: Color(0xFFEAF6FF))),
                          Text(AppConfig.instance.text('reward.received', 'دریافت شد'),
                              style: const TextStyle(
                                  fontSize: 12,
                                  fontWeight: FontWeight.w800,
                                  color: Color(0xFFB5EF58))),
                          if (d.note != null && d.note!.isNotEmpty)
                            Padding(
                              padding: const EdgeInsets.only(top: 5),
                              child: Text(d.note!,
                                  style: const TextStyle(
                                      fontSize: 12.5,
                                      fontWeight: FontWeight.w800,
                                      color: Color(0xFFFFD166))),
                            )
                          else if (chips.isNotEmpty)
                            Padding(
                              padding: const EdgeInsets.only(top: 5),
                              child: Wrap(spacing: 6, runSpacing: 6, children: chips),
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
    );
  }

  Widget _chip(String icon, String label) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
        decoration: BoxDecoration(
          color: const Color(0x12FFFFFF),
          border: Border.all(color: const Color(0x24FFFFFF)),
          borderRadius: BorderRadius.circular(99),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            UiIcon(icon, size: 18, color: Colors.white),
            const SizedBox(width: 5),
            Text(label,
                style: const TextStyle(
                    fontSize: 12.5,
                    fontWeight: FontWeight.w900,
                    color: Colors.white,
                    fontFeatures: [FontFeature.tabularFigures()])),
          ],
        ),
      );
}
