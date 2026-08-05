/// اکسنتِ بنرِ «اعلان مدیریت» باید در هر دو تم خوانا باشد.
///
/// ═══════════════════════════════════════════════════════════════════════════
/// چرا این تست وجود دارد
/// ═══════════════════════════════════════════════════════════════════════════
///
/// بنر متن را با **همان** رنگِ اکسنت می‌نویسد، روی پس‌زمینه‌ای که ۱۳٪
/// همان رنگ است. این ترکیبِ خودارجاع روی سطحِ روشن فاجعه بود:
///
///     طلایی ۱.۴۸:۱ · سبز ۱.۷۵:۱ · آبی ۲.۲۷:۱ · قرمز ۲.۴۴:۱
///
/// و این تنها راهی است که مدیریت می‌تواند به همهٔ کاربران پیام بدهد —
/// یعنی مهم‌ترین متنِ صفحهٔ چت دقیقاً همانی بود که خوانده نمی‌شد.
///
/// نکتهٔ مهمِ این تست: کنتراست را روی پس‌زمینهٔ **محاسبه‌شده** می‌سنجد،
/// نه روی سفیدِ فرضی. همین اشتباه در پنل مدیریت باعث شد رنگ‌هایی که
/// «روی سفید قبول شده بودند» در عمل ۳.۱ تا ۴.۱ باشند.
library;

import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ghelgheli_mobile/screens/user/games/pinned_banner.dart';

double _lum(Color c) {
  double ch(double v) =>
      v <= 0.03928 ? v / 12.92 : math.pow((v + 0.055) / 1.055, 2.4).toDouble();
  return 0.2126 * ch(c.r) + 0.7152 * ch(c.g) + 0.0722 * ch(c.b);
}

double _ratio(Color a, Color b) {
  final la = _lum(a), lb = _lum(b);
  return (math.max(la, lb) + 0.05) / (math.min(la, lb) + 0.05);
}

double _hue(Color c) => HSVColor.fromColor(c).hue;

double _hueDelta(double a, double b) {
  final d = (a - b).abs() % 360;
  return d > 180 ? 360 - d : d;
}

/// پس‌زمینهٔ واقعیِ بنر: رنگ با آلفای ۰.۱۳ روی سطح.
///
/// این همان چیزی است که `PinnedBanner` می‌سازد
/// (`color.withValues(alpha: 0.13)`)، پس تست دقیقاً همان ترکیبی را
/// می‌سنجد که کاربر می‌بیند — نه یک تقریب.
Color _bannerBg(Color accent, Color surface) => Color.fromARGB(
      255,
      (accent.r * 255 * 0.13 + surface.r * 255 * 0.87).round(),
      (accent.g * 255 * 0.13 + surface.g * 255 * 0.87).round(),
      (accent.b * 255 * 0.13 + surface.b * 255 * 0.87).round(),
    );

const _lightSurface = Color(0xFFFFFFFF);
const _darkSurface = Color(0xFF06101D);

void main() {
  group('اکسنتِ اعلان روی سطحِ روشن', () {
    for (final key in pinAccents.keys) {
      test('$key در تم روشن ≥۴.۵:۱ است', () {
        final c = pinColor(key, onLight: true);
        final r = _ratio(c, _bannerBg(c, _lightSurface));
        expect(r, greaterThanOrEqualTo(4.5),
            reason: '$key روی پس‌زمینهٔ خودش فقط '
                '${r.toStringAsFixed(2)}:1 است');
      });

      test('$key در تم تیره همچنان سالم است', () {
        // رگرسیون: رفعِ تم روشن نباید تم تیره را خراب کند.
        final c = pinColor(key);
        expect(c.toARGB32(), pinAccents[key]!.toARGB32());
        expect(_ratio(c, _bannerBg(c, _darkSurface)),
            greaterThanOrEqualTo(4.5));
      });

      test('$key همان hue را نگه می‌دارد', () {
        // نگهبانِ «برای رد شدن از تست همه را سیاه نکن».
        final d = _hueDelta(_hue(pinColor(key)), _hue(pinColor(key, onLight: true)));
        expect(d, lessThan(18), reason: '$key دیگر همان رنگ نیست');
      });
    }

    test('هر اکسنت دوقلوی روشن دارد', () {
      // اگر فردا اکسنتِ پنجمی به PIN_ACCENTS سرور اضافه شود و اینجا
      // نیاید، این تست می‌گیردش.
      expect(pinAccentsOnLight.keys.toSet(), pinAccents.keys.toSet());
    });

    test('کلیدِ ناشناخته به طلایی برمی‌گردد، نه کرش', () {
      expect(pinColor('بنفش').toARGB32(), pinAccents['gold']!.toARGB32());
      expect(pinColor(null, onLight: true).toARGB32(),
          pinAccentsOnLight['gold']!.toARGB32());
    });
  });

  group('PinnedBanner در عمل', () {
    Future<void> pump(WidgetTester t, Brightness b,
            Map<String, dynamic>? pinned) =>
        t.pumpWidget(MaterialApp(
          theme: ThemeData(brightness: b),
          home: Scaffold(body: PinnedBanner(pinned: pinned)),
        ));

    testWidgets('در تم روشن رنگِ خوانا را به کار می‌برد', (t) async {
      await pump(t, Brightness.light,
          {'text': 'سلام', 'accent': 'gold', 'active': true});
      final label = t.widget<Text>(find.text('اعلان مدیریت'));
      expect(label.style?.color?.toARGB32(),
          pinAccentsOnLight['gold']!.toARGB32());
    });

    testWidgets('در تم تیره رنگِ اصلی را نگه می‌دارد', (t) async {
      await pump(t, Brightness.dark,
          {'text': 'سلام', 'accent': 'gold', 'active': true});
      final label = t.widget<Text>(find.text('اعلان مدیریت'));
      expect(label.style?.color?.toARGB32(), pinAccents['gold']!.toARGB32());
    });

    testWidgets('بنرِ غیرفعال چیزی نمی‌کشد', (t) async {
      await pump(t, Brightness.light,
          {'text': 'سلام', 'accent': 'gold', 'active': false});
      expect(find.text('اعلان مدیریت'), findsNothing);
    });

    testWidgets('متنِ خالی بنرِ توخالی نمی‌سازد', (t) async {
      // بدون این بررسی، یک اعلانِ فعالِ بی‌متن یک مستطیلِ رنگیِ خالی
      // بالای چت می‌گذاشت که شبیه باگِ رندر دیده می‌شد.
      await pump(t, Brightness.light,
          {'text': '   ', 'accent': 'gold', 'active': true});
      expect(find.text('اعلان مدیریت'), findsNothing);
    });

    testWidgets('null کرش نمی‌کند', (t) async {
      await pump(t, Brightness.light, null);
      expect(find.text('اعلان مدیریت'), findsNothing);
    });
  });
}
