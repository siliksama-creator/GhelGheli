import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ghelgheli_mobile/widgets/victory_share_dialog.dart';

/// `users.nickname` در دیتابیس `VARCHAR(100)` است و هیچ‌جا کوتاه نمی‌شود.
/// یعنی نامِ صد کاراکتریِ یک کاربر روی صفحهٔ **کاربرانِ دیگر** هم می‌آید.
/// پیش از دورِ ۲۸ همین دیالوگ با نامِ بلند ۶۰۶ پیکسل سرریز می‌کرد.
void main() {
  const longName = 'محمدامیرحسینِ قهرمانِ بزرگِ بازی‌های قلقلی و فاتحِ لیگِ ماهانه';

  testWidgets('دیالوگ پیروزی با نامِ بلند سرریز نمی‌کند', (tester) async {
    tester.view.physicalSize = const Size(360 * 3, 690 * 3);
    tester.view.devicePixelRatio = 3.0;
    addTearDown(tester.view.reset);

    await tester.pumpWidget(const MaterialApp(
      home: Directionality(
        textDirection: TextDirection.rtl,
        child: VictoryShareDialog(
          nickname: longName,
          gameTitle: 'دوئل کارت',
          scoreText: '۱۲۰',
          referralCode: 'ABC123',
        ),
      ),
    ));
    await tester.pump();

    // اگر RenderFlex سرریز کند، فلاتر استثنا ثبت می‌کند و تست می‌افتد.
    expect(tester.takeException(), isNull);
  });

  testWidgets('نامِ بلند ارتفاعِ ردیف را زیاد نمی‌کند', (tester) async {
    Future<double> heightOf(String nick) async {
      await tester.pumpWidget(MaterialApp(
        home: Directionality(
          textDirection: TextDirection.rtl,
          child: Align(
            alignment: Alignment.topCenter,
            child: SizedBox(
              width: 300,
              child: Row(children: [
                Expanded(
                  child: Text(nick,
                      key: const Key('n'),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 11)),
                ),
                const SizedBox(width: 60, height: 29),
              ]),
            ),
          ),
        ),
      ));
      return tester.getSize(find.byKey(const Key('n'))).height;
    }

    expect(await heightOf(longName), await heightOf('علی'),
        reason: 'با ellipsis، نامِ بلند و کوتاه باید هم‌ارتفاع باشند');
  });
}
