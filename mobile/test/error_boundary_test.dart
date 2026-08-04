// شبکهٔ ایمنیِ خطا — با پرتابِ خطای واقعی، نه فرض.
//
// ═══════════════════════════════════════════════════════════════════════════
// چرا این تست‌ها
// ═══════════════════════════════════════════════════════════════════════════
//
// یک صفحهٔ خطا چیزی است که امیدواریم هرگز دیده نشود — و دقیقاً به همین
// دلیل هرگز دستی تست نمی‌شود. اگر خودش بشکند، هیچ‌کس تا لحظه‌ای که یک
// کاربر واقعی گیر بیفتد نمی‌فهمد.
//
// خطرِ خاصِ این ویجت: دقیقاً وقتی رسم می‌شود که چیزی در درخت شکسته
// است. اگر به `Theme.of(context)` یا به یک `Directionality` بالادست
// تکیه کند و همان شکسته باشد، صفحهٔ خطا هم می‌شکند و کاربر باز همان
// مستطیلِ خاکستری را می‌بیند. تستِ «بدون MaterialApp» همین را می‌سنجد.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:ghelgheli_mobile/core/error_boundary.dart';

/// ویجتی که همیشه در build پرتاب می‌کند.
class _Exploding extends StatelessWidget {
  const _Exploding();

  @override
  Widget build(BuildContext context) {
    throw StateError('انفجارِ عمدی برای تست');
  }
}

void main() {
  final details = FlutterErrorDetails(
    exception: StateError('نمونه خطا برای تست'),
    library: 'test',
  );

  group('صفحهٔ خطا', () {
    testWidgets('پیام فارسی و راه خروج نشان می‌دهد', (tester) async {
      var retried = 0;
      await tester.pumpWidget(AppErrorView(
        details: details,
        onRetry: () => retried++,
      ));

      expect(find.text('یک مشکل پیش آمد'), findsOneWidget);
      expect(find.text('تلاش دوباره'), findsOneWidget);

      // مهم‌ترین ویژگی: کاربر نباید گیر بیفتد.
      await tester.tap(find.text('تلاش دوباره'));
      await tester.pump();
      expect(retried, 1);
    });

    testWidgets('بدون MaterialApp و بدون Theme هم رسم می‌شود', (tester) async {
      // این سناریوی واقعیِ بدترین حالت است: خودِ MaterialApp شکسته.
      // اگر صفحهٔ خطا به بالادست تکیه کند، اینجا پرتاب می‌کند.
      await tester.pumpWidget(AppErrorView(details: details));
      expect(tester.takeException(), isNull);
      expect(find.text('یک مشکل پیش آمد'), findsOneWidget);
    });

    testWidgets('بدون onRetry هم دکمه‌ای نشان نمی‌دهد ولی نمی‌شکند',
        (tester) async {
      await tester.pumpWidget(AppErrorView(details: details));
      expect(find.text('تلاش دوباره'), findsNothing);
      expect(tester.takeException(), isNull);
    });

    testWidgets('راست‌به‌چپ است', (tester) async {
      // متن فارسی در چیدمانِ چپ‌به‌راست به‌هم می‌ریزد، و این ویجت
      // عمداً به Directionality بالادست تکیه نمی‌کند.
      await tester.pumpWidget(AppErrorView(details: details));
      final dir = tester.widget<Directionality>(
        find.byType(Directionality).first,
      );
      expect(dir.textDirection, TextDirection.rtl);
    });

    testWidgets('جزئیات فنی جمع‌شده است، نه جلوی چشم', (tester) async {
      // پیامِ خام برای کاربر ترسناک است، ولی برای تیکت پشتیبانی لازم.
      await tester.pumpWidget(AppErrorView(details: details));
      expect(find.text('جزئیات فنی'), findsOneWidget);
      // متنِ خطا پیش از باز کردن نباید دیده شود.
      expect(find.textContaining('نمونه خطا برای تست'), findsNothing);

      await tester.tap(find.text('جزئیات فنی'));
      await tester.pumpAndSettle();
      expect(find.textContaining('نمونه خطا برای تست'), findsOneWidget);
    });
  });

  group('نصبِ گردانندهٔ خطا', () {
    testWidgets('خطای build به صفحهٔ فارسی تبدیل می‌شود', (tester) async {
      final savedBuilder = ErrorWidget.builder;
      final savedOnError = FlutterError.onError;
      installErrorHandlers();

      await tester.pumpWidget(const MaterialApp(home: _Exploding()));

      // خودِ استثنا را از صفِ تست بردار تا تست به‌خاطرش قرمز نشود؛
      // چیزی که می‌سنجیم این است که کاربر چه می‌بیند.
      expect(tester.takeException(), isA<StateError>());
      expect(find.text('یک مشکل پیش آمد'), findsOneWidget,
          reason: 'به‌جای مستطیلِ خاکستریِ فلاتر باید صفحهٔ فارسی بیاید');

      ErrorWidget.builder = savedBuilder;
      FlutterError.onError = savedOnError;
    });

    testWidgets('نصبِ دوباره، گردانندهٔ قبلی را از بین نمی‌برد',
        (tester) async {
      // `installErrorHandlers` گردانندهٔ قبلی را زنجیر می‌کند، نه
      // جایگزین. اگر جایگزین می‌کرد، لاگِ عادیِ فلاتر از دست می‌رفت و
      // عیب‌یابی در دیباگ کور می‌شد.
      final savedBuilder = ErrorWidget.builder;
      final savedOnError = FlutterError.onError;

      var previousCalled = 0;
      FlutterError.onError = (_) => previousCalled++;
      installErrorHandlers();

      FlutterError.onError!(FlutterErrorDetails(
        exception: StateError('x'),
        library: 'test',
      ));
      expect(previousCalled, 1,
          reason: 'گردانندهٔ قبلی باید همچنان صدا زده شود');

      ErrorWidget.builder = savedBuilder;
      FlutterError.onError = savedOnError;
    });
  });
}
