// Rendering for purchased cosmetics with Anime Plus Star.
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

export function PlusStar() {
  return (
    <span
      className="plusStar"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: '4px',
        color: '#FFD700',
        textShadow: '0 0 8px #FFD700, 0 0 14px rgba(255, 215, 0, 0.6)',
        fontSize: '15px',
      }}
      title="کاربر پلاس"
    >
      ★
    </span>
  );
}

export function DisplayName({ name, cosmetics, level }) {
  const c = cosmetics || {};
  const isPlus = Boolean(c.plus);
  const style = nameColorStyle(c.color);
  return (
    <span className="displayName" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
      {c.club && <ClubBadge club={c.club} />}
      <LevelBadge level={level} />
      <span style={style}>{name || 'کاربر'}</span>
      {isPlus && <PlusStar />}
    </span>
  );
}
