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

String avatarAsset(Object? key) =>
    'assets/avatars/${(key ?? avatarFiles.first).toString()}';

class NumberParser {
  NumberParser._();
  static int toInt(Object? v) => int.tryParse('$v') ?? 0;
}
