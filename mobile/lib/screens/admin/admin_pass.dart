// گذر نبرد — آینهٔ admin/src/pages/battle-pass.jsx
//
// مالک از پنل اندروید فصل می‌سازد (کپی پاداش‌ها از فصل الگو)، پاداشِ
// ۵۰ پله را در دو مسیر رایگان/پلاس ویرایش می‌کند و منحنی XP را تنظیم
// می‌کند. همه سمت سرور است؛ کاربر بدون آپدیت اپ اثرش را می‌بیند.
import 'package:flutter/material.dart';

import '../../api_client.dart';
import '../../theme/tokens.dart';
import '../../widgets/app_card.dart';
import '../../widgets/state_views.dart';
import 'widgets/form_section.dart';

class AdminPass extends StatefulWidget {
  final ApiClient api;
  const AdminPass({super.key, required this.api});

  @override
  State<AdminPass> createState() => _AdminPassState();
}

class _AdminPassState extends State<AdminPass> {
  static const _kindLabels = {
    'points': 'امتیاز',
    'spins': 'چرخش',
    'cash': 'نقدی (تومان)',
    'shop_item': 'آیتم فروشگاه',
  };

  final _seasonName = TextEditingController();
  final _startsAt = TextEditingController();
  final _endsAt = TextEditingController();

  List<Map<String, dynamic>> _seasons = [];
  Map<String, dynamic> _config = const {};
  String? _activeSeasonId;
  String? _selectedId;
  Map<String, dynamic> _season = const {};
  List<Map<String, dynamic>> _tiers = [];
  double _scaleFactor = 1;
  String _scaleTrack = 'both'; // both|free|plus
  bool _scaleBusy = false;
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
    _seasonName.dispose();
    _startsAt.dispose();
    _endsAt.dispose();
    super.dispose();
  }

  void _toast(String m) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(m)));
  }

  List<Map<String, dynamic>> _list(dynamic v) =>
      List<Map<String, dynamic>>.from((v as List? ?? const [])
          .whereType<Map>()
          .map((e) => Map<String, dynamic>.from(e)));

  Future<void> _load() async {
    try {
      final d = await widget.api.get('/api/admin/pass');
      if (!mounted) return;
      final seasons = _list(d['seasons']);
      setState(() {
        _seasons = seasons;
        _config = Map<String, dynamic>.from((d['config'] as Map?) ?? {});
        _activeSeasonId = d['activeSeasonId'] == null
            ? null
            : '${d['activeSeasonId']}';
        _loading = false;
        _error = null;
      });
      // فصل فعال را ترجیح بده تا اهرم مقیاس روی همان فصل باشد
      if (_selectedId == null && seasons.isNotEmpty) {
        final active = seasons.where((s) => s['is_active'] == true).toList();
        final id = active.isNotEmpty
            ? '${active.first['id']}'
            : (_activeSeasonId ?? '${seasons.first['id']}');
        await _openSeason(id);
      } else if (_selectedId != null) {
        await _openSeason(_selectedId!);
      }
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = '$e';
      });
    }
  }

  Future<void> _openSeason(String id) async {
    try {
      final d = await widget.api.get('/api/admin/pass/seasons/$id');
      if (!mounted) return;
      setState(() {
        _selectedId = id;
        _season = Map<String, dynamic>.from((d['season'] as Map?) ?? {});
        _tiers = _list(d['tiers']);
      });
    } catch (e) {
      _toast('$e');
    }
  }

  Future<void> _run(Future<dynamic> Function() call) async {
    setState(() => _saving = true);
    try {
      final r = await call();
      _toast('${(r as Map?)?['message'] ?? 'ذخیره شد'}');
      await _load();
    } catch (e) {
      _toast('$e');
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _createSeason() async {
    final name = _seasonName.text.trim();
    final starts = _startsAt.text.trim();
    final ends = _endsAt.text.trim();
    if (name.isEmpty) {
      _toast('نام فصل الزامی است');
      return;
    }
    if (starts.isEmpty || ends.isEmpty) {
      _toast('شروع و پایان فصل را وارد کنید');
      return;
    }
    await _run(() => widget.api.post('/api/admin/pass/seasons', {
          'name': name,
          'startsAt': starts,
          'endsAt': ends,
          'templateSeasonId': _selectedId,
        }));
    _seasonName.clear();
    _startsAt.clear();
    _endsAt.clear();
  }

  Future<void> _patchConfig(Map<String, dynamic> body) =>
      _run(() => widget.api.patch('/api/admin/pass/config', body));

  Future<void> _saveTier(Map<String, dynamic> tier, String track, String kind,
      int amount) async {
    final t = tier[track];
    if (t is! Map) {
      // ردیف ندارد → ساخت تازه
      await _run(() => widget.api.post('/api/admin/pass/tiers', {
            'seasonId': _selectedId,
            'tier': tier['tier'],
            'track': track,
            'kind': kind,
            'amount': amount,
          }));
    } else {
      await _run(() => widget.api.patch('/api/admin/pass/tiers/${t['id']}', {
            'kind': kind,
            'amount': amount,
          }));
    }
  }


  Future<void> _applyScale() async {
    final sid = _selectedId ?? _activeSeasonId;
    if (sid == null) {
      _toast('فصلی انتخاب نشده');
      return;
    }
    if ((_scaleFactor - 1).abs() < 0.001) {
      _toast('ضریب ۱ یعنی بدون تغییر');
      return;
    }
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('مقیاس‌دهی امتیازات'),
        content: Text(
          'همهٔ پاداش‌های نوع «امتیاز» '
          '${_scaleTrack == 'free' ? 'مسیر رایگان' : _scaleTrack == 'plus' ? 'مسیر پلاس' : 'هر دو مسیر'} '
          '× ${_scaleFactor.toStringAsFixed(2)} می‌شوند. ادامه؟',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('انصراف')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('اعمال')),
        ],
      ),
    );
    if (ok != true) return;
    setState(() => _scaleBusy = true);
    try {
      final r = await widget.api.post(
        '/api/admin/pass/seasons/$sid/scale-points',
        {'factor': _scaleFactor, 'track': _scaleTrack},
      );
      if (!mounted) return;
      _toast('${r is Map ? (r['message'] ?? 'اعمال شد') : 'اعمال شد'}');
      setState(() {
        _scaleFactor = 1;
        _selectedId ??= sid;
      });
      await _openSeason(sid);
    } catch (e) {
      if (mounted) _toast(apiError(e));
    } finally {
      if (mounted) setState(() => _scaleBusy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const LoadingView();
    if (_error != null) {
      return ErrorBanner(message: _error!, onRetry: _load);
    }
    return SingleChildScrollView(
      padding: const EdgeInsets.all(Gaps.md),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          FormSection(
            title: 'فصل جدید',
            subtitle: 'فصلِ تازه فعال می‌شود و پاداش‌های فصلِ انتخابی کپی می‌شود',
            children: [
              TextField(
                  controller: _seasonName,
                  decoration: const InputDecoration(labelText: 'نام فصل')),
              Row(children: [
                Expanded(
                    child: TextField(
                        controller: _startsAt,
                        decoration: const InputDecoration(
                            labelText: 'شروع (مثلاً 2026-09-01)'))),
                const SizedBox(width: Gaps.sm),
                Expanded(
                    child: TextField(
                        controller: _endsAt,
                        decoration: const InputDecoration(
                            labelText: 'پایان (مثلاً 2026-09-30)'))),
              ]),
              FilledButton.icon(
                onPressed: _saving ? null : _createSeason,
                icon: const Icon(Icons.add_rounded),
                label: const Text('ساخت فصل'),
              ),
            ],
          ),
          const SizedBox(height: Gaps.md),
          FormSection(
            title: 'منحنی XP و سقف‌ها',
            subtitle: 'ذخیره بلافاصله روی همهٔ کلاینت‌ها اثر می‌گذارد',
            children: [
              for (final key in [
                ['xpBase', 'XP پایهٔ هر پله'],
                ['xpStep', 'افزایش XP هر پله'],
                ['maxTiersPerDay', 'سقف پله در روز'],
                ['claimGraceDays', 'مهلت دریافت (روز)'],
              ])
                _ConfigField(
                  key: ValueKey(key[0]),
                  label: key[1],
                  value: _config[key[0]],
                  onSave: (v) {
                    final n = int.tryParse(v.trim());
                    if (n == null) {
                      _toast('عدد معتبر وارد کنید');
                      return;
                    }
                    _patchConfig({key[0]: n});
                  },
                ),
            ],
          ),
          const SizedBox(height: Gaps.md),
          FormSection(
            title: 'فصل‌ها',
            children: [
              DropdownButtonFormField<String>(
                initialValue: _selectedId,
                items: [
                  for (final s in _seasons)
                    DropdownMenuItem(
                      value: '${s['id']}',
                      child: Text(
                          '${s['name']}${'${s['id']}' == _activeSeasonId ? ' ● فعال' : ''}'),
                    ),
                ],
                onChanged: (v) => v == null ? null : _openSeason(v),
                decoration: const InputDecoration(labelText: 'فصل انتخابی'),
              ),
            ],
          ),
          const SizedBox(height: Gaps.md),
          // اهرم مقیاس — بالای لیست پله‌ها، با فصل فعال/انتخابی
          if (_seasons.isNotEmpty) ...[
            FormSection(
              title: 'مقیاس‌دهی یک‌جای امتیازات',
              subtitle: 'فقط kind=امتیاز · روی فصل انتخابی/فعال اعمال می‌شود',
              children: [
                SegmentedButton<String>(
                  segments: const [
                    ButtonSegment(value: 'both', label: Text('هر دو')),
                    ButtonSegment(value: 'free', label: Text('رایگان')),
                    ButtonSegment(value: 'plus', label: Text('پلاس')),
                  ],
                  selected: {_scaleTrack},
                  onSelectionChanged: (s) => setState(() => _scaleTrack = s.first),
                ),
                const SizedBox(height: Gaps.sm),
                Text('ضریب × ${_scaleFactor.toStringAsFixed(2)}',
                    style: const TextStyle(fontWeight: FontWeight.w900)),
                Slider(
                  value: _scaleFactor.clamp(0, 3),
                  min: 0,
                  max: 3,
                  divisions: 60,
                  label: '× ${_scaleFactor.toStringAsFixed(2)}',
                  onChanged: _scaleBusy ? null : (v) => setState(() => _scaleFactor = v),
                ),
                Wrap(
                  spacing: 6,
                  children: [
                    for (final v in [0.5, 0.75, 1.0, 1.25, 1.5, 2.0])
                      ChoiceChip(
                        label: Text('×$v'),
                        selected: (_scaleFactor - v).abs() < 0.001,
                        onSelected: _scaleBusy ? null : (_) => setState(() => _scaleFactor = v),
                      ),
                  ],
                ),
                const SizedBox(height: Gaps.sm),
                FilledButton.icon(
                  onPressed: _scaleBusy || (_scaleFactor - 1).abs() < 0.001
                      ? null
                      : _applyScale,
                  icon: _scaleBusy
                      ? const SizedBox.square(
                          dimension: 16,
                          child: CircularProgressIndicator(strokeWidth: 2))
                      : const Icon(Icons.tune_rounded),
                  label: const Text('اعمال روی همهٔ پله‌ها'),
                ),
              ],
            ),
            const SizedBox(height: Gaps.md),
            FormSection(
              title: 'پاداش پله‌های «${_season['name'] ?? ''}»',
              subtitle: 'فقط پله‌هایی که پاداش دارند فهرست شده‌اند',
              children: [
                for (final row in _tiers)
                  _TierRow(
                    tier: row,
                    onSave: _saveTier,
                    kindLabels: _kindLabels,
                  ),
                if (_tiers.isEmpty)
                  const EmptyState(
                      icon: Icons.layers_clear_rounded,
                      title: 'پاداشی ثبت نشده',
                      message: 'هنوز پاداشی برای این فصل ثبت نشده'),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

class _ConfigField extends StatefulWidget {
  final String label;
  final dynamic value;
  final ValueChanged<String> onSave;
  const _ConfigField(
      {super.key, required this.label, required this.value, required this.onSave});

  @override
  State<_ConfigField> createState() => _ConfigFieldState();
}

class _ConfigFieldState extends State<_ConfigField> {
  late final TextEditingController _c;

  @override
  void initState() {
    super.initState();
    _c = TextEditingController(text: '${widget.value ?? ''}');
  }

  @override
  void didUpdateWidget(covariant _ConfigField old) {
    super.didUpdateWidget(old);
    if ('${old.value}' != '${widget.value}') {
      _c.text = '${widget.value ?? ''}';
    }
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Row(children: [
      Expanded(
          child: TextField(
              controller: _c,
              keyboardType: TextInputType.number,
              decoration: InputDecoration(labelText: widget.label))),
      const SizedBox(width: Gaps.sm),
      IconButton.filledTonal(
        icon: const Icon(Icons.check_rounded),
        onPressed: () => widget.onSave(_c.text),
      ),
    ]);
  }
}

class _TierRow extends StatefulWidget {
  final Map<String, dynamic> tier;
  final Map<String, String> kindLabels;
  final void Function(Map<String, dynamic> tier, String track, String kind,
      int amount) onSave;
  const _TierRow(
      {required this.tier,
      required this.kindLabels,
      required this.onSave});

  @override
  State<_TierRow> createState() => _TierRowState();
}

class _TierRowState extends State<_TierRow> {
  String _track = 'free';
  String _kind = 'points';
  late final TextEditingController _amount;

  Map<String, dynamic>? get _t => widget.tier[_track] is Map
      ? Map<String, dynamic>.from(widget.tier[_track] as Map)
      : null;

  @override
  void initState() {
    super.initState();
    _amount = TextEditingController(text: '${_t?['amount'] ?? 0}');
  }

  @override
  void didUpdateWidget(covariant _TierRow old) {
    super.didUpdateWidget(old);
    if ('${old.tier['tier']}' != '${widget.tier['tier']}' ||
        '${old.tier[_track]}' != '${widget.tier[_track]}') {
      final t = _t;
      _kind = '${t?['kind'] ?? 'points'}';
      _amount.text = '${t?['amount'] ?? 0}';
    }
  }

  @override
  void dispose() {
    _amount.dispose();
    super.dispose();
  }

  void _switchTrack(String track) {
    setState(() {
      _track = track;
      final t = _t;
      _kind = '${t?['kind'] ?? 'points'}';
      _amount.text = '${t?['amount'] ?? 0}';
    });
  }

  @override
  Widget build(BuildContext context) {
    return AppCard(
      padding: const EdgeInsets.all(Gaps.sm),
      child: Row(
        children: [
          SizedBox(
            width: 52,
            child: Text('پلهٔ ${widget.tier['tier']}',
                style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 12)),
          ),
          Expanded(
            child: SegmentedButton<String>(
              segments: const [
                ButtonSegment(value: 'free', label: Text('رایگان')),
                ButtonSegment(value: 'plus', label: Text('پلاس')),
              ],
              selected: {_track},
              onSelectionChanged: (s) => _switchTrack(s.first),
              showSelectedIcon: false,
            ),
          ),
          const SizedBox(width: Gaps.sm),
          DropdownButton<String>(
            value: _kind,
            items: [
              for (final e in widget.kindLabels.entries)
                DropdownMenuItem(value: e.key, child: Text(e.value)),
            ],
            onChanged: (v) {
              if (v != null) setState(() => _kind = v);
            },
          ),
          SizedBox(
            width: 84,
            child: TextField(
              controller: _amount,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(isDense: true),
            ),
          ),
          IconButton(
            icon: const Icon(Icons.check_rounded),
            onPressed: () {
              final n = int.tryParse(_amount.text.trim()) ?? 0;
              widget.onSave(widget.tier, _track, _kind, n);
            },
          ),
        ],
      ),
    );
  }
}
