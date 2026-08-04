// اشتراک‌گذاری کد دعوت — ساختِ URI و متنِ پیام.
//
// ═══════════════════════════════════════════════════════════════════════════
// چه چیزی اینجا تست می‌شود و چه چیزی نمی‌شود
// ═══════════════════════════════════════════════════════════════════════════
//
// خودِ باز شدنِ تلگرام قابل تست واحد نیست — به سیستم‌عامل و اپِ نصب‌شده
// نیاز دارد. ولی چیزی که **می‌شکند** معمولاً آن نیست؛ چیزهایی است که
// اینجا تست می‌شوند:
//
//   • URI بدشکل (کدگذاری‌نشدنِ فاصله و خط جدید) → اپ باز می‌شود ولی
//     متن نصفه است، یا اصلاً باز نمی‌شود.
//   • کدِ دعوت که در انتهای پیامِ بلند گم می‌شود.
//   • مقصدی که هم appUri و هم webUri ندارد → دکمهٔ بی‌اثر.
//
// این‌ها همه در تستِ دستی روی یک گوشیِ توسعه‌دهنده که همهٔ اپ‌ها را
// دارد، دیده نمی‌شوند.
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

import 'package:ghelgheli_mobile/core/share_invite.dart';

void main() {
  group('متنِ دعوت', () {
    test('کد در خطِ اول است', () {
      // ═══════════════════════════════════════════════════════════════
      // چرا این مهم است
      // ═══════════════════════════════════════════════════════════════
      //
      // پیام‌رسان‌ها پیش‌نمایشِ پیام را کوتاه می‌کنند و کاربر معمولاً
      // فقط خطِ اول را می‌بیند. اگر کد در خطِ سوم باشد، گیرنده باید
      // پیام را باز کند تا ببیندش — یک اصطکاکِ کوچک که نرخِ تبدیل را
      // پایین می‌آورد.
      final msg = inviteMessage('AB12');
      expect(msg.split('\n').first, contains('AB12'));
    });

    test('کد دقیقاً همان چیزی است که داده شده', () {
      // اگر روزی کسی کد را lowercase یا فرمت کند، دعوت کار نمی‌کند.
      expect(inviteMessage('X9Z1'), contains('X9Z1'));
      expect(inviteMessage('0000'), contains('0000'));
    });

    test('پیام کوتاه است — زیر ۱۶۰ کاراکتر', () {
      // پیامِ بلند در پیش‌نمایشِ پیام‌رسان بریده می‌شود.
      expect(inviteMessage('AB12').length, lessThan(160));
    });

    test('کدِ خالی هم کرش نمی‌کند', () {
      // اگر سرور هنوز کد نداده باشد.
      expect(() => inviteMessage(''), returnsNormally);
    });
  });

  group('مقصدهای اشتراک‌گذاری', () {
    test('هر چهار اپِ درخواستیِ مالک هستند', () {
      // درخواست صریح: «تلگرام و واتس اپ و روبیکا و بله».
      final ids = shareTargets.map((t) => t.id).toSet();
      expect(ids, containsAll(['telegram', 'whatsapp', 'rubika', 'bale']));
    });

    test('هیچ مقصدی بدون راهِ باز شدن نیست', () {
      // یک مقصد بدون appUri و webUri یعنی دکمه‌ای که هیچ کاری نمی‌کند.
      for (final t in shareTargets) {
        expect(t.appUri != null || t.webUri != null, isTrue,
            reason: '${t.id} هیچ راهی برای باز شدن ندارد');
      }
    });

    test('همه برچسبِ فارسی و نماد دارند', () {
      for (final t in shareTargets) {
        expect(t.label.trim(), isNotEmpty, reason: '${t.id} برچسب ندارد');
        expect(t.emoji.trim(), isNotEmpty, reason: '${t.id} نماد ندارد');
      }
    });

    test('شناسه‌ها یکتا هستند', () {
      final ids = shareTargets.map((t) => t.id).toList();
      expect(ids.toSet().length, ids.length);
    });
  });

  group('ساختِ URI — جایی که واقعاً می‌شکند', () {
    /// همان تبدیلی که `shareInvite` انجام می‌دهد.
    Uri build(String template, String code) => Uri.parse(
        template.replaceAll('{text}', Uri.encodeComponent(inviteMessage(code))));

    test('URIها با متنِ واقعی معتبر می‌مانند', () {
      // متنِ دعوت فاصله، خطِ جدید، ایموجی و کاراکترِ فارسی دارد — همه
      // چیزهایی که یک URIِ کدگذاری‌نشده را می‌شکنند.
      for (final t in shareTargets) {
        for (final tpl in [t.appUri, t.webUri]) {
          if (tpl == null || !tpl.contains('{text}')) continue;
          final uri = build(tpl, 'AB12');
          expect(uri.scheme, isNotEmpty, reason: '${t.id}: scheme خالی');
          // نباید فاصله یا خطِ جدیدِ خام در URI بماند.
          expect(uri.toString(), isNot(contains(' ')),
              reason: '${t.id}: فاصلهٔ کدگذاری‌نشده در URI');
          expect(uri.toString(), isNot(contains('\n')),
              reason: '${t.id}: خطِ جدیدِ کدگذاری‌نشده در URI');
        }
      }
    });

    test('کد بعد از کدگذاری و رمزگشایی سالم می‌ماند', () {
      // اگر کدگذاری دوبار انجام شود (%2520 به‌جای %20)، متنِ رسیده
      // پر از کاراکترِ عجیب می‌شود.
      final uri = build('tg://msg_url?url={text}', 'AB12');
      final decoded = Uri.decodeComponent(uri.query.substring('url='.length));
      expect(decoded, contains('AB12'));
      expect(decoded, isNot(contains('%')),
          reason: 'متن دوبار کدگذاری شده است');
    });

    test('تلگرام و واتس‌اپ هم scheme اپ دارند و هم بازگشتِ وب', () {
      // این دو محبوب‌ترین‌اند؛ اگر اپ نصب نباشد باید نسخهٔ وب باز شود
      // نه اینکه هیچ اتفاقی نیفتد.
      for (final id in ['telegram', 'whatsapp']) {
        final t = shareTargets.firstWhere((e) => e.id == id);
        expect(t.appUri, isNotNull, reason: '$id: scheme اپ ندارد');
        expect(t.webUri, isNotNull, reason: '$id: بازگشتِ وب ندارد');
        expect(t.appUri!.contains('{text}'), isTrue,
            reason: '$id: متن را نمی‌فرستد');
        expect(t.webUri!.contains('{text}'), isTrue);
      }
    });

    test('روبیکا و بله copyFirst دارند چون متن نمی‌گیرند', () {
      // این‌ها لینکِ «اشتراک‌گذاری متن» عمومی ندارند. اگر copyFirst
      // نداشته باشند، اپ باز می‌شود و کاربر دستش خالی است.
      for (final id in ['rubika', 'bale']) {
        final t = shareTargets.firstWhere((e) => e.id == id);
        expect(t.copyFirst, isTrue,
            reason: '$id متن را نمی‌گیرد، پس باید اول کپی شود');
      }
    });

    test('مقصدهایی که متن می‌گیرند، copyFirst ندارند', () {
      // کپیِ بی‌مورد، کلیپ‌بوردِ کاربر را بی‌دلیل خراب می‌کند.
      for (final id in ['telegram', 'whatsapp']) {
        final t = shareTargets.firstWhere((e) => e.id == id);
        expect(t.copyFirst, isFalse);
      }
    });
  });

  group('مانیفست اندروید', () {
    test('همهٔ schemeها در patch_android.sh اعلام شده‌اند', () {
      // ═══════════════════════════════════════════════════════════════
      // چرا این تست وجود دارد
      // ═══════════════════════════════════════════════════════════════
      //
      // از اندروید ۱۱، اگر یک scheme در <queries> نباشد، Intent حل
      // نمی‌شود و دکمه **بی‌صدا** بی‌اثر می‌ماند — استثنا گرفته
      // می‌شود و کاربر فقط می‌بیند که هیچ اتفاقی نمی‌افتد.
      //
      // اگر فردا کسی مقصدِ پنجمی اضافه کند و مانیفست را یادش برود،
      // اینجا قرمز می‌شود.
      final script = File('tool/patch_android.sh').readAsStringSync();
      for (final t in shareTargets) {
        final scheme = Uri.parse(t.appUri ?? 'https://x').scheme;
        expect(script, contains('android:scheme="$scheme"'),
            reason: 'scheme «$scheme» برای ${t.id} در <queries> نیست — '
                'دکمه روی اندروید ۱۱+ کار نمی‌کند');
      }
    });
  });
}
