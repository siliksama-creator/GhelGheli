// نگهبانِ اعلانِ سینماییِ شروعِ راند.
//
// ═══════════════════════════════════════════════════════════════════════════
// چه چیزی سنجیده می‌شود و چرا
// ═══════════════════════════════════════════════════════════════════════════
//
// خواستهٔ مالک: «وقتی راند شروع میشه اینکه مبارزه هر راند سر چی هستش باید
// با انیمیشن زیبا وسط صفحه نشون داده بشه».
//
// ⚠️ درسِ ثبت‌شدهٔ این پروژه: «تستی که سبز است ولی چیزی را نمی‌سنجد».
//
// بنرِ قبلی هم متن داشت — فقط ۹ پیکسلی و گم‌شده بود. پس `find.text()`
// به‌تنهایی اثباتِ هیچ‌چیز نیست. اینجا این‌ها سنجیده می‌شوند:
//
//   • اندازهٔ فونتِ شعار (باید درشت باشد، نه صرفاً موجود)
//   • واقعاً **وسطِ صفحه** باشد، نه گوشه‌ای
//   • بعد از دو ثانیه **برود** (وگرنه جلوی بازی را می‌گیرد)
//   • با راندِ تازه **دوباره** بیاید
//   • `IgnorePointer` داشته باشد تا کاربر بتواند وسطش کارت بزند
//   • راهنمای سنِ پایین نمایش داده شود
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ghelgheli_mobile/screens/user/games/card_duel_page.dart';

Widget _wrap(Widget child) => MaterialApp(
      home: Directionality(
        textDirection: TextDirection.rtl,
        child: Scaffold(body: Stack(children: [const SizedBox.expand(), child])),
      ),
    );

const _focus = <String, dynamic>{
  'stat': 'speed',
  'label': 'ضدحمله سرعتی',
  'text': 'سرعت کارت ضدحمله را ساخت',
  'cry': 'سریع‌ترین کارتت را بفرست!',
  'hint': 'کارتی که عددِ سرعتش بیشتر است برنده می‌شود',
  'emoji': '⚡',
};

void main() {
  testWidgets('شعارِ راند وسطِ صفحه و درشت نمایش داده می‌شود', (tester) async {
    await tester.pumpWidget(_wrap(const CardDuelRoundIntroForTest(
      focus: _focus, roundNumber: 1, totalRounds: 5)));
    await tester.pump(const Duration(milliseconds: 500));

    final cry = find.textContaining('سریع‌ترین کارتت را بفرست');
    expect(cry, findsOneWidget, reason: 'شعارِ راند باید دیده شود');

    // ── اندازه، نه صرفاً وجود ──
    // نقصِ قبلی این بود که متن وجود داشت ولی ۹پیکسلی بود.
    final style = tester.widget<Text>(cry).style!;
    expect(style.fontSize, greaterThanOrEqualTo(22),
        reason: 'شعار باید درشت باشد وگرنه همان نقصِ قبلی تکرار می‌شود');
    expect(style.fontWeight, FontWeight.w900);

    // ── واقعاً وسطِ صفحه ──
    final screen = tester.getSize(find.byType(Scaffold));
    final box = tester.getRect(cry);
    final dx = (box.center.dx - screen.width / 2).abs();
    expect(dx, lessThan(30), reason: 'شعار باید افقی وسط باشد');
    expect(box.center.dy, greaterThan(screen.height * 0.2));
    expect(box.center.dy, lessThan(screen.height * 0.8),
        reason: 'شعار باید عمودی هم مرکزِ صفحه باشد، نه بالا/پایینِ گوشه');
  });

  testWidgets('راهنمای گروهِ سنیِ پایین و نامِ ویژگی نشان داده می‌شود',
      (tester) async {
    await tester.pumpWidget(_wrap(const CardDuelRoundIntroForTest(
      focus: _focus, roundNumber: 2, totalRounds: 5)));
    await tester.pump(const Duration(milliseconds: 500));

    expect(find.textContaining('عددِ سرعتش بیشتر است'), findsOneWidget,
        reason: 'بچه‌ای که تازه خواندن یاد گرفته باید بفهمد چه کار کند');
    expect(find.textContaining('«سرعت» + افکت آشکار = عدد نهایی'), findsOneWidget);
    expect(find.textContaining('راند ۲ از ۵'), findsOneWidget);
  });

  testWidgets('اعلان بعد از دو ثانیه می‌رود و جلوی بازی را نمی‌گیرد',
      (tester) async {
    await tester.pumpWidget(_wrap(const CardDuelRoundIntroForTest(
      focus: _focus, roundNumber: 1, totalRounds: 5)));
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.textContaining('سریع‌ترین'), findsOneWidget);

    // در تمامِ مدتِ نمایش نباید ضربه‌ها را ببلعد.
    expect(find.byType(IgnorePointer), findsWidgets,
        reason: 'کاربر باید بتواند وسطِ انیمیشن کارتش را بزند');

    await tester.pump(const Duration(milliseconds: 2200));
    await tester.pumpAndSettle();
    expect(find.textContaining('سریع‌ترین'), findsNothing,
        reason: 'اعلانِ ماندگار جلوی دیدنِ کارت‌ها را می‌گیرد');
  });

  testWidgets('راندِ تازه اعلانِ تازه می‌سازد', (tester) async {
    await tester.pumpWidget(_wrap(const CardDuelRoundIntroForTest(
      focus: _focus, roundNumber: 1, totalRounds: 5)));
    await tester.pump(const Duration(milliseconds: 2400));
    await tester.pumpAndSettle();
    expect(find.textContaining('سریع‌ترین'), findsNothing);

    // همان ویجت، راندِ بعدی با تمرکزِ تازه.
    const next = <String, dynamic>{
      'stat': 'attack', 'label': 'فشار حمله', 'text': '',
      'cry': 'حمله کن!', 'hint': 'کارتی که عددِ حمله‌اش بیشتر است برنده می‌شود',
      'emoji': '🔥',
    };
    await tester.pumpWidget(_wrap(const CardDuelRoundIntroForTest(
      focus: next, roundNumber: 2, totalRounds: 5)));
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.textContaining('حمله کن'), findsOneWidget,
        reason: 'بدونِ ریست، فقط راندِ اول انیمیشن می‌گرفت');
  });

  testWidgets('بدونِ تمرکز، اعلان اصلاً رندر نمی‌شود', (tester) async {
    await tester.pumpWidget(_wrap(const CardDuelRoundIntroForTest(
      focus: null, roundNumber: 1, totalRounds: 5)));
    await tester.pump(const Duration(milliseconds: 300));
    expect(find.textContaining('راند'), findsNothing,
        reason: 'حالتِ پایانِ بازی نباید اعلانِ خالی نشان دهد');
  });
}
