// فروشگاه — آینهٔ admin/src/pages/shop.jsx
//
// مالک از پنل اندروید آیتم فروشگاه اضافه/ویرایش/غیرفعال می‌کند و قیمت
// پلن‌های پلاس را عوض می‌کند. همه‌چیز سمت سرور ذخیره می‌شود، پس بدون
// انتشار APK تازه در اپ کاربران دیده می‌شود.
import 'package:flutter/material.dart';

import '../../api_client.dart';
import '../../theme/tokens.dart';
import '../../widgets/app_card.dart';
import '../../widgets/state_views.dart';
import 'widgets/form_section.dart';

class AdminShop extends StatefulWidget {
  final ApiClient api;
  const AdminShop({super.key, required this.api});

  @override
  State<AdminShop> createState() => _AdminShopState();
}

class _AdminShopState extends State<AdminShop> {
  final _slug = TextEditingController();
  final _name = TextEditingController();
  final _price = TextEditingController();
  final _payload = TextEditingController();
  String _kind = 'points';
  String _access = 'public';

  List<Map<String, dynamic>> _items = [];
  List<Map<String, dynamic>> _sales = [];
  List<String> _kinds = const [];
  Map<String, dynamic> _plus = const {};
  bool _loading = true;
  bool _saving = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _slug.dispose();
    _name.dispose();
    _price.dispose();
    _payload.dispose();
    super.dispose();
  }

  void _toast(String m) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(m)));
  }

  Future<void> _load() async {
    try {
      final d = await widget.api.get('/api/admin/shop');
      final p = await widget.api.get('/api/admin/shop/plus');
      if (!mounted) return;
      setState(() {
        _items = _list(d['items']);
        _sales = _list(d['sales']);
        _kinds = _list(d['kinds']).map((e) => '$e').toList();
        _plus = Map<String, dynamic>.from((p as Map?) ?? {});
        _loading = false;
        _error = null;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = '$e';
      });
    }
  }

  List<Map<String, dynamic>> _list(dynamic v) =>
      List<Map<String, dynamic>>.from(
          (v as List? ?? const []).whereType<Map>().map((e) => Map<String, dynamic>.from(e)));

  Future<void> _save(
      Future<dynamic> Function() call, Future<void> Function(dynamic) done) async {
    setState(() => _saving = true);
    try {
      final r = await call();
      await done(r);
      _toast('${(r as Map?)?['message'] ?? 'ذخیره شد'}');
      await _load();
    } catch (e) {
      _toast('$e');
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _create() async {
    final slug = _slug.text.trim();
    final name = _name.text.trim();
    final price = int.tryParse(_price.text.trim());
    if (slug.isEmpty || name.isEmpty || price == null) {
      _toast('شناسه، نام و قیمت لازم است');
      return;
    }
    await _save(
      () => widget.api.post('/api/admin/shop', {
        'slug': slug,
        'kind': _kind,
        'name': name,
        'price': price,
        'payload': _payload.text.trim(),
        'accessTier': _access,
        'isPurchasable': true,
        'isActive': true,
      }),
      (_) async {
        _slug.clear();
        _name.clear();
        _price.clear();
        _payload.clear();
      },
    );
  }

  Future<void> _editItem(Map<String, dynamic> item) async {
    final kind = TextEditingController(text: '${item['kind'] ?? 'points'}');
    final name = TextEditingController(text: '${item['name'] ?? ''}');
    final price = TextEditingController(text: '${item['price'] ?? 0}');
    final payload = TextEditingController(text: '${item['payload'] ?? ''}');
    var access = '${item['accessTier'] ?? 'public'}';
    var active = item['isActive'] == true;
    var purchasable = item['isPurchasable'] != false;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setD) => AlertDialog(
          title: Text('ویرایش ${item['name']}'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                    controller: name,
                    decoration: const InputDecoration(labelText: 'نام')),
                TextField(
                    controller: price,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(labelText: 'قیمت (تومان)',
                    helperText: 'همین عدد در اپ نشان داده و همان‌قدر هم از کیف پول کم می‌شود (بی‌تخفیفِ پنهان)؛ منفی مجاز نیست و سرور به ۰ می‌چسباندش.')),
                TextField(
                    controller: payload,
                    decoration: const InputDecoration(labelText: 'مقدار/payload',
                    helperText: 'همین رشته «اثرِ» آیتم است: برای قاب، طرح را می‌سازد و برای رنگِ نام، کدِ رنگ. اگر خالی بماند کلاینت به‌جایش شناسه را مصرف می‌کند.')),
                DropdownButtonFormField<String>(
                  initialValue: _kinds.contains(kind.text) ? kind.text : null,
                  items: [
                    for (final k in _kinds)
                      DropdownMenuItem(value: k, child: Text(k)),
                  ],
                  onChanged: (v) {
                    if (v != null) kind.text = v;
                  },
                  decoration: const InputDecoration(labelText: 'نوع'),
                ),
                DropdownButtonFormField<String>(
                  initialValue: access,
                  items: const [
                    DropdownMenuItem(value: 'public', child: Text('عمومی')),
                    DropdownMenuItem(value: 'plus', child: Text('فقط پلاس')),
                    DropdownMenuItem(value: 'annual', child: Text('پلاس سالانه')),
                  ],
                  onChanged: (v) => setD(() => access = v ?? 'public'),
                  decoration: const InputDecoration(labelText: 'دسترسی',
                    helperText: '«فقط پلاس» و «پلاس سالانه» یعنی کاربرِ عادی آن را در فروشگاه نمی‌بیند، نه این‌که رایگان شده باشد. مقدارِ ناشناخته بی‌صدا «عمومی» می‌شود.'),
                ),
                CheckboxListTile(
                  value: active,
                  title: const Text('فعال در فروشگاه'),
                  onChanged: (v) => setD(() => active = v ?? false),
                ),
                CheckboxListTile(
                  value: purchasable,
                  title: const Text('قابل خرید'),
                  onChanged: (v) => setD(() => purchasable = v ?? false),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
                onPressed: () => Navigator.pop(ctx, false),
                child: const Text('انصراف')),
            FilledButton(
                onPressed: () => Navigator.pop(ctx, true),
                child: const Text('ذخیره')),
          ],
        ),
      ),
    );
    if (ok != true) return;
    await _save(
      () => widget.api.patch('/api/admin/shop/${item['id']}', {
        'kind': kind.text,
        'name': name.text,
        'price': int.tryParse(price.text) ?? 0,
        'payload': payload.text,
        'accessTier': access,
        'isActive': active,
        'isPurchasable': purchasable,
      }),
      (_) async {},
    );
  }

  Future<void> _toggle(Map<String, dynamic> item, bool on) async {
    await _save(
      () => widget.api.patch('/api/admin/shop/${item['id']}', {
        'kind': item['kind'],
        'name': item['name'],
        'price': item['price'],
        'payload': item['payload'],
        'accessTier': item['accessTier'],
        'isActive': on,
        'isPurchasable': item['isPurchasable'] != false,
      }),
      (_) async {},
    );
  }

  Future<void> _delete(Map<String, dynamic> item) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('حذف ${item['name']}؟'),
        content: const Text('اگر قبلاً خریده شده باشد، آیتم فقط غیرفعال می‌شود.'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('انصراف')),
          FilledButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('حذف')),
        ],
      ),
    );
    if (ok != true) return;
    await _save(
      () => widget.api.delete('/api/admin/shop/${item['id']}'),
      (_) async {},
    );
  }

  Future<void> _savePlus() async {
    final p = _plus;
    await _save(
      () => widget.api.patch('/api/admin/shop/plus', p),
      (_) async {},
    );
  }

  void _setPlus(String path, String value) {
    final parts = path.split('.');
    var cur = _plus;
    for (var i = 0; i < parts.length - 1; i++) {
      final v = cur[parts[i]];
      if (v is! Map) {
        final next = <String, dynamic>{};
        cur[parts[i]] = next;
        cur = next;
      } else {
        cur = Map<String, dynamic>.from(v);
        _plus[parts[i]] = cur;
      }
    }
    final last = parts.last;
    if (value.trim().isEmpty) {
      cur.remove(last);
    } else {
      cur[last] = int.tryParse(value.trim()) ?? value.trim();
    }
  }

  String _plusStr(String path) {
    final parts = path.split('.');
    dynamic cur = _plus;
    for (final p in parts) {
      if (cur is! Map || !cur.containsKey(p)) return '';
      cur = cur[p];
    }
    return '$cur';
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const LoadingView();
    if (_error != null) {
      return ErrorBanner(message: _error!, onRetry: _load);
    }
    final monthly = Map<String, dynamic>.from(_plus['monthly'] ?? {});
    final annual = Map<String, dynamic>.from(_plus['annual'] ?? {});
    return SingleChildScrollView(
      padding: const EdgeInsets.all(Gaps.md),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          FormSection(
            title: 'آیتم جدید فروشگاه',
            subtitle: 'شناسهٔ یکتا: ۲ تا ۴۰ حرف انگلیسی/عدد/خط تیره',
            children: [
              Row(children: [
                Expanded(
                    child: TextField(
                        controller: _slug,
                        decoration:
                            const InputDecoration(labelText: 'شناسه (مثلاً spin-5)'))),
                const SizedBox(width: Gaps.sm),
                Expanded(
                    child: TextField(
                        controller: _name,
                        decoration: const InputDecoration(labelText: 'نام نمایشی'))),
              ]),
              Row(children: [
                Expanded(
                    child: TextField(
                        controller: _price,
                        keyboardType: TextInputType.number,
                        decoration:
                            const InputDecoration(labelText: 'قیمت (تومان)',
                    helperText: 'همین عدد در اپ نشان داده و همان‌قدر هم از کیف پول کم می‌شود (بی‌تخفیفِ پنهان)؛ منفی مجاز نیست و سرور به ۰ می‌چسباندش.'))),
                const SizedBox(width: Gaps.sm),
                Expanded(
                    child: TextField(
                        controller: _payload,
                        decoration: const InputDecoration(
                            labelText: 'مقدار (امتیاز/تعداد/…)' ))),
              ]),
              Row(children: [
                Expanded(
                  child: DropdownButtonFormField<String>(
                    initialValue: _kinds.contains(_kind) ? _kind : null,
                    items: [
                      for (final k in _kinds)
                        DropdownMenuItem(value: k, child: Text(k)),
                    ],
                    onChanged: (v) => setState(() => _kind = v ?? 'points'),
                    decoration: const InputDecoration(labelText: 'نوع'),
                  ),
                ),
                const SizedBox(width: Gaps.sm),
                Expanded(
                  child: DropdownButtonFormField<String>(
                    initialValue: _access,
                    items: const [
                      DropdownMenuItem(value: 'public', child: Text('عمومی')),
                      DropdownMenuItem(value: 'plus', child: Text('فقط پلاس')),
                      DropdownMenuItem(value: 'annual', child: Text('پلاس سالانه')),
                    ],
                    onChanged: (v) => setState(() => _access = v ?? 'public'),
                    decoration: const InputDecoration(labelText: 'دسترسی',
                    helperText: '«فقط پلاس» و «پلاس سالانه» یعنی کاربرِ عادی آن را در فروشگاه نمی‌بیند، نه این‌که رایگان شده باشد. مقدارِ ناشناخته بی‌صدا «عمومی» می‌شود.'),
                  ),
                ),
              ]),
              FilledButton.icon(
                onPressed: _saving ? null : _create,
                icon: const Icon(Icons.add_rounded),
                label: const Text('افزودن به فروشگاه'),
              ),
            ],
          ),
          const SizedBox(height: Gaps.md),
          FormSection(
            title: 'پلن‌های پلاس',
            subtitle: 'قیمت جدید از همین لحظه روی سفارش‌ها اعمال می‌شود',
            children: [
              Row(children: [
                Expanded(
                    child: TextField(
                        keyboardType: TextInputType.number,
                        onChanged: (v) => _setPlus('monthly.price', v),
                        decoration: InputDecoration(
                            labelText: 'ماهانه — قیمت',
                            hintText: _plusStr('monthly.price') == ''
                                ? ''
                                : null,
                            helperText:
                                'فعلی: ${_plusStr('monthly.price')}'))),
                const SizedBox(width: Gaps.sm),
                Expanded(
                    child: TextField(
                        keyboardType: TextInputType.number,
                        onChanged: (v) => _setPlus('monthly.days', v),
                        decoration: InputDecoration(
                            labelText: 'ماهانه — روز',
                            helperText: 'فعلی: ${_plusStr('monthly.days')}'))),
              ]),
              Row(children: [
                Expanded(
                    child: TextField(
                        keyboardType: TextInputType.number,
                        onChanged: (v) => _setPlus('annual.price', v),
                        decoration: InputDecoration(
                            labelText: 'سالانه — قیمت',
                            helperText: 'فعلی: ${_plusStr('annual.price')}'))),
                const SizedBox(width: Gaps.sm),
                Expanded(
                    child: TextField(
                        keyboardType: TextInputType.number,
                        onChanged: (v) => _setPlus('annual.days', v),
                        decoration: InputDecoration(
                            labelText: 'سالانه — روز',
                            helperText: 'فعلی: ${_plusStr('annual.days')}'))),
              ]),
              FilledButton.icon(
                onPressed: _saving ? null : _savePlus,
                icon: const Icon(Icons.save_rounded),
                label: const Text('ذخیره پلن‌ها'),
              ),
              if (monthly.isNotEmpty)
                Text('ماهانه: ${monthly['price']} تومان / ${monthly['days']} روز',
                    style: Theme.of(context).textTheme.bodySmall),
              if (annual.isNotEmpty)
                Text('سالانه: ${annual['price']} تومان / ${annual['days']} روز',
                    style: Theme.of(context).textTheme.bodySmall),
            ],
          ),
          const SizedBox(height: Gaps.md),
          FormSection(
            title: 'آیتم‌های فروشگاه (${_items.length})',
            children: [
              if (_items.isEmpty)
                const EmptyState(
                    icon: Icons.storefront_outlined,
                    title: 'فروشگاه خالی است',
                    message: 'هنوز آیتمی نیست')
              else
                for (final it in _items)
                  AppCard(
                    padding: const EdgeInsets.all(Gaps.sm),
                    child: Row(
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text('${it['name']}',
                                  style: const TextStyle(fontWeight: FontWeight.w700)),
                              Text(
                                  '${it['kind']} · ${it['price']} تومان · فروش ${it['soldCount'] ?? 0}',
                                  style: Theme.of(context).textTheme.bodySmall),
                            ],
                          ),
                        ),
                        Switch(
                          value: it['isActive'] == true,
                          onChanged: (v) => _toggle(it, v),
                        ),
                        IconButton(
                          icon: const Icon(Icons.edit_rounded, size: 20),
                          onPressed: () => _editItem(it),
                        ),
                        IconButton(
                          icon: const Icon(Icons.delete_outline_rounded, size: 20),
                          onPressed: () => _delete(it),
                        ),
                      ],
                    ),
                  ),
            ],
          ),
          if (_sales.isNotEmpty) ...[
            const SizedBox(height: Gaps.md),
            FormSection(
              title: 'پرفروش‌ترین‌ها',
              children: [
                for (final s in _sales.take(10))
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 2),
                    child: Row(
                      children: [
                        Expanded(child: Text('${s['name']}')),
                        Text('${s['sold']} فروش · ${s['revenue'] ?? 0} تومان',
                            style: Theme.of(context).textTheme.bodySmall),
                      ],
                    ),
                  ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}
