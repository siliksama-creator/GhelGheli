import 'package:flutter/material.dart';

const frameColors = <String, List<Color>>{
  'gold': [Color(0xFFFFD36B), Color(0xFFB8860B)],
  'neon': [Color(0xFFB5EF58), Color(0xFF00D49A)],
  'fire': [Color(0xFFFF8A3D), Color(0xFFF43F5E)],
  'ice': [Color(0xFF7DD3FC), Color(0xFF2563EB)],
  'holo': [Color(0xFFF472B6), Color(0xFFA855F7), Color(0xFF38BDF8)],
  'blue_fire': [Color(0xFFBAE6FD), Color(0xFF2563EB), Color(0xFF38BDF8)],
  'stadium_frame': [Color(0xFF22C55E), Color(0xFF0EA5E9)],
  'animated_gold': [Color(0xFFB45309), Color(0xFFFFF0A3), Color(0xFFD97706)],
  'club_neon': [Color(0xFFC026D3), Color(0xFF22D3EE)],
  'season_champion': [Color(0xFFFFD166), Color(0xFFDC2626)],
  'champions_night': [Color(0xFF172554), Color(0xFFA78BFA)],
  'pro_holographic': [Color(0xFF22D3EE), Color(0xFFF472B6), Color(0xFFA3E635)],
  'annual_royal_frame': [Color(0xFFFFD166), Color(0xFF7C3AED)],
};

/// Authoritative animated avatar-frame renderer shared by Shop, profiles,
/// chat and every game. The Shop never paints a richer version than runtime.
// ــ چرا استاپ‌های تیره روشن شدند (هم‌سان با وب) ــ
// همان نقصِ وب اینجا هم بود: این رنگ‌ها روی *خودِ حروفِ نام* کشیده می‌شوند،
// پس رنگِ متن‌اند و معیارشان WCAG AA یعنی ۴.۵ است. اندازه‌گیری روی
// پس‌زمینه‌ی کارتِ تیره نشان داد ۸ افکت از ۱۴ رد می‌شوند (بدترین:
// «#A855F7» با ۱.۸۵). چون این‌ها آیتم‌های *خریدنی*‌اند، کاربر بابت
// افکتی پول می‌داد که نامش را محو می‌کرد. فقط استاپِ تیره روشن شد و فام
// دست‌نخورده ماند. مقادیر عیناً با `userweb/src/components/Cosmetics.jsx`
// یکی است — این دو باید همیشه هم‌گام بمانند وگرنه یک کاربر نامش را در
// وب و اندروید دو جور می‌بیند.
const nameGradientColors = <String, List<Color>>{
  'rainbow': rainbowColors,
  '#FFC53D': [Color(0xFFFFF0A3), Color(0xFFFFC53D), Color(0xFFD18B00)], // 3.60
  '#00D49A': [Color(0xFFD9F99D), Color(0xFF00D49A), Color(0xFF06AE7E)], // 2.40
  '#F87171': [Color(0xFFFECACA), Color(0xFFF87171), Color(0xFFF16E8E)], // 2.09
  '#60A5FA': [Color(0xFFE0F2FE), Color(0xFF60A5FA), Color(0xFF6D97F2)], // 2.54
  '#A855F7': [Color(0xFFF3E8FF), Color(0xFFBC7CF9), Color(0xFFAD86EA)], // 1.85
  'gold_gradient': [Color(0xFFFFF0A3), Color(0xFFF59E0B)],
  'green_neon': [Color(0xFFD9F99D), Color(0xFF10B981)],
  'animated_fire': [Color(0xFFFDE047), Color(0xFFF97316), Color(0xFFF37070)], // 3.49
  'calm_rainbow': [Color(0xFF60A5FA), Color(0xFFC084FC), Color(0xFFF9A8D4)],
  'icy_glow': [Color(0xFFE0F2FE), Color(0xFF38BDF8)],
  'digital_typing': [Color(0xFF67E8F9), Color(0xFF22C55E)],
  'mvp_name': [Color(0xFFFFFFFF), Color(0xFFFFD166)],
  'social_team': [Color(0xFFFB7185), Color(0xFFA885F8)], // 3.10
};

const resultTemplateColors = <String, List<Color>>{
  'result_stadium': [Color(0xFF052E16), Color(0xFF0EA5E9)],
  'result_champions': [Color(0xFF172554), Color(0xFF7C3AED)],
  'result_fire': [Color(0xFF450A0A), Color(0xFFF97316)],
  'result_ice': [Color(0xFF082F49), Color(0xFF7DD3FC)],
  'result_gold_mvp': [Color(0xFF422006), Color(0xFFFFD166)],
  'result_friendly': [Color(0xFF312E81), Color(0xFFFB7185)],
  'result_derby': [Color(0xFFB91C1C), Color(0xFF1D4ED8)],
  'result_world_cup': [Color(0xFF064E3B), Color(0xFFFACC15)],
  'annual_royal_result': [Color(0xFF1E1B4B), Color(0xFFFFD166)],
};

BoxDecoration? profileBackgroundDecoration(String? slug) {
  final colors = switch (slug) {
    'locker_room' => const [Color(0xFF3F2A1D), Color(0xFF0F172A)],
    'night_stadium' => const [Color(0xFF020617), Color(0xFF1D4ED8)],
    'player_tunnel' => const [Color(0xFF111827), Color(0xFFF59E0B)],
    'champion_podium' => const [Color(0xFF422006), Color(0xFFFFD166)],
    'training_ground' => const [Color(0xFF052E16), Color(0xFF22C55E)],
    'collection_room' => const [Color(0xFF1E1B4B), Color(0xFFA78BFA)],
    _ => null,
  };
  if (colors == null) return null;
  return BoxDecoration(
    gradient: LinearGradient(
      begin: Alignment.topRight,
      end: Alignment.bottomLeft,
      colors: [colors.first.withValues(alpha: .78), const Color(0xE6030712)],
    ),
    image: DecorationImage(
      image: AssetImage('assets/shop/cosmetics/$slug.webp'),
      fit: BoxFit.cover,
      opacity: .46,
    ),
    borderRadius: BorderRadius.circular(22),
    border: Border.all(color: colors.last.withValues(alpha: .52)),
  );
}

// استاپِ دومِ رنگین‌کمان از #A855F7 (نسبت ۳.۳۲) به #BC7CF9 روشن شد؛
// هم‌سان با `rainbow` در وب.
const rainbowColors = <Color>[
  Color(0xFFF472B6),
  Color(0xFFBC7CF9),
  Color(0xFF38BDF8),
  Color(0xFF34D399),
];

const rainbowColorsOnLight = <Color>[
  Color(0xFFC2185B),
  Color(0xFF7B1FA2),
  Color(0xFF0264C8),
  Color(0xFF00795C),
];

const _nameColorOnLight = <int, Color>{
  0xFFFFC53D: Color(0xFF9B6C00), // طلایی
  0xFF00D49A: Color(0xFF008561), // زمردی
  0xFFF87171: Color(0xFFEA0C0C), // سرخ
  0xFF60A5FA: Color(0xFF086FEF), // آسمانی
  0xFFA855F7: Color(0xFF9E42F6), // بنفش
};

Color? nameColorOf(String? payload, {bool onLight = false}) {
  if (payload == null) return null;
  if (!payload.startsWith('#')) return null;
  final hex = payload.replaceFirst('#', '');
  final v = int.tryParse(hex, radix: 16);
  if (v == null) return null;
  final c = Color(0xFF000000 | v);
  if (!onLight) return c;
  return _nameColorOnLight[c.toARGB32()] ?? c;
}

const profileBadgeLabels = <String, String>{
  'cr7': 'CR7', 'goat': 'GOAT', 'captain': 'CAP',
  'legend': 'LEGEND', 'king': 'KING', 'ace': 'ACE',
};
const profileBadgeIcons = <String, String>{
  'cr7': '7', 'goat': '♛', 'captain': 'C',
  'legend': '★', 'king': '♚', 'ace': 'A',
};
const profileBadgeColors = <String, List<Color>>{
  'cr7': [Color(0xFFF8FAFC), Color(0xFF38BDF8)],
  'goat': [Color(0xFFFFD166), Color(0xFFF97316)],
  'captain': [Color(0xFF22E7A6), Color(0xFF0EA5E9)],
  'legend': [Color(0xFFC084FC), Color(0xFFFFD166)],
  'king': [Color(0xFFFFD166), Color(0xFFEF4444)],
  'ace': [Color(0xFFE0F2FE), Color(0xFF8B5CF6)],
};

/// Exact animated name renderer used by Shop, chat, league, profiles and games.
