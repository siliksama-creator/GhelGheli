import 'package:flutter/material.dart';

import '../../api_client.dart';
import '../../theme/tokens.dart';
import '../../utils/fa_date.dart';
import '../../widgets/app_card.dart';

/// ═══════════════════════════════════════════════════════════════════════════
/// دفتر امتیازات — صفحهٔ مستقل، از «بیشتر» باز می‌شود
/// ═══════════════════════════════════════════════════════════════════════════
///
/// ── دو خواستهٔ مالک که این صفحه پاسخ می‌دهد (۱۷ شهریور) ──────────────────
///
///   ۱. «دفتر امتیاز در پروفایل بود؛ جای درستش «بیشتر» است.»
///      قبلاً دو ردیف آخرِ پروفایل بود: کاربر باید تا ته صفحهٔ ویرایشِ
///      اطلاعات شخصی اسکرول می‌کرد تا مالی‌ترین دادهٔ خودش را ببیند.
///      حالا یک مقصدِ نام‌دار در شیتِ «بیشتر» است.
///
///   ۲. «قابلیت صفحه‌بندی داشته باشد که پشت‌سرهم اسکرول نشود.»
///      نسخهٔ قبلی ۲۰ ردیفِ اول از ۳۰ ردیفِ دریافتی را نشان می‌داد و
///      **بقیه هیچ‌وقت دیده نمی‌شد** (`take(20)` روی فهرستی که یک‌بار
///      گرفته شده بود). حالا صفحه‌به‌صفحه از سرور می‌آید: هر بار ۲۰ ردیف،
///      با دکمهٔ «بیشتر نشان بده» و شمارِ کل در سربرگ.
///
/// ── چرا دو دفتر در یک صفحه ─────────────────────────────────────────────
///
/// امتیاز و سکه دو اقتصادِ جدا هستند (سکه فقط داخلِ لیگِ فعال معنا دارد و
/// پایانِ هر لیگ صفر می‌شود) ولی سؤالِ کاربر یکی است: «این عدد از کجا آمد
/// و کجا رفت؟» دو صفحهٔ جدا یعنی کاربر باید بداند کدام سؤالش کدام دفتر است.
/// یک صفحه با دو بخش، هر دو را کنار هم می‌گذارد.
///
/// ⚠️ هر دو مسیر از قبل در سرور بودند (`/api/points/history` و
///    `/api/coins/history`) و هر دو `limit/offset` می‌گیرند؛ این صفحه
///    فقط آن‌ها را صفحه‌به‌صفحه می‌خواند.
/// برچسبِ فارسیِ منبعِ هر ردیفِ امتیاز — کلیدها با CHECK مایگریشنِ ۰۴۵ و
/// با نقشهٔ پنل ادمین یکی است.
const Map<String, String> _pointSourceFa = {
  'photo_card': 'ثبت کارت با عکس',
  'card_code': 'ثبت کارت با کد',
  'referral': 'کمیسیون معرفی',
  'game': 'بازی',
  'pass_reward': 'گذر نبرد',
  'wheel': 'گردونهٔ شانس',
  'reward_claim': 'دریافت جایزه',
  'admin_adjust': 'تنظیم مدیر',
  'admin_deduct': 'کسر مدیر',
  'signup_gift': 'هدیهٔ عضویت',
  'mission': 'ماموریت',
  'card_box': 'جعبهٔ کارت',
  'league_perk': 'مزیت لیگ',
  'other': 'سایر',
};

/// هر بار چند ردیف از سرور بیاید. ۲۰ = یک صفحهٔ راحت روی گوشیِ متوسط.
const int _pageSize = 20;

class PointsLedgerPage extends StatefulWidget {
  const PointsLedgerPage({super.key, required this.api});

  final ApiClient api;

  @override
  State<PointsLedgerPage> createState() => _PointsLedgerPageState();
}

class _PointsLedgerPageState extends State<PointsLedgerPage> {
  /// ۰ = امتیاز، ۱ = سکه
  int _tab = 0;

  final List<Map<String, dynamic>> _rows = [];
  Map<String, dynamic> _totals = const {};
  int _total = 0;
  bool _loading = true;
  bool _loadingMore = false;
  bool _hasMore = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _reload();
  }

  String get _path => _tab == 0 ? '/api/points/history' : '/api/coins/history';

  /// خواندنِ یک صفحه. `reset = true` یعنی از ابتدا (تغییرِ بخش یا تلاشِ دوباره).
  Future<void> _reload({bool more = false}) async {
    if (more && (_loadingMore || !_hasMore)) return;
    setState(() {
      if (more) {
        _loadingMore = true;
      } else {
        _loading = true;
        _error = null;
      }
    });
    final offset = more ? _rows.length : 0;
    try {
      final res = await widget.api
          .get('$_path?limit=$_pageSize&offset=$offset', fresh: true);
      if (!mounted) return;
      final map = res is Map ? Map<String, dynamic>.from(res) : <String, dynamic>{};
      final fresh = (map['transactions'] as List? ?? const [])
          .whereType<Map>()
          .map((e) => Map<String, dynamic>.from(e))
          .toList();

      // شکلِ پاسخِ دو مسیر کمى فرق دارد: امتیاز جمعِ کل را در
      // `summary.totals` می‌دهد و سکه در `totals`. هر دو اینجا یکی می‌شوند.
      final summary = map['summary'] is Map
          ? Map<String, dynamic>.from(map['summary'] as Map)
          : const <String, dynamic>{};
      final totals = summary['totals'] is Map
          ? Map<String, dynamic>.from(summary['totals'] as Map)
          : (map['totals'] is Map
              ? Map<String, dynamic>.from(map['totals'] as Map)
              : const <String, dynamic>{});
      final page = map['page'] is Map
          ? Map<String, dynamic>.from(map['page'] as Map)
          : const <String, dynamic>{};

      setState(() {
        if (more) {
          _rows.addAll(fresh);
        } else {
          _rows
            ..clear()
            ..addAll(fresh);
        }
        _totals = totals;
        _total = (page['total'] as num?)?.toInt() ?? _rows.length;
        // اگر سرور `page` نفرستد (نسخهٔ قدیمی)، از پرشدگیِ صفحه نتیجه می‌گیریم.
        _hasMore = page['hasMore'] is bool
            ? page['hasMore'] as bool
            : fresh.length >= _pageSize;
        _loading = false;
        _loadingMore = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _loadingMore = false;
        if (!more) _error = apiError(e);
      });
    }
  }

  void _switchTab(int tab) {
    if (tab == _tab) return;
    setState(() {
      _tab = tab;
      _rows.clear();
      _totals = const {};
      _total = 0;
      _hasMore = false;
    });
    _reload();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    if (_loading) return const Center(child: CircularProgressIndicator());

    return RefreshIndicator(
      onRefresh: () => _reload(),
      child: ListView(
        padding: const EdgeInsets.all(Gaps.sm),
        children: [
          SegmentedButton<int>(
            segments: const [
              ButtonSegment<int>(value: 0, label: Text('امتیاز'), icon: Icon(Icons.stars_rounded, size: 16)),
              ButtonSegment<int>(value: 1, label: Text('سکه'), icon: Icon(Icons.paid_rounded, size: 16)),
            ],
            selected: {_tab},
            showSelectedIcon: false,
            onSelectionChanged: (s) => _switchTab(s.first),
          ),
          Gaps.vSm,
          if (_error != null) ...[
            AppCard(
              padding: const EdgeInsets.all(12),
              child: Text(_error!,
                  style: const TextStyle(color: Color(0xFFFF8A8A), fontSize: 12.5)),
            ),
            Gaps.vXs,
          ],
          AppCard(
            padding: const EdgeInsets.all(12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(children: [
                  Icon(
                    _tab == 0 ? Icons.stars_rounded : Icons.paid_rounded,
                    color: _tab == 0 ? const Color(0xFF84CC16) : const Color(0xFFFFD166),
                    size: 18,
                  ),
                  Gaps.hXs,
                  Expanded(
                    child: Text(
                      _tab == 0 ? 'دفتر امتیازهای من' : 'دفتر سکه‌های من',
                      style: theme.textTheme.titleSmall
                          ?.copyWith(fontWeight: FontWeight.w800),
                    ),
                  ),
                  Text('${faNum(_total)} ردیف',
                      style: const TextStyle(fontSize: 10.5, color: Color(0xFF94A3B8), fontWeight: FontWeight.w700)),
                ]),
                if (_totals.isNotEmpty) ...[
                  const SizedBox(height: 6),
                  Text(
                    'کسب ${faNum(_totals['earned'] ?? 0)} · خرج ${faNum(_totals['spent'] ?? 0)}',
                    style: const TextStyle(fontSize: 11, color: Color(0xFFB6C6D8), fontWeight: FontWeight.w700),
                  ),
                ],
                // چرا این جمله اینجاست: پایانِ هر لیگ سکه‌ها صفر می‌شود. بدونِ
                // توضیح، کاربر فکر می‌کند سکه‌اش را خورده‌اند.
                if (_tab == 1) ...[
                  const SizedBox(height: 6),
                  const Text(
                    'سکه فقط تا پایانِ لیگ اعتبار دارد؛ درصدی از آن به فصلِ بعد منتقل می‌شود.',
                    style: TextStyle(fontSize: 10.5, color: Color(0xFF94A3B8), height: 1.5),
                  ),
                ],
              ],
            ),
          ),
          Gaps.vSm,
          if (_rows.isEmpty)
            AppCard(
              padding: const EdgeInsets.all(16),
              child: Text(
                _tab == 0
                    ? 'هنوز امتیازی ثبت نشده است. با ماموریت‌ها و بازی‌ها شروع کن.'
                    : 'هنوز سکه‌ای ثبت نشده است. در لیگِ فعال بازی کن تا سکه بگیری.',
                style: const TextStyle(fontSize: 12, color: Color(0xFFB6C6D8), height: 1.6),
              ),
            )
          else
            AppCard(
              padding: const EdgeInsets.all(10),
              child: Column(
                children: [
                  for (var i = 0; i < _rows.length; i++) ...[
                    if (i > 0)
                      Divider(height: 12, color: Colors.white.withValues(alpha: .06)),
                    _LedgerRow(tx: _rows[i], coin: _tab == 1),
                  ],
                ],
              ),
            ),
          if (_hasMore) ...[
            Gaps.vSm,
            SizedBox(
              height: 42,
              child: FilledButton.tonal(
                onPressed: _loadingMore ? null : () => _reload(more: true),
                child: Text(_loadingMore ? 'در حال آوردن…' : 'بیشتر نشان بده'),
              ),
            ),
          ],
          Gaps.vLg,
        ],
      ),
    );
  }
}

/// یک ردیفِ دفتر — برای امتیاز و سکه مشترک است، فقط برچسبِ منبع فرق دارد.
class _LedgerRow extends StatelessWidget {
  const _LedgerRow({required this.tx, required this.coin});

  final Map<String, dynamic> tx;
  final bool coin;

  @override
  Widget build(BuildContext context) {
    final delta = (tx['delta'] as num?)?.toInt() ?? 0;
    final positive = delta >= 0;
    final source = '${tx['source'] ?? ''}';
    final label = coin
        ? '${tx['sourceLabel'] ?? source}'
        : (_pointSourceFa[source] ?? source);
    final desc = '${tx['description'] ?? ''}'.trim();
    final balance = (tx['balanceAfter'] as num?)?.toInt();

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 7,
            height: 7,
            margin: const EdgeInsets.only(top: 6),
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: positive ? const Color(0xFF84CC16) : const Color(0xFFEF4444),
            ),
          ),
          Gaps.hXs,
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  desc.isEmpty ? label : desc,
                  style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, height: 1.45),
                ),
                Text(
                  // موجودیِ بعد از تغییر: پاسخ به «آن موقع چقدر داشتم؟»
                  coin && balance != null
                      ? '$label · ${faDate(tx['created_at'])} · موجودی ${faNum(balance)}'
                      : '$label · ${faDate(tx['created_at'])}',
                  style: const TextStyle(fontSize: 10, color: Color(0xFF94A3B8), height: 1.5),
                ),
              ],
            ),
          ),
          Gaps.hXs,
          Text(
            '${positive ? '+' : ''}${faNum(delta)}',
            style: TextStyle(
              fontSize: 12.5,
              fontWeight: FontWeight.w900,
              color: positive ? const Color(0xFF84CC16) : const Color(0xFFEF4444),
            ),
          ),
        ],
      ),
    );
  }
}
