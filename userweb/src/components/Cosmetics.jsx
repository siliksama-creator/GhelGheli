// Shared rendering for server-resolved cosmetics. Slugs are visual only; the
// backend has already checked ownership/Plus before including them.
import React from 'react';

export const clubImg = slug => (slug ? `/shop/club_${slug}.webp` : null);

export const FRAME_STYLE = {
  gold: 'linear-gradient(135deg,#FFD36B,#B8860B)',
  neon: 'linear-gradient(135deg,#B5EF58,#00D49A)',
  fire: 'linear-gradient(135deg,#FF8A3D,#F43F5E)',
  ice: 'linear-gradient(135deg,#7DD3FC,#2563EB)',
  holo: 'linear-gradient(135deg,#F472B6,#A855F7,#38BDF8,#34D399)',
  blue_fire: 'linear-gradient(135deg,#BAE6FD,#2563EB,#38BDF8)',
  stadium_frame: 'linear-gradient(135deg,#22C55E,#0EA5E9)',
  animated_gold: 'linear-gradient(110deg,#B45309,#FFF0A3,#D97706)',
  club_neon: 'linear-gradient(135deg,#C026D3,#22D3EE)',
  season_champion: 'linear-gradient(135deg,#FFD166,#DC2626,#FFD166)',
  champions_night: 'linear-gradient(135deg,#172554,#A78BFA)',
  pro_holographic: 'linear-gradient(135deg,#22D3EE,#F472B6,#A3E635)',
  annual_royal_frame: 'linear-gradient(135deg,#FFD166,#7C3AED,#FFD166)',
};

const NAME_GRADIENTS = {
  rainbow: ['#F472B6', '#A855F7', '#38BDF8', '#34D399'],
  gold_gradient: ['#FFF0A3', '#F59E0B'],
  green_neon: ['#D9F99D', '#10B981'],
  animated_fire: ['#FDE047', '#F97316', '#EF4444'],
  calm_rainbow: ['#60A5FA', '#C084FC', '#F9A8D4'],
  icy_glow: ['#E0F2FE', '#38BDF8'],
  digital_typing: ['#67E8F9', '#22C55E'],
  mvp_name: ['#FFFFFF', '#FFD166'],
  social_team: ['#FB7185', '#8B5CF6'],
};

export const PROFILE_BACKGROUNDS = {
  locker_room: 'linear-gradient(rgba(3,7,18,.38),rgba(3,7,18,.64)),url("/shop/cosmetics/locker_room.webp") center/cover no-repeat',
  night_stadium: 'linear-gradient(rgba(2,6,23,.22),rgba(2,6,23,.58)),url("/shop/cosmetics/night_stadium.webp") center/cover no-repeat',
  player_tunnel: 'linear-gradient(rgba(3,7,18,.28),rgba(3,7,18,.66)),url("/shop/cosmetics/player_tunnel.webp") center/cover no-repeat',
  champion_podium: 'linear-gradient(rgba(3,7,18,.28),rgba(3,7,18,.62)),url("/shop/cosmetics/champion_podium.webp") center/cover no-repeat',
  training_ground: 'linear-gradient(rgba(3,20,15,.28),rgba(3,7,18,.64)),url("/shop/cosmetics/training_ground.webp") center/cover no-repeat',
  collection_room: 'linear-gradient(rgba(8,5,30,.25),rgba(3,7,18,.66)),url("/shop/cosmetics/collection_room.webp") center/cover no-repeat',
};

export const RESULT_PALETTES = {
  result_stadium: ['#052E16', '#0EA5E9'], result_champions: ['#172554', '#7C3AED'],
  result_fire: ['#450A0A', '#F97316'], result_ice: ['#082F49', '#7DD3FC'],
  result_gold_mvp: ['#422006', '#FFD166'], result_friendly: ['#312E81', '#FB7185'],
  result_derby: ['#B91C1C', '#1D4ED8'], result_world_cup: ['#064E3B', '#FACC15'],
  annual_royal_result: ['#1E1B4B', '#FFD166'],
};

export function profileBackgroundStyle(slug) {
  return slug ? { background: PROFILE_BACKGROUNDS[slug] || undefined } : {};
}

export function nameColorStyle(color) {
  if (!color) return undefined;
  const colors = NAME_GRADIENTS[color];
  if (!colors) return { color };
  const special = color === 'green_neon' || color === 'icy_glow'
    ? { filter: `drop-shadow(0 0 5px ${colors[1]})` } : {};
  return {
    background: `linear-gradient(90deg,${colors.join(',')})`,
    WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
    fontWeight: 900,
    ...(color === 'digital_typing' ? { borderLeft: '1px solid #67E8F9', paddingLeft: '2px' } : {}),
    ...special,
  };
}

export function ClubBadge({ club }) {
  if (!club) return null;
  return <img className="nameClub" src={clubImg(club)} alt="" width="16" height="16"
    loading="lazy" decoding="async" onError={e => { e.currentTarget.style.display = 'none'; }} />;
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
  return <span className={`lvlBadge lvl-${levelTier(n)}`} title={`لول ${n}`}>{n}</span>;
}

export function PlusStar({ annual = false }) {
  return <span className="plusStar" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    marginRight: 4, color: annual ? '#E9D5FF' : '#FFD700',
    textShadow: annual ? '0 0 8px #A78BFA,0 0 14px #FFD166' : '0 0 8px #FFD700,0 0 14px rgba(255,215,0,.6)',
    fontSize: 15 }} title={annual ? 'کاربر پلاس سالانه' : 'کاربر پلاس'}>{annual ? '✦' : '★'}</span>;
}

export function CosmeticFrame({ cosmetics, children, style, className = '' }) {
  const frame = cosmetics?.frame;
  const gradient = FRAME_STYLE[frame];
  return <div className={`cosmeticFrame ${className}`} style={{ position: 'relative', borderRadius: 18,
    ...(gradient ? { border: '2px solid transparent', background: `${gradient} border-box`, boxShadow: '0 0 18px rgba(56,189,248,.15)' } : {}), ...style }}>
    <div style={{ borderRadius: 'inherit', height: '100%', background: 'rgba(7,21,34,.88)' }}>{children}</div>
  </div>;
}

export function DisplayName({ name, cosmetics, level, showTitle = false }) {
  const c = cosmetics || {};
  const club = c.club || c.clubBadge;
  const color = c.color || c.nameColor;
  return <span className="displayName" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
    {club && <ClubBadge club={club} />}
    <LevelBadge level={level} />
    <span style={nameColorStyle(color)}>{name || 'کاربر'}</span>
    {c.plus && <PlusStar annual={Boolean(c.annual)} />}
    {showTitle && c.title && <small style={{ color: '#FFD166', fontSize: 8, border: '1px solid rgba(255,209,102,.35)', borderRadius: 999, padding: '1px 5px' }}>{c.title}</small>}
  </span>;
}
