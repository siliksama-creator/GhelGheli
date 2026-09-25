// صفحهٔ «کلکسیون من» — خانهٔ واقعیِ کارت‌های کاربر.
//
// ═══════════════════════════════════════════════════════════════════════════
// چرا این صفحه ساخته شد
// ═══════════════════════════════════════════════════════════════════════════
//
// گزارش مالک: «کاربر ممکنه نزدیک به ۵۰ نوع کارت مختلف ثبت کنه، الان
// جایگاهش زیاد جذابیت نداره و ترتیب خوبی نداره».
//
// وضعیتِ قبلی یک `ListView` **افقی** با ارتفاع ۲۲۲ پیکسل ته داشبورد بود.
// برای سه کارت خوب بود؛ برای پنجاه تا فاجعه:
//
//   • دیدنِ کارتِ پنجاهم یعنی چهل‌ونه بار سوایپ. عملاً کسی تهش نمی‌رسید.
//   • هیچ راهی برای پیدا کردنِ یک کارتِ خاص نبود — نه جست‌وجو، نه ترتیب.
//   • ترتیب همیشه الفبایی بود، پس کارتی که همین الان ثبت شده وسطِ لیست
//     گم می‌شد و کاربر بازخوردِ «ثبت شد» را نمی‌دید.
//   • ارزشِ کلکسیون هیچ‌جا دیده نمی‌شد. کاربر نمی‌دانست چقدر جمع کرده.
//
// ═══════════════════════════════════════════════════════════════════════════
// تصمیم‌های طراحی
// ═══════════════════════════════════════════════════════════════════════════
//
// ۱. **گرید به‌جای نوارِ افقی.** اسکرولِ عمودی طبیعی است و در یک نگاه
//    شش کارت دیده می‌شود به‌جای دو تا.
//
// ۲. **نوارِ آمار بالای صفحه.** «۵۰ نوع · ۱۲۰ کارت · ۸۴٬۰۰۰ امتیاز».
//    کلکسیون وقتی جذاب است که کاربر رشدش را ببیند.
//
// ۳. **جست‌وجو + سه ترتیب** (تازه‌ترین، باارزش‌ترین، الفبا). پیش‌فرض
//    «تازه‌ترین» است چون بلافاصله بعد از ثبتِ کارت، کاربر همان را
//    می‌خواهد ببیند.
//
// ۴. **نشانِ «جدید»** روی کارت‌هایی که در ۴۸ ساعت گذشته اضافه شده‌اند.
//
// ۵. داشبورد **کوتاه** شد: فقط شش کارتِ آخر به‌عنوان پیش‌نمایش، با دکمهٔ
//    «همه». صفحهٔ اصلی نباید با پنجاه کارت شلوغ شود.
import 'package:flutter/material.dart';

import '../../api_client.dart';
import '../../theme/tokens.dart';
import '../../widgets/app_card.dart';
import '../../widgets/player_card.dart'; // RarityCardFrame shared with detail/duel
import '../../widgets/state_views.dart';
import '../../widgets/rarity_card_frame.dart';
import '../shared/card_detail_sheet.dart';

/// ترتیب‌های ممکن. پیش‌فرض `recent` است — توضیح بالا.
enum InvSort { recent, value, name }

const _sortLabels = {
  InvSort.recent: 'تازه‌ترین',
  InvSort.value: 'باارزش‌ترین',
  InvSort.name: 'الفبا',
};

/// کارت در ۴۸ ساعت گذشته اضافه شده؟
///
/// چرا ۴۸ و نه ۲۴: کاربری که شب کارت ثبت می‌کند و فردا شب اپ را باز
/// می‌کند، باید هنوز نشانِ «جدید» را ببیند. با ۲۴ ساعت دقیقاً همان کاربر
/// از قلم می‌افتاد.
bool isNewCard(Map<String, dynamic> item) {
  final raw = item['updated_at'] ?? item['created_at'];
  if (raw == null) return false;
  final t = DateTime.tryParse('$raw');
  if (t == null) return false;
  return DateTime.now().difference(t).inHours < 48;
}

int _asInt(dynamic v) =>
    v is int ? v : int.tryParse('${v ?? 0}'.split('.').first) ?? 0;

DateTime _sortDate(Map<String, dynamic> m) =>
    DateTime.tryParse('${m['updated_at'] ?? m['created_at'] ?? ''}') ??
    DateTime.fromMillisecondsSinceEpoch(0);

/// مرتب‌سازی و فیلترِ خالص — جدا از ویجت تا مستقیم تست شود.
List<Map<String, dynamic>> filterAndSort(
  List<Map<String, dynamic>> items, {
  String query = '',
  InvSort sort = InvSort.recent,
}) {
  final q = query.trim().toLowerCase();
  final out = q.isEmpty
      ? [...items]
      : items
          .where((m) => '${m['name'] ?? ''}'.toLowerCase().contains(q))
          .toList();
  switch (sort) {
    case InvSort.recent:
      // ── چرا ترتیبِ دوم لازم است ──
      // چند کارت می‌توانند دقیقاً یک زمان داشته باشند (ثبتِ دسته‌ای، یا
      // دقتِ ثانیه‌ایِ دیتابیس). بدون شکستنِ تساوی، ترتیبشان بین دو
      // بارگذاری عوض می‌شود و کاربر فکر می‌کند لیست می‌پرد.
      out.sort((a, b) {
        final c = _sortDate(b).compareTo(_sortDate(a));
        return c != 0 ? c : '${a['name']}'.compareTo('${b['name']}');
      });
    case InvSort.value:
      out.sort((a, b) {
        final c = _asInt(b['point_value']).compareTo(_asInt(a['point_value']));
        return c != 0 ? c : '${a['name']}'.compareTo('${b['name']}');
      });
    case InvSort.name:
      out.sort((a, b) => '${a['name']}'.compareTo('${b['name']}'));
  }
  return out;
}

/// جمعِ آمارِ کلکسیون. خالص، تا تست بتواند مستقیم بسنجد.
({int kinds, int total, int points}) collectionStats(
    List<Map<String, dynamic>> items) {
  var total = 0;
  var points = 0;
  for (final m in items) {
    final q = _asInt(m['quantity']);
    total += q;
    // امتیازِ هر نسخه ضرب در تعداد — کاربری که سه تا از یک کارت دارد،
    // سه برابر امتیاز گرفته.
    points += q * _asInt(m['point_value']);
  }
  return (kinds: items.length, total: total, points: points);
}

class InventoryPage extends StatefulWidget {
  const InventoryPage({
    super.key,
    required this.items,
    this.grants = const [],
    this.api,
    this.onRefresh,
    this.header,
  });

  final List<Map<String, dynamic>> items;
  final List<Map<String, dynamic>> grants;
  final ApiClient? api;
  final Future<void> Function()? onRefresh;

  /// سرصفحهٔ اختیاریِ بالای فهرست، **داخلِ همین اسکرول**.
  ///
  /// ── چرا این پارامتر وجود دارد ────────────────────────────────────────
  ///
  /// تبِ «ثبت کارت» زیرِ فرمش یک کادرِ راهنما دارد که متنش زنده است و
  /// ادمین هر لحظه می‌تواند بلندترش کند. نسخهٔ اولِ آن کادر فرزندِ ثابتِ
  /// `Column`ِ بیرونی بود؛ با جملهٔ دوم ارتفاعِ بخشِ ثابت از فضای صفحه
  /// بیشتر شد و روی صفحهٔ کوتاه `RenderFlex` سرریز کرد (`home_shell_test`
  /// و `navigation_test`: overflow ۷ پیکسل). کوتاه‌کردنِ متن تعمیرِ شکننده
  /// بود (فردا ادمین دوباره بلندش می‌کند)؛ پس کادر داخلِ همین اسکرول
  /// نشست: هر طولی امن است و کاربر با اسکرولِ همان فهرست می‌بیندش.
  final Widget? header;

  @override
  State<InventoryPage> createState() => _InventoryPageState();
}

class _InventoryPageState extends State<InventoryPage> {
  final _search = TextEditingController();
  InvSort _sort = InvSort.recent;
  String? _rarity;

  /// اندازهٔ هر صفحهٔ کلکسیون — آینهٔ `PAGE_SIZE` در
  /// `userweb/src/screens/Inventory.jsx`.
  static const int _pageSize = 24;
  int _page = 1;

  @override
  void dispose() {
    // بدون این، هر بار که کاربر صفحه را می‌بندد یک کنترلر نشت می‌کند.
    _search.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    var shown =
        filterAndSort(widget.items, query: _search.text, sort: _sort);
    if (_rarity != null) {
      shown = shown.where((item) => cardRarityOf(item) == _rarity).toList();
    }
    final stats = collectionStats(widget.items);

    // ── صفحه‌بندی ──
    //
    // خواستهٔ مالک: کلکسیون نباید بی‌انتها طولانی شود. `_page` با هر
    // تغییرِ فیلتر ریست می‌شود؛ `clamp` از حالتِ «صفحهٔ ۷ از نتیجه‌ای که
    // ۲ صفحه دارد» جلوگیری می‌کند که فهرستِ خالی نشان می‌داد.
    final pageCount =
        shown.isEmpty ? 1 : ((shown.length - 1) ~/ _pageSize) + 1;
    final safePage = _page.clamp(1, pageCount);
    final pageItems = shown.isEmpty
        ? const <Map<String, dynamic>>[]
        : shown.sublist(
            (safePage - 1) * _pageSize,
            ((safePage) * _pageSize).clamp(0, shown.length),
          );

    final body = CustomScrollView(
      slivers: [
        if (widget.header != null) SliverToBoxAdapter(child: widget.header!),
        SliverToBoxAdapter(
          child: Padding(
            // با سرصفحه، فاصلهٔ بالای نوارِ آمار کم می‌شود؛ وگرنه دو فاصلهٔ
            // ۱۶ پیکسلی روی هم می‌افتاد و کادر شلخته می‌شد.
            padding: EdgeInsets.fromLTRB(Gaps.md,
                widget.header == null ? Gaps.md : Gaps.xs, Gaps.md, Gaps.xs),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _StatsStrip(stats: stats),
                if (widget.grants.isNotEmpty && widget.api != null) ...[
                  Gaps.vMd,
                  _PendingChests(
                    api: widget.api!,
                    grants: widget.grants,
                    onOpened: widget.onRefresh,
                  ),
                ],
                Gaps.vMd,
                // ── جست‌وجو فقط وقتی معنا دارد که چیزی برای گشتن باشد ──
                // زیر ۸ کارت، نوارِ جست‌وجو فقط فضا می‌گیرد.
                if (widget.items.length >= 8) ...[
                  TextField(
                    controller: _search,
                    onChanged: (_) => setState(() => _page = 1),
                    textInputAction: TextInputAction.search,
                    decoration: InputDecoration(
                      hintText: 'جست‌وجو در کارت‌ها…',
                      prefixIcon: const Icon(Icons.search_rounded, size: 20),
                      isDense: true,
                      suffixIcon: _search.text.isEmpty
                          ? null
                          : IconButton(
                              icon: const Icon(Icons.close_rounded, size: 18),
                              onPressed: () => setState(() {
                                _search.clear();
                                _page = 1;
                              }),
                            ),
                    ),
                  ),
                  Gaps.vSm,
                ],
                if (widget.items.length >= 2)
                  SizedBox(
                    height: 34,
                    child: ListView(
                      scrollDirection: Axis.horizontal,
                      children: [
                        for (final s in InvSort.values) ...[
                          ChoiceChip(
                            label: Text(_sortLabels[s]!),
                            selected: _sort == s,
                            onSelected: (_) => setState(() {
                              _sort = s;
                              _page = 1;
                            }),
                            visualDensity: VisualDensity.compact,
                            labelStyle: theme.textTheme.labelMedium,
                          ),
                          Gaps.hXs,
                        ],
                        const SizedBox(width: 8),
                        ChoiceChip(
                          label: const Text('همه کلاس‌ها'),
                          selected: _rarity == null,
                          onSelected: (_) => setState(() {
                            _rarity = null;
                            _page = 1;
                          }),
                          visualDensity: VisualDensity.compact,
                        ),
                        Gaps.hXs,
                        for (final rarity in rarityLabels.keys) ...[
                          ChoiceChip(
                            label: Text(rarityLabels[rarity]!),
                            selected: _rarity == rarity,
                            onSelected: (_) => setState(() {
                              _rarity = rarity;
                              _page = 1;
                            }),
                            visualDensity: VisualDensity.compact,
                          ),
                          Gaps.hXs,
                        ],
                      ],
                    ),
                  ),
              ],
            ),
          ),
        ),
        if (shown.isEmpty)
          SliverFillRemaining(
            hasScrollBody: false,
            child: Padding(
              padding: const EdgeInsets.all(Gaps.md),
              child: AppCard(
                child: EmptyState(
                  icon: widget.items.isEmpty
                      ? Icons.style_outlined
                      : Icons.search_off_rounded,
                  title: widget.items.isEmpty
                      ? 'هنوز کارتی در کلکسیون شما نیست'
                      : 'کارتی با این نام پیدا نشد',
                  message: widget.items.isEmpty
                      ? 'یک کد کارت را ثبت کن یا از کارتت عکس بگیر تا اینجا نمایش داده شود.'
                      : 'نام دیگری را امتحان کنید.',
                ),
              ),
            ),
          )
        else
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(
                Gaps.md, Gaps.xs, Gaps.md, Gaps.xxl),
            sliver: SliverGrid(
              gridDelegate:
                  const SliverGridDelegateWithMaxCrossAxisExtent(
                // ── چرا MaxCrossAxisExtent و نه crossAxisCount ثابت ──
                // با عددِ ثابت، روی تبلت کارت‌ها کشیده و زشت می‌شوند و
                // روی گوشیِ باریک له. این نسخه خودش تعداد ستون را از
                // عرضِ موجود درمی‌آورد: ۲ ستون روی گوشی، ۳ تا ۴ روی تبلت.
                maxCrossAxisExtent: 200,
                mainAxisSpacing: Gaps.sm,
                crossAxisSpacing: Gaps.sm,
                childAspectRatio: 0.62,
              ),
              delegate: SliverChildBuilderDelegate(
                (_, i) => InventoryTile(item: pageItems[i]),
                childCount: pageItems.length,
              ),
            ),
          ),
        if (pageCount > 1)
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(
                  Gaps.md, 0, Gaps.md, Gaps.xxl),
              child: _InventoryPager(
                page: safePage,
                pageCount: pageCount,
                total: shown.length,
                onChange: (next) => setState(() => _page = next),
              ),
            ),
          ),
      ],
    );

    return widget.onRefresh == null
        ? body
        : RefreshIndicator(onRefresh: widget.onRefresh!, child: body);
  }
}

/// نوارِ آمارِ کلکسیون.
/// صفحه‌بندیِ کلکسیون — آینهٔ `.invPager` در وب.
class _InventoryPager extends StatelessWidget {
  const _InventoryPager({
    required this.page,
    required this.pageCount,
    required this.total,
    required this.onChange,
  });

  final int page;
  final int pageCount;
  final int total;
  final ValueChanged<int> onChange;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        OutlinedButton(
          onPressed: page <= 1 ? null : () => onChange(page - 1),
          child: const Text('قبلی'),
        ),
        Gaps.hSm,
        Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              'صفحهٔ ${faNum(page)} از ${faNum(pageCount)}',
              style: const TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w800,
                  color: Color(0xFF9FB6D0)),
            ),
            Text(
              '${faNum(total)} کارت',
              style: const TextStyle(
                  fontSize: 11, color: Color(0xFF6F8399)),
            ),
          ],
        ),
        Gaps.hSm,
        OutlinedButton(
          onPressed: page >= pageCount ? null : () => onChange(page + 1),
          child: const Text('بعدی'),
        ),
      ],
    );
  }
}

class _StatsStrip extends StatelessWidget {
  const _StatsStrip({required this.stats});
  final ({int kinds, int total, int points}) stats;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      padding: const EdgeInsets.symmetric(
          horizontal: Gaps.md, vertical: Gaps.sm + 2),
      decoration: BoxDecoration(
        borderRadius: Corners.rXl,
        gradient: LinearGradient(
          begin: Alignment.topRight,
          end: Alignment.bottomLeft,
          colors: [
            theme.colorScheme.primary.withValues(alpha: 0.18),
            theme.colorScheme.secondary.withValues(alpha: 0.14),
          ],
        ),
        border: Border.all(color: Colors.white.withValues(alpha: 0.10)),
      ),
      child: Row(
        children: [
          _stat(context, 'نوع کارت', faNum(stats.kinds)),
          _divider(),
          _stat(context, 'کل کارت‌ها', faNum(stats.total)),
          _divider(),
          _stat(context, 'ارزش', faNum(stats.points)),
        ],
      ),
    );
  }

  Widget _divider() => Container(
      width: 1, height: 26, color: Colors.white.withValues(alpha: 0.14));

  Widget _stat(BuildContext c, String label, String value) {
    final t = Theme.of(c);
    return Expanded(
      child: Column(
        children: [
          Text(value,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: t.textTheme.titleMedium
                  ?.copyWith(fontWeight: FontWeight.w900)),
          Text(label,
              style: t.textTheme.labelSmall
                  ?.copyWith(color: t.colorScheme.onSurfaceVariant)),
        ],
      ),
    );
  }
}

/// کاشیِ کارت در گرید.
///
/// نسبت به `FootballCard` قدیمی عرضِ ثابت ندارد (گرید تعیین می‌کند) و
/// نشانِ «جدید» و تعداد را روی خودِ تصویر می‌گذارد تا فضای متنیِ زیر کارت
/// کمتر شود — با ۵۰ کارت، هر پیکسل مهم است.
class InventoryTile extends StatelessWidget {
  const InventoryTile({super.key, required this.item});
  final Map<String, dynamic> item;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final imageValue = item['image_url'] ?? item['imageUrl'];
    final fresh = isNewCard(item);
    return Stack(
      children: [
        PlayerCard(
          card: {
            ...item,
            'image_url': imageValue,
          },
          onTap: () => showCardDetail(context, item),
        ),
        if (fresh)
          Positioned(
            top: 10,
            left: 10,
            child: _Chip(
              text: 'جدید',
              bg: theme.colorScheme.primary,
              fg: theme.colorScheme.onPrimary,
            ),
          ),
      ],
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip({required this.text, required this.bg, required this.fg});
  final String text;
  final Color bg;
  final Color fg;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
        decoration: BoxDecoration(
            color: bg, borderRadius: BorderRadius.circular(999)),
        child: Text(text,
            style: TextStyle(
                color: fg, fontSize: 10.5, fontWeight: FontWeight.w900)),
      );
}

class _PendingChests extends StatefulWidget {
  const _PendingChests({
    required this.api,
    required this.grants,
    this.onOpened,
  });
  final ApiClient api;
  final List<Map<String, dynamic>> grants;
  final Future<void> Function()? onOpened;

  @override
  State<_PendingChests> createState() => _PendingChestsState();
}

class _PendingChestsState extends State<_PendingChests> {
  String? _busy;

  Future<void> _open(String id) async {
    if (_busy != null) return;
    setState(() => _busy = id);
    try {
      final r = await widget.api.post('/api/grants/$id/open', const {});
      if (!mounted) return;
      final cards = (r is Map ? r['cards'] as List? : null) ?? const [];
      final names = cards
          .whereType<Map>()
          .map((c) => '${c['name'] ?? 'کارت'}')
          .join('، ');
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(names.isEmpty ? 'صندوق باز شد' : 'صندوق باز شد: $names'),
      ));
      await widget.onOpened?.call();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(apiError(e))));
      }
    } finally {
      if (mounted) setState(() => _busy = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(Gaps.md),
      decoration: BoxDecoration(
        borderRadius: Corners.rXl,
        border: Border.all(color: const Color(0xFFFFD166).withValues(alpha: 0.55)),
        gradient: const LinearGradient(
          colors: [Color(0xFF2A1140), Color(0xFF0D1B2C)],
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text('صندوق کارت برنده‌ای',
              style: TextStyle(
                  color: Color(0xFFFFD166),
                  fontWeight: FontWeight.w900,
                  fontSize: 14)),
          const SizedBox(height: 4),
          const Text(
            'جایزهٔ گردونه یا لیگ — بازش کن تا پنج کارت تصادفی بگیری.',
            style: TextStyle(fontSize: 11.5, color: Color(0xFFCBD5E1)),
          ),
          Gaps.vSm,
          for (final g in widget.grants)
            Padding(
              padding: const EdgeInsets.only(bottom: 6),
              child: FilledButton(
                onPressed: _busy != null ? null : () => _open('${g['id']}'),
                style: FilledButton.styleFrom(
                  backgroundColor: const Color(0xFFFFD166),
                  foregroundColor: const Color(0xFF1A0F02),
                ),
                child: Text(_busy == '${g['id']}'
                    ? 'در حال باز کردن…'
                    : '${g['label'] ?? 'باز کردن صندوق'}'),
              ),
            ),
        ],
      ),
    );
  }
}
