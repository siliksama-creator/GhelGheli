// گذر نبرد فصلی — «مسیر قلقلی»
//
// ═══════════════════════════════════════════════════════════════════════════
// چرا این صفحه این شکلی است
// ═══════════════════════════════════════════════════════════════════════════
//
// خواستهٔ مالک: «یه جایگاه زیبا مناسب بزار هم تو چشم باشن و هم فارسی برای
// کاربر قابل فهم باشه».
//
// سه تصمیم که از همین جمله در آمد:
//
// ۱. دو ردیفِ موازی، نه یک لیست.
//    مسیر رایگان بالا، مسیر پلاس پایین، پله‌ها کنار هم. کاربر در یک نگاه
//    می‌بیند در هر پله **چه چیزی را از دست می‌دهد** اگر پلاس نخرد. اگر
//    جوایز پلاس پنهان بودند، هیچ دلیلی برای خرید وجود نداشت.
//
// ۲. اسکرول افقی.
//    ۵۰ پله در عرض یک موبایل جا نمی‌شود. این همان الگویی است که کاربر از
//    بازی‌های دیگر می‌شناسد، پس نیاز به آموزش ندارد.
//
// ۳. بدون اصطلاح فنی.
//    هیچ‌جا «XP» نوشته نشده. به‌جایش نوار پیشرفت و «تا پلهٔ بعد: ۴۰ امتیاز
//    تجربه» — عددی که مستقیم قابل فهم است.
import 'package:flutter/material.dart';

import '../../api_client.dart';
import '../../core/assets.dart';
import '../../theme/tokens.dart';
import '../../widgets/app_card.dart';
import '../../widgets/state_views.dart';

class PassPage extends StatefulWidget {
  const PassPage({
    super.key,
    required this.api,
    required this.onOpenShop,
    this.onChanged,
  });

  final ApiClient api;
  final VoidCallback onOpenShop;

  /// بعد از دریافت جایزه صدا زده می‌شود تا امتیاز/چرخشِ نوار بالا تازه شود.
  final VoidCallback? onChanged;

  @override
  State<PassPage> createState() => _PassPageState();
}

class _PassPageState extends State<PassPage> {
  Map<String, dynamic>? _data;
  bool _loading = true;
  bool _busy = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final d = await widget.api.get('/api/pass', fresh: true);
      if (!mounted) return;
      if (d is! Map) {
        setState(() {
          _error = 'پاسخ سرور نامعتبر بود';
          _loading = false;
        });
        return;
      }
      setState(() {
        _data = Map<String, dynamic>.from(d);
        _error = null;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = apiError(e);
        _loading = false;
      });
    }
  }

  Future<void> _claim(String tierId) async {
    setState(() => _busy = true);
    try {
      final r = await widget.api.post('/api/pass/claim/$tierId', {});
      if (!mounted) return;
      _toast(r is Map ? '${r['message'] ?? 'جایزه دریافت شد'}' : 'جایزه دریافت شد');
      widget.onChanged?.call();
      await _load();
    } catch (e) {
      if (mounted) _toast(apiError(e), error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _claimAll() async {
    setState(() => _busy = true);
    try {
      final r = await widget.api.post('/api/pass/claim-all', {});
      if (!mounted) return;
      _toast(r is Map ? '${r['message'] ?? 'دریافت شد'}' : 'دریافت شد');
      widget.onChanged?.call();
      await _load();
    } catch (e) {
      if (mounted) _toast(apiError(e), error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _toast(String text, {bool error = false}) {
    ScaffoldMessenger.maybeOf(context)?.showSnackBar(SnackBar(
      content: Text(text),
      behavior: SnackBarBehavior.floating,
      backgroundColor: error ? Theme.of(context).colorScheme.error : null,
    ));
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const LoadingView();
    if (_error != null && _data == null) {
      return RefreshIndicator(
        onRefresh: () async => _load(),
        child: ListView(
          padding: const EdgeInsets.all(Gaps.lg),
          children: [
            const SizedBox(height: 40),
            ErrorBanner(message: _error!, onRetry: _load),
          ],
        ),
      );
    }

    final d = _data ?? const {};
    if (d['active'] != true) {
      return ListView(
        padding: const EdgeInsets.all(Gaps.lg),
        children: const [
          AppCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('🏅 گذر نبرد',
                    style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900)),
                Gaps.vXs,
                Text('الان فصلی فعال نیست. به‌زودی برمی‌گردیم!'),
              ],
            ),
          ),
        ],
      );
    }

    final season = Map<String, dynamic>.from(d['season'] as Map? ?? {});
    final tiers = (d['tiers'] as List? ?? const [])
        .whereType<Map>()
        .map((e) => Map<String, dynamic>.from(e))
        .toList();
    final tier = NumberParser.toInt(d['tier']);
    final tierCount = NumberParser.toInt(d['tierCount']);
    final into = NumberParser.toInt(d['intoTier']);
    final needs = NumberParser.toInt(d['tierNeeds']);
    final claimable = NumberParser.toInt(d['claimable']);
    final hasPlus = d['hasPlus'] == true;
    final pct = needs > 0 ? (into / needs).clamp(0.0, 1.0) : 1.0;

    return RefreshIndicator(
      onRefresh: () async => _load(),
      child: ListView(
        padding: const EdgeInsets.all(Gaps.md),
        children: [
          _Header(
            title: '${season['name'] ?? 'فصل جاری'}',
            daysLeft: NumberParser.toInt(season['daysLeft']),
            tier: tier,
            tierCount: tierCount,
            progress: pct,
            remaining: (needs - into).clamp(0, needs),
            hasPlus: hasPlus,
            claimable: claimable,
            busy: _busy,
            onOpenShop: widget.onOpenShop,
            onClaimAll: _claimAll,
          ),
          Gaps.vMd,
          _Track(tiers: tiers, busy: _busy, onClaim: _claim),
          Gaps.vMd,
          _HowTo(sources: (d['sources'] as List? ?? const [])
              .whereType<Map>()
              .map((e) => Map<String, dynamic>.from(e))
              .toList()),
        ],
      ),
    );
  }
}

// ── سربرگ فصل ────────────────────────────────────────────────────────────
class _Header extends StatelessWidget {
  const _Header({
    required this.title,
    required this.daysLeft,
    required this.tier,
    required this.tierCount,
    required this.progress,
    required this.remaining,
    required this.hasPlus,
    required this.claimable,
    required this.busy,
    required this.onOpenShop,
    required this.onClaimAll,
  });

  final String title;
  final int daysLeft, tier, tierCount, remaining, claimable;
  final double progress;
  final bool hasPlus, busy;
  final VoidCallback onOpenShop, onClaimAll;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('🏅 $title',
                        style: theme.textTheme.titleLarge
                            ?.copyWith(fontWeight: FontWeight.w900)),
                    Gaps.vXxs,
                    Text('${faNum(daysLeft)} روز تا پایان فصل',
                        style: theme.textTheme.bodySmall),
                  ],
                ),
              ),
              Gaps.hSm,
              // نشانِ پلهٔ فعلی: بزرگ و روشن، چون اولین چیزی است که کاربر
              // می‌خواهد بداند.
              Container(
                padding: const EdgeInsets.symmetric(
                    horizontal: Gaps.sm, vertical: Gaps.xs),
                decoration: BoxDecoration(
                  color: theme.colorScheme.primary.withValues(alpha: 0.14),
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(
                      color: theme.colorScheme.primary.withValues(alpha: 0.45)),
                ),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(faNum(tier),
                        style: TextStyle(
                            fontSize: 24,
                            height: 1,
                            fontWeight: FontWeight.w900,
                            color: theme.colorScheme.primary)),
                    Text('از ${faNum(tierCount)}',
                        style: theme.textTheme.labelSmall),
                  ],
                ),
              ),
            ],
          ),
          Gaps.vMd,
          ClipRRect(
            borderRadius: BorderRadius.circular(999),
            child: TweenAnimationBuilder<double>(
              tween: Tween(begin: 0, end: progress),
              duration: const Duration(milliseconds: 650),
              curve: Curves.easeOutCubic,
              builder: (_, v, __) => LinearProgressIndicator(
                value: v,
                minHeight: 12,
                backgroundColor:
                    theme.colorScheme.onSurface.withValues(alpha: 0.08),
              ),
            ),
          ),
          Gaps.vXs,
          Text(
            tier >= tierCount
                ? '🎉 کل مسیر را تمام کردی!'
                : 'تا پلهٔ بعد: ${faNum(remaining)} امتیاز تجربه',
            style: theme.textTheme.bodyMedium,
          ),
          if (!hasPlus) ...[
            Gaps.vMd,
            Container(
              padding: const EdgeInsets.all(Gaps.sm),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(16),
                color: const Color(0xFFFFD36B).withValues(alpha: 0.10),
                border: Border.all(
                    color: const Color(0xFFFFD36B).withValues(alpha: 0.35)),
              ),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('مسیر پلاس قفل است',
                            style: TextStyle(
                                fontWeight: FontWeight.w900,
                                color: Color(0xFFFFD36B))),
                        Gaps.vXxs,
                        Text('جایزهٔ نقدی، چرخش گردونه و آیتم‌های ویژه',
                            style: theme.textTheme.bodySmall),
                      ],
                    ),
                  ),
                  Gaps.hSm,
                  FilledButton(
                      onPressed: onOpenShop,
                      child: const Text('فعال‌سازی')),
                ],
              ),
            ),
          ],
          if (claimable > 0) ...[
            Gaps.vSm,
            SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                onPressed: busy ? null : onClaimAll,
                icon: const Text('🎁'),
                label: Text('دریافت ${faNum(claimable)} جایزهٔ آماده'),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

// ── مسیر پله‌ها ──────────────────────────────────────────────────────────
class _Track extends StatelessWidget {
  const _Track({required this.tiers, required this.busy, required this.onClaim});

  final List<Map<String, dynamic>> tiers;
  final bool busy;
  final void Function(String tierId) onClaim;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              _dot(const Color(0xFF38BDF8)),
              Text(' رایگان', style: theme.textTheme.labelMedium),
              Gaps.hMd,
              _dot(const Color(0xFFFFD36B)),
              Text(' پلاس', style: theme.textTheme.labelMedium),
            ],
          ),
          Gaps.vSm,
          SizedBox(
            height: 186,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: tiers.length,
              separatorBuilder: (_, __) => const SizedBox(width: 8),
              itemBuilder: (_, i) {
                final row = tiers[i];
                final unlocked = row['unlocked'] == true;
                return Column(
                  children: [
                    _Cell(
                      data: row['free'] as Map?,
                      unlocked: unlocked,
                      busy: busy,
                      onClaim: onClaim,
                    ),
                    const SizedBox(height: 6),
                    Container(
                      width: 78,
                      height: 24,
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(8),
                        color: unlocked
                            ? theme.colorScheme.primary.withValues(alpha: 0.12)
                            : theme.colorScheme.onSurface
                                .withValues(alpha: 0.04),
                      ),
                      child: Text(
                        faNum(NumberParser.toInt(row['tier'])),
                        style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w900,
                            color: unlocked
                                ? theme.colorScheme.primary
                                : theme.colorScheme.onSurface
                                    .withValues(alpha: 0.45)),
                      ),
                    ),
                    const SizedBox(height: 6),
                    _Cell(
                      data: row['plus'] as Map?,
                      unlocked: unlocked,
                      busy: busy,
                      onClaim: onClaim,
                    ),
                  ],
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  static Widget _dot(Color c) => Container(
        width: 10,
        height: 10,
        decoration: BoxDecoration(color: c, shape: BoxShape.circle),
      );
}

/// یک خانهٔ جایزه.
class _Cell extends StatelessWidget {
  const _Cell({
    required this.data,
    required this.unlocked,
    required this.busy,
    required this.onClaim,
  });

  final Map? data;
  final bool unlocked, busy;
  final void Function(String tierId) onClaim;

  static const _icons = {
    'points': '🎯',
    'spins': '🎡',
    'cash': '💰',
    'shop_item': '🎨',
  };

  String _text(Map m) {
    final kind = '${m['kind']}';
    final amount = NumberParser.toInt(m['amount']);
    if (kind == 'points') return '${faNum(amount)} امتیاز';
    if (kind == 'spins') return '${faNum(amount)} چرخش';
    if (kind == 'cash') return '${faNum(amount)} تومان';
    return '${m['label'] ?? 'آیتم ویژه'}';
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final m = data;
    if (m == null) {
      return Opacity(
        opacity: 0.25,
        child: Container(
          width: 78,
          height: 72,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(
                color: theme.colorScheme.onSurface.withValues(alpha: 0.10)),
          ),
          child: const Text('—'),
        ),
      );
    }

    final claimed = m['claimed'] == true;
    final locked = m['locked'] == true;
    final ready = unlocked && !claimed && !locked;

    return Opacity(
      opacity: claimed ? 0.5 : (locked ? 0.6 : 1),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: ready && !busy ? () => onClaim('${m['id']}') : null,
        child: Container(
          width: 78,
          height: 72,
          padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 6),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            // «آمادهٔ دریافت» تنها حالتی است که باید در چشم بزند، چون تنها
            // حالتی است که کاربر باید رویش بزند.
            color: ready
                ? theme.colorScheme.primary.withValues(alpha: 0.16)
                : theme.colorScheme.onSurface.withValues(alpha: 0.04),
            border: Border.all(
              color: ready
                  ? theme.colorScheme.primary.withValues(alpha: 0.60)
                  : theme.colorScheme.onSurface.withValues(alpha: 0.10),
              width: ready ? 1.5 : 1,
            ),
          ),
          child: Stack(
            children: [
              Center(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(_icons['${m['kind']}'] ?? '🎁',
                        style: const TextStyle(fontSize: 18)),
                    const SizedBox(height: 2),
                    Text(
                      _text(Map<String, dynamic>.from(m)),
                      textAlign: TextAlign.center,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 10, height: 1.2),
                    ),
                  ],
                ),
              ),
              if (claimed)
                PositionedDirectional(
                  top: 0,
                  end: 2,
                  child: Text('✓',
                      style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w900,
                          color: theme.colorScheme.primary)),
                ),
              if (locked)
                const PositionedDirectional(
                  top: 0,
                  end: 2,
                  child: Text('🔒', style: TextStyle(fontSize: 10)),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

// ── راهنمای کسب امتیاز تجربه ─────────────────────────────────────────────
class _HowTo extends StatelessWidget {
  const _HowTo({required this.sources});
  final List<Map<String, dynamic>> sources;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('چطور در مسیر جلو بروم؟',
              style: theme.textTheme.titleMedium
                  ?.copyWith(fontWeight: FontWeight.w900)),
          Gaps.vXxs,
          Text(
            'امتیاز تجربه فقط با بازی کردن به دست می‌آید — خریدنی نیست. '
            'هر کار سقف روزانهٔ خودش را دارد.',
            style: theme.textTheme.bodySmall,
          ),
          Gaps.vSm,
          for (final s in sources)
            Padding(
              padding: const EdgeInsets.only(bottom: Gaps.xs),
              child: Container(
                padding: const EdgeInsets.symmetric(
                    horizontal: Gaps.sm, vertical: Gaps.xs),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(12),
                  color: theme.colorScheme.onSurface.withValues(alpha: 0.04),
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: Text('${s['label']}',
                          style: const TextStyle(fontWeight: FontWeight.w700)),
                    ),
                    Text('${faNum(NumberParser.toInt(s['xp']))} امتیاز',
                        style: TextStyle(
                            fontWeight: FontWeight.w900,
                            color: theme.colorScheme.primary)),
                    Gaps.hXs,
                    Text('تا ${faNum(NumberParser.toInt(s['dailyCap']))} در روز',
                        style: theme.textTheme.labelSmall),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }
}
