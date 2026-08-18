import '../api_client.dart';

/// ابزار نمایش مبالغ تومانی.
///
/// همه‌جای اپ باید از این استفاده کند تا «۵۰٬۰۰۰ تومان» همه‌جا یک شکل دیده
/// شود. جداکنندهٔ هزارگان «٬» (U+066C) است، نه کامای لاتین — در متن فارسی
/// راست‌به‌چپ، کامای لاتین باعث پرش مکان‌نما و شکستن ترتیب ارقام می‌شود.
class Money {
  Money._();

  /// ۵۰۰۰۰ → «۵۰٬۰۰۰»
  static String format(Object? value) {
    final n = _toInt(value);
    final digits = n.abs().toString();
    final buf = StringBuffer();
    for (var i = 0; i < digits.length; i++) {
      if (i > 0 && (digits.length - i) % 3 == 0) buf.write('٬');
      buf.write(digits[i]);
    }
    final s = faNum(buf.toString());
    return n < 0 ? '−$s' : s;
  }

  /// ۵۰۰۰۰ → «۵۰٬۰۰۰ تومان»
  static String withUnit(Object? value) => '${format(value)} تومان';

  /// نمایش فشرده برای فضاهای تنگ: ۱٬۲۰۰٬۰۰۰ → «۱٫۲ میلیون تومان»
  ///
  /// جداکنندهٔ اعشار را `faNum` به «٫» فارسی تبدیل می‌کند.
  static String compact(Object? value) {
    final n = _toInt(value);
    if (n.abs() >= 1000000000) {
      return '${faNum(_trim(n / 1000000000))} میلیارد تومان';
    }
    if (n.abs() >= 1000000) {
      return '${faNum(_trim(n / 1000000))} میلیون تومان';
    }
    return withUnit(n);
  }

  /// «۲.۰» زشت است؛ وقتی رقم اعشار صفر است حذفش می‌کنیم.
  static String _trim(double v) =>
      v == v.roundToDouble() ? v.round().toString() : v.toStringAsFixed(1);

  /// ورودی کاربر («۵۰٬۰۰۰» یا «50,000» یا «۵۰ ۰۰۰») → عدد صحیح
  static int? parse(String? input) {
    if (input == null) return null;
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
      // هر چیز دیگر (٬ , . فاصله «تومان») نادیده گرفته می‌شود
    }
    final s = buf.toString();
    if (s.isEmpty) return null;
    return int.tryParse(s);
  }

  static int _toInt(Object? value) {
    if (value is int) return value;
    if (value is double) return value.round();
    return int.tryParse('${value ?? 0}'.split('.').first) ?? 0;
  }
}
