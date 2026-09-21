// نگهبانِ کادرِ «معیارِ راند» در اندروید — همان چیزی که مالک (۲۹ شهریور) با
// اسکرین‌شات خواست: «اونجا که نشون می‌ده هر راند سر چی قراره بازی بشه، اون رو
// یه کادر و زیباسازی کن که خیلی تو چشم باشه».
//
// چرا تستِ ویجتی و نه فقط تستِ ایستا: `_FocusBanner` تا این دور هیچ‌جا
// استفاده نمی‌شد، پس هیچ‌وقت ساخته نمی‌شد و دو باگِ پنهان داشت:
//   ۱) سازنده `key` نمی‌گرفت (خطای کامپایل به‌محضِ استفاده)،
//   ۲) با `SingleTickerProviderStateMixin` دو AnimationController می‌ساخت
//      (assertِ فریم‌ورک در لحظهٔ ساخت).
// این فایل، خودِ رندرِ واقعی را اجرا می‌کند تا هر دو دسته باگ دوباره برنگردد
// و اندازه/جای اجزا هم سنجیده شود (چشمِ کاربر، نه فقط وجودِ رشته).
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
// ⚠️ `card_duel_widgets.dart` یک `part` از همین کتابخانه است، پس باید از
// طریقِ خودِ صفحه import شود (همان کاری که تست‌های موجود می‌کنند).
import 'package:ghelgheli_mobile/screens/user/games/card_duel_page.dart';
import 'package:ghelgheli_mobile/theme/app_theme.dart';

const _focus = <String, dynamic>{
  'stat': 'speed',
  'label': 'ضدحمله سرعتی',
  'text': 'عدد نهایی = سرعت + افکت آشکار؛ عدد بالاتر برنده است',
  'hint': 'عدد نهایی = سرعت + افکت آشکار؛ عدد بالاتر برنده است',
  'icon': 'bolt',
};

Widget _wrap(Widget child) => MaterialApp(
      theme: AppTheme.dark(),
      home: Directionality(
        textDirection: TextDirection.rtl,
        child: Scaffold(body: SizedBox(width: 420, child: child)),
      ),
    );

void main() {
  group('کادرِ معیارِ راند (اندروید)', () {
    testWidgets('نامِ معیار درشت و رنگی است و شمارهٔ راند را می‌گوید',
        (tester) async {
      await tester.pumpWidget(_wrap(const CardDuelFocusBoxForTest(
        focus: _focus,
        roundNumber: 2,
        dense: true,
      )));
      await tester.pump(const Duration(milliseconds: 600));

      // متنِ درشت = برچسبِ بک‌اند («ضدحمله سرعتی») — آینهٔ کادرِ وب.
      final big = find.text('ضدحمله سرعتی');
      expect(big, findsOneWidget);
      final style = tester.widget<Text>(big).style!;
      expect(style.fontSize, greaterThanOrEqualTo(15),
          reason: 'نامِ معیار باید درشت باشد، نه قرصِ ۱۲پیکسلی');
      expect(style.fontWeight, FontWeight.w900);

      // شمارهٔ راند روی کادر.
      expect(find.textContaining('راند ۲'), findsOneWidget);
      expect(find.textContaining('نبرد بر سر'), findsOneWidget);
    });

    testWidgets('در حالتِ فشرده خطِ راهنما پنهان است (ارتفاعِ اضافه نمی‌سازد)',
        (tester) async {
      await tester.pumpWidget(_wrap(const CardDuelFocusBoxForTest(
        focus: _focus,
        dense: true,
      )));
      await tester.pump(const Duration(milliseconds: 600));
      expect(find.textContaining('عدد نهایی'), findsNothing);

      // در حالتِ معمولی همان خط دیده می‌شود (رگرسیونِ برعکس هم گرفته شود).
      await tester.pumpWidget(_wrap(const CardDuelFocusBoxForTest(
        focus: _focus,
      )));
      await tester.pump(const Duration(milliseconds: 600));
      expect(find.textContaining('عدد نهایی'), findsOneWidget);
    });

    testWidgets('راندِ طوفانی نشانِ «×۲ دوامتیازی» می‌گیرد', (tester) async {
      await tester.pumpWidget(_wrap(const CardDuelFocusBoxForTest(
        focus: _focus,
        dense: true,
        storm: true,
      )));
      await tester.pump(const Duration(milliseconds: 600));
      expect(find.textContaining('دو‌امتیازی'), findsOneWidget);
    });

    testWidgets('آیکونِ معیار سمتِ راستِ کادر است (قراردادِ RTL مالک)',
        (tester) async {
      await tester.pumpWidget(_wrap(const CardDuelFocusBoxForTest(
        focus: _focus,
        dense: true,
      )));
      await tester.pump(const Duration(milliseconds: 600));
      // آیکون = تنها Iconِ کادر؛ متن = برچسبِ درشت.
      final icon = find.byType(Icon);
      expect(icon, findsOneWidget);
      final iconX = tester.getCenter(icon).dx;
      final labelX = tester.getCenter(find.text('ضدحمله سرعتی')).dx;
      expect(iconX, greaterThan(labelX),
          reason: 'در چیدمانِ راست‌به‌چپ آیکون باید راست‌تر از متن بنشیند');

      // و کلِ کادر باید از لبهٔ راستِ صفحه فاصلهٔ کمی داشته باشد، یعنی
      // واقعاً در سمتِ راست نشسته باشد.
      final boxRight = tester.getTopRight(find.byType(CardDuelFocusBoxForTest)).dx;
      expect(boxRight, greaterThan(400 - 60));
    });

    testWidgets('ویجت بدونِ استثنا ساخته و دوباره‌سازی می‌شود (تلهٔ تیکر)',
        (tester) async {
      await tester.pumpWidget(_wrap(const CardDuelFocusBoxForTest(
        focus: _focus,
        dense: true,
      )));
      await tester.pump(const Duration(milliseconds: 300));
      // راندِ بعد = ویجتِ تازه با ورودیِ تازه؛ باید مثلِ اپ رفتار کند.
      await tester.pumpWidget(_wrap(const CardDuelFocusBoxForTest(
        focus: {
          'stat': 'defense',
          'label': 'دیوار دفاعی',
          'text': 'عدد نهایی = دفاع + افکت آشکار؛ عدد بالاتر برنده است',
        },
        roundNumber: 3,
        dense: true,
        storm: true,
      )));
      await tester.pump(const Duration(milliseconds: 600));
      expect(tester.takeException(), isNull);
      expect(find.text('دیوار دفاعی'), findsOneWidget);
      expect(find.textContaining('راند ۳'), findsOneWidget);
    });
  });
}
