import 'package:flutter/material.dart';

import '../../api_client.dart';
import '../../core/assets.dart';
import '../../theme/tokens.dart';
import '../../widgets/state_views.dart';

const _freeColor = Color(0xFF38BDF8);
const _plusGold = Color(0xFFFFD166);
const _readyColor = Color(0xFFB5EF58);

class PassPage extends StatefulWidget {
  const PassPage({
    super.key,
    required this.api,
    required this.onOpenShop,
    this.onChanged,
  });

  final ApiClient api;
  final VoidCallback onOpenShop;
  final VoidCallback? onChanged;

  @override
  State<PassPage> createState() => _PassPageState();
}

class _PassPageState extends State<PassPage> with SingleTickerProviderStateMixin {
  Map<String, dynamic>? _data;
  bool _loading = true;
  bool _busy = false;
  bool _showClaimed = false;
  String? _error;

  final _scroll = ScrollController();
  late final AnimationController _pulse;

  @override
  void initState() {
    super.initState();
    _pulse = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1400),
    );
    _load();
  }

  void _syncPulse() {
    final claimable = NumberParser.toInt(_data?['claimable']);
    final want = claimable > 0;
    if (want && !_pulse.isAnimating) {
      _pulse.repeat(reverse: true);
    } else if (!want && _pulse.isAnimating) {
      _pulse.stop();
      _pulse.value = 0;
    }
  }

  @override
  void dispose() {
    if (_scroll.hasClients) _scroll.jumpTo(_scroll.offset);
    _scroll.dispose();
    _pulse.dispose();
    super.dispose();
  }

  Future<void> _load({bool jump = true}) async {
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
      _syncPulse();
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
      _toast(r is Map ? '${r['message'] ?? 'جایزه دریافت شد!'}' : 'جایزه دریافت شد!');
      widget.onChanged?.call();
      await _load(jump: false);
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
      _toast(r is Map ? '${r['message'] ?? 'جوایز دریافت شد'}' : 'جوایز دریافت شد');
      widget.onChanged?.call();
      await _load(jump: false);
    } catch (e) {
      if (mounted) _toast(apiError(e), error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _toast(String text, {bool error = false}) {
    if (!mounted) return;
    ScaffoldMessenger.maybeOf(context)?.showSnackBar(SnackBar(
      content: Text(text, textAlign: TextAlign.center, style: const TextStyle(fontWeight: FontWeight.w800)),
      behavior: SnackBarBehavior.floating,
      backgroundColor: error ? Theme.of(context).colorScheme.error : const Color(0xFF10B981),
      duration: const Duration(milliseconds: 2000),
    ));
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const LoadingView();
    if (_error != null && _data == null) {
      return RefreshIndicator(
        onRefresh: () async => _load(),
        child: ListView(
          padding: const EdgeInsets.all(Gaps.md),
          children: [
            const SizedBox(height: 40),
            ErrorBanner(message: _error!, onRetry: _load),
          ],
        ),
      );
    }

    final d = _data ?? const {};
    if (d['active'] != true) return const _NoSeason();

    final season = Map<String, dynamic>.from(d['season'] as Map? ?? {});
    final allTiers = (d['tiers'] as List? ?? const [])
        .whereType<Map>()
        .map((e) => Map<String, dynamic>.from(e))
        .toList();
    final tier = NumberParser.toInt(d['tier']);
    final tierCount = NumberParser.toInt(d['tierCount']);
    final hasPlus = d['hasPlus'] == true;
    final claimable = NumberParser.toInt(d['claimable']);

    // Determine folded claimed tiers
    bool isTierDone(Map row) {
      final tNum = NumberParser.toInt(row['tier']);
      final free = row['free'] is Map ? row['free'] as Map : null;
      final plus = row['plus'] is Map ? row['plus'] as Map : null;
      final freeDone = free == null || free['claimed'] == true;
      final plusDone = plus == null || plus['claimed'] == true || plus['locked'] == true;
      return row['unlocked'] == true && freeDone && plusDone && tNum < tier;
    }

    final claimedCount = allTiers.where(isTierDone).length;
    final displayTiers = allTiers.where((r) => _showClaimed || !isTierDone(r)).toList();

    return RefreshIndicator(
      onRefresh: () => _load(jump: false),
      child: ListView(
        controller: _scroll,
        padding: const EdgeInsets.fromLTRB(Gaps.md, Gaps.sm, Gaps.md, Gaps.xxl),
        children: [
          // ── Compact Season Hero ──
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(20),
              gradient: const LinearGradient(
                begin: Alignment.topRight,
                end: Alignment.bottomLeft,
                colors: [Color(0xFF16325C), Color(0xFF0A1526)],
              ),
              border: Border.all(color: Colors.white.withValues(alpha: 0.12)),
            ),
            child: Column(
              children: [
                Row(
                  children: [
                    Image.asset('assets/pass/streak_icon.webp', width: 44, height: 44, cacheWidth: 120,
                        errorBuilder: (_, __, ___) => const Icon(Icons.emoji_events_rounded, color: _plusGold, size: 36)),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            '${season['name'] ?? 'گذر نبرد فصلی'}',
                            style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 16, color: Colors.white),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            '${faNum(season['daysLeft'])} روز تا پایان فصل · پله ${faNum(tier)} از ${faNum(tierCount)}',
                            style: TextStyle(color: Colors.white.withValues(alpha: 0.70), fontSize: 11.5),
                          ),
                        ],
                      ),
                    ),
                    if (claimable > 0)
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                        decoration: BoxDecoration(
                          color: _readyColor.withValues(alpha: 0.2),
                          borderRadius: BorderRadius.circular(20),
                          border: Border.all(color: _readyColor),
                        ),
                        child: Text(
                          '${faNum(claimable)} جایزه آماده',
                          style: const TextStyle(color: _readyColor, fontWeight: FontWeight.w900, fontSize: 11),
                        ),
                      ),
                  ],
                ),
                const SizedBox(height: 12),

                // ── XP Progress Bar ──
                ClipRRect(
                  borderRadius: BorderRadius.circular(8),
                  child: LinearProgressIndicator(
                    value: (d['tierNeeds'] as num? ?? 0) > 0
                        ? ((d['intoTier'] as num? ?? 0) / (d['tierNeeds'] as num)).clamp(0.0, 1.0)
                        : 1.0,
                    minHeight: 8,
                    backgroundColor: Colors.white.withValues(alpha: 0.10),
                    valueColor: const AlwaysStoppedAnimation<Color>(Color(0xFF22E7A6)),
                  ),
                ),
                const SizedBox(height: 6),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      'امروز ${faNum(d['tiersToday'])} از ${faNum(d['maxTiersPerDay'])} پله باز شد',
                      style: const TextStyle(fontSize: 11, color: Colors.white70, fontWeight: FontWeight.w700),
                    ),
                    Text(
                      '${faNum(d['intoTier'])} / ${faNum(d['tierNeeds'])} XP تا پله بعد',
                      style: const TextStyle(fontSize: 11, color: Color(0xFF38BDF8), fontWeight: FontWeight.w800),
                    ),
                  ],
                ),

                if (claimable > 0) ...[
                  const SizedBox(height: 10),
                  SizedBox(
                    width: double.infinity,
                    height: 38,
                    child: ElevatedButton(
                      onPressed: _busy ? null : _claimAll,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF22E7A6),
                        foregroundColor: const Color(0xFF04291D),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                      ),
                      child: Text('دریافت همه جوایز آماده (${faNum(claimable)})',
                          style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 12.5)),
                    ),
                  ),
                ],
              ],
            ),
          ),

          const SizedBox(height: 10),

          // ── Visual XP Infographic (One Glance Overview) ──
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(16),
              color: Colors.white.withValues(alpha: 0.04),
              border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Row(
                  children: [
                    Icon(Icons.bolt_rounded, color: Color(0xFFFFD166), size: 16),
                    SizedBox(width: 4),
                    Text('راه‌های سریع کسب تجربه (XP):',
                        style: TextStyle(fontWeight: FontWeight.w800, fontSize: 11.5, color: Colors.white)),
                  ],
                ),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: const [
                    _XpPill(label: 'بازی آنلاین', xp: '+۱۵/۲۵'),
                    _XpPill(label: 'ضربه‌زن', xp: '+۳۰'),
                    _XpPill(label: 'گردونه', xp: '+۲۰'),
                    _XpPill(label: 'دعوت دوست', xp: '+۱۰۰'),
                    _XpPill(label: 'ورود روزانه', xp: '+۲۰'),
                  ],
                ),
              ],
            ),
          ),

          if (!hasPlus) ...[
            const SizedBox(height: 10),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(14),
                gradient: const LinearGradient(
                  colors: [Color(0xFF2E2407), Color(0xFF141A29)],
                ),
                border: Border.all(color: _plusGold.withValues(alpha: 0.4)),
              ),
              child: Row(
                children: [
                  const Text('★', style: TextStyle(color: _plusGold, fontSize: 22)),
                  const SizedBox(width: 10),
                  const Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('مسیر طلایی قلقلی پلاس',
                            style: TextStyle(color: _plusGold, fontWeight: FontWeight.w900, fontSize: 13)),
                        Text('جوایز نقدی، شانس گردونه و آیتم‌های ویژه',
                            style: TextStyle(color: Colors.white70, fontSize: 11)),
                      ],
                    ),
                  ),
                  ElevatedButton(
                    onPressed: widget.onOpenShop,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: _plusGold,
                      foregroundColor: const Color(0xFF291B00),
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                    ),
                    child: const Text('خرید پلاس', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 11.5)),
                  ),
                ],
              ),
            ),
          ],

          const SizedBox(height: 10),

          // ── Track Legend & Fold Button ──
          Wrap(
            alignment: WrapAlignment.spaceBetween,
            crossAxisAlignment: WrapCrossAlignment.center,
            spacing: 8,
            runSpacing: 4,
            children: [
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                    decoration: BoxDecoration(
                      color: _freeColor.withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: _freeColor.withValues(alpha: 0.4)),
                    ),
                    child: const Text('مسیر رایگان',
                        style: TextStyle(color: _freeColor, fontSize: 10.5, fontWeight: FontWeight.w800)),
                  ),
                  const SizedBox(width: 6),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                    decoration: BoxDecoration(
                      color: _plusGold.withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: _plusGold.withValues(alpha: 0.4)),
                    ),
                    child: const Text('★ مسیر پلاس',
                        style: TextStyle(color: _plusGold, fontSize: 10.5, fontWeight: FontWeight.w800)),
                  ),
                ],
              ),
              if (claimedCount > 0)
                TextButton.icon(
                  onPressed: () => setState(() => _showClaimed = !_showClaimed),
                  icon: Icon(_showClaimed ? Icons.expand_less_rounded : Icons.expand_more_rounded, size: 18),
                  label: Text(
                    _showClaimed ? 'بستن پله‌های قبلی' : 'پله‌های تکمیل‌شده (${faNum(claimedCount)})',
                    style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700),
                  ),
                ),
            ],
          ),

          const SizedBox(height: 6),

          // ── Tiers List ──
          for (final row in displayTiers) ...[
            _PassRow(
              data: row,
              busy: _busy,
              pulse: _pulse,
              onClaim: _claim,
            ),
            const SizedBox(height: 6),
          ],
        ],
      ),
    );
  }
}

class _XpPill extends StatelessWidget {
  const _XpPill({required this.label, required this.xp});
  final String label;
  final String xp;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.06),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(label, style: const TextStyle(fontSize: 11, color: Colors.white70, fontWeight: FontWeight.w600)),
          const SizedBox(width: 4),
          Text(xp, style: const TextStyle(fontSize: 11, color: Color(0xFF22E7A6), fontWeight: FontWeight.w900)),
        ],
      ),
    );
  }
}

class _PassRow extends StatelessWidget {
  const _PassRow({
    required this.data,
    required this.busy,
    required this.pulse,
    required this.onClaim,
  });

  final Map data;
  final bool busy;
  final Animation<double> pulse;
  final void Function(String) onClaim;

  @override
  Widget build(BuildContext context) {
    final tNum = NumberParser.toInt(data['tier']);
    final unlocked = data['unlocked'] == true;
    final isMilestone = tNum % 5 == 0;

    final free = data['free'] is Map ? data['free'] as Map : null;
    final plus = data['plus'] is Map ? data['plus'] as Map : null;

    return Container(
      padding: const EdgeInsets.all(8),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        color: isMilestone ? const Color(0xFF1E293B).withValues(alpha: 0.7) : Colors.white.withValues(alpha: 0.03),
        border: Border.all(
          color: isMilestone
              ? _plusGold.withValues(alpha: 0.3)
              : Colors.white.withValues(alpha: unlocked ? 0.15 : 0.06),
        ),
      ),
      child: Row(
        children: [
          // Tier Number Pill
          Container(
            width: 36,
            height: 54,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(8),
              color: unlocked ? _readyColor.withValues(alpha: 0.15) : Colors.white.withValues(alpha: 0.05),
              border: Border.all(color: unlocked ? _readyColor : Colors.white24),
            ),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(unlocked ? Icons.lock_open_rounded : Icons.lock_outline_rounded,
                    size: 13, color: unlocked ? _readyColor : Colors.white38),
                const SizedBox(height: 2),
                Text(faNum(tNum),
                    style: TextStyle(
                      color: unlocked ? Colors.white : Colors.white60,
                      fontWeight: FontWeight.w900,
                      fontSize: 14,
                    )),
              ],
            ),
          ),
          const SizedBox(width: 8),

          // Free Track Tile
          Expanded(
            child: _CompactRewardTile(
              data: free,
              unlocked: unlocked,
              track: 'free',
              busy: busy,
              pulse: pulse,
              onClaim: onClaim,
            ),
          ),
          const SizedBox(width: 8),

          // Plus Track Tile
          Expanded(
            child: _CompactRewardTile(
              data: plus,
              unlocked: unlocked,
              track: 'plus',
              busy: busy,
              pulse: pulse,
              onClaim: onClaim,
            ),
          ),
        ],
      ),
    );
  }
}

class _CompactRewardTile extends StatelessWidget {
  const _CompactRewardTile({
    required this.data,
    required this.unlocked,
    required this.track,
    required this.busy,
    required this.pulse,
    required this.onClaim,
  });

  final Map? data;
  final bool unlocked;
  final String track;
  final bool busy;
  final Animation<double> pulse;
  final void Function(String) onClaim;

  static const _art = {
    'points': 'assets/pass/icon_points.png',
    'spins': 'assets/pass/icon_spins.png',
    'shop_item': 'assets/pass/icon_item.png',
  };

  @override
  Widget build(BuildContext context) {
    if (data == null) {
      return Container(
        height: 54,
        alignment: Alignment.center,
        child: const Text('—', style: TextStyle(color: Colors.white24)),
      );
    }

    final m = data!;
    final claimed = m['claimed'] == true;
    final locked = m['locked'] == true;
    final ready = unlocked && !claimed && !locked;
    final isPlus = track == 'plus';
    final amount = NumberParser.toInt(m['amount']);
    final kind = '${m['kind']}';

    String label;
    if (kind == 'points') {
      label = '${faNum(amount)} امتیاز';
    } else if (kind == 'spins') {
      label = '${faNum(amount)} چرخش';
    } else if (kind == 'cash') {
      label = '${faNum(amount)} تومان';
    } else {
      label = '${m['label'] ?? 'آیتم'}';
    }

    final tile = Container(
      height: 54,
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 4),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(10),
        color: ready
            ? _readyColor.withValues(alpha: 0.18)
            : (isPlus ? _plusGold : _freeColor).withValues(alpha: claimed ? 0.04 : 0.08),
        border: Border.all(
          color: ready
              ? _readyColor
              : (isPlus ? _plusGold : _freeColor).withValues(alpha: claimed ? 0.15 : 0.35),
          width: ready ? 1.4 : 1,
        ),
      ),
      child: Row(
        children: [
          Image.asset(
            _art[kind] ?? 'assets/pass/reward_gift_icon.webp',
            width: 24,
            height: 24,
            cacheWidth: 64,
            errorBuilder: (_, __, ___) => Icon(
              isPlus ? Icons.star_rounded : Icons.card_giftcard_rounded,
              size: 20,
              color: isPlus ? _plusGold : _freeColor,
            ),
          ),
          const SizedBox(width: 5),
          Expanded(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 11.5,
                    fontWeight: FontWeight.w900,
                    color: claimed ? Colors.white38 : Colors.white,
                  ),
                ),
                if (claimed)
                  const Text('✓ دریافت شد', style: TextStyle(fontSize: 9.5, color: _readyColor, fontWeight: FontWeight.w800))
                else if (locked)
                  const Text('★ فقط پلاس', style: TextStyle(fontSize: 9.5, color: _plusGold, fontWeight: FontWeight.w800))
                else if (ready)
                  const Text('لمس برای دریافت', style: TextStyle(fontSize: 9.5, color: _readyColor, fontWeight: FontWeight.w900)),
              ],
            ),
          ),
        ],
      ),
    );

    if (!ready) {
      return Opacity(opacity: claimed ? 0.5 : (locked ? 0.75 : 1.0), child: tile);
    }

    return AnimatedBuilder(
      animation: pulse,
      builder: (context, child) => Transform.scale(scale: 1.0 + pulse.value * 0.02, child: child),
      child: InkWell(
        borderRadius: BorderRadius.circular(10),
        onTap: busy ? null : () => onClaim('${m['id']}'),
        child: tile,
      ),
    );
  }
}

class _NoSeason extends StatelessWidget {
  const _NoSeason();
  @override
  Widget build(BuildContext context) {
    return const Center(
      child: Padding(
        padding: EdgeInsets.all(Gaps.xl),
        child: Text('در حال حاضر فصلی فعال نیست. به‌زودی فصل جدید شروع می‌شود.', textAlign: TextAlign.center),
      ),
    );
  }
}
