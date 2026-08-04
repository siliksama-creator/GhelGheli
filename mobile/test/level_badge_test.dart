// نشانِ لول — نمایش، تم، و چیدمان.
//
// ═══════════════════════════════════════════════════════════════════════════
// چه چیزی اینجا قفل می‌شود
// ═══════════════════════════════════════════════════════════════════════════
//
// دو خواستهٔ صریحِ مالک که راحت می‌شود ناخواسته شکستشان:
//
//   ۱. «در قسمت بازی ها هم Level 0 مثلا اینطوری نشون داده بشه نیاز
//      نیست بنویسی سطح ۰» → برچسب لاتین، عددِ لاتین، و **صفر یک لولِ
//      معتبر است** نه «ندارد».
//   ۲. «این لول رو پروفایل افراد در تمامی قسمت ها دیده بشه» →
//      `DisplayName` باید نشان را بپذیرد، چون تنها جایی است که نامِ
//      کاربر در کل اپ رندر می‌شود.
//
// به‌علاوهٔ کنتراست: نشان در تم روشن هم باید خوانا باشد — همان دسته
// باگی که در کیف پول رفع شد و نباید از در دیگری برگردد.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:ghelgheli_mobile/core/cosmetics.dart';
import 'package:ghelgheli_mobile/theme/app_theme.dart';
import 'package:ghelgheli_mobile/widgets/level_badge.dart';

Widget _wrap(Widget child, {bool dark = true}) => MaterialApp(
      theme: AppTheme.light(),
      darkTheme: AppTheme.dark(),
      themeMode: dark ? ThemeMode.dark : ThemeMode.light,
      home: Directionality(
        textDirection: TextDirection.rtl,
        child: Scaffold(body: Center(child: child)),
      ),
    );

void main() {
  group('نمایشِ عدد', () {
    testWidgets('لول صفر نشان داده می‌شود، نه پنهان', (tester) async {
      // صفر یک لولِ **معتبر** است (کاربر تازه) و مالک صریحاً
      // «Level 0» را به‌عنوان نمونه داد. اگر کسی روزی
      // `if (level > 0)` بگذارد، این تست می‌گیردش.
      await tester.pumpWidget(_wrap(const LevelBadge(level: 0)));
      expect(find.text('0'), findsOneWidget);
    });

    testWidgets('حالت کامل «Level N» می‌نویسد', (tester) async {
      await tester.pumpWidget(
          _wrap(const LevelBadge(level: 7, compact: false)));
      expect(find.text('Level 7'), findsOneWidget);
    });

    testWidgets('عدد لاتین است نه فارسی', (tester) async {
      // درخواست صریح: «نیاز نیست بنویسی سطح ۰».
      //
      // «Level ۷» ترکیبِ ناجوری از دو خط است که در یک نشانِ کوچک بد
      // دیده می‌شود. بقیهٔ اپ عددِ فارسی دارد؛ این یک استثنای
      // خواسته‌شده است.
      await tester.pumpWidget(_wrap(const LevelBadge(level: 42)));
      expect(find.text('42'), findsOneWidget);
      expect(find.text('۴۲'), findsNothing);
    });

    testWidgets('کلمهٔ «سطح» هیچ‌جا نیست', (tester) async {
      await tester.pumpWidget(
          _wrap(const LevelBadge(level: 5, compact: false)));
      expect(find.textContaining('سطح'), findsNothing,
          reason: 'مالک صریحاً گفت «نیاز نیست بنویسی سطح»');
    });

    testWidgets('لول ۱۰۰ هم جا می‌شود', (tester) async {
      // سه رقم در یک نشانِ کوچک: اگر عرض ثابت بود سرریز می‌کرد.
      await tester.pumpWidget(_wrap(const LevelBadge(level: 100)));
      expect(find.text('100'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  });

  group('رده‌بندیِ رنگی', () {
    test('مرزها درست‌اند', () {
      // اگر مرزها جابه‌جا شوند، یک بازیکن با ارتقای لول ممکن است
      // رنگش **عقب** برود — که مثل تنبیه دیده می‌شود.
      expect(tierOf(0), LevelTier.rookie);
      expect(tierOf(9), LevelTier.rookie);
      expect(tierOf(10), LevelTier.bronze);
      expect(tierOf(29), LevelTier.bronze);
      expect(tierOf(30), LevelTier.silver);
      expect(tierOf(59), LevelTier.silver);
      expect(tierOf(60), LevelTier.gold);
      expect(tierOf(89), LevelTier.gold);
      expect(tierOf(90), LevelTier.legend);
      expect(tierOf(100), LevelTier.legend);
    });

    test('رده هرگز با بالا رفتنِ لول عقب نمی‌رود', () {
      var last = -1;
      for (var lvl = 0; lvl <= 100; lvl++) {
        final t = LevelTier.values.indexOf(tierOf(lvl));
        expect(t, greaterThanOrEqualTo(last),
            reason: 'رده در لول $lvl عقب رفت');
        last = t;
      }
    });
  });

  group('در هر دو تم رندر می‌شود', () {
    for (final dark in [true, false]) {
      final name = dark ? 'تیره' : 'روشن';
      testWidgets('تم $name — همهٔ رده‌ها بدون خطا', (tester) async {
        for (final lvl in [0, 15, 45, 75, 95]) {
          await tester.pumpWidget(_wrap(LevelBadge(level: lvl), dark: dark));
          expect(tester.takeException(), isNull,
              reason: 'لول $lvl در تم $name خطا داد');
        }
      });

      testWidgets('تم $name — کارتِ کامل بدون سرریز', (tester) async {
        await tester.pumpWidget(_wrap(
          const SizedBox(
            width: 320,
            child: LevelCard(
              level: 12,
              into: 340,
              needed: 900,
              progress: 0.38,
              isMax: false,
            ),
          ),
          dark: dark,
        ));
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
      });
    }
  });

  group('کارتِ لول', () {
    testWidgets('پیشرفت را نشان می‌دهد', (tester) async {
      await tester.pumpWidget(_wrap(
        const SizedBox(
          width: 320,
          child: LevelCard(
            level: 3, into: 40, needed: 200, progress: 0.2, isMax: false),
        ),
      ));
      await tester.pumpAndSettle();
      expect(find.text('Level 3'), findsOneWidget);
      // «۴۰ / ۲۰۰» — این عددها فارسی‌اند چون متنِ توضیحی‌اند، نه نشان.
      expect(find.textContaining('۴۰'), findsOneWidget);
    });

    testWidgets('لولِ نهایی پیام و نشانِ خودش را دارد', (tester) async {
      await tester.pumpWidget(_wrap(
        const SizedBox(
          width: 320,
          child: LevelCard(
            level: 100, into: 0, needed: 0, progress: 1, isMax: true),
        ),
      ));
      await tester.pumpAndSettle();
      expect(find.textContaining('بالاترین لول'), findsOneWidget);
      // نباید «۰ / ۰» نشان دهد — بی‌معنی است.
      expect(find.textContaining('۰ / ۰'), findsNothing);
    });

    testWidgets('needed صفر تقسیم بر صفر نمی‌سازد', (tester) async {
      await tester.pumpWidget(_wrap(
        const SizedBox(
          width: 320,
          child: LevelCard(
            level: 1, into: 0, needed: 0, progress: 0, isMax: false),
        ),
      ));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
    });
  });

  group('یکپارچگی با DisplayName', () {
    testWidgets('نشان کنارِ نام می‌آید', (tester) async {
      // این تضمین می‌کند «در تمامی قسمت ها» واقعاً کار کند: چت، لیگ،
      // باشگاه و پروفایلِ عمومی همه از `DisplayName` می‌آیند.
      await tester.pumpWidget(_wrap(
        const DisplayName(name: 'علی', level: 23),
      ));
      expect(find.text('علی'), findsOneWidget);
      expect(find.text('23'), findsOneWidget);
    });

    testWidgets('بدون لول، نشانی نمی‌آید', (tester) async {
      // `null` یعنی «سرور نفرستاده» — مثلاً برای ربات. اگر به‌جای
      // آن صفر نشان داده می‌شد، «Level 0» کنارِ ربات معنیِ اشتباه
      // می‌داد.
      await tester.pumpWidget(_wrap(const DisplayName(name: 'ربات')));
      expect(find.text('ربات'), findsOneWidget);
      expect(find.text('0'), findsNothing);
    });

    testWidgets('لول صفر هم نمایش داده می‌شود', (tester) async {
      // تفاوتِ `null` و `0` — کاربرِ تازه باید نشانش را ببیند.
      await tester.pumpWidget(_wrap(const DisplayName(name: 'تازه‌وارد', level: 0)));
      expect(find.text('0'), findsOneWidget);
    });

    testWidgets('نام بلند با نشان سرریز نمی‌کند', (tester) async {
      // نشان + نامِ بلند + ستارهٔ پلاس در یک ردیفِ باریکِ چت.
      await tester.pumpWidget(_wrap(
        const SizedBox(
          width: 120,
          child: DisplayName(
            name: 'یک نام خیلی خیلی خیلی طولانی برای تست',
            level: 100,
            cosmetics: {'plus': true},
          ),
        ),
      ));
      expect(tester.takeException(), isNull,
          reason: 'ردیف نباید سرریز کند');
    });
  });
}
