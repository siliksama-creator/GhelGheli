// شانس و قیمت صندوق کارت — آینهٔ admin/src/pages/card-box.jsx
//
// خواستهٔ مالک: درصد شانس هر کلاس از پنل اندروید هم مشخص شود.
// کلاینت کاربر عدد را از GET /api/card-box/overview می‌خواند، پس بدون
// انتشار APK تازه فروشگاه عوض می‌شود.
//
// ⚠️ فیلدها TextFormField با ValueKey دارند، نه TextEditingController
//    تازه‌ساخته در build: آن الگو فوکوس را می‌دزدد و کنترلر نشت می‌کند.
import 'package:flutter/material.dart';

import '../../api_client.dart';
import '../../theme/tokens.dart';
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
  int _weightTotal = 1000;
  bool _loading = true;
  bool _saving = false;
  String? _error;
  int _gen = 0;

  int get _sum =>
      _odds.fold<int>(0, (s, o) => s + _asInt(o['permille']));

  @override
  void initState() {
    super.initState();
    _load();
  }

  int _asInt(dynamic v) =>
      v is int ? v : (v is num ? v.toInt() : int.tryParse('$v') ?? 0);

  Future<void> _load() async {
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
          FormSection(
            title: 'شانس صندوق کارت',
            children: [
              const Text(
                'درصد هر کلاس مستقل از تعداد کارت‌های آن کلاس است. '
                'جمع باید دقیقاً ۱۰۰٪ باشد.',
                style: TextStyle(fontSize: 12, color: Colors.white60),
              ),
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
            title: 'قیمت صندوق (تومان)',
            children: [
              TextFormField(
                key: ValueKey('box_price_$_gen'),
                initialValue: '$_price',
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(labelText: 'قیمت به تومان'),
                onChanged: (v) => _price = int.tryParse(v) ?? 0,
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
            label: Text(_saving ? 'در حال ذخیره…' : 'ذخیرهٔ شانس'),
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
}
