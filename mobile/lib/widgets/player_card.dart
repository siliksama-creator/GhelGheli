import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../api_client.dart';
import 'cached_card_image.dart';
import 'rarity_card_frame.dart';

/// تصویر واقعی کارت. هرگز توپ، آواتار فوتبال یا glow را جایگزین نمی‌کند.
Object? cardArtOf(Map? item) {
  if (item == null) return null;
  for (final key in const [
    'imageUrl',
    'image_url',
    'frontImageUrl',
    'front_image_url',
  ]) {
    final value = item[key];
    if (value == null) continue;
    final text = '$value'.trim();
    if (text.isEmpty) continue;
    if (text.contains('football') ||
        text.contains('ball.webp') ||
        text.contains('empty_collection') ||
        text.contains('avatar_1_football')) {
      continue;
    }
    return text;
  }
  return null;
}

String cardNameOf(Map? item) => '${item?['name'] ?? 'کارت'}';

String cardIdOf(Map? item) =>
    '${item?['cardTypeId'] ?? item?['card_type_id'] ?? item?['id'] ?? ''}';

String cardRarityOf(Map? item) {
  final raw = '${item?['rarity'] ?? item?['duel_rarity'] ?? 'normal'}';
  return rarityColors.containsKey(raw) ? raw : 'normal';
}

int cardQtyOf(Map? item) {
  final raw = item?['quantity'] ?? item?['registered_count'] ?? 1;
  if (raw is int) return raw;
  return int.tryParse('$raw'.split('.').first) ?? 1;
}

/// کارت کلکسیونی مشترک برای Inventory، Deck، Battle و Preview.
class PlayerCard extends StatelessWidget {
  const PlayerCard({
    super.key,
    required this.card,
    this.selected = false,
    this.enabled = true,
    this.compact = false,
    this.showStats = true,
    this.showName = true,
    this.winner = false,
    this.loser = false,
    this.onTap,
    this.width,
    this.height,
  });

  final Map card;
  final bool selected;
  final bool enabled;
  final bool compact;
  final bool showStats;
  final bool showName;
  final bool winner;
  final bool loser;
  final VoidCallback? onTap;
  final double? width;
  final double? height;

  @override
  Widget build(BuildContext context) {
    final rarity = cardRarityOf(card);
    final art = cardArtOf(card);
    final qty = cardQtyOf(card);
    final radius = compact ? 16.0 : 20.0;
    final child = AnimatedScale(
      scale: selected ? 1.035 : 1,
      duration: const Duration(milliseconds: 180),
      curve: Curves.easeOutBack,
      child: AnimatedOpacity(
        duration: const Duration(milliseconds: 180),
        opacity: enabled ? 1 : 0.38,
        child: RarityCardFrame(
          rarity: rarity,
          borderRadius: radius,
          padding: compact ? 3 : 4,
          child: Material(
            color: const Color(0xFF050A12),
            child: InkWell(
              onTap: enabled && onTap != null
                  ? () {
                      HapticFeedback.selectionClick();
                      onTap!();
                    }
                  : null,
              child: Stack(
                fit: StackFit.expand,
                children: [
                  ColoredBox(
                    color: const Color(0xFF02070D),
                    child: art == null
                        ? _PaintedFace(card: card)
                        : CachedCardImage(
                            url: art,
                            fit: BoxFit.contain,
                            // یک فایل ۴۸۰px بین اینونتوری، چیدمان و صحنهٔ
                            // نبرد مشترک است؛ کارت فشرده فقط decode کوچک‌تر
                            // می‌کند تا RAM هدر نرود.
                            downloadWidth: 420,
                            cacheWidth: compact ? 280 : 420,
                            placeholder: _PaintedFace(
                              card: card,
                              loading: true,
                            ),
                          ),
                  ),
                  const DecoratedBox(
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                        colors: [
                          Colors.transparent,
                          Color(0x00000000),
                          Color(0xCC02060C),
                        ],
                        stops: [0.45, 0.68, 1],
                      ),
                    ),
                  ),
                  if (winner)
                    const DecoratedBox(
                      decoration: BoxDecoration(
                        border: Border.fromBorderSide(
                          BorderSide(color: Color(0xFFFFD166), width: 2),
                        ),
                        color: Color(0x33FFD166),
                      ),
                    ),
                  if (loser) const ColoredBox(color: Color(0x66020810)),
                  if (selected)
                    const Align(
                      alignment: Alignment.topRight,
                      child: Padding(
                        padding: EdgeInsets.all(6),
                        child: CircleAvatar(
                          radius: 12,
                          backgroundColor: Color(0xFFFFD166),
                          child: Icon(
                            Icons.check_rounded,
                            size: 16,
                            color: Color(0xFF07111B),
                          ),
                        ),
                      ),
                    ),
                  if (qty > 1)
                    Align(
                      alignment: Alignment.topLeft,
                      child: Padding(
                        padding: const EdgeInsets.all(6),
                        child: _MiniChip(text: '×${faNum(qty)}'),
                      ),
                    ),
                  if (winner)
                    const Align(
                      alignment: Alignment.center,
                      child: _WinnerStamp(),
                    ),
                  Positioned(
                    left: 6,
                    right: 6,
                    bottom: 6,
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        if (showName)
                          Text(
                            cardNameOf(card),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            textAlign: TextAlign.center,
                            style: TextStyle(
                              color: Colors.white,
                              fontWeight: FontWeight.w900,
                              fontSize: compact ? 10 : 12.5,
                              shadows: const [
                                Shadow(color: Colors.black87, blurRadius: 8),
                              ],
                            ),
                          ),
                        if (showStats && !compact) ...[
                          const SizedBox(height: 4),
                          CardDuelStatsMini(item: card),
                        ],
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
    if (width == null && height == null) return child;
    return SizedBox(width: width, height: height, child: child);
  }
}

class _MiniChip extends StatelessWidget {
  const _MiniChip({required this.text});
  final String text;
  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
    decoration: BoxDecoration(
      color: Colors.black.withValues(alpha: 0.72),
      borderRadius: BorderRadius.circular(99),
    ),
    child: Text(
      text,
      style: const TextStyle(
        color: Colors.white,
        fontSize: 10,
        fontWeight: FontWeight.w900,
      ),
    ),
  );
}

class _WinnerStamp extends StatelessWidget {
  const _WinnerStamp();
  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
    decoration: BoxDecoration(
      color: const Color(0xF0FFD166),
      borderRadius: BorderRadius.circular(99),
      boxShadow: const [BoxShadow(color: Color(0xAAFFD166), blurRadius: 18)],
    ),
    child: const Text(
      'برنده',
      style: TextStyle(
        color: Color(0xFF3B2500),
        fontWeight: FontWeight.w900,
        letterSpacing: 1.4,
        fontSize: 12,
      ),
    ),
  );
}

/// وقتی تصویر شبکه نیست، یک کارت نقاشی‌شده نشان می‌دهیم — نه توپ.
class _PaintedFace extends StatelessWidget {
  const _PaintedFace({required this.card, this.loading = false});
  final Map card;
  final bool loading;

  @override
  Widget build(BuildContext context) {
    final rarity = cardRarityOf(card);
    final colors = rarityColors[rarity] ?? rarityColors['normal']!;
    final name = cardNameOf(card);
    final initial = name.isEmpty
        ? 'ک'
        : String.fromCharCodes(name.runes.take(1));
    return DecoratedBox(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            colors.first.withValues(alpha: 0.35),
            const Color(0xFF07111D),
            colors.last.withValues(alpha: 0.45),
          ],
        ),
      ),
      child: Center(
        child: loading
            ? const SizedBox(
                width: 22,
                height: 22,
                child: CircularProgressIndicator(strokeWidth: 2),
              )
            : Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  CircleAvatar(
                    radius: 22,
                    backgroundColor: colors.first.withValues(alpha: 0.28),
                    child: Text(
                      initial,
                      style: TextStyle(
                        color: colors.first,
                        fontWeight: FontWeight.w900,
                        fontSize: 20,
                      ),
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    rarityLabels[rarity] ?? rarity,
                    style: TextStyle(
                      color: colors.first,
                      fontSize: 10,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ],
              ),
      ),
    );
  }
}
