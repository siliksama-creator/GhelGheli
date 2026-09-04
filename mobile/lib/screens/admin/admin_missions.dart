// ماموریت‌ها — آینهٔ admin/src/pages/missions.jsx
//
// مالک از پنل اندروید جایزهٔ تکمیل روزانه را عوض می‌کند، ماموریت‌های
// توکار را بازنویسی می‌کند و ماموریت سفارشی می‌سازد. همه سمت سرور است
// و از چرخهٔ بعدی ماموریت‌ها اعمال می‌شود.
import 'package:flutter/material.dart';

import '../../api_client.dart';
import '../../theme/tokens.dart';
import '../../widgets/app_card.dart';
import '../../widgets/state_views.dart';
import 'widgets/form_section.dart';

class AdminMissions extends StatefulWidget {
  final ApiClient api;
  const AdminMissions({super.key, required this.api});

  @override
  State<AdminMissions> createState() => _AdminMissionsState();
}

class _AdminMissionsState extends State<AdminMissions> {
  final _dailyBonus = TextEditingController();
  final _mKey = TextEditingController();
  final _mTitle = TextEditingController();
  final _mDesc = TextEditingController();
  final _mGoal = TextEditingController();
  final _mReward = TextEditingController();
  String _mPeriod = 'daily';
  String _mEvent = 'other';

  Map<String, dynamic> _config = const {};
  List<Map<String, dynamic>> _builtin = [];
  double _mScale = 1;
  String _mScope = 'all';
  bool _mScaleBusy = false;
  bool _scaleDailyBonus = true;
  List<Map<String, dynamic>> _customs = [];
  List<String> _events = const [];
  List<String> _periods = const [];
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
    _dailyBonus.dispose();
    _mKey.dispose();
    _mTitle.dispose();
    _mDesc.dispose();
    _mGoal.dispose();
    _mReward.dispose();
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
      final d = await widget.api.get('/api/admin/missions');
      if (!mounted) return;
      setState(() {
        _config = Map<String, dynamic>.from((d['config'] as Map?) ?? {});
        _builtin = _list(d['builtin']);
        _customs = _list(d['customs']);
        _events = (d['events'] as List? ?? const [])
            .whereType<String>()
            .toList();
        _periods = (d['periods'] as List? ?? const [])
            .whereType<String>()
            .toList();
        if (_dailyBonus.text.isEmpty) {
          _dailyBonus.text = '${_config['dailyBonus'] ?? 100}';
        }
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

  Future<void> _saveBonus() async {
    final n = int.tryParse(_dailyBonus.text.trim());
    if (n == null) {
      _toast('عدد معتبر وارد کنید');
      return;
    }
    await _run(
        () => widget.api.patch('/api/admin/missions/config', {'dailyBonus': n}));
  }

  Future<void> _editBuiltin(Map<String, dynamic> m) async {
    final title = TextEditingController(text: '${m['title'] ?? ''}');
    final desc = TextEditingController(text: '${m['description'] ?? ''}');
    final reward = TextEditingController(text: '${m['reward'] ?? 0}');
    final goal = TextEditingController(text: '${m['goal'] ?? 1}');
    var active = m['active'] != false;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setD) => AlertDialog(
          title: Text('بازنویسی ${m['key']}'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                    controller: title,
                    decoration: const InputDecoration(labelText: 'عنوان')),
                TextField(
                    controller: desc,
                    decoration: const InputDecoration(labelText: 'توضیح')),
                TextField(
                    controller: reward,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(labelText: 'جایزه (امتیاز)',
                  helperText: 'پس از تکمیل به موجودیِ کاربر اضافه می‌شود و در دفترِ امتیاز با همین مقدار ثبت می‌شود؛ صفر یعنی ماموریتِ بی‌جایزه.', helperMaxLines: 6)),
                TextField(
                    controller: goal,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(labelText: 'هدف',
                  helperText: 'چند بار از آن کار لازم است تا جایزه باز شود؛ ۱ یعنی «یک بار انجام بدهد کافی است».', helperMaxLines: 6)),
                CheckboxListTile(
                  value: active,
                  title: const Text('فعال'),
                  onChanged: (v) => setD(() => active = v ?? false),
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
    await _run(() => widget.api.patch(
        '/api/admin/missions/builtin/${m['key']}',
        {
          'title': title.text,
          'description': desc.text,
          'reward': int.tryParse(reward.text) ?? 0,
          'goal': int.tryParse(goal.text) ?? 1,
          'active': active,
        }));
  }

  Future<void> _createCustom() async {
    final key = _mKey.text.trim();
    final title = _mTitle.text.trim();
    final goal = int.tryParse(_mGoal.text.trim());
    final reward = int.tryParse(_mReward.text.trim());
    if (key.isEmpty || title.isEmpty || goal == null || reward == null) {
      _toast('کلید، عنوان، هدف و جایزه لازم است');
      return;
    }
    await _run(() => widget.api.post('/api/admin/missions', {
          'key': key,
          'period': _mPeriod,
          'event': _mEvent,
          'icon': 'star',
          'title': title,
          'description': _mDesc.text.trim(),
          'goal': goal,
          'reward': reward,
          'isActive': true,
        }));
    _mKey.clear();
    _mTitle.clear();
    _mDesc.clear();
    _mGoal.clear();
    _mReward.clear();
  }

  Future<void> _deleteCustom(Map<String, dynamic> m) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('حذف ${m['title']}؟'),
        content: const Text('ماموریت سفارشی حذف می‌شود.'),
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
    await _run(() => widget.api.delete('/api/admin/missions/${m['key']}'));
  }


  Future<void> _applyMissionScale() async {
    if ((_mScale - 1).abs() < 0.001) {
      _toast('ضریب ۱ یعنی بدون تغییر');
      return;
    }
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('مقیاس‌دهی جوایز ماموریت'),
        content: Text(
          'جایزه‌های ${_mScope == 'builtin' ? 'توکار' : _mScope == 'custom' ? 'سفارشی' : 'همه'} '
          '× ${_mScale.toStringAsFixed(2)} می‌شوند. هدف‌ها ثابت می‌مانند.',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('انصراف')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('اعمال')),
        ],
      ),
    );
    if (ok != true) return;
    setState(() => _mScaleBusy = true);
    try {
      final r = await widget.api.post('/api/admin/missions/scale-rewards', {
        'factor': _mScale,
        'scope': _mScope,
        'scaleDailyBonus': _scaleDailyBonus,
      });
      if (!mounted) return;
      _toast('${r is Map ? (r['message'] ?? 'اعمال شد') : 'اعمال شد'}');
      setState(() => _mScale = 1);
      await _load();
    } catch (e) {
      if (mounted) _toast(apiError(e));
    } finally {
      if (mounted) setState(() => _mScaleBusy = false);
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
            title: 'مقیاس‌دهی یک‌جای جوایز',
            subtitle: 'همهٔ rewardها × ضریب — هدف‌ها ثابت',
            children: [
              SegmentedButton<String>(
                segments: const [
                  ButtonSegment(value: 'all', label: Text('همه')),
                  ButtonSegment(value: 'builtin', label: Text('توکار')),
                  ButtonSegment(value: 'custom', label: Text('سفارشی')),
                ],
                selected: {_mScope},
                onSelectionChanged: (s) => setState(() => _mScope = s.first),
              ),
              const SizedBox(height: Gaps.sm),
              Text('ضریب × ${_mScale.toStringAsFixed(2)}',
                  style: const TextStyle(fontWeight: FontWeight.w900)),
              Slider(
                value: _mScale.clamp(0, 3),
                min: 0,
                max: 3,
                divisions: 60,
                label: '× ${_mScale.toStringAsFixed(2)}',
                onChanged: _mScaleBusy ? null : (v) => setState(() => _mScale = v),
              ),
              Wrap(
                spacing: 6,
                children: [
                  for (final v in [0.5, 0.75, 1.0, 1.25, 1.5, 2.0])
                    ChoiceChip(
                      label: Text('×$v'),
                      selected: (_mScale - v).abs() < 0.001,
                      onSelected:
                          _mScaleBusy ? null : (_) => setState(() => _mScale = v),
                    ),
                ],
              ),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('جایزهٔ تکمیل روزانه هم',
                    style: TextStyle(fontSize: 13)),
                value: _scaleDailyBonus,
                onChanged: _mScaleBusy
                    ? null
                    : (v) => setState(() => _scaleDailyBonus = v),
              ),
              FilledButton.icon(
                onPressed: _mScaleBusy || (_mScale - 1).abs() < 0.001
                    ? null
                    : _applyMissionScale,
                icon: _mScaleBusy
                    ? const SizedBox.square(
                        dimension: 16,
                        child: CircularProgressIndicator(strokeWidth: 2))
                    : const Icon(Icons.tune_rounded),
                label: const Text('اعمال روی جوایز'),
              ),
            ],
          ),
          const SizedBox(height: Gaps.md),
          FormSection(
            title: 'جایزهٔ تکمیل روزانه',
            subtitle: 'امتیازی که بعد از انجام همهٔ ماموریت‌های روز داده می‌شود',
            children: [
              Row(children: [
                Expanded(
                    child: TextField(
                        controller: _dailyBonus,
                        keyboardType: TextInputType.number,
                        decoration:
                            const InputDecoration(labelText: 'امتیاز روزانه'))),
                const SizedBox(width: Gaps.sm),
                FilledButton.icon(
                  onPressed: _saving ? null : _saveBonus,
                  icon: const Icon(Icons.save_rounded),
                  label: const Text('ذخیره'),
                ),
              ]),
            ],
          ),
          const SizedBox(height: Gaps.md),
          FormSection(
            title: 'ماموریت سفارشی',
            subtitle: 'از فردا در اپ همه نمایش داده می‌شود',
            children: [
              Row(children: [
                Expanded(
                    child: TextField(
                        controller: _mKey,
                        decoration: const InputDecoration(
                            labelText: 'کلید (حروف انگلیسی/عدد/_ )',
                  helperText: 'پیشرفتِ کاربر با همین کلید در `user_mission_progress` نگه داشته می‌شود؛ پس عوض‌کردنِ کلید یعنی صفرشدنِ وضعیتِ انجامِ همه. برای ویرایشِ متن، همین‌جا کلید را دست نزنید.', helperMaxLines: 6))),
                const SizedBox(width: Gaps.sm),
                Expanded(
                    child: TextField(
                        controller: _mTitle,
                        decoration:
                            const InputDecoration(labelText: 'عنوان'))),
              ]),
              TextField(
                  controller: _mDesc,
                  decoration: const InputDecoration(labelText: 'توضیح')),
              Row(children: [
                Expanded(
                    child: TextField(
                        controller: _mGoal,
                        keyboardType: TextInputType.number,
                        decoration: const InputDecoration(labelText: 'هدف',
                  helperText: 'چند بار از آن کار لازم است تا جایزه باز شود؛ ۱ یعنی «یک بار انجام بدهد کافی است».', helperMaxLines: 6))),
                const SizedBox(width: Gaps.sm),
                Expanded(
                    child: TextField(
                        controller: _mReward,
                        keyboardType: TextInputType.number,
                        decoration:
                            const InputDecoration(labelText: 'جایزه (امتیاز)',
                  helperText: 'پس از تکمیل به موجودیِ کاربر اضافه می‌شود و در دفترِ امتیاز با همین مقدار ثبت می‌شود؛ صفر یعنی ماموریتِ بی‌جایزه.', helperMaxLines: 6))),
              ]),
              Row(children: [
                Expanded(
                  child: DropdownButtonFormField<String>(
                    initialValue: _periods.contains(_mPeriod) ? _mPeriod : null,
                    items: [
                      for (final p in _periods)
                        DropdownMenuItem(value: p, child: Text(p)),
                    ],
                    onChanged: (v) => setState(() => _mPeriod = v ?? 'daily'),
                    decoration: const InputDecoration(labelText: 'دوره'),
                  ),
                ),
                const SizedBox(width: Gaps.sm),
                Expanded(
                  child: DropdownButtonFormField<String>(
                    initialValue: _events.contains(_mEvent) ? _mEvent : null,
                    items: [
                      for (final e in _events)
                        DropdownMenuItem(value: e, child: Text(e)),
                    ],
                    onChanged: (v) => setState(() => _mEvent = v ?? 'other'),
                    decoration: const InputDecoration(labelText: 'رویداد'),
                  ),
                ),
              ]),
              FilledButton.icon(
                onPressed: _saving ? null : _createCustom,
                icon: const Icon(Icons.add_rounded),
                label: const Text('ثبت ماموریت'),
              ),
            ],
          ),
          const SizedBox(height: Gaps.md),
          FormSection(
            title: 'ماموریت‌های توکار',
            subtitle: 'بازنویسی از چرخش بعدی اعمال می‌شود',
            children: [
              for (final m in _builtin)
                AppCard(
                  padding: const EdgeInsets.all(Gaps.sm),
                  child: Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('${m['title'] ?? m['key']}',
                                style: const TextStyle(fontWeight: FontWeight.w700)),
                            Text(
                                '${m['key']} · هدف ${m['goal']} · جایزه ${m['reward']}${m['active'] == false ? ' · غیرفعال' : ''}',
                                style: Theme.of(context).textTheme.bodySmall),
                          ],
                        ),
                      ),
                      IconButton(
                        icon: const Icon(Icons.edit_rounded, size: 20),
                        onPressed: () => _editBuiltin(m),
                      ),
                    ],
                  ),
                ),
            ],
          ),
          const SizedBox(height: Gaps.md),
          FormSection(
            title: 'ماموریت‌های سفارشی (${_customs.length})',
            children: [
              if (_customs.isEmpty)
                const EmptyState(
                    icon: Icons.flag_outlined,
                    title: 'ماموریت سفارشی نیست',
                    message: 'هنوز ماموریت سفارشی نساخته‌اید')
              else
                for (final m in _customs)
                  AppCard(
                    padding: const EdgeInsets.all(Gaps.sm),
                    child: Row(
                      children: [
                        Expanded(
                          child: Text('${m['title']}',
                              style: const TextStyle(fontWeight: FontWeight.w700)),
                        ),
                        IconButton(
                          icon: const Icon(Icons.delete_outline_rounded, size: 20),
                          onPressed: () => _deleteCustom(m),
                        ),
                      ],
                    ),
                  ),
            ],
          ),
        ],
      ),
    );
  }
}
