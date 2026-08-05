// Rendering for purchased cosmetics.
//
// One place so chat, the league table and the profile always agree on what a
// club badge or a name colour looks like. The server decides WHETHER an item
// applies (ownership vs an active Plus); this only draws it.
import React from 'react';

// Every crest lives at /shop/club_<slug>.webp, so derive the path instead of
// maintaining a map. The hand-written map went stale the moment eleven world
// clubs were added: unlisted slugs rendered no badge at all, silently.
export const clubImg = slug => (slug ? `/shop/club_${slug}.webp` : null);

export const FRAME_STYLE = {
  gold: 'linear-gradient(135deg,#FFD36B,#B8860B)',
  neon: 'linear-gradient(135deg,#B5EF58,#00D49A)',
  fire: 'linear-gradient(135deg,#FF8A3D,#F43F5E)',
  ice: 'linear-gradient(135deg,#7DD3FC,#2563EB)',
  holo: 'linear-gradient(135deg,#F472B6,#A855F7,#38BDF8,#34D399)',
};

// ═══════════════════════════════════════════════════════════════════════════
// رنگِ نامِ خریداری‌شده در تم روشن
// ═══════════════════════════════════════════════════════════════════════════
//
// این پنج رنگ آیتمِ **پولی** فروشگاه‌اند (`shop_items.kind = 'name_color'`).
// همه برای پس‌زمینهٔ تیره انتخاب شده بودند و روی کارتِ سفیدِ تم روشن
// عملاً ناپدید می‌شدند:
//
//     طلایی  #FFC53D → ۱.۵۸:۱      زمردی #00D49A → ۱.۹۳:۱
//     سرخ    #F87171 → ۲.۷۷:۱      آسمانی #60A5FA → ۲.۵۴:۱
//     بنفش   #A855F7 → ۳.۹۶:۱
//
// این بدترین نوعِ باگ است: کاربر بابتِ چیزی پول داده که نصفِ وقت دیده
// نمی‌شود. در چتِ تم روشن، نامِ «چت‌باز» با ۱.۵۸:۱ اندازه‌گیری شد.
//
// راهِ حل: برای هر رنگ یک دوقلوی تیره‌تر با **همان hue و اشباع** ساخته
// شد؛ فقط روشنایی تا رسیدن به ≥۴.۶:۱ روی سفید پایین آمد. کاربر همان
// «طلایی» را می‌بیند، فقط نسخه‌ای که روی کاغذِ سفید هم طلاییِ خواناست.
//
// چرا نگاشتِ صریح و نه `color-mix()`: نگاشت قابلِ تست است. یک تست
// می‌تواند هر مقدار را بسنجد و اگر فردا رنگِ ششمی به فروشگاه اضافه شد
// و اینجا نیامد، تست قرمز می‌شود. با `color-mix` هیچ‌وقت نمی‌فهمیم.
export const NAME_COLOR_LIGHT = {
  '#FFC53D': '#9B6C00', // طلایی  ۱.۵۸ → ۴.۶۳
  '#00D49A': '#008561', // زمردی  ۱.۹۳ → ۴.۶۴
  '#F87171': '#EA0C0C', // سرخ    ۲.۷۷ → ۴.۶۱
  '#60A5FA': '#086FEF', // آسمانی ۲.۵۴ → ۴.۶۴
  '#A855F7': '#9E42F6', // بنفش   ۳.۹۶ → ۴.۶۰
};

/** دوقلوی خوانای یک رنگ روی پس‌زمینهٔ روشن. */
export function lightSafeName(color) {
  if (!color) return color;
  return NAME_COLOR_LIGHT[String(color).toUpperCase()] || color;
}

// گرادیانِ رنگین‌کمان هم همین مشکل را دارد؛ چهار توقفش روی سفید بین
// ۱.۹ تا ۳.۹ بودند. نسخهٔ روشن همان چهار hue است با روشناییِ کمتر.
const RAINBOW_DARK = 'linear-gradient(90deg,#F472B6,#A855F7,#38BDF8,#34D399)';
const RAINBOW_LIGHT = 'linear-gradient(90deg,#C2185B,#7B1FA2,#0264C8,#00795C)';

/**
 * استایلِ درون‌خطی برای نامِ رنگی.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * چرا متغیرِ CSS و نه مقدارِ مستقیم
 * ═══════════════════════════════════════════════════════════════════════
 *
 * استایلِ درون‌خطی بالاترین اولویت را دارد؛ هیچ قانونِ `[data-theme]`ی
 * نمی‌تواند آن را در تم روشن عوض کند (مگر با `!important` که خودش
 * منبعِ باگ‌های قبلیِ همین پروژه بود).
 *
 * پس به‌جای `color`، دو **متغیر** می‌نویسیم و انتخاب را به CSS
 * می‌سپاریم. مزیتِ جانبی: هنگام تعویضِ تم نیازی به رندرِ دوباره نیست،
 * فقط صفتِ `data-theme` عوض می‌شود و مرورگر خودش رنگ را جابه‌جا می‌کند.
 */
export function nameColorStyle(color) {
  if (!color) return undefined;
  if (color === 'rainbow') {
    return {
      '--nc-grad': RAINBOW_DARK,
      '--nc-grad-light': RAINBOW_LIGHT,
      background: 'var(--nc-grad)',
      WebkitBackgroundClip: 'text',
      WebkitTextFillColor: 'transparent',
      backgroundClip: 'text',
    };
  }
  return {
    '--nc': color,
    '--nc-light': lightSafeName(color),
    color: 'var(--nc)',
  };
}

/** Small club badge shown before a name. */
export function ClubBadge({ club }) {
  if (!club) return null;
  return (
    <img className="nameClub" src={clubImg(club)} alt=""
      width="16" height="16" loading="lazy" decoding="async"
      // A crest that 404s (a club retired from the catalogue) should vanish,
      // not leave a broken-image glyph next to someone's name.
      onError={e => { e.currentTarget.style.display = 'none'; }} />
  );
}

/**
 * A display name with its badge, colour and Plus star.
 *
 * `avatarKey` lets the caller say what picture is already shown next to this
 * name. If the user set their crest AS their profile picture, drawing the
 * same crest again beside their name shows it twice in a row — which is what
 * chat did, and it read as a rendering glitch rather than a flourish. The
 * badge is a way to say "I support this club"; once the avatar says it, the
 * badge is redundant.
 */
// ═══════════════════════════════════════════════════════════════════════════
// نشانِ لول — آینهٔ LevelBadge در اپ اندروید
// ═══════════════════════════════════════════════════════════════════════════
//
// سرور لول را کنارِ cosmetics در همان کوئریِ دسته‌ای می‌فرستد، ولی
// وب‌اپ آن را نادیده می‌گرفت. نتیجه: کاربرِ اندروید لولِ همه را
// می‌دید و کاربرِ وب هیچ‌کدام را — یک ناهماهنگیِ آشکار بین دو کلاینتِ
// یک محصول.
//
// رده‌بندی و مرزها **دقیقاً** با نسخهٔ فلاتر یکی است
// (mobile/lib/widgets/level_badge.dart). اگر یکی عوض شود و دیگری نه،
// همان کاربر در دو کلاینت رنگِ متفاوت می‌بیند.
export function levelTier(level) {
  if (level >= 90) return 'legend';
  if (level >= 60) return 'gold';
  if (level >= 30) return 'silver';
  if (level >= 10) return 'bronze';
  return 'rookie';
}

/// نشانِ فشردهٔ لول.
///
/// `null`/`undefined` یعنی «سرور نفرستاده» و چیزی رسم نمی‌شود.
/// **صفر یک لولِ معتبر است** (کاربر تازه) و باید دیده شود — همان
/// تفکیکی که در اپ اندروید هم رعایت شده.
export function LevelBadge({ level }) {
  if (level === null || level === undefined) return null;
  const n = Number(level);
  if (!Number.isFinite(n)) return null;
  return (
    <span className={`lvlBadge lvl-${levelTier(n)}`} title={`لول ${n}`}>
      {n}
    </span>
  );
}

export function DisplayName({
  name, cosmetics, className, onClick, avatarKey, level,
}) {
  const c = cosmetics || {};
  const avatarIsSameCrest = c.club && avatarKey === `club:${c.club}`;
  return (
    <b className={className} onClick={onClick} style={nameColorStyle(c.color)}>
      {!avatarIsSameCrest && <ClubBadge club={c.club} />}
      <LevelBadge level={level} />
      {name}
      {c.plus && <span className="plusStarSm" title="عضو پلاس">⭐</span>}
    </b>
  );
}
