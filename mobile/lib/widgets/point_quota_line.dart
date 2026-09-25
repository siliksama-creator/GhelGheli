import 'package:flutter/material.dart';

import '../api_client.dart';
import '../theme/tokens.dart';

/// خطِ «سقفِ امتیازِ امروز» — آینهٔ `CoinQuotaLine` برای سقفِ روزانهٔ
/// امتیازِ کسب‌شده از بازی‌های شرطی (خواستهٔ مالک، ۴ مهر ۱۴۰۵).
///
/// چرا لازم است: بعد از پر شدنِ سقف، برد **سکه** می‌دهد ولی **امتیاز** نه.
/// بدون این خط، کاربر می‌بَرد، امتیازِ انتظارش را نمی‌گیرد و مطمئن می‌شود
/// برنامه باگ دارد. دقیقاً کنارِ خطِ سهمیهٔ سکه — همان‌جا که ورودی انتخاب
/// می‌شود — یک خط، بدون شلوغی.
class PointQuotaLine extends StatelessWidget {
  const PointQuotaLine({super.key, required this.mode, required this.quota});

  /// ورودیِ انتخاب‌شده. تمرین (۰) و لابی (−۱) اصلاً امتیازِ شرطی
  /// جابه‌جا نمی‌کنند، پس نمایشِ سقف در آن‌ها بی‌معناست.
  final int mode;
  final Map<String, dynamic>? quota;

  @override
  Widget build(BuildContext context) {
    if (mode <= 0 || quota == null) return const SizedBox.shrink();

    // قراردادِ سرور: `cap` صفر یا `remaining: null` یعنی سقف غیرفعال است
    // و هیچ خطی رسم نمی‌شود (بهتر از «۰ باقی‌مانده»ی دروغ).
    final cap = (quota!['cap'] as num?)?.toInt() ?? 0;
    final remaining = (quota!['remaining'] as num?)?.toInt();
    if (cap <= 0 || remaining == null) return const SizedBox.shrink();

    final hasLeft = remaining > 0;
    return Padding(
      padding: const EdgeInsets.only(top: Gaps.xs),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Image.asset(
            'assets/pass/icon_points.webp',
            width: 22,
            height: 22,
            opacity: AlwaysStoppedAnimation(hasLeft ? 1.0 : 0.5),
          ),
          const SizedBox(width: 8),
          Flexible(
            child: hasLeft
                ? Text.rich(
                    TextSpan(
                      style: const TextStyle(
                          fontSize: 13.5, height: 1.5, color: Color(0xFFCBD5E1)),
                      children: [
                        const TextSpan(text: 'امروز تا '),
                        TextSpan(
                          text: faNum(remaining),
                          style: const TextStyle(
                            color: Color(0xFFFFD166),
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                        const TextSpan(text: ' امتیاز دیگر از برد آنلاین می‌گیری'),
                      ],
                    ),
                    textAlign: TextAlign.center,
                  )
                : const Text(
                    'سقفِ امتیازِ امروز پر شده — برد سکه می‌دهد، امتیاز نه؛ باخت جا باز می‌کند',
                    style: TextStyle(
                        fontSize: 13.5, height: 1.5, color: Color(0xFFF59E0B)),
                    textAlign: TextAlign.center,
                  ),
          ),
        ],
      ),
    );
  }
}
