/// Shared rendering rules for purchased cosmetics.
///
/// One place so the shop, chat, the league table, the club roster and the
/// profile always agree on what a crest, a frame or a name colour looks like.
/// The server decides WHETHER an item applies (ownership, Plus, or club
/// membership); this only draws it.
library;

import 'package:flutter/material.dart';

import '../widgets/level_badge.dart';

import 'assets.dart';

/// Crest asset for a club slug.
///
/// Derived, not mapped. The old hand-written map listed only the five
/// original Iranian clubs, so the eleven world clubs added later rendered
/// nothing — silently, because a missing key just fell through to a
/// placeholder icon.
String clubAsset(String? slug) =>
    (slug == null || slug.isEmpty) ? '' : clubAssetOf(slug);

const frameColors = <String, List<Color>>{
  'gold': [Color(0xFFFFD36B), Color(0xFFB8860B)],
  'neon': [Color(0xFFB5EF58), Color(0xFF00D49A)],
  'fire': [Color(0xFFFF8A3D), Color(0xFFF43F5E)],
  'ice': [Color(0xFF7DD3FC), Color(0xFF2563EB)],
  'holo': [Color(0xFFF472B6), Color(0xFFA855F7), Color(0xFF38BDF8)],
};

const rainbowColors = <Color>[
  Color(0xFFF472B6),
  Color(0xFFA855F7),
  Color(0xFF38BDF8),
  Color(0xFF34D399),
];

/// رنگین‌کمانِ تم روشن — همان چهار hue با روشناییِ کمتر.
///
/// چهار توقفِ نسخهٔ تیره روی سفید بین ۱.۹ تا ۳.۹ کنتراست دارند، یعنی
/// نامِ رنگین‌کمانی در تم روشن یک لکهٔ پاستلیِ ناخوانا می‌شد.
const rainbowColorsOnLight = <Color>[
  Color(0xFFC2185B),
  Color(0xFF7B1FA2),
  Color(0xFF0264C8),
  Color(0xFF00795C),
];

// ═══════════════════════════════════════════════════════════════════════════
// دوقلوی روشنِ رنگ‌های نامِ خریداری‌شده
// ═══════════════════════════════════════════════════════════════════════════
//
// این پنج رنگ آیتمِ **پولی** فروشگاه‌اند (`shop_items.kind='name_color'`).
// همه برای پس‌زمینهٔ تیره انتخاب شده بودند و روی سطحِ روشن محو می‌شدند:
//
//     طلایی  #FFC53D → ۱.۵۸:۱      زمردی #00D49A → ۱.۹۳:۱
//     آسمانی #60A5FA → ۲.۵۴:۱      سرخ   #F87171 → ۲.۷۷:۱
//     بنفش   #A855F7 → ۳.۹۶:۱
//
// کاربر بابتِ چیزی پول داده که در تم روشن دیده نمی‌شود — بدترین نوعِ
// باگِ ظاهری، چون مستقیم به خریدِ کاربر وصل است.
//
// هر دوقلو **همان hue و اشباع** را دارد و فقط روشنایی‌اش تا رسیدن به
// ≥۴.۶:۱ روی سفید پایین آمده. پس «طلایی» هنوز طلایی است، نه قهوه‌ای.
//
// این نگاشت باید مو‌به‌مو با `NAME_COLOR_LIGHT` در
// userweb/src/components/Cosmetics.jsx یکی بماند؛ وگرنه همان کاربر در
// اپ و وب دو رنگِ متفاوت می‌بیند. تستِ `name_color_contrast_test.dart`
// هر دو سمت را قفل می‌کند.
const _nameColorOnLight = <int, Color>{
  0xFFFFC53D: Color(0xFF9B6C00), // طلایی  ۱.۵۸ → ۴.۶۳
  0xFF00D49A: Color(0xFF008561), // زمردی  ۱.۹۳ → ۴.۶۴
  0xFFF87171: Color(0xFFEA0C0C), // سرخ    ۲.۷۷ → ۴.۶۱
  0xFF60A5FA: Color(0xFF086FEF), // آسمانی ۲.۵۴ → ۴.۶۴
  0xFFA855F7: Color(0xFF9E42F6), // بنفش   ۳.۹۶ → ۴.۶۰
};

/// Colour for a name in chat / the league table. `rainbow` has no single
/// colour, so callers fall back to a gradient shader.
///
/// [onLight] را وقتی `true` بدهید که متن روی سطحِ روشن می‌نشیند؛ آن‌وقت
/// دوقلوی خوانای همان رنگ برگردانده می‌شود.
Color? nameColorOf(String? payload, {bool onLight = false}) {
  if (payload == null || payload == 'rainbow') return null;
  if (!payload.startsWith('#')) return null;
  final hex = payload.replaceFirst('#', '');
  final v = int.tryParse(hex, radix: 16);
  if (v == null) return null;
  final c = Color(0xFF000000 | v);
  if (!onLight) return c;
  // رنگی که در فهرست نیست دست‌نخورده برمی‌گردد: بهتر از دستکاریِ کورکورانه.
  // اگر فردا رنگِ ششمی به فروشگاه اضافه شود، تست قرمز می‌شود.
  return _nameColorOnLight[c.toARGB32()] ?? c;
}

/// Small club crest drawn before a name.
class ClubBadge extends StatelessWidget {
  const ClubBadge({super.key, required this.club, this.size = 15});

  final String? club;
  final double size;

  @override
  Widget build(BuildContext context) {
    if (club == null || club!.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsetsDirectional.only(end: 4),
      child: Image.asset(
        clubAsset(club),
        width: size,
        height: size,
        fit: BoxFit.contain,
        // THE HOTTEST IMAGE IN THE APP. This badge is drawn beside every
        // chat message and every league row, at 15px, from a 512px source.
        // Without cacheWidth each distinct crest costs 1 MB of decoded
        // bitmap; a chat full of different clubs could alone exceed the
        // 40 MB cache and start evicting everything else.
        cacheWidth: (size * 3).round(),
        // A crest for a club that was retired from the catalogue should
        // vanish, not leave a broken-image box next to someone's name.
        errorBuilder: (_, __, ___) => const SizedBox.shrink(),
      ),
    );
  }
}

/// A display name with its badge, colour and Plus star.
///
/// Mirrors `DisplayName` in userweb/src/components/Cosmetics.jsx so a user
/// looks the same on both clients.
class DisplayName extends StatelessWidget {
  const DisplayName({
    super.key,
    required this.name,
    this.cosmetics,
    this.style,
    this.maxLines = 1,
    this.avatarKey,
    this.level,
  });

  final String name;
  final Map? cosmetics;
  final TextStyle? style;
  final int maxLines;

  /// What picture is already shown next to this name.
  ///
  /// If the user set their crest AS their profile picture, drawing the same
  /// crest again beside their name shows it twice in a row — which read as a
  /// rendering glitch, not a flourish. The badge exists to say "I support
  /// this club"; once the avatar says it, the badge is redundant.
  final Object? avatarKey;

  /// لولِ بازیکن، اگر سرور فرستاده باشد.
  ///
  /// ═════════════════════════════════════════════════════════════════════
  /// چرا اینجا و نه در هر صفحه جداگانه
  /// ═════════════════════════════════════════════════════════════════════
  ///
  /// درخواست مالک: «این لول رو پروفایل افراد در تمامی قسمت ها دیده
  /// بشه».
  ///
  /// `DisplayName` تنها جایی است که نامِ یک کاربر رندر می‌شود —
  /// چت، لیگ، باشگاه، پروفایلِ عمومی، همه از همین می‌آیند. اضافه
  /// کردنِ لول اینجا یعنی «تمامی قسمت ها» با یک تغییر پوشش داده
  /// می‌شود، به‌جای شش تغییرِ جدا که فردا هفتمی‌اش یادمان می‌رود.
  ///
  /// `null` یعنی «نمایش نده»: برای ربات‌ها و هر جایی که سرور لول
  /// نفرستاده. صفر یک لولِ **معتبر** است (کاربر تازه) و باید دیده
  /// شود، پس نمی‌شد از صفر برای «ندارد» استفاده کرد.
  final int? level;

  @override
  Widget build(BuildContext context) {
    final c = cosmetics ?? const {};
    // تمِ فعال تعیین می‌کند کدام نسخهٔ رنگ استفاده شود. `Theme.of` اینجا
    // درست است چون DisplayName همیشه زیرِ MaterialApp رندر می‌شود و با
    // تعویضِ تم خودش دوباره ساخته می‌شود.
    final onLight = Theme.of(context).brightness == Brightness.light;
    final colour = nameColorOf(c['color'] as String?, onLight: onLight);
    final rainbow = c['color'] == 'rainbow';

    Widget text = Text(
      name,
      maxLines: maxLines,
      overflow: TextOverflow.ellipsis,
      style: (style ?? const TextStyle()).copyWith(color: colour),
    );

    if (rainbow) {
      // ShaderMask needs an opaque child colour to tint, so force white
      // before painting the gradient over it.
      text = ShaderMask(
        shaderCallback: (r) => LinearGradient(
          colors: onLight ? rainbowColorsOnLight : rainbowColors,
        ).createShader(r),
        blendMode: BlendMode.srcIn,
        child: Text(
          name,
          maxLines: maxLines,
          overflow: TextOverflow.ellipsis,
          style: (style ?? const TextStyle()).copyWith(color: Colors.white),
        ),
      );
    }

    final club = c['club'] as String?;
    final avatarIsSameCrest =
        club != null && avatarKey?.toString() == 'club:$club';

    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (!avatarIsSameCrest) ClubBadge(club: club),
        if (level != null) ...[
          LevelBadge(level: level!),
          const SizedBox(width: 3),
        ],
        Flexible(child: text),
        if (c['plus'] == true)
          Padding(
            padding: const EdgeInsetsDirectional.only(start: 4),
            child: Container(
              padding: const EdgeInsets.all(3),
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: const RadialGradient(
                  colors: [Color(0x80FFD700), Colors.transparent],
                ),
                boxShadow: const [
                  BoxShadow(
                    color: Color(0xBBFFD700),
                    blurRadius: 14,
                    spreadRadius: 2,
                  ),
                ],
              ),
              child: const Icon(
                Icons.star_rounded,
                size: 21,
                color: Color(0xFFFFD700),
              ),
            ),
          ),
      ],
    );
  }
}
