// ویرایشگر گردونه — آینهٔ admin/src/pages/wheel.jsx
//
// خواستهٔ مالک: ظاهر (برچسب/رنگ) و درون (نوع/وزن/مقدار) از پنل اندروید
// هم قابل تغییر باشد. کلاینت کاربر برش‌ها را از سرور می‌کشد، پس بدون
// انتشار APK تازه، گردونه عوض می‌شود.
//
// ⚠️ فیلدها TextFormField با ValueKey دارند، نه TextEditingController
//    تازه‌ساخته در build: آن الگو فوکوس را می‌دزدد و کنترلر نشت می‌کند.
import 'package:flutter/material.dart';

import '../../api_client.dart';
import '../../theme/tokens.dart';
import '../../widgets/app_card.dart';
import '../../widgets/state_views.dart';
import 'widgets/form_section.dart';

class AdminWheel extends StatefulWidget {
  const AdminWheel({super.key, required this.api});
  final ApiClient api;

  @override
  State<AdminWheel> createState() => _AdminWheelState();
}

class _AdminWheelState extends State<AdminWheel> {
  static const _kindLabels = {
    'points': 'امتیاز',
    'cash': 'نقدی (تومان)',
    'card_box': 'صندوق کارت',
    'shop_item': 'آیتم فروشگاه',
    'plus_days': 'روز پلاس',
  };

  List<Map<String, dynamic>> _prizes = [];
  List<Map> _shopItems = const [];
  int _weightTotal = 10000000;
  bool _loading = true;
  bool _saving = false;
  String? _error;

  int get _activeWeight => _prizes
      .where((p) => p['isActive'] != false)
      .fold<int>(0, (s, p) => s + _asInt(p['weight']));

  @override
  void initState() {
    super.initState();
    _load();
  }

  int _asInt(dynamic v) =>
      v is int ? v : (v is num ? v.toInt() : int.tryParse('$v') ?? 0);

  Future<void> _load() async {
    try {
      final d = await widget.api.get('/api/admin/wheel/prizes');
      if (!mounted) return;
      setState(() {
        _prizes = List<Map<String, dynamic>>.from(
          ((d is Map ? d['prizes'] : null) as List? ?? const [])
              .whereType<Map>()
              .map((e) => Map<String, dynamic>.from(e)),
        );
        _shopItems =
            List<Map>.from((d is Map ? d['shopItems'] : null) ?? const []);
        _weightTotal = _asInt(d is Map ? d['weightTotal'] : 10000000);
        _loading = false;
        _error = null;
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
    if (_activeWeight != _weightTotal) {
      _snack('جمع وزن فعال باید دقیقاً ${faNum(_weightTotal)} باشد');
      return;
    }
    setState(() => _saving = true);
    try {
      final d = await widget.api.put('/api/admin/wheel/prizes', {
        'prizes': _prizes,
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

  void _add() {
    var next = 0;
    for (final p in _prizes) {
      final o = _asInt(p['sliceOrder']);
      if (o > next) next = o;
    }
    final remain = _weightTotal - _activeWeight;
    setState(() => _prizes.add({
          'id': null,
          'label': 'جایزه تازه',
          'kind': 'points',
          'value': 100,
          'weight': remain > 0 ? remain : 0,
          'sliceOrder': next + 1,
          'color': '#84CC16',
          'isActive': true,
          'itemSlug': null,
        }));
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const LoadingView();
    if (_error != null) {
      return ErrorBanner(message: _error!, onRetry: _load);
    }
    final remaining = _weightTotal - _activeWeight;
    final ok = remaining == 0;

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
      padding: const EdgeInsets.all(Gaps.md),
      children: [
        FormSection(
          title: 'محتوای گردونه',
          children: [
            Text(
              'برچسب و رنگ همین حالا روی اپ کاربر دیده می‌شود. '
              'جمع وزن فعال باید دقیقاً ${faNum(_weightTotal)} باشد.',
              style: const TextStyle(fontSize: 12, color: Colors.white60),
            ),
            Text(
              'فعال: ${faNum(_activeWeight)} · باقی: ${faNum(remaining)}',
              style: TextStyle(
                fontWeight: FontWeight.w900,
                color: ok ? const Color(0xFF22E7A6) : const Color(0xFFF87171),
              ),
            ),
          ],
        ),
        Gaps.vSm,
        for (var i = 0; i < _prizes.length; i++) _prizeCard(i),
        Gaps.vSm,
        OutlinedButton.icon(
          onPressed: _add,
          icon: const Icon(Icons.add_rounded),
          label: const Text('افزودن برش'),
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
          label: Text(_saving ? 'در حال ذخیره…' : 'ذخیرهٔ گردونه'),
        ),
        Gaps.vMd,
      ],
    ),
    );
  }

  Widget _prizeCard(int i) {
    final p = _prizes[i];
    final kind = '${p['kind']}';
    return Padding(
      padding: const EdgeInsets.only(bottom: Gaps.sm),
      child: AppCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(children: [
              Expanded(
                child: Text('برش ${p['sliceOrder']} — ${p['label']}',
                    style: const TextStyle(fontWeight: FontWeight.w900)),
              ),
              Switch(
                value: p['isActive'] != false,
                onChanged: (v) => setState(() => p['isActive'] = v),
              ),
            ]),
            TextFormField(
              key: ValueKey('wheel_label_$i'),
              initialValue: '${p['label'] ?? ''}',
              decoration: const InputDecoration(labelText: 'برچسب'),
              onChanged: (v) => p['label'] = v,
            ),
            Gaps.vXs,
            DropdownButtonFormField<String>(
              key: ValueKey('wheel_kind_$i'),
              initialValue: _kindLabels.containsKey(kind) ? kind : 'points',
              decoration: const InputDecoration(labelText: 'نوع جایزه'),
              items: [
                for (final e in _kindLabels.entries)
                  DropdownMenuItem(value: e.key, child: Text(e.value)),
              ],
              onChanged: (v) {
                if (v == null) return;
                setState(() {
                  p['kind'] = v;
                  p['value'] = v == 'points'
                      ? 100
                      : v == 'cash'
                          ? 10000
                          : v == 'plus_days'
                              ? 7
                              : 1;
                });
              },
            ),
            Gaps.vXs,
            if (kind == 'shop_item')
              DropdownButtonFormField<String>(
                key: ValueKey('wheel_slug_$i'),
                initialValue:
                    _shopItems.any((it) => it['slug'] == p['itemSlug'])
                        ? '${p['itemSlug']}'
                        : null,
                decoration: const InputDecoration(labelText: 'آیتم فروشگاه'),
                items: [
                  for (final it in _shopItems)
                    DropdownMenuItem(
                      value: '${it['slug']}',
                      child: Text('${it['name']}'),
                    ),
                ],
                onChanged: (v) => setState(() => p['itemSlug'] = v),
              )
            else
              TextFormField(
                key: ValueKey('wheel_value_$i'),
                initialValue: '${p['value']}',
                keyboardType: TextInputType.number,
                decoration: InputDecoration(
                  labelText: kind == 'cash'
                      ? 'مبلغ (تومان)'
                      : kind == 'plus_days'
                          ? 'تعداد روز'
                          : kind == 'card_box'
                              ? 'تعداد صندوق'
                              : 'مقدار امتیاز',
                ),
                onChanged: (v) => p['value'] = int.tryParse(v) ?? 0,
              ),
            Gaps.vXs,
            TextFormField(
              key: ValueKey('wheel_weight_$i'),
              initialValue: '${p['weight']}',
              keyboardType: TextInputType.number,
              decoration:
                  const InputDecoration(labelText: 'وزن (از ده میلیون)'),
              onChanged: (v) =>
                  setState(() => p['weight'] = int.tryParse(v) ?? 0),
            ),
            Gaps.vXs,
            TextFormField(
              key: ValueKey('wheel_color_$i'),
              initialValue: '${p['color'] ?? '#84CC16'}',
              decoration:
                  const InputDecoration(labelText: 'رنگ (مثل #84CC16)'),
              onChanged: (v) => p['color'] = v,
            ),
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton.icon(
                onPressed: () => setState(() => _prizes.removeAt(i)),
                icon: const Icon(Icons.delete_outline_rounded, size: 18),
                label: const Text('حذف از فهرست'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
