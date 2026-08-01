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

/** Inline style for a coloured display name. */
export function nameColorStyle(color) {
  if (!color) return undefined;
  if (color === 'rainbow') {
    return {
      background: 'linear-gradient(90deg,#F472B6,#A855F7,#38BDF8,#34D399)',
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

/** A display name with its badge, colour and Plus star. */
export function DisplayName({ name, cosmetics, className, onClick }) {
  const c = cosmetics || {};
  return (
    <b className={className} onClick={onClick} style={nameColorStyle(c.color)}>
      <ClubBadge club={c.club} />
      {name}
      {c.plus && <span className="plusStarSm" title="عضو پلاس">⭐</span>}
    </b>
  );
}
