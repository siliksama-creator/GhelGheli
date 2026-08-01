// Cosmetic shop + GhelGheli Plus.
//
// Mirrors userweb/src/screens/Shop.jsx: same endpoints, same rules. Sells
// appearance only — nothing here affects points, prizes or league standing.
import 'package:flutter/material.dart';

import '../../api_client.dart';
import '../../core/money.dart';
import '../../theme/tokens.dart';
import '../../widgets/app_card.dart';
import '../../widgets/async_section.dart';
import '../../widgets/safe_image.dart';

const clubAsset = <String, String>{
  'esteghlal': 'assets/shop/club_esteghlal.webp',
  'persepolis': 'assets/shop/club_persepolis.webp',
  'sepahan': 'assets/shop/club_sepahan.webp',
  'tractor': 'assets/shop/club_tractor.webp',
  'malavan': 'assets/shop/club_malavan.webp',
};

const frameColors = <String, List<Color>>{
  'gold': [Color(0xFFFFD36B), Color(0xFFB8860B)],
  'neon': [Color(0xFFB5EF58), Color(0xFF00D49A)],
  'fire': [Color(0xFFFF8A3D), Color(0xFFF43F5E)],
  'ice': [Color(0xFF7DD3FC), Color(0xFF2563EB)],
  'holo': [Color(0xFFF472B6), Color(0xFFA855F7), Color(0xFF38BDF8)],
};

/// Colour for a name in chat / the league table. `rainbow` has no single
/// colour, so callers fall back to a gradient shader.
Color? nameColorOf(String? payload) {
  if (payload == null || payload == 'rainbow') return null;
  if (!payload.startsWith('#')) return null;
  final hex = payload.replaceFirst('#', '');
  final v = int.tryParse(hex, radix: 16);
  return v == null ? null : Color(0xFF000000 | v);
}

class ShopPage extends StatefulWidget {
  final ApiClient api;
  const ShopPage({super.key, required this.api});

  @override
  State<ShopPage> createState() => _ShopPageState();
}

class _ShopPageState extends State<ShopPage> {
  late Future<dynamic> _future = widget.api.get('/api/shop');
  String? _busy;

  Future<void> _reload() async {
    setState(() => _future = widget.api.get('/api/shop'));
    await _future;
  }

  Future<void> _run(Future<dynamic> Function() fn, String key) async {
    if (_busy != null) return;
    setState(() => _busy = key);
    try {
      final r = await fn();
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text('${r['message'] ?? 'انجام شد'}')));
      await _reload();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(apiError(e))));
    } finally {
      if (mounted) setState(() => _busy = null);
    }
  }

  Future<void> _confirmBuy(Map<String, dynamic> item, int balance) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('خرید «${item['name']}»'),
        content: Text(
          '${Money.withUnit(item['price'])} از کیف پولت کم می‌شود و این آیتم '
          'برای همیشه مال تو می‌شود.\n\n'
          'موجودی فعلی: ${Money.withUnit(balance)}',
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('انصراف')),
          FilledButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('بله، بخر')),
        ],
      ),
    );
    if (ok != true) return;
    await _run(
        () => widget.api.post('/api/shop/items/${item['id']}/buy', {}),
        '${item['id']}');
  }

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      onRefresh: _reload,
      child: AsyncSection<dynamic>(
        future: _future,
        onRetry: _reload,
        builder: (context, data) {
          final d = Map<String, dynamic>.from(data as Map);
          final plus = Map<String, dynamic>.from(d['plus'] as Map);
          final equipped = Map<String, dynamic>.from(d['equipped'] as Map);
          final items = List<Map<String, dynamic>>.from(
              (d['items'] as List).map((e) => Map<String, dynamic>.from(e)));

          List<Map<String, dynamic>> of(String kind) =>
              items.where((i) => i['kind'] == kind).toList();

          String? equippedFor(String kind) => kind == 'club_badge'
              ? equipped['club'] as String?
              : kind == 'card_frame'
                  ? equipped['frame'] as String?
                  : equipped['color'] as String?;

          return ListView(
            padding:
                const EdgeInsets.fromLTRB(Gaps.lg, Gaps.md, Gaps.lg, Gaps.xxl),
            children: [
              _PlusCard(
                plus: plus,
                busy: _busy == 'plus',
                onBuy: () => _run(
                    () => widget.api.post('/api/shop/plus', {}), 'plus'),
              ),
              Gaps.vMd,
              for (final group in const [
                ['club_badge', 'نشان باشگاه', '🛡️', 'کنار اسمت در چت و لیگ'],
                ['card_frame', 'قاب کارت', '🖼️', 'دور کارت‌های پروفایلت'],
                ['name_color', 'رنگ اسم', '🎨', 'رنگ اسمت در جدول لیگ'],
              ])
                if (of(group[0]).isNotEmpty) ...[
                  _KindSection(
                    title: group[1],
                    icon: group[2],
                    note: group[3],
                    items: of(group[0]),
                    equipped: equippedFor(group[0]),
                    busy: _busy,
                    balance: (d['balance'] as num?)?.toInt() ?? 0,
                    onBuy: _confirmBuy,
                    onEquip: (slug) => _run(
                        () => widget.api.post('/api/shop/equip', {'slug': slug}),
                        'equip$slug'),
                    onClear: () => _run(
                        () => widget.api.post('/api/shop/equip', {'slug': null}),
                        'clear'),
                  ),
                  Gaps.vMd,
                ],
            ],
          );
        },
      ),
    );
  }
}

class _PlusCard extends StatelessWidget {
  const _PlusCard(
      {required this.plus, required this.onBuy, required this.busy});
  final Map<String, dynamic> plus;
  final VoidCallback onBuy;
  final bool busy;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final active = plus['active'] == true;
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              const Text('⭐', style: TextStyle(fontSize: 26)),
              Gaps.hXs,
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('قلقلی پلاس',
                        style: theme.textTheme.titleMedium
                            ?.copyWith(fontWeight: FontWeight.w900)),
                    Text(
                      active
                          ? 'فعال — ${faNum(plus['daysLeft'])} روز باقی مانده'
                          : 'یک ماه دسترسی به همهٔ آیتم‌ها',
                      style: theme.textTheme.bodySmall,
                    ),
                  ],
                ),
              ),
              Text(Money.withUnit(plus['price']),
                  style: theme.textTheme.titleSmall?.copyWith(
                      color: const Color(0xFFFFD36B),
                      fontWeight: FontWeight.w900)),
            ],
          ),
          Gaps.vXs,
          Text('✅ همهٔ نشان‌ها، قاب‌ها و رنگ‌ها\n'
              '🔄 هر وقت خواستی عوض کن\n'
              '💾 آیتم‌های خریداری‌شده برای همیشه مال توست',
              style: theme.textTheme.bodySmall),
          Gaps.vXs,
          FilledButton(
            onPressed: busy ? null : onBuy,
            child: Text(busy
                ? 'در حال خرید...'
                : active
                    ? 'تمدید یک ماه دیگر'
                    : 'فعال‌سازی پلاس'),
          ),
        ],
      ),
    );
  }
}

class _KindSection extends StatelessWidget {
  const _KindSection({
    required this.title,
    required this.icon,
    required this.note,
    required this.items,
    required this.equipped,
    required this.balance,
    required this.onBuy,
    required this.onEquip,
    required this.onClear,
    this.busy,
  });

  final String title, icon, note;
  final List<Map<String, dynamic>> items;
  final String? equipped;
  final int balance;
  final String? busy;
  final void Function(Map<String, dynamic>, int) onBuy;
  final void Function(String slug) onEquip;
  final VoidCallback onClear;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text(icon, style: const TextStyle(fontSize: 20)),
              Gaps.hXs,
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title,
                        style: theme.textTheme.titleSmall
                            ?.copyWith(fontWeight: FontWeight.w800)),
                    Text(note, style: theme.textTheme.labelSmall),
                  ],
                ),
              ),
              if (equipped != null)
                TextButton(onPressed: onClear, child: const Text('برداشتن')),
            ],
          ),
          Gaps.vXs,
          GridView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
              maxCrossAxisExtent: 128,
              mainAxisExtent: 168,
              crossAxisSpacing: Gaps.xs,
              mainAxisSpacing: Gaps.xs,
            ),
            itemCount: items.length,
            itemBuilder: (_, i) {
              final it = items[i];
              final on = equipped != null && equipped == it['payload'];
              final usable = it['usable'] == true;
              return _ShopTile(
                item: it,
                selected: on,
                usable: usable,
                busy: busy == '${it['id']}' || busy == 'equip${it['slug']}',
                onTap: () => usable
                    ? (on ? null : onEquip('${it['slug']}'))
                    : onBuy(it, balance),
              );
            },
          ),
        ],
      ),
    );
  }
}

class _ShopTile extends StatelessWidget {
  const _ShopTile({
    required this.item,
    required this.selected,
    required this.usable,
    required this.busy,
    required this.onTap,
  });

  final Map<String, dynamic> item;
  final bool selected, usable, busy;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final kind = item['kind'];
    final payload = item['payload'] as String?;

    Widget art;
    if (kind == 'name_color') {
      final c = nameColorOf(payload);
      art = Container(
        width: 48,
        height: 48,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: c,
          gradient: c == null
              ? const LinearGradient(colors: [
                  Color(0xFFF472B6), Color(0xFFA855F7),
                  Color(0xFF38BDF8), Color(0xFF34D399),
                ])
              : null,
          border: Border.all(
              color: theme.colorScheme.onSurface.withValues(alpha: 0.15),
              width: 2),
        ),
      );
    } else if (kind == 'card_frame') {
      art = Container(
        width: 52,
        height: 52,
        decoration: BoxDecoration(
          borderRadius: Corners.rMd,
          gradient: LinearGradient(
              colors: frameColors[payload] ?? const [
                Color(0xFF334155), Color(0xFF1E293B),
              ]),
        ),
      );
    } else {
      art = ClipRRect(
        borderRadius: Corners.rMd,
        child: Image.asset(
          clubAsset[payload] ?? '',
          width: 56,
          height: 56,
          fit: BoxFit.cover,
          errorBuilder: (_, __, ___) => const SizedBox(
              width: 56, height: 56, child: Icon(Icons.shield_outlined)),
        ),
      );
    }

    return InkWell(
      onTap: busy ? null : onTap,
      borderRadius: Corners.rLg,
      child: Container(
        padding: const EdgeInsets.all(Gaps.xs),
        decoration: BoxDecoration(
          color: theme.colorScheme.onSurface.withValues(alpha: 0.03),
          borderRadius: Corners.rLg,
          border: Border.all(
            color: selected
                ? const Color(0xFFB5EF58)
                : theme.colorScheme.onSurface.withValues(alpha: 0.08),
            width: selected ? 2 : 1,
          ),
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            art,
            Gaps.vXxs,
            Text('${item['name']}',
                maxLines: 2,
                textAlign: TextAlign.center,
                overflow: TextOverflow.ellipsis,
                style: theme.textTheme.labelSmall
                    ?.copyWith(fontWeight: FontWeight.w700)),
            const Spacer(),
            if (selected)
              const _Chip(text: 'انتخاب‌شده', color: Color(0xFFB5EF58))
            else if (item['owned'] == true)
              const _Chip(text: 'خریداری‌شده', color: Color(0xFFB5EF58))
            else if (item['unlockedByPlus'] == true)
              const _Chip(text: 'با پلاس', color: Color(0xFFFFD36B))
            else
              Text(Money.withUnit(item['price']),
                  style: theme.textTheme.labelSmall?.copyWith(
                      color: const Color(0xFFFFD36B),
                      fontWeight: FontWeight.w800)),
          ],
        ),
      ),
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip({required this.text, required this.color});
  final String text;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.16),
        borderRadius: Corners.rPill,
      ),
      child: Text(text,
          style: TextStyle(
              fontSize: 9.5, fontWeight: FontWeight.w800, color: color)),
    );
  }
}
