import 'package:flutter/material.dart';

import '../../api_client.dart';
import '../../core/assets.dart';
import '../../theme/tokens.dart';
import '../../widgets/app_card.dart';
import '../../widgets/section_header.dart';
import '../../widgets/state_views.dart';
import '../shared/football_card.dart';
import '../shared/hero_header.dart';

/// Home / dashboard tab: points header, card-code redemption and card
/// inventory carousel. Same three API calls as the legacy `DashboardPage`.
class DashboardPage extends StatefulWidget {
  final ApiClient api;
  final Future<void> Function() reloadProfile;
  const DashboardPage(
      {super.key, required this.api, required this.reloadProfile});

  @override
  State<DashboardPage> createState() => _DashboardPageState();
}

class _DashboardPageState extends State<DashboardPage> {
  Map<String, dynamic>? _data;
  List<Map<String, dynamic>> _rewards = [];
  final _code = TextEditingController();
  String? _message;
  bool _messageIsError = false;
  bool _sending = false;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _code.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final d = await widget.api.get('/api/profile');
    final rw = await widget.api.get('/api/rewards');
    if (!mounted) return;
    setState(() {
      _data = Map<String, dynamic>.from(d);
      _rewards = List<Map<String, dynamic>>.from(rw);
      _loading = false;
    });
  }

  Future<void> _redeem() async {
    setState(() {
      _sending = true;
      _message = null;
    });
    try {
      final r =
          await widget.api.post('/api/cards/redeem', {'code': _code.text});
      setState(() {
        _message = '${r['message']} +${faNum(r['addedPoints'])} امتیاز';
        _messageIsError = false;
      });
      _code.clear();
      await _load();
      await widget.reloadProfile();
    } catch (e) {
      setState(() {
        _message = apiError(e);
        _messageIsError = true;
      });
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const LoadingView();

    final user = _data?['user'];
    final inventory =
        List<Map<String, dynamic>>.from(_data?['inventory'] ?? []);
    final points = NumberParser.toInt(user?['current_points']);
    final sorted = [..._rewards]..sort((a, b) =>
        NumberParser.toInt(a['required_points'])
            .compareTo(NumberParser.toInt(b['required_points'])));
    Map<String, dynamic>? nextReward;
    for (final r in sorted) {
      if (points < NumberParser.toInt(r['required_points'])) {
        nextReward = r;
        break;
      }
    }
    nextReward ??= sorted.isNotEmpty ? sorted.last : null;

    final theme = Theme.of(context);

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(Gaps.lg, Gaps.md, Gaps.lg, Gaps.xxl),
        children: [
          HeroHeader(
              points: points,
              nickname: user?['nickname'] ?? 'قهرمان',
              nextReward: nextReward),
          Gaps.vLg,
          AppCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                ClipRRect(
                  borderRadius: Corners.rLg,
                  child: Image.asset('assets/brand/card_pack_banner.webp',
                      height: 130, fit: BoxFit.cover),
                ),
                Gaps.vMd,
                Text('ثبت کد کارت‌های قلقلی',
                    style: theme.textTheme.titleLarge),
                Gaps.vXxs,
                Text(
                  'پک کارت‌های قلقلی به‌صورت فیزیکی در فروشگاه‌ها و سوپرمارکت‌ها به فروش می‌رسند.',
                  style: theme.textTheme.bodySmall,
                ),
                Gaps.vMd,
                TextField(
                  controller: _code,
                  textCapitalization: TextCapitalization.characters,
                  decoration: const InputDecoration(
                      prefixIcon: Icon(Icons.qr_code_2_rounded),
                      labelText: 'کد طولانی روی کارت'),
                ),
                Gaps.vSm,
                FilledButton.icon(
                  icon: _sending
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(
                              strokeWidth: 2.2, color: Colors.white))
                      : const Icon(Icons.add_card_rounded),
                  label:
                      Text(_sending ? 'در حال ثبت...' : 'ثبت و دریافت امتیاز'),
                  onPressed: _sending ? null : _redeem,
                ),
                if (_message != null) ...[
                  Gaps.vSm,
                  _messageIsError
                      ? ErrorBanner(message: _message!)
                      : Container(
                          padding: const EdgeInsets.all(Gaps.sm),
                          decoration: BoxDecoration(
                            color: theme.colorScheme.primary
                                .withValues(alpha: 0.12),
                            borderRadius: Corners.rMd,
                          ),
                          child: Row(
                            children: [
                              Icon(Icons.check_circle_rounded,
                                  color: theme.colorScheme.primary, size: 18),
                              Gaps.hXs,
                              Expanded(
                                  child: Text(_message!,
                                      style: theme.textTheme.bodySmall)),
                            ],
                          ),
                        ),
                ],
              ],
            ),
          ),
          Gaps.vXl,
          const SectionHeader(title: 'موجودی کارت‌ها'),
          if (inventory.isEmpty)
            const AppCard(
              child: EmptyState(
                  icon: Icons.style_outlined,
                  title: 'هنوز کارتی در موجودی شما نیست',
                  message: 'یک کد کارت را ثبت کن تا اینجا نمایش داده شود.'),
            )
          else
            SizedBox(
              height: 222,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: inventory.length,
                separatorBuilder: (_, __) => Gaps.hMd,
                itemBuilder: (_, i) => FootballCard(item: inventory[i]),
              ),
            ),
        ],
      ),
    );
  }
}
