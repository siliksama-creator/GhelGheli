import 'package:flutter/material.dart';

import '../api_client.dart';

/// نشانِ سکه در ردیف‌ها و کارت‌های جدولِ لیگ —
/// آینهٔ `CoinChip` در `userweb/src/screens/League.jsx`.
///
/// ⚠️ جدولِ لیگ از دورِ دهم بر اساس **سکه** مرتب می‌شود و امتیاز فقط
///    تساوی‌شکن است. اگر فقط امتیاز نمایش داده شود، کاربر ردیفی را می‌بیند
///    که «۵۰۰ امتیاز» بالای «۹۰۰ امتیاز» نشسته و ترتیب برایش تصادفی به نظر
///    می‌رسد. معیارِ مرتب‌سازی باید دیده شود.
class CoinChip extends StatelessWidget {
  /// ⚠️ اندازهٔ پیش‌فرض عمداً ۲۲ است، نه ۱۴.
  ///
  /// نسخهٔ اول با آیکونِ ۱۴ پیکسلی ساخته شد و روی گوشیِ واقعی عملاً دیده
  /// نمی‌شد: آیکون یک لکهٔ نارنجی بود و عددِ کنارش از فونتِ بدنه هم
  /// کوچک‌تر. سکه معیارِ رتبه‌بندیِ کلِ لیگ است — مهم‌ترین عددِ آن صفحه —
  /// و نباید از امتیاز که حالا فقط تساوی‌شکن است ریزتر دیده شود.
  const CoinChip({super.key, required this.value, this.size = 22});

  /// سکهٔ فصلِ جاریِ آن کاربر. `null` مثل صفر رفتار می‌کند، چون ردیف‌های
  /// قدیمیِ آرشیو ممکن است این کلید را نداشته باشند.
  final Object? value;
  final double size;

  /// ⚠️ عمداً `as num` نیست.
  ///
  /// این ویجت داخلِ `ListView.builder` جدولِ لیگ رسم می‌شود. یک cast-error
  /// در یک ردیف، کلِ صفحه را سفید می‌کند — و صفحهٔ لیگ صفحه‌ای است که
  /// کاربر بیشترین وقت را در آن می‌گذراند. `INTEGER` امروز عدد برمی‌گرداند،
  /// ولی اگر روزی ستون به `BIGINT` تبدیل شود، درایورِ Postgres آن را رشته
  /// می‌دهد و کلِ جدول از کار می‌افتد. پارسِ نرم این ریسک را حذف می‌کند.
  int get _amount {
    final v = value;
    if (v is num) return v.toInt();
    return int.tryParse('$v') ?? 0;
  }

  @override
  Widget build(BuildContext context) {
    const gold = Color(0xFFFFD166);
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Image.asset(
          'assets/pass/icon_coin.webp',
          width: size,
          height: size,
          errorBuilder: (_, __, ___) => Icon(
            Icons.monetization_on_rounded,
            size: size,
            color: gold,
          ),
        ),
        const SizedBox(width: 5),
        Text(
          faNum(_amount),
          style: TextStyle(
            // نسبتِ ۰.۷۸ آینهٔ همان فرمولِ سمتِ وب است تا هر دو پلتفرم در
            // هر اندازه‌ای یک‌شکل دیده شوند.
            fontSize: (size * 0.78).roundToDouble(),
            fontWeight: FontWeight.w900,
            color: gold,
          ),
        ),
      ],
    );
  }
}
