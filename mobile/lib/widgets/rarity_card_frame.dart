import 'dart:math' as math;
import 'package:flutter/material.dart';

const rarityLabels = <String, String>{
  'normal': 'معمولی',
  'silver': 'نقره‌ای',
  'gold': 'طلایی',
  'premium': 'پرمیوم',
  'legend': 'لجند',
};

const rarityColors = <String, List<Color>>{
  'normal': [Color(0xFF34D399), Color(0xFF14532D)],
  'silver': [Color(0xFFFFFFFF), Color(0xFF64748B)],
  'gold': [Color(0xFFFFF0A3), Color(0xFFB77900)],
  'premium': [Color(0xFF22D3EE), Color(0xFF7C3AED)],
  'legend': [Color(0xFFFFD166), Color(0xFFEF4444)],
};

/// A real artwork-preserving frame. Every rarity has its own material and
/// ornaments—not merely a renamed border—and premium/legend energy moves
/// around the photograph without painting over it.
class RarityCardFrame extends StatefulWidget {
  const RarityCardFrame({
    super.key,
    required this.rarity,
    required this.child,
    this.borderRadius = 20,
    this.padding = 4,
  });

  final String? rarity;
  final Widget child;
  final double borderRadius;
  final double padding;

  @override
  State<RarityCardFrame> createState() => _RarityCardFrameState();
}

class _RarityCardFrameState extends State<RarityCardFrame>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 3400),
  )..repeat();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Gradient _borderGradient(String rarity, List<Color> colors, double t) {
    switch (rarity) {
      case 'normal':
        return const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFF34D399), Color(0xFF14532D), Color(0xFF334155)],
        );
      case 'silver':
        return LinearGradient(
          begin: Alignment(-1 + t * 2, -1),
          end: Alignment(1 + t * 2, 1),
          colors: const [Color(0xFFF8FAFC), Color(0xFF64748B), Color(0xFFFFFFFF), Color(0xFF334155)],
        );
      case 'gold':
        return SweepGradient(
          transform: GradientRotation(t * math.pi * 2),
          colors: const [Color(0xFFFFF0A3), Color(0xFFB77900), Color(0xFFFFD166), Color(0xFF7C4A00), Color(0xFFFFF0A3)],
        );
      case 'premium':
        return SweepGradient(
          transform: GradientRotation(t * math.pi * 2),
          colors: const [Color(0xFF22D3EE), Color(0xFF7C3AED), Color(0xFFF472B6), Color(0xFF071522), Color(0xFF22D3EE)],
        );
      default:
        return SweepGradient(
          transform: GradientRotation(t * math.pi * 2),
          colors: const [Color(0xFFFFD166), Color(0xFFEF4444), Color(0xFF7F1D1D), Color(0xFF071522), Color(0xFFFFD166)],
        );
    }
  }

  Widget _ornaments(String rarity, List<Color> colors, double pulse) {
    if (rarity == 'normal') {
      return Positioned.fill(
        child: IgnorePointer(
          child: DecoratedBox(
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(widget.borderRadius - 1),
              border: Border.all(color: Colors.white.withValues(alpha: 0.16)),
            ),
          ),
        ),
      );
    }
    if (rarity == 'silver') {
      return Positioned.fill(
        child: IgnorePointer(
          child: Container(
            margin: const EdgeInsets.all(7),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(widget.borderRadius - 7),
              border: Border.all(color: Colors.white.withValues(alpha: 0.58), width: 1),
            ),
          ),
        ),
      );
    }
    final symbol = rarity == 'gold' ? '★' : rarity == 'premium' ? '◆' : '♛';
    return PositionedDirectional(
      bottom: -6,
      end: -5,
      child: Transform.rotate(
        angle: rarity == 'premium' ? pulse * .25 : 0,
        child: Container(
          width: rarity == 'legend' ? 24 : 20,
          height: rarity == 'legend' ? 24 : 20,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: colors.first,
            border: Border.all(color: Colors.white54),
            boxShadow: [BoxShadow(color: colors.last.withValues(alpha: .7), blurRadius: 8 + pulse * 8)],
          ),
          alignment: Alignment.center,
          child: Text(symbol,
              style: const TextStyle(color: Color(0xFF071522), fontSize: 9, fontWeight: FontWeight.w900)),
        ),
      ),
    );
  }

  Widget _paint(double t) {
    final rarity = rarityColors.containsKey(widget.rarity) ? widget.rarity! : 'normal';
    final colors = rarityColors[rarity]!;
    final pulse = math.sin(t * math.pi * 2).abs();
    final energetic = rarity == 'premium' || rarity == 'legend';
    final labelColor = energetic ? Colors.white : const Color(0xFF071522);

    return Stack(
      clipBehavior: Clip.none,
      children: [
        Container(
          padding: EdgeInsets.all(widget.padding),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(widget.borderRadius),
            gradient: _borderGradient(rarity, colors, t),
            boxShadow: [
              BoxShadow(
                color: colors.last.withValues(alpha: rarity == 'normal' ? .20 : .30 + pulse * .22),
                blurRadius: rarity == 'normal' ? 9 : 13 + pulse * 10,
                offset: const Offset(0, 6),
              ),
            ],
          ),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(widget.borderRadius - widget.padding),
            child: widget.child,
          ),
        ),
        _ornaments(rarity, colors, pulse),
        if (energetic)
          Positioned.fill(
            child: IgnorePointer(
              child: Container(
                margin: EdgeInsets.all(widget.padding + 1),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(widget.borderRadius - widget.padding),
                  border: Border.all(color: colors.first.withValues(alpha: .25 + pulse * .5)),
                ),
              ),
            ),
          ),
        PositionedDirectional(
          top: -8,
          start: 8,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(99),
              gradient: LinearGradient(
                colors: rarity == 'premium'
                    ? const [Color(0xFF0EA5E9), Color(0xFF7C3AED)]
                    : rarity == 'legend'
                        ? const [Color(0xFFFFD166), Color(0xFFEF4444)]
                        : colors,
              ),
              border: Border.all(color: Colors.white54),
              boxShadow: const [BoxShadow(color: Colors.black54, blurRadius: 8, offset: Offset(0, 3))],
            ),
            child: Text(
              '${rarity == 'legend' ? '♛ ' : rarity == 'premium' ? '✦ ' : rarity == 'gold' ? '★ ' : ''}${rarityLabels[rarity]}',
              style: TextStyle(fontSize: 9.5, color: labelColor, fontWeight: FontWeight.w900),
            ),
          ),
        ),
        if (rarity == 'legend')
          PositionedDirectional(
            top: -9,
            end: -5,
            child: Transform.scale(
              scale: .92 + pulse * .18,
              child: const CircleAvatar(
                radius: 10,
                backgroundColor: Color(0xFFFFD166),
                child: Text('★', style: TextStyle(fontSize: 9, color: Color(0xFF7F1D1D))),
              ),
            ),
          ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    if (MediaQuery.maybeOf(context)?.disableAnimations ?? false) {
      return _paint(.25);
    }
    return RepaintBoundary(
      child: AnimatedBuilder(
        animation: _controller,
        builder: (_, __) => _paint(_controller.value),
      ),
    );
  }
}

class CardDuelStatsMini extends StatelessWidget {
  const CardDuelStatsMini({super.key, required this.item});
  final Map item;

  @override
  Widget build(BuildContext context) {
    final values = <(String, Object?)>[
      ('حمله', item['duel_attack']),
      ('دفاع', item['duel_defense']),
      ('سرعت', item['duel_speed']),
      ('تکنیک', item['duel_technique']),
      ('گل', item['duel_goal_chance']),
      ('انرژی', item['duel_energy']),
    ];
    return Wrap(
      spacing: 3,
      runSpacing: 3,
      alignment: WrapAlignment.center,
      children: [
        for (final value in values)
          Container(
            width: 46,
            padding: const EdgeInsets.symmetric(vertical: 2.5),
            decoration: BoxDecoration(
              color: Colors.black.withValues(alpha: .30),
              borderRadius: BorderRadius.circular(7),
            ),
            child: Text(
              '${value.$1} ${value.$2 ?? 0}',
              textAlign: TextAlign.center,
              style: const TextStyle(
                fontSize: 8.2,
                color: Colors.white70,
                fontWeight: FontWeight.w800,
              ),
            ),
          ),
      ],
    );
  }
}
