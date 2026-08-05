// رندرِ واقعیِ ویجت‌های کلیدی در تمِ اپ.
//
// ═══════════════════════════════════════════════════════════════════════════
// این فایل بعد از حذفِ تمِ روشن چه چیزی را می‌سنجد
// ═══════════════════════════════════════════════════════════════════════════
//
// اپ تک‌تم (تیره) شد و `light_theme_contrast_test.dart` حذف شد چون
// موضوعش دیگر وجود ندارد.
//
// ولی این فایل هنوز لازم است: می‌سنجد که این ویجت‌ها اصلاً **بدون خطا
// رندر می‌شوند** و همهٔ توکن‌های `BrandTheme` سرِ جایشان هستند. یک
// ویجت می‌تواند رنگِ درست داشته باشد ولی با
// `Null check operator used on a null value` بشکند — مثلاً اگر کسی
// توکنی به BrandTheme اضافه کند و در `copyWith` یا `lerp` جا بیندازد.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:ghelgheli_mobile/theme/app_theme.dart';
import 'package:ghelgheli_mobile/theme/brand_theme.dart';
import 'package:ghelgheli_mobile/widgets/level_badge.dart';
import 'package:ghelgheli_mobile/screens/user/wallet/wallet_widgets.dart';

// پارامتر `dark` عمداً ماند تا امضای تست‌های موجود دست‌نخورده بماند،
// ولی هر دو حالت حالا همان تمِ تیره را می‌گیرند.
Widget _app(Widget child, {required bool dark}) => MaterialApp(
      theme: AppTheme.dark(),
      darkTheme: AppTheme.dark(),
      themeMode: ThemeMode.dark,
      home: Directionality(
        textDirection: TextDirection.rtl,
        child: Scaffold(
          body: SingleChildScrollView(
            child: Padding(padding: const EdgeInsets.all(12), child: child),
          ),
        ),
      ),
    );

/// یک ویجت را در هر دو تم رندر می‌کند و مطمئن می‌شود هیچ استثنایی
/// پرتاب نمی‌شود.
Future<void> bothThemes(
  WidgetTester tester,
  String label,
  Widget Function() build,
) async {
  for (final dark in [true, false]) {
    await tester.pumpWidget(_app(build(), dark: dark));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull,
        reason: '$label در تم ${dark ? "تیره" : "روشن"} خطا داد');
  }
}

void main() {
  group('ویجت‌های کیف پول در هر دو تم', () {
    testWidgets('کارت موجودی', (tester) async {
      // کارتِ موجودی گرادیانِ **مات** دارد، پس متنِ سفیدش در هر دو تم
      // درست است — عمداً دست‌نخورده ماند. این تست فقط مطمئن می‌شود
      // که رفعِ رنگ‌های دیگر آن را نشکسته باشد.
      await bothThemes(tester, 'WalletBalanceCard', () =>
        const WalletBalanceCard(
          balance: 1250000,
          totalIn: 3000000,
          totalOut: 1750000,
          pendingAmount: 200000,
        ));
    });

    testWidgets('ردیف تراکنش — واریز و برداشت', (tester) async {
      for (final dir in ['credit', 'debit']) {
        await bothThemes(tester, 'WalletTransactionTile($dir)', () =>
          WalletTransactionTile(tx: {
            'direction': dir,
            'amount': 50000,
            'source': 'league',
            'created_at': '2026-08-04T10:00:00Z',
          }));
      }
    });

    testWidgets('کارت درخواست برداشت — همهٔ وضعیت‌ها', (tester) async {
      // ═══════════════════════════════════════════════════════════════
      // چرا همهٔ وضعیت‌ها
      // ═══════════════════════════════════════════════════════════════
      //
      // نگاشتِ رنگِ وضعیت از `static const` به یک تابعِ تم‌آگاه تبدیل
      // شد. اگر یکی از شاخه‌های `switch` جا افتاده باشد، همان‌جا
      // خطای رندر می‌دهد — و فقط با پیمودنِ همهٔ وضعیت‌ها پیدا
      // می‌شود.
      for (final st in [
        'pending', 'approved', 'paid', 'rejected', 'canceled', 'ناشناخته',
      ]) {
        await bothThemes(tester, 'WithdrawalTile($st)', () =>
          WithdrawalTile(request: {
            'status': st,
            'amount': 200000,
            'cardHolder': 'علی رضایی',
            'maskedCard': '6037****1234',
            'createdAt': '2026-08-04T10:00:00Z',
            if (st == 'paid') 'trackingCode': '123456',
            if (st == 'rejected') 'adminNote': 'اطلاعات ناقص',
          }));
      }
    });
  });

  group('نشانِ لول در هر دو تم', () {
    testWidgets('همهٔ رده‌ها', (tester) async {
      for (final lvl in [0, 12, 35, 70, 100]) {
        await bothThemes(tester, 'LevelBadge($lvl)', () =>
          LevelBadge(level: lvl));
      }
    });

    testWidgets('کارتِ لول', (tester) async {
      await bothThemes(tester, 'LevelCard', () => const LevelCard(
        level: 23, into: 400, needed: 900, progress: 0.44, isMax: false));
      await bothThemes(tester, 'LevelCard(max)', () => const LevelCard(
        level: 100, into: 0, needed: 0, progress: 1, isMax: true));
    });
  });

  group('توکن‌های تم در هر دو حالت موجودند', () {
    test('BrandTheme در تم ثبت شده', () {
      // اگر تم extension را نداشته باشد، `context.brand` با
      // «Null check operator» می‌شکند و کلِ صفحه سفید می‌شود.
      for (final (name, t) in [
        ('تیره', AppTheme.dark()),
      ]) {
        final b = t.extension<BrandTheme>();
        expect(b, isNotNull, reason: 'BrandTheme در تم $name نیست');
        // هیچ توکنی نباید null باشد.
        expect(b!.success, isNotNull);
        expect(b.warning, isNotNull);
        expect(b.danger, isNotNull);
        expect(b.info, isNotNull);
        expect(b.accent, isNotNull, reason: 'accent در تم $name جا افتاده');
      }
    });

    test('lerp هیچ توکنی را گم نمی‌کند', () {
      // با تک‌تم شدن، `lerp` دیگر بین دو تم اجرا نمی‌شود — ولی فلاتر
      // همچنان موقعِ هر تغییرِ ThemeData آن را صدا می‌زند. اگر یک فیلد
      // در پیاده‌سازیِ lerp جا بیفتد، آن توکن وسطِ انیمیشن به مقدارِ
      // قدیمی می‌پرد. با دو نمونهٔ ساختگی می‌سنجیم.
      final a = AppTheme.dark().extension<BrandTheme>()!;
      final b = a.copyWith(
        accent: const Color(0xFF123456),
        success: const Color(0xFF234567),
        danger: const Color(0xFF345678),
      );
      final mid = a.lerp(b, 0.5);
      expect(mid.accent, isNot(a.accent),
          reason: 'accent در lerp درون‌یابی نمی‌شود');
      expect(mid.success, isNot(a.success));
      expect(mid.danger, isNot(a.danger));
    });

    test('copyWith هیچ توکنی را از دست نمی‌دهد', () {
      final a = AppTheme.dark().extension<BrandTheme>()!;
      final copy = a.copyWith();
      expect(copy.accent, a.accent, reason: 'accent در copyWith گم شد');
      expect(copy.success, a.success);
      expect(copy.info, a.info);
    });
  });
}
