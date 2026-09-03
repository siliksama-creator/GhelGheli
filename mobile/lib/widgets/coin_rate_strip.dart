import 'package:flutter/material.dart';

import '../api_client.dart';
import '../core/app_config.dart';
import '../core/json_get.dart';

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
///
/// 🔴 دورِ ۳۲ — `mode` اضافه شد. آینهٔ همان تغییر در `CoinRateStrip.jsx`:
/// نوار تا پیش از این حتی در «تمرین با ربات» و «اتاق خصوصی» — که طبقِ
/// قاعدهٔ خودمان سکه نمی‌دهند — جدولِ نرخ را نشان می‌داد. عدد غلط نبود،
/// ولی به حالتِ فعلی ربطی نداشت و کاربر آن را «نادقیق» تجربه می‌کرد.
class CoinRateStrip extends StatelessWidget {
  const CoinRateStrip({super.key, this.mode, this.economy, this.gamePoints});

  /// ورودیِ انتخاب‌شده. `null` یعنی «حالت مهم نیست، جدول را نشان بده».
  final int? mode;

  /// اقتصادِ بازی‌ها از `/api/bootstrap` (تنظیماتِ ادمین). اگر نباشد —
  /// نسخهٔ قدیمی یا آفلاین — جدولِ پیش‌فرض استفاده می‌شود.
  final Map<String, dynamic>? economy;
  final Map<String, dynamic>? gamePoints;

  static const _defaultRows = [
    ('برد', 10, 30),
    ('مساوی', 3, 9),
    ('باخت', 1, 3),
  ];

  /// اعدادِ زنده از تنظیماتِ ادمین — بدونِ آپدیتِ اپ.
  ///
  /// پیش‌فرض‌ها از `_defaultRows` می‌آیند تا فیلد استفاده شود و گاردِ
  /// همسانی همان عددها را در سورس ببیند. کلیدِ سطحِ ورودی با `jsonGet`
  /// خوانده می‌شود چون JSON شبکه `"100"` می‌فرستد نه `100`.
  List<(String, int, int)> get _rows {
    final rewards = economy?['coinRewards'];
    final base = rewards is Map ? jsonMap(rewards['card_duel']) : null;
    int v(String key, int stake, int fallback) {
      final stakeMap = jsonGet(base, stake);
      if (stakeMap is Map) {
        final n = num.tryParse('${stakeMap[key] ?? ''}');
        if (n != null) return n.toInt();
      }
      return fallback;
    }
    // `100/1000`ِ دستی در سه ردیفِ بالا، همان چیزی بود که جدول را به
    // «دو ستونِ همیشگی» قفل می‌کرد در حالی که متنِ زیرِ جدول از config
    // می‌آمد. حالا هر دو از `_tiers` می‌آیند؛ با دو لایه (وضعیتِ امروز)
    // خروجی واژه‌به‌واژه همان است.
    final low = _tiers[0], high = _tiers[1];
    return [
      (_defaultRows[0].$1, v('win', low, _defaultRows[0].$2),
          v('win', high, _defaultRows[0].$3)),
      (_defaultRows[1].$1, v('draw', low, _defaultRows[1].$2),
          v('draw', high, _defaultRows[1].$3)),
      (_defaultRows[2].$1, v('loss', low, _defaultRows[2].$2),
          v('loss', high, _defaultRows[2].$3)),
    ];
  }

  /// لایه‌های ورودی — از همان `stakes.public` که کارتِ راهنما می‌خواند.
  static List<int> get _tiers {
    final t = AppConfig.instance.stakeTiers;
    return t.length > 1 ? t : const [100, 1000];
  }

  /// «ورودی ۱۰۰» — همان `coinGuide.stakeLabel` در هر دو کلاینت.
  static String _stakeLabel(int stake) => liveText(
      'coinGuide.stakeLabel', 'ورودی ${faNum(stake)}', vars: {'stake': stake});

  /// متنِ توضیحِ استانداردِ سکه — درصدِ انتقال از تنظیماتِ ادمین.
  ///
  /// ⚠️ جمله و درصد هر دو زنده‌اند: قبلاً این‌جا هم `pct == 0` دستی نوشته
  /// می‌شد و متنِ «صفر است» از هیچ کلیدی نمی‌خواند؛ یعنی در صفحهٔ لیگ
  /// (کارتِ راهنما) ادمین می‌توانست لحن را عوض کند و در این نوار نه — دو
  /// جملهٔ متفاوت برای یک کاربر، در یک صفحهٔ مجاور.
  String get _footer {
    final pct = num.tryParse('${economy?['coinCarryoverPercent'] ?? ''}')?.toInt() ?? 10;
    final pctText = pct == 0
        ? liveText('coinGuide.carryoverZero', 'انتقالِ سکه به لیگِ بعدی صفر است')
        : liveText('coinGuide.carryoverPercent',
            '${faNum(pct)}٪ از سکه به لیگِ بعدی منتقل می‌شود',
            vars: {'percent': pct});
    return 'سکه مبنای دریافتِ جایزهٔ لیگ است؛ رتبهٔ لیگ بر اساسِ سکه تعیین می‌شود و با سکه‌ها در استخرِ جایزه شرکت می‌کنی. سکه‌ها بعد از پایانِ لیگ صفر می‌شوند و $pctText.';
  }

  @override
  Widget build(BuildContext context) {
    // حالت‌هایی که سکه نمی‌دهند: تمرین با ربات (۰) و اتاق خصوصی (−۱).
    if (mode == 0 || mode == -1) {
      return Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.fromLTRB(12, 9, 12, 9),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(14),
          color: const Color(0xFF94A3B8).withValues(alpha: 0.08),
          border: Border.all(
              color: const Color(0xFF94A3B8).withValues(alpha: 0.22)),
        ),
        child: Row(
          children: [
            Opacity(
              opacity: 0.45,
              child: Image.asset('assets/pass/icon_coin.webp',
                  width: 18,
                  height: 18,
                  errorBuilder: (_, __, ___) => const Icon(
                      Icons.monetization_on_rounded,
                      size: 18,
                      color: _gold)),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                // «۱۰۰/۱۰۰۰» از جمله بیرون رفت: لایه‌ها از config می‌آیند و
                // واژهٔ «ورودی» هم از `coinGuide.stakeLabel` — همان‌جا که
                // سرستون‌های همین جدول از آن ساخته می‌شوند.
                mode == 0
                    ? liveText('coinGuide.botNote',
                        'تمرین با ربات سکه ندارد — برای سکه، ${_stakeLabel(_tiers[0])} یا ${_stakeLabel(_tiers[1])} را انتخاب کن.',
                        vars: {
                          'stakeLowText': _stakeLabel(_tiers[0]),
                          'stakeHighText': _stakeLabel(_tiers[1]),
                        })
                    : liveText('coinGuide.privateNote',
                        'اتاق خصوصی سکه ندارد — برای سکه، ${_stakeLabel(_tiers[0])} یا ${_stakeLabel(_tiers[1])} را انتخاب کن.',
                        vars: {
                          'stakeLowText': _stakeLabel(_tiers[0]),
                          'stakeHighText': _stakeLabel(_tiers[1]),
                        }),
                style: const TextStyle(
                    fontSize: 12, height: 1.55, color: Color(0xFF94A3B8)),
              ),
            ),
          ],
        ),
      );
    }

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
                      const Text('سکه در هر بازی',
                          style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w900,
                              color: _gold)),
                    ],
                  ),
                ),
                Expanded(flex: 10, child: _HeadCell(_stakeLabel(_tiers[0]))),
                Expanded(flex: 10, child: _HeadCell(_stakeLabel(_tiers[1]))),
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
              gamePoints?['enabled'] == true
                  ? '$_footer\nامتیاز آنلاین: برد +${faNum(gamePoints!['winPoints'])}'
                      ' · باخت ${faNum(gamePoints!['losePoints'])}'
                      ' · مساوی ${faNum(gamePoints!['drawPoints'])}'
                  : _footer,
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
