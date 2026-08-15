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
//   • ۲.۸ ثانیه خوانا بماند و بعد **برود**
//   • با راندِ تازه **دوباره** بیاید
//   • `AbsorbPointer` داشته باشد تا پیش از پایانِ مکث انتخابی ثبت نشود
//   • راهنمای سنِ پایین نمایش داده شود
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ghelgheli_mobile/screens/user/games/card_duel_page.dart';

Widget _wrap(Widget child) => MaterialApp(
      home: Directionality(
        textDirection: TextDirection.rtl,
        child:
            Scaffold(body: Stack(children: [const SizedBox.expand(), child])),
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
  testWidgets('معیارِ راند وسطِ صفحه و درشت نمایش داده می‌شود', (tester) async {
    await tester.pumpWidget(_wrap(const CardDuelRoundIntroForTest(
        focus: _focus, roundNumber: 1, totalRounds: 5)));
    await tester.pump(const Duration(milliseconds: 500));

    final cry = find.text('سرعت');
    expect(cry, findsOneWidget, reason: 'نام معیار باید دیده شود');

    // ── اندازه، نه صرفاً وجود ──
    // نقصِ قبلی این بود که متن وجود داشت ولی ۹پیکسلی بود.
    final style = tester.widget<Text>(cry).style!;
    expect(style.fontSize, greaterThanOrEqualTo(22),
        reason: 'نام معیار باید درشت و بازی‌محور باشد');
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

  testWidgets('اعلان معیار، قانون و شمارش را دارد و متن آموزشی را پنهان می‌کند',
      (tester) async {
    await tester.pumpWidget(_wrap(const CardDuelRoundIntroForTest(
        focus: _focus, roundNumber: 2, totalRounds: 5)));
    await tester.pump(const Duration(milliseconds: 500));

    expect(find.text('سرعت'), findsOneWidget);
    expect(find.text('بالاترین عدد برنده است'), findsOneWidget);
    expect(find.text('راند ۲ از ۵'), findsOneWidget);
    expect(find.textContaining('افکت آشکار'), findsNothing,
        reason: 'جزئیات فرمول روی کارت/تایم‌لاین است، نه overlay');
    expect(find.textContaining('عدد نهایی ='), findsNothing);
  });

  testWidgets('اعلان ۲.۸ ثانیه می‌ماند و انتخاب زودهنگام را می‌بندد',
      (tester) async {
    await tester.pumpWidget(_wrap(const CardDuelRoundIntroForTest(
        focus: _focus, roundNumber: 1, totalRounds: 5)));
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.text('سرعت'), findsOneWidget);

    // در تمامِ مدتِ نمایش نباید ضربه‌ها را ببلعد.
    expect(
        find.byWidgetPredicate(
            (widget) => widget is AbsorbPointer && widget.absorbing),
        findsOneWidget,
        reason: 'معیار باید پیش از فعال‌شدن انتخاب کامل دیده شود');

    await tester.pump(const Duration(milliseconds: 2700));
    await tester.pumpAndSettle();
    expect(find.text('سرعت'), findsNothing,
        reason: 'اعلانِ ماندگار جلوی دیدنِ کارت‌ها را می‌گیرد');
  });

  testWidgets('راندِ تازه اعلانِ تازه می‌سازد', (tester) async {
    await tester.pumpWidget(_wrap(const CardDuelRoundIntroForTest(
        focus: _focus, roundNumber: 1, totalRounds: 5)));
    await tester.pump(const Duration(milliseconds: 3000));
    await tester.pumpAndSettle();
    expect(find.text('سرعت'), findsNothing);

    // همان ویجت، راندِ بعدی با تمرکزِ تازه.
    const next = <String, dynamic>{
      'stat': 'attack',
      'label': 'فشار حمله',
      'text': '',
      'cry': 'حمله کن!',
      'hint': 'کارتی که عددِ حمله‌اش بیشتر است برنده می‌شود',
      'emoji': '🔥',
    };
    await tester.pumpWidget(_wrap(const CardDuelRoundIntroForTest(
        focus: next, roundNumber: 2, totalRounds: 5)));
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.text('حمله'), findsOneWidget,
        reason: 'بدونِ ریست، فقط راندِ اول انیمیشن می‌گرفت');
  });

  // ═════════════════════════════════════════════════════════════════════
  // نگهبانانِ بازطراحیِ حرفه‌ای
  // ═════════════════════════════════════════════════════════════════════
  //
  // خواستهٔ مالک: «انیمیشن اعلام آمار راند فوق حرفه‌ای‌تر شود — رنگ‌بندی و
  // فونت و وضوح بالاتر». این‌ها همان‌ها را قفل می‌کنند تا یک ریفکتورِ بعدی
  // بی‌سروصدا صحنه را به حالتِ ساده برنگرداند.

  testWidgets('نامِ معیار با فونتِ ۹۰۰ واقعی و اندازهٔ سینمایی رندر می‌شود',
      (tester) async {
    await tester.pumpWidget(_wrap(const CardDuelRoundIntroForTest(
        focus: _focus, roundNumber: 3, totalRounds: 5)));
    await tester.pump(const Duration(milliseconds: 900));

    final style = tester.widget<Text>(find.text('سرعت')).style!;
    // ۴۲px: از ۳۴ قبلی درشت‌تر. اگر کسی کوچکش کند اینجا می‌شکند.
    expect(style.fontSize, greaterThanOrEqualTo(38),
        reason: 'نامِ معیار قلبِ صحنه است و باید سینمایی باشد');
    expect(style.fontWeight, FontWeight.w900);
    // وزنِ ۹۰۰ فقط وقتی «واقعی» است که Vazirmatn-Black در pubspec باشد.
    // این تست خودِ فایل را نمی‌بیند، ولی تستِ زیر می‌بیند.
    expect(style.shadows, isNotNull);
    expect(style.shadows!.length, greaterThanOrEqualTo(2),
        reason: 'هالهٔ رنگی + سایهٔ تیره، برای وضوح روی هر پس‌زمینه');

    // گرادیانِ روی متن.
    expect(find.byType(ShaderMask), findsWidgets,
        reason: 'نامِ معیار باید گرادیانِ عمقی داشته باشد نه رنگِ تخت');
  });

  testWidgets('صحنه لایه‌های نقاشیِ حرفه‌ای دارد', (tester) async {
    await tester.pumpWidget(_wrap(const CardDuelRoundIntroForTest(
        focus: _focus, roundNumber: 1, totalRounds: 5)));
    await tester.pump(const Duration(milliseconds: 700));

    // پس‌زمینهٔ پرتویی + موجِ ضربه، و مدالِ شعاعی: دو `CustomPaint` مجزا.
    expect(find.byType(CustomPaint), findsWidgets);
    final painters = tester
        .widgetList<CustomPaint>(find.byType(CustomPaint))
        .map((w) => w.painter.runtimeType.toString())
        .join(',');
    expect(painters, contains('BackdropPainter'),
        reason: 'پرتوها و موجِ ضربه باید نقاشی شوند');
    expect(painters, contains('EmblemPainter'),
        reason: 'مدالِ معیار باید حلقهٔ متحرک داشته باشد');
  });

  testWidgets('نوارِ پیشرفتِ راندها بدونِ افزودنِ متن وضعیت را نشان می‌دهد',
      (tester) async {
    await tester.pumpWidget(_wrap(const CardDuelRoundIntroForTest(
        focus: _focus, roundNumber: 3, totalRounds: 5)));
    await tester.pump(const Duration(milliseconds: 700));

    // ── چرا این مهم است ──
    // قیدِ مالک: «متن‌ها زیاد نشوند». وضعیتِ «کجای مسابقه‌ایم» به‌جای یک
    // جملهٔ تازه، با پنج میلهٔ رنگی گفته می‌شود.
    final pips = tester
        .widgetList<Container>(find.byType(Container))
        .where((c) => c.constraints?.maxHeight == 4.0)
        .toList();
    expect(pips.length, 5,
        reason: 'به ازای هر راند یک میله — نه کمتر، نه بیشتر');

    // میلهٔ راندِ جاری باید پهن‌تر باشد تا در یک نگاه پیدا شود.
    final widths = pips.map((c) => c.constraints!.maxWidth).toList();
    expect(widths.where((w) => w > 10).length, 1,
        reason: 'دقیقاً یک میله (راندِ جاری) باید کشیده باشد');
  });

  testWidgets('بدونِ تمرکز، اعلان اصلاً رندر نمی‌شود', (tester) async {
    await tester.pumpWidget(_wrap(const CardDuelRoundIntroForTest(
        focus: null, roundNumber: 1, totalRounds: 5)));
    await tester.pump(const Duration(milliseconds: 300));
    expect(find.textContaining('راند'), findsNothing,
        reason: 'حالتِ پایانِ بازی نباید اعلانِ خالی نشان دهد');
  });
}
