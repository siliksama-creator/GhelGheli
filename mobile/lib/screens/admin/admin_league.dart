import 'package:flutter/material.dart';

import '../../api_client.dart';
import '../../theme/tokens.dart';
import '../../widgets/state_views.dart';
import '../shared/rank_tile.dart';
import 'widgets/form_section.dart';

/// League prize-table editor + live leaderboard, same contract as legacy
/// `AdminLeague` (10 configurable rank prizes).
class AdminLeague extends StatefulWidget {
  final ApiClient api;
  const AdminLeague({super.key, required this.api});

  @override
  State<AdminLeague> createState() => _AdminLeagueState();
}

class _AdminLeagueState extends State<AdminLeague> {
  Map? _data;
  List<Map> _prizes = List.generate(10, (i) => {'rank': i + 1, 'amount': 0});
  bool _loading = true;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final d = await widget.api.get('/api/admin/league');
    if (mounted)
      setState(() {
        _data = d;
        _prizes = List<Map>.from(d?['season']?['prize_table'] ?? _prizes);
        _loading = false;
      });
  }

  Future<void> _save() async {
    setState(() => _saving = true);
    try {
      await widget.api
          .patch('/api/admin/league/current/prizes', {'prizeTable': _prizes});
      await _load();
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const LoadingView();
    return ListView(
      padding: const EdgeInsets.fromLTRB(Gaps.lg, Gaps.md, Gaps.lg, Gaps.xxl),
      children: [
        FormSection(
          title: 'جوایز رتبه‌ها',
          children: [
            ...List.generate(
              _prizes.length,
              (i) => TextFormField(
                key: ValueKey('prize_$i'),
                initialValue: '${_prizes[i]['amount']}',
                keyboardType: TextInputType.number,
                decoration: InputDecoration(
                    labelText: 'رتبه ${faNum(_prizes[i]['rank'])}',
                    prefixIcon: const Icon(Icons.paid_outlined)),
                onChanged: (v) => _prizes[i]['amount'] = int.tryParse(v) ?? 0,
              ),
            ),
            FilledButton.icon(
              onPressed: _saving ? null : _save,
              icon: _saving
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(
                          strokeWidth: 2.2, color: Colors.white))
                  : const Icon(Icons.save_rounded),
              label: const Text('ذخیره جوایز لیگ'),
            ),
          ],
        ),
        Gaps.vMd,
        FormSection(
          title: 'لیدربرد',
          children: [
            for (final r in List<Map>.from(_data?['entries'] ?? []))
              RankTile(rank: int.tryParse('${r['rank']}') ?? 0, row: r),
            if ((_data?['entries'] as List? ?? []).isEmpty)
              const EmptyState(
                  icon: Icons.emoji_events_outlined,
                  title: 'هنوز امتیازی ثبت نشده'),
          ],
        ),
      ],
    );
  }
}
