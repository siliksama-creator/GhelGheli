/// هر «استاپِ» گرادیانِ نام باید روی پس‌زمینهٔ تیره خوانا باشد.
///
/// ═══════════════════════════════════════════════════════════════════════════
/// چرا این تست وجود دارد
/// ═══════════════════════════════════════════════════════════════════════════
///
/// `name_color_contrast_test.dart` از قبل بود و رنگ‌های نام را می‌سنجید،
/// ولی فقط رنگ‌های **تک‌رنگ** را (خروجیِ `nameColorOf`). گرادیان‌ها
/// (`nameGradientColors` و `rainbowColors`) هیچ‌وقت سنجیده نشدند و دقیقاً
/// از همین سوراخ یک نقصِ واقعی رد شد و به محصول رسید:
///
///   ۸ افکت از ۱۴ روی کارتِ تیره زیرِ ۴.۵ بودند —
///   بدترین‌شان «#A855F7» با نسبتِ ۱.۸۵:۱.
///
/// نکتهٔ مهم این است که گرادیان روی *خودِ حروف* کشیده می‌شود، پس هر استاپ
/// رنگِ متن است نه تزئین؛ کافی است یک استاپ تیره باشد تا بخشی از نام محو
/// شود. و چون همهٔ این‌ها آیتمِ **خریدنی**‌اند، کاربر بابتِ ناخوانایی پول
/// می‌داد.
///
/// این تست دو چیز را قفل می‌کند:
///   ۱. تک‌تکِ استاپ‌ها روی سطحِ تیره ≥۴.۵:۱ باشند.
///   ۲. اگر کسی برای رد شدن از بندِ اول همه را سفید کند، بندِ دوم
///      (حفظِ تنوعِ hue) جلویش را می‌گیرد.
library;

import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ghelgheli_mobile/core/cosmetic_palette.dart';

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

// دو پس‌زمینهٔ واقعی که نام رویشان می‌نشیند. دومی روشن‌تر است (ردیفِ لیگ)
// و همان حالتِ بدتر است، پس معیار روی همان گرفته می‌شود.
const _cardSurface = Color(0xFF1D2632);
const _leagueRowSurface = Color(0xFF29313C);

double _worst(Color c) => math.min(
      _ratio(c, _cardSurface),
      _ratio(c, _leagueRowSurface),
    );

void main() {
  group('استاپ‌های گرادیانِ نام روی سطحِ تیره', () {
    for (final e in nameGradientColors.entries) {
      test('«${e.key}» همهٔ استاپ‌هایش ≥۴.۵:۱ است', () {
        for (var i = 0; i < e.value.length; i++) {
          final r = _worst(e.value[i]);
          expect(r, greaterThanOrEqualTo(4.5),
              reason: 'استاپِ $i از «${e.key}» فقط ${r.toStringAsFixed(2)}:1 '
                  'است — بخشی از نامِ کاربر محو می‌شود');
        }
      });
    }

    test('رنگین‌کمانِ تیره هم استاپ‌به‌استاپ خوانا است', () {
      for (var i = 0; i < rainbowColors.length; i++) {
        final r = _worst(rainbowColors[i]);
        expect(r, greaterThanOrEqualTo(4.5),
            reason: 'استاپِ $i رنگین‌کمان فقط ${r.toStringAsFixed(2)}:1 است');
      }
    });

    test('گرادیان‌ها به سفیدِ یکنواخت تبدیل نشده‌اند', () {
      // ضدِ «تقلب»: ساده‌ترین راهِ رد شدن از تستِ بالا سفید کردنِ همه‌چیز
      // است، که کلِ افکتِ خریدنی را بی‌معنا می‌کند. یک گرادیانِ چندرنگ باید
      // واقعاً چند hue داشته باشد.
      for (final e in nameGradientColors.entries) {
        if (e.value.length < 2) continue;
        final hues = e.value
            .where((c) => HSVColor.fromColor(c).saturation > 0.08)
            .map((c) => HSVColor.fromColor(c).hue)
            .toList();
        if (hues.length < 2) continue;
        final spread = hues.reduce(math.max) - hues.reduce(math.min);
        expect(spread, greaterThan(0.5),
            reason: '«${e.key}» عملاً تک‌رنگ شده — دیگر گرادیان نیست');
      }
    });
  });
}
