import 'dart:math' as math;
import 'package:flutter/material.dart';

/// ── کلاسِ کارت در اندروید ────────────────────────────────────────────
///
/// خواستهٔ مالک (۳ مهر ۱۴۰۵): چهار کلاسِ یکپارچه —
/// «common: کارت‌های ۵۰۰ امتیازی، uncommon: ۱۰۰۰ امتیازی، rare: ۳۰۰۰
///  امتیازی، legendary: بالای ۳۰۰۰ … این لیست بر اساسِ میزانِ کمیابیِ
///  کارت‌هاست.»
///
/// پیش از این پنج کلاسِ دلبخواهی بود (normal/silver/gold/premium/legend)
/// که هیچ ربطی به امتیاز نداشت. حالا کلاس **تابعی از امتیاز** است:
///
///   common     معمولی     ۰    .. ۵۰۰
///   uncommon   کمیاب      ۵۰۱  .. ۱۰۰۰
///   rare       نایاب      ۱۰۰۱ .. ۳۰۰۰
///   legendary  افسانه‌ای  ۳۰۰۱ و بالاتر
const rarityLabels = <String, String>{
  'common': 'معمولی',
  'uncommon': 'کمیاب',
  'rare': 'نایاب',
  'legendary': 'افسانه‌ای',
};

/// پالتِ هر کلاس — [روشن، تیره]. سرور همان رنگ‌ها را در
/// `backend/src/lib/cardRarity.js` دارد و گاردِ `testCardRarity.js`
/// هر چهار کلاینت را واژه‌به‌واژه با آن می‌سنجد.
const rarityColors = <String, List<Color>>{
  'common': [Color(0xFF8FA3B8), Color(0xFF243244)],
  'uncommon': [Color(0xFF34D399), Color(0xFF065F46)],
  'rare': [Color(0xFFA78BFA), Color(0xFF312E81)],
  'legendary': [Color(0xFFFFD166), Color(0xFF7F1D1D)],
};

/// آستانهٔ بالای هر رده (شامل). `legendary` سقف ندارد.
const rarityMaxPoints = <String, int>{
  'common': 500,
  'uncommon': 1000,
  'rare': 3000,
};

/// کلیدهای نسلِ قبل → کلیدهای تازه.
///
/// چرا نگه داشته می‌شود: پاسخِ کش‌شدهٔ سرور، نصبِ آفلاینِ نسخهٔ قبلی و
/// تاریخچهٔ صندوق می‌توانستند «gold» بفرستند. بی این نگاشت، کارتِ طلاییِ
/// کاربر بی‌قاب و با برچسبِ خامِ انگلیسی دیده می‌شد.
const legacyRarity = <String, String>{
  'normal': 'common',
  'silver': 'uncommon',
  'gold': 'uncommon',
  'premium': 'rare',
  'legend': 'legendary',
};

/// هر رشته‌ای (تازه یا نسلِ قبل) → کلیدِ معتبرِ کلاس.
String normalizeRarity(Object? value) {
  final key = '${value ?? ''}'.trim();
  if (rarityColors.containsKey(key)) return key;
  return legacyRarity[key] ?? 'common';
}

/// کلاس را از امتیازِ کارت می‌سازد — همان نردبانِ سرور.
String rarityForPoints(Object? points) {
  final p = int.tryParse('${points ?? 0}'.split('.').first) ?? 0;
  if (p <= 500) return 'common';
  if (p <= 1000) return 'uncommon';
  if (p <= 3000) return 'rare';
  return 'legendary';
}

/// چهار مادهٔ متفاوت، نه یک قاب با چهار رنگ.
///
/// ── زبانِ طرح ────────────────────────────────────────────────────────
///
///   معمولی    فولادِ ماتِ گرافیتی + خطِ حکاکی  → ساکن و باوقار
///   کمیاب     زمردِ صیقلی که نفس می‌کشد        → لغزشِ نور + هالهٔ نبض‌دار
///   نایاب     شفقِ قطبیِ بنفش                  → چرخشِ aurora + جرقه‌های بالارو
///   افسانه‌ای طلای گداخته + اخگرِ آتش           → چرخشِ تند + تاج + هالهٔ طلایی
///
/// ⚠️ چرا `common` عمداً انیمیشن ندارد (و تنبلی نیست): اینونتوری تا ۲۴ کارت
///    را هم‌زمان می‌چیند و بیشترشان معمولی‌اند. ۲۴ کنترلرِ ۶۰fps روی صفحهٔ
///    کلکسیون یعنی باتری می‌سوزد و هیچ پیکسلی عوض نمی‌شود. همان تصمیمی که
///    وب هم گرفت (`.rarityCardFrame.rarity-common{animation:none}`).
class RarityCardFrame extends StatefulWidget {
  const RarityCardFrame({
    super.key,
    required this.rarity,
    required this.child,
    this.borderRadius = 20,
    this.padding = 4,
    this.cornerText,
  });

  final String? rarity;
  final Widget child;
  final double borderRadius;
  final double padding;

  /// متنِ نگینِ گوشهٔ پایینِ قاب — جایِ نگینِ کمیابی.
  ///
  /// خواستهٔ مالک (۳۰ شهریور): وقتی کاربر چند نسخه از یک کارت دارد، عددِ
  /// تعداد (مثلِ «×۲») به‌جایِ نشانِ کمیابی داخلِ همان مربعِ گوشه نوشته
  /// شود. وب همان را با کلاسِ `.rarityQtyCorner` پیاده می‌کند و گاردِ
  /// `inventory-qty-parity.mjs` هر دو کلاینت را به هم می‌دوزد.
  /// `null` یعنی رفتارِ قبلی (نگینِ کمیابی).
  final String? cornerText;

  @override
  State<RarityCardFrame> createState() => _RarityCardFrameState();
}

class _RarityCardFrameState extends State<RarityCardFrame>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 3400),
  )..repeat();

  /// تعدادِ ذراتِ شناورِ هر کلاس. صفر = لایهٔ ذرات اصلاً ساخته نمی‌شود.
  static const _sparkCount = <String, int>{'rare': 5, 'legendary': 7};

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Gradient _borderGradient(String rarity, List<Color> colors, double t) {
    switch (rarity) {
      case 'common':
        // فولادِ مات: گرادیانِ ثابت، بدونِ چرخش. «ساکن» خودش یک طرح است.
        return const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFFA9BCD0), Color(0xFF4A5C72), Color(0xFF1B2635), Color(0xFF080F17)],
        );
      case 'uncommon':
        // زمردِ نفس‌کش: لغزشِ آرامِ نور از چپ به راست و برگشت — بدونِ
        // پرشِ لحظه‌ایِ گرادیانِ چرخان (که برای زمردِ صیقلی مصنوعی است).
        final breath = (math.sin((t - .25) * math.pi * 2) + 1) / 2;
        return LinearGradient(
          begin: Alignment(-1 + breath * 2, -1),
          end: Alignment(1 + breath * 2, 1),
          colors: const [
            Color(0xFF7CF0C4), Color(0xFF10B981), Color(0xFF065F46), Color(0xFF03170F),
          ],
        );
      case 'rare':
        return SweepGradient(
          transform: GradientRotation(t * math.pi * 2),
          colors: const [
            Color(0xFF22D3EE), Color(0xFF8B5CF6), Color(0xFFF472B6),
            Color(0xFF1E1B4B), Color(0xFF6366F1), Color(0xFF22D3EE),
          ],
        );
      // `case 'legendary'` و `default` پشتِ هم: نردبان چهار پله دارد و
      // `normalizeRarity` تضمین می‌کند ورودی یکی از همان چهارتاست؛ برچسبِ
      // صریح اینجا برای خوانایی است و `default` برای اطمینانِ کامپایلر.
      case 'legendary':
      default:
        return SweepGradient(
          transform: GradientRotation(t * math.pi * 2),
          colors: const [
            Color(0xFFFFF3C4), Color(0xFFFFD166), Color(0xFFF97316),
            Color(0xFF7F1D1D), Color(0xFFFBBF24), Color(0xFFFFF3C4),
          ],
        );
    }
  }

  /// هالهٔ بیرونیِ کارت — با سایهٔ جعبه ساخته می‌شود، پس هیچ لایهٔ تصویری
  /// جدیدی نمی‌خواهد و روی عکس بازیکن نمی‌افتد.
  Widget _halo(String rarity, List<Color> colors, double pulse) {
    if (rarity == 'common') return const SizedBox.shrink();
    final legendary = rarity == 'legendary';
    final glow = legendary ? const Color(0xFFF59E0B) : colors.first;
    return Positioned.fill(
      child: IgnorePointer(
        child: DecoratedBox(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(widget.borderRadius + 3),
            boxShadow: [
              BoxShadow(
                color: glow.withValues(alpha: (legendary ? .40 : .26) + pulse * .26),
                blurRadius: (legendary ? 32 : 22) + pulse * 14,
                spreadRadius: pulse * 3,
              ),
            ],
          ),
        ),
      ),
    );
  }

  /// ذراتِ بالارو (جرقهٔ نایاب / اخگرِ افسانه‌ای).
  ///
  /// مسیرِ هر ذره قطعی است (از `index` ساخته می‌شود، نه تصادفی)، پس
  /// انیمیشن بین فریم‌ها نمی‌لرزد و تست هم قابلِ تکرار است.
  Widget _sparks(String rarity, double t) {
    final count = _sparkCount[rarity] ?? 0;
    if (count == 0) return const SizedBox.shrink();
    final legendary = rarity == 'legendary';
    final color = legendary ? const Color(0xFFFFE9A8) : const Color(0xFFE9D5FF);
    final glow = legendary ? const Color(0xFFF59E0B) : const Color(0xFFA78BFA);
    final size = legendary ? 5.0 : 4.0;
    return Positioned.fill(
      child: IgnorePointer(
        child: Stack(
          clipBehavior: Clip.none,
          children: [
            for (var i = 0; i < count; i++) _spark(i, count, t, color, glow, size),
          ],
        ),
      ),
    );
  }

  Widget _spark(int index, int count, double t, Color color, Color glow, double size) {
    final phase = (t + index / count) % 1.0;
    final lane = ((index * 37) % 100) / 100 * 1.7 - 0.85;
    final wobble = math.sin((phase + index) * math.pi * 2) * 0.07;
    final opacity = math.sin(phase * math.pi);
    return Positioned.fill(
      child: Align(
        alignment: Alignment(lane + wobble, 0.95 - phase * 2.05),
        child: Opacity(
          opacity: opacity.clamp(0.0, 1.0),
          child: Container(
            width: size,
            height: size,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: color,
              boxShadow: [
                BoxShadow(color: glow, blurRadius: size * 2, spreadRadius: size * .3),
              ],
            ),
          ),
        ),
      ),
    );
  }

  /// لغزشِ نور روی شیشه — برای کمیاب/نایاب/افسانه‌ای.
  Widget _shine(String rarity, double t) {
    if (rarity == 'common') return const SizedBox.shrink();
    final legendary = rarity == 'legendary';
    final x = -2.4 + t * 4.8;
    return Positioned.fill(
      child: IgnorePointer(
        child: ClipRRect(
          borderRadius: BorderRadius.circular(widget.borderRadius - 1),
          child: DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment(x - 1, -.7),
                end: Alignment(x + 1, .7),
                colors: [
                  Colors.transparent,
                  (legendary ? const Color(0xFFFFF8DC) : Colors.white)
                      .withValues(alpha: legendary ? .30 : .18),
                  Colors.transparent,
                ],
                stops: const [.32, .5, .68],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _ornaments(String rarity, List<Color> colors, double pulse) {
    // خطِ حکاکیِ فولادِ معمولی: یک قابِ موییِ داخلی — همان چیزی که «فلزِ
    // ساخت‌شده» را از «تصویرِ تخت» جدا می‌کند.
    if (rarity == 'common') {
      return Positioned.fill(
        child: IgnorePointer(
          child: Container(
            margin: const EdgeInsets.all(7),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(widget.borderRadius - 7),
              border: Border.all(color: Colors.white.withValues(alpha: 0.16)),
            ),
          ),
        ),
      );
    }
    if (rarity == 'uncommon') {
      return Positioned.fill(
        child: IgnorePointer(
          child: Container(
            margin: const EdgeInsets.all(7),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(widget.borderRadius - 7),
              border: Border.all(
                color: const Color(0xFF6EE7B7).withValues(alpha: .42 + pulse * .35),
              ),
            ),
          ),
        ),
      );
    }
    // وقتی عددِ تعداد در گوشه می‌نشیند، نگینِ کمیابی کنار می‌رود تا دو
    // نشان روی هم نیفتند (وب هم pseudo عنصرِ rarity را content:none می‌کند).
    if (widget.cornerText != null) return const SizedBox.shrink();
    final legendary = rarity == 'legendary';
    final symbol = legendary ? '♛' : '✦';
    return PositionedDirectional(
      bottom: -6,
      end: -5,
      child: Transform.rotate(
        angle: legendary ? 0 : pulse * .25,
        child: Container(
          width: legendary ? 24 : 20,
          height: legendary ? 24 : 20,
          decoration: BoxDecoration(
            borderRadius: legendary ? BorderRadius.circular(99) : BorderRadius.circular(6),
            color: colors.first,
            border: Border.all(color: Colors.white54),
            boxShadow: [
              BoxShadow(color: colors.last.withValues(alpha: .75), blurRadius: 8 + pulse * 8),
            ],
          ),
          alignment: Alignment.center,
          child: Text(symbol,
              style: const TextStyle(color: Color(0xFF071522), fontSize: 9, fontWeight: FontWeight.w900)),
        ),
      ),
    );
  }

  Widget _paint(double t) {
    final rarity = normalizeRarity(widget.rarity);
    final colors = rarityColors[rarity]!;
    final pulse = math.sin(t * math.pi * 2).abs();
    final energetic = rarity == 'rare' || rarity == 'legendary';
    final labelColor = energetic ? Colors.white : const Color(0xFF071522);

    return Stack(
      clipBehavior: Clip.none,
      children: [
        _halo(rarity, colors, pulse),
        Container(
          padding: EdgeInsets.all(widget.padding),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(widget.borderRadius),
            gradient: _borderGradient(rarity, colors, t),
            boxShadow: [
              BoxShadow(
                color: colors.last.withValues(alpha: rarity == 'common' ? .20 : .30 + pulse * .22),
                blurRadius: rarity == 'common' ? 9 : 13 + pulse * 10,
                offset: const Offset(0, 6),
              ),
            ],
          ),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(widget.borderRadius - widget.padding),
            child: widget.child,
          ),
        ),
        // ترتیبِ لایه‌ها عمدی است: نگین و ذرات **روی** لغزشِ نور می‌آیند تا
        // نورِ متحرک نشانِ کمیابی را کم‌رنگ نکند.
        _ornaments(rarity, colors, pulse),
        _sparks(rarity, t),
        _shine(rarity, t),
        if (widget.cornerText != null)
          PositionedDirectional(
            bottom: -6,
            end: -5,
            child: Container(
              constraints: const BoxConstraints(minWidth: 21),
              height: 21,
              padding: const EdgeInsets.symmetric(horizontal: 5),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(6),
                gradient: LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [colors.first, colors.last],
                ),
                border: Border.all(color: Colors.white54),
                boxShadow: [
                  BoxShadow(color: colors.first.withValues(alpha: .6), blurRadius: 8),
                ],
              ),
              alignment: Alignment.center,
              child: Text(
                widget.cornerText!,
                style: TextStyle(
                  color: rarity == 'uncommon' ? const Color(0xFF03170F) : Colors.white,
                  fontSize: 9.5,
                  fontWeight: FontWeight.w900,
                ),
              ),
            ),
          ),
        PositionedDirectional(
          top: -8,
          start: 8,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(99),
              gradient: LinearGradient(colors: colors),
              border: Border.all(color: Colors.white54),
              boxShadow: const [BoxShadow(color: Colors.black54, blurRadius: 8, offset: Offset(0, 3))],
            ),
            child: Text(
              rarityLabels[rarity]!,
              style: TextStyle(fontSize: 9.5, color: labelColor, fontWeight: FontWeight.w900),
            ),
          ),
        ),
        if (rarity == 'legendary')
          PositionedDirectional(
            top: -9,
            end: -5,
            child: Transform.scale(
              scale: .92 + pulse * .18,
              child: const CircleAvatar(
                radius: 10,
                backgroundColor: Color(0xFFFFD166),
                child: Text('★', style: TextStyle(fontSize: 9, color: Color(0xFF7F1D1D))),
              ),
            ),
          ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final reduceMotion = MediaQuery.maybeOf(context)?.disableAnimations ?? false;
    // معمولی عمداً مات و ساکن است: بازسازیِ ۶۰fpsِ هر کارتِ معمولیِ
    // اینونتوری باتری می‌خورد و یک پیکسل هم عوض نمی‌کند.
    if (reduceMotion || normalizeRarity(widget.rarity) == 'common') {
      return RepaintBoundary(child: _paint(.25));
    }
    return RepaintBoundary(
      child: AnimatedBuilder(
        animation: _controller,
        builder: (_, __) => _paint(_controller.value),
      ),
    );
  }
}

class CardDuelStatsMini extends StatelessWidget {
  const CardDuelStatsMini({super.key, required this.item});
  final Map item;

  @override
  Widget build(BuildContext context) {
    final values = <(String, Object?)>[
      ('حمله', item['duel_attack']),
      ('دفاع', item['duel_defense']),
      ('سرعت', item['duel_speed']),
      ('تکنیک', item['duel_technique']),
      ('گل', item['duel_goal_chance']),
      ('انرژی', item['duel_energy']),
    ];
    return Wrap(
      spacing: 3,
      runSpacing: 3,
      alignment: WrapAlignment.center,
      children: [
        for (final value in values)
          Container(
            width: 46,
            padding: const EdgeInsets.symmetric(vertical: 2.5),
            decoration: BoxDecoration(
              color: Colors.black.withValues(alpha: .30),
              borderRadius: BorderRadius.circular(7),
            ),
            child: Text(
              '${value.$1} ${value.$2 ?? 0}',
              textAlign: TextAlign.center,
              style: const TextStyle(
                fontSize: 8.2,
                color: Colors.white70,
                fontWeight: FontWeight.w800,
              ),
            ),
          ),
      ],
    );
  }
}
