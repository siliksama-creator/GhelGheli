import 'dart:async';

import 'package:flutter/material.dart';

import '../../../api_client.dart';
import '../../../core/assets.dart';
import '../../../theme/colors.dart';
import '../../../theme/tokens.dart';
import '../../../widgets/app_card.dart';
import '../../../widgets/safe_image.dart';

/// دوئل سه‌کارتی قلقلی: بازی سریع، مستقل از لیگ اصلی.
///
/// Bot فقط تمرین است و امتیازی نمی‌دهد. Ghost با تیم آمادهٔ کاربر بازی
/// می‌کند، برنده امتیاز ثابت می‌گیرد و بازنده همان مقدار از موجودی‌اش کم
/// می‌شود؛ این انتقال به لیگ ماهانه دست نمی‌زند.
class CardDuelPage extends StatefulWidget {
  const CardDuelPage({super.key, required this.api, required this.onBack});

  final ApiClient api;
  final VoidCallback onBack;

  @override
  State<CardDuelPage> createState() => _CardDuelPageState();
}

class _CardDuelPageState extends State<CardDuelPage> {
  bool _loading = true;
  bool _busy = false;
  String? _error;
  Map<String, dynamic>? _data;
  Map<String, dynamic>? _last;
  final List<String> _selected = [];

  List<Map<String, dynamic>> get _cards => ((_data?['playableCards'] as List?) ?? const [])
      .whereType<Map>()
      .map((e) => Map<String, dynamic>.from(e))
      .toList();

  @override
  void initState() {
    super.initState();
    unawaited(_load());
  }

  int _int(Object? v) => NumberParser.toInt(v);

  Future<void> _load() async {
    try {
      final d = await widget.api.get('/api/card-duel', fresh: true);
      if (!mounted) return;
      final map = d is Map ? Map<String, dynamic>.from(d) : <String, dynamic>{};
      final deckCards = ((map['activeDeck'] as Map?)?['cards'] as List?)
          ?.whereType<Map>()
          .map((e) => e['cardTypeId']?.toString() ?? e['id']?.toString() ?? '')
          .where((e) => e.isNotEmpty)
          .toList();
      setState(() {
        _data = map;
        _selected
          ..clear()
          ..addAll(deckCards ?? const []);
        _error = null;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() { _error = apiError(e); _loading = false; });
    }
  }

  Future<void> _saveDeck() async {
    if (_selected.length != 3) return _snack('سه کارت انتخاب کن');
    await _run(() => widget.api.post('/api/card-duel/deck', {
      'cardTypeIds': _selected,
      'ghostEnabled': true,
    }), refresh: true);
  }

  Future<void> _bot() async {
    if (_selected.length != 3) return _snack('سه کارت انتخاب کن');
    await _run(() => widget.api.post('/api/card-duel/bot', {'cardTypeIds': _selected}));
  }

  Future<void> _ghost() async {
    await _run(() => widget.api.post('/api/card-duel/ghost', {}), refresh: true);
  }

  Future<void> _run(Future<dynamic> Function() fn, {bool refresh = false}) async {
    if (_busy) return;
    setState(() { _busy = true; _error = null; });
    try {
      final r = await fn();
      if (!mounted) return;
      setState(() => _last = r is Map ? Map<String, dynamic>.from(r) : null);
      _snack((r is Map ? r['message'] : null)?.toString() ?? 'انجام شد');
      if (refresh) await _load();
    } catch (e) {
      if (!mounted) return;
      _snack(apiError(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _snack(String m) {
    if (m.trim().isEmpty || !mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(m)));
  }

  void _toggle(String id) {
    setState(() {
      if (_selected.contains(id)) {
        _selected.remove(id);
      } else if (_selected.length < 3) {
        _selected.add(id);
      } else {
        _snack('حداکثر سه کارت');
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error != null && _data == null) {
      return ListView(padding: const EdgeInsets.all(Gaps.lg), children: [
        AppCard(child: Column(children: [
          Text(_error!, textAlign: TextAlign.center),
          Gaps.vSm,
          FilledButton(onPressed: _load, child: const Text('تلاش دوباره')),
        ])),
      ]);
    }
    final active = _data?['activeDeck'] as Map?;
    final autoLeft = _int(_data?['autoLeft']);
    final stake = _int(_data?['stakePoints']);

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(Gaps.lg, Gaps.md, Gaps.lg, Gaps.xxl),
        children: [
          _Hero(onBack: widget.onBack, autoLeft: autoLeft, stake: stake),
          Gaps.vMd,
          if (active != null) _GhostStatus(active: active, autoLeft: autoLeft),
          if (active != null) Gaps.vMd,
          _Lineup(selected: _selected, cards: _cards, onRemove: (id) => _toggle(id)),
          Gaps.vMd,
          Row(children: [
            Expanded(child: FilledButton.icon(
              onPressed: _busy || _selected.length != 3 ? null : _saveDeck,
              icon: const Icon(Icons.save_rounded),
              label: const Text('آماده Ghost'),
            )),
            Gaps.hXs,
            Expanded(child: OutlinedButton.icon(
              onPressed: _busy || _selected.length != 3 ? null : _bot,
              icon: const Icon(Icons.smart_toy_rounded),
              label: const Text('بات تمرینی'),
            )),
          ]),
          Gaps.vXs,
          FilledButton.icon(
            onPressed: _busy || active == null ? null : _ghost,
            icon: const Icon(Icons.flash_on_rounded),
            label: Text(_busy ? 'در حال دوئل…' : 'دوئل Ghost دستی'),
          ),
          Gaps.vMd,
          Text('کارت‌های قابل بازی', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w900)),
          Gaps.vXs,
          if (_cards.length < 3)
            const AppCard(child: Text('برای دوئل حداقل سه کارت در کلکسیون لازم است.'))
          else
            GridView.builder(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              itemCount: _cards.length,
              gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
                maxCrossAxisExtent: 190,
                mainAxisSpacing: Gaps.sm,
                crossAxisSpacing: Gaps.sm,
                childAspectRatio: 0.72,
              ),
              itemBuilder: (_, i) {
                final c = _cards[i];
                final id = '${c['cardTypeId'] ?? c['id']}';
                return _DuelCard(card: c, selected: _selected.contains(id), onTap: () => _toggle(id));
              },
            ),
          if (_last != null) ...[
            Gaps.vLg,
            _BattleResult(data: _last!),
          ],
          Gaps.vLg,
          Text('نتایج اخیر', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w900)),
          Gaps.vXs,
          for (final b in ((_data?['recentBattles'] as List?) ?? const []).whereType<Map>().take(6))
            _HistoryTile(battle: Map<String, dynamic>.from(b)),
        ],
      ),
    );
  }
}

class _Hero extends StatelessWidget {
  const _Hero({required this.onBack, required this.autoLeft, required this.stake});
  final VoidCallback onBack;
  final int autoLeft;
  final int stake;
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(Gaps.md),
      decoration: BoxDecoration(
        borderRadius: Corners.rXl,
        gradient: const LinearGradient(colors: [Color(0xFF182C58), Color(0xFF071521)]),
        border: Border.all(color: Colors.white.withValues(alpha: .10)),
        boxShadow: [BoxShadow(color: BrandColors.emerald.withValues(alpha: .11), blurRadius: 30, offset: const Offset(0, 14))],
      ),
      child: Row(children: [
        IconButton(onPressed: onBack, icon: const Icon(Icons.arrow_back_rounded)),
        Image.asset('assets/games/card_duel_glow.png', width: 72, height: 72, cacheWidth: 190),
        Gaps.hSm,
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('دوئل ۳ کارتی', style: Theme.of(context).textTheme.titleLarge?.copyWith(color: Colors.white, fontWeight: FontWeight.w900)),
          const SizedBox(height: 3),
          Text('تیم Ghost آماده کن؛ روزی ۱۰ نبرد خودکار. بات فقط تمرین است.',
            style: TextStyle(color: Colors.white.withValues(alpha: .72), fontSize: 12, height: 1.5)),
          Gaps.vXs,
          Wrap(spacing: 6, runSpacing: 6, children: [
            _Chip('باقی امروز: ${faNum(autoLeft)}', BrandColors.emerald),
            _Chip('استیک: ${faNum(stake)}', BrandColors.amber),
          ]),
        ])),
      ]),
    );
  }
}

class _GhostStatus extends StatelessWidget {
  const _GhostStatus({required this.active, required this.autoLeft});
  final Map active;
  final int autoLeft;
  @override
  Widget build(BuildContext context) => AppCard(
    padding: const EdgeInsets.all(Gaps.sm),
    child: Row(children: [
      Icon(active['ghost_enabled'] == true ? Icons.shield_moon_rounded : Icons.pause_circle_outline_rounded,
        color: active['ghost_enabled'] == true ? BrandColors.emerald : BrandColors.warning),
      Gaps.hSm,
      Expanded(child: Text(active['ghost_enabled'] == true
        ? 'تیم Ghost فعال است؛ ${faNum(autoLeft)} نبرد خودکار دیگر امروز می‌ماند.'
        : 'تیم ذخیره شده ولی Ghost غیرفعال است.')),
    ]),
  );
}

class _Lineup extends StatelessWidget {
  const _Lineup({required this.selected, required this.cards, required this.onRemove});
  final List<String> selected;
  final List<Map<String, dynamic>> cards;
  final ValueChanged<String> onRemove;
  @override
  Widget build(BuildContext context) {
    final byId = {for (final c in cards) '${c['cardTypeId'] ?? c['id']}': c};
    return AppCard(
      padding: const EdgeInsets.all(Gaps.sm),
      child: Row(children: [
        for (var i = 0; i < 3; i++) ...[
          Expanded(child: _LineupSlot(index: i + 1, card: i < selected.length ? byId[selected[i]] : null,
            onTap: i < selected.length ? () => onRemove(selected[i]) : null)),
          if (i != 2) Gaps.hXs,
        ],
      ]),
    );
  }
}

class _LineupSlot extends StatelessWidget {
  const _LineupSlot({required this.index, this.card, this.onTap});
  final int index;
  final Map? card;
  final VoidCallback? onTap;
  @override
  Widget build(BuildContext context) => InkWell(
    onTap: onTap,
    borderRadius: Corners.rLg,
    child: Container(
      height: 84,
      padding: const EdgeInsets.all(6),
      decoration: BoxDecoration(
        borderRadius: Corners.rLg,
        color: Colors.white.withValues(alpha: .06),
        border: Border.all(color: (card == null ? Colors.white24 : BrandColors.emerald.withValues(alpha: .45))),
      ),
      child: card == null
        ? Center(child: Text('کارت $index', style: TextStyle(color: Colors.white.withValues(alpha: .55))))
        : Column(children: [
            Expanded(child: SafeImage(url: card!['imageUrl'], fit: BoxFit.cover, fallbackEmoji: '🃏')),
            const SizedBox(height: 3),
            Text('${card!['name']}', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w800)),
          ]),
    ),
  );
}

class _DuelCard extends StatelessWidget {
  const _DuelCard({required this.card, required this.selected, required this.onTap});
  final Map<String, dynamic> card;
  final bool selected;
  final VoidCallback onTap;
  Color get _rarityColor => switch ('${card['rarity']}') {
    'legend' => const Color(0xFFFF7A45),
    'premium' => BrandColors.amber,
    'gold' => const Color(0xFFFFD166),
    'silver' => const Color(0xFFC7D2FE),
    _ => BrandColors.emerald,
  };
  @override
  Widget build(BuildContext context) => InkWell(
    onTap: onTap,
    borderRadius: Corners.rXl,
    child: AnimatedContainer(
      duration: Motion.fast,
      padding: const EdgeInsets.all(8),
      decoration: BoxDecoration(
        borderRadius: Corners.rXl,
        gradient: LinearGradient(begin: Alignment.topRight, end: Alignment.bottomLeft, colors: [
          _rarityColor.withValues(alpha: selected ? .25 : .12),
          Theme.of(context).colorScheme.surfaceContainer,
        ]),
        border: Border.all(color: _rarityColor.withValues(alpha: selected ? .85 : .26), width: selected ? 1.6 : 1),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Expanded(child: ClipRRect(borderRadius: Corners.rLg,
          child: SafeImage(url: card['imageUrl'], fit: BoxFit.cover, fallbackEmoji: '🃏'))),
        const SizedBox(height: 7),
        Text('${card['name']}', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w900)),
        const SizedBox(height: 3),
        Row(children: [
          _Chip('${card['rarityLabel']}', _rarityColor),
          const Spacer(),
          Text('P ${faNum(card['power'])}', style: TextStyle(color: _rarityColor, fontWeight: FontWeight.w900, fontSize: 12)),
        ]),
        const SizedBox(height: 5),
        Wrap(spacing: 3, runSpacing: 3, children: [
          _Mini('ح', card['attack']), _Mini('د', card['defense']), _Mini('س', card['speed']),
          _Mini('ت', card['technique']), _Mini('گل', card['goalChance']),
        ]),
      ]),
    ),
  );
}

class _BattleResult extends StatelessWidget {
  const _BattleResult({required this.data});
  final Map<String, dynamic> data;
  @override
  Widget build(BuildContext context) {
    final result = Map<String, dynamic>.from((data['result'] as Map?) ?? const {});
    final userScore = NumberParser.toInt(result['userScore']);
    final oppScore = NumberParser.toInt(result['opponentScore']);
    final winner = result['winnerSide'];
    final rounds = ((result['rounds'] as List?) ?? const []).whereType<Map>().toList();
    return AppCard(child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Row(children: [
        Image.asset('assets/games/card_duel_glow.png', width: 46, height: 46, cacheWidth: 120),
        Gaps.hSm,
        Expanded(child: Text(winner == 'draw' ? 'مساوی سینمایی' : winner == 'user' ? 'برد قلقلی!' : 'این بار حریف برد',
          style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w900))),
        Text('${faNum(userScore)} - ${faNum(oppScore)}', style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w900, color: BrandColors.amber)),
      ]),
      Gaps.vSm,
      for (final r in rounds)
        ListTile(
          dense: true,
          contentPadding: EdgeInsets.zero,
          leading: CircleAvatar(backgroundColor: BrandColors.emerald.withValues(alpha: .16), child: Text(faNum(r['round']))),
          title: Text('${r['title']} — ${r['cinematic']}', maxLines: 1, overflow: TextOverflow.ellipsis),
          subtitle: Text('${(r['userCard'] as Map?)?['name'] ?? 'کارت'} در برابر ${(r['opponentCard'] as Map?)?['name'] ?? 'حریف'}', maxLines: 1, overflow: TextOverflow.ellipsis),
        ),
    ]));
  }
}

class _HistoryTile extends StatelessWidget {
  const _HistoryTile({required this.battle});
  final Map<String, dynamic> battle;
  @override
  Widget build(BuildContext context) {
    final delta = NumberParser.toInt(battle['userDelta']);
    return Padding(
      padding: const EdgeInsets.only(bottom: Gaps.xs),
      child: AppCard(elevated: false, padding: const EdgeInsets.all(Gaps.sm), child: Row(children: [
        Icon(delta > 0 ? Icons.trending_up_rounded : delta < 0 ? Icons.trending_down_rounded : Icons.drag_handle_rounded,
          color: delta > 0 ? BrandColors.success : delta < 0 ? BrandColors.danger : Colors.white54),
        Gaps.hSm,
        Expanded(child: Text('${battle['mode']} · ${faNum(battle['userScore'])}-${faNum(battle['opponentScore'])}', maxLines: 1)),
        Text(delta == 0 ? '۰' : (delta > 0 ? '+${faNum(delta)}' : faNum(delta)),
          style: TextStyle(color: delta >= 0 ? BrandColors.success : BrandColors.danger, fontWeight: FontWeight.w900)),
      ])),
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip(this.text, this.color);
  final String text;
  final Color color;
  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
    decoration: BoxDecoration(color: color.withValues(alpha: .14), borderRadius: Corners.rPill, border: Border.all(color: color.withValues(alpha: .28))),
    child: Text(text, style: TextStyle(color: color, fontSize: 10.5, fontWeight: FontWeight.w900)),
  );
}

class _Mini extends StatelessWidget {
  const _Mini(this.k, this.v);
  final String k;
  final Object? v;
  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
    decoration: BoxDecoration(color: Colors.white.withValues(alpha: .07), borderRadius: Corners.rSm),
    child: Text('$k ${faNum(v)}', style: const TextStyle(fontSize: 9, fontWeight: FontWeight.w800)),
  );
}
