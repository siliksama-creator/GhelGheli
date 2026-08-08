// اشتراک‌گذاری کد دعوت در پیام‌رسان‌ها.
//
// ═══════════════════════════════════════════════════════════════════════════
// چرا deep link مستقیم و نه برگهٔ اشتراک‌گذاریِ سیستم
// ═══════════════════════════════════════════════════════════════════════════
//
// درخواست مالک: «در قسمت دعوت قابلیت کپی کد و ارسال کد در تلگرام و
// واتس اپ و روبیکا و بله امکان پذیر باشه بای کاربرها».
//
// راهِ ساده‌تر `share_plus` بود که برگهٔ سیستم را باز می‌کند. رد شد چون
// کاربر باید از میان ده‌ها اپ، تلگرام را پیدا کند — و مالک صریحاً
// **دکمهٔ جدا برای هر اپ** خواست. یک تپ به‌جای سه تپ.
//
// ═══════════════════════════════════════════════════════════════════════════
// دو schemeی که هر اپ دارد، و چرا هر دو لازم است
// ═══════════════════════════════════════════════════════════════════════════
//
// هر پیام‌رسان دو راه ورودی دارد:
//
//   ۱. **scheme اختصاصی** (`tg://`, `whatsapp://`) — اگر اپ نصب باشد
//      مستقیم بازش می‌کند، سریع و بدون واسطه.
//   ۲. **لینک وب** (`https://t.me/share/...`) — اگر اپ نصب نباشد،
//      مرورگر باز می‌شود و کاربر می‌تواند از نسخهٔ وب استفاده کند.
//
// اول اولی امتحان می‌شود و اگر شکست خورد دومی. بدون این زنجیره، تپ روی
// دکمهٔ یک اپِ نصب‌نشده هیچ اتفاقی نمی‌افتاد — بدترین حالت، چون کاربر
// فکر می‌کند دکمه خراب است.
//
// روبیکا و بله لینکِ «اشتراک‌گذاری متن» عمومی ندارند؛ برایشان متن در
// کلیپ‌بورد گذاشته می‌شود و بعد خودِ اپ باز می‌شود، با یک پیام که
// می‌گوید متن کپی شده. صادقانه‌تر از یک دکمهٔ بی‌اثر است.
//
// ═══════════════════════════════════════════════════════════════════════════
// اندروید ۱۱ و بالاتر — تلهٔ <queries>
// ═══════════════════════════════════════════════════════════════════════════
//
// از اندروید ۱۱، `canLaunchUrl` برای هر schemeی که در `<queries>`
// مانیفست اعلام نشده باشد **همیشه false** برمی‌گرداند، حتی اگر اپ نصب
// باشد. این در tool/patch_android.sh اعلام می‌شود.
//
// ولی به آن هم تکیه نمی‌کنیم: منطقِ زیر اگر `canLaunchUrl` منفی بگوید
// باز هم `launchUrl` را امتحان می‌کند و فقط در صورت پرتاب کردن، به
// گزینهٔ بعدی می‌رود. اینطور حتی با مانیفستِ ناقص هم کار می‌کند.
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';

/// یک مقصدِ اشتراک‌گذاری.
class ShareTarget {
  const ShareTarget({
    required this.id,
    required this.label,
    required this.icon,
    required this.color,
    this.appUri,
    this.webUri,
    this.copyFirst = false,
  });

  final String id;
  final String label;

  /// نماد به‌جای آیکونِ برند.
  ///
  /// چرا ایموجی و نه لوگوی واقعی: لوگوی هر پیام‌رسان علامتِ تجاریِ
  /// ثبت‌شده است و بسته‌بندی‌اش در APK بدون مجوز، هم مسئلهٔ حقوقی دارد
  /// و هم برای چهار اپ حدود ۴۰ کیلوبایت تصویر اضافه می‌کند. ایموجی
  /// از فونتِ سیستم می‌آید: صفر بایت و بدون مسئلهٔ حقوقی.
  final IconData icon;

  /// رنگِ برند، فقط برای حاشیه و پس‌زمینهٔ کم‌رنگ.
  final int color;

  /// scheme اختصاصیِ اپ. `{text}` با متنِ کدگذاری‌شده جایگزین می‌شود.
  final String? appUri;

  /// جایگزینِ وب، وقتی اپ نصب نیست.
  final String? webUri;

  /// اگر true، متن پیش از باز کردن اپ در کلیپ‌بورد گذاشته می‌شود.
  ///
  /// برای اپ‌هایی که راهِ «اشتراک‌گذاری متن» ندارند (روبیکا، بله).
  final bool copyFirst;
}

/// مقصدهای پشتیبانی‌شده، به ترتیبِ محبوبیت در ایران.
const shareTargets = <ShareTarget>[
  ShareTarget(
    id: 'telegram',
    label: 'تلگرام',
    icon: Icons.send_rounded,
    color: 0xFF29A9EB,
    // `msg_url` رسمی‌ترین راه است: پنجرهٔ «فرستادن به…» تلگرام را باز
    // می‌کند با متن از پیش پر شده.
    appUri: 'tg://msg_url?url={text}',
    webUri: 'https://t.me/share/url?url={text}',
  ),
  ShareTarget(
    id: 'whatsapp',
    label: 'واتس‌اپ',
    icon: Icons.chat_bubble_rounded,
    color: 0xFF25D366,
    appUri: 'whatsapp://send?text={text}',
    webUri: 'https://wa.me/?text={text}',
  ),
  ShareTarget(
    id: 'rubika',
    label: 'روبیکا',
    icon: Icons.circle_rounded,
    color: 0xFFF5643C,
    // روبیکا لینکِ «اشتراک‌گذاری متن» عمومی ندارد؛ فقط بازش می‌کنیم و
    // متن از قبل در کلیپ‌بورد است.
    appUri: 'rubika://',
    webUri: 'https://rubika.ir',
    copyFirst: true,
  ),
  ShareTarget(
    id: 'bale',
    label: 'بله',
    icon: Icons.circle_rounded,
    color: 0xFF1B8FE3,
    appUri: 'bale://',
    webUri: 'https://web.bale.ai',
    copyFirst: true,
  ),
];

/// نتیجهٔ یک تلاشِ اشتراک‌گذاری، برای پیام دادن به کاربر.
enum ShareOutcome {
  /// اپ باز شد.
  opened,

  /// اپ باز شد ولی متن باید دستی چسبانده شود (روبیکا/بله).
  openedWithClipboard,

  /// هیچ‌کدام باز نشد؛ متن در کلیپ‌بورد است.
  copiedOnly,
}

/// متنِ دعوتی که فرستاده می‌شود.
///
/// عمداً کوتاه است: پیامِ بلند در پیام‌رسان بریده می‌شود و کد — که
/// تنها چیزِ واقعاً مهم است — پایین می‌افتد. کد در **خطِ اول** می‌آید.
String inviteMessage(String code) =>
    'کد دعوت من به قلقلی: $code\n'
    'با این کد ثبت‌نام کن، هر دومون چرخش هدیه می‌گیریم \n'
    'https://ghelghelishop.ir';

/// تلاش برای باز کردن [target] با متنِ دعوتِ [code].
///
/// هرگز پرتاب نمی‌کند: بدترین حالت `copiedOnly` است، یعنی کاربر متن را
/// دارد و می‌تواند دستی بفرستد.
Future<ShareOutcome> shareInvite(ShareTarget target, String code) async {
  final text = inviteMessage(code);
  final encoded = Uri.encodeComponent(text);

  // برای اپ‌هایی که راهِ ارسالِ متن ندارند، اول کپی می‌کنیم تا وقتی
  // اپ باز شد کاربر فقط بچسباند.
  if (target.copyFirst) {
    await _copy(text);
  }

  for (final template in [target.appUri, target.webUri]) {
    if (template == null) continue;
    final uri = Uri.parse(template.replaceAll('{text}', encoded));
    try {
      // ═══════════════════════════════════════════════════════════════
      // چرا نتیجهٔ canLaunchUrl را نادیده می‌گیریم و مستقیم امتحان
      // می‌کنیم
      // ═══════════════════════════════════════════════════════════════
      //
      // از اندروید ۱۱، `canLaunchUrl` برای هر schemeی که در
      // `<queries>` مانیفست نباشد **همیشه false** می‌دهد — حتی اگر اپ
      // نصب باشد. اگر به آن تکیه می‌کردیم، یک مانیفستِ ناقص یعنی
      // همهٔ دکمه‌ها بی‌اثر.
      //
      // `launchUrl` خودش در صورتِ نبودِ اپ پرتاب می‌کند، که همان
      // سیگنالی است که لازم داریم — و روی مانیفستِ درست هم بدون
      // فراخوانیِ اضافه کار می‌کند.
      final ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
      if (ok) {
        return target.copyFirst
            ? ShareOutcome.openedWithClipboard
            : ShareOutcome.opened;
      }
    } catch (e) {
      debugPrint('اشتراک‌گذاری با ${target.id} از مسیر $uri نشد: $e');
      // به گزینهٔ بعدی برو.
    }
  }

  // هیچ‌کدام نشد — دست‌کم متن را به کاربر بده.
  if (!target.copyFirst) await _copy(text);
  return ShareOutcome.copiedOnly;
}

/// کپیِ امنِ متن. شکستِ کلیپ‌بورد نباید جریان را بشکند.
Future<void> _copy(String text) async {
  try {
    await Clipboard.setData(ClipboardData(text: text));
  } catch (e) {
    debugPrint('کپی در کلیپ‌بورد نشد: $e');
  }
}

/// فقط کدِ خام را کپی می‌کند (دکمهٔ «کپی کد»).
Future<bool> copyCode(String code) async {
  try {
    await Clipboard.setData(ClipboardData(text: code));
    return true;
  } catch (e) {
    debugPrint('کپی کد نشد: $e');
    return false;
  }
}
