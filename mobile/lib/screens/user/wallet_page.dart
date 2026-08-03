import 'package:flutter/material.dart';

import '../../api_client.dart';
import '../../core/money.dart';
import '../../theme/colors.dart';
import '../../theme/tokens.dart';
import '../../widgets/app_card.dart';
import '../../widgets/section_header.dart';
import '../../widgets/state_views.dart';
import 'wallet/bank_card_sheet.dart';
import 'wallet/wallet_widgets.dart';
import 'wallet/withdraw_sheet.dart';

/// ---------------------------------------------------------------------------
///  صفحهٔ کیف پول تومانی
/// ---------------------------------------------------------------------------
///
/// سه بخش: کارت موجودی، دکمهٔ برداشت (با دلیل صریح وقتی غیرفعال است)، و دو
/// تب «تراکنش‌ها / برداشت‌ها».
///
/// نکتهٔ طراحی: وقتی کاربر نمی‌تواند برداشت کند، دکمه فقط خاکستری نمی‌شود —
/// دقیقاً می‌گوید چرا و راه حلش چیست (ثبت کارت، رسیدن به حداقل مبلغ و ...).
/// دلیل را سرور محاسبه می‌کند تا کلاینت و سرور هرگز دو حرف مختلف نزنند.
class WalletPage extends StatefulWidget {
  final ApiClient api;
  final Future<void> Function()? reloadProfile;

  const WalletPage({super.key, required this.api, this.reloadProfile});

  @override
  State<WalletPage> createState() => _WalletPageState();
}

class _WalletPageState extends State<WalletPage>
    with SingleTickerProviderStateMixin {
  late final TabController _tabs = TabController(length: 2, vsync: this);

  Map? _wallet;
  List _transactions = [];
  List _withdrawals = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    // ارتفاع ناحیهٔ تب‌ها به تب فعال بستگی دارد، پس با هر تعویض تب باید
    // دوباره ساخته شود؛ بدون این شنونده، تبِ برداشت‌ها ارتفاع تبِ
    // تراکنش‌ها را می‌گیرد و محتوایش بریده می‌شود.
    _tabs.addListener(() {
      if (mounted && !_tabs.indexIsChanging) setState(() {});
    });
    _load();
  }

  @override
  void dispose() {
    _tabs.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      // هر سه درخواست موازی، نه پشت سر هم: کاربر منتظر مجموع سه رفت‌وبرگشت
      // نمی‌ماند، فقط منتظر کندترینشان.
      final results = await widget.api.getAll([
        '/api/wallet',
        '/api/wallet/transactions?limit=50',
        '/api/wallet/withdrawals',
      ]);
      if (!mounted) return;
      setState(() {
        _wallet = Map<String, dynamic>.from(results[0]);
        _transactions = results[1] as List;
        _withdrawals = results[2] as List;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = apiError(e);
        _loading = false;
      });
    }
  }

  Future<void> _openBankCard() async {
    final saved = await BankCardSheet.show(
        context, widget.api, _wallet?['card'] as Map?);
    if (saved == true) {
      _toast('کارت بانکی ذخیره شد');
      await _load();
      await widget.reloadProfile?.call();
    }
  }

  Future<void> _openWithdraw() async {
    final w = _wallet;
    if (w == null) return;

    // اگر برداشت ممکن نیست، به‌جای یک دکمهٔ مردهٔ بی‌توضیح، دلیل را نشان بده
    // و اگر راه‌حلش ثبت کارت است، همان‌جا میان‌بر بگذار.
    if (w['canWithdraw'] != true) {
      final needsCard = w['card'] == null;
      final action = await showDialog<bool>(
        context: context,
        builder: (c) => AlertDialog(
          icon: Icon(needsCard ? Icons.add_card_rounded : Icons.info_outline_rounded,
              color: BrandColors.warning, size: 32),
          title: const Text('امکان برداشت نیست'),
          content: Text('${w['blockReason'] ?? 'در حال حاضر امکان برداشت وجود ندارد'}'),
          actions: [
            TextButton(
                onPressed: () => Navigator.pop(c, false),
                child: const Text('باشه')),
            if (needsCard)
              FilledButton(
                  onPressed: () => Navigator.pop(c, true),
                  child: const Text('ثبت کارت بانکی')),
          ],
        ),
      );
      if (action == true) await _openBankCard();
      return;
    }

    final settings = Map<String, dynamic>.from(w['settings'] ?? {});
    final done = await WithdrawSheet.show(
      context,
      api: widget.api,
      balance: (w['balance'] as num).toInt(),
      minWithdrawal: (settings['minWithdrawal'] as num?)?.toInt() ?? 50000,
      maxWithdrawal: (settings['maxWithdrawal'] as num?)?.toInt() ?? 50000000,
      card: Map<String, dynamic>.from(w['card']),
      note: settings['note'] as String?,
    );
    if (done == true) {
      _toast('درخواست برداشت ثبت شد');
      _tabs.animateTo(1);
      await _load();
      await widget.reloadProfile?.call();
    }
  }

  Future<void> _cancel(Map request) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: const Text('لغو درخواست برداشت؟'),
        content: Text(
            '${Money.withUnit(request['amount'])} به کیف پول شما برمی‌گردد.'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(c, false),
              child: const Text('نه، بماند')),
          FilledButton(
            onPressed: () => Navigator.pop(c, true),
            style: FilledButton.styleFrom(backgroundColor: BrandColors.danger),
            child: const Text('لغو کن'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await widget.api
          .post('/api/wallet/withdrawals/${request['id']}/cancel', {});
      _toast('درخواست لغو شد و مبلغ برگشت');
      await _load();
      await widget.reloadProfile?.call();
    } catch (e) {
      _toast(apiError(e));
    }
  }

  void _toast(String m) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(m)));
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const LoadingView();
    if (_error != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(Gaps.lg),
          child: ErrorBanner(message: _error!, onRetry: _load),
        ),
      );
    }

    final w = _wallet!;
    final canWithdraw = w['canWithdraw'] == true;

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(Gaps.lg, Gaps.md, Gaps.lg, Gaps.xxl),
        children: [
          WalletBalanceCard(
            balance: (w['balance'] as num).toInt(),
            totalIn: (w['totalIn'] as num).toInt(),
            totalOut: (w['totalOut'] as num).toInt(),
            pendingAmount: (w['pendingAmount'] as num).toInt(),
            card: w['card'] as Map?,
            onTapCard: _openBankCard,
          ),
          Gaps.vLg,

          Row(
            children: [
              Expanded(
                child: SizedBox(
                  height: TouchTarget.comfortable,
                  child: FilledButton.icon(
                    onPressed: _openWithdraw,
                    style: FilledButton.styleFrom(
                      backgroundColor: canWithdraw
                          ? BrandColors.emerald
                          : Theme.of(context).colorScheme.surfaceContainerHighest,
                      foregroundColor: canWithdraw
                          ? Colors.white
                          : Theme.of(context).colorScheme.onSurfaceVariant,
                    ),
                    icon: const Icon(Icons.north_east_rounded),
                    label: const Text('درخواست برداشت'),
                  ),
                ),
              ),
              Gaps.hSm,
              SizedBox(
                height: TouchTarget.comfortable,
                child: OutlinedButton.icon(
                  onPressed: _openBankCard,
                  icon: Icon(w['card'] == null
                      ? Icons.add_card_rounded
                      : Icons.credit_card_rounded),
                  label: Text(w['card'] == null ? 'ثبت کارت' : 'کارت'),
                ),
              ),
            ],
          ),

          // چرا نمی‌توانم برداشت کنم — همیشه دیده می‌شود، نه فقط بعد از کلیک
          if (!canWithdraw && w['blockReason'] != null) ...[
            Gaps.vSm,
            Container(
              padding: const EdgeInsets.all(Gaps.sm),
              decoration: BoxDecoration(
                color: BrandColors.warning.withValues(alpha: 0.12),
                borderRadius: Corners.rSm,
                border:
                    Border.all(color: BrandColors.warning.withValues(alpha: 0.3)),
              ),
              child: Row(
                children: [
                  const Icon(Icons.info_outline_rounded,
                      size: 18, color: BrandColors.warning),
                  Gaps.hXs,
                  Expanded(
                    child: Text('${w['blockReason']}',
                        style: Theme.of(context).textTheme.bodySmall),
                  ),
                ],
              ),
            ),
          ],

          Gaps.vLg,
          // راه‌های کسب درآمد — وقتی کیف پول خالی است، مسیر پر کردنش را
          // نشان بده به‌جای یک صفحهٔ خالی بن‌بست.
          if ((w['balance'] as num) == 0 && _transactions.isEmpty) ...[
            const _EarningGuide(),
            Gaps.vLg,
          ],

          TabBar(
            controller: _tabs,
            tabs: [
              Tab(text: 'تراکنش‌ها (${faNum(_transactions.length)})'),
              Tab(text: 'برداشت‌ها (${faNum(_withdrawals.length)})'),
            ],
          ),
          Gaps.vSm,
          // ارتفاع ثابت لازم است چون TabBarView داخل ListView قرار دارد؛
          // محاسبه بر اساس تعداد ردیف‌ها تا برای فهرست‌های کوتاه فضای خالی
          // بزرگ نماند.
          SizedBox(
            height: _tabHeight(),
            child: TabBarView(
              controller: _tabs,
              children: [
                _transactions.isEmpty
                    ? const EmptyState(
                        icon: Icons.receipt_long_rounded,
                        title: 'هنوز تراکنشی نداری',
                        message: 'با ثبت کارت جایزه‌دار یا برد در لیگ، اینجا پر می‌شود.')
                    : ListView.separated(
                        padding: EdgeInsets.zero,
                        itemCount: _transactions.length,
                        separatorBuilder: (_, __) => const Divider(height: 1),
                        itemBuilder: (_, i) =>
                            WalletTransactionTile(tx: _transactions[i] as Map),
                      ),
                _withdrawals.isEmpty
                    ? const EmptyState(
                        icon: Icons.account_balance_rounded,
                        title: 'هنوز درخواست برداشتی نداری')
                    : ListView.separated(
                        padding: EdgeInsets.zero,
                        itemCount: _withdrawals.length,
                        separatorBuilder: (_, __) => Gaps.vXs,
                        itemBuilder: (_, i) {
                          final r = _withdrawals[i] as Map;
                          return WithdrawalTile(
                            request: r,
                            onCancel: () => _cancel(r),
                          );
                        },
                      ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  double _tabHeight() {
    final rows = _tabs.index == 0 ? _transactions.length : _withdrawals.length;
    if (rows == 0) return 220;
    final per = _tabs.index == 0 ? 76.0 : 150.0;
    return (rows * per).clamp(220.0, 900.0);
  }
}

/// راهنمای «چطور پول دربیاورم» برای کیف پول خالی
class _EarningGuide extends StatelessWidget {
  const _EarningGuide();

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    const items = [
      (Icons.credit_score_rounded, 'ثبت کارت جایزه‌دار', 'کارت‌هایی که جایزهٔ نقدی دارند'),
      // این قبلاً «به‌زودی» بود در حالی که گردونه ماه‌هاست فعال است و
      // جایزهٔ نقدی‌اش مستقیم به همین کیف پول واریز می‌شود
      // (creditWheelPrize → walletService.creditStandalone). یعنی درست
      // در صفحه‌ای که کاربر دنبال راهِ پول‌درآوردن می‌گشت، یکی از
      // واقعی‌ترین راه‌ها را «هنوز نیست» معرفی می‌کردیم.
      (Icons.casino_rounded, 'گردونهٔ شانس', 'جایزهٔ نقدی مستقیم به کیف پول'),
      (Icons.card_giftcard_rounded, 'جوایز نقدی', 'با امتیازهایت جایزهٔ نقدی بگیر'),
      (Icons.emoji_events_rounded, 'جایزهٔ لیگ ماهانه', 'در جمع نفرات برتر ماه باش'),
    ];

    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SectionHeader(title: 'چطور کیف پولم پر می‌شود؟'),
          Gaps.vXs,
          for (final it in items)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: Gaps.xxs),
              child: Row(
                children: [
                  Container(
                    width: 36,
                    height: 36,
                    decoration: BoxDecoration(
                      color: BrandColors.emerald.withValues(alpha: 0.12),
                      borderRadius: Corners.rSm,
                    ),
                    child: Icon(it.$1, size: 18, color: BrandColors.emerald),
                  ),
                  Gaps.hSm,
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(it.$2,
                            style: theme.textTheme.bodyMedium
                                ?.copyWith(fontWeight: FontWeight.w600)),
                        Text(it.$3, style: theme.textTheme.bodySmall),
                      ],
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
