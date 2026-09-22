part of '../card_duel_page.dart';

class _StakePayoutFlight extends StatefulWidget {
  const _StakePayoutFlight({
    super.key,
    required this.amount,
    required this.mineWon,
    required this.balanceAfter,
    required this.opponentRole,
  });

  final int amount;
  final bool mineWon;
  final int? balanceAfter;
  final String opponentRole;

  @override
  State<_StakePayoutFlight> createState() => _StakePayoutFlightState();
}

class _StakePayoutFlightState extends State<_StakePayoutFlight>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 2650),
  )..forward();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final owner = widget.mineWon ? 'تو' : widget.opponentRole;
    return Semantics(
      liveRegion: true,
      label: '${faNum(widget.amount)} امتیاز به $owner اضافه شد',
      child: AnimatedBuilder(
        animation: _controller,
        builder: (context, _) => LayoutBuilder(
          builder: (context, constraints) {
            final v = _controller.value;
            final fade = v < .80 ? 1.0 : (1 - (v - .80) / .20).clamp(0.0, 1.0);
            final center =
                Offset(constraints.maxWidth / 2, constraints.maxHeight * .42);
            return Opacity(
              opacity: fade,
              child: Stack(
                children: [
                  Positioned.fill(
                    child: DecoratedBox(
                      decoration: BoxDecoration(
                        gradient: RadialGradient(
                          center: const Alignment(0, -.05),
                          colors: [
                            _gold.withValues(alpha: .24 * fade),
                            Colors.transparent,
                          ],
                          radius: .72,
                        ),
                      ),
                    ),
                  ),
                  for (var index = 0; index < 14; index++)
                    Builder(
                      builder: (_) {
                        final delay = index * .018;
                        final p = ((v - delay) / .62).clamp(0.0, 1.0);
                        final eased = Curves.easeOutCubic.transform(p);
                        final start = Offset(
                          constraints.maxWidth * (.06 + index * .068),
                          constraints.maxHeight * .92,
                        );
                        final arc =
                            math.sin(math.pi * eased) * (42 + (index % 4) * 9);
                        final point = Offset.lerp(start, center, eased)! +
                            Offset((index.isEven ? -1 : 1) * arc * .38, -arc);
                        return Positioned(
                          left: point.dx - 11,
                          top: point.dy - 11,
                          child: Transform.rotate(
                            angle: eased * math.pi * (3 + index % 3),
                            child: Transform.scale(
                              scale: .45 + .55 * math.sin(math.pi * p).abs(),
                              child: Container(
                                width: 22,
                                height: 22,
                                decoration: BoxDecoration(
                                  shape: BoxShape.circle,
                                  gradient: const LinearGradient(
                                    colors: [
                                      Color(0xFFFFF2A8),
                                      Color(0xFFF59E0B)
                                    ],
                                  ),
                                  border: Border.all(color: Colors.white54),
                                  boxShadow: const [
                                    BoxShadow(color: _gold, blurRadius: 13),
                                  ],
                                ),
                                alignment: Alignment.center,
                                child: const Text(
                                  '+',
                                  style: TextStyle(
                                    color: Color(0xFF5B3700),
                                    fontWeight: FontWeight.w900,
                                  ),
                                ),
                              ),
                            ),
                          ),
                        );
                      },
                    ),
                  Align(
                    alignment: const Alignment(0, -.08),
                    child: Transform.translate(
                      offset: Offset(
                          0,
                          95 -
                              Curves.easeOutBack
                                      .transform(v.clamp(0.0, .55) / .55) *
                                  112),
                      child: Transform.scale(
                        scale: .45 +
                            .55 *
                                Curves.easeOutBack
                                    .transform((v / .30).clamp(0.0, 1.0)),
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Container(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 17, vertical: 8),
                              decoration: BoxDecoration(
                                gradient: const LinearGradient(
                                  colors: [
                                    Color(0xFFFFF2A8),
                                    _gold,
                                    Color(0xFFF59E0B)
                                  ],
                                ),
                                borderRadius: Corners.rLg,
                                border: Border.all(color: Colors.white70),
                                boxShadow: const [
                                  BoxShadow(
                                      color: _gold,
                                      blurRadius: 36,
                                      spreadRadius: 3),
                                  BoxShadow(
                                      color: Colors.black54,
                                      blurRadius: 20,
                                      offset: Offset(0, 12)),
                                ],
                              ),
                              child: Text(
                                '+${faNum(widget.amount)}',
                                textDirection: TextDirection.ltr,
                                style: const TextStyle(
                                  color: Color(0xFF3B2500),
                                  fontSize: 34,
                                  fontWeight: FontWeight.w900,
                                ),
                              ),
                            ),
                            const SizedBox(height: 7),
                            Text(
                              widget.mineWon && widget.balanceAfter != null
                                  ? 'موجودی جدید: ${faNum(widget.balanceAfter)}'
                                  : 'امتیاز به $owner اضافه شد',
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 13,
                                fontWeight: FontWeight.w900,
                                shadows: [
                                  Shadow(color: Colors.black, blurRadius: 9)
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            );
          },
        ),
      ),
    );
  }
}

class _ErrorPanel extends StatelessWidget {
  const _ErrorPanel({required this.message, required this.onBack});
  final String message;
  final VoidCallback onBack;
  @override
  Widget build(BuildContext context) => AppCard(
        child: Column(
          children: [
            Icon(
              Icons.error_outline_rounded,
              color: Theme.of(context).colorScheme.error,
              size: 34,
            ),
            Gaps.vXs,
            Text(message, textAlign: TextAlign.center),
            Gaps.vSm,
            FilledButton(
                onPressed: onBack, child: const Text('بازگشت به ترکیب')),
          ],
        ),
      );
}

String _settlementLabel(String status) {
  switch (status) {
    case 'pending':
      return 'تسویه در انتظار';
    case 'refunded':
      return 'برگشت‌خورده';
    default:
      return 'تسویه‌شده';
  }
}

class _DeckIntelPanel extends StatelessWidget {
  const _DeckIntelPanel({
    required this.activeInsights,
    required this.suggestedDeck,
    required this.onApplySuggested,
  });

  final Map<String, dynamic>? activeInsights;
  final Map<String, dynamic>? suggestedDeck;
  final VoidCallback onApplySuggested;

  @override
  Widget build(BuildContext context) {
    final insights = activeInsights ??
        (suggestedDeck?['insights'] is Map
            ? Map<String, dynamic>.from(suggestedDeck!['insights'] as Map)
            : null);
    if (insights == null) return const SizedBox.shrink();
    final warnings = (insights['warnings'] as List? ?? const [])
        .map((e) => '$e')
        .where((e) => e.isNotEmpty)
        .toList(growable: false);
    final strengths = (insights['strengths'] as List? ?? const [])
        .map((e) => '$e')
        .where((e) => e.isNotEmpty)
        .toList(growable: false);
    final order = (insights['recommendedOrder'] as List? ?? const [])
        .whereType<Map>()
        .toList(growable: false);
    final warning = warnings.isEmpty ? null : warnings.first;
    final strength = strengths.isEmpty ? null : strengths.first;
    final opener = order.isEmpty ? null : '${order.first['name'] ?? ''}';
    final tint = warning == null ? _emerald : _gold;
    final summary = warning ?? strength ?? 'ترکیب متعادل';

    return AppCard(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      child: Row(
        children: [
          Container(
            width: 38,
            height: 38,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: tint.withValues(alpha: .14),
            ),
            child: Icon(
              warning == null ? Icons.verified_rounded : Icons.bolt_rounded,
              color: tint,
              size: 20,
            ),
          ),
          const SizedBox(width: 9),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  warning == null ? 'ترکیب آماده' : 'یک اصلاح پیشنهادی',
                  style: const TextStyle(
                    fontSize: 12.5,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                Text(
                  opener == null ? summary : '$summary  •  شروع: $opener',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 11.5,
                    color: Colors.white60,
                  ),
                ),
              ],
            ),
          ),
          if (suggestedDeck != null)
            IconButton(
              onPressed: onApplySuggested,
              icon: const Icon(Icons.auto_fix_high_rounded, size: 20),
              color: _cyan,
              tooltip: 'چیدن خودکار',
            ),
        ],
      ),
    );
  }
}

class _FinalRoundBreakdown extends StatelessWidget {
  const _FinalRoundBreakdown({
    required this.round,
    required this.mySymbol,
    required this.opponentRole,
  });
  final Map<String, dynamic> round;
  final String mySymbol;
  final String opponentRole;

  @override
  Widget build(BuildContext context) {
    final view = CardDuelRoundPerspective.from(round, mySymbol);
    final mineWon = view.iWon;
    final draw = view.draw;
    final inOvertime = view.inOvertime;
    final isStorm = view.isStorm;
    final mine = view.mine;
    final theirs = view.theirs;
    final breakdownMine = view.myBreakdown;
    final breakdownTheirs = view.theirBreakdown;
    final headline = inOvertime
        ? _cyan
        : draw
            ? _gold
            : mineWon
                ? _emerald
                : _rose;
    final awardText = inOvertime
        ? (mineWon
            ? 'وقت اضافه: +${faNum(view.myAward > 0 ? view.myAward : 2)} برای تو'
            : 'وقت اضافه: +${faNum(view.theirAward > 0 ? view.theirAward : 2)} برای $opponentRole')
        : draw
            ? (isStorm ? 'مساوی → وقت اضافه' : 'مساوی')
            : mineWon
                ? '+${faNum(view.myAward > 0 ? view.myAward : 1)} برای تو'
                : '+${faNum(view.theirAward > 0 ? view.theirAward : 1)} برای $opponentRole';
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(Gaps.sm),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: .04),
        borderRadius: Corners.rLg,
        border: Border.all(
          color: inOvertime
              ? _cyan.withValues(alpha: .4)
              : isStorm
                  ? const Color(0xFFFF7A1A).withValues(alpha: .45)
                  : headline.withValues(alpha: .22)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  'راند ${faNum(round['round'])} · ${inOvertime ? 'وقت اضافه' : (round['focusLabel'] ?? round['title'])}${isStorm && !inOvertime ? '  (دو‌امتیازی)' : ''}',
                  style: const TextStyle(
                    fontSize: 12.5,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: headline.withValues(alpha: .16),
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Text(
                  awardText,
                  style: TextStyle(
                    color: headline,
                    fontSize: 11.5,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          if (inOvertime) ...[
            Text(
              'وقت اضافه کارت مصرف نمی‌کند؛ قدرت کل ترکیب به‌همراه شانس بزرگ‌تر داوری می‌کند.',
              style: TextStyle(
                fontSize: 12,
                color: _cyan.withValues(alpha: .95),
                height: 1.5,
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 6),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [
                _MiniBreakChip(
                  label: 'قدرت ترکیب تو',
                  value: faNum(view.mySquad),
                  tint: mineWon ? _emerald : _cyan,
                ),
                _MiniBreakChip(
                  label: 'قدرت ترکیب $opponentRole',
                  value: faNum(view.theirSquad),
                  tint: !mineWon ? _rose : _gold,
                ),
                _MiniBreakChip(
                  label: 'شانس تو',
                  value: view.myLuck >= 0
                      ? '+${faNum(view.myLuck)}'
                      : '−${faNum(view.myLuck.abs())}',
                  tint: view.myLuck >= 0 ? _emerald : _rose,
                ),
                _MiniBreakChip(
                  label: 'شانس $opponentRole',
                  value: view.theirLuck >= 0
                      ? '+${faNum(view.theirLuck)}'
                      : '−${faNum(view.theirLuck.abs())}',
                  tint: view.theirLuck >= 0 ? _emerald : _rose,
                ),
              ],
            ),
          ] else ...[
            Text(
              'کارت تو: ${mine['name'] ?? 'بدون نام'}  •  کارت $opponentRole: ${theirs['name'] ?? 'بدون نام'}',
              style: const TextStyle(fontSize: 12, color: Colors.white70),
            ),
            const SizedBox(height: 6),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [
                _MiniBreakChip(
                  label: 'ویژگی',
                  value: '${round['focusLabel'] ?? round['title']}',
                  tint: _cyan,
                ),
                _MiniBreakChip(
                  label: 'عدد نهایی تو',
                  value: faNum(view.myPower),
                  tint: mineWon ? _emerald : _cyan,
                ),
                _MiniBreakChip(
                  label: 'عدد نهایی $opponentRole',
                  value: faNum(view.theirPower),
                  tint: !draw && !mineWon ? _rose : _gold,
                ),
                _MiniBreakChip(
                  label: 'اختلاف',
                  value: faNum(round['powerGap'] ?? 0),
                  tint: headline,
                ),
                if (view.myLuck != 0)
                  _MiniBreakChip(
                    label: 'شانس تو',
                    value: view.myLuck >= 0
                        ? '+${faNum(view.myLuck)}'
                        : '−${faNum(view.myLuck.abs())}',
                    tint: view.myLuck >= 0 ? _emerald : _rose,
                  ),
              ],
            ),
            const SizedBox(height: 8),
            _BreakdownRow(title: 'تو', data: breakdownMine),
            const SizedBox(height: 6),
            _BreakdownRow(title: opponentRole, data: breakdownTheirs),
            const SizedBox(height: 8),
            Text(
              '${round['reason'] ?? ''}',
              style: const TextStyle(
                fontSize: 12,
                color: Colors.white70,
                height: 1.5,
                fontWeight: FontWeight.w700,
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _BreakdownRow extends StatelessWidget {
  const _BreakdownRow({required this.title, required this.data});
  final String title;
  final Map<String, dynamic> data;

  @override
  Widget build(BuildContext context) {
    final focus = NumberParser.toInt(data['focus']);
    final effect = NumberParser.toInt(data['effectBonus']);
    final total = NumberParser.toInt(data['total']);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          '$title:  ${faNum(focus)}${effect == 0 ? '' : ' + افکت ${faNum(effect)}'} = ${faNum(total)}',
          style: const TextStyle(
            fontSize: 12,
            color: Colors.white70,
            fontWeight: FontWeight.w900,
          ),
        ),
      ],
    );
  }
}

class _MiniBreakChip extends StatelessWidget {
  const _MiniBreakChip({
    required this.label,
    required this.value,
    required this.tint,
  });
  final String label;
  final String value;
  final Color tint;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 4),
        decoration: BoxDecoration(
          color: tint.withValues(alpha: .10),
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: tint.withValues(alpha: .18)),
        ),
        child: Text(
          '$label: $value',
          style: TextStyle(
            fontSize: 11.5,
            color: tint,
            fontWeight: FontWeight.w800,
          ),
        ),
      );
}

class _History extends StatelessWidget {
  const _History({required this.battles});
  final List battles;
  @override
  Widget build(BuildContext context) {
    const labels = {'online': 'نبرد آنلاین', 'lobby': 'لابی خصوصی'};
    final rows = battles
        .whereType<Map>()
        .where((raw) => raw['mode'] != 'bot')
        .take(5)
        .toList(growable: false);
    return AppCard(
      padding: EdgeInsets.zero,
      child: Theme(
        data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
        child: ExpansionTile(
          initiallyExpanded: false,
          tilePadding: const EdgeInsets.symmetric(horizontal: Gaps.sm),
          childrenPadding: const EdgeInsets.fromLTRB(
            Gaps.sm,
            0,
            Gaps.sm,
            Gaps.sm,
          ),
          title: Text(
            rows.isEmpty
                ? 'آخرین نبردها'
                : 'آخرین نبردها (${faNum(rows.length)})',
            style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 14),
          ),
          subtitle: const Text(
            'فقط پنج بازی آنلاین اخیر؛ تمرین با ربات ثبت نمی‌شود',
            style: TextStyle(fontSize: 12, color: Colors.white54),
          ),
          children: [
            if (rows.isEmpty)
              const Padding(
                padding: EdgeInsets.only(bottom: Gaps.sm),
                child: Text(
                  'هنوز نبرد آنلاینی نداری. تاریخچه اینجا جمع نمی‌شود تا صفحه سبک بماند.',
                ),
              ),
            for (final raw in rows)
              Padding(
                padding: const EdgeInsets.only(bottom: Gaps.xs),
                child: AppCard(
                  padding: const EdgeInsets.all(Gaps.sm),
                  elevated: false,
                  child: Row(
                    children: [
                      Icon(
                        NumberParser.toInt(raw['userDelta']) > 0
                            ? Icons.trending_up_rounded
                            : NumberParser.toInt(raw['userDelta']) < 0
                                ? Icons.trending_down_rounded
                                : Icons.diamond_outlined,
                        color: NumberParser.toInt(raw['userDelta']) >= 0
                            ? _emerald
                            : BrandColors.danger,
                      ),
                      Gaps.hSm,
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              labels['${raw['mode']}'] ?? 'دوئل کارت',
                              style: const TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.w900,
                              ),
                            ),
                            Text(
                              'تو ${faNum(raw['userScore'])} · حریف ${faNum(raw['opponentScore'])} · '
                              '${_settlementLabel('${raw['settlementStatus'] ?? 'settled'}')}',
                              style: const TextStyle(
                                fontSize: 11.5,
                                color: Colors.white54,
                              ),
                            ),
                          ],
                        ),
                      ),
                      Text(
                        NumberParser.toInt(raw['userDelta']) > 0
                            ? '+${faNum(raw['userDelta'])}'
                            : faNum(raw['userDelta']),
                        style: TextStyle(
                          color: NumberParser.toInt(raw['userDelta']) >= 0
                              ? _emerald
                              : BrandColors.danger,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
