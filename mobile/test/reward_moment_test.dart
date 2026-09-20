import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ghelgheli_mobile/widgets/reward_moment.dart';

/// قراردادِ «لحظهٔ جایزه» — خواستهٔ مالک در ۲۹ شهریور:
///
/// «هر وقت کاربر امتیاز/سکه/آیتمی می‌گیرد یا نتیجهٔ بازی را می‌بیند، یک لحظه
/// آنچه گرفته را ببیند و یک جشنِ کوچک بگیرد، بعد چند ثانیه برود — بدونِ هیچ
/// اختلالی در ادامهٔ کار.»
///
/// چرا این تست لازم است: لحظه در `Overlay`ِ ریشه می‌نشیند، نه در درختِ
/// ویجتِ صفحه. یعنی اگر روزی کسی `context` را از جای اشتباه بدهد (مثلاً
/// داخلِ یک route یا پس از `pop`) هیچ تستِ ویجتِ معمولی نمی‌گیردش و کاربر
/// فقط می‌بیند «هیچ اتفاقی نیفتاد». تست‌های زیر همان مسیرها را می‌بندند.
void main() {
  setUp(RewardMoment.reset);
  tearDown(RewardMoment.reset);

  /// لحظه یک تایمرِ «چند ثانیه‌ای» برای بستنِ لایه می‌سازد. `flutter_test`
  /// در پایانِ هر تست، تایمرِ معلق را خطا می‌داند (و درست می‌گوید: لایهٔ
  /// روی صفحه نباید برای همیشه بماند). پس هر تست بعد از دیدنِ کارت تا
  /// پایانِ آن پنجره جلو می‌رود — دقیقاً همان کاری که در اپِ واقعی رخ می‌دهد.
  Future<void> settle(WidgetTester tester) async {
    await tester.pump(const Duration(milliseconds: 3200));
    await tester.pump(const Duration(milliseconds: 600));
  }

  Future<void> host(WidgetTester tester, VoidCallback onTap) async {
    await tester.pumpWidget(MaterialApp(
      home: Builder(
        builder: (context) => Scaffold(
          body: Center(
            child: ElevatedButton(
              onPressed: () => onTap(),
              child: const Text('go'),
            ),
          ),
        ),
      ),
    ));
  }

  testWidgets('جایزهٔ ماموریت با رقمِ فارسی و «+» دیده می‌شود', (tester) async {
    late BuildContext ctx;
    await host(tester, () {});
    await tester.pumpWidget(MaterialApp(
      home: Builder(builder: (context) {
        ctx = context;
        return const Scaffold(body: SizedBox());
      }),
    ));
    RewardMoment.moment(
      ctx,
      const RewardMomentData(source: RewardSource.mission, points: 120),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 600));

    // رقم باید فارسی باشد و علامتِ «+» سرِ جایش — لحنِ «چیزی به دست آوردی».
    expect(find.text('+۱۲۰ امتیاز'), findsOneWidget);
    expect(find.text('120 امتیاز'), findsNothing);
    expect(find.text('+120 امتیاز'), findsNothing);
    expect(find.text('دریافت شد'), findsOneWidget);
    // عنوان از قراردادِ متنِ زنده می‌آید؛ در نبودِ config همان فول‌بکِ
    // تاریخی نشان داده می‌شود (بدونِ تغییرِ محسوس برای کاربر).
    expect(find.text('جایزهٔ ماموریت'), findsOneWidget);
    expect(tester.takeException(), isNull);
    await settle(tester);
  });

  testWidgets('باخت هرگز کلمهٔ «باخت» یا نشانِ ضربدر ندارد', (tester) async {
    late BuildContext ctx;
    await tester.pumpWidget(MaterialApp(
      home: Builder(builder: (context) {
        ctx = context;
        return const Scaffold(body: SizedBox());
      }),
    ));
    RewardMoment.moment(
      ctx,
      const RewardMomentData(source: RewardSource.memory, kind: RewardKind.loss),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 600));

    // تصمیمِ صریحِ مالک: «نمی‌دونم چطوری باید بگم که اعصابش خورد نشه.»
    // پس نه کلمهٔ باخت، نه «شما»، نه چیزی که انگشت بگذارد روی بازنده.
    expect(find.text('این دور تمام شد'), findsOneWidget);
    expect(find.textContaining('باخت'), findsNothing);
    expect(find.textContaining('شما'), findsNothing);
    // و کنارِ متن، چیزی که کاربر نگه داشته هم گفته می‌شود.
    expect(find.textContaining('سکه'), findsOneWidget);
    await settle(tester);
  });

  testWidgets('بدون عدد و بدون نتیجه هیچ کارتی نمی‌آید', (tester) async {
    late BuildContext ctx;
    await tester.pumpWidget(MaterialApp(
      home: Builder(builder: (context) {
        ctx = context;
        return const Scaffold(body: SizedBox());
      }),
    ));
    // مسیرهای بی‌جایزه هم از همین تابع رد می‌شوند (پذیرشِ دوستی، فرستادنِ
    // درخواست). کارت برای آن‌ها یعنی دروغ.
    RewardMoment.moment(
      ctx,
      const RewardMomentData(source: RewardSource.mission),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 600));

    expect(find.text('دریافت شد'), findsNothing);
    expect(RewardMoment.showing, isFalse);
    expect(tester.takeException(), isNull);
  });

  testWidgets('آیتمِ به‌دست‌آمده (فروشگاه/گذر نبرد) نشان داده می‌شود',
      (tester) async {
    late BuildContext ctx;
    await tester.pumpWidget(MaterialApp(
      home: Builder(builder: (context) {
        ctx = context;
        return const Scaffold(body: SizedBox());
      }),
    ));
    RewardMoment.moment(
      ctx,
      const RewardMomentData(source: RewardSource.shop, item: 'قاب طلایی'),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 600));

    expect(find.text('خریدِ فروشگاه'), findsOneWidget);
    expect(find.text('قاب طلایی'), findsOneWidget);
    await settle(tester);
  });

  testWidgets('برچسبِ گردونه جای چیپ‌های عددی می‌نشیند', (tester) async {
    late BuildContext ctx;
    await tester.pumpWidget(MaterialApp(
      home: Builder(builder: (context) {
        ctx = context;
        return const Scaffold(body: SizedBox());
      }),
    ));
    RewardMoment.moment(
      ctx,
      const RewardMomentData(
        source: RewardSource.wheel,
        note: '۵۰٬۰۰۰ تومان',
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 600));

    // برچسبِ سرور واژه‌به‌واژه نشان داده می‌شود؛ اگر کلاینت خودش عدد را
    // قالب می‌کرد، دو روایتِ متفاوت برای یک جایزه ساخته می‌شد.
    expect(find.text('۵۰٬۰۰۰ تومان'), findsOneWidget);
    expect(find.text('جایزهٔ گردونه'), findsOneWidget);
    await settle(tester);
  });

  testWidgets('دو لحظهٔ پشت‌سرهم صف می‌شوند، نه روی‌هم', (tester) async {
    late BuildContext ctx;
    await tester.pumpWidget(MaterialApp(
      home: Builder(builder: (context) {
        ctx = context;
        return const Scaffold(body: SizedBox());
      }),
    ));
    RewardMoment.moment(
      ctx,
      const RewardMomentData(source: RewardSource.mission, points: 10),
    );
    RewardMoment.moment(
      ctx,
      const RewardMomentData(source: RewardSource.daily, points: 25),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 600));

    expect(find.text('+۱۰ امتیاز'), findsOneWidget);
    expect(find.text('+۲۵ امتیاز'), findsNothing, reason: 'دومی باید در صف بماند');
    expect(RewardMoment.queueLength, 1);

    // پس از پایانِ پنجرهٔ اولی، نوبتِ دومی می‌رسد.
    await tester.pump(const Duration(milliseconds: 3200));
    await tester.pump(const Duration(milliseconds: 600));
    expect(find.text('+۲۵ امتیاز'), findsOneWidget);
    expect(find.text('+۱۰ امتیاز'), findsNothing);
    expect(tester.takeException(), isNull);
    await settle(tester);
  });

  testWidgets('لمس از لحظه رد می‌شود (کارت دکمهٔ زیرش را نمی‌خورد)',
      (tester) async {
    var taps = 0;
    late BuildContext ctx;
    await tester.pumpWidget(MaterialApp(
      home: Builder(builder: (context) {
        ctx = context;
        return Scaffold(
          body: Center(
            child: ElevatedButton(
              onPressed: () => taps += 1,
              child: const Text('again'),
            ),
          ),
        );
      }),
    ));
    RewardMoment.moment(
      ctx,
      const RewardMomentData(source: RewardSource.mission, points: 5),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 600));
    expect(find.text('+۵ امتیاز'), findsOneWidget);

    // دکمه هنوز زیرِ کارت است؛ باید قابلِ کلیک بماند (IgnorePointer).
    await tester.tap(find.text('again'), warnIfMissed: false);
    await tester.pump();
    expect(taps, 1);
    await settle(tester);
  });
}
