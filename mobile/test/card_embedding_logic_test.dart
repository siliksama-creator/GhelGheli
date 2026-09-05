import 'dart:math' as math;

import 'package:flutter_test/flutter_test.dart';

/// منطقِ نرمال‌سازیِ بردار (مشترک با سرویس روی گوشی) را بدون نیاز به مدل/پلتفرم
/// می‌سنجد: خروجی باید بردار واحد (L2) با طول مورد انتظار باشد.
List<double> l2Normalize(List<double> v) {
  var n = 0.0;
  for (final x in v) {
    n += x * x;
  }
  n = math.sqrt(n);
  if (n == 0) return v;
  return v.map((x) => x / n).toList();
}

void main() {
  test('نرمال‌سازی L2 بردار واحد می‌سازد', () {
    final v = List<double>.generate(1280, (i) => (i % 7) - 3.0);
    final n = l2Normalize(v);
    var sum = 0.0;
    for (final x in n) {
      sum += x * x;
    }
    expect(n.length, 1280);
    expect(sum, closeTo(1.0, 1e-6));
  });

  test('بردار صفر بدون تقسیم بر صفر دست‌نخورده برمی‌گردد', () {
    final v = List<double>.filled(1280, 0.0);
    final n = l2Normalize(v);
    expect(n.every((x) => x == 0.0), isTrue);
  });
}
