import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../api_client.dart';
import '../../../core/money.dart';
import '../../../theme/colors.dart';
import '../../../theme/tokens.dart';

/// ---------------------------------------------------------------------------
///  فرم درخواست برداشت
/// ---------------------------------------------------------------------------
///
/// طراحی عمدی: مبلغ با «چیپ»‌های آماده (۵۰ هزار، ۱۰۰ هزار، همهٔ موجودی) هم
/// قابل انتخاب است، چون تایپ عدد بلند روی موبایل خطاخیز است — و بیشترین
/// اشتباه کاربر، وارد کردن یک صفر اضافه یا کم است.
class WithdrawSheet extends StatefulWidget {
  final ApiClient api;
  final int balance;
  final int minWithdrawal;
  final int maxWithdrawal;
  final Map card;
  final String? note;

  const WithdrawSheet({
    super.key,
    required this.api,
    required this.balance,
    required this.minWithdrawal,
    required this.maxWithdrawal,
    required this.card,
    this.note,
  });

  static Future<bool?> show(
    BuildContext context, {
    required ApiClient api,
    required int balance,
    required int minWithdrawal,
    required int maxWithdrawal,
    required Map card,
    String? note,
  }) =>
      showModalBottomSheet<bool>(
        context: context,
        isScrollControlled: true,
        showDragHandle: true,
        builder: (_) => Padding(
          padding:
              EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
          child: WithdrawSheet(
            api: api,
            balance: balance,
            minWithdrawal: minWithdrawal,
            maxWithdrawal: maxWithdrawal,
            card: card,
            note: note,
          ),
        ),
      );

  @override
  State<WithdrawSheet> createState() => _WithdrawSheetState();
}

class _WithdrawSheetState extends State<WithdrawSheet> {
  final _amount = TextEditingController();
  String? _error;
  String? _serverError;
  bool _saving = false;

  int get _value => Money.parse(_amount.text) ?? 0;

  /// سقف واقعی = کمترینِ (موجودی، سقف تنظیمات)
  int get _effectiveMax =>
      widget.balance < widget.maxWithdrawal ? widget.balance : widget.maxWithdrawal;

  @override
  void dispose() {
    _amount.dispose();
    super.dispose();
  }

  void _setAmount(int v) {
    _amount.text = Money.format(v);
    _validate();
  }

  bool _validate() {
    final v = _value;
    String? err;
    if (v <= 0) {
      err = 'مبلغ برداشت را وارد کنید';
    } else if (v < widget.minWithdrawal) {
      err = 'حداقل مبلغ قابل برداشت ${Money.withUnit(widget.minWithdrawal)} است';
    } else if (v > widget.balance) {
      err = 'موجودی کیف پول شما ${Money.withUnit(widget.balance)} است';
    } else if (v > widget.maxWithdrawal) {
      err = 'حداکثر مبلغ هر برداشت ${Money.withUnit(widget.maxWithdrawal)} است';
    }
    setState(() => _error = err);
    return err == null;
  }

  Future<void> _submit() async {
    if (!_validate()) return;
    // تأیید نهایی: این عملیات پول واقعی جابه‌جا می‌کند و مبلغ بلافاصله از
    // موجودی بلوکه می‌شود، پس یک گام تأیید صریح ارزشش را دارد.
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: const Text('تأیید درخواست برداشت'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _ConfirmRow(label: 'مبلغ', value: Money.withUnit(_value), bold: true),
            Gaps.vXs,
            _ConfirmRow(
                label: 'به کارت',
                value: faNum('${widget.card['maskedNumber'] ?? ''}')),
            if (widget.card['bank'] != null) ...[
              Gaps.vXs,
              _ConfirmRow(label: 'بانک', value: '${widget.card['bank']}'),
            ],
            Gaps.vXs,
            _ConfirmRow(
                label: 'به نام', value: '${widget.card['holder'] ?? ''}'),
            Gaps.vSm,
            Text(
              'این مبلغ بلافاصله از موجودی شما کسر و تا زمان بررسی بلوکه می‌شود. در صورت رد شدن، مبلغ به کیف پولتان برمی‌گردد.',
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ],
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(c, false),
              child: const Text('برگرد')),
          FilledButton(
              onPressed: () => Navigator.pop(c, true),
              child: const Text('ثبت درخواست')),
        ],
      ),
    );
    if (confirmed != true) return;

    setState(() {
      _saving = true;
      _serverError = null;
    });
    try {
      await widget.api.post('/api/wallet/withdrawals', {'amount': _value});
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      if (mounted) setState(() => _serverError = apiError(e));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    // چیپ‌های پیشنهادی: فقط مبالغی که واقعاً قابل برداشت‌اند
    final presets = <int>[
      widget.minWithdrawal,
      widget.minWithdrawal * 2,
      widget.minWithdrawal * 4,
    ].where((v) => v <= _effectiveMax).toSet().toList();

    return SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(Gaps.lg, 0, Gaps.lg, Gaps.lg),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              children: [
                const Icon(Icons.north_east_rounded, color: BrandColors.emerald),
                Gaps.hXs,
                Text('درخواست برداشت',
                    style: theme.textTheme.titleMedium
                        ?.copyWith(fontWeight: FontWeight.w700)),
              ],
            ),
            Gaps.vXs,
            Container(
              padding: const EdgeInsets.all(Gaps.sm),
              decoration: BoxDecoration(
                color: BrandColors.emerald.withValues(alpha: 0.10),
                borderRadius: Corners.rSm,
              ),
              child: Row(
                children: [
                  const Icon(Icons.account_balance_wallet_rounded,
                      size: 18, color: BrandColors.emerald),
                  Gaps.hXs,
                  Text('موجودی: ',
                      style: theme.textTheme.bodySmall),
                  Text(Money.withUnit(widget.balance),
                      style: theme.textTheme.bodyMedium?.copyWith(
                        fontWeight: FontWeight.w800,
                        color: BrandColors.emerald,
                      )),
                ],
              ),
            ),
            Gaps.vLg,

            TextField(
              controller: _amount,
              keyboardType: TextInputType.number,
              autofocus: true,
              onChanged: (_) => _validate(),
              inputFormatters: [
                FilteringTextInputFormatter.allow(RegExp(r'[0-9۰-۹٠-٩٬,\s]')),
                _ThousandsFormatter(),
              ],
              style: theme.textTheme.headlineSmall
                  ?.copyWith(fontWeight: FontWeight.w800),
              decoration: InputDecoration(
                labelText: 'مبلغ برداشت',
                suffixText: 'تومان',
                prefixIcon: const Icon(Icons.payments_rounded),
                errorText: _error,
                helperText: 'حداقل ${Money.withUnit(widget.minWithdrawal)}',
              ),
            ),
            Gaps.vSm,
            Wrap(
              spacing: Gaps.xs,
              runSpacing: Gaps.xs,
              children: [
                for (final p in presets)
                  ActionChip(
                    label: Text(Money.compact(p)),
                    onPressed: () => _setAmount(p),
                  ),
                if (_effectiveMax >= widget.minWithdrawal)
                  ActionChip(
                    avatar: const Icon(Icons.all_inclusive_rounded, size: 16),
                    label: const Text('همهٔ موجودی'),
                    onPressed: () => _setAmount(_effectiveMax),
                  ),
              ],
            ),

            Gaps.vLg,
            // مقصد واریز
            Container(
              padding: const EdgeInsets.all(Gaps.md),
              decoration: BoxDecoration(
                color: theme.colorScheme.surfaceContainerHighest,
                borderRadius: Corners.rMd,
              ),
              child: Row(
                children: [
                  const Icon(Icons.credit_card_rounded, size: 20),
                  Gaps.hSm,
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('واریز به کارت',
                            style: theme.textTheme.bodySmall),
                        Text(faNum('${widget.card['maskedNumber'] ?? ''}'),
                            style: theme.textTheme.bodyMedium?.copyWith(
                              fontWeight: FontWeight.w700,
                              letterSpacing: 1,
                            )),
                        Text(
                          [widget.card['holder'], widget.card['bank']]
                              .where((e) => e != null && '$e'.isNotEmpty)
                              .join(' — '),
                          style: theme.textTheme.bodySmall,
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),

            if (widget.note != null && widget.note!.isNotEmpty) ...[
              Gaps.vSm,
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(Icons.info_outline_rounded,
                      size: 16, color: theme.colorScheme.onSurfaceVariant),
                  Gaps.hXxs,
                  Expanded(
                    child: Text(widget.note!,
                        style: theme.textTheme.bodySmall),
                  ),
                ],
              ),
            ],

            if (_serverError != null) ...[
              Gaps.vSm,
              Container(
                padding: const EdgeInsets.all(Gaps.sm),
                decoration: BoxDecoration(
                  color: BrandColors.danger.withValues(alpha: 0.12),
                  borderRadius: Corners.rSm,
                ),
                child: Row(
                  children: [
                    const Icon(Icons.error_outline_rounded,
                        size: 18, color: BrandColors.danger),
                    Gaps.hXs,
                    Expanded(
                      child: Text(_serverError!,
                          style: theme.textTheme.bodySmall
                              ?.copyWith(color: BrandColors.danger)),
                    ),
                  ],
                ),
              ),
            ],

            Gaps.vLg,
            SizedBox(
              width: double.infinity,
              height: TouchTarget.comfortable,
              child: FilledButton.icon(
                onPressed: _saving ? null : _submit,
                icon: _saving
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(
                            strokeWidth: 2.2, color: Colors.white))
                    : const Icon(Icons.send_rounded),
                label: const Text('ثبت درخواست برداشت'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ConfirmRow extends StatelessWidget {
  final String label;
  final String value;
  final bool bold;
  const _ConfirmRow({required this.label, required this.value, this.bold = false});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(label, style: theme.textTheme.bodySmall),
        Flexible(
          child: Text(
            value,
            textAlign: TextAlign.end,
            style: bold
                ? theme.textTheme.titleSmall?.copyWith(
                    fontWeight: FontWeight.w800, color: BrandColors.emerald)
                : theme.textTheme.bodyMedium
                    ?.copyWith(fontWeight: FontWeight.w600),
          ),
        ),
      ],
    );
  }
}

/// جداکنندهٔ هزارگان هنگام تایپ — «۵۰۰۰۰» را به «۵۰٬۰۰۰» تبدیل می‌کند تا
/// کاربر تعداد صفرها را چشمی بشمارد.
class _ThousandsFormatter extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(
      TextEditingValue oldValue, TextEditingValue newValue) {
    final v = Money.parse(newValue.text);
    if (v == null || v == 0) {
      return newValue.text.isEmpty ? newValue : oldValue;
    }
    if (v > 99999999999) return oldValue;
    final text = Money.format(v);
    return TextEditingValue(
      text: text,
      selection: TextSelection.collapsed(offset: text.length),
    );
  }
}
