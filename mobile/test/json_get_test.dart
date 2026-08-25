import 'package:flutter_test/flutter_test.dart';
import 'package:ghelgheli_mobile/core/json_get.dart';

/// JSON شبکه کلید را رشته می‌سازد. اگر کلاینت با `map[100]` بخواند
/// مقدارِ زنده‌ی ادمین گم می‌شود و وب و اندروید دو عدد نشان می‌دهند.
void main() {
  test('jsonGet کلیدِ رشته و عدد را یکی می‌بیند', () {
    final fromNetwork = <String, dynamic>{'100': 7, '1000': 12};
    expect(jsonGet(fromNetwork, 100), 7);
    expect(jsonGet(fromNetwork, '100'), 7);
    expect(jsonGet(fromNetwork, 1000), 12);
    expect(jsonGet(fromNetwork, 999), isNull);
  });

  test('jsonGet روی نقشهٔ تهی/null کرش نمی‌کند', () {
    expect(jsonGet(null, 100), isNull);
    expect(jsonGet(<String, dynamic>{}, 'win'), isNull);
  });

  test('jsonMap فقط Map را می‌پذیرد', () {
    expect(jsonMap(null), isEmpty);
    expect(jsonMap('x'), isEmpty);
    expect(jsonMap({'a': 1})['a'], 1);
  });
}
