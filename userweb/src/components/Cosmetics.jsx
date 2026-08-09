// Rendering for purchased cosmetics.
//
// One place so chat, the league table and the profile always agree on what a
// club badge or a name colour looks like. The server decides WHETHER an item
// applies (ownership vs an active Plus); this only draws it.
import React from 'react';
import { SvgIcon } from './IconAsset.jsx';

export const clubImg = slug => (slug ? `/shop/club_${slug}.webp` : null);

export const FRAME_STYLE = {
  gold: 'linear-gradient(135deg,#FFD36B,#B8860B)',
  neon: 'linear-gradient(135deg,#B5EF58,#00D49A)',
  fire: 'linear-gradient(135deg,#FF8A3D,#F43F5E)',
  ice: 'linear-gradient(135deg,#7DD3FC,#2563EB)',
  holo: 'linear-gradient(135deg,#F472B6,#A855F7,#38BDF8,#34D399)',
};

const RAINBOW_DARK = 'linear-gradient(90deg,#F472B6,#A855F7,#38BDF8,#34D399)';

/**
 * استایلِ درون‌خطی برای نامِ رنگی.
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
      onError={e => { e.currentTarget.style.display = 'none'; }} />
  );
}

export function levelTier(level) {
  if (level >= 90) return 'legend';
  if (level >= 60) return 'gold';
  if (level >= 30) return 'silver';
  if (level >= 10) return 'bronze';
  return 'rookie';
}

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
      {c.plus && (
        <span className="plusStarSm" title="عضو طلایی قلقli پلاس" style={{
          color: '#FFD166',
          textShadow: '0 0 10px rgba(255,209,102,0.85)',
          fontSize: '13px',
          marginInlineStart: '4px',
          display: 'inline-block',
          verticalAlign: 'middle',
          lineHeight: '1',
        }}>
          ★
        </span>
      )}
    </b>
  );
}
