// Rendering for purchased cosmetics.
//
// One place so chat, the league table and the profile always agree on what a
// club badge or a name colour looks like. The server decides WHETHER an item
// applies (ownership vs an active Plus); this only draws it.
import React from 'react';
import { SvgIcon } from './IconAsset.jsx';

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

// نگاشتِ `NAME_COLOR_LIGHT` و `lightSafeName()` حذف شدند — با تک‌تم شدنِ
// اپ دیگر سطحِ روشنی وجود ندارد که رنگ‌ها رویش محو شوند.

const RAINBOW_DARK = 'linear-gradient(90deg,#F472B6,#A855F7,#38BDF8,#34D399)';

/**
 * استایلِ درون‌خطی برای نامِ رنگی.
 *
 * متغیرهای `--nc-light` و `--nc-grad-light` حذف شدند: با تک‌تم شدنِ اپ
 * هیچ قانونِ CSSی مصرفشان نمی‌کرد و فقط دو ویژگیِ مرده روی هر نامِ
 * چت بودند.
 */
export function nameColorStyle(color) {
  if (!color) return undefined;
  if (color === 'rainbow') {
    return {
      background: RAINBOW_DARK,
      WebkitBackgroundClip: 'text',
      WebkitTextFillColor: 'transparent',
      backgroundClip: 'text',
    };
  }
  return { color };
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
      {c.plus && <SvgIcon className="plusStarSm" title="عضو پلاس" name="trophy" size={14} />}
    </b>
  );
}
