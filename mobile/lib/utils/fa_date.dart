/// «۱۴۰۵/۶/۹ — ۲۱:۰۳» از رشتهٔ ISO سرور. خالی/نامعتبر → ''.
///
/// قبلاً فقط داخل `wallet_widgets.dart` بود؛ صفحهٔ گردونه هم برای
/// «چرخش‌های اخیر» به همان قالبِ تاریخ نیاز دارد. یک پیاده‌سازی، دو
/// مصرف‌کننده — و بدون وابستگی به پکیج تا در تست‌های واحد هم کار کند.
library;

import 'dart:math' as math;

import '../api_client.dart' show faNum;

String faDate(Object? iso) {
  if (iso == null) return '';
  final dt = DateTime.tryParse('$iso')?.toLocal();
  if (dt == null) return '';
  final j = _Jalali.fromGregorian(dt.year, dt.month, dt.day);
  final hh = dt.hour.toString().padLeft(2, '0');
  final mm = dt.minute.toString().padLeft(2, '0');
  return faNum('${j.year}/${_p(j.month)}/${_p(j.day)} — $hh:$mm');
}

String _p(int n) => n.toString().padLeft(2, '0');

/// تبدیل میلادی به شمسی — الگوریتم کوتاه و بدون وابستگی.
class _Jalali {
  final int year, month, day;
  const _Jalali(this.year, this.month, this.day);

  static _Jalali fromGregorian(int gy, int gm, int gd) {
    const gDaysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    const jDaysInMonth = [31, 31, 31, 31, 31, 31, 30, 30, 30, 30, 30, 29];

    var gy2 = gm > 2 ? gy + 1 : gy;
    var days = 355666 +
        (365 * gy) +
        ((gy2 + 3) ~/ 4) -
        ((gy2 + 99) ~/ 100) +
        ((gy2 + 399) ~/ 400) +
        gd +
        gDaysInMonth.sublist(0, gm - 1).fold<int>(0, (a, b) => a + b);

    var jy = -1595 + (33 * (days ~/ 12053));
    days %= 12053;
    jy += 4 * (days ~/ 1461);
    days %= 1461;
    if (days > 365) {
      jy += (days - 1) ~/ 365;
      days = (days - 1) % 365;
    }

    var jm = 0, jd = 0;
    for (var i = 0; i < 12; i++) {
      final dim = jDaysInMonth[i] + (i == 11 && _isLeap(jy) ? 1 : 0);
      if (days < dim) {
        jm = i + 1;
        jd = days + 1;
        break;
      }
      days -= dim;
    }
    if (jm == 0) {
      jm = 12;
      jd = math.max(1, days);
    }
    return _Jalali(jy, jm, jd);
  }

  static bool _isLeap(int jy) {
    final r = jy % 33;
    return [1, 5, 9, 13, 17, 22, 26, 30].contains(r);
  }
}
