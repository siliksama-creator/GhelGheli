import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ghelgheli_mobile/widgets/reward_burst.dart';

/// قراردادِ «جشنِ دریافت» — همان چیزی که مالک در دورِ ۳۱ خواست:
/// کاربر باید **جلوی چشمش** ببیند چه چیزی گرفت، بدونِ ایموجی، و در وب و
/// اندروید یک‌شکل.
///
/// چرا این تست لازم است: جشن در `Overlay`ِ ریشه می‌نشیند، نه در درختِ
/// ویجتِ صفحه. یعنی اگر روزی کسی `context` را از جای اشتباه بدهد (مثلاً
/// داخلِ یک `DialoگRoute` یا پس از `pop`) هیچ تستِ ویجتِ معمولی نمی‌گیردش و
/// کاربر فقط می‌بیند «هیچ اتفاقی نیفتاد». تست‌های زیر همان دو حالت را
/// می‌بندند: مسیرِ درست باید رسم کند، و مقدارِ صفر باید ساکت باشد.
void main() {
  setUp(RewardBurst.reset);
  tearDown(RewardBurst.reset);

  /// جشن یک تایمرِ ۲٬۴ثانیه‌ای برای بستنِ لایه می‌سازد. `flutter_test` در
  /// پایانِ هر تست، تایمرِ معلق را خطا می‌داند (و درست می‌گوید: لایهٔ روی
  /// صفحه نباید برای همیشه بماند). پس هر تست بعد از دیدنِ جشن تا پایانِ آن
  /// پنجره جلو می‌رود — دقیقاً همان کاری که در اپِ واقعی رخ می‌دهد.
  Future<void> settle(WidgetTester tester) async {
    await tester.pump(const Duration(milliseconds: 2500));
    await tester.pump(const Duration(milliseconds: 400));
  }

  Future<void> host(WidgetTester tester) async {
    await tester.pumpWidget(MaterialApp(
      home: Builder(
        builder: (context) => Scaffold(
          body: Center(
            child: ElevatedButton(
              onPressed: () => RewardBurst.celebrate(
                context,
                const RewardBurstData(source: RewardSource.mission, points: 120),
              ),
              child: const Text('claim'),
            ),
          ),
        ),
      ),
    ));
  }

  testWidgets('جایزهٔ ماموریت با رقمِ فارسی و «دریافت شد» دیده می‌شود',
      (tester) async {
    await host(tester);
    await tester.tap(find.text('claim'));
    await tester.pump(); // درجِ لایه
    await tester.pump(const Duration(milliseconds: 500)); // پایانِ انیمیشن

    // رقم باید فارسی باشد، نه لاتین: در کلِ محصول عددِ لاتین جایی ندارد.
    expect(find.text('۱۲۰ امتیاز'), findsOneWidget);
    // و هیچ رقمِ لاتینی: در کلِ محصول عددِ لاتین جایی ندارد.
    expect(find.text('120 امتیاز'), findsNothing);
    expect(find.text('دریافت شد'), findsOneWidget);
    expect(find.text('جایزهٔ ماموریت'), findsOneWidget);
    expect(tester.takeException(), isNull);
    await settle(tester);
  });

  testWidgets('بدون عدد و بدون یادداشت هیچ جشنی نمی‌آید', (tester) async {
    await tester.pumpWidget(MaterialApp(
      home: Builder(
        builder: (context) => Scaffold(
          body: Center(
            child: ElevatedButton(
              onPressed: () => RewardBurst.celebrate(context,
                  const RewardBurstData(source: RewardSource.mission)),
              // مسیرهای بی‌جایزه هم از همین تابع رد می‌شوند (پذیرشِ دوستی،
              // فرستادنِ درخواست). جشن برای آن‌ها یعنی دروغ.
              child: const Text('friend-request'),
            ),
          ),
        ),
      ),
    ));
    await tester.tap(find.text('friend-request'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));

    expect(find.text('دریافت شد'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('برچسبِ گردونه جای چیپ‌های عددی می‌نشیند', (tester) async {
    await tester.pumpWidget(MaterialApp(
      home: Builder(
        builder: (context) => Scaffold(
          body: Center(
            child: ElevatedButton(
              onPressed: () => RewardBurst.celebrate(
                context,
                const RewardBurstData(
                  source: RewardSource.wheel,
                  note: '۵۰٬۰۰۰ تومان',
                ),
              ),
              child: const Text('spin'),
            ),
          ),
        ),
      ),
    ));
    await tester.tap(find.text('spin'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));

    // برچسبِ سرور واژه‌به‌واژه نشان داده می‌شود؛ اگر کلاینت خودش عدد را
    // قالب می‌کرد، دو روایتِ متفاوت برای یک جایزه ساخته می‌شد.
    expect(find.text('۵۰٬۰۰۰ تومان'), findsOneWidget);
    expect(find.text('جایزهٔ گردونه'), findsOneWidget);
    await settle(tester);
  });

  testWidgets('دو جایزهٔ پشت‌سرهم صف می‌شوند، نه روی‌هم', (tester) async {
    await tester.pumpWidget(MaterialApp(
      home: Builder(
        builder: (context) => Scaffold(
          body: Center(
            child: ElevatedButton(
              onPressed: () {
                RewardBurst.celebrate(context,
                    const RewardBurstData(source: RewardSource.mission, points: 10));
                RewardBurst.celebrate(context,
                    const RewardBurstData(source: RewardSource.daily, points: 25));
              },
              child: const Text('claim-all'),
            ),
          ),
        ),
      ),
    ));
    await tester.tap(find.text('claim-all'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));

    expect(find.text('۱۰ امتیاز'), findsOneWidget);
    expect(find.text('۲۵ امتیاز'), findsNothing, reason: 'دومی باید در صف بماند');

    // پس از پایانِ پنجرهٔ اولی (۲٬۴ ثانیه) نوبتِ دومی می‌رسد.
    await tester.pump(const Duration(milliseconds: 2500));
    await tester.pump(const Duration(milliseconds: 500));
    expect(find.text('۲۵ امتیاز'), findsOneWidget);
    expect(find.text('۱۰ امتیاز'), findsNothing);
    expect(tester.takeException(), isNull);
    await settle(tester);
  });

  testWidgets('کلیک از جشن رد می‌شود (جشن دکمهٔ زیرش را نمی‌خورد)',
      (tester) async {
    var taps = 0;
    await tester.pumpWidget(MaterialApp(
      home: Builder(
        builder: (context) => Scaffold(
          body: Center(
            child: ElevatedButton(
              onPressed: () {
                taps += 1;
                if (taps == 1) {
                  RewardBurst.celebrate(context,
                      const RewardBurstData(source: RewardSource.mission, points: 5));
                }
              },
              child: const Text('again'),
            ),
          ),
        ),
      ),
    ));
    await tester.tap(find.text('again'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));
    expect(find.text('۵ امتیاز'), findsOneWidget);

    // دکمه هنوز زیرِ جشن است؛ باید قابلِ کلیک بماند.
    await tester.tap(find.text('again'), warnIfMissed: false);
    await tester.pump();
    expect(taps, 2);
    await settle(tester);
  });
}
