import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../api_client.dart';

/// کارتِ «سکه چیست و چطور به دست می‌آید» — بالای جدولِ لیگ.
/// آینهٔ دقیقِ `userweb/src/components/CoinGuide.jsx`.
///
/// ── چرا این کارت لازم است ──
///
/// سکه ارزِ تازه‌ای است که یک‌شبه معیارِ رتبه‌بندی شد. کاربری که دیروز با
/// امتیاز صدرنشین بود، امروز می‌بیند رتبه‌اش با عددی تعیین می‌شود که اسمش را
/// هم نشنیده. بدون توضیح، تنها نتیجه‌گیریِ ممکن این است که «برنامه خراب شده».
///
/// جدولِ سه‌ستونی عمدی است: نگفتنِ عددِ دقیق یعنی کاربر باید حدس بزند کدام
/// بازی می‌ارزد، و حدس‌زدن همان چیزی است که حس «قمار» می‌دهد.
///
/// ── بازطراحیِ دورِ بیست‌ویکم: «بدون اسکرول» ──
///
/// نسخهٔ قبلی همه‌چیز — از جمله جدولِ نرخ — را پشتِ آکاردئون پنهان می‌کرد.
/// یعنی کاربر برای فهمیدنِ «سکه چطور به دست می‌آید» باید اول کارت را پیدا
/// می‌کرد، بعد بازش می‌کرد، بعد اسکرول می‌کرد. عملاً هیچ‌کس این سه کار را
/// نمی‌کند.
///
/// حالا تفکیک بر اساسِ «چیزی که باید بدانی» در برابر «چیزی که خوب است
/// بدانی» است، نه بر اساسِ کم‌کردنِ ارتفاع:
///   • همیشه پیدا  → یک جمله + جدولِ نرخ (همان پاسخِ سؤال).
///   • بازشدنی     → پنج قاعدهٔ ریز که فقط کنجکاوها می‌خواهند.
/// معنیِ کلیدِ `coinGuideSeen` عوض نشده: «قبلاً جزئیات را دیده».
class CoinGuide extends StatefulWidget {
  const CoinGuide({super.key});

  @override
  State<CoinGuide> createState() => _CoinGuideState();
}

class _CoinGuideState extends State<CoinGuide> {
  /// آیا بخشِ «قوانین کامل» باز است.
  ///
  /// بارِ اول باز است: کاربر روی چیزی که نمی‌شناسد ضربه نمی‌زند، پس اگر
  /// بسته شروع شود هرگز خوانده نمی‌شود. بعد از اولین بستن، انتخابش را
  /// به خاطر می‌سپاریم تا هر بار جلوی چشمش نباشد. جملهٔ اصلی و جدولِ نرخ
  /// به این پرچم کاری ندارند — آنها همیشه دیده می‌شوند.
  bool _open = true;
  static const _seenKey = 'coinGuideSeen';

  @override
  void initState() {
    super.initState();
    _restore();
  }

  Future<void> _restore() async {
    try {
      final p = await SharedPreferences.getInstance();
      if (p.getBool(_seenKey) == true && mounted) setState(() => _open = false);
    } catch (_) {
      // حافظهٔ محلی در دسترس نبود — کارت باز می‌ماند. بدترین حالت این است
      // که کاربر یک بار دیگر ببندش.
    }
  }

  Future<void> _toggle() async {
    final wasOpen = _open;
    setState(() => _open = !_open);
    if (wasOpen) {
      try {
        final p = await SharedPreferences.getInstance();
        await p.setBool(_seenKey, true);
      } catch (_) {}
    }
  }

  static const _gold = Color(0xFFFFD166);

  /// جدولِ سکه — همان اعدادِ `COIN_TABLE` در بک‌اند.
  static const _rows = [
    ('دوئل کارت', 2, 20, 'طولانی‌ترین و فکری‌ترین بازی'),
    ('پنالتی', 1, 10, null),
    ('جفت‌یاب', 1, 10, null),
  ];

  static const _bullets = [
    ('✅', 'فقط برنده سکه می‌گیرد — مقابل حریف واقعی و با ورودی امتیاز.'),
    ('🚫', 'مساوی، باخت، بازی با ربات و تمرین رایگان سکه ندارند.'),
    ('🔒', 'سکه هرگز از شما کم نمی‌شود؛ حتی وقتی ببازید.'),
    ('📅',
        'هر روز تا ۳۰ برد در ورودی ۱۰۰ و ۱۵ برد در ورودی ۱۰۰۰ سکه می‌دهد. بعد از آن، برد امتیاز دارد ولی سکه نه.'),
    ('🏆', 'در پایان فصل، جوایز بر اساس سکه پرداخت و سکه‌ها صفر می‌شود.'),
  ];

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(18),
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFF2A1F05), Color(0xFF14100A)],
        ),
        border: Border.all(color: _gold.withValues(alpha: 0.45), width: 1.5),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // ── پاسخِ سؤال: همیشه دیده می‌شود، بدونِ ضربه و بدونِ اسکرول ──
          Padding(
              padding: const EdgeInsets.fromLTRB(16, 14, 16, 12),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Image.asset(
                    'assets/pass/icon_coin.webp',
                    width: 46,
                    height: 46,
                    errorBuilder: (_, __, ___) => const Icon(
                        Icons.monetization_on_rounded,
                        size: 46,
                        color: _gold),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('سکه چطور به دست می‌آید؟',
                            style: TextStyle(
                                fontSize: 17,
                                fontWeight: FontWeight.w900,
                                color: _gold)),
                        const SizedBox(height: 3),
                        RichText(
                          text: TextSpan(
                            style: TextStyle(
                                fontSize: 13.5,
                                height: 1.6,
                                color: Colors.white.withValues(alpha: 0.90)),
                            children: const [
                              TextSpan(text: 'رتبهٔ لیگ با '),
                              TextSpan(
                                  text: 'سکه',
                                  style: TextStyle(
                                      color: _gold,
                                      fontWeight: FontWeight.w900)),
                              TextSpan(
                                  text:
                                      ' تعیین می‌شود، نه امتیاز — و سکه فقط با '),
                              TextSpan(
                                  text: 'بردن مسابقه مقابل حریف واقعی',
                                  style: TextStyle(
                                      color: _gold,
                                      fontWeight: FontWeight.w900)),
                              TextSpan(text: ' به دست می‌آید.'),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),

          // ── جدولِ نرخ: مهم‌ترین عددهای صفحه، پس پنهان نمی‌شود ──
          Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Container(
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(14),
                      color: Colors.black.withValues(alpha: 0.30),
                      border:
                          Border.all(color: _gold.withValues(alpha: 0.24)),
                    ),
                    clipBehavior: Clip.antiAlias,
                    child: Table(
                      columnWidths: const {
                        0: FlexColumnWidth(1.35),
                        1: FlexColumnWidth(1),
                        2: FlexColumnWidth(1),
                      },
                      children: [
                        const TableRow(children: [
                          _Head('بردِ شما در', start: true),
                          _Head('ورودی ۱۰۰'),
                          _Head('ورودی ۱۰۰۰'),
                        ]),
                        for (final r in _rows)
                          TableRow(
                            decoration: BoxDecoration(
                              border: Border(
                                  top: BorderSide(
                                      color: Colors.white
                                          .withValues(alpha: 0.07))),
                            ),
                            children: [
                              Padding(
                                padding:
                                    const EdgeInsets.fromLTRB(10, 9, 10, 9),
                                child: Column(
                                  crossAxisAlignment:
                                      CrossAxisAlignment.start,
                                  children: [
                                    Text(r.$1,
                                        style: const TextStyle(
                                            fontSize: 14,
                                            fontWeight: FontWeight.w800,
                                            color: Colors.white)),
                                    if (r.$4 != null) ...[
                                      const SizedBox(height: 2),
                                      Text(r.$4!,
                                          style: const TextStyle(
                                              fontSize: 11.5,
                                              fontWeight: FontWeight.w600,
                                              color: Color(0xFF94A3B8))),
                                    ],
                                  ],
                                ),
                              ),
                              _Cell(faNum(r.$2)),
                              _Cell(faNum(r.$3)),
                            ],
                          ),
                      ],
                    ),
                  ),
                ],
              ),
            ),

          // ── قواعدِ ریز: بازشدنی، چون پاسخِ سؤالِ اصلی نیستند ──
          InkWell(
            onTap: _toggle,
            child: Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(vertical: 11, horizontal: 16),
              decoration: BoxDecoration(
                color: _gold.withValues(alpha: 0.09),
                border: Border(
                    top: BorderSide(color: _gold.withValues(alpha: 0.22))),
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(_open ? 'بستن جزئیات' : 'قوانین کامل سکه',
                      style: const TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w900,
                          color: _gold)),
                  const SizedBox(width: 7),
                  AnimatedRotation(
                    turns: _open ? 0.5 : 0,
                    duration: const Duration(milliseconds: 200),
                    child: const Icon(Icons.keyboard_arrow_down_rounded,
                        color: _gold, size: 22),
                  ),
                ],
              ),
            ),
          ),

          if (_open)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 13, 16, 16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  for (final b in _bullets)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 9),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(b.$1,
                              style: const TextStyle(
                                  fontSize: 15, height: 1.5)),
                          const SizedBox(width: 9),
                          Expanded(
                            child: Text(
                              b.$2,
                              style: TextStyle(
                                  fontSize: 13.5,
                                  height: 1.65,
                                  color:
                                      Colors.white.withValues(alpha: 0.88)),
                            ),
                          ),
                        ],
                      ),
                    ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

class _Head extends StatelessWidget {
  const _Head(this.text, {this.start = false});
  final String text;
  final bool start;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.fromLTRB(start ? 10 : 4, 9, start ? 10 : 4, 9),
      child: Text(
        text,
        textAlign: start ? TextAlign.start : TextAlign.center,
        style: const TextStyle(
            fontSize: 12.5,
            fontWeight: FontWeight.w800,
            color: Color(0xFF94A3B8)),
      ),
    );
  }
}

/// خانهٔ عددِ جدول — آیکونِ سکه کنارِ عدد.
///
/// آیکون در نسخهٔ قبلی نبود و ستون‌ها فقط «۲ / ۲۰» بودند؛ در جدولی که
/// بالایش «ورودی ۱۰۰» نوشته شده، عددِ برهنه به‌سادگی با امتیاز اشتباه
/// گرفته می‌شود. آیکون همان‌جا می‌گوید واحدش سکه است.
class _Cell extends StatelessWidget {
  const _Cell(this.text);
  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Image.asset(
            'assets/pass/icon_coin.webp',
            width: 17,
            height: 17,
            errorBuilder: (_, __, ___) => const SizedBox.shrink(),
          ),
          const SizedBox(width: 4),
          Text(
            text,
            style: const TextStyle(
                fontSize: 15,
                fontWeight: FontWeight.w900,
                color: Color(0xFFFFD166)),
          ),
        ],
      ),
    );
  }
}
