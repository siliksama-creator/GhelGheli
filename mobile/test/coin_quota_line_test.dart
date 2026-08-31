import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ghelgheli_mobile/widgets/coin_quota_line.dart';

/// خطِ سهمیهٔ سکهٔ روزانه در صفحهٔ انتخابِ ورودی.
///
/// این خط تنها جایی است که کاربر پیش از شروعِ بازی می‌فهمد بردِ بعدی‌اش سکه
/// دارد یا نه. اگر عددِ اشتباه نشان بدهد، بدتر از آن است که اصلاً نباشد —
/// پس هر حالتِ دادهٔ ناقص باید به سکوت ختم شود، نه به حدس.
///
/// دو دامِ واقعی که این تست‌ها می‌بندند:
///   ۱. کلیدهای JSON رشته‌اند (`'100'`)، نه عدد. جست‌وجو با کلیدِ عددی
///      همیشه `null` می‌دهد و خط هرگز دیده نمی‌شود — یک خرابیِ خاموش.
///   ۲. تمرین (۰) و لابی (−۱) اصلاً سکه نمی‌دهند، پس نمایشِ سهمیه در آن‌ها
///      به کاربر وعدهٔ چیزی را می‌دهد که وجود ندارد.

Widget _wrap(Widget child) => MaterialApp(
      home: Scaffold(
        body: Center(child: SizedBox(width: 340, child: child)),
      ),
    );

/// شکلِ واقعیِ `coinQuota` در پاسخِ `/api/bootstrap` — کلیدها رشته‌اند،
/// چون از `JSON.stringify` سمتِ Node می‌آیند.
Map<String, dynamic> quota({int r100 = 30, int r1000 = 15}) => {
      'date': '2026-08-15',
      'used': {'100': 30 - r100, '1000': 15 - r1000},
      'limit': {'100': 30, '1000': 15},
      'remaining': {'100': r100, '1000': r1000},
    };

void main() {
  group('CoinQuotaLine', () {
    testWidgets('سهمیهٔ باقی‌مانده را با رقم فارسی نشان می‌دهد', (t) async {
      await t.pumpWidget(_wrap(CoinQuotaLine(mode: 100, quota: quota(r100: 7))));
      expect(find.textContaining('۷'), findsOneWidget);
      expect(find.textContaining('برد دیگر سکه می‌دهد'), findsOneWidget);
      expect(find.byType(Image), findsOneWidget);
    });

    testWidgets('هر ورودی سهمیهٔ خودش را می‌خواند', (t) async {
      await t.pumpWidget(
          _wrap(CoinQuotaLine(mode: 1000, quota: quota(r100: 30, r1000: 4))));
      // اگر کلیدِ ورودی نادیده گرفته شود، ۳۰ نشان می‌دهد نه ۴.
      expect(find.textContaining('۴'), findsOneWidget);
      expect(find.textContaining('۳۰'), findsNothing);
    });

    testWidgets('سهمیهٔ تمام‌شده پیامِ صریح می‌دهد، نه عددِ صفر', (t) async {
      await t.pumpWidget(_wrap(CoinQuotaLine(mode: 100, quota: quota(r100: 0))));
      expect(find.textContaining('پر شده'), findsOneWidget);
      expect(find.textContaining('برد امتیاز دارد، سکه نه'), findsOneWidget);
      expect(find.textContaining('برد دیگر سکه می‌دهد'), findsNothing);
    });

    testWidgets('در تمرینِ رایگان و لابی هیچ چیزی نشان نمی‌دهد', (t) async {
      // عمداً کلیدِ '0' و '-1' را هم می‌گذاریم. امروز سرور چنین کلیدی
      // نمی‌فرستد، ولی اگر بدونِ آن‌ها تست کنیم، صرفاً «کلید پیدا نشد» را
      // می‌سنجیم نه قانونِ واقعی را: تمرین و لابی هرگز سکه نمی‌دهند، پس
      // حتی اگر سرور روزی عددی برایشان بفرستد نباید نشان داده شود.
      final withBogusKeys = {
        'remaining': {'0': 12, '-1': 12, '100': 30, '1000': 15},
      };
      for (final mode in [0, -1]) {
        await t.pumpWidget(_wrap(CoinQuotaLine(mode: mode, quota: withBogusKeys)));
        expect(find.byType(Text), findsNothing, reason: 'mode=$mode');
        expect(find.byType(Image), findsNothing, reason: 'mode=$mode');
      }
    });

    testWidgets('بدون دادهٔ سهمیه ساکت می‌ماند', (t) async {
      await t.pumpWidget(_wrap(const CoinQuotaLine(mode: 100, quota: null)));
      expect(find.byType(Text), findsNothing);
    });

    testWidgets('دادهٔ ناقص یا بدشکل هم کرش نمی‌کند و ساکت می‌ماند', (t) async {
      final broken = <Map<String, dynamic>?>[
        {},
        {'remaining': null},
        {'remaining': 'oops'},
        {'remaining': <String, dynamic>{}},
        {'remaining': {'1000': 5}}, // کلیدِ ۱۰۰ اصلاً نیست
      ];
      for (final q in broken) {
        await t.pumpWidget(_wrap(CoinQuotaLine(mode: 100, quota: q)));
        expect(find.byType(Text), findsNothing, reason: '$q');
      }
    });

    testWidgets('اگر سرور روزی عدد بفرستد به‌جای رشته هم کار می‌کند', (t) async {
      await t.pumpWidget(_wrap(const CoinQuotaLine(
        mode: 100,
        quota: {
          'remaining': {100: 9}
        },
      )));
      expect(find.textContaining('۹'), findsOneWidget);
    });

    testWidgets('در عرضِ باریک overflow نمی‌دهد', (t) async {
      await t.pumpWidget(MaterialApp(
        home: Scaffold(
          body: Center(
            child: SizedBox(
              width: 200,
              child: CoinQuotaLine(mode: 100, quota: quota(r100: 0)),
            ),
          ),
        ),
      ));
      expect(testerExceptions(), isEmpty);
    });
  });
}

/// خطاهای رندر (از جمله overflow) در `FlutterError.onError` جمع می‌شوند و
/// تست را قرمز می‌کنند؛ این کمکی فقط خوانایی ادعا را بالا می‌برد.
List<Object> testerExceptions() {
  final e = <Object>[];
  final pending = TestWidgetsFlutterBinding.instance.takeException();
  if (pending != null) e.add(pending);
  return e;
}
