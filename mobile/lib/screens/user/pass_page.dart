import 'package:flutter/material.dart';

import '../../api_client.dart';
import '../../core/assets.dart';
import '../../theme/brand_theme.dart';
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
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(18),
              gradient: const LinearGradient(
                begin: Alignment.topRight,
                end: Alignment.bottomLeft,
                colors: [Color(0xFF16325C), Color(0xFF0A1526)],
              ),
              border: Border.all(color: Colors.white.withValues(alpha: 0.12)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  children: [
                    Image.asset('assets/pass/streak_icon.webp', width: 38, height: 38, cacheWidth: 100,
                        errorBuilder: (_, __, ___) => const Icon(Icons.emoji_events_rounded, color: _plusGold, size: 30)),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            '${season['name'] ?? 'فصل اول — شروع قلقلی'}',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 14.5, color: Colors.white),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            '${faNum(season['daysLeft'])} روز تا پایان فصل · پله ${faNum(tier)} از ${faNum(tierCount)}',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(color: Colors.white.withValues(alpha: 0.70), fontSize: 11),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),

                // ── XP Progress Bar ──
                ClipRRect(
                  borderRadius: BorderRadius.circular(8),
                  child: LinearProgressIndicator(
                    value: (d['tierNeeds'] as num? ?? 0) > 0
                        ? ((d['intoTier'] as num? ?? 0) / (d['tierNeeds'] as num)).clamp(0.0, 1.0)
                        : 1.0,
                    minHeight: 7,
                    backgroundColor: Colors.white.withValues(alpha: 0.10),
                    valueColor: const AlwaysStoppedAnimation<Color>(Color(0xFF22E7A6)),
                  ),
                ),
                const SizedBox(height: 6),
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        'امروز ${faNum(d['tiersToday'])} از ${faNum(d['maxTiersPerDay'])} پله باز شد',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontSize: 10.5, color: Colors.white70, fontWeight: FontWeight.w700),
                      ),
                    ),
                    Text(
                      '${faNum(d['intoTier'])} / ${faNum(d['tierNeeds'])} XP',
                      style: const TextStyle(fontSize: 10.5, color: Color(0xFF38BDF8), fontWeight: FontWeight.w800),
                    ),
                  ],
                ),

                if (claimable > 0) ...[
                  const SizedBox(height: 8),
                  SizedBox(
                    width: double.infinity,
                    height: 36,
                    child: ElevatedButton(
                      onPressed: _busy ? null : _claimAll,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF22E7A6),
                        foregroundColor: const Color(0xFF04291D),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                      ),
                      child: Text('دریافت ${faNum(claimable)} جایزه آماده',
                          style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 12)),
                    ),
                  ),
                ],
              ],
            ),
          ),

          const SizedBox(height: 8),

          // ── Visual XP Infographic ──
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(14),
              color: Colors.white.withValues(alpha: 0.04),
              border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Row(
                  children: [
                    Icon(Icons.bolt_rounded, color: Color(0xFFFFD166), size: 15),
                    SizedBox(width: 4),
                    Expanded(
                      child: Text('راه‌های سریع کسب تجربه (XP):',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(fontWeight: FontWeight.w800, fontSize: 11, color: Colors.white)),
                    ),
                  ],
                ),
                const SizedBox(height: 6),
                Wrap(
                  spacing: 5,
                  runSpacing: 5,
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
            const SizedBox(height: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(12),
                gradient: const LinearGradient(
                  colors: [Color(0xFF2E2407), Color(0xFF141A29)],
                ),
                border: Border.all(color: _plusGold.withValues(alpha: 0.4)),
              ),
              child: Row(
                children: [
                  const Text('★', style: TextStyle(color: _plusGold, fontSize: 20)),
                  const SizedBox(width: 8),
                  const Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('مسیر طلایی قفل است',
                            style: TextStyle(color: _plusGold, fontWeight: FontWeight.w900, fontSize: 12.5)),
                        Text('چرخش گردونه، آیتم‌های ویژه و امتیاز دو برابر',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(color: Colors.white70, fontSize: 10.5)),
                      ],
                    ),
                  ),
                  ElevatedButton(
                    onPressed: widget.onOpenShop,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: _plusGold,
                      foregroundColor: const Color(0xFF291B00),
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
                    ),
                    child: const Text('بازکردن', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 11)),
                  ),
                ],
              ),
            ),
          ],

          const SizedBox(height: 8),

          // ── Track Legend & Fold Button ──
          Wrap(
            alignment: WrapAlignment.spaceBetween,
            crossAxisAlignment: WrapCrossAlignment.center,
            spacing: 6,
            runSpacing: 4,
            children: [
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                    decoration: BoxDecoration(
                      color: _freeColor.withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: _freeColor.withValues(alpha: 0.4)),
                    ),
                    child: const Text('رایگان',
                        style: TextStyle(color: _freeColor, fontSize: 10, fontWeight: FontWeight.w800)),
                  ),
                  const SizedBox(width: 5),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                    decoration: BoxDecoration(
                      color: _plusGold.withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: _plusGold.withValues(alpha: 0.4)),
                    ),
                    child: const Text('★ پلاس',
                        style: TextStyle(color: _plusGold, fontSize: 10, fontWeight: FontWeight.w800)),
                  ),
                ],
              ),
              if (claimedCount > 0)
                InkWell(
                  onTap: () => setState(() => _showClaimed = !_showClaimed),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(vertical: 2, horizontal: 4),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(_showClaimed ? Icons.expand_less_rounded : Icons.expand_more_rounded, size: 16, color: Colors.white70),
                        const SizedBox(width: 2),
                        Text(
                          _showClaimed ? 'بستن قبلی‌ها' : 'پله‌های قبل (${faNum(claimedCount)})',
                          style: const TextStyle(fontSize: 10.5, fontWeight: FontWeight.w700, color: Colors.white70),
                        ),
                      ],
                    ),
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
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.06),
        borderRadius: BorderRadius.circular(6),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(label, style: const TextStyle(fontSize: 10.5, color: Colors.white70, fontWeight: FontWeight.w600)),
          const SizedBox(width: 3),
          Text(xp, style: const TextStyle(fontSize: 10.5, color: Color(0xFF22E7A6), fontWeight: FontWeight.w900)),
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
      padding: const EdgeInsets.all(6),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(12),
        color: isMilestone ? const Color(0xFF1E293B).withValues(alpha: 0.7) : Colors.white.withValues(alpha: 0.03),
        border: Border.all(
          color: isMilestone
              ? _plusGold.withValues(alpha: 0.3)
              : Colors.white.withValues(alpha: unlocked ? 0.15 : 0.06),
        ),
      ),
      child: Row(
        children: [
          Container(
            width: 32,
            height: 52,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(8),
              color: unlocked ? _readyColor.withValues(alpha: 0.15) : Colors.white.withValues(alpha: 0.05),
              border: Border.all(color: unlocked ? _readyColor : Colors.white24),
            ),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(unlocked ? Icons.lock_open_rounded : Icons.lock_outline_rounded,
                    size: 12, color: unlocked ? _readyColor : Colors.white38),
                const SizedBox(height: 2),
                Text(faNum(tNum),
                    style: TextStyle(
                      color: unlocked ? Colors.white : Colors.white60,
                      fontWeight: FontWeight.w900,
                      fontSize: 12.5,
                    )),
              ],
            ),
          ),
          const SizedBox(width: 5),

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
          const SizedBox(width: 5),

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
        height: 52,
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
      label = '${m['label'] ?? 'آیتم ویژه'}';
    }

    final tile = Container(
      height: 52,
      padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 2),
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
            width: 20,
            height: 20,
            cacheWidth: 64,
            errorBuilder: (_, __, ___) => Icon(
              isPlus ? Icons.star_rounded : Icons.card_giftcard_rounded,
              size: 16,
              color: isPlus ? _plusGold : _freeColor,
            ),
          ),
          const SizedBox(width: 4),
          Expanded(
            child: SingleChildScrollView(
              physics: const NeverScrollableScrollPhysics(),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    label,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: 10.5,
                      fontWeight: FontWeight.w900,
                      color: claimed ? Colors.white38 : Colors.white,
                    ),
                  ),
                  if (claimed)
                    const Text('✓ گرفتی', style: TextStyle(fontSize: 8.5, color: _readyColor, fontWeight: FontWeight.w800))
                  else if (locked)
                    Text('فقط پلاس', style: TextStyle(fontSize: 8.5, color: context.gold, fontWeight: FontWeight.w800))
                  else if (ready)
                    const Text('برای گرفتن بزن', style: TextStyle(fontSize: 8.5, color: _readyColor, fontWeight: FontWeight.w900)),
                ],
              ),
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
