// Compact category-based Shop. Web parity: monthly/annual Plus and every
// deterministic cosmetic use the same server catalogue and wallet ledger.
import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../api_client.dart';
import '../../core/cosmetics.dart';
import '../../core/money.dart';
import '../../utils/fa_date.dart';
import '../../theme/tokens.dart';
import '../../widgets/app_card.dart';
import '../../widgets/async_section.dart';
import '../../services/bazaar_billing.dart';
import '../../widgets/card_box.dart';

class ShopPage extends StatefulWidget {
  final ApiClient api;
  const ShopPage({super.key, required this.api});

  @override
  State<ShopPage> createState() => _ShopPageState();
}

class _ShopPageState extends State<ShopPage> {
  late Future<dynamic> _future = widget.api.get('/api/shop?shape=items');
  String? _busy;
  String _kind = 'card_frame';
  bool _showPlans = true;

  /// سوابق خرید — مثل وب، با تپ باز/بسته می‌شود و تنبلانه از
  /// `/api/shop/history` می‌آید (فقط وقتی کاربر بخواهد، نه در هر بازشدن
  /// فروشگاه).
  bool _showHistory = false;
  bool _historyLoaded = false;
  List<Map<String, dynamic>> _history = const [];

  /// آیا اول از کیف پول کم شود؟
  ///
  /// پیش‌فرض روشن: اگر کاربر پولی در کیف پول دارد، انتظارِ طبیعی‌اش این
  /// است که همان اول خرج شود، نه اینکه دوباره از جیبش بدهد.
  /// خاموش‌کردنش یک تپ است.
  bool _useWallet = true;

  /// آخرین موجودیِ خوانده‌شده از `/api/shop`.
  ///
  /// دیالوگِ خرید باید بگوید چقدر از کیف پول می‌رود و چقدر از بازار.
  /// چون دیالوگ بیرونِ `FutureBuilder` باز می‌شود، عدد را اینجا نگه
  /// می‌داریم. عددِ نهایی همیشه سمتِ سرور دوباره حساب می‌شود.
  int _walletBalance = 0;

  static const _categories = <(String, String, IconData)>[
    ('club_badge', 'باشگاه‌ها', Icons.shield_rounded),
    ('card_frame', 'قاب‌ها', Icons.crop_portrait_rounded),
    ('name_color', 'افکت نام', Icons.auto_awesome_rounded),
    ('profile_badge', 'امضای پروفایل', Icons.workspace_premium_rounded),
    ('profile_background', 'پس‌زمینه', Icons.wallpaper_rounded),
    ('emote_pack', 'پیام‌ها', Icons.forum_rounded),
  ];

  /// خرید مستقیم از کافه‌بازار — سه گام، و گام سوم حیاتی است.
  ///
  ///   ۱. سرور سفارش pending می‌سازد و قیمت را **خودش** از دیتابیس
  ///      می‌خواند (هیچ مبلغی از این کلاینت فرستاده نمی‌شود)
  ///   ۲. Poolakey پرداخت را می‌گیرد و `purchaseToken` می‌دهد
  ///   ۳. سرور توکن را مستقیم از API کافه‌بازار راستی‌آزمایی می‌کند و
  ///      تازه بعد آیتم را تحویل می‌دهد
  ///
  /// بدون گام ۳ هر کسی با یک اپ دست‌کاری‌شده می‌توانست بگوید «خریدم» و
  /// رایگان صاحب همه‌چیز شود.
  ///
  /// ⚠️ از دورِ ۲۲ کیف پول هم می‌تواند بخشی (یا همهٔ) قیمت را بدهد.
  /// وقتی سرور `settled: true` برمی‌گرداند یعنی کالا از کیف پول تسویه
  /// شده و این تابع **نباید** صدا زده شود — باز کردنِ پنجرهٔ بازار یعنی
  /// دوباره از کاربر پول گرفتن.
  Future<dynamic> _purchase(dynamic order) async {
    final map = Map<String, dynamic>.from(order as Map);
    // کمربندِ ایمنی: اگر سرور خرید را از کیف پول تسویه کرده، هیچ سفارشی
    // برای بازار وجود ندارد.
    if (map['settled'] == true) return map;
    final orderId = '${map['orderId']}';
    final token = await BazaarBilling.purchase(
      productId: '${map['productId']}',
      payload: orderId,
    );
    return widget.api.post('/api/purchase/verify', {
      'orderId': orderId,
      'purchaseToken': token,
    });
  }

  Future<void> _reload() async {
    setState(() => _future = widget.api.get('/api/shop?shape=items'));
    try {
      await _future;
    } catch (_) {
      // AsyncSection owns the visible error state.
    }
  }

  Future<dynamic> _run(
    Future<dynamic> Function() action,
    String key,
    String success,
  ) async {
    if (_busy != null) return null;
    setState(() => _busy = key);
    try {
      final result = await action();
      if (!mounted) return result;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(success)));
      await _reload();
      return result;
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(apiError(error))));
      }
      return null;
    } finally {
      if (mounted) setState(() => _busy = null);
    }
  }

  /// باز/بستهٔ سوابق خرید؛ اولین بازشدن فهرست را از سرور می‌گیرد.
  Future<void> _toggleHistory() async {
    setState(() => _showHistory = !_showHistory);
    if (_showHistory && !_historyLoaded) {
      try {
        final res = await widget.api.get('/api/shop/history?limit=24');
        if (!mounted) return;
        setState(() {
          _history = (res is List ? res : const [])
              .whereType<Map>()
              .map((e) => Map<String, dynamic>.from(e))
              .toList();
          _historyLoaded = true;
        });
      } catch (_) {
        if (!mounted) return;
        setState(() => _historyLoaded = true); // خالی می‌ماند؛ دوباره می‌توان باز کرد
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
            content: Text('سوابق خرید در دسترس نیست — دوباره تلاش کن')));
      }
    }
  }

  Future<void> _buyPlan(Map<String, dynamic> plan) async {
    final price = (plan['price'] as num?)?.toInt() ?? 0;
    final annual = plan['billingCycle'] == 'annual';
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('خرید ${plan['label']}'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('${Money.withUnit(price)} از طریق کافه‌بازار پرداخت می‌شود.'),
            Gaps.vXs,
            Text(annual
                ? 'قاب، عنوان پروفایل و قالب نتیجهٔ سالانه دائمی هستند؛ یک فرصت تغییر باشگاه هم می‌گیری.'
                : 'دسترسی قاب‌ها و افکت نام، ستاره پلاس، Premium Pass و حذف تبلیغات برای ۳۰ روز فعال می‌شود.'),
          ],
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('انصراف')),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('پرداخت'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    await _run(
      () async => _purchase(await widget.api.post('/api/shop/plus', {
        'billingCycle': plan['billingCycle'],
      })),
      'plus-${plan['billingCycle']}',
      annual ? 'پلاس سالانه و هدیه‌های دائمی فعال شد' : 'پلاس ماهانه فعال شد',
    );
  }

  Future<void> _buyItem(Map<String, dynamic> item) async {
    final price = (item['price'] as num?)?.toInt() ?? 0;

    // ── تقسیمِ پیش‌بینی‌شده بینِ کیف پول و بازار ──
    //
    // فقط برای نمایش در دیالوگ است. سرور خودش دوباره و زیرِ قفل حساب
    // می‌کند، چون موجودی ممکن است بینِ باز شدنِ دیالوگ و زدنِ دکمه عوض
    // شده باشد.
    var wantWallet = _useWallet && _walletBalance > 0;
    final fromWallet = wantWallet ? math.min(_walletBalance, price) : 0;
    final remainder = price - fromWallet;

    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setLocal) {
          final wallet = wantWallet ? math.min(_walletBalance, price) : 0;
          final rest = price - wallet;
          return AlertDialog(
            title: Text('خرید «${item['name']}»'),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (_walletBalance > 0) ...[
                  // چک‌باکسِ کیف پول فقط وقتی معنا دارد که پولی باشد.
                  CheckboxListTile(
                    contentPadding: EdgeInsets.zero,
                    controlAffinity: ListTileControlAffinity.leading,
                    dense: true,
                    value: wantWallet,
                    onChanged: (v) {
                      setLocal(() => wantWallet = v ?? false);
                      setState(() => _useWallet = v ?? false);
                    },
                    title: const Text('اول از کیف پول کم شود',
                        style: TextStyle(
                            fontSize: 13.5, fontWeight: FontWeight.w800)),
                    subtitle: Text('موجودی: ${Money.withUnit(_walletBalance)}',
                        style: const TextStyle(fontSize: 11.5)),
                  ),
                  Gaps.vXs,
                ],
                if (wallet > 0 && rest > 0)
                  Text('${Money.withUnit(wallet)} از کیف پول و '
                      '${Money.withUnit(rest)} از کافه‌بازار پرداخت می‌شود.')
                else if (wallet > 0)
                  Text('${Money.withUnit(wallet)} کاملاً از کیف پول پرداخت '
                      'می‌شود — نیازی به کافه‌بازار نیست.')
                else
                  Text('${Money.withUnit(price)} از طریق کافه‌بازار پرداخت '
                      'می‌شود.'),
                Gaps.vXs,
                const Text(
                    'این آیتم ظاهری برای همیشه در کلکسیونت می‌ماند و هیچ قدرت رقابتی نمی‌دهد.'),
                if (item['kind'] == 'club_badge') ...[
                  Gaps.vXs,
                  const Text(
                      'خرید نشان، عضویت دائمی همان باشگاه را هم فعال می‌کند.'),
                ],
              ],
            ),
            actions: [
              TextButton(
                  onPressed: () => Navigator.pop(ctx, false),
                  child: const Text('انصراف')),
              FilledButton(
                onPressed: () => Navigator.pop(ctx, true),
                child: const Text('پرداخت'),
              ),
            ],
          );
        },
      ),
    );
    if (ok != true) return;

    // ── پیامِ موفقیت متناسب با مسیرِ واقعیِ پرداخت ──
    final settledFully = wantWallet && fromWallet >= price && remainder == 0;
    await _run(
      () async => _purchase(
        await widget.api.post('/api/shop/items/${item['id']}/buy', {
          'useWallet': wantWallet,
        }),
      ),
      'buy-${item['id']}',
      settledFully
          ? '${item['name']} با موجودی کیف پول خریداری شد'
          : '${item['name']} به کلکسیون اضافه شد',
    );
  }

  Future<void> _equip(Map<String, dynamic> item) async {
    await _run(
      () => widget.api.post('/api/shop/equip', {
        'slug': item['slug'],
        'kind': item['kind'],
      }),
      'equip-${item['id']}',
      '${item['name']} فعال شد',
    );
  }

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      onRefresh: _reload,
      child: AsyncSection<dynamic>(
        future: _future,
        onRetry: _reload,
        builder: (context, raw) {
          final data =
              raw is Map ? Map<String, dynamic>.from(raw) : <String, dynamic>{};
          final plus = data['plus'] is Map
              ? Map<String, dynamic>.from(data['plus'] as Map)
              : <String, dynamic>{};
          final plans = ((data['plans'] as List?) ?? const [])
              .whereType<Map>()
              .map((e) => Map<String, dynamic>.from(e))
              .toList();
          final items = ((data['items'] as List?) ?? const [])
              .whereType<Map>()
              .map((e) => Map<String, dynamic>.from(e))
              .toList();
          final balance = (data['walletBalance'] as num?)?.toInt() ?? 0;
          // بدونِ setState — فقط ذخیرهٔ آخرین مقدار برای دیالوگِ خرید.
          _walletBalance = balance;
          final available = _categories
              .where((c) => items.any((item) => item['kind'] == c.$1))
              .toList();
          if (!available.any((c) => c.$1 == _kind) && available.isNotEmpty) {
            WidgetsBinding.instance.addPostFrameCallback((_) {
              if (mounted) setState(() => _kind = available.first.$1);
            });
          }
          final visible = items.where((item) => item['kind'] == _kind).toList();

          return ListView(
            padding:
                const EdgeInsets.fromLTRB(Gaps.md, Gaps.sm, Gaps.md, Gaps.xxl),
            children: [
              _ShopHero(
                balance: balance,
                plus: plus,
                expanded: _showPlans,
                onToggle: () => setState(() => _showPlans = !_showPlans),
              ),
              if (_showPlans && plans.isNotEmpty) ...[
                Gaps.vSm,
                SizedBox(
                  height: MediaQuery.sizeOf(context).width < 390 ? 380 : 354,
                  child: ListView.separated(
                    scrollDirection: Axis.horizontal,
                    itemCount: plans.length,
                    separatorBuilder: (_, __) => Gaps.hSm,
                    itemBuilder: (_, index) {
                      final plan = plans[index];
                      final monthly = plans.cast<Map>().firstWhere(
                        (p) => p['billingCycle'] == 'monthly' || p['key'] == 'monthly',
                        orElse: () => <String, dynamic>{},
                      );
                      final monthlyPrice = (monthly['price'] as num?)?.toInt()
                          ?? (plus['price'] as num?)?.toInt()
                          ?? 59000;
                      return _PlanCard(
                        plan: plan,
                        activeTier: '${plus['tier'] ?? ''}',
                        busy: _busy == 'plus-${plan['billingCycle']}',
                        onBuy: () => _buyPlan(plan),
                        monthlyPrice: monthlyPrice,
                      );
                    },
                  ),
                ),
              ],
              Gaps.vSm,
              // صندوقِ کارت بالای قفسه می‌نشیند چون تنها راهِ ورود به دوئل
              // برای کسی است که کارتِ فیزیکی ندارد — آیتمِ ظاهری نیست،
              // درِ ورود است.
              //
              // دورِ ۲۸: پیش از این، صندوق بدونِ هیچ فاصله یا عنوانی بینِ
              // پلن‌های پلاس و چیپ‌های دسته‌بندی می‌نشست و چشم آن را یک
              // ردیفِ دیگر می‌خواند. حالا بخشِ خودش را دارد.
              Container(
                margin: const EdgeInsets.only(top: 6, bottom: 2),
                decoration: const BoxDecoration(
                  border: Border(
                    top: BorderSide(color: Color(0x29FFD166)),
                    bottom: BorderSide(color: Color(0x29FFD166)),
                  ),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const Padding(
                      padding: EdgeInsets.fromLTRB(5, 10, 5, 0),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.baseline,
                        textBaseline: TextBaseline.alphabetic,
                        children: [
                          Text(
                            'درِ ورود به دوئل',
                            style: TextStyle(
                              fontSize: 14.5,
                              fontWeight: FontWeight.w900,
                              color: Color(0xFFFFD166),
                            ),
                          ),
                          Spacer(),
                          Flexible(
                            child: Text(
                              'کارت فیزیکی نداری؟ از اینجا شروع کن',
                              textAlign: TextAlign.end,
                              style: TextStyle(
                                  fontSize: 10.5, color: Color(0xFF94A3B8)),
                            ),
                          ),
                        ],
                      ),
                    ),
                    CardBox(api: widget.api, onGranted: _reload),
                  ],
                ),
              ),
              SizedBox(
                height: 44,
                child: ListView.separated(
                  scrollDirection: Axis.horizontal,
                  itemCount: available.length,
                  separatorBuilder: (_, __) => Gaps.hXxs,
                  itemBuilder: (_, index) {
                    final category = available[index];
                    return ChoiceChip(
                      selected: _kind == category.$1,
                      avatar: Icon(category.$3, size: 17),
                      label: Text(category.$2),
                      onSelected: (_) => setState(() => _kind = category.$1),
                    );
                  },
                ),
              ),
              Gaps.vSm,
              _CategoryShelf(
                title: available.any((c) => c.$1 == _kind)
                    ? available.firstWhere((c) => c.$1 == _kind).$2
                    : 'فروشگاه',
                items: visible,
                busy: _busy,
                onBuy: _buyItem,
                onEquip: _equip,
              ),
              Gaps.vSm,
              const Padding(
                padding: EdgeInsets.symmetric(horizontal: 5),
                child: Text(
                  'همه قیمت‌ها تومان است. خریدهای مستقیم دائمی‌اند؛ آیتم‌ها فقط ظاهری‌اند و شانس برد یا امتیاز را تغییر نمی‌دهند.',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                      fontSize: 9.5, color: Colors.white54, height: 1.5),
                ),
              ),
              // ── سوابق خرید — آینهٔ دکمهٔ «سوابق خرید» وب ──────────────
              // تا این دور فقط وب این فهرست را داشت؛ خریدِ اندرویدی (به‌ویژه
              // از کیف پول) در هیچ‌جای اپ دیده نمی‌شد و کاربر نمی‌توانست
              // ببیند پولش صرفِ چه چیزی شده. داده از همان
              // `/api/shop/history` سرور می‌آید که وب می‌خواند.
              TextButton.icon(
                onPressed: _toggleHistory,
                icon: Icon(
                  _showHistory
                      ? Icons.keyboard_arrow_up_rounded
                      : Icons.receipt_long_rounded,
                  size: 16,
                ),
                label: Text(
                  _showHistory
                      ? 'بستن سوابق خرید'
                      : 'سوابق خرید (${_history.isEmpty && !_historyLoaded ? '…' : faNum(_history.length)})',
                ),
                style: TextButton.styleFrom(
                  foregroundColor: const Color(0xFF38BDF8),
                  textStyle: const TextStyle(
                      fontSize: 11.5, fontWeight: FontWeight.w800),
                ),
              ),
              if (_showHistory) _HistoryPanel(history: _history),
            ],
          );
        },
      ),
    );
  }
}

/// فهرست سوابق خرید — آینهٔ `historyPanel` وب: نام آیتم، مبلغ، تاریخ.
class _HistoryPanel extends StatelessWidget {
  const _HistoryPanel({required this.history});

  final List<Map<String, dynamic>> history;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    if (history.isEmpty) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 10),
        child: Text('هنوز خریدی ثبت نشده است.',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 11, color: Colors.white54)),
      );
    }
    return Container(
      margin: const EdgeInsets.only(top: 6),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.03),
        borderRadius: BorderRadius.circular(15),
        border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          for (final h in history.take(24))
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 4),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      '${h['name'] ?? ''}',
                      style: const TextStyle(
                          fontSize: 11.5, fontWeight: FontWeight.w700),
                    ),
                  ),
                  Text(
                    '${faNum(h['price_paid'] ?? 0)} تومان · ${faDate(h['purchased_at'])}',
                    style: TextStyle(
                        fontSize: 10, color: theme.colorScheme.onSurface.withValues(alpha: 0.55)),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

class _ShopHero extends StatelessWidget {
  const _ShopHero({
    required this.balance,
    required this.plus,
    required this.expanded,
    required this.onToggle,
  });
  final int balance;
  final Map<String, dynamic> plus;
  final bool expanded;
  final VoidCallback onToggle;

  @override
  Widget build(BuildContext context) {
    final active = plus['active'] == true;
    return Container(
      padding: const EdgeInsets.all(15),
      decoration: BoxDecoration(
        borderRadius: Corners.rXl,
        gradient: const LinearGradient(
          begin: Alignment.topRight,
          end: Alignment.bottomLeft,
          colors: [Color(0xFF102A43), Color(0xFF11172E), Color(0xFF35154C)],
        ),
        border:
            Border.all(color: const Color(0xFFFFD166).withValues(alpha: .35)),
        boxShadow: const [
          BoxShadow(
              color: Color(0x55000000), blurRadius: 24, offset: Offset(0, 10))
        ],
      ),
      child: Row(
        children: [
          Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: const Color(0xFFFFD166).withValues(alpha: .14),
            ),
            child: Icon(active ? Icons.star_rounded : Icons.storefront_rounded,
                color: const Color(0xFFFFD166)),
          ),
          Gaps.hSm,
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('فروشگاه قلقلی پلاس',
                    style:
                        TextStyle(fontSize: 17, fontWeight: FontWeight.w900)),
                Text(
                  active
                      ? 'پلاس ${plus['tier'] == 'annual' ? 'سالانه' : 'ماهانه'} فعال است'
                      : 'نمونه واقعی آیتم‌ها · پلاس ماهانه ${Money.withUnit((plus['price'] as num?)?.toInt() ?? 59000)}',
                  style: const TextStyle(fontSize: 10.5, color: Colors.white60),
                ),
                Gaps.vXxs,
                Row(children: [
                  Flexible(
                    child: Text('کیف پول: ${Money.withUnit(balance)}',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                            fontSize: 12.5,
                            color: Color(0xFF22E7A6),
                            fontWeight: FontWeight.w900)),
                  ),
                ]),
                // آینهٔ `shopPayNote` در وب. کاربر باید بداند این موجودی
                // خرج خرید نمی‌شود — فقط برداشت نقدی.
                Gaps.vXxs,
                const Text(
                  'پرداخت از کافه‌بازار یا با جایزهٔ نقدیِ کیف پول. کیف پول با خرید شارژ نمی‌شود.',
                  style: TextStyle(fontSize: 9.5, color: Colors.white54),
                ),
              ],
            ),
          ),
          IconButton(
            tooltip: expanded ? 'جمع کردن پلن‌ها' : 'نمایش پلن‌ها',
            onPressed: onToggle,
            icon: Icon(expanded
                ? Icons.expand_less_rounded
                : Icons.expand_more_rounded),
          ),
        ],
      ),
    );
  }
}

/// کارت پلن پلاس (ماهانه/سالانه).
class _PlanCard extends StatelessWidget {
  const _PlanCard({
    required this.plan,
    required this.activeTier,
    required this.busy,
    required this.onBuy,
    this.monthlyPrice = 59000,
  });
  final Map<String, dynamic> plan;
  final String activeTier;
  final bool busy;
  final VoidCallback onBuy;
  final int monthlyPrice;

  @override
  Widget build(BuildContext context) {
    final annual = plan['billingCycle'] == 'annual';
    final active = activeTier == plan['billingCycle'];
    final benefits =
        ((plan['benefits'] as List?) ?? const []).take(annual ? 9 : 5);
    return SizedBox(
      width: 300,
      child: AppCard(
        color: annual ? const Color(0xFF2D2340) : const Color(0xFF101D2B),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(children: [
              Expanded(
                  child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                    Text(annual ? 'بیشترین ارزش' : 'انعطاف ماهانه',
                        style: const TextStyle(
                            fontSize: 9, color: Colors.white54)),
                    Text('${plan['label']}',
                        style: const TextStyle(
                            fontSize: 15, fontWeight: FontWeight.w900)),
                  ])),
              if (annual)
                const _Pill(text: 'حدود ۳۰٪ تخفیف', color: Color(0xFFFFD166))
              else if (active)
                const _Pill(text: 'فعال', color: Color(0xFF22E7A6)),
            ]),
            Gaps.vXs,
            Text(Money.withUnit(plan['price']),
                style: const TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.w900,
                    color: Color(0xFFFFD166))),
            if (annual)
              Text('به‌جای ${Money.withUnit(monthlyPrice * 12)} پرداخت ماهانه',
                  style: const TextStyle(fontSize: 9, color: Colors.white54)),
            Gaps.vXs,
            _PlanVisuals(annual: annual),
            Gaps.vXs,
            Expanded(
              child: SingleChildScrollView(
                physics: const NeverScrollableScrollPhysics(),
                child: Wrap(
                  runSpacing: 4,
                  children: [
                    for (final benefit in benefits)
                      SizedBox(
                        width: double.infinity,
                        child: Text('✓ $benefit',
                            style: const TextStyle(
                                fontSize: 9.5,
                                height: 1.35,
                                color: Colors.white70)),
                      ),
                  ],
                ),
              ),
            ),
            FilledButton.icon(
              onPressed: busy ? null : onBuy,
              icon: busy
                  ? const SizedBox.square(
                      dimension: 15,
                      child: CircularProgressIndicator(strokeWidth: 2))
                  : const Icon(Icons.auto_awesome_rounded, size: 17),
              label: Text(active ? 'تمدید همین پلن' : 'خرید ${plan['label']}'),
              style: FilledButton.styleFrom(
                backgroundColor:
                    annual ? const Color(0xFFFFD166) : const Color(0xFF38BDF8),
                foregroundColor: const Color(0xFF071522),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _PlanVisuals extends StatelessWidget {
  const _PlanVisuals({required this.annual});
  final bool annual;

  @override
  Widget build(BuildContext context) {
    final frameKey = annual ? 'annual_royal_frame' : 'blue_fire';
    final nameKey = annual ? 'mvp_name' : 'gold_gradient';
    return Container(
      height: 56,
      padding: const EdgeInsets.all(6),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: .045),
        borderRadius: Corners.rMd,
        border: Border.all(color: Colors.white10),
      ),
      child: Row(children: [
        SizedBox(
          width: 42,
          height: 42,
          child: CosmeticAvatarFrame(
            frame: frameKey,
            padding: 2.5,
            child: ClipOval(
                child: Image.asset('assets/avatars/avatar_10_crown.webp',
                    fit: BoxFit.cover)),
          ),
        ),
        const SizedBox(width: 7),
        SizedBox(
          width: 56,
          child: AnimatedNameText(
            name: annual ? 'MVP' : 'hotcat',
            effect: nameKey,
            style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w900),
          ),
        ),
        const SizedBox(width: 7),
        Expanded(
          child: Text(
            annual ? 'قاب، نتیجه و عنوان دائمی' : 'قاب و افکت نام واقعی',
            maxLines: 2,
            style: const TextStyle(
                fontSize: 8.5,
                height: 1.35,
                color: Colors.white70,
                fontWeight: FontWeight.w800),
          ),
        ),
      ]),
    );
  }
}

class _CategoryShelf extends StatelessWidget {
  const _CategoryShelf({
    required this.title,
    required this.items,
    required this.busy,
    required this.onBuy,
    required this.onEquip,
  });
  final String title;
  final List<Map<String, dynamic>> items;
  final String? busy;
  final void Function(Map<String, dynamic>) onBuy;
  final void Function(Map<String, dynamic>) onEquip;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(11),
      decoration: BoxDecoration(
        borderRadius: Corners.rXl,
        color: const Color(0xAA071522),
        border: Border.all(color: Colors.white10),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            Expanded(
                child: Text(title,
                    style: const TextStyle(
                        fontSize: 14, fontWeight: FontWeight.w900))),
            Text('${faNum(items.length)} انتخاب · ورق بزن',
                style: const TextStyle(fontSize: 9.5, color: Colors.white54)),
          ]),
          Gaps.vXs,
          SizedBox(
            height: 280,
            child: items.isEmpty
                ? const Center(child: Text('آیتمی در این دسته نیست.'))
                : ListView.separated(
                    scrollDirection: Axis.horizontal,
                    itemCount: items.length,
                    separatorBuilder: (_, __) => Gaps.hSm,
                    itemBuilder: (_, index) {
                      final item = items[index];
                      return _ProductCard(
                        item: item,
                        busy: busy == 'buy-${item['id']}' ||
                            busy == 'equip-${item['id']}',
                        onBuy: () => onBuy(item),
                        onEquip: () => onEquip(item),
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }
}

class _ProductCard extends StatelessWidget {
  const _ProductCard({
    required this.item,
    required this.busy,
    required this.onBuy,
    required this.onEquip,
  });
  final Map<String, dynamic> item;
  final bool busy;
  final VoidCallback onBuy;
  final VoidCallback onEquip;

  @override
  Widget build(BuildContext context) {
    final usable = item['usable'] == true;
    final selected = item['equipped'] == true;
    final owned = item['owned'] == true;
    final annualGift = item['access_tier'] == 'annual';
    return SizedBox(
      width: MediaQuery.sizeOf(context).width < 500 ? 276 : 235,
      child: Container(
        clipBehavior: Clip.antiAlias,
        decoration: BoxDecoration(
          borderRadius: Corners.rXl,
          gradient: const LinearGradient(
            begin: Alignment.topRight,
            end: Alignment.bottomLeft,
            colors: [Color(0xFF17273A), Color(0xFF0B1522)],
          ),
          border: Border.all(
            color: selected ? const Color(0xFF22E7A6) : Colors.white12,
            width: selected ? 1.8 : 1,
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Expanded(child: _ProductArt(item: item)),
            Padding(
              padding: const EdgeInsets.all(10),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(children: [
                    Expanded(
                        child: Text('${item['name']}',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                                fontSize: 12.5, fontWeight: FontWeight.w900))),
                    if (selected)
                      const _Pill(text: 'فعال', color: Color(0xFF22E7A6)),
                  ]),
                  const SizedBox(height: 3),
                  Text('${item['description'] ?? ''}',
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                          fontSize: 9.5, height: 1.35, color: Colors.white54)),
                  Gaps.vXs,
                  Row(children: [
                    Expanded(
                        child: Text(
                      annualGift
                          ? 'هدیه سالانه'
                          : owned
                              ? 'خریداری‌شده'
                              : Money.withUnit(item['price']),
                      style: const TextStyle(
                          fontSize: 10.5,
                          color: Color(0xFFFFD166),
                          fontWeight: FontWeight.w900),
                    )),
                    if (usable)
                      FilledButton(
                        onPressed: busy || selected ? null : onEquip,
                        style: FilledButton.styleFrom(
                          minimumSize: const Size(68, 34),
                          padding: const EdgeInsets.symmetric(horizontal: 10),
                          visualDensity: VisualDensity.compact,
                        ),
                        child: Text(selected ? 'فعال' : 'انتخاب',
                            style: const TextStyle(fontSize: 10)),
                      )
                    else if (!annualGift)
                      FilledButton(
                        onPressed: busy ? null : onBuy,
                        style: FilledButton.styleFrom(
                          minimumSize: const Size(60, 34),
                          padding: const EdgeInsets.symmetric(horizontal: 10),
                          visualDensity: VisualDensity.compact,
                        ),
                        child: busy
                            ? const SizedBox.square(
                                dimension: 13,
                                child:
                                    CircularProgressIndicator(strokeWidth: 2))
                            : const Text('خرید',
                                style: TextStyle(fontSize: 10)),
                      )
                    else
                      const Icon(Icons.lock_rounded,
                          size: 17, color: Colors.white38),
                  ]),
                  if (item['unlockedByPlus'] == true && !owned)
                    const Text('با پلاس در دسترس است',
                        style:
                            TextStyle(fontSize: 8.5, color: Color(0xFF38BDF8))),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ProductArt extends StatelessWidget {
  const _ProductArt({required this.item});
  final Map<String, dynamic> item;

  IconData _kindIcon(String kind) => switch (kind) {
        'club_badge' => Icons.shield_outlined,
        'card_frame' => Icons.crop_portrait_rounded,
        'name_color' => Icons.title_rounded,
        'profile_badge' => Icons.workspace_premium_rounded,
        'profile_background' => Icons.wallpaper_rounded,
        'emote_pack' => Icons.chat_bubble_outline_rounded,
        _ => Icons.auto_awesome_rounded,
      };

  @override
  Widget build(BuildContext context) {
    final kind = '${item['kind']}';
    final slug = '${item['slug'] ?? ''}';
    final value = '${item['payload'] ?? slug}';
    Widget exactPreview;
    if (kind == 'card_frame') {
      exactPreview = _ShopFrameArtwork(value: value);
    } else if (kind == 'name_color') {
      exactPreview = _ShopPreviewSurface(child: _ShopNameArtwork(value: value));
    } else if (kind == 'profile_badge') {
      exactPreview =
          _ShopPreviewSurface(child: _ShopBadgeArtwork(value: value));
    } else if (kind == 'profile_background') {
      exactPreview = AnimatedProfileBackground(
        slug: value,
        child: const _ShopProfileArtwork(),
      );
    } else if (kind == 'emote_pack') {
      exactPreview = _ShopPreviewSurface(
        child: _ShopEmoteArtwork(slug: slug, metadata: item['metadata']),
      );
    } else {
      // Club marks are real purchased marks, never generated promo art.
      final path = kind == 'club_badge'
          ? clubAsset(value)
          : 'assets/shop/cosmetics/$slug.webp';
      exactPreview = Padding(
        padding:
            kind == 'club_badge' ? const EdgeInsets.all(10) : EdgeInsets.zero,
        child: Image.asset(
          path,
          fit: kind == 'club_badge' ? BoxFit.contain : BoxFit.cover,
          cacheWidth: 640,
          filterQuality: FilterQuality.medium,
          errorBuilder: (_, __, ___) => Center(
            child: Icon(_kindIcon(kind), size: 42, color: Colors.white38),
          ),
        ),
      );
    }
    return ColoredBox(color: const Color(0xFF03070D), child: exactPreview);
  }
}

class _ShopPreviewSurface extends StatelessWidget {
  const _ShopPreviewSurface({required this.child});
  final Widget child;
  @override
  Widget build(BuildContext context) => DecoratedBox(
        decoration: const BoxDecoration(
            gradient: LinearGradient(
          begin: Alignment.topRight,
          end: Alignment.bottomLeft,
          colors: [Color(0xFF13243A), Color(0xFF030712)],
        )),
        child: child,
      );
}

class _ShopFrameArtwork extends StatelessWidget {
  const _ShopFrameArtwork({required this.value});
  final String value;

  @override
  Widget build(BuildContext context) => _ShopPreviewSurface(
        child: Center(
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            SizedBox(
              width: 82,
              height: 82,
              child: CosmeticAvatarFrame(
                frame: value,
                padding: 4,
                child: ClipOval(
                    child: Image.asset(
                  'assets/avatars/avatar_10_crown.webp',
                  fit: BoxFit.cover,
                  errorBuilder: (_, __, ___) => const ColoredBox(
                      color: Color(0xFF10243A),
                      child: Icon(Icons.person_rounded)),
                )),
              ),
            ),
            Gaps.hSm,
            const Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('hotcat',
                      style:
                          TextStyle(fontSize: 18, fontWeight: FontWeight.w900)),
                  Text('همین قاب روی پروفایل و بازی',
                      style: TextStyle(fontSize: 8, color: Colors.white54)),
                ]),
          ]),
        ),
      );
}

class _ShopNameArtwork extends StatelessWidget {
  const _ShopNameArtwork({required this.value});
  final Object? value;

  @override
  Widget build(BuildContext context) => IgnorePointer(
        child: Center(
          child: AnimatedNameText(
            name: 'hotcat',
            effect: '$value',
            style: const TextStyle(
              fontSize: 24,
              fontWeight: FontWeight.w900,
              shadows: [
                Shadow(
                    color: Colors.black, blurRadius: 12, offset: Offset(0, 3))
              ],
            ),
          ),
        ),
      );
}

class _ShopBadgeArtwork extends StatelessWidget {
  const _ShopBadgeArtwork({required this.value});
  final String value;

  @override
  Widget build(BuildContext context) => Center(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          SizedBox(
            width: 58,
            height: 58,
            child: CosmeticAvatarFrame(
              frame: 'pro_holographic',
              padding: 3,
              child: ClipOval(
                  child: Image.asset('assets/avatars/avatar_10_crown.webp',
                      fit: BoxFit.cover)),
            ),
          ),
          const SizedBox(height: 6),
          DisplayName(
            name: 'hotcat',
            cosmetics: {'profileBadge': value, 'color': 'gold_gradient'},
            style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w900),
          ),
          const SizedBox(height: 3),
          const Text('همین امضا در پروفایل، چت، لیگ و بازی',
              style: TextStyle(fontSize: 7.5, color: Colors.white54)),
        ]),
      );
}

class _ShopProfileArtwork extends StatelessWidget {
  const _ShopProfileArtwork();

  @override
  Widget build(BuildContext context) => Center(
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 9),
          decoration: BoxDecoration(
            color: const Color(0x99020617),
            borderRadius: Corners.rLg,
            border: Border.all(color: Colors.white24),
          ),
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            ClipOval(
                child: Image.asset('assets/avatars/avatar_10_crown.webp',
                    width: 52, height: 52, fit: BoxFit.cover)),
            Gaps.hSm,
            const Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('hotcat',
                      style:
                          TextStyle(fontSize: 15, fontWeight: FontWeight.w900)),
                  Text('پروفایل بازیکن',
                      style: TextStyle(fontSize: 8, color: Colors.white60)),
                ]),
          ]),
        ),
      );
}

class _ShopEmoteArtwork extends StatelessWidget {
  const _ShopEmoteArtwork({required this.slug, required this.metadata});
  final String slug;
  final Object? metadata;

  List<String> get messages {
    if (metadata is Map && (metadata as Map)['messages'] is List) {
      return ((metadata as Map)['messages'] as List)
          .take(2)
          .map((e) => '$e')
          .toList();
    }
    return switch (slug) {
      'emote_respect' => const ['بازی خوبی بود', 'دوباره؟'],
      'emote_comeback' => const ['این یکی شانسی بود!', 'آماده جبران باش'],
      _ => const ['گوووول!', 'باشگاه من همیشه آماده‌ست!'],
    };
  }

  @override
  Widget build(BuildContext context) => IgnorePointer(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 44, vertical: 20),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              for (int i = 0; i < messages.length; i++)
                Align(
                  alignment:
                      i == 0 ? Alignment.centerRight : Alignment.centerLeft,
                  child: Container(
                    constraints: const BoxConstraints(maxWidth: 160),
                    margin: const EdgeInsets.only(bottom: 7),
                    padding:
                        const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                    decoration: BoxDecoration(
                      color: i == 0
                          ? const Color(0xFFF8FAFC)
                          : const Color(0xFFFFD166),
                      borderRadius: BorderRadius.only(
                        topLeft: const Radius.circular(13),
                        topRight: const Radius.circular(13),
                        bottomLeft: Radius.circular(i == 0 ? 13 : 3),
                        bottomRight: Radius.circular(i == 0 ? 3 : 13),
                      ),
                      boxShadow: const [
                        BoxShadow(
                            color: Color(0x88000000),
                            blurRadius: 12,
                            offset: Offset(0, 5))
                      ],
                    ),
                    child: Text(messages[i],
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                            fontSize: 8.5,
                            color: Color(0xFF0F172A),
                            fontWeight: FontWeight.w900)),
                  ),
                ),
            ],
          ),
        ),
      );
}

class _Pill extends StatelessWidget {
  const _Pill({required this.text, required this.color});
  final String text;
  final Color color;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
        decoration: BoxDecoration(
          color: color.withValues(alpha: .15),
          borderRadius: Corners.rPill,
          border: Border.all(color: color.withValues(alpha: .35)),
        ),
        child: Text(text,
            style: TextStyle(
                fontSize: 8.5, fontWeight: FontWeight.w900, color: color)),
      );
}
