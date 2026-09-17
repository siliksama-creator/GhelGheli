import 'dart:async';

import 'package:flutter/material.dart';

import '../api_client.dart';
import '../theme/tokens.dart';
import 'ui_icon.dart';

// ═══════════════════════════════════════════════════════════════════════════
// شماره معکوسِ شروعِ لیگ — کارتِ مشترکِ اندروید
// ═══════════════════════════════════════════════════════════════════════════
//
// ── خواستهٔ مالک (۲۷ شهریور) ────────────────────────────────────────────────
//
// «شماره معکوس در قسمتِ لیگ یا بازیِ آنلاین یا بازیِ ضربه‌زن نمایش داده
// بشه... خیلی زیبا... متنش هم از پنل قابلِ تغییر باشه.»
//
// ── قاعدهٔ بستن: «هرچه سکه می‌دهد»، نه «هرچه آنلاین است» ───────────────────
//
// بسته ← بازیِ سریعِ آنلاین (سهم‌دار)، ساختِ/پیوستنِ لابیِ عمومی، ضربه‌زن.
// باز  ← اتاقِ خصوصی (سهمِ صفر ⇒ فقط امتیاز) و بازی با ربات.
//
// تصمیم در سرور گرفته می‌شود (`services/leagueCountdown.js`). این فایل فقط
// همان تصمیم را نشان می‌دهد و دکمه‌های بی‌فایده را غیرفعال می‌کند تا کاربر
// با کلیک به خطا نخورد.
//
// ── چرا یک «مخزن» جدا از ویجت ──────────────────────────────────────────────
//
// سه صفحه این کارت را نشان می‌دهند و دو صفحهٔ دیگر (هابِ بازی و شیتِ لابی) فقط
// می‌خواهند **بدانند** قفل است یا نه. اگر هر کدام درخواستِ خودش را می‌زد،
// رفتن بین تب‌ها یعنی چند بار همان داده در شبکه. پس یک `ValueNotifier` مشترک
// هست: اولین صفحه تازه‌سازی می‌کند، بقیه فقط گوش می‌دهند.
//
// ⚠️ ساعتِ مرجع از سرور می‌آید (`serverNow`) و اختلاف با ساعتِ گوشی یک‌بار
// حساب می‌شود؛ وگرنه روی گوشی‌ای که ساعتش جلوست کارتِ تمام‌شده دیده می‌شد.

class LeagueCountdownStore {
  LeagueCountdownStore._();

  static final LeagueCountdownStore instance = LeagueCountdownStore._();

  /// آخرین پاسخِ سرور. `null` یعنی هنوز نرسیده ⇒ هیچ‌چیز قفل نمی‌شود.
  final ValueNotifier<Map<String, dynamic>?> state =
      ValueNotifier<Map<String, dynamic>?>(null);

  DateTime? _fetchedAt;
  Future<void>? _inflight;
  Duration _skew = Duration.zero;
  ApiClient? _lastApi;

  static const Duration _ttl = Duration(seconds: 60);

  /// تازه‌سازی از سرور. `force: false` یعنی «اگر کمتر از یک دقیقه است، نرو».
  Future<void> refresh(ApiClient api, {bool force = false}) async {
    // سوییچِ کلاینت = سوییچِ محیط (کاربرِ دیگر، سرورِ دیگر، تستِ بعدی).
    // در آن حالت کشِ قبلی بی‌اعتبار است و فوراً تازه می‌شود؛ وگرنه ممکن بود
    // وضعیتِ «قفل» یک نشست به نشستِ بعدی سرایت کند.
    final switched = !identical(_lastApi, api);
    _lastApi = api;
    final at = _fetchedAt;
    if (!force && !switched && at != null && DateTime.now().difference(at) < _ttl) {
      return;
    }
    final running = _inflight;
    if (running != null) return running;

    final future = () async {
      try {
        final res = await api.get('/api/league/countdown', fresh: true);
        if (res is! Map) return;
        final map = Map<String, dynamic>.from(res);
        final serverNow = DateTime.tryParse('${map['serverNow'] ?? ''}');
        if (serverNow != null) _skew = serverNow.difference(DateTime.now());
        _fetchedAt = DateTime.now();
        state.value = map;
      } catch (_) {
        // شبکه لرزید؟ مقدارِ قبلی می‌ماند و «نمی‌دانم» به «قفل کن» ترجمه
        // نمی‌شود. سرور در هر صورت تصمیمِ نهایی را دارد.
      } finally {
        _inflight = null;
      }
    }();

    _inflight = future;
    return future;
  }

  bool get active => state.value?['active'] == true;

  /// مسیرهای سکه‌ای: بازیِ سریع و لابیِ عمومی.
  bool get blocksOnline {
    final blocks = state.value?['blocks'];
    return blocks is Map && blocks['online'] == true;
  }

  /// ضربه‌زن.
  bool get blocksTap {
    final blocks = state.value?['blocks'];
    return blocks is Map && blocks['tap'] == true;
  }

  String get message => '${state.value?['message'] ?? ''}'.trim();

  /// زمانِ باقی‌مانده بر اساس ساعتِ تصحیح‌شده با سرور.
  Duration get left {
    final starts = DateTime.tryParse('${state.value?['startsAt'] ?? ''}');
    if (starts == null) return Duration.zero;
    final ms = starts.difference(DateTime.now().add(_skew)).inMilliseconds;
    return ms > 0 ? Duration(milliseconds: ms) : Duration.zero;
  }
}

// کارتِ شماره معکوس — در سه صفحه استفاده می‌شود.
//
// ⚠️ اگر فعال نباشد **هیچ‌چیز** نمی‌سازد (`SizedBox.shrink`)، پس نه فاصله‌ای
// می‌گیرد و نه کارتِ تمام‌شده‌ای می‌ماند. همان «پنهان‌شدنِ خودکار» بعد از
// رسیدن به صفر.
class LeagueCountdownCard extends StatefulWidget {
  const LeagueCountdownCard({super.key, required this.api, this.compact = false});

  final ApiClient api;

  /// نسخهٔ جمع‌وجور — برای صفحهٔ ضربه‌زن که بالای صفحه شلوغ‌تر است.
  final bool compact;

  @override
  State<LeagueCountdownCard> createState() => _LeagueCountdownCardState();
}

class _LeagueCountdownCardState extends State<LeagueCountdownCard> {
  Timer? _ticker;
  bool _zeroRefreshed = false;

  @override
  void initState() {
    super.initState();
    LeagueCountdownStore.instance.state.addListener(_syncTicker);
    LeagueCountdownStore.instance.refresh(widget.api);
    _syncTicker();
  }

  /// تیکر **فقط** وقتی می‌چرخد که شمارشی در جریان باشد.
  ///
  /// ⚠️ این شرط حیاتی است، نه بهینه‌سازیِ ساده: یک تایمرِ دوره‌ایِ همیشه‌روشن
  ///    باعث می‌شود در تست‌های ویجتِ پروژه `pumpAndSettle` هرگز آرام نگیرد
  ///    (هر ثانیه یک فریمِ تازه) و تست با تایم‌اوت قرمز شود. تا وقتی سرور
  ///    نگفته «فعال است»، هیچ تایمری ساخته نمی‌شود؛ و با باتریِ کاربر هم
  ///    مهربان‌تر است.
  void _syncTicker() {
    final active = LeagueCountdownStore.instance.state.value?['active'] == true;
    if (active && _ticker == null) {
      _ticker = Timer.periodic(const Duration(seconds: 1), (_) {
        if (!mounted) return;
        setState(() {});
        _maybeRefreshAtZero();
      });
    } else if (!active && _ticker != null) {
      _ticker!.cancel();
      _ticker = null;
    }
  }

  /// رسیدن به صفر ⇒ یک‌بار از سرور بپرس تا بگوید باز شد. بعد از آن پاسخ،
  /// `active` غلط می‌شود و کارت خودش ناپدید می‌گردد.
  void _maybeRefreshAtZero() {
    final store = LeagueCountdownStore.instance;
    if (store.active && store.left == Duration.zero && !_zeroRefreshed) {
      _zeroRefreshed = true;
      store.refresh(widget.api, force: true);
    }
  }

  @override
  void dispose() {
    LeagueCountdownStore.instance.state.removeListener(_syncTicker);
    _ticker?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final store = LeagueCountdownStore.instance;
    return ValueListenableBuilder<Map<String, dynamic>?>(
      valueListenable: store.state,
      builder: (context, data, _) {
        if (data == null || data['active'] != true) return const SizedBox.shrink();
        final left = store.left;
        if (left == Duration.zero) return const SizedBox.shrink();

        final total = () {
          final starts = DateTime.tryParse('${data['startsAt'] ?? ''}');
          final now = DateTime.tryParse('${data['serverNow'] ?? ''}');
          if (starts == null || now == null) return const Duration(hours: 1);
          final span = starts.difference(now);
          return span.inMilliseconds > 0 ? span : const Duration(hours: 1);
        }();
        // `.toDouble()` لازم است: `clamp` روی اعداد، نوعِ num برمی‌گرداند و
        // به `value` که double می‌خواهد نسبت داده نمی‌شود.
        final pct =
            (1 - left.inMilliseconds / total.inMilliseconds).clamp(0.0, 1.0).toDouble();

        final days = left.inDays;
        final hours = left.inHours % 24;
        final minutes = left.inMinutes % 60;
        final seconds = left.inSeconds % 60;

        return Padding(
          padding: widget.compact
              ? const EdgeInsets.only(bottom: Gaps.xs)
              : const EdgeInsets.only(bottom: Gaps.sm),
          child: Container(
            padding: widget.compact
                ? const EdgeInsets.fromLTRB(Gaps.sm, Gaps.xs, Gaps.sm, Gaps.xs)
                : const EdgeInsets.fromLTRB(Gaps.md, Gaps.sm, Gaps.md, Gaps.sm),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(Corners.lg),
              border: Border.all(color: const Color(0x66FFD166)),
              gradient: const LinearGradient(
                begin: Alignment.topRight,
                end: Alignment.bottomLeft,
                colors: [Color(0xFF1A2A4E), Color(0xFF0C1830), Color(0xFF2A163A)],
                stops: [0, 0.46, 1],
              ),
              boxShadow: const [
                BoxShadow(color: Color(0x66000000), blurRadius: 20, offset: Offset(0, 10)),
              ],
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  children: [
                    Container(
                      width: widget.compact ? 32 : 36,
                      height: widget.compact ? 32 : 36,
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(Corners.sm),
                        gradient: const LinearGradient(
                          colors: [Color(0xFFFFD166), Color(0xFFF59E0B)],
                        ),
                      ),
                      child: const Center(
                        child: UiIcon('clock', size: 18, color: Color(0xFF21160A)),
                      ),
                    ),
                    Gaps.hXs,
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            '${data['title'] ?? ''}',
                            style: TextStyle(
                              color: Colors.white,
                              fontSize: widget.compact ? 14 : 15.5,
                              fontWeight: FontWeight.w900,
                            ),
                          ),
                          if ('${data['subtitle'] ?? ''}'.isNotEmpty)
                            Padding(
                              padding: const EdgeInsets.only(top: 2),
                              child: Text(
                                '${data['subtitle']}',
                                style: const TextStyle(
                                  color: Color(0xFFB9CBE0),
                                  fontSize: 12.5,
                                  height: 1.5,
                                ),
                              ),
                            ),
                        ],
                      ),
                    ),
                  ],
                ),
                Gaps.vSm,
                Row(
                  children: [
                    _box(days, 'روز'),
                    Gaps.hXs,
                    _box(hours, 'ساعت'),
                    Gaps.hXs,
                    _box(minutes, 'دقیقه'),
                    Gaps.hXs,
                    _box(seconds, 'ثانیه'),
                  ],
                ),
                Gaps.vSm,
                ClipRRect(
                  borderRadius: BorderRadius.circular(Corners.pill),
                  child: LinearProgressIndicator(
                    value: pct,
                    minHeight: 8,
                    backgroundColor: const Color(0x1AFFFFFF),
                    valueColor: const AlwaysStoppedAnimation(Color(0xFFFFD166)),
                  ),
                ),
                if (_startLabel(data).isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: Gaps.xs),
                    child: Text(
                      _startLabel(data),
                      style: const TextStyle(
                        color: Color(0xFFCFE0F2),
                        fontSize: 12.5,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ),
                if (!widget.compact && '${data['note'] ?? ''}'.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: Gaps.xxs),
                    child: Text(
                      '${data['note']}',
                      style: const TextStyle(
                        color: Color(0xFF93A7BD),
                        fontSize: 12,
                        height: 1.6,
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

  /// «شروعِ لیگ: ۱۴۰۵/۶/۲۷، ساعت ۲۰:۳۰» — با رقم‌های فارسیِ خودِ اپ.
  String _startLabel(Map<String, dynamic> data) {
    final starts = DateTime.tryParse('${data['startsAt'] ?? ''}');
    if (starts == null) return '';
    final local = starts.toLocal();
    String two(int n) => n.toString().padLeft(2, '0');
    return 'شروعِ لیگ: ${faNum(local.year)}/${faNum(two(local.month))}/${faNum(two(local.day))}'
        '، ساعت ${faNum(two(local.hour))}:${faNum(two(local.minute))}';
  }

  Widget _box(int value, String label) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: Gaps.xs, horizontal: 2),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(Corners.sm),
          color: const Color(0x14FFFFFF),
          border: Border.all(color: const Color(0x1FFFFFFF)),
        ),
        child: Column(
          children: [
            Text(
              faNum(value.toString().padLeft(2, '0')),
              style: TextStyle(
                color: Colors.white,
                fontSize: widget.compact ? 19 : 22,
                fontWeight: FontWeight.w900,
                height: 1.1,
              ),
            ),
            Text(
              label,
              style: const TextStyle(
                color: Color(0xFF9FB4CC),
                fontSize: 12,
                fontWeight: FontWeight.w800,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
