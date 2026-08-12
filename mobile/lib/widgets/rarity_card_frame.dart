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
  'normal': [Color(0xFF22C55E), Color(0xFF334155)],
  'silver': [Color(0xFFF8FAFC), Color(0xFF64748B)],
  'gold': [Color(0xFFFFF0A3), Color(0xFFB77900)],
  'premium': [Color(0xFF38BDF8), Color(0xFF7C3AED)],
  'legend': [Color(0xFFFFD166), Color(0xFFEF4444)],
};

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
    duration: const Duration(milliseconds: 3200),
  )..repeat();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Widget _paint(double t) {
    final rarity = rarityColors.containsKey(widget.rarity) ? widget.rarity! : 'normal';
    final colors = rarityColors[rarity]!;
    final pulse = math.sin(t * math.pi).abs();
    return Stack(
      clipBehavior: Clip.none,
      children: [
        Container(
          padding: EdgeInsets.all(widget.padding),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(widget.borderRadius),
            gradient: SweepGradient(
              transform: GradientRotation(t * math.pi * 2),
              colors: [...colors, const Color(0xFF071522), colors.first],
            ),
            boxShadow: [
              BoxShadow(
                color: colors.last.withValues(alpha: .24 + pulse * .30),
                blurRadius: 12 + pulse * 12,
                offset: const Offset(0, 6),
              ),
            ],
          ),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(widget.borderRadius - widget.padding),
            child: widget.child,
          ),
        ),
        PositionedDirectional(
          top: -7,
          start: 8,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2.5),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(99),
              gradient: LinearGradient(colors: colors),
              border: Border.all(color: Colors.white38),
              boxShadow: const [BoxShadow(color: Colors.black54, blurRadius: 7, offset: Offset(0, 3))],
            ),
            child: Text(
              '${rarity == 'legend' ? '♛ ' : rarity == 'premium' ? '✦ ' : ''}${rarityLabels[rarity]}',
              style: const TextStyle(fontSize: 9.5, color: Color(0xFF071522), fontWeight: FontWeight.w900),
            ),
          ),
        ),
        if (rarity == 'legend')
          PositionedDirectional(
            top: -7,
            end: -4,
            child: Transform.scale(
              scale: .9 + pulse * .2,
              child: const CircleAvatar(
                radius: 9,
                backgroundColor: Color(0xFFFFD166),
                child: Text('★', style: TextStyle(fontSize: 8, color: Color(0xFF7F1D1D))),
              ),
            ),
          ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    if (MediaQuery.maybeOf(context)?.disableAnimations ?? false) return _paint(.25);
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
      ('حمله', item['duel_attack']), ('دفاع', item['duel_defense']),
      ('سرعت', item['duel_speed']), ('تکنیک', item['duel_technique']),
      ('گل', item['duel_goal_chance']), ('انرژی', item['duel_energy']),
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
            child: Text('${value.$1} ${value.$2 ?? 0}',
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 8.2, color: Colors.white70, fontWeight: FontWeight.w800)),
          ),
      ],
    );
  }
}
