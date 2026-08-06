/// راهنمای کادرِ عکس‌برداری از کارت.
///
/// ═══════════════════════════════════════════════════════════════════════════
/// چرا این صفحه وجود دارد
/// ═══════════════════════════════════════════════════════════════════════════
///
/// عکسِ واقعیِ یک کاربر بررسی شد: کارت روی میزِ چوبی و **حدود ۴۰٪ کادر را
/// خودِ میز گرفته بود**. موتورِ تطبیق رنگِ چوب را هم وارد محاسبه می‌کرد و
/// کارتِ اشتباه با حاشیهٔ ۰.۰۳۳ برنده شد.
///
/// سمتِ سرور برشِ خودکار اضافه شد (`cardCrop.js`) و همان عکس را از ۰.۴۳۱
/// به ۰.۶۲۷ رساند. ولی برشِ خودکار محافظه‌کار است و باید باشد: اگر مطمئن
/// نباشد نمی‌بُرد. بهترین حالت این است که کاربر از اول عکسِ تمیز بگیرد.
///
/// ═══════════════════════════════════════════════════════════════════════════
/// چرا صفحهٔ آماده‌سازی و نه overlay روی خودِ دوربین
/// ═══════════════════════════════════════════════════════════════════════════
///
/// `image_picker` دوربینِ **سیستم** را باز می‌کند — همان اپی که کاربر
/// می‌شناسد. نمی‌شود رویش چیزی کشید.
///
/// جایگزینش `camera` package است که پیش‌نمایشِ زنده می‌دهد و می‌شود کادر
/// رویش گذاشت. ولی سه هزینه دارد:
///
///   ۱. مجوزِ دوربینِ دائمی می‌خواهد (الان فقط لحظه‌ای است)
///   ۲. حجمِ APK را چند مگابایت بالا می‌برد
///   ۳. مدیریتِ چرخهٔ عمرِ دوربین روی گوشی‌های ارزان منبعِ کرش است —
///      و کاربرانِ هدفِ این اپ دقیقاً همان گوشی‌ها را دارند
///
/// این صفحه ۹۰٪ فایده را با صفر ریسک می‌دهد: کاربر **قبل از** باز شدنِ
/// دوربین دقیقاً می‌بیند عکسِ خوب چه شکلی است.
library;

import 'package:flutter/material.dart';

import '../theme/colors.dart';
import '../theme/tokens.dart';

/// نمایشِ راهنما و بازگرداندنِ `true` اگر کاربر «متوجه شدم» را زد.
///
/// `false` یا `null` یعنی منصرف شد و دوربین نباید باز شود.
Future<bool> showCardFrameGuide(BuildContext context) async {
  final ok = await showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (_) => const _GuideSheet(),
  );
  return ok ?? false;
}

class _GuideSheet extends StatelessWidget {
  const _GuideSheet();

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      // ── چرا محدودیتِ ارتفاع ──
      //
      // روی گوشیِ کوچک (۵ اینچ) بدونِ این، شیت از صفحه بیرون می‌زند و
      // دکمهٔ «متوجه شدم» دیده نمی‌شود — یعنی کاربر گیر می‌کند.
      constraints: BoxConstraints(
        maxHeight: MediaQuery.of(context).size.height * 0.88,
      ),
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(26)),
      ),
      child: SafeArea(
        top: false,
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(Gaps.md, Gaps.sm, Gaps.md, Gaps.md),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // دستگیرهٔ کشیدن — نشانهٔ استانداردِ «این را می‌شود بست».
              Center(
                child: Container(
                  width: 42,
                  height: 4,
                  margin: const EdgeInsets.only(bottom: Gaps.sm),
                  decoration: BoxDecoration(
                    color: theme.colorScheme.outline.withValues(alpha: 0.5),
                    borderRadius: Corners.rPill,
                  ),
                ),
              ),
              Text('📸 عکسِ خوب چطور گرفته می‌شود؟',
                  style: theme.textTheme.titleLarge,
                  textAlign: TextAlign.center),
              Gaps.vXxs,
              Text(
                'هرچه عکس تمیزتر باشد، کارت سریع‌تر و دقیق‌تر شناخته می‌شود.',
                style: theme.textTheme.bodySmall,
                textAlign: TextAlign.center,
              ),
              Gaps.vMd,

              // ── دو نمونهٔ کنارِ هم: درست و غلط ──
              //
              // نشان دادن **هر دو** عمدی است. تجربه نشان داده کاربر
              // «غلط» را سریع‌تر می‌فهمد تا «درست» — چون اشتباهِ خودش
              // را در آن می‌بیند.
              const Row(
                children: [
                  Expanded(child: _Example(good: true)),
                  SizedBox(width: Gaps.sm),
                  Expanded(child: _Example(good: false)),
                ],
              ),
              Gaps.vMd,

              ..._tips.map((t) => Padding(
                    padding: const EdgeInsets.only(bottom: Gaps.xs),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(t.$1, style: const TextStyle(fontSize: 15)),
                        const SizedBox(width: Gaps.xs),
                        Expanded(
                          child: Text(t.$2, style: theme.textTheme.bodyMedium),
                        ),
                      ],
                    ),
                  )),

              Gaps.vMd,
              FilledButton.icon(
                onPressed: () => Navigator.of(context).pop(true),
                icon: const Icon(Icons.photo_camera_rounded),
                label: const Text('متوجه شدم، دوربین را باز کن'),
              ),
              Gaps.vXs,
              TextButton(
                onPressed: () => Navigator.of(context).pop(false),
                child: const Text('بی‌خیال'),
              ),
            ],
          ),
        ),
      ),
    );
  }

  /// نکته‌ها به ترتیبِ اهمیت — بر پایهٔ اینکه کدام‌یک بیشترین اثر را روی
  /// نمرهٔ تطبیق دارد (اندازه‌گیری‌شده روی عکس‌های واقعی).
  static const List<(String, String)> _tips = [
    ('🖼️', 'کارت تمامِ کادر را پر کند — میز و زمین در عکس نباشد.'),
    ('📐', 'مستقیم از بالا عکس بگیر، نه از زاویه.'),
    ('💡', 'نورِ کافی باشد ولی فلاش مستقیم روی کارت نیفتد.'),
    ('✋', 'دست تکان نخورد تا عکس تار نشود.'),
  ];
}

/// یک نمونهٔ تصویری: کادرِ درست در برابرِ کادرِ غلط.
///
/// ⚠️ اینجا عمداً از تصویرِ واقعی استفاده **نمی‌شود**. طرحِ ساده با
///    `CustomPaint` سه مزیت دارد: حجمِ APK بالا نمی‌رود، در هر تمی درست
///    دیده می‌شود، و اگر روزی طرحِ کارت‌ها عوض شد این راهنما کهنه
///    نمی‌شود.
class _Example extends StatelessWidget {
  const _Example({required this.good});

  final bool good;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final color = good ? BrandColors.successOnLight : BrandColors.dangerOnLight;
    return Column(
      children: [
        AspectRatio(
          aspectRatio: 3 / 4,
          child: Container(
            decoration: BoxDecoration(
              borderRadius: Corners.rMd,
              border: Border.all(color: color.withValues(alpha: 0.6), width: 2),
              color: theme.colorScheme.surfaceContainerHighest
                  .withValues(alpha: 0.4),
            ),
            clipBehavior: Clip.antiAlias,
            child: CustomPaint(painter: _FramePainter(good: good)),
          ),
        ),
        Gaps.vXxs,
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(good ? Icons.check_circle_rounded : Icons.cancel_rounded,
                size: 15, color: color),
            const SizedBox(width: 4),
            Text(good ? 'درست' : 'اشتباه',
                style: theme.textTheme.labelMedium
                    ?.copyWith(color: color, fontWeight: FontWeight.w900)),
          ],
        ),
      ],
    );
  }
}

class _FramePainter extends CustomPainter {
  const _FramePainter({required this.good});

  final bool good;

  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width;
    final h = size.height;

    // پس‌زمینه: در نمونهٔ «اشتباه» میزِ چوبی دیده می‌شود — دقیقاً همان
    // چیزی که در عکسِ واقعیِ کاربر مشکل ساخت.
    if (!good) {
      final wood = Paint()..color = const Color(0xFF6B4423);
      canvas.drawRect(Offset.zero & size, wood);
      final grain = Paint()
        ..color = const Color(0xFF5A3A1E)
        ..strokeWidth = 3;
      for (double y = 0; y < h; y += 11) {
        canvas.drawLine(Offset(0, y), Offset(w, y), grain);
      }
    }

    // خودِ کارت: در «درست» تقریباً تمامِ کادر، در «اشتباه» کوچک و کج.
    final rect = good
        ? Rect.fromLTWH(w * 0.06, h * 0.05, w * 0.88, h * 0.90)
        : Rect.fromLTWH(w * 0.28, h * 0.30, w * 0.44, h * 0.44);

    canvas.save();
    if (!good) {
      canvas.translate(rect.center.dx, rect.center.dy);
      canvas.rotate(0.22);
      canvas.translate(-rect.center.dx, -rect.center.dy);
    }

    final card = Paint()
      ..shader = const LinearGradient(
        begin: Alignment.topCenter,
        end: Alignment.bottomCenter,
        colors: [Color(0xFF1E3A8A), Color(0xFF0A1A3D)],
      ).createShader(rect);
    canvas.drawRRect(
        RRect.fromRectAndRadius(rect, const Radius.circular(6)), card);

    // چهره و شماره — فقط برای اینکه شبیهِ کارت به نظر برسد.
    final face = Paint()..color = const Color(0xFFC89A72);
    canvas.drawCircle(
        Offset(rect.center.dx, rect.top + rect.height * 0.30),
        rect.width * 0.20, face);
    final bar = Paint()..color = const Color(0xFFFFD700);
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromCenter(
          center: Offset(rect.center.dx, rect.top + rect.height * 0.72),
          width: rect.width * 0.50,
          height: rect.height * 0.07,
        ),
        const Radius.circular(3),
      ),
      bar,
    );
    canvas.restore();

    // در نمونهٔ «درست» خطوطِ راهنما کشیده می‌شود تا مفهومِ «کادر را پر
    // کن» بصری شود.
    if (good) {
      final guide = Paint()
        ..color = BrandColors.successOnLight.withValues(alpha: 0.9)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2;
      const g = 9.0;
      for (final c in [
        [const Offset(g, g * 2.4), const Offset(g, g), const Offset(g * 2.4, g)],
        [Offset(w - g * 2.4, g), Offset(w - g, g), Offset(w - g, g * 2.4)],
        [Offset(g, h - g * 2.4), Offset(g, h - g), Offset(g * 2.4, h - g)],
        [
          Offset(w - g * 2.4, h - g),
          Offset(w - g, h - g),
          Offset(w - g, h - g * 2.4),
        ],
      ]) {
        canvas.drawPath(
          Path()
            ..moveTo(c[0].dx, c[0].dy)
            ..lineTo(c[1].dx, c[1].dy)
            ..lineTo(c[2].dx, c[2].dy),
          guide,
        );
      }
    }
  }

  @override
  bool shouldRepaint(_FramePainter old) => old.good != good;
}
