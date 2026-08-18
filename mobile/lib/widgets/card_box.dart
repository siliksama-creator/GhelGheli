import 'package:flutter/material.dart';

import '../api_client.dart';
import '../core/money.dart';
import '../services/bazaar_billing.dart';
import 'rarity_card_frame.dart';
import 'ui_icon.dart';

/// صندوقِ کارت — آینهٔ دقیقِ `userweb/src/components/CardBox.jsx`.
///
///  چرا این فایل وجود دارد: بک‌اندِ صندوق کامل و زنده بود (`overview`,
///    `buy`, `history`) ولی **هیچ کلاینتی صدایش نمی‌زد**. کاربری که کارتِ
///    فیزیکی نداشت، در دوئل پیام «حداقل پنج کارت لازم داری» می‌گرفت و هیچ
///    راهی برای گرفتنشان نبود — بن‌بستِ کامل. صندوق دقیقاً برای همین ساخته
///    شده بود و فقط درِ ورودی‌اش جا مانده بود.
///
/// دو جا رندر می‌شود: فروشگاه، و درست همان‌جا که دوئل بن‌بست می‌شود.
class CardBox extends StatefulWidget {
  const CardBox({
    super.key,
    required this.api,
    this.onGranted,
  });

  final ApiClient api;
  final VoidCallback? onGranted;

  @override
  State<CardBox> createState() => _CardBoxState();
}

class _CardBoxState extends State<CardBox> {
  static const _gold = Color(0xFFFFD166);

  Map<String, dynamic>? _data;
  List<dynamic>? _won;
  String _error = '';
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final res = await widget.api.get('/api/card-box/overview', fresh: true);
      if (!mounted) return;
      setState(() => _data = Map<String, dynamic>.from(res as Map));
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = 'صندوق در دسترس نیست');
    }
  }

  Future<void> _buy() async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _error = '';
      _won = null;
    });
    try {
      // همان سه‌گامِ فروشگاه: سفارش از سرور، پرداخت در بازار، تحویل بعد
      // از راستی‌آزماییِ سرور. کلاینت هیچ‌وقت خودش «تحویل شد» نمی‌گوید.
      final order = Map<String, dynamic>.from(
          await widget.api.post('/api/card-box/buy', const {}) as Map);
      final orderId = '${order['orderId']}';
      final token = await BazaarBilling.purchase(
        productId: '${order['productId']}',
        payload: orderId,
      );
      final result = Map<String, dynamic>.from(
          await widget.api.post('/api/purchase/verify', {
        'orderId': orderId,
        'purchaseToken': token,
      }) as Map);
      if (!mounted) return;
      setState(() => _won = (result['cards'] as List?) ?? const []);
      await _load();
      widget.onGranted?.call();
    } on BillingUnavailable {
      if (mounted) {
        setState(() => _error = 'خرید درون‌برنامه‌ای روی این دستگاه فعال نیست');
      }
    } catch (e) {
      if (mounted) setState(() => _error = 'خرید انجام نشد');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final data = _data;
    if (data == null) {
      return Container(
        padding: const EdgeInsets.all(22),
        alignment: Alignment.center,
        child: Text(
          _error.isEmpty ? 'در حال باز کردن صندوق…' : _error,
          style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 12),
        ),
      );
    }

    final size = (data['size'] as num?)?.toInt() ?? 5;
    final owned = (data['ownedCards'] as num?)?.toInt() ?? 0;
    final needsBox = data['needsBox'] == true;
    final odds = (data['odds'] as List?) ?? const [];

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(15),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: _gold.withValues(alpha: 0.32)),
        gradient: const LinearGradient(
          begin: Alignment.topRight,
          end: Alignment.bottomLeft,
          colors: [Color(0xFF0D1B2C), Color(0xFF141033), Color(0xFF2A1140)],
          stops: [0, 0.68, 1],
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.26),
            blurRadius: 44,
            offset: const Offset(0, 16),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Row(children: [
                      UiIcon('gift', size: 19, color: _gold),
                      SizedBox(width: 7),
                      Text('صندوق کارت',
                          style: TextStyle(
                              fontSize: 17,
                              fontWeight: FontWeight.w900,
                              color: Colors.white)),
                    ]),
                    const SizedBox(height: 5),
                    Text(
                      needsBox
                          ? 'برای دوئل به ${faNum(size)} کارت نیاز داری. این صندوق'
                              ' دقیقاً ${faNum(size)} کارتِ تصادفی می‌دهد و'
                              ' کارت‌ها امتیاز هم دارند.'
                          : 'کلکسیونت آمادهٔ دوئل است. هر صندوق ${faNum(size)}'
                              ' کارتِ تصادفیِ دیگر با امتیازشان اضافه می‌کند.',
                      style: const TextStyle(
                          fontSize: 11,
                          height: 1.7,
                          color: Color(0xFFB9C5D5)),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 11),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                decoration: BoxDecoration(
                  color: Colors.black.withValues(alpha: 0.3),
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: _gold.withValues(alpha: 0.4)),
                ),
                child: Text(
                  Money.withUnit(data['price']),
                  style: const TextStyle(
                      color: _gold, fontWeight: FontWeight.w900, fontSize: 13),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              for (final o in odds)
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 3),
                    child: _OddChip(
                      rarity: '${(o as Map)['rarity']}',
                      percent: (o['percent'] as num?)?.toDouble() ?? 0,
                    ),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: RichText(
                  text: TextSpan(
                    style: const TextStyle(
                        fontSize: 11, color: Color(0xFFDBE6F2)),
                    children: [
                      const TextSpan(text: 'کارت‌های فعال تو: '),
                      TextSpan(
                        text: faNum(owned),
                        style: const TextStyle(
                            color: _gold, fontWeight: FontWeight.w900),
                      ),
                      TextSpan(
                          text: needsBox
                              ? ' از ${faNum(size)}'
                              : ' · آمادهٔ دوئل'),
                    ],
                  ),
                ),
              ),
              const SizedBox(width: 8),
              ElevatedButton(
                onPressed: _busy ? null : _buy,
                style: ElevatedButton.styleFrom(
                  backgroundColor: _gold,
                  foregroundColor: const Color(0xFF1A0F02),
                  padding: const EdgeInsets.symmetric(
                      horizontal: 18, vertical: 12),
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(13)),
                  textStyle: const TextStyle(
                      fontWeight: FontWeight.w900, fontSize: 13),
                ),
                child: Text(_busy ? 'در حال باز کردن…' : 'باز کردن صندوق'),
              ),
            ],
          ),
          const SizedBox(height: 9),
          const Text(
            'شانسِ هر سطح بالا نوشته شده و برای همه یکسان است. کارت‌ها به'
            ' کلکسیون اضافه می‌شوند و در دوئل قابل بازی‌اند.',
            style: TextStyle(fontSize: 10, color: Color(0xFF94A3B8), height: 1.6),
          ),
          if (_error.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(_error,
                style: const TextStyle(color: Color(0xFFFCA5A5), fontSize: 11)),
          ],
          if (_won != null && _won!.isNotEmpty) ...[
            const SizedBox(height: 11),
            const Divider(height: 1, color: Color(0x1AFFFFFF)),
            const SizedBox(height: 11),
            Text('صندوق باز شد — ${faNum(_won!.length)} کارت گرفتی',
                style: const TextStyle(
                    color: Color(0xFF22E7A6),
                    fontWeight: FontWeight.w900,
                    fontSize: 12.5)),
            const SizedBox(height: 7),
            SizedBox(
              height: 58,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: _won!.length,
                separatorBuilder: (_, __) => const SizedBox(width: 7),
                itemBuilder: (_, i) {
                  final c = Map<String, dynamic>.from(_won![i] as Map);
                  return _WonCard(card: c);
                },
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _OddChip extends StatelessWidget {
  const _OddChip({required this.rarity, required this.percent});

  final String rarity;
  final double percent;

  @override
  Widget build(BuildContext context) {
    final accent = (rarityColors[rarity] ?? const [Color(0xFF94A3B8)]).first;
    final label = rarityLabels[rarity] ?? rarity;
    // درصد یک‌رقمِ اعشار: «۳.۰٪» خواناست، «۳.۰۰۰٪» نه. عددِ صحیح هم
    // بی‌خودی ".0" نگیرد.
    final text = percent == percent.roundToDouble()
        ? faNum(percent.round())
        : faNum(percent.toStringAsFixed(1));
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 4),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.05),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.white.withValues(alpha: 0.09)),
      ),
      child: Column(
        children: [
          Text('$text٪',
              style: TextStyle(
                  color: accent, fontWeight: FontWeight.w900, fontSize: 14)),
          const SizedBox(height: 2),
          Text(label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontSize: 9.5, color: Color(0xFF94A3B8))),
        ],
      ),
    );
  }
}

class _WonCard extends StatelessWidget {
  const _WonCard({required this.card});

  final Map<String, dynamic> card;

  @override
  Widget build(BuildContext context) {
    final rarity = '${card['rarity']}';
    final accent = (rarityColors[rarity] ?? const [Color(0xFF94A3B8)]).first;
    final label = rarityLabels[rarity] ?? rarity;
    final points = (card['pointValue'] as num?)?.toInt() ?? 0;
    return Container(
      width: 96,
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 8),
      decoration: BoxDecoration(
        color: Colors.black.withValues(alpha: 0.32),
        borderRadius: BorderRadius.circular(11),
        border: Border.all(color: accent.withValues(alpha: 0.33)),
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(
            '${card['name'] ?? 'کارت'}',
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
                color: accent, fontWeight: FontWeight.w900, fontSize: 10.5),
          ),
          const SizedBox(height: 3),
          Text('$label · ${faNum(points)} امتیاز',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontSize: 9, color: Color(0xFF94A3B8))),
        ],
      ),
    );
  }
}
