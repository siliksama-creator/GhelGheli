// نگهبانِ نمایشِ سینماتیکِ راندِ دوئل.
//
// ═══════════════════════════════════════════════════════════════════════════
// چرا این تست وجود دارد
// ═══════════════════════════════════════════════════════════════════════════
//
// انیمیشن دقیقاً همان چیزی است که بی‌صدا برمی‌گردد: کسی یک `setState` جابه‌جا
// می‌کند، فازها از کار می‌افتند، و چون هیچ خطایی نمی‌دهد ماه‌ها کسی نمی‌فهمد.
//
// درسِ ثبت‌شدهٔ این پروژه: «تستی که سبز است ولی چیزی را نمی‌سنجد». اگر فقط
// `find.text('WINNER')` را چک کنیم، ویجتی که از فریمِ اول همه‌چیز را نشان
// می‌دهد هم سبز می‌شود — یعنی دقیقاً حالتی که می‌خواهیم جلویش را بگیریم.
//
// پس اینجا **غیاب** را در فریم‌های اول می‌سنجیم، نه فقط حضور را در آخر:
//   • در فازِ charge نباید عددِ قدرت یا مهرِ برنده دیده شود
//   • بعد از ۱۳۰۰ms هر دو باید باشند
//
// و مهم‌تر: راندِ دوم هم باید دوباره از فاز اول شروع کند. این همان باگی
// است که در وب بدونِ `key` رخ می‌داد و در فلاتر بدونِ `didUpdateWidget`.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ghelgheli_mobile/screens/user/games/card_duel_page.dart';

// ⚠️ دامی که همین تست گرفتار شد: خودِ `PlayerCard` روی کارتِ برنده یک
// نشانِ «WINNER» می‌زند. پس `find.text('WINNER')` دو نتیجه دارد و اصلاً
// نمی‌گوید مهرِ حکم آمده یا نه. این هِلپِر فقط مهرِ حکمِ صحنه را می‌یابد:
// متنی که مستقیماً داخلِ یک Container با گوشهٔ ۹۹ باشد. ساده‌تر و
// پایدارتر: مهرِ حکم `letterSpacing: 0.6` دارد و نشانِ کارت `1.4`.
Finder _verdictStamp(String text) => find.byWidgetPredicate(
      (w) => w is Text &&
          w.data == text &&
          (w.style?.letterSpacing ?? 0) == 0.6,
      description: 'مهرِ حکمِ صحنهٔ برخورد «$text»',
    );

Map<String, dynamic> _round(int n, String winner) => {
      'round': n,
      'title': 'فشار حمله',
      'focusLabel': 'حمله',
      'winner': winner,
      'cardX': {'name': 'کارت من', 'duel_rarity': 'gold', 'power': 88},
      'cardO': {'name': 'کارت حریف', 'duel_rarity': 'silver', 'power': 71},
      'powerX': 88,
      'powerO': 71,
      'focusStatX': 90,
      'focusStatO': 64,
      'powerGap': 17,
      'reason': 'قدرت حمله خط دفاع را شکافت',
      'cinematic': 'ضربهٔ نهایی کار را تمام کرد',
    };

Widget _host(Map<String, dynamic>? round) => MaterialApp(
      home: Directionality(
        textDirection: TextDirection.rtl,
        child: Scaffold(
          body: SingleChildScrollView(
            child: SizedBox(
              width: 420,
              child: CardDuelClashStageForTest(
                round: round,
                mine: 'X',
                color: const Color(0xFF38BDF8),
              ),
            ),
          ),
        ),
      ),
    );

/// مدتِ کاملِ انیمیشنِ نمایشِ نتیجه، با کمی حاشیه.
///
/// ⚠️ چرا ثابت و نه عددِ درجا:
///   این تست‌ها `pump(1400ms)` داشتند چون انیمیشن آن‌موقع ۱۳۰۰ms بود.
///   وقتی مدت به ۱۹۰۰ms رفت (تا نتیجهٔ راند فرصتِ دیده‌شدن پیدا کند)،
///   هر سه تست شکستند — در حالی که **محصول درست‌تر** شده بود.
///
///   عددِ جادویی که در هشت جای فایل تکرار شده بود، تغییرِ درستِ محصول
///   را به یک شکستِ گمراه‌کننده تبدیل کرد. حالا یک جا تعریف می‌شود.
///
///   اگر `_ClashStageState._total` عوض شد، فقط همین خط باید عوض شود.
const _revealTotal = Duration(milliseconds: 2100);

void main() {
  group('نمایش سینماتیک راند دوئل', () {
    testWidgets('در فاز اول عدد قدرت و مهر برنده هنوز دیده نمی‌شوند',
        (tester) async {
      await tester.pumpWidget(_host(_round(1, 'X')));
      // فریم اول = فازِ charge.
      await tester.pump(const Duration(milliseconds: 60));

      expect(_verdictStamp('WINNER'), findsNothing,
          reason: 'مهرِ برنده نباید قبل از فازِ verdict روی صفحه باشد');
      expect(find.textContaining('اختلاف قدرت'), findsNothing,
          reason: 'اختلافِ قدرت متعلق به فازِ numbers است');

      // عنوانِ راند از همان اول هست — این خودِ تعلیق را خراب نمی‌کند.
      expect(find.textContaining('فشار حمله'), findsWidgets);

      // ═══════════════════════════════════════════════════════════════
      //  ⚠️ عددِ قدرت نباید پیش از فازِ numbers لو برود
      // ═══════════════════════════════════════════════════════════════
      //
      // همین باگ در نسخهٔ وب پیدا شد: عددِ نهایی در فازِ charge روی
      // صفحه بود، بعد به صفر برمی‌گشت و دوباره شمرده می‌شد — کلِ تعلیق
      // بی‌اثر می‌شد. اندروید مقدار را درست پنهان می‌کرد ولی هیچ تستی
      // این را قفل نکرده بود، پس یک ریفکتورِ ساده می‌توانست برش گرداند.
      //
      // «؟» یعنی «عدد هست ولی هنوز فاش نشده» و جای عدد را نگه می‌دارد
      // تا در لحظهٔ فاش شدن ردیف نپرد.
      expect(find.text('؟'), findsNWidgets(2),
          reason: 'هر دو عددِ قدرت باید در فازِ charge پنهان باشند');
      // فیکسچر: powerX=88, powerO=71
      expect(find.text('۸۸'), findsNothing,
          reason: 'عددِ نهاییِ من نباید قبل از فازِ numbers دیده شود');
      expect(find.text('۷۱'), findsNothing,
          reason: 'عددِ نهاییِ حریف نباید قبل از فازِ numbers دیده شود');
    });

    testWidgets('بعد از پایان فازها، حکم و عددها کامل دیده می‌شوند',
        (tester) async {
      await tester.pumpWidget(_host(_round(1, 'X')));
      await tester.pump(_revealTotal);
      await tester.pump(const Duration(milliseconds: 500));

      expect(_verdictStamp('WINNER'), findsOneWidget);
      expect(find.textContaining('قدرت حمله خط دفاع را شکافت'), findsOneWidget);
      expect(find.textContaining('ضربهٔ نهایی'), findsOneWidget);

      // ⚠️ اینجا عمداً pumpAndSettle نیست: قابِ کمیابیِ PlayerCard یک
      // انیمیشنِ بی‌پایان دارد (طلایی/پرمیوم می‌چرخند)، پس صحنه هرگز
      // «آرام» نمی‌گیرد و pumpAndSettle همیشه timeout می‌دهد. این نبودِ
      // باگ است، خودِ طراحی است.
    });

    testWidgets('باخت راند مهر درست را نشان می‌دهد', (tester) async {
      await tester.pumpWidget(_host(_round(1, 'O')));
      await tester.pump(_revealTotal);
      await tester.pump(const Duration(milliseconds: 400));

      expect(_verdictStamp('باخت راند'), findsOneWidget);
      expect(_verdictStamp('WINNER'), findsNothing);
      // ⚠️ اینجا عمداً pumpAndSettle نیست: قابِ کمیابیِ PlayerCard یک
      // انیمیشنِ بی‌پایان دارد (طلایی/پرمیوم می‌چرخند)، پس صحنه هرگز
      // «آرام» نمی‌گیرد و pumpAndSettle همیشه timeout می‌دهد. این نبودِ
      // باگ است، خودِ طراحی است.
    });

    testWidgets('مساوی مهر «برخورد برابر» می‌دهد', (tester) async {
      await tester.pumpWidget(_host(_round(1, 'DRAW')));
      await tester.pump(_revealTotal);
      await tester.pump(const Duration(milliseconds: 400));

      expect(_verdictStamp('برخورد برابر'), findsOneWidget);
      // ⚠️ اینجا عمداً pumpAndSettle نیست: قابِ کمیابیِ PlayerCard یک
      // انیمیشنِ بی‌پایان دارد (طلایی/پرمیوم می‌چرخند)، پس صحنه هرگز
      // «آرام» نمی‌گیرد و pumpAndSettle همیشه timeout می‌دهد. این نبودِ
      // باگ است، خودِ طراحی است.
    });

    testWidgets('راند دوم دوباره از فاز اول شروع می‌شود', (tester) async {
      // ⚠️ این مهم‌ترین تستِ این فایل است. بدونِ `didUpdateWidget` راندِ
      // دوم بدونِ هیچ انیمیشنی و با نتیجهٔ کاملاً آشکار ظاهر می‌شد — همان
      // باگی که در نسخهٔ وب بدونِ `key` رخ می‌داد.
      await tester.pumpWidget(_host(_round(1, 'X')));
      await tester.pump(_revealTotal);
      expect(_verdictStamp('WINNER'), findsOneWidget);

      // راند دوم می‌رسد.
      await tester.pumpWidget(_host(_round(2, 'O')));
      await tester.pump(const Duration(milliseconds: 60));

      expect(_verdictStamp('باخت راند'), findsNothing,
          reason: 'راندِ دوم باید دوباره تعلیق داشته باشد، نه نتیجهٔ فوری');

      await tester.pump(_revealTotal);
      expect(_verdictStamp('باخت راند'), findsOneWidget);
      // ⚠️ اینجا عمداً pumpAndSettle نیست: قابِ کمیابیِ PlayerCard یک
      // انیمیشنِ بی‌پایان دارد (طلایی/پرمیوم می‌چرخند)، پس صحنه هرگز
      // «آرام» نمی‌گیرد و pumpAndSettle همیشه timeout می‌دهد. این نبودِ
      // باگ است، خودِ طراحی است.
    });

    testWidgets('بدون راند، پیام انتظار نشان داده می‌شود و کرش نمی‌کند',
        (tester) async {
      await tester.pumpWidget(_host(null));
      await tester.pump();
      expect(find.textContaining('منتظر برخورد اول'), findsOneWidget);
    });

    testWidgets('دور انداختن ویجت وسط انیمیشن نشتی نمی‌سازد', (tester) async {
      // کنترلر باید در dispose بسته شود. اگر نشود، فلاتر در تست
      // «A Ticker was disposed» می‌اندازد.
      await tester.pumpWidget(_host(_round(1, 'X')));
      await tester.pump(const Duration(milliseconds: 200));
      await tester.pumpWidget(const MaterialApp(home: SizedBox()));
      await tester.pump();
    });
  });
}
