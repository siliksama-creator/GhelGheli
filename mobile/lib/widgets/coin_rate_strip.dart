import 'package:flutter/material.dart';

import '../api_client.dart';

/// نوارِ کوچکِ نرخِ سکه — بالای فهرستِ بازی‌ها.
///
/// ── چرا اینجا هم لازم است ──
///
/// جدولِ کاملِ نرخ در صفحهٔ لیگ است، ولی تصمیمِ «کدام بازی را بازی کنم»
/// در صفحهٔ بازی‌ها گرفته می‌شود. کاربر برای دیدنِ نرخ نباید به تبِ
/// دیگری برود و برگردد؛ تا وقتی عدد جلوی چشمش نباشد، انتخابش تصادفی است.
///
/// ── چرا این‌قدر کوچک ──
///
/// خواستهٔ صریحِ مالک: «خیلی شلوغ نشه». پس این نسخه عمداً حداقلی است —
/// سه ردیف، بدونِ عنوانِ توضیحی، بدونِ قواعد، بدونِ آیکونِ بازی. توضیحِ
/// کامل یک تپ آن‌طرف‌تر در صفحهٔ لیگ می‌ماند.
///
/// آینهٔ دقیقِ `CoinRateStrip.jsx`. اعداد از `COIN_TABLE` بک‌اند می‌آیند.
class CoinRateStrip extends StatelessWidget {
  const CoinRateStrip({super.key});

  static const _rows = [
    ('دوئل کارت', 2, 20),
    ('پنالتی', 1, 10),
    ('جفت‌یاب', 1, 10),
  ];

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            const Color(0xFF2A1F05).withValues(alpha: 0.9),
            const Color(0xFF14100A).withValues(alpha: 0.9),
          ],
        ),
        border: Border.all(color: _gold.withValues(alpha: 0.32)),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // ── سرستون ──
          Container(
            padding: const EdgeInsets.fromLTRB(12, 7, 12, 6),
            decoration: BoxDecoration(
              border: Border(
                  bottom: BorderSide(color: _gold.withValues(alpha: 0.16))),
            ),
            child: Row(
              children: [
                Expanded(
                  flex: 13,
                  child: Row(
                    children: [
                      Image.asset('assets/pass/icon_coin.webp',
                          width: 16,
                          height: 16,
                          errorBuilder: (_, __, ___) => const Icon(
                              Icons.monetization_on_rounded,
                              size: 16,
                              color: _gold)),
                      const SizedBox(width: 6),
                      const Text('سکهٔ برد',
                          style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w900,
                              color: _gold)),
                    ],
                  ),
                ),
                const Expanded(flex: 10, child: _HeadCell('ورودی ۱۰۰')),
                const Expanded(flex: 10, child: _HeadCell('ورودی ۱۰۰۰')),
              ],
            ),
          ),

          // ── ردیف‌ها ──
          for (var i = 0; i < _rows.length; i++)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
              decoration: i == 0
                  ? null
                  : BoxDecoration(
                      border: Border(
                          top: BorderSide(
                              color: Colors.white.withValues(alpha: 0.05))),
                    ),
              child: Row(
                children: [
                  Expanded(
                    flex: 13,
                    child: Text(
                      _rows[i].$1,
                      style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                          color: Colors.white.withValues(alpha: 0.92)),
                    ),
                  ),
                  Expanded(flex: 10, child: _ValueCell(_rows[i].$2)),
                  Expanded(flex: 10, child: _ValueCell(_rows[i].$3)),
                ],
              ),
            ),

          // ── پانویسِ تک‌خطی ──
          Container(
            padding: const EdgeInsets.fromLTRB(12, 5, 12, 6),
            decoration: BoxDecoration(
              border:
                  Border(top: BorderSide(color: _gold.withValues(alpha: 0.14))),
            ),
            child: Text(
              'فقط بردِ آنلاین مقابل حریف واقعی سکه می‌دهد · رتبهٔ لیگ با سکه تعیین می‌شود',
              style: TextStyle(
                  fontSize: 10.5,
                  height: 1.5,
                  color: Colors.white.withValues(alpha: 0.55)),
            ),
          ),
        ],
      ),
    );
  }
}

class _HeadCell extends StatelessWidget {
  const _HeadCell(this.text);
  final String text;

  @override
  Widget build(BuildContext context) => Text(
        text,
        textAlign: TextAlign.center,
        style: const TextStyle(
            fontSize: 10.5,
            fontWeight: FontWeight.w800,
            color: Color(0xFF94A3B8)),
      );
}

class _ValueCell extends StatelessWidget {
  const _ValueCell(this.value);
  final int value;

  @override
  Widget build(BuildContext context) => Text(
        faNum(value),
        textAlign: TextAlign.center,
        style: const TextStyle(
            fontSize: 13, fontWeight: FontWeight.w900, color: _gold),
      );
}

const _gold = Color(0xFFFFD166);
