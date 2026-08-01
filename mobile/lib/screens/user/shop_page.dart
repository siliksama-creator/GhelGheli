// Cosmetic shop + GhelGheli Plus.
//
// Mirrors userweb/src/screens/Shop.jsx: same endpoints, same rules, same
// wording. Sells appearance and club membership only — nothing here affects
// points, prizes or league standing.
//
// EVERY PURCHASE IS PERMANENT, and the UI says so on the tile, in the confirm
// dialog and in the receipt. A user who only finds out the terms afterwards
// is a refund request.
import 'package:flutter/material.dart';

import '../../api_client.dart';
import '../../core/cosmetics.dart';
import '../../core/money.dart';
import '../../theme/tokens.dart';
import '../../widgets/app_card.dart';
import '../../widgets/async_section.dart';

// Crest paths, frame gradients and name colours all live in
// core/cosmetics.dart now — this file used to own them, which meant the
// league table and chat had to import the SHOP to draw a badge.

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

  Future<dynamic> _run(Future<dynamic> Function() fn, String key) async {
    if (_busy != null) return null;
    setState(() => _busy = key);
    try {
      final r = await fn();
      if (!mounted) return r;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text('${r['message'] ?? 'انجام شد'}')));
      await _reload();
      return r;
    } catch (e) {
      if (!mounted) return null;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(apiError(e))));
      return null;
    } finally {
      if (mounted) setState(() => _busy = null);
    }
  }

  Future<void> _confirmBuy(Map<String, dynamic> item, int balance) async {
    final price = (item['price'] as num?)?.toInt() ?? 0;
    final short = balance < price;
    final isClub = item['kind'] == 'club_badge';

    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('خرید «${item['name']}»'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('${Money.withUnit(price)} از کیف پولت کم می‌شود.'),
            Gaps.vXs,
            const Text('✅ این آیتم برای همیشه مال تو می‌شود — حتی اگر اشتراک '
                'پلاس نداشته باشی یا تمام شود.'),
            if (isClub) ...[
              Gaps.vXxs,
              const Text('🏟️ هم‌زمان عضو دائمی این باشگاه می‌شوی و اسمت در '
                  'فهرست هوادارانش می‌آید.'),
            ],
            Gaps.vXs,
            Text('موجودی فعلی: ${Money.withUnit(balance)}',
                style: Theme.of(ctx).textTheme.bodySmall),
            if (short)
              Text('⚠️ موجودی‌ات ${Money.withUnit(price - balance)} کم است.',
                  style: Theme.of(ctx)
                      .textTheme
                      .bodySmall
                      ?.copyWith(color: Theme.of(ctx).colorScheme.error)),
          ],
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('انصراف')),
          FilledButton(
              // Blocking here rather than letting the server 400 keeps the
              // failure honest: the user sees exactly how much they are short.
              onPressed: short ? null : () => Navigator.pop(ctx, true),
              child: const Text('بله، بخر')),
        ],
      ),
    );
    if (ok != true) return;

    final r = await _run(
        () => widget.api.post('/api/shop/items/${item['id']}/buy', {}),
        '${item['id']}');

    // Buying a crest does not silently replace the user's face; it offers.
    final joined = r is Map ? r['joinedClub'] as String? : null;
    if (joined != null && mounted) {
      await _offerAvatar(joined, '${item['name']}');
    }
  }

  Future<void> _confirmPlus(Map<String, dynamic> plus, int balance) async {
    final price = (plus['price'] as num?)?.toInt() ?? 0;
    final short = balance < price;
    final active = plus['active'] == true;

    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(active ? 'تمدید قلقلی پلاس' : 'فعال‌سازی قلقلی پلاس'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('${Money.withUnit(price)} برای '
                  '${faNum(plus['days'])} روز.'),
              Gaps.vXs,
              Text('${plus['expiryNote'] ?? ''}'),
              Gaps.vXs,
              Text('موجودی فعلی: ${Money.withUnit(balance)}',
                  style: Theme.of(ctx).textTheme.bodySmall),
              if (short)
                Text('⚠️ موجودی‌ات ${Money.withUnit(price - balance)} کم است.',
                    style: Theme.of(ctx)
                        .textTheme
                        .bodySmall
                        ?.copyWith(color: Theme.of(ctx).colorScheme.error)),
            ],
          ),
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('انصراف')),
          FilledButton(
              onPressed: short ? null : () => Navigator.pop(ctx, true),
              child: const Text('بله، فعال کن')),
        ],
      ),
    );
    if (ok != true) return;
    await _run(() => widget.api.post('/api/shop/plus', {}), 'plus');
  }

  Future<void> _offerAvatar(String slug, String name) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('عکس پروفایلت را عوض کنیم؟'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Image.asset(clubAsset(slug), width: 84, height: 84,
                errorBuilder: (_, __, ___) => const SizedBox.shrink()),
            Gaps.vXs,
            Text('نشان «$name» می‌تواند عکس پروفایلت شود. '
                'هر وقت خواستی از صفحهٔ پروفایل عوضش کن.'),
          ],
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('نه، فعلاً نه')),
          FilledButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('بله، عوض کن')),
        ],
      ),
    );
    if (ok != true) return;
    await _run(
        () => widget.api.post('/api/shop/club-avatar', {'club': slug}),
        'avatar');
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
          final myClubs = List<Map<String, dynamic>>.from(
              ((d['clubs'] as List?) ?? const [])
                  .map((e) => Map<String, dynamic>.from(e)));
          final balance = (d['balance'] as num?)?.toInt() ?? 0;

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
              _IntroCard(balance: balance),
              Gaps.vMd,
              _PlusCard(
                plus: plus,
                busy: _busy == 'plus',
                onBuy: () => _confirmPlus(plus, balance),
              ),
              Gaps.vMd,
              if (myClubs.isNotEmpty) ...[
                _MyClubsCard(
                  clubs: myClubs,
                  plusActive: plus['active'] == true,
                  busy: _busy == 'avatar',
                  onUseAvatar: (slug) => _run(
                      () =>
                          widget.api.post('/api/shop/club-avatar', {'club': slug}),
                      'avatar'),
                ),
                Gaps.vMd,
              ],
              for (final group in const [
                [
                  'club_badge',
                  'باشگاه‌ها',
                  '🛡️',
                  'با خرید نشان، عضو دائمی باشگاه می‌شوی و می‌توانی نشان را '
                      'عکس پروفایلت کنی.'
                ],
                ['card_frame', 'قاب کارت', '🖼️', 'دور کارت‌های پروفایلت'],
                ['name_color', 'رنگ اسم', '🎨', 'رنگ اسمت در جدول لیگ و چت'],
              ])
                if (of(group[0]).isNotEmpty) ...[
                  _KindSection(
                    title: group[1],
                    icon: group[2],
                    note: group[3],
                    kind: group[0],
                    items: of(group[0]),
                    equipped: equippedFor(group[0]),
                    busy: _busy,
                    balance: balance,
                    onBuy: _confirmBuy,
                    onEquip: (slug) => _run(
                        () => widget.api.post('/api/shop/equip', {'slug': slug}),
                        'equip$slug'),
                    // BUG: every section's "برداشتن" sent slug:null with no
                    // kind, and the server then cleared ALL THREE slots — so
                    // taking off a badge also wiped the frame and name colour.
                    onClear: () => _run(
                        () => widget.api.post(
                            '/api/shop/equip', {'slug': null, 'kind': group[0]}),
                        'clear${group[0]}'),
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

/// Sets expectations before anyone spends: purchases are permanent, and
/// nothing sold here touches points or prizes.
class _IntroCard extends StatelessWidget {
  const _IntroCard({required this.balance});
  final int balance;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('🛒 فروشگاه قلقلی',
              style: theme.textTheme.titleSmall
                  ?.copyWith(fontWeight: FontWeight.w900)),
          Gaps.vXxs,
          Text(
            'هر آیتمی که جداگانه بخری، برای همیشه مال توست — با تمام شدن '
            'اشتراک هم از بین نمی‌رود. آیتم‌ها فقط ظاهر را عوض می‌کنند و هیچ '
            'تأثیری روی امتیاز، جایزه یا رتبهٔ لیگ ندارند.',
            style: theme.textTheme.bodySmall,
          ),
          Gaps.vXxs,
          Text('موجودی کیف پول: ${Money.withUnit(balance)}',
              style: theme.textTheme.labelMedium
                  ?.copyWith(fontWeight: FontWeight.w800)),
        ],
      ),
    );
  }
}

/// The clubs this user belongs to, with an honest label for which of them
/// survive a lapsed subscription.
class _MyClubsCard extends StatelessWidget {
  const _MyClubsCard({
    required this.clubs,
    required this.plusActive,
    required this.busy,
    required this.onUseAvatar,
  });

  final List<Map<String, dynamic>> clubs;
  final bool plusActive;
  final bool busy;
  final void Function(String slug) onUseAvatar;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final anyTemporary = clubs.any((c) => c['permanent'] != true);

    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('🏟️ باشگاه‌های من',
              style: theme.textTheme.titleSmall
                  ?.copyWith(fontWeight: FontWeight.w900)),
          Gaps.vXs,
          GridView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
              maxCrossAxisExtent: 132,
              mainAxisExtent: 150,
              crossAxisSpacing: Gaps.xs,
              mainAxisSpacing: Gaps.xs,
            ),
            itemCount: clubs.length,
            itemBuilder: (_, i) {
              final c = clubs[i];
              final permanent = c['permanent'] == true;
              return Container(
                padding: const EdgeInsets.all(Gaps.xs),
                decoration: BoxDecoration(
                  color: theme.colorScheme.onSurface.withValues(alpha: 0.03),
                  borderRadius: Corners.rLg,
                  border: Border.all(
                      color:
                          theme.colorScheme.onSurface.withValues(alpha: 0.08)),
                ),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Image.asset(clubAsset('${c['slug']}'),
                        width: 42,
                        height: 42,
                        fit: BoxFit.contain,
                        errorBuilder: (_, __, ___) =>
                            const Icon(Icons.shield_outlined, size: 42)),
                    Gaps.vXxs,
                    Text('${c['name']}',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: theme.textTheme.labelSmall
                            ?.copyWith(fontWeight: FontWeight.w800)),
                    Gaps.vXxs,
                    _Chip(
                        text: permanent ? 'دائمی' : 'با پلاس',
                        color: permanent
                            ? const Color(0xFFB5EF58)
                            : const Color(0xFFFFD36B)),
                    const Spacer(),
                    SizedBox(
                      width: double.infinity,
                      child: TextButton(
                        onPressed:
                            busy ? null : () => onUseAvatar('${c['slug']}'),
                        style: TextButton.styleFrom(
                            padding: EdgeInsets.zero,
                            minimumSize: const Size(0, 28),
                            tapTargetSize: MaterialTapTargetSize.shrinkWrap),
                        child: const Text('عکس پروفایلم شود',
                            style: TextStyle(fontSize: 10.5)),
                      ),
                    ),
                  ],
                ),
              );
            },
          ),
          if (anyTemporary && !plusActive) ...[
            Gaps.vXs,
            Text(
              '⚠️ باشگاه‌هایی که با پلاس عضو شده‌ای، بدون اشتراک فعال فقط تا '
              'آخرین انتخابت باقی می‌مانند. برای دائمی‌شدن، نشانشان را '
              'جداگانه بخر.',
              style: theme.textTheme.labelSmall,
            ),
          ],
        ],
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
                          : '${faNum(plus['days'])} روز دسترسی به همهٔ آیتم‌ها',
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
          // The perk list comes from the server so the app, the web app and
          // the store listing can never describe Plus differently.
          for (final perk in (plus['perks'] as List? ?? const []))
            Padding(
              padding: const EdgeInsets.only(bottom: 3),
              child: Text('✅ $perk', style: theme.textTheme.bodySmall),
            ),
          Gaps.vXs,
          // The honest small print, before the money leaves. A subscription
          // that quietly takes things back is the fastest way to lose a
          // paying user's trust.
          Container(
            padding: const EdgeInsets.all(Gaps.sm),
            decoration: BoxDecoration(
              color: const Color(0xFFFFD36B).withValues(alpha: 0.10),
              borderRadius: Corners.rMd,
              border: Border.all(
                  color: const Color(0xFFFFD36B).withValues(alpha: 0.28)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('⏳ بعد از پایان اشتراک چه می‌شود؟',
                    style: theme.textTheme.labelMedium?.copyWith(
                        fontWeight: FontWeight.w800,
                        color: const Color(0xFFC79415))),
                Gaps.vXxs,
                Text('${plus['expiryNote'] ?? ''}',
                    style: theme.textTheme.bodySmall),
              ],
            ),
          ),
          Gaps.vXs,
          FilledButton(
            onPressed: busy ? null : onBuy,
            child: Text(busy
                ? 'در حال خرید...'
                : active
                    ? 'تمدید یک ماه دیگر'
                    : 'فعال‌سازی پلاس'),
          ),
          if (active)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Text(
                  'اگر زودتر تمدید کنی، روزهای باقی‌مانده از بین نمی‌رود و '
                  '۳۰ روز به آن اضافه می‌شود.',
                  style: theme.textTheme.labelSmall),
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
    required this.kind,
    required this.items,
    required this.equipped,
    required this.balance,
    required this.onBuy,
    required this.onEquip,
    required this.onClear,
    this.busy,
  });

  final String title, icon, note, kind;
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
              // A lapsed subscriber keeps ONE club: they own no shop row and
              // hold no Plus, but they are still a member and must still be
              // able to wear that crest. `usable` alone would lock them out.
              final usable = it['usable'] == true || it['member'] == true;
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
      art = Image.asset(
        clubAsset(payload),
        width: 56,
        height: 56,
        // contain, not cover: a crest is not a photo and cropping its corners
        // mangles the shield shapes.
        fit: BoxFit.contain,
        errorBuilder: (_, __, ___) => const SizedBox(
            width: 56, height: 56, child: Icon(Icons.shield_outlined)),
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
              // "دائمی" not "خریداری‌شده": the point the user needs to see is
              // that it cannot be taken away, not that money changed hands.
              const _Chip(text: 'دائمی', color: Color(0xFFB5EF58))
            else if (item['member'] == true)
              const _Chip(text: 'عضوی', color: Color(0xFFFFD36B))
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
