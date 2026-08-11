// Compact category-based Shop. Web parity: monthly/annual Plus and every
// deterministic cosmetic use the same server catalogue and wallet ledger.
import 'package:flutter/material.dart';

import '../../api_client.dart';
import '../../core/cosmetics.dart';
import '../../core/money.dart';
import '../../theme/tokens.dart';
import '../../widgets/app_card.dart';
import '../../widgets/async_section.dart';

class ShopPage extends StatefulWidget {
  final ApiClient api;
  const ShopPage({super.key, required this.api});

  @override
  State<ShopPage> createState() => _ShopPageState();
}

class _ShopPageState extends State<ShopPage> {
  late Future<dynamic> _future = widget.api.get('/api/shop');
  String? _busy;
  String _kind = 'card_frame';
  bool _showPlans = true;

  static const _categories = <(String, String, IconData)>[
    ('club_badge', 'باشگاه‌ها', Icons.shield_rounded),
    ('card_frame', 'قاب‌ها', Icons.crop_portrait_rounded),
    ('name_color', 'افکت نام', Icons.auto_awesome_rounded),
    ('profile_background', 'پس‌زمینه', Icons.wallpaper_rounded),
    ('result_template', 'نتیجه', Icons.emoji_events_rounded),
    ('match_effect', 'ورود و پایان', Icons.celebration_rounded),
    ('emote_pack', 'پیام‌ها', Icons.forum_rounded),
  ];

  Future<void> _reload() async {
    setState(() => _future = widget.api.get('/api/shop'));
    try {
      await _future;
    } catch (_) {
      // AsyncSection owns the visible error state.
    }
  }

  Future<dynamic> _run(
    Future<dynamic> Function() action,
    String key,
    String success,
  ) async {
    if (_busy != null) return null;
    setState(() => _busy = key);
    try {
      final result = await action();
      if (!mounted) return result;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(success)));
      await _reload();
      return result;
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(apiError(error))));
      }
      return null;
    } finally {
      if (mounted) setState(() => _busy = null);
    }
  }

  Future<void> _buyPlan(Map<String, dynamic> plan, int balance) async {
    final price = (plan['price'] as num?)?.toInt() ?? 0;
    final annual = plan['billingCycle'] == 'annual';
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('خرید ${plan['label']}'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('${Money.withUnit(price)} از کیف پول کم می‌شود.'),
            Gaps.vXs,
            Text(annual
                ? 'قاب، عنوان پروفایل و قالب نتیجهٔ سالانه دائمی هستند؛ یک فرصت تغییر باشگاه هم می‌گیری.'
                : 'دسترسی قاب‌ها و افکت نام، ستاره پلاس، Premium Pass و حذف تبلیغات برای ۳۰ روز فعال می‌شود.'),
            Gaps.vXs,
            Text('موجودی: ${Money.withUnit(balance)}',
                style: Theme.of(ctx).textTheme.bodySmall),
            if (balance < price)
              Text('موجودی ${Money.withUnit(price - balance)} کم است.',
                  style: TextStyle(color: Theme.of(ctx).colorScheme.error)),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('انصراف')),
          FilledButton(
            onPressed: balance < price ? null : () => Navigator.pop(ctx, true),
            child: const Text('تأیید خرید'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    await _run(
      () => widget.api.post('/api/shop/plus', {
        'billingCycle': plan['billingCycle'],
      }),
      'plus-${plan['billingCycle']}',
      annual ? 'پلاس سالانه و هدیه‌های دائمی فعال شد' : 'پلاس ماهانه فعال شد',
    );
  }

  Future<void> _buyItem(Map<String, dynamic> item, int balance) async {
    final price = (item['price'] as num?)?.toInt() ?? 0;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('خرید «${item['name']}»'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('${Money.withUnit(price)} از کیف پول کم می‌شود.'),
            Gaps.vXs,
            const Text('این آیتم ظاهری برای همیشه در کلکسیونت می‌ماند و هیچ قدرت رقابتی نمی‌دهد.'),
            if (item['kind'] == 'club_badge') ...[
              Gaps.vXs,
              const Text('خرید نشان، عضویت دائمی همان باشگاه را هم فعال می‌کند.'),
            ],
            if (balance < price) ...[
              Gaps.vXs,
              Text('موجودی ${Money.withUnit(price - balance)} کم است.',
                  style: TextStyle(color: Theme.of(ctx).colorScheme.error)),
            ],
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('انصراف')),
          FilledButton(
            onPressed: balance < price ? null : () => Navigator.pop(ctx, true),
            child: const Text('بله، بخر'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    await _run(
      () => widget.api.post('/api/shop/items/${item['id']}/buy', {}),
      'buy-${item['id']}',
      '${item['name']} به کلکسیون اضافه شد',
    );
  }

  Future<void> _equip(Map<String, dynamic> item) async {
    await _run(
      () => widget.api.post('/api/shop/equip', {
        'slug': item['slug'],
        'kind': item['kind'],
      }),
      'equip-${item['id']}',
      '${item['name']} فعال شد',
    );
  }

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      onRefresh: _reload,
      child: AsyncSection<dynamic>(
        future: _future,
        onRetry: _reload,
        builder: (context, raw) {
          final data = raw is Map
              ? Map<String, dynamic>.from(raw)
              : <String, dynamic>{};
          final plus = data['plus'] is Map
              ? Map<String, dynamic>.from(data['plus'] as Map)
              : <String, dynamic>{};
          final plans = ((data['plans'] as List?) ?? const [])
              .whereType<Map>()
              .map((e) => Map<String, dynamic>.from(e))
              .toList();
          final items = ((data['items'] as List?) ?? const [])
              .whereType<Map>()
              .map((e) => Map<String, dynamic>.from(e))
              .toList();
          final balance = (data['walletBalance'] as num?)?.toInt() ?? 0;
          final available = _categories
              .where((c) => items.any((item) => item['kind'] == c.$1))
              .toList();
          if (!available.any((c) => c.$1 == _kind) && available.isNotEmpty) {
            WidgetsBinding.instance.addPostFrameCallback((_) {
              if (mounted) setState(() => _kind = available.first.$1);
            });
          }
          final visible = items.where((item) => item['kind'] == _kind).toList();

          return ListView(
            padding: const EdgeInsets.fromLTRB(Gaps.md, Gaps.sm, Gaps.md, Gaps.xxl),
            children: [
              _ShopHero(
                balance: balance,
                plus: plus,
                expanded: _showPlans,
                onToggle: () => setState(() => _showPlans = !_showPlans),
              ),
              if (_showPlans && plans.isNotEmpty) ...[
                Gaps.vSm,
                SizedBox(
                  height: MediaQuery.sizeOf(context).width < 390 ? 330 : 302,
                  child: ListView.separated(
                    scrollDirection: Axis.horizontal,
                    itemCount: plans.length,
                    separatorBuilder: (_, __) => Gaps.hSm,
                    itemBuilder: (_, index) {
                      final plan = plans[index];
                      return _PlanCard(
                        plan: plan,
                        activeTier: '${plus['tier'] ?? ''}',
                        busy: _busy == 'plus-${plan['billingCycle']}',
                        onBuy: () => _buyPlan(plan, balance),
                      );
                    },
                  ),
                ),
              ],
              Gaps.vSm,
              SizedBox(
                height: 44,
                child: ListView.separated(
                  scrollDirection: Axis.horizontal,
                  itemCount: available.length,
                  separatorBuilder: (_, __) => Gaps.hXxs,
                  itemBuilder: (_, index) {
                    final category = available[index];
                    return ChoiceChip(
                      selected: _kind == category.$1,
                      avatar: Icon(category.$3, size: 17),
                      label: Text(category.$2),
                      onSelected: (_) => setState(() => _kind = category.$1),
                    );
                  },
                ),
              ),
              Gaps.vSm,
              _CategoryShelf(
                title: available.any((c) => c.$1 == _kind)
                    ? available.firstWhere((c) => c.$1 == _kind).$2
                    : 'فروشگاه',
                items: visible,
                balance: balance,
                busy: _busy,
                onBuy: _buyItem,
                onEquip: _equip,
              ),
              Gaps.vSm,
              const Padding(
                padding: EdgeInsets.symmetric(horizontal: 5),
                child: Text(
                  'همه قیمت‌ها تومان است. خریدهای مستقیم دائمی‌اند؛ آیتم‌ها فقط ظاهری‌اند و شانس برد یا امتیاز را تغییر نمی‌دهند.',
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 9.5, color: Colors.white54, height: 1.5),
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

class _ShopHero extends StatelessWidget {
  const _ShopHero({
    required this.balance,
    required this.plus,
    required this.expanded,
    required this.onToggle,
  });
  final int balance;
  final Map<String, dynamic> plus;
  final bool expanded;
  final VoidCallback onToggle;

  @override
  Widget build(BuildContext context) {
    final active = plus['active'] == true;
    return Container(
      padding: const EdgeInsets.all(15),
      decoration: BoxDecoration(
        borderRadius: Corners.rXl,
        gradient: const LinearGradient(
          begin: Alignment.topRight,
          end: Alignment.bottomLeft,
          colors: [Color(0xFF102A43), Color(0xFF11172E), Color(0xFF35154C)],
        ),
        border: Border.all(color: const Color(0xFFFFD166).withValues(alpha: .35)),
        boxShadow: const [BoxShadow(color: Color(0x55000000), blurRadius: 24, offset: Offset(0, 10))],
      ),
      child: Row(
        children: [
          Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: const Color(0xFFFFD166).withValues(alpha: .14),
            ),
            child: Icon(active ? Icons.star_rounded : Icons.storefront_rounded,
                color: const Color(0xFFFFD166)),
          ),
          Gaps.hSm,
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('فروشگاه قلقلی پلاس',
                    style: TextStyle(fontSize: 17, fontWeight: FontWeight.w900)),
                Text(
                  active
                      ? 'پلاس ${plus['tier'] == 'annual' ? 'سالانه' : 'ماهانه'} فعال است'
                      : 'ظاهر حرفه‌ای، رقابت کاملاً منصفانه',
                  style: const TextStyle(fontSize: 10.5, color: Colors.white60),
                ),
                Text('کیف پول: ${Money.withUnit(balance)}',
                    style: const TextStyle(fontSize: 11, color: Color(0xFF22E7A6), fontWeight: FontWeight.w900)),
              ],
            ),
          ),
          IconButton(
            tooltip: expanded ? 'جمع کردن پلن‌ها' : 'نمایش پلن‌ها',
            onPressed: onToggle,
            icon: Icon(expanded ? Icons.expand_less_rounded : Icons.expand_more_rounded),
          ),
        ],
      ),
    );
  }
}

class _PlanCard extends StatelessWidget {
  const _PlanCard({
    required this.plan,
    required this.activeTier,
    required this.busy,
    required this.onBuy,
  });
  final Map<String, dynamic> plan;
  final String activeTier;
  final bool busy;
  final VoidCallback onBuy;

  @override
  Widget build(BuildContext context) {
    final annual = plan['billingCycle'] == 'annual';
    final active = activeTier == plan['billingCycle'];
    final benefits = ((plan['benefits'] as List?) ?? const []).take(annual ? 9 : 5);
    return SizedBox(
      width: 300,
      child: AppCard(
        color: annual ? const Color(0xFF2D2340) : const Color(0xFF101D2B),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(children: [
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(annual ? 'بیشترین ارزش' : 'انعطاف ماهانه',
                    style: const TextStyle(fontSize: 9, color: Colors.white54)),
                Text('${plan['label']}',
                    style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w900)),
              ])),
              if (annual)
                const _Pill(text: 'حدود ۳۰٪ تخفیف', color: Color(0xFFFFD166))
              else if (active)
                const _Pill(text: 'فعال', color: Color(0xFF22E7A6)),
            ]),
            Gaps.vXs,
            Text(Money.withUnit(plan['price']),
                style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w900, color: Color(0xFFFFD166))),
            if (annual)
              Text('به‌جای ${Money.withUnit(59000 * 12)} پرداخت ماهانه',
                  style: const TextStyle(fontSize: 9, color: Colors.white54)),
            Gaps.vXs,
            Expanded(
              child: SingleChildScrollView(
                physics: const NeverScrollableScrollPhysics(),
                child: Wrap(
                  runSpacing: 4,
                  children: [
                    for (final benefit in benefits)
                      SizedBox(
                        width: double.infinity,
                        child: Text('✓ $benefit',
                            style: const TextStyle(fontSize: 9.5, height: 1.35, color: Colors.white70)),
                      ),
                  ],
                ),
              ),
            ),
            FilledButton.icon(
              onPressed: busy ? null : onBuy,
              icon: busy
                  ? const SizedBox.square(dimension: 15, child: CircularProgressIndicator(strokeWidth: 2))
                  : const Icon(Icons.auto_awesome_rounded, size: 17),
              label: Text(active ? 'تمدید همین پلن' : 'خرید ${plan['label']}'),
              style: FilledButton.styleFrom(
                backgroundColor: annual ? const Color(0xFFFFD166) : const Color(0xFF38BDF8),
                foregroundColor: const Color(0xFF071522),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _CategoryShelf extends StatelessWidget {
  const _CategoryShelf({
    required this.title,
    required this.items,
    required this.balance,
    required this.busy,
    required this.onBuy,
    required this.onEquip,
  });
  final String title;
  final List<Map<String, dynamic>> items;
  final int balance;
  final String? busy;
  final void Function(Map<String, dynamic>, int) onBuy;
  final void Function(Map<String, dynamic>) onEquip;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(11),
      decoration: BoxDecoration(
        borderRadius: Corners.rXl,
        color: const Color(0xAA071522),
        border: Border.all(color: Colors.white10),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            Expanded(child: Text(title,
                style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w900))),
            Text('${faNum(items.length)} انتخاب · ورق بزن',
                style: const TextStyle(fontSize: 9.5, color: Colors.white54)),
          ]),
          Gaps.vXs,
          SizedBox(
            height: 300,
            child: items.isEmpty
                ? const Center(child: Text('آیتمی در این دسته نیست.'))
                : ListView.separated(
                    scrollDirection: Axis.horizontal,
                    itemCount: items.length,
                    separatorBuilder: (_, __) => Gaps.hSm,
                    itemBuilder: (_, index) {
                      final item = items[index];
                      return _ProductCard(
                        item: item,
                        busy: busy == 'buy-${item['id']}' || busy == 'equip-${item['id']}',
                        onBuy: () => onBuy(item, balance),
                        onEquip: () => onEquip(item),
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }
}

class _ProductCard extends StatelessWidget {
  const _ProductCard({
    required this.item,
    required this.busy,
    required this.onBuy,
    required this.onEquip,
  });
  final Map<String, dynamic> item;
  final bool busy;
  final VoidCallback onBuy;
  final VoidCallback onEquip;

  @override
  Widget build(BuildContext context) {
    final usable = item['usable'] == true;
    final selected = item['equipped'] == true;
    final owned = item['owned'] == true;
    final annualGift = item['access_tier'] == 'annual';
    return SizedBox(
      width: 235,
      child: Container(
        clipBehavior: Clip.antiAlias,
        decoration: BoxDecoration(
          borderRadius: Corners.rXl,
          gradient: const LinearGradient(
            begin: Alignment.topRight,
            end: Alignment.bottomLeft,
            colors: [Color(0xFF17273A), Color(0xFF0B1522)],
          ),
          border: Border.all(
            color: selected ? const Color(0xFF22E7A6) : Colors.white12,
            width: selected ? 1.8 : 1,
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Expanded(child: _ProductArt(item: item)),
            Padding(
              padding: const EdgeInsets.all(10),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(children: [
                    Expanded(child: Text('${item['name']}',
                        maxLines: 1, overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w900))),
                    if (selected) const _Pill(text: 'فعال', color: Color(0xFF22E7A6)),
                  ]),
                  const SizedBox(height: 3),
                  Text('${item['description'] ?? ''}',
                      maxLines: 2, overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 9.5, height: 1.35, color: Colors.white54)),
                  Gaps.vXs,
                  Row(children: [
                    Expanded(child: Text(
                      annualGift ? 'هدیه سالانه' : owned ? 'خریداری‌شده' : Money.withUnit(item['price']),
                      style: const TextStyle(fontSize: 10.5, color: Color(0xFFFFD166), fontWeight: FontWeight.w900),
                    )),
                    if (usable)
                      FilledButton(
                        onPressed: busy || selected ? null : onEquip,
                        style: FilledButton.styleFrom(
                          minimumSize: const Size(68, 34),
                          padding: const EdgeInsets.symmetric(horizontal: 10),
                          visualDensity: VisualDensity.compact,
                        ),
                        child: Text(selected ? 'فعال' : 'انتخاب', style: const TextStyle(fontSize: 10)),
                      )
                    else if (!annualGift)
                      FilledButton(
                        onPressed: busy ? null : onBuy,
                        style: FilledButton.styleFrom(
                          minimumSize: const Size(60, 34),
                          padding: const EdgeInsets.symmetric(horizontal: 10),
                          visualDensity: VisualDensity.compact,
                        ),
                        child: busy
                            ? const SizedBox.square(dimension: 13, child: CircularProgressIndicator(strokeWidth: 2))
                            : const Text('خرید', style: TextStyle(fontSize: 10)),
                      )
                    else
                      const Icon(Icons.lock_rounded, size: 17, color: Colors.white38),
                  ]),
                  if (item['unlockedByPlus'] == true && !owned)
                    const Text('با پلاس در دسترس است',
                        style: TextStyle(fontSize: 8.5, color: Color(0xFF38BDF8))),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ProductArt extends StatelessWidget {
  const _ProductArt({required this.item});
  final Map<String, dynamic> item;

  List<Color> get colors {
    final metadata = item['metadata'];
    final palette = metadata is Map && metadata['palette'] is List
        ? metadata['palette'] as List
        : const [];
    final parsed = palette.map((raw) => _hex('$raw')).whereType<Color>().toList();
    if (parsed.length >= 2) return parsed;
    return const [Color(0xFF38BDF8), Color(0xFF7C3AED)];
  }

  Color? _hex(String raw) {
    final clean = raw.replaceAll('#', '');
    if (clean.length != 6) return null;
    return Color(int.parse('FF$clean', radix: 16));
  }

  @override
  Widget build(BuildContext context) {
    final kind = '${item['kind']}';
    final value = '${item['payload'] ?? item['slug'] ?? ''}';
    Widget content;
    if (kind == 'club_badge') {
      content = Image.asset(
        clubAsset(value), width: 78, height: 78, fit: BoxFit.contain, cacheWidth: 220,
        errorBuilder: (_, __, ___) => const Icon(Icons.shield_rounded, size: 58),
      );
    } else if (kind == 'name_color') {
      content = ShaderMask(
        shaderCallback: (bounds) => LinearGradient(colors: colors).createShader(bounds),
        child: const Text('قلقلی', style: TextStyle(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w900)),
      );
    } else {
      final icon = switch (kind) {
        'card_frame' => Icons.shield_rounded,
        'profile_background' => Icons.person_rounded,
        'result_template' => Icons.emoji_events_rounded,
        'match_effect' => Icons.celebration_rounded,
        'emote_pack' => Icons.forum_rounded,
        _ => Icons.auto_awesome_rounded,
      };
      content = Icon(icon, size: 58, color: Colors.white);
    }
    return DecoratedBox(
      decoration: BoxDecoration(
        gradient: RadialGradient(
          center: const Alignment(.55, -.6),
          radius: 1.25,
          colors: [colors.last.withValues(alpha: .62), colors.first.withValues(alpha: .18), const Color(0xFF071522)],
        ),
        border: Border(bottom: BorderSide(color: colors.first.withValues(alpha: .42))),
      ),
      child: Center(
        child: Container(
          width: 112,
          height: 92,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(26),
            border: Border.all(color: colors.first.withValues(alpha: .72), width: 2.5),
            boxShadow: [BoxShadow(color: colors.last.withValues(alpha: .25), blurRadius: 20)],
          ),
          child: content,
        ),
      ),
    );
  }
}

class _Pill extends StatelessWidget {
  const _Pill({required this.text, required this.color});
  final String text;
  final Color color;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
    decoration: BoxDecoration(
      color: color.withValues(alpha: .15),
      borderRadius: Corners.rPill,
      border: Border.all(color: color.withValues(alpha: .35)),
    ),
    child: Text(text,
        style: TextStyle(fontSize: 8.5, fontWeight: FontWeight.w900, color: color)),
  );
}
