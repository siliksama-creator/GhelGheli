// پوستهٔ خانه نباید با هر setState همهٔ صفحه‌ها را از نو بسازد.
//
// ═══════════════════════════════════════════════════════════════════════════
// گزارش مالک
// ═══════════════════════════════════════════════════════════════════════════
//
// «میریم داخل بازی ضربه زن و یکم بازی میکنیم و برمیگردیم میریم سراغ
// قسمت های دیگه — سرعت کار با اپلیکیشن به مرور کم میشه و لودینگ هایی
// به وجود میاد. خیلی طولانی نیستن ولی کند شدن مشخص میشه.»
//
// ═══════════════════════════════════════════════════════════════════════════
// ریشه‌ای که پیدا شد
// ═══════════════════════════════════════════════════════════════════════════
//
// `_pages` یک **getter** بود که آرایه‌ای از ۱۲ ویجت برمی‌گرداند، و در
// `build` خوانده می‌شد. یعنی هر `setState` — و پوسته ۱۳ جا دارد —
// دوازده شیءِ ویجتِ تازه می‌ساخت که یازده‌تایشان روی صفحه نبودند.
//
// «به مرور بدتر می‌شود» هم توضیح دارد: فشارِ تخصیصِ مداوم، GC را مرتب
// بیدار می‌کند و هر بیدار شدن یک وقفهٔ کوتاه است.
//
// ═══════════════════════════════════════════════════════════════════════════
// چرا تست به این شکل
// ═══════════════════════════════════════════════════════════════════════════
//
// «سرعت» را نمی‌شود در تستِ واحد سنجید — به ماشین بستگی دارد. ولی
// خودِ **علت** را می‌شود قطعی سنجید: «آیا با یک setState، ویجتِ صفحهٔ
// دیگری ساخته می‌شود؟» یک شمارنده در سازنده جواب را می‌دهد.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

/// شمارندهٔ ساخت، به‌ازای هر «صفحه».
final Map<int, int> built = {};

class _FakePage extends StatelessWidget {
  _FakePage(this.id) {
    built[id] = (built[id] ?? 0) + 1;
  }
  final int id;

  @override
  Widget build(BuildContext context) => Text('صفحه $id');
}

/// همان الگوی `_pageAt` در home_shell: ساختِ تنبل + کش.
class _Shell extends StatefulWidget {
  const _Shell({super.key, required this.cached});

  /// true → الگوی جدید (کش)، false → الگوی قدیمی (getter)
  final bool cached;

  @override
  State<_Shell> createState() => _ShellState();
}

class _ShellState extends State<_Shell> {
  static const count = 12;
  int index = 0;
  int tick = 0;
  final Map<int, Widget> _cache = {};

  Widget _pageAt(int i) => widget.cached
      ? _cache.putIfAbsent(i, () => _FakePage(i))
      : _all()[i];

  /// الگوی قدیمی: کلِ لیست ساخته می‌شود تا یک عنصر برداشته شود.
  List<Widget> _all() => [for (var i = 0; i < count; i++) _FakePage(i)];

  void bump() => setState(() => tick++);
  void go(int i) => setState(() => index = i);

  @override
  Widget build(BuildContext context) => Directionality(
        textDirection: TextDirection.rtl,
        child: Column(children: [Text('$tick'), _pageAt(index)]),
      );
}

void main() {
  setUp(built.clear);

  testWidgets('الگوی قدیمی: یک setState دوازده ویجت می‌سازد (رگرسیون)',
      (tester) async {
    final key = GlobalKey<_ShellState>();
    await tester.pumpWidget(MaterialApp(home: _Shell(key: key, cached: false)));
    expect(built.length, 12, reason: 'همهٔ صفحه‌ها از ابتدا ساخته می‌شوند');

    built.clear();
    key.currentState!.bump();
    await tester.pump();
    // این رفتارِ خراب است؛ اینجا **ثبت** می‌شود تا اگر کسی برگردد،
    // تفاوت با تستِ بعدی فریاد بزند.
    expect(built.length, 12);
  });

  testWidgets('الگوی جدید: فقط صفحهٔ فعال ساخته می‌شود', (tester) async {
    final key = GlobalKey<_ShellState>();
    await tester.pumpWidget(MaterialApp(home: _Shell(key: key, cached: true)));
    expect(built.keys.toList(), [0],
        reason: 'صفحه‌ای که باز نشده نباید هزینه داشته باشد');

    // ده setState پشت سر هم — هیچ ویجتِ تازه‌ای نباید ساخته شود.
    built.clear();
    for (var i = 0; i < 10; i++) {
      key.currentState!.bump();
      await tester.pump();
    }
    expect(built, isEmpty,
        reason: 'setState نباید هیچ صفحه‌ای را دوباره بسازد');
  });

  testWidgets('رفتن به تبِ تازه فقط همان را می‌سازد', (tester) async {
    final key = GlobalKey<_ShellState>();
    await tester.pumpWidget(MaterialApp(home: _Shell(key: key, cached: true)));
    built.clear();

    key.currentState!.go(4);
    await tester.pump();
    expect(built.keys.toList(), [4]);
  });

  testWidgets('بازگشت به تبِ قبلی دوباره نمی‌سازد', (tester) async {
    // این همان سناریوی گزارشِ مالک است: رفتن به بازی و برگشتن.
    final key = GlobalKey<_ShellState>();
    await tester.pumpWidget(MaterialApp(home: _Shell(key: key, cached: true)));
    key.currentState!.go(4);
    await tester.pump();

    built.clear();
    key.currentState!.go(0); // برگشت به خانه
    await tester.pump();
    key.currentState!.go(4); // دوباره به بازی
    await tester.pump();
    expect(built, isEmpty, reason: 'هر دو صفحه از قبل در کش بودند');
  });
}
