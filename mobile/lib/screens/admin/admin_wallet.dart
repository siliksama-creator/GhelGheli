import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../api_client.dart';
import '../../core/money.dart';
import '../../theme/colors.dart';
import '../../theme/tokens.dart';
import '../../widgets/app_card.dart';
import '../../widgets/state_views.dart';
import 'widgets/form_section.dart';

/// ---------------------------------------------------------------------------
///  پنل مدیریت کیف پول و برداشت‌ها
/// ---------------------------------------------------------------------------
///
/// این صفحه‌ای است که مدیر با آن **پول واقعی جابه‌جا می‌کند**، پس بر خلاف
/// بقیهٔ صفحات پنل:
///   • شمارهٔ کامل کارت با یک لمس کپی می‌شود (تایپ دستی ۱۶ رقم = خطای واریز)
///   • هر اقدام یک گام تأیید صریح دارد
///   • «رد کردن» صریحاً می‌گوید مبلغ به کیف پول کاربر برمی‌گردد
class AdminWallet extends StatefulWidget {
  final ApiClient api;
  const AdminWallet({super.key, required this.api});

  @override
  State<AdminWallet> createState() => _AdminWalletState();
}

class _AdminWalletState extends State<AdminWallet> {
  Map? _stats;
  List _requests = [];
  Map? _settings;
  bool _loading = true;
  String? _error;
  String _filter = 'pending';
  final _search = TextEditingController();

  static const _filters = <String, String>{
    'pending': 'در انتظار',
    'approved': 'تأییدشده',
    'paid': 'پرداخت‌شده',
    'rejected': 'ردشده',
    'all': 'همه',
  };

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final q = <String>[
        'status=$_filter',
        if (_search.text.trim().isNotEmpty)
          'search=${Uri.encodeQueryComponent(_search.text.trim())}',
      ].join('&');
      final res = await widget.api.getAll([
        '/api/admin/wallet/stats',
        '/api/admin/wallet/withdrawals?$q',
        '/api/admin/wallet/settings',
      ]);
      if (!mounted) return;
      setState(() {
        _stats = Map<String, dynamic>.from(res[0]);
        _requests = res[1] is List ? res[1] as List : const [];
        _settings = Map<String, dynamic>.from(res[2]);
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

  void _toast(String m) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(m)));
  }

  Future<void> _decide(Map r, String status) async {
    final labels = {
      'approved': ('تأیید درخواست', 'این درخواست تأیید می‌شود و در صف واریز قرار می‌گیرد.'),
      'paid': ('ثبت واریز', 'یعنی پول را واقعاً به کارت کاربر واریز کرده‌اید. این عمل برگشت‌پذیر نیست.'),
      'rejected': ('رد درخواست', 'مبلغ بلافاصله به کیف پول کاربر برمی‌گردد.'),
    };
    final meta = labels[status]!;

    final noteCtl = TextEditingController();
    final trackCtl = TextEditingController();
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: Text(meta.$1),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('${Money.withUnit(r['amount'])} — ${r['cardHolder']}',
                  style: Theme.of(context)
                      .textTheme
                      .titleSmall
                      ?.copyWith(fontWeight: FontWeight.w800)),
              Gaps.vXs,
              Text(meta.$2, style: Theme.of(context).textTheme.bodySmall),
              Gaps.vSm,
              if (status == 'paid')
                TextField(
                  controller: trackCtl,
                  decoration: const InputDecoration(
                    labelText: 'کد پیگیری واریز (اختیاری)',
                    helperText: 'برای کاربر نمایش داده می‌شود',
                  ),
                ),
              if (status == 'rejected')
                TextField(
                  controller: noteCtl,
                  maxLines: 2,
                  decoration: const InputDecoration(
                    labelText: 'دلیل رد',
                    helperText: 'برای کاربر ارسال می‌شود',
                  ),
                ),
            ],
          ),
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(c, false),
              child: const Text('انصراف')),
          FilledButton(
            onPressed: () => Navigator.pop(c, true),
            style: FilledButton.styleFrom(
              backgroundColor:
                  status == 'rejected' ? BrandColors.danger : BrandColors.emerald,
            ),
            child: Text(meta.$1),
          ),
        ],
      ),
    );

    try {
      if (confirmed != true) return;
      await widget.api.patch('/api/admin/wallet/withdrawals/${r['id']}', {
        'status': status,
        if (noteCtl.text.trim().isNotEmpty) 'adminNote': noteCtl.text.trim(),
        if (trackCtl.text.trim().isNotEmpty) 'trackingCode': trackCtl.text.trim(),
      });
      _toast('ثبت شد');
      await _load();
    } catch (e) {
      _toast(apiError(e));
    } finally {
      noteCtl.dispose();
      trackCtl.dispose();
    }
  }

  Future<void> _editSettings() async {
    final s = _settings ?? {};
    final minCtl = TextEditingController(text: '${s['minWithdrawal'] ?? 50000}');
    final maxCtl = TextEditingController(text: '${s['maxWithdrawal'] ?? 50000000}');
    final pendCtl = TextEditingController(text: '${s['maxPendingRequests'] ?? 2}');
    final noteCtl = TextEditingController(text: '${s['note'] ?? ''}');
    var enabled = s['enabled'] != false;

    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: const Text('تنظیمات کیف پول'),
        content: SingleChildScrollView(
          child: StatefulBuilder(
            builder: (ctx, setLocal) => Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('برداشت فعال باشد'),
                  subtitle: const Text('خاموش کردن، دکمهٔ برداشت را برای همه غیرفعال می‌کند'),
                  value: enabled,
                  onChanged: (v) => setLocal(() => enabled = v),
                ),
                TextField(
                  controller: minCtl,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(
                      labelText: 'حداقل برداشت (تومان)'),
                ),
                TextField(
                  controller: maxCtl,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(
                      labelText: 'حداکثر هر برداشت (تومان)'),
                ),
                TextField(
                  controller: pendCtl,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(
                      labelText: 'حداکثر درخواست همزمان هر کاربر'),
                ),
                TextField(
                  controller: noteCtl,
                  maxLines: 2,
                  decoration: const InputDecoration(
                      labelText: 'یادداشت نمایشی به کاربر'),
                ),
              ],
            ),
          ),
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(c, false),
              child: const Text('لغو')),
          FilledButton(
              onPressed: () => Navigator.pop(c, true),
              child: const Text('ذخیره')),
        ],
      ),
    );

    try {
      if (ok != true) return;
      await widget.api.patch('/api/admin/wallet/settings', {
        'enabled': enabled,
        'minWithdrawal': Money.parse(minCtl.text) ?? 50000,
        'maxWithdrawal': Money.parse(maxCtl.text) ?? 50000000,
        'maxPendingRequests': Money.parse(pendCtl.text) ?? 2,
        'note': noteCtl.text.trim(),
      });
      _toast('تنظیمات ذخیره شد');
      await _load();
    } catch (e) {
      _toast(apiError(e));
    } finally {
      minCtl.dispose();
      maxCtl.dispose();
      pendCtl.dispose();
      noteCtl.dispose();
    }
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
    final st = _stats ?? {};

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(Gaps.lg, Gaps.md, Gaps.lg, Gaps.xxl),
        children: [
          // --- آمار ---
          GridView.count(
            crossAxisCount: 2,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            childAspectRatio: 1.55,
            mainAxisSpacing: Gaps.sm,
            crossAxisSpacing: Gaps.sm,
            children: [
              _MoneyStat(
                title: 'در انتظار بررسی',
                amount: st['pendingAmount'],
                count: st['pendingCount'],
                icon: Icons.hourglass_top_rounded,
                color: BrandColors.warning,
              ),
              _MoneyStat(
                title: 'تأییدشده (در صف واریز)',
                amount: st['approvedAmount'],
                count: st['approvedCount'],
                icon: Icons.verified_rounded,
                color: BrandColors.info,
              ),
              _MoneyStat(
                title: 'واریزشده ۳۰ روز اخیر',
                amount: st['paidAmount30d'],
                count: null,
                icon: Icons.check_circle_rounded,
                color: BrandColors.success,
              ),
              _MoneyStat(
                title: 'کل موجودی کیف پول‌ها',
                amount: st['totalWalletLiability'],
                count: null,
                icon: Icons.account_balance_wallet_rounded,
                color: BrandColors.emerald,
              ),
            ],
          ),
          Gaps.vMd,

          // --- فیلتر و جست‌وجو ---
          FormSection(
            title: 'درخواست‌های برداشت',
            children: [
              SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(
                  children: [
                    for (final e in _filters.entries)
                      Padding(
                        padding: const EdgeInsets.only(left: Gaps.xs),
                        child: ChoiceChip(
                          label: Text(e.value),
                          selected: _filter == e.key,
                          onSelected: (_) {
                            setState(() => _filter = e.key);
                            _load();
                          },
                        ),
                      ),
                  ],
                ),
              ),
              TextField(
                controller: _search,
                onSubmitted: (_) => _load(),
                decoration: InputDecoration(
                  labelText: 'جست‌وجو: موبایل، نام، شماره کارت',
                  prefixIcon: const Icon(Icons.search_rounded),
                  suffixIcon: IconButton(
                    icon: const Icon(Icons.arrow_back_rounded),
                    onPressed: _load,
                  ),
                ),
              ),
            ],
          ),
          Gaps.vSm,

          if (_requests.isEmpty)
            const EmptyState(
                icon: Icons.inbox_rounded,
                title: 'درخواستی در این وضعیت نیست')
          else
            for (final r in _requests)
              Padding(
                padding: const EdgeInsets.only(bottom: Gaps.sm),
                child: _RequestCard(
                  request: r as Map,
                  onApprove: () => _decide(r, 'approved'),
                  onPay: () => _decide(r, 'paid'),
                  onReject: () => _decide(r, 'rejected'),
                  onCopy: (text, label) {
                    Clipboard.setData(ClipboardData(text: text));
                    _toast('$label کپی شد');
                  },
                ),
              ),

          Gaps.vMd,
          OutlinedButton.icon(
            onPressed: _editSettings,
            icon: const Icon(Icons.tune_rounded),
            label: const Text('تنظیمات کیف پول'),
          ),
        ],
      ),
    );
  }
}

class _MoneyStat extends StatelessWidget {
  final String title;
  final Object? amount;
  final Object? count;
  final IconData icon;
  final Color color;

  const _MoneyStat({
    required this.title,
    required this.amount,
    required this.count,
    required this.icon,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return AppCard(
      padding: const EdgeInsets.all(Gaps.md),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Row(
            children: [
              Container(
                width: 32,
                height: 32,
                decoration: BoxDecoration(
                    color: color.withValues(alpha: 0.14),
                    borderRadius: Corners.rSm),
                child: Icon(icon, size: 17, color: color),
              ),
              if (count != null && '$count' != '0') ...[
                const Spacer(),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                  decoration: BoxDecoration(
                      color: color.withValues(alpha: 0.16),
                      borderRadius: Corners.rPill),
                  child: Text(faNum(count),
                      style: theme.textTheme.bodySmall
                          ?.copyWith(color: color, fontWeight: FontWeight.w700)),
                ),
              ],
            ],
          ),
          Gaps.vXs,
          FittedBox(
            fit: BoxFit.scaleDown,
            alignment: AlignmentDirectional.centerStart,
            child: Text(Money.format(amount),
                style: theme.textTheme.titleLarge
                    ?.copyWith(fontWeight: FontWeight.w800)),
          ),
          Text(title,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: theme.textTheme.bodySmall),
        ],
      ),
    );
  }
}

class _RequestCard extends StatelessWidget {
  final Map request;
  final VoidCallback onApprove;
  final VoidCallback onPay;
  final VoidCallback onReject;
  final void Function(String text, String label) onCopy;

  const _RequestCard({
    required this.request,
    required this.onApprove,
    required this.onPay,
    required this.onReject,
    required this.onCopy,
  });

  static const _statusStyle = <String, (Color, IconData)>{
    'pending': (BrandColors.warning, Icons.hourglass_top_rounded),
    'approved': (BrandColors.info, Icons.verified_rounded),
    'paid': (BrandColors.success, Icons.check_circle_rounded),
    'rejected': (BrandColors.danger, Icons.cancel_rounded),
    'canceled': (Colors.grey, Icons.remove_circle_outline_rounded),
  };

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final status = '${request['status']}';
    final style = _statusStyle[status] ?? (Colors.grey, Icons.help_outline_rounded);
    final user = Map<String, dynamic>.from(request['user'] ?? {});
    final cardNumber = '${request['cardNumber'] ?? ''}';

    return AppCard(
      padding: const EdgeInsets.all(Gaps.md),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(style.$2, color: style.$1, size: 22),
              Gaps.hXs,
              Expanded(
                child: Text(Money.withUnit(request['amount']),
                    style: theme.textTheme.titleMedium
                        ?.copyWith(fontWeight: FontWeight.w800)),
              ),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: Gaps.sm, vertical: 4),
                decoration: BoxDecoration(
                    color: style.$1.withValues(alpha: 0.14),
                    borderRadius: Corners.rPill),
                child: Text('${request['statusLabel']}',
                    style: theme.textTheme.bodySmall
                        ?.copyWith(color: style.$1, fontWeight: FontWeight.w700)),
              ),
            ],
          ),
          const Divider(height: Gaps.lg),

          // کاربر
          _InfoRow(
            icon: Icons.person_rounded,
            label: 'کاربر',
            value: [user['nickname'], user['mobile']]
                .where((e) => e != null && '$e'.isNotEmpty)
                .join(' — '),
          ),
          _InfoRow(
            icon: Icons.account_balance_wallet_rounded,
            label: 'موجودی فعلی',
            value: Money.withUnit(user['walletBalance']),
          ),
          const Divider(height: Gaps.lg),

          // اطلاعات کارت — قابل کپی
          Text('اطلاعات واریز',
              style: theme.textTheme.bodySmall
                  ?.copyWith(fontWeight: FontWeight.w700)),
          Gaps.vXs,
          _CopyRow(
            icon: Icons.credit_card_rounded,
            label: 'شماره کارت',
            value: cardNumber,
            display: faNum(_group4(cardNumber)),
            onCopy: () => onCopy(cardNumber, 'شماره کارت'),
          ),
          _CopyRow(
            icon: Icons.person_outline_rounded,
            label: 'صاحب کارت',
            value: '${request['cardHolder'] ?? ''}',
            display: '${request['cardHolder'] ?? ''}',
            onCopy: () => onCopy('${request['cardHolder']}', 'نام صاحب کارت'),
          ),
          if (request['cardBank'] != null)
            _InfoRow(
                icon: Icons.account_balance_rounded,
                label: 'بانک',
                value: '${request['cardBank']}'),
          if ((request['cardSheba'] ?? '').toString().isNotEmpty)
            _CopyRow(
              icon: Icons.numbers_rounded,
              label: 'شبا',
              value: '${request['cardSheba']}',
              display: faNum('${request['cardSheba']}'),
              onCopy: () => onCopy('${request['cardSheba']}', 'شبا'),
            ),

          if ((request['trackingCode'] ?? '').toString().isNotEmpty) ...[
            Gaps.vXs,
            _InfoRow(
                icon: Icons.receipt_rounded,
                label: 'کد پیگیری',
                value: faNum('${request['trackingCode']}')),
          ],
          if ((request['adminNote'] ?? '').toString().isNotEmpty) ...[
            Gaps.vXs,
            _InfoRow(
                icon: Icons.note_rounded,
                label: 'یادداشت',
                value: '${request['adminNote']}'),
          ],

          // اقدامات
          if (status == 'pending' || status == 'approved') ...[
            const Divider(height: Gaps.lg),
            Wrap(
              spacing: Gaps.xs,
              runSpacing: Gaps.xs,
              children: [
                if (status == 'pending')
                  FilledButton.icon(
                    onPressed: onApprove,
                    icon: const Icon(Icons.check_rounded, size: 18),
                    label: const Text('تأیید'),
                  ),
                if (status == 'approved')
                  FilledButton.icon(
                    onPressed: onPay,
                    style: FilledButton.styleFrom(
                        backgroundColor: BrandColors.success),
                    icon: const Icon(Icons.payments_rounded, size: 18),
                    label: const Text('واریز کردم'),
                  ),
                OutlinedButton.icon(
                  onPressed: onReject,
                  style: OutlinedButton.styleFrom(
                      foregroundColor: BrandColors.danger),
                  icon: const Icon(Icons.close_rounded, size: 18),
                  label: const Text('رد و برگشت وجه'),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }

  static String _group4(String s) {
    if (s.length != 16) return s;
    return '${s.substring(0, 4)}-${s.substring(4, 8)}-${s.substring(8, 12)}-${s.substring(12)}';
  }
}

class _InfoRow extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;
  const _InfoRow({required this.icon, required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 15, color: theme.colorScheme.onSurfaceVariant),
          Gaps.hXs,
          Text('$label: ', style: theme.textTheme.bodySmall),
          Expanded(
            child: Text(value,
                style: theme.textTheme.bodySmall
                    ?.copyWith(fontWeight: FontWeight.w600)),
          ),
        ],
      ),
    );
  }
}

/// ردیف قابل کپی — تایپ دستی ۱۶ رقم کارت رایج‌ترین راه واریز به حساب اشتباه است.
class _CopyRow extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;
  final String display;
  final VoidCallback onCopy;

  const _CopyRow({
    required this.icon,
    required this.label,
    required this.value,
    required this.display,
    required this.onCopy,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return InkWell(
      onTap: onCopy,
      borderRadius: Corners.rSm,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 5),
        child: Row(
          children: [
            Icon(icon, size: 15, color: theme.colorScheme.onSurfaceVariant),
            Gaps.hXs,
            Text('$label: ', style: theme.textTheme.bodySmall),
            Expanded(
              child: Text(display,
                  style: theme.textTheme.bodyMedium?.copyWith(
                    fontWeight: FontWeight.w700,
                    letterSpacing: 0.6,
                  )),
            ),
            Icon(Icons.copy_rounded,
                size: 16, color: theme.colorScheme.primary),
          ],
        ),
      ),
    );
  }
}
