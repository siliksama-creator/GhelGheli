import 'package:flutter/material.dart';
import '../../../api_client.dart';
import '../../../theme/tokens.dart';

/// نشانِ سکهٔ لیگ در پایانِ مسابقه — آینهٔ دقیقِ
/// `userweb/src/components/CoinAward.jsx`.
///
/// ── چرا وقتی صفر است چیزی رسم نمی‌شود ──
///
/// سکه فقط به برندهٔ یک مسابقهٔ شرط‌دارِ آنلاین مقابل انسان می‌رسد، آن هم
/// اگر سهمیهٔ روزش را داشته باشد و لیگی فعال باشد. در بقیهٔ حالت‌ها سرور
/// `coins: 0` می‌فرستد و این ویجت `SizedBox.shrink()` برمی‌گرداند.
/// نمایشِ «۰ سکه» به کاربر می‌گوید چیزی خراب شده، در حالی که فقط سکه‌ای
/// در کار نبوده.
class CoinAward extends StatelessWidget {
  const CoinAward({super.key, required this.amount, required this.mine});

  /// سکهٔ اعطا‌شده در این مسابقه.
  final int amount;

  /// آیا این سکه به خودِ کاربر رسید.
  final bool mine;

  @override
  Widget build(BuildContext context) {
    if (amount <= 0) return const SizedBox.shrink();

    // برنده طلاییِ پررنگ می‌بیند، بازنده همان نشان را کم‌رنگ — تا بداند
    // سکه واقعاً وجود دارد و دفعهٔ بعد ارزشِ جنگیدن دارد. یک خط متن، نه دو تا.
    const gold = Color(0xFFFFD166);
    final color = mine ? gold : const Color(0xFF94A3B8);
    final chip = Container(
      padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 9),
      decoration: BoxDecoration(
        borderRadius: Corners.rPill,
        gradient: mine
            ? const LinearGradient(colors: [Color(0x22FFD166), Color(0x22FF9F43)])
            : null,
        color: mine ? null : Colors.white.withValues(alpha: 0.04),
        border: Border.all(
          color: color.withValues(alpha: mine ? 1 : 0.33),
          width: 1,
        ),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Opacity(
            opacity: mine ? 1 : 0.55,
            child: Image.asset(
              'assets/pass/icon_coin.png',
              width: 26,
              height: 26,
              // اگر اسِت به هر دلیل لود نشد، نشان نباید کلاً ناپدید شود؛
              // متنِ سکه مهم‌تر از آیکونش است.
              errorBuilder: (_, __, ___) =>
                  Icon(Icons.monetization_on_rounded, size: 26, color: color),
            ),
          ),
          const SizedBox(width: 8),
          // ⚠️ `Flexible` لازم است، نه `Text` لخت.
          //
          // با بزرگ‌شدنِ فونت به ۱۶، متنِ بازنده («۱۰۰۰ سکه به حریف») روی
          // عرض‌های باریک ۳۵ پیکسل سرریز می‌کرد و نوارِ زردِ خطا روی صفحهٔ
          // نتیجه می‌نشست. `Row` با `mainAxisSize.min` به فرزندش عرضِ
          // نامحدود می‌دهد مگر اینکه صریحاً محدودش کنی.
          Flexible(
            child: Text(
              mine ? '+${faNum(amount)} سکه' : '${faNum(amount)} سکه به حریف',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                color: color,
                // ۱۶، نه ۱۲.۵: این تنها لحظه‌ای است که کاربر سکه گرفتنش را
                // می‌بیند و باید حس جایزه بدهد، نه حس زیرنویس.
                fontSize: 16,
                fontWeight: FontWeight.w900,
              ),
            ),
          ),
        ],
      ),
    );

    // انیمیشن فقط برای برنده. حرکتِ اضافه برای کسی که همین حالا امتیازش را
    // باخته توی ذوق می‌زند. `TweenAnimationBuilder` یک‌بار اجرا می‌شود و
    // نیازی به StatefulWidget/controller ندارد.
    if (!mine) return chip;
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0, end: 1),
      duration: const Duration(milliseconds: 500),
      curve: Curves.easeOutBack,
      builder: (_, t, child) => Opacity(
        opacity: t.clamp(0.0, 1.0),
        child: Transform.scale(scale: 0.4 + 0.6 * t, child: child),
      ),
      child: chip,
    );
  }
}
