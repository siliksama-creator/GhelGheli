// شانس و قیمت صندوق کارت — آینهٔ admin/src/pages/card-box.jsx
//
// خواستهٔ مالک: درصد شانس هر کلاس از پنل اندروید هم مشخص شود.
// کلاینت کاربر عدد را از GET /api/card-box/overview می‌خواند، پس بدون
// انتشار APK تازه فروشگاه عوض می‌شود.
//
// ⚠️ فیلدها TextFormField با ValueKey دارند، نه TextEditingController
//    تازه‌ساخته در build: آن الگو فوکوس را می‌دزدد و کنترلر نشت می‌کند.
import 'dart:async';

import 'package:flutter/material.dart';

import '../../api_client.dart';
import '../../theme/tokens.dart';
import '../../utils/fa_date.dart';
import '../../widgets/app_card.dart';
import '../../widgets/state_views.dart';
import 'widgets/form_section.dart';

class AdminCardBox extends StatefulWidget {
  const AdminCardBox({super.key, required this.api});
  final ApiClient api;

  @override
  State<AdminCardBox> createState() => _AdminCardBoxState();
}

class _AdminCardBoxState extends State<AdminCardBox> {
  static const _defaultOdds = {
    'normal': 409,
    'silver': 306,
    'gold': 153,
    'premium': 122,
    'legend': 10,
  };

  List<Map<String, dynamic>> _odds = [];
  int _price = 100000;
  bool _enabled = true;
  int _weightTotal = 1000;
  bool _loading = true;
  bool _saving = false;
  String? _error;
  int _gen = 0;
  List<Map<String, dynamic>> _purchases = const [];
  bool _purchasesLoading = true;

  int get _sum =>
      _odds.fold<int>(0, (s, o) => s + _asInt(o['permille']));

  @override
  void initState() {
    super.initState();
    _load();
  }

  int _asInt(dynamic v) =>
      v is int ? v : (v is num ? v.toInt() : int.tryParse('$v') ?? 0);

  Future<void> _loadPurchases() async {
    try {
      final d = await widget.api.get('/api/admin/card-box/purchases?limit=50');
      final rows = ((d is Map ? d['purchases'] : null) as List? ?? const [])
          .map((e) => Map<String, dynamic>.from(e as Map))
          .toList();
      if (mounted) setState(() => _purchases = rows);
    } catch (_) {
      if (mounted) setState(() => _purchases = const []);
    } finally {
      if (mounted) setState(() => _purchasesLoading = false);
    }
  }

  Future<void> _load() async {
    unawaited(_loadPurchases());
    try {
      final d = await widget.api.get('/api/admin/card-box');
      if (!mounted) return;
      setState(() {
        _odds = List<Map<String, dynamic>>.from(
          ((d is Map ? d['odds'] : null) as List? ?? const [])
              .whereType<Map>()
              .map((e) => Map<String, dynamic>.from(e)),
        );
        _price = _asInt(d is Map ? d['price'] : 100000);
        _enabled = d is Map ? d['enabled'] != false : true;
        _weightTotal = _asInt(d is Map ? d['weightTotal'] : 1000);
        _loading = false;
        _error = null;
        _gen += 1;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = apiError(e);
      });
    }
  }

  Future<void> _save() async {
    if (_sum != _weightTotal) {
      _snack('جمع شانس‌ها باید دقیقاً ۱۰۰٪ باشد');
      return;
    }
    setState(() => _saving = true);
    try {
      final d = await widget.api.put('/api/admin/card-box', {
        'odds': _odds,
        'price': _price,
        'enabled': _enabled,
      });
      if (!mounted) return;
      _snack('${d['message'] ?? 'ذخیره شد'}');
      await _load();
    } catch (e) {
      _snack(apiError(e));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  void _snack(String m) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(m)));
  }

  void _resetDefaults() {
    setState(() {
      for (final o in _odds) {
        final n = _defaultOdds['${o['rarity']}'] ?? _asInt(o['permille']);
        o['permille'] = n;
        o['percent'] = n / 10;
      }
      _gen += 1;
    });
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const LoadingView();
    if (_error != null) {
      return ErrorBanner(message: _error!, onRetry: _load);
    }
    final remaining = _weightTotal - _sum;
    final ok = remaining == 0;

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(Gaps.md),
        children: [
          const FormSection(
            title: 'صندوق کارت فروشگاه',
            children: [
              Text(
                'شانس هر کلاس، قیمت صندوق و روشن/خاموش‌کردن فروش. '
                'هر تغییری که ذخیره کنید همان لحظه روی فروشگاه کاربران '
                'می‌نشیند — بدون آپدیتِ اپ.',
                style: TextStyle(fontSize: 12, color: Colors.white60),
              ),
            ],
          ),
          Gaps.vSm,
          FormSection(
            title: 'وضعیت فروش',
            children: [
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: Text(
                  _enabled ? 'فروش صندوق باز است' : 'فروش صندوق بسته است',
                  style: TextStyle(
                    fontWeight: FontWeight.w900,
                    color: _enabled
                        ? const Color(0xFF22E7A6)
                        : const Color(0xFFFBBF24),
                  ),
                ),
                subtitle: const Text(
                  'وقتی خاموش باشد، خرید صندوق در وب و اندروید بسته می‌شود '
                  'و حتی اگر کسی دکمهٔ کهنه‌ای را بزند، سرور سفارش نمی‌سازد. '
                  'برای تعمیر یا تغییر قیمت، خاموشش کنید و بعد از ذخیره روشن.',
                  style: TextStyle(fontSize: 11.5, color: Colors.white60),
                ),
                value: _enabled,
                onChanged: (v) => setState(() => _enabled = v),
              ),
            ],
          ),
          Gaps.vSm,
          FormSection(
            title: 'شانس هر کلاس',
            children: [
              const Text(
                'عددِ «در هزار» یعنی از هر ۱۰۰۰ صندوق چند تا از این کلاس '
                'بیرون می‌آید. جمع باید دقیقاً ۱۰۰۰ باشد.',
                style: TextStyle(fontSize: 12, color: Colors.white60),
              ),
              Gaps.vXxs,
              Text(
                'مجموع: ${faNum(_sum / 10)}٪ · باقی: ${faNum(remaining / 10)}٪',
                style: TextStyle(
                  fontWeight: FontWeight.w900,
                  color: ok ? const Color(0xFF22E7A6) : const Color(0xFFF87171),
                ),
              ),
            ],
          ),
          Gaps.vSm,
          FormSection(
            title: 'قیمت صندوق',
            children: [
              TextFormField(
                key: ValueKey('box_price_$_gen'),
                initialValue: '$_price',
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(
                  labelText: 'قیمت به تومان',
                  hintText: 'مثلاً ۱۰۰۰۰۰ یعنی صد هزار تومان',
                ),
                onChanged: (v) => _price = int.tryParse(v) ?? 0,
              ),
              const Text(
                'همان عددی که کاربر در فروشگاه می‌بیند — هم با کیف پول، '
                'هم با پرداخت کافه‌بازار.',
                style: TextStyle(fontSize: 11.5, color: Colors.white60),
              ),
            ],
          ),
          Gaps.vSm,
          for (final o in _odds) _oddsCard(o),
          Gaps.vSm,
          OutlinedButton.icon(
            onPressed: _resetDefaults,
            icon: const Icon(Icons.restart_alt_rounded),
            label: const Text('پیش‌فرض تولید'),
          ),
          Gaps.vXs,
          FilledButton.icon(
            onPressed: _saving || !ok ? null : _save,
            icon: _saving
                ? const SizedBox(
                    width: 16,
                    height: 16,
                    child: CircularProgressIndicator(strokeWidth: 2))
                : const Icon(Icons.save_rounded),
            label: Text(_saving ? 'در حال ذخیره…' : 'ذخیرهٔ همه'),
          ),
          Gaps.vMd,
          AppCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text('خریدهای اخیر صندوق',
                          style: Theme.of(context).textTheme.titleMedium),
                    ),
                    IconButton(
                      onPressed: _loadPurchases,
                      icon: const Icon(Icons.refresh_rounded, size: 20),
                      tooltip: 'تازه‌سازی',
                    ),
                  ],
                ),
                Gaps.vXxs,
                const Text(
                  '۵۰ صندوقِ آخر با نامِ کاربر و خلاصهٔ کارت‌ها — همان تاریخچه‌ای که کاربر در اپ می‌بیند.',
                  style: TextStyle(fontSize: 11.5, color: Colors.white60),
                ),
                Gaps.vSm,
                if (_purchasesLoading)
                  const Padding(
                    padding: EdgeInsets.symmetric(vertical: 16),
                    child: Center(child: CircularProgressIndicator()),
                  )
                else if (_purchases.isEmpty)
                  const Padding(
                    padding: EdgeInsets.symmetric(vertical: 12),
                    child: Text('هنوز خریدی ثبت نشده است.',
                        style: TextStyle(fontSize: 12, color: Colors.white60)),
                  )
                else
                  for (final p in _purchases) _purchaseRow(p),
              ],
            ),
          ),
          Gaps.vMd,
        ],
      ),
    );
  }

  Widget _oddsCard(Map<String, dynamic> o) {
    final rarity = '${o['rarity']}';
    final count = _asInt(o['catalogueCount']);
    return Padding(
      padding: const EdgeInsets.only(bottom: Gaps.sm),
      child: AppCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(children: [
              Expanded(
                child: Text('${o['label'] ?? rarity}',
                    style: const TextStyle(fontWeight: FontWeight.w900)),
              ),
              Text(
                count == 0 ? 'بدون کارت زنده' : '${faNum(count)} کارت',
                style: TextStyle(
                  fontSize: 12,
                  color: count == 0
                      ? const Color(0xFFFBBF24)
                      : Colors.white60,
                ),
              ),
            ]),
            Gaps.vXs,
            TextFormField(
              key: ValueKey('box_pct_${rarity}_$_gen'),
              initialValue: '${o['percent'] ?? (_asInt(o['permille']) / 10)}',
              keyboardType:
                  const TextInputType.numberWithOptions(decimal: true),
              decoration: const InputDecoration(
                labelText: 'درصد شانس',
                suffixText: '٪',
              ),
              onChanged: (v) {
                final parsed = double.tryParse(v.replaceAll(',', '.')) ?? 0;
                setState(() {
                  final n = (parsed * 10).round().clamp(0, _weightTotal);
                  o['permille'] = n;
                  o['percent'] = n / 10;
                });
              },
            ),
          ],
        ),
      ),
    );
  }
  Widget _purchaseRow(Map<String, dynamic> p) {
    final cards = (p['cards'] as List?) ?? const [];
    final price = _asInt(p['pricePaid']);
    final pts = _asInt(p['points']);
    final createdAt = p['createdAt'];
    final date = createdAt != null ? faDate('$createdAt') : '';
    return Container(
      margin: const EdgeInsets.only(bottom: Gaps.xs),
      padding: const EdgeInsets.symmetric(horizontal: Gaps.sm, vertical: Gaps.xs),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.04),
        borderRadius: Corners.rMd,
        border: Border.all(color: Colors.white10),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('${p['nickname']}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                        fontWeight: FontWeight.w800, fontSize: 12.5)),
                Text('${p['mobile'] ?? ''} · $date',
                    style: const TextStyle(fontSize: 10.5, color: Colors.white60)),
              ],
            ),
          ),
          Text('${faNum(price)} ت',
              style: const TextStyle(
                  fontSize: 11.5,
                  color: Color(0xFFFFD166),
                  fontWeight: FontWeight.w800)),
          const SizedBox(width: 8),
          Text('${faNum(pts)} امتیاز',
              style: const TextStyle(
                  fontSize: 10.5,
                  color: Color(0xFFA3E635),
                  fontWeight: FontWeight.w700)),
          const SizedBox(width: 8),
          Wrap(
            spacing: 3,
            children: [
              for (final c in cards)
                Container(
                  width: 10,
                  height: 10,
                  decoration: BoxDecoration(
                    color: _rarityAccent('${(c as Map)['rarity']}'),
                    borderRadius: BorderRadius.circular(3),
                  ),
                ),
            ],
          ),
        ],
      ),
    );
  }

  Color _rarityAccent(String rarity) => switch (rarity) {
        'normal' => const Color(0xFF34D399),
        'silver' => const Color(0xFFE5EEF8),
        'gold' => const Color(0xFFFFD166),
        'premium' => const Color(0xFF38BDF8),
        'legend' => const Color(0xFFF97316),
        _ => const Color(0xFF94A3B8),
      };
}
