import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../api_client.dart';
import '../../../theme/colors.dart';
import '../../../theme/tokens.dart';

/// ---------------------------------------------------------------------------
///  فرم ثبت کارت بانکی
/// ---------------------------------------------------------------------------
///
/// اعتبارسنجی **همان لحظهٔ تایپ** انجام می‌شود، نه بعد از زدن دکمهٔ ذخیره:
/// تنها بازخورد دیگری که کاربر از یک شمارهٔ کارت اشتباه می‌گیرد، واریز
/// نشدن پول هفته‌ها بعد است. نام بانک هم به‌محض کامل شدن ۶ رقم اول نشان داده
/// می‌شود تا کاربر مطمئن شود کارت درست را وارد کرده.
class BankCardSheet extends StatefulWidget {
  final ApiClient api;
  final Map? existing;

  const BankCardSheet({super.key, required this.api, this.existing});

  static Future<bool?> show(BuildContext context, ApiClient api, Map? existing) =>
      showModalBottomSheet<bool>(
        context: context,
        isScrollControlled: true,
        showDragHandle: true,
        builder: (_) => Padding(
          padding: EdgeInsets.only(
              bottom: MediaQuery.viewInsetsOf(context).bottom),
          child: BankCardSheet(api: api, existing: existing),
        ),
      );

  @override
  State<BankCardSheet> createState() => _BankCardSheetState();
}

class _BankCardSheetState extends State<BankCardSheet> {
  final _number = TextEditingController();
  final _holder = TextEditingController();
  final _sheba = TextEditingController();

  String? _numberError;
  String? _holderError;
  String? _shebaError;
  String? _serverError;
  String? _bankName;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    // شمارهٔ کامل کارت هرگز از سرور برنمی‌گردد (فقط ماسک‌شده)، پس فیلد شماره
    // همیشه خالی شروع می‌شود؛ اما نام صاحب کارت را می‌توان پیش‌پر کرد.
    if (widget.existing != null) {
      _holder.text = '${widget.existing!['holder'] ?? ''}';
    }
    _number.addListener(_onNumberChanged);
  }

  @override
  void dispose() {
    _number.removeListener(_onNumberChanged);
    _number.dispose();
    _holder.dispose();
    _sheba.dispose();
    super.dispose();
  }

  void _onNumberChanged() {
    final digits = _digits(_number.text);
    setState(() {
      _bankName = _detectBank(digits);
      if (digits.isEmpty) {
        _numberError = null;
      } else if (digits.length < 16) {
        _numberError = null; // هنوز در حال تایپ است؛ سرزنشش نکن
      } else if (!_luhn(digits)) {
        _numberError = 'این شماره کارت معتبر نیست؛ ارقام را دوباره بررسی کنید';
      } else {
        _numberError = null;
      }
    });
  }

  bool _validateAll() {
    final digits = _digits(_number.text);
    final holder = _holder.text.trim();
    final sheba = _sheba.text.trim();
    setState(() {
      _numberError = digits.length != 16
          ? 'شماره کارت باید ۱۶ رقم باشد'
          : (!_luhn(digits) ? 'شماره کارت معتبر نیست' : null);
      _holderError = holder.length < 3 ? 'نام و نام خانوادگی صاحب کارت را وارد کنید' : null;
      _shebaError = sheba.isNotEmpty && !_validSheba(sheba)
          ? 'شماره شبا معتبر نیست'
          : null;
    });
    return _numberError == null && _holderError == null && _shebaError == null;
  }

  Future<void> _save() async {
    if (!_validateAll()) return;
    setState(() {
      _saving = true;
      _serverError = null;
    });
    try {
      await widget.api.post('/api/wallet/bank-card', {
        'cardNumber': _digits(_number.text),
        'cardHolder': _holder.text.trim(),
        if (_sheba.text.trim().isNotEmpty) 'sheba': _sheba.text.trim(),
      });
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      if (mounted) setState(() => _serverError = apiError(e));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _delete() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: const Text('حذف کارت بانکی؟'),
        content: const Text(
            'بعد از حذف، تا زمانی که کارت جدیدی ثبت نکنید نمی‌توانید درخواست برداشت بدهید.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('انصراف')),
          FilledButton(
            onPressed: () => Navigator.pop(c, true),
            style: FilledButton.styleFrom(backgroundColor: BrandColors.danger),
            child: const Text('حذف کن'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    setState(() => _saving = true);
    try {
      await widget.api.dio.delete('/api/wallet/bank-card');
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
    final digits = _digits(_number.text);
    final complete = digits.length == 16 && _luhn(digits);

    return SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(Gaps.lg, 0, Gaps.lg, Gaps.lg),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              children: [
                const Icon(Icons.add_card_rounded, color: BrandColors.emerald),
                Gaps.hXs,
                Text(
                  widget.existing == null ? 'ثبت کارت بانکی' : 'تغییر کارت بانکی',
                  style: theme.textTheme.titleMedium
                      ?.copyWith(fontWeight: FontWeight.w700),
                ),
              ],
            ),
            Gaps.vXxs,
            Text(
              'واریز جوایز فقط به کارتی انجام می‌شود که به نام خودتان باشد.',
              style: theme.textTheme.bodySmall,
            ),
            Gaps.vLg,

            // پیش‌نمایش زندهٔ کارت
            _CardPreview(
              number: digits,
              holder: _holder.text,
              bank: _bankName,
              valid: complete,
            ),
            Gaps.vLg,

            TextField(
              controller: _number,
              keyboardType: TextInputType.number,
              textDirection: TextDirection.ltr,
              inputFormatters: [
                FilteringTextInputFormatter.allow(RegExp(r'[0-9۰-۹٠-٩\s-]')),
                _CardNumberFormatter(),
              ],
              decoration: InputDecoration(
                labelText: 'شماره کارت ۱۶ رقمی',
                hintText: '____-____-____-____',
                hintTextDirection: TextDirection.ltr,
                prefixIcon: const Icon(Icons.credit_card_rounded),
                suffixIcon: digits.length == 16
                    ? Icon(
                        complete ? Icons.check_circle_rounded : Icons.error_rounded,
                        color: complete ? BrandColors.success : BrandColors.danger,
                      )
                    : null,
                errorText: _numberError,
                helperText: _bankName,
                helperStyle: const TextStyle(color: BrandColors.emerald),
              ),
            ),
            Gaps.vSm,
            TextField(
              controller: _holder,
              textCapitalization: TextCapitalization.words,
              onChanged: (_) => setState(() {}),
              decoration: InputDecoration(
                labelText: 'نام و نام خانوادگی صاحب کارت',
                prefixIcon: const Icon(Icons.person_rounded),
                errorText: _holderError,
              ),
            ),
            Gaps.vSm,
            TextField(
              controller: _sheba,
              textDirection: TextDirection.ltr,
              decoration: InputDecoration(
                labelText: 'شماره شبا (اختیاری)',
                hintText: 'IR...',
                hintTextDirection: TextDirection.ltr,
                prefixIcon: const Icon(Icons.account_balance_rounded),
                errorText: _shebaError,
              ),
            ),

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
                onPressed: _saving ? null : _save,
                icon: _saving
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(
                            strokeWidth: 2.2, color: Colors.white))
                    : const Icon(Icons.save_rounded),
                label: Text(widget.existing == null ? 'ذخیرهٔ کارت' : 'به‌روزرسانی کارت'),
              ),
            ),
            if (widget.existing != null) ...[
              Gaps.vXs,
              SizedBox(
                width: double.infinity,
                child: TextButton.icon(
                  onPressed: _saving ? null : _delete,
                  style: TextButton.styleFrom(foregroundColor: BrandColors.danger),
                  icon: const Icon(Icons.delete_outline_rounded, size: 18),
                  label: const Text('حذف کارت'),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// پیش‌نمایش کارت که همزمان با تایپ پر می‌شود
class _CardPreview extends StatelessWidget {
  final String number;
  final String holder;
  final String? bank;
  final bool valid;

  const _CardPreview({
    required this.number,
    required this.holder,
    this.bank,
    required this.valid,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final padded = number.padRight(16, '•');
    final groups = [
      padded.substring(0, 4),
      padded.substring(4, 8),
      padded.substring(8, 12),
      padded.substring(12, 16),
    ];

    return AnimatedContainer(
      duration: Motion.normal,
      padding: const EdgeInsets.all(Gaps.lg),
      decoration: BoxDecoration(
        borderRadius: Corners.rXl,
        gradient: LinearGradient(
          colors: valid
              ? const [Color(0xFF0E5C4A), BrandColors.emerald]
              : const [Color(0xFF243447), Color(0xFF33465F)],
          begin: Alignment.topRight,
          end: Alignment.bottomLeft,
        ),
        boxShadow: [
          BoxShadow(
            color: (valid ? BrandColors.emerald : Colors.black)
                .withValues(alpha: 0.25),
            blurRadius: 20,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 28,
                height: 21,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(5),
                  gradient: const LinearGradient(
                    colors: [Color(0xFFFFE9A8), Color(0xFFD4A227)],
                  ),
                ),
              ),
              const Spacer(),
              Text(bank ?? 'بانک',
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: Colors.white.withValues(alpha: 0.85),
                    fontWeight: FontWeight.w600,
                  )),
            ],
          ),
          Gaps.vMd,
          Directionality(
            textDirection: TextDirection.ltr,
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                for (final g in groups)
                  Text(
                    faNum(g),
                    style: theme.textTheme.titleMedium?.copyWith(
                      color: Colors.white,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 2,
                    ),
                  ),
              ],
            ),
          ),
          Gaps.vSm,
          Text(
            holder.trim().isEmpty ? 'نام صاحب کارت' : holder.trim(),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: theme.textTheme.bodyMedium?.copyWith(
              color: Colors.white.withValues(
                  alpha: holder.trim().isEmpty ? 0.45 : 0.95),
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}

/// گروه‌بندی خودکار ۴ رقمی هنگام تایپ
class _CardNumberFormatter extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(
      TextEditingValue oldValue, TextEditingValue newValue) {
    final digits = _digits(newValue.text);
    if (digits.length > 16) return oldValue;
    final buf = StringBuffer();
    for (var i = 0; i < digits.length; i++) {
      if (i > 0 && i % 4 == 0) buf.write('-');
      buf.write(digits[i]);
    }
    final text = buf.toString();
    return TextEditingValue(
      text: text,
      selection: TextSelection.collapsed(offset: text.length),
    );
  }
}

// --- کمکی‌های اعتبارسنجی (آینهٔ منطق سرور) --------------------------------

String _digits(String input) {
  const fa = '۰۱۲۳۴۵۶۷۸۹';
  const ar = '٠١٢٣٤٥٦٧٨٩';
  final buf = StringBuffer();
  for (final ch in input.split('')) {
    final f = fa.indexOf(ch);
    final a = ar.indexOf(ch);
    if (f > -1) {
      buf.write(f);
    } else if (a > -1) {
      buf.write(a);
    } else if (RegExp(r'[0-9]').hasMatch(ch)) {
      buf.write(ch);
    }
  }
  return buf.toString();
}

bool _luhn(String n) {
  if (n.length != 16) return false;
  if (RegExp(r'^(\d)\1{15}$').hasMatch(n)) return false;
  var sum = 0;
  for (var i = 0; i < 16; i++) {
    var d = int.parse(n[i]);
    if (i % 2 == 0) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 == 0;
}

bool _validSheba(String input) {
  final s = _digits(input);
  if (s.length != 24) return false;
  final re = '${s.substring(4)}1827${s.substring(0, 4)}';
  var r = 0;
  for (final ch in re.split('')) {
    r = (r * 10 + int.parse(ch)) % 97;
  }
  return r == 1;
}

const _bankBins = <int, String>{
  603799: 'بانک ملی ایران',
  589210: 'بانک سپه',
  627648: 'بانک توسعه صادرات',
  627961: 'بانک صنعت و معدن',
  603770: 'بانک کشاورزی',
  639217: 'بانک کشاورزی',
  628023: 'بانک مسکن',
  627760: 'پست بانک ایران',
  502908: 'بانک توسعه تعاون',
  627412: 'بانک اقتصاد نوین',
  622106: 'بانک پارسیان',
  639194: 'بانک پارسیان',
  627884: 'بانک پارسیان',
  502229: 'بانک پاسارگاد',
  639347: 'بانک پاسارگاد',
  627488: 'بانک کارآفرین',
  502910: 'بانک کارآفرین',
  621986: 'بانک سامان',
  639346: 'بانک سینا',
  639607: 'بانک سرمایه',
  636214: 'بانک آینده',
  502806: 'بانک شهر',
  504706: 'بانک شهر',
  502938: 'بانک دی',
  603769: 'بانک صادرات ایران',
  610433: 'بانک ملت',
  991975: 'بانک ملت',
  589463: 'بانک رفاه کارگران',
  627381: 'بانک انصار',
  639370: 'بانک مهر اقتصاد',
  606373: 'بانک قرض‌الحسنه مهر ایران',
  505416: 'بانک گردشگری',
  585983: 'بانک تجارت',
  627353: 'بانک تجارت',
  505785: 'بانک ایران زمین',
  504172: 'بانک رسالت',
  606256: 'موسسه ملل',
};

String? _detectBank(String digits) {
  if (digits.length < 6) return null;
  return _bankBins[int.tryParse(digits.substring(0, 6)) ?? -1];
}
