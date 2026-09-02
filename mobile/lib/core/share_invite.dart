// اشتراک‌گذاری کد دعوت در پیام‌رسان‌ها با آیکون‌های وکتوری اختصاصی و زیبا.
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';

enum ShareAppId {
  telegram,
  whatsapp,
  rubika,
  bale,
}

/// یک مقصدِ اشتراک‌گذاری.
class ShareTarget {
  const ShareTarget({
    required this.id,
    required this.app,
    required this.label,
    required this.color,
    required this.icon,
    this.appUri,
    this.webUri,
    this.copyFirst = false,
  });

  final String id;
  final ShareAppId app;
  final String label;
  final int color;
  final IconData icon;
  final String? appUri;
  final String? webUri;
  final bool copyFirst;
}

const shareTargets = <ShareTarget>[
  ShareTarget(
    id: 'telegram',
    app: ShareAppId.telegram,
    label: 'تلگرام',
    color: 0xFF29A9EB,
    icon: Icons.send_rounded,
    appUri: 'tg://msg_url?url={text}',
    webUri: 'https://t.me/share/url?url={text}',
  ),
  ShareTarget(
    id: 'whatsapp',
    app: ShareAppId.whatsapp,
    label: 'واتس‌اپ',
    color: 0xFF25D366,
    icon: Icons.chat_bubble_rounded,
    appUri: 'whatsapp://send?text={text}',
    webUri: 'https://wa.me/?text={text}',
  ),
  ShareTarget(
    id: 'rubika',
    app: ShareAppId.rubika,
    label: 'روبیکا',
    color: 0xFF8A2BE2,
    icon: Icons.circle_rounded,
    appUri: 'rubika://',
    webUri: 'https://rubika.ir',
    copyFirst: true,
  ),
  ShareTarget(
    id: 'bale',
    app: ShareAppId.bale,
    label: 'بله',
    color: 0xFF00BFA5,
    icon: Icons.circle_rounded,
    appUri: 'bale://',
    webUri: 'https://web.bale.ai',
    copyFirst: true,
  ),
];

enum ShareOutcome {
  opened,
  openedWithClipboard,
  copiedOnly,
}

/// متن دعوت — اعداد از سرور (`/api/config.referral`) می‌آیند تا با تغییر
/// پنل بدون آپدیت اپ عوض شوند. پیش‌فرض‌ها همان مقادیر تاریخی‌اند.
String inviteMessage(
  String code, {
  int spins = 3,
  int purchasePercent = 5,
}) =>
    'کد دعوت من به قلقلی: $code\n'
    'با این کد ثبت‌نام کن؛ هر دومون $spins چرخش هدیه می‌گیریم و من از خریدهای مستقیم تو $purchasePercent٪ درآمد معرفی می‌گیرم.\n'
    'https://ghelghelishop.ir';

Future<ShareOutcome> shareInvite(
  ShareTarget target,
  String code, {
  int spins = 3,
  int purchasePercent = 5,
}) =>
    shareText(target, inviteMessage(code, spins: spins, purchasePercent: purchasePercent));

Future<ShareOutcome> shareText(ShareTarget target, String text) async {
  final encoded = Uri.encodeComponent(text);

  if (target.copyFirst) {
    await copyText(text);
  }

  for (final template in [target.appUri, target.webUri]) {
    if (template == null) continue;
    final uri = Uri.parse(template.replaceAll('{text}', encoded));
    try {
      final ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
      if (ok) {
        return target.copyFirst
            ? ShareOutcome.openedWithClipboard
            : ShareOutcome.opened;
      }
    } catch (_) {}
  }

  if (!target.copyFirst) await copyText(text);
  return ShareOutcome.copiedOnly;
}

Future<void> copyText(String text) async {
  try {
    await Clipboard.setData(ClipboardData(text: text));
  } catch (_) {}
}

Future<bool> copyCode(String code) async {
  try {
    await Clipboard.setData(ClipboardData(text: code));
    return true;
  } catch (_) {
    return false;
  }
}

/// آیکون وکتوری تمیز برای هر پیام‌رسان بدون وابستگی به ایموجی
class MessengerIcon extends StatelessWidget {
  const MessengerIcon({super.key, required this.app, this.size = 20});

  final ShareAppId app;
  final double size;

  @override
  Widget build(BuildContext context) {
    switch (app) {
      case ShareAppId.telegram:
        return CustomPaint(
          size: Size(size, size),
          painter: _TelegramPainter(),
        );
      case ShareAppId.whatsapp:
        return CustomPaint(
          size: Size(size, size),
          painter: _WhatsAppPainter(),
        );
      case ShareAppId.rubika:
        return CustomPaint(
          size: Size(size, size),
          painter: _RubikaPainter(),
        );
      case ShareAppId.bale:
        return CustomPaint(
          size: Size(size, size),
          painter: _BalePainter(),
        );
    }
  }
}

class _TelegramPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width, h = size.height;
    final paint = Paint()
      ..color = const Color(0xFF29A9EB)
      ..style = PaintingStyle.fill;
    canvas.drawCircle(Offset(w / 2, h / 2), w / 2, paint);

    final plane = Path()
      ..moveTo(w * 0.22, h * 0.50)
      ..lineTo(w * 0.78, h * 0.26)
      ..lineTo(w * 0.65, h * 0.74)
      ..lineTo(w * 0.48, h * 0.62)
      ..lineTo(w * 0.40, h * 0.72)
      ..lineTo(w * 0.40, h * 0.58)
      ..close();

    final planePaint = Paint()
      ..color = Colors.white
      ..style = PaintingStyle.fill;
    canvas.drawPath(plane, planePaint);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

class _WhatsAppPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width, h = size.height;
    final bgPaint = Paint()
      ..color = const Color(0xFF25D366)
      ..style = PaintingStyle.fill;
    canvas.drawCircle(Offset(w / 2, h / 2), w / 2, bgPaint);

    final phonePaint = Paint()
      ..color = Colors.white
      ..style = PaintingStyle.stroke
      ..strokeWidth = w * 0.12
      ..strokeCap = StrokeCap.round;

    final arc = Path()
      ..arcTo(
        Rect.fromCircle(center: Offset(w * 0.5, h * 0.5), radius: w * 0.26),
        0.5,
        4.8,
        false,
      );
    canvas.drawPath(arc, phonePaint);

    final dotPaint = Paint()..color = Colors.white;
    canvas.drawCircle(Offset(w * 0.5, h * 0.5), w * 0.08, dotPaint);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

class _RubikaPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width, h = size.height;
    final bgPaint = Paint()
      ..shader = const LinearGradient(
        colors: [Color(0xFF8A2BE2), Color(0xFFF5643C)],
      ).createShader(Rect.fromLTWH(0, 0, w, h))
      ..style = PaintingStyle.fill;
    canvas.drawRRect(
      RRect.fromRectAndRadius(Rect.fromLTWH(0, 0, w, h), Radius.circular(w * 0.28)),
      bgPaint,
    );

    final diamondPaint = Paint()
      ..color = Colors.white
      ..style = PaintingStyle.fill;

    final path = Path()
      ..moveTo(w * 0.50, h * 0.22)
      ..lineTo(w * 0.78, h * 0.50)
      ..lineTo(w * 0.50, h * 0.78)
      ..lineTo(w * 0.22, h * 0.50)
      ..close();
    canvas.drawPath(path, diamondPaint);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

class _BalePainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width, h = size.height;
    final bgPaint = Paint()
      ..color = const Color(0xFF00BFA5)
      ..style = PaintingStyle.fill;
    canvas.drawCircle(Offset(w / 2, h / 2), w / 2, bgPaint);

    final innerPaint = Paint()
      ..color = Colors.white
      ..style = PaintingStyle.fill;

    final bubble = Path()
      ..addRRect(RRect.fromRectAndRadius(
        Rect.fromCenter(center: Offset(w * 0.5, h * 0.48), width: w * 0.52, height: h * 0.42),
        Radius.circular(w * 0.12),
      ))
      ..moveTo(w * 0.38, h * 0.68)
      ..lineTo(w * 0.28, h * 0.78)
      ..lineTo(w * 0.48, h * 0.68)
      ..close();

    canvas.drawPath(bubble, innerPaint);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
