import 'package:flutter/material.dart';

import '../api_client.dart';
import '../theme/tokens.dart';

/// خطِ «سهمیهٔ سکهٔ امروز» — دقیقاً آینهٔ همان بلوک در `games.jsx`.
///
/// چرا لازم است: سکه فقط به برندهٔ مسابقهٔ شرط‌دارِ آنلاین مقابل انسان می‌رسد
/// و روزانه سقف دارد (۳۰ برد در ورودیِ ۱۰۰ و ۱۵ برد در ۱۰۰۰). بدون این خط،
/// کاربری که سقفش پر شده می‌بَرد، سکه‌ای نمی‌گیرد و مطمئن می‌شود که برنامه
/// باگ دارد. یک خط، بدون شلوغی — قرار نیست متن‌ها زیاد شوند.
class CoinQuotaLine extends StatelessWidget {
  const CoinQuotaLine({super.key, required this.mode, required this.quota});

  /// ورودیِ انتخاب‌شده. فقط برای ۱۰۰ و ۱۰۰۰ معنا دارد: تمرین (۰) و لابی (−۱)
  /// اصلاً سکه نمی‌دهند، پس نمایشِ سهمیه در آن‌ها گمراه‌کننده است.
  final int mode;
  final Map<String, dynamic>? quota;

  @override
  Widget build(BuildContext context) {
    final remaining = quota?['remaining'];
    if (mode <= 0 || remaining is! Map) return const SizedBox.shrink();

    // کلیدهای JSON رشته‌اند ('100'), ولی اگر روزی عدد شدند هم نباید بشکند.
    final raw = remaining['$mode'] ?? remaining[mode];
    final left = raw is num ? raw.toInt() : int.tryParse('$raw');
    if (left == null) return const SizedBox.shrink();

    final hasLeft = left > 0;
    return Padding(
      padding: const EdgeInsets.only(top: Gaps.xs),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Image.asset(
            'assets/pass/icon_coin.webp',
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
                        const TextSpan(text: 'امروز '),
                        TextSpan(
                          text: faNum(left),
                          style: const TextStyle(
                            color: Color(0xFFFFD166),
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                        const TextSpan(text: ' برد دیگر سکه می‌دهد'),
                      ],
                    ),
                    textAlign: TextAlign.center,
                  )
                : const Text(
                    'سهمیهٔ سکهٔ امروزِ این ورودی پر شده — برد امتیاز دارد، سکه نه',
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
