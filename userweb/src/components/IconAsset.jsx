import React from 'react';

/**
 * Shared non-emoji visual language for the web app.
 *
 * The Android app uses the same generated transparent assets. SVG fallbacks
 * here keep the web bundle crisp at any DPR without a font-dependent glyph.
 */
export const ASSETS = {
  streak: '/pass/streak_icon.webp',
  gift: '/pass/reward_gift_icon.webp',
  wheel: '/pass/wheel_icon.webp',
  football: '/pass/football_icon.webp',
  glove: '/pass/glove_icon.webp',
  points: '/pass/icon_points.png',
  spins: '/pass/icon_spins.png',
  item: '/pass/icon_item.png',
  medal: '/pass/icon_points.png',
  // سکهٔ لیگ — همان فایلی که اندروید در assets/pass/icon_coin.png دارد،
  // تا نشانِ سکه در دو پلتفرم دقیقاً یکی دیده شود.
  coin: '/pass/icon_coin.png',
};

export function AssetIcon({ name, alt = '', className = '', size = 28 }) {
  const src = ASSETS[name] || (String(name || '').startsWith('/') ? name : ASSETS.item);
  return <img className={`assetIcon ${className}`} src={src} alt={alt} width={size} height={size} />;
}

const PATHS = {
  home: <path d="m4 11 8-7 8 7v9a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9Z" />,
  wallet: <><path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H19a1 1 0 0 1 1 1v3H7a3 3 0 0 0 0 6h13v3a1 1 0 0 1-1 1H6.5A2.5 2.5 0 0 1 4 16.5v-9Z" /><path d="M20 9H7a2 2 0 0 0 0 4h13V9Z" /><circle cx="16.5" cy="11" r=".8" fill="currentColor" stroke="none" /></>,
  gift: <><rect x="3" y="8" width="18" height="13" rx="2" /><path d="M12 8v13M3 12h18M12 8H8.5a2.5 2.5 0 1 1 2.5-2.5V8Zm0 0h3.5A2.5 2.5 0 1 0 13 5.5V8Z" /></>,
  trophy: <><path d="M8 4h8v5a4 4 0 0 1-8 0V4Z" /><path d="M8 6H5a3 3 0 0 0 3 3M16 6h3a3 3 0 0 1-3 3M12 13v4M8 20h8M9 17h6" /></>,
  game: <><path d="M7 8h10a4 4 0 0 1 3.8 5.2l-1.2 4a2.4 2.4 0 0 1-4.3.5L14 16H10l-1.3 1.7a2.4 2.4 0 0 1-4.3-.5l-1.2-4A4 4 0 0 1 7 8Z" /><path d="M7 11v4M5 13h4M16 12h.01M18.5 14h.01" /></>,
  group: <><circle cx="9" cy="8" r="3" /><path d="M3.5 20c.4-3.5 2.3-5.2 5.5-5.2s5.1 1.7 5.5 5.2M16 7a2.5 2.5 0 0 1 0 5M16 14.7c2.5.2 4 1.8 4.5 4.3M17 3v6M14 6h6" /></>,
  support: <><path d="M4 12a8 8 0 0 1 16 0v4a2 2 0 0 1-2 2h-2v-6h4M4 12v6h2v-6H4Z" /><path d="M8 20h5" /></>,
  profile: <><circle cx="12" cy="8" r="3.5" /><path d="M5 21c.5-4.2 2.8-6.2 7-6.2s6.5 2 7 6.2" /></>,
  shop: <><path d="M4 9h16l-1 11H5L4 9Z" /><path d="M6 9 7 4h10l1 5M9 4v5M15 4v5" /></>,
  bell: <><path d="M6 17h12l-1.2-2V10a4.8 4.8 0 0 0-9.6 0v5L6 17Z" /><path d="M10 20h4" /></>,
  camera: <><path d="M4 8h3l1.4-2h7.2L17 8h3v11H4V8Z" /><circle cx="12" cy="13.5" r="3.2" /></>,
  warning: <><path d="m12 3 9 17H3L12 3Z" /><path d="M12 9v5M12 17h.01" /></>,
  lock: <><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
  unlock: <><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 7-2" /></>,
  bulb: <><path d="M8 14c-1.1-.9-2-2.2-2-4a6 6 0 1 1 12 0c0 1.8-.9 3.1-2 4-.7.6-1 1.2-1 2H9c0-.8-.3-1.4-1-2Z" /><path d="M9 19h6M10 22h4" /></>,
  check: <path d="m5 12 4 4L19 6" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></>,
  robot: <><rect x="5" y="7" width="14" height="12" rx="3" /><path d="M12 3v4M9 12h.01M15 12h.01M9 16h6" /></>,
  circle: <circle cx="12" cy="12" r="7" fill="currentColor" stroke="none" />,
};

export function SvgIcon({ name, className = '', size = 22, title }) {
  return (
    <svg className={`svgIcon ${className}`} width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden={title ? undefined : true} role={title ? 'img' : undefined}>
      {title && <title>{title}</title>}
      {PATHS[name] || PATHS.circle}
    </svg>
  );
}

export function UiIcon({ name, ...props }) {
  return ASSETS[name] ? <AssetIcon name={name} {...props} /> : <SvgIcon name={name} {...props} />;
}
