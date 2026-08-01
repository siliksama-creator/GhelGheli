/// Shared, presentation-agnostic helpers used across the whole app.
/// Business logic here is intentionally unchanged from the original
/// implementation — only the location moved so it can be reused cleanly.
library;

const List<String> avatarFiles = [
  'avatar_1_football.png',
  'avatar_2_trophy.png',
  'avatar_3_star.png',
  'avatar_4_rocket.png',
  'avatar_5_lion.png',
  'avatar_6_tiger.png',
  'avatar_7_eagle.png',
  'avatar_8_target.png',
  'avatar_9_bolt.png',
  'avatar_10_crown.png',
];

/// Asset path for a stored avatar key.
///
/// A purchased club crest can stand in for an avatar. It is stored as
/// `club:<slug>` — a bundled avatar filename never contains a colon, so the
/// two namespaces cannot collide — and resolves to the same shop artwork the
/// badge uses rather than a duplicated file.
String avatarAsset(Object? key) {
  final k = (key ?? avatarFiles.first).toString();
  if (k.startsWith('club:')) return 'assets/shop/club_${k.substring(5)}.webp';
  return 'assets/avatars/$k';
}

/// Asset path for a club crest, by slug.
String clubAssetOf(String slug) => 'assets/shop/club_$slug.webp';

class NumberParser {
  NumberParser._();
  static int toInt(Object? v) => int.tryParse('$v') ?? 0;
}
