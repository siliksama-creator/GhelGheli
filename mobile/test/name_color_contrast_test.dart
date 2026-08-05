/// رنگِ نامِ خریداری‌شده باید در هر دو تم خوانا باشد.
///
/// ═══════════════════════════════════════════════════════════════════════════
/// چرا این تست وجود دارد
/// ═══════════════════════════════════════════════════════════════════════════
///
/// پنج رنگِ نام آیتمِ **پولی** فروشگاه‌اند. همه برای پس‌زمینهٔ تیره
/// انتخاب شده بودند و روی سطحِ روشن بین ۱.۵۸:۱ تا ۳.۹۶:۱ کنتراست
/// داشتند — یعنی کاربر بابتِ چیزی پول داده بود که نصفِ وقت دیده
/// نمی‌شد.
///
/// این تست سه چیز را قفل می‌کند:
///
///   ۱. هر رنگ در تم روشن ≥۴.۵:۱ باشد (WCAG AA).
///   ۲. hue حفظ شود — «طلایی» نباید قهوه‌ای شود. اگر کسی برای رد شدن
///      از بندِ اول همه را سیاه کند، بندِ دوم جلویش را می‌گیرد.
///   ۳. **هر** رنگی که در فروشگاه هست دوقلوی روشن داشته باشد. اگر فردا
///      رنگِ ششمی اضافه شود و نگاشت به‌روز نشود، اینجا قرمز می‌شود.
library;

import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ghelgheli_mobile/core/cosmetics.dart';

/// روشناییِ نسبی طبق WCAG 2.1.
double _lum(Color c) {
  double ch(double v) =>
      v <= 0.03928 ? v / 12.92 : math.pow((v + 0.055) / 1.055, 2.4).toDouble();
  return 0.2126 * ch(c.r) + 0.7152 * ch(c.g) + 0.0722 * ch(c.b);
}

double _ratio(Color a, Color b) {
  final la = _lum(a), lb = _lum(b);
  final hi = math.max(la, lb), lo = math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

/// hue در فضای HSV — برای بررسیِ «هنوز همان رنگ است؟».
double _hue(Color c) => HSVColor.fromColor(c).hue;

/// فاصلهٔ دو hue روی چرخِ ۳۶۰ درجه‌ای.
double _hueDelta(double a, double b) {
  final d = (a - b).abs() % 360;
  return d > 180 ? 360 - d : d;
}

// پالتِ واقعیِ فروشگاه. مقادیر از `shop_items.payload` در دیتابیسِ زنده
// گرفته شده‌اند؛ اگر آنجا عوض شود اینجا هم باید عوض شود.
const _shopColors = <String, String>{
  'اسم طلایی': '#FFC53D',
  'اسم زمردی': '#00D49A',
  'اسم سرخ': '#F87171',
  'اسم آسمانی': '#60A5FA',
  'اسم بنفش': '#A855F7',
};

// سطحی که نام رویش می‌نشیند. در تم روشن کارت‌ها سفیدند.
const _lightSurface = Color(0xFFFFFFFF);
const _darkSurface = Color(0xFF06101D);

void main() {
  group('رنگِ نام روی سطحِ روشن', () {
    for (final e in _shopColors.entries) {
      test('${e.key} در تم روشن ≥۴.۵:۱ است', () {
        final c = nameColorOf(e.value, onLight: true)!;
        final r = _ratio(c, _lightSurface);
        expect(r, greaterThanOrEqualTo(4.5),
            reason: '${e.key} (${e.value}) روی سفید فقط '
                '${r.toStringAsFixed(2)}:1 است');
      });

      test('${e.key} همان hue را نگه می‌دارد', () {
        final dark = nameColorOf(e.value)!;
        final light = nameColorOf(e.value, onLight: true)!;
        // اگر رنگ عوض نشده باشد (چون از قبل خوانا بوده) این بی‌اثر است.
        if (dark.toARGB32() == light.toARGB32()) return;
        final d = _hueDelta(_hue(dark), _hue(light));
        expect(d, lessThan(18),
            reason: '${e.key} از hue ${_hue(dark).toStringAsFixed(0)} به '
                '${_hue(light).toStringAsFixed(0)} پرید — دیگر همان رنگ نیست');
      });

      test('${e.key} در تم تیره دست‌نخورده مانده', () {
        // رگرسیون: رفعِ تم روشن نباید تم تیره را که سالم بود عوض کند.
        final c = nameColorOf(e.value)!;
        expect(c.toARGB32(), Color(0xFF000000 | int.parse(
            e.value.substring(1), radix: 16)).toARGB32());
        expect(_ratio(c, _darkSurface), greaterThanOrEqualTo(4.5));
      });
    }

    test('هر رنگِ فروشگاه دوقلوی روشن دارد', () {
      // بندِ سوم: نگهبانِ آینده. اگر رنگی اضافه شود و نگاشت به‌روز نشود،
      // `nameColorOf` همان رنگِ تیره را برمی‌گرداند و این تست می‌گیردش.
      for (final e in _shopColors.entries) {
        final dark = nameColorOf(e.value)!;
        final light = nameColorOf(e.value, onLight: true)!;
        final needsFix = _ratio(dark, _lightSurface) < 4.5;
        if (needsFix) {
          expect(light.toARGB32(), isNot(dark.toARGB32()),
              reason: '${e.key} روی سفید ناخواناست ولی دوقلوی روشن ندارد');
        }
      }
    });

    test('رنگین‌کمانِ روشن هم خوانا است', () {
      for (final c in rainbowColorsOnLight) {
        expect(_ratio(c, _lightSurface), greaterThanOrEqualTo(4.5),
            reason: '$c روی سفید ناخواناست');
      }
    });

    test('رنگین‌کمان همان چهار hue را نگه داشته', () {
      expect(rainbowColorsOnLight.length, rainbowColors.length);
      for (var i = 0; i < rainbowColors.length; i++) {
        final d = _hueDelta(_hue(rainbowColors[i]), _hue(rainbowColorsOnLight[i]));
        expect(d, lessThan(25),
            reason: 'توقفِ $i از ${_hue(rainbowColors[i]).toStringAsFixed(0)} '
                'به ${_hue(rainbowColorsOnLight[i]).toStringAsFixed(0)} پرید');
      }
    });

    test('رنگِ ناشناخته دست‌نخورده برمی‌گردد', () {
      // بهتر از دستکاریِ کورکورانه: اگر سرور رنگی فرستاد که نمی‌شناسیم،
      // همان را نشان بده نه چیزِ دیگری.
      final c = nameColorOf('#123456', onLight: true);
      expect(c!.toARGB32(), 0xFF123456);
    });

    test('ورودیِ نامعتبر null می‌دهد، نه کرش', () {
      expect(nameColorOf(null, onLight: true), isNull);
      expect(nameColorOf('rainbow', onLight: true), isNull);
      expect(nameColorOf('آبی', onLight: true), isNull);
      expect(nameColorOf('#سلام', onLight: true), isNull);
    });
  });

  group('DisplayName رنگ را با تم عوض می‌کند', () {
    /// همان نام را در دو تم رندر می‌کند و رنگِ واقعیِ متن را برمی‌گرداند.
    Future<Color?> renderedColor(WidgetTester tester, Brightness b) async {
      await tester.pumpWidget(MaterialApp(
        theme: ThemeData(brightness: b),
        home: const Scaffold(
          body: DisplayName(name: 'چت‌باز', cosmetics: {'color': '#FFC53D'}),
        ),
      ));
      await tester.pump();
      final t = tester.widget<Text>(find.text('چت‌باز'));
      return t.style?.color;
    }

    testWidgets('تم تیره رنگِ اصلی را می‌دهد', (t) async {
      expect((await renderedColor(t, Brightness.dark))?.toARGB32(),
          0xFFFFC53D);
    });

    testWidgets('تم روشن دوقلوی خوانا را می‌دهد', (t) async {
      // این همان موردی است که در ممیزیِ زنده ۱.۵۸:۱ اندازه‌گیری شد.
      expect((await renderedColor(t, Brightness.light))?.toARGB32(),
          0xFF9B6C00);
    });

    testWidgets('نامِ بدونِ آیتمِ رنگی هیچ رنگی اجبار نمی‌کند', (t) async {
      await t.pumpWidget(const MaterialApp(
        home: Scaffold(body: DisplayName(name: 'ساده')),
      ));
      final w = t.widget<Text>(find.text('ساده'));
      expect(w.style?.color, isNull);
    });
  });
}
