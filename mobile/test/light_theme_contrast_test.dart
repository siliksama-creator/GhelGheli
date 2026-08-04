// کنتراست در تم روشن — با محاسبهٔ WCAG روی رنگ‌های واقعیِ تم.
//
// ═══════════════════════════════════════════════════════════════════════════
// باگی که این تست‌ها قفلش می‌کنند
// ═══════════════════════════════════════════════════════════════════════════
//
// گزارش مالک: «قسمت کیف پول و بعضی قسمت های دیگه با تم روشن خوب دیده
// نمیشن».
//
// ریشه در `BrandColors` بود. کامنتِ آن بلوک می‌گفت «Semantic colors
// (consistent across themes)» — و دقیقاً همان «سازگاری» باگ بود:
//
// آن رنگ‌ها برای پس‌زمینهٔ **تیره** انتخاب شده بودند. روی سطحِ تیره
// درخشان‌اند، ولی `BrandTheme.light()` هم همان‌ها را می‌داد و روی سطحِ
// سفید محو می‌شدند. نسبت‌های اندازه‌گیری‌شده روی #FFFFFF:
//
//     amber    ۱.۵۳:۱   ← عملاً نامرئی
//     emerald  ۱.۹۳:۱
//     warning  ۲.۰۰:۱
//     success  ۲.۲۳:۱
//     info     ۲.۶۷:۱
//     danger   ۲.۹۹:۱
//
// حداقلِ WCAG برای متنِ معمولی ۴.۵:۱ و برای متنِ بزرگ/آیکون ۳:۱ است.
// یعنی هیچ‌کدام حتی به حداقلِ گرافیکی هم نمی‌رسیدند.
//
// ═══════════════════════════════════════════════════════════════════════════
// چرا رندر نمی‌کنیم و فقط رنگ می‌سنجیم
// ═══════════════════════════════════════════════════════════════════════════
//
// نسخهٔ اولِ این فایل ویجت‌ها را واقعاً رندر می‌کرد و پیکسل می‌شمرد.
// ولی `RenderRepaintBoundary.toImage()` در محیطِ تستِ بدون GPU (که CI
// هم همان است) بعد از چند فراخوانی قفل می‌شود و کل اجرا با تایم‌اوت
// می‌میرد — یعنی تستی که به‌جای گرفتنِ باگ، مانعِ اجرای بقیه می‌شود.
//
// خوشبختانه لازم هم نیست: کنتراست یک **تابعِ ریاضیِ محض** از دو رنگ
// است. سنجیدنِ خودِ رنگ‌هایی که تم بیرون می‌دهد، دقیقاً همان چیزی را
// اثبات می‌کند که شمردنِ پیکسل می‌کرد، با صفر شکنندگی.
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:ghelgheli_mobile/theme/app_theme.dart';
import 'package:ghelgheli_mobile/theme/brand_theme.dart';
import 'package:ghelgheli_mobile/theme/colors.dart';

/// روشناییِ نسبی طبق WCAG 2.x.
double _lum(Color c) {
  double ch(double s) =>
      s <= 0.03928 ? s / 12.92 : math.pow((s + 0.055) / 1.055, 2.4) as double;
  return 0.2126 * ch(c.r) + 0.7152 * ch(c.g) + 0.0722 * ch(c.b);
}

/// نسبتِ کنتراست دو رنگ (۱:۱ تا ۲۱:۱).
double contrast(Color a, Color b) {
  final la = _lum(a), lb = _lum(b);
  return (math.max(la, lb) + 0.05) / (math.min(la, lb) + 0.05);
}

/// آستانه‌های WCAG.
const _minText = 4.5; // متن معمولی
const _minLarge = 3.0; // متن بزرگ، آیکون، مرز

void main() {
  final light = AppTheme.light();
  final dark = AppTheme.dark();
  final lightBrand = light.extension<BrandTheme>()!;
  final darkBrand = dark.extension<BrandTheme>()!;

  group('ابزارِ سنجش خودش درست است', () {
    // بدون این، ممکن بود سنجه همیشه سبز باشد و ما فکر کنیم همه‌چیز خوب
    // است.
    test('سیاه روی سفید ۲۱:۱', () {
      expect(contrast(Colors.black, Colors.white), closeTo(21, 0.1));
    });

    test('سفید روی سفید ۱:۱', () {
      expect(contrast(Colors.white, Colors.white), closeTo(1, 0.01));
    });

    test('رنگ‌های قدیمی واقعاً مردود می‌شوند', () {
      // ثبتِ باگِ اصلی: اگر روزی کسی BrandTheme.light را به رنگ‌های
      // تیره‌محور برگرداند، این عددها دوباره برمی‌گردند.
      expect(contrast(BrandColors.amber, Colors.white), lessThan(2.0));
      expect(contrast(BrandColors.success, Colors.white), lessThan(3.0));
      expect(contrast(BrandColors.danger, Colors.white), lessThan(3.0));
    });
  });

  group('پایهٔ تم — متنِ بدنه روی سطح', () {
    test('تم روشن ≥۴.۵:۱', () {
      final r = contrast(light.colorScheme.onSurface, light.colorScheme.surface);
      expect(r, greaterThanOrEqualTo(_minText),
          reason: 'onSurface/surface روشن: ${r.toStringAsFixed(2)}:1');
    });

    test('تم تیره ≥۴.۵:۱', () {
      final r = contrast(dark.colorScheme.onSurface, dark.colorScheme.surface);
      expect(r, greaterThanOrEqualTo(_minText),
          reason: 'onSurface/surface تیره: ${r.toStringAsFixed(2)}:1');
    });

    test('متنِ کم‌رنگ (bodySmall) هم در هر دو تم خوانا است', () {
      // این رنگ در کل اپ برای تاریخ‌ها و توضیحات استفاده می‌شود؛ اگر
      // محو باشد نصفِ اطلاعاتِ کیف پول ناخوانا می‌شود.
      for (final (name, t) in [('روشن', light), ('تیره', dark)]) {
        final c = t.textTheme.bodySmall?.color;
        expect(c, isNotNull, reason: 'bodySmall رنگ ندارد');
        final r = contrast(c!, t.colorScheme.surface);
        expect(r, greaterThanOrEqualTo(_minLarge),
            reason: 'bodySmall در تم $name فقط ${r.toStringAsFixed(2)}:1 است');
      }
    });
  });

  group('رنگ‌های معنایی روی سطحِ تمِ خودشان', () {
    // ═══════════════════════════════════════════════════════════════════
    // این گروه قلبِ رفعِ باگ است
    // ═══════════════════════════════════════════════════════════════════
    //
    // هر رنگِ معنایی روی **سطحِ همان تم** سنجیده می‌شود، نه روی یک
    // پس‌زمینهٔ فرضی. اگر کسی `BrandTheme.light()` را به رنگ‌های
    // تیره‌محور برگرداند، اینجا فوراً قرمز می‌شود.
    void checkAll(String themeName, BrandTheme b, ThemeData t) {
      final surfaces = <String, Color>{
        'surface': t.colorScheme.surface,
        'surfaceContainer': t.colorScheme.surfaceContainer,
        'surfaceContainerHigh': t.colorScheme.surfaceContainerHigh,
      };
      final inks = <String, Color>{
        'success': b.success,
        'warning': b.warning,
        'danger': b.danger,
        'info': b.info,
        'accent': b.accent,
      };

      inks.forEach((inkName, ink) {
        surfaces.forEach((surfName, surf) {
          final r = contrast(ink, surf);
          expect(r, greaterThanOrEqualTo(_minLarge),
              reason: '[$themeName] $inkName روی $surfName فقط '
                  '${r.toStringAsFixed(2)}:1 است — زیر آستانهٔ ۳:۱ برای '
                  'آیکون و متنِ بولد');
        });
      });
    }

    test('تم روشن — همهٔ رنگ‌ها روی همهٔ سطح‌ها', () {
      checkAll('روشن', lightBrand, light);
    });

    test('تم تیره — همهٔ رنگ‌ها روی همهٔ سطح‌ها', () {
      checkAll('تیره', darkBrand, dark);
    });

    test('رنگ‌های معنایی در دو تم واقعاً متفاوت‌اند', () {
      // اگر یکی باشند یعنی رفع برگشته: یک مجموعه رنگ نمی‌تواند هم روی
      // سفید و هم روی مشکی کنتراست کافی داشته باشد.
      expect(lightBrand.success, isNot(darkBrand.success));
      expect(lightBrand.warning, isNot(darkBrand.warning));
      expect(lightBrand.danger, isNot(darkBrand.danger));
      expect(lightBrand.info, isNot(darkBrand.info));
      expect(lightBrand.accent, isNot(darkBrand.accent));
    });

    test('ولی رنگ‌مایه (hue) حفظ شده — سبز همچنان سبز است', () {
      // مهم: کاربر باید در هر دو تم «سبز = موفق» و «قرمز = خطا» را
      // بشناسد. اگر hue عوض می‌شد، زبانِ بصریِ اپ بین دو تم فرق
      // می‌کرد.
      double hue(Color c) => HSLColor.fromColor(c).hue;
      // اختلافِ زاویه‌ای، با در نظر گرفتنِ چرخهٔ ۳۶۰ درجه.
      double diff(Color a, Color b) {
        final d = (hue(a) - hue(b)).abs();
        return math.min(d, 360 - d);
      }

      expect(diff(lightBrand.success, darkBrand.success), lessThan(25),
          reason: 'سبزِ موفقیت نباید بین دو تم رنگ عوض کند');
      expect(diff(lightBrand.danger, darkBrand.danger), lessThan(25),
          reason: 'قرمزِ خطا نباید بین دو تم رنگ عوض کند');
      expect(diff(lightBrand.info, darkBrand.info), lessThan(25));
    });
  });

  group('رنگ‌های primary و error خودِ ColorScheme', () {
    test('در هر دو تم روی سطحِ خودشان دیده می‌شوند', () {
      for (final (name, t) in [('روشن', light), ('تیره', dark)]) {
        for (final (cn, c) in [
          ('primary', t.colorScheme.primary),
          ('error', t.colorScheme.error),
          ('secondary', t.colorScheme.secondary),
        ]) {
          final r = contrast(c, t.colorScheme.surface);
          expect(r, greaterThanOrEqualTo(_minLarge),
              reason: '[$name] $cn روی surface فقط '
                  '${r.toStringAsFixed(2)}:1 است');
        }
      }
    });

    test('onPrimary روی primary خوانا است', () {
      // متنِ روی دکمهٔ پررنگ — اگر این خراب باشد، برچسبِ همهٔ دکمه‌های
      // اصلی ناخوانا می‌شود.
      for (final (name, t) in [('روشن', light), ('تیره', dark)]) {
        final r = contrast(t.colorScheme.onPrimary, t.colorScheme.primary);
        expect(r, greaterThanOrEqualTo(_minLarge),
            reason: '[$name] onPrimary/primary: ${r.toStringAsFixed(2)}:1');
      }
    });

    test('onError روی error خوانا است', () {
      for (final (name, t) in [('روشن', light), ('تیره', dark)]) {
        final r = contrast(t.colorScheme.onError, t.colorScheme.error);
        expect(r, greaterThanOrEqualTo(_minLarge),
            reason: '[$name] onError/error: ${r.toStringAsFixed(2)}:1');
      }
    });
  });

  group('مرزها و خطوطِ جداکننده دیده می‌شوند', () {
    test('outline روی surface دست‌کم ۱.۵:۱ است', () {
      // مرز لازم نیست مثل متن پررنگ باشد، ولی اگر ۱:۱ باشد کارت‌ها
      // در تم روشن به هم می‌چسبند و صفحه یک لکهٔ سفید می‌شود.
      for (final (name, t) in [('روشن', light), ('تیره', dark)]) {
        final r = contrast(t.colorScheme.outline, t.colorScheme.surface);
        expect(r, greaterThanOrEqualTo(1.5),
            reason: '[$name] outline روی surface فقط '
                '${r.toStringAsFixed(2)}:1 — مرزها دیده نمی‌شوند');
      }
    });
  });
}
