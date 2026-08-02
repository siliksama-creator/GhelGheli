// Admin control for match rewards.
//
// Points apply ONLY to online human-vs-human games: awarding them for bot
// matches would let anyone farm an unlimited score against the computer.
import 'package:flutter/material.dart';

import '../../api_client.dart';
import '../../theme/tokens.dart';
import '../../widgets/app_card.dart';
import '../../widgets/state_views.dart';
import 'widgets/form_section.dart';

class AdminGameRewards extends StatefulWidget {
  const AdminGameRewards({super.key, required this.api});
  final ApiClient api;

  @override
  State<AdminGameRewards> createState() => _AdminGameRewardsState();
}

class _AdminGameRewardsState extends State<AdminGameRewards> {
  final _win = TextEditingController();
  final _lose = TextEditingController();
  final _draw = TextEditingController();
  final _cap = TextEditingController();
  bool _enabled = false;
  bool _loading = true;
  bool _saving = false;
  List _results = [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _win.dispose();
    _lose.dispose();
    _draw.dispose();
    _cap.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final batch = await widget.api.getAll(
          ['/api/admin/settings/games', '/api/admin/games/results']);
      if (!mounted) return;
      // A batch element is only a Map on success; an error response is a
      // String and used to throw here instead of showing the message.
      final s = batch[0] is Map
          ? Map<String, dynamic>.from(batch[0] as Map)
          : <String, dynamic>{};
      setState(() {
        _enabled = s['enabled'] == true;
        _win.text = '${s['winPoints'] ?? 10}';
        _lose.text = '${s['losePoints'] ?? 0}';
        _draw.text = '${s['drawPoints'] ?? 0}';
        _cap.text = '${s['dailyCap'] ?? 10}';
        _results = batch[1] is List ? batch[1] as List : const [];
        _loading = false;
      });
    } catch (e) {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _save() async {
    setState(() => _saving = true);
    try {
      final d = await widget.api.patch('/api/admin/settings/games', {
        'enabled': _enabled,
        'winPoints': int.tryParse(_win.text) ?? 0,
        'losePoints': int.tryParse(_lose.text) ?? 0,
        'drawPoints': int.tryParse(_draw.text) ?? 0,
        'dailyCap': int.tryParse(_cap.text) ?? 0,
      });
      if (!mounted) return;
      // Echo the server's clamped values back so the admin sees what really
      // got stored rather than what they typed.
      setState(() {
        _win.text = '${d['winPoints']}';
        _lose.text = '${d['losePoints']}';
        _draw.text = '${d['drawPoints']}';
        _cap.text = '${d['dailyCap']}';
      });
      _toast('${d['message'] ?? 'ذخیره شد'}');
      await _load();
    } catch (e) {
      _toast(apiError(e));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  void _toast(String m) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(m)));
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const LoadingView();
    final theme = Theme.of(context);

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(Gaps.lg, Gaps.md, Gaps.lg, Gaps.xxl),
        children: [
          AppCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Icon(Icons.sports_esports_rounded,
                        color: theme.colorScheme.primary, size: 20),
                    Gaps.hXs,
                    Expanded(
                      child: Text('امتیاز بازی‌های آنلاین',
                          style: theme.textTheme.titleSmall),
                    ),
                    Switch(
                      value: _enabled,
                      onChanged: (v) => setState(() => _enabled = v),
                    ),
                  ],
                ),
                Gaps.vXxs,
                Text(
                  'فقط بازی‌های دو نفره واقعی امتیاز می‌گیرند؛ بازی با ربات هیچ امتیازی ندارد '
                  'تا کسی نتواند با تکرار بازی با کامپیوتر امتیاز جمع کند.',
                  style: theme.textTheme.bodySmall,
                ),
              ],
            ),
          ),
          Gaps.vMd,
          FormSection(
            title: 'مقدار امتیازها',
            children: [
              TextField(
                controller: _win,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(
                  labelText: 'امتیاز برنده',
                  helperText: 'عدد مثبت، بین ۰ تا ۱۰۰۰',
                  prefixIcon: Icon(Icons.emoji_events_rounded),
                ),
              ),
              Gaps.vSm,
              TextField(
                controller: _lose,
                keyboardType: const TextInputType.numberWithOptions(signed: true),
                decoration: const InputDecoration(
                  labelText: 'امتیاز بازنده (منفی)',
                  helperText: 'مثلاً ‎-۵ ؛ امتیاز کاربر هرگز زیر صفر نمی‌رود',
                  prefixIcon: Icon(Icons.trending_down_rounded),
                ),
              ),
              Gaps.vSm,
              TextField(
                controller: _draw,
                keyboardType: const TextInputType.numberWithOptions(signed: true),
                decoration: const InputDecoration(
                  labelText: 'امتیاز مساوی',
                  prefixIcon: Icon(Icons.handshake_rounded),
                ),
              ),
              Gaps.vSm,
              TextField(
                controller: _cap,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(
                  labelText: 'سقف بازی امتیازدار در روز',
                  helperText: 'جلوی رد و بدل کردن برد بین دو دوست را می‌گیرد',
                  prefixIcon: Icon(Icons.today_rounded),
                ),
              ),
              Gaps.vMd,
              FilledButton.icon(
                onPressed: _saving ? null : _save,
                icon: _saving
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(
                            strokeWidth: 2.2, color: Colors.white))
                    : const Icon(Icons.save_rounded),
                label: Text(_saving ? 'در حال ذخیره...' : 'ذخیره تنظیمات'),
              ),
            ],
          ),
          Gaps.vXl,
          Text('آخرین نتایج امتیازدار', style: theme.textTheme.titleSmall),
          Gaps.vXs,
          if (_results.isEmpty)
            const AppCard(
              child: EmptyState(
                  icon: Icons.history_rounded, title: 'هنوز نتیجه‌ای ثبت نشده'),
            )
          else
            ..._results.take(30).map((r) {
              final delta = (r['points_delta'] as num?)?.toInt() ?? 0;
              final outcome = '${r['outcome']}';
              final color = delta > 0
                  ? const Color(0xFF16A34A)
                  : (delta < 0 ? theme.colorScheme.error : theme.colorScheme.outline);
              return Padding(
                padding: const EdgeInsets.only(bottom: Gaps.xs),
                child: AppCard(
                  padding: const EdgeInsets.all(Gaps.sm),
                  child: Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('${r['nickname'] ?? r['mobile'] ?? 'کاربر'}',
                                style: theme.textTheme.bodyMedium),
                            Text(
                              '${_outcomeLabel(outcome)} • ${r['game_id']} • حریف: ${r['opponent_nickname'] ?? '—'}',
                              style: theme.textTheme.bodySmall,
                            ),
                          ],
                        ),
                      ),
                      Text(
                        delta > 0 ? '+${faNum(delta)}' : faNum(delta),
                        style: theme.textTheme.titleSmall
                            ?.copyWith(color: color, fontWeight: FontWeight.w900),
                      ),
                    ],
                  ),
                ),
              );
            }),
        ],
      ),
    );
  }

  static String _outcomeLabel(String o) {
    switch (o) {
      case 'win':
        return 'برد';
      case 'loss':
        return 'باخت';
      default:
        return 'مساوی';
    }
  }
}
