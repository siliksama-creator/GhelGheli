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
  points: '/pass/icon_points.webp',
  spins: '/pass/icon_spins.webp',
  item: '/pass/icon_item.webp',
  medal: '/pass/icon_points.webp',
  // سکهٔ لیگ — همان فایلی که اندروید در assets/pass/icon_coin.webp دارد،
  // تا نشانِ سکه در دو پلتفرم دقیقاً یکی دیده شود.
  coin: '/pass/icon_coin.webp',
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

  // ── دورِ ۲۳: جایگزینِ ایموجی‌های متنی ──
  //
  // اینها همان معناهایی‌اند که تا دیروز با 🚫 / 📅 / ⚔️ ... نوشته می‌شدند.
  // ایموجی را سیستم‌عاملِ کاربر رسم می‌کند: روی اندرویدِ سامسونگ یک شکل
  // است، روی ویندوز شکلی دیگر، و هیچ‌کدام با رنگ‌بندیِ برنامه نمی‌خواند.
  // مسیرِ وکتور با `currentColor` رنگ می‌گیرد، پس همه‌جا یکی است.
  ban: <><circle cx="12" cy="12" r="8" /><path d="m6.5 6.5 11 11" /></>,
  calendar: <><rect x="4" y="6" width="16" height="14" rx="2" /><path d="M4 10h16M8 4v4M16 4v4" /></>,
  swords: <><path d="M4 4h3l9 9-3 3-9-9V4ZM20 4h-3l-4 4 3 3 4-4V4Z" /><path d="m5 19 3-3M19 19l-3-3M3 20l2 1 1-2M21 20l-2 1-1-2" /></>,
  shield: <path d="M12 3.5 5 6v6c0 4 3 7 7 8.5 4-1.5 7-4.5 7-8.5V6l-7-2.5Z" />,
  flame: <path d="M12 3s5 4 5 8a5 5 0 0 1-10 0c0-1.6.8-3 1.6-4 .2 1.2.9 2 1.9 2 1.4 0 1.9-1.4 1.5-6Z" />,
  bolt: <path d="M13 3 5.5 13.5H11l-1 7.5 8-11H12l1-7Z" />,
  sparkle: <path d="M12 3.5 13.8 9 19 10.8 13.8 12.6 12 18l-1.8-5.4L5 10.8 10.2 9 12 3.5Z" />,
  football: <><circle cx="12" cy="12" r="8.5" /><path d="m12 7.5 3.2 2.4-1.2 3.9h-4L8.8 9.9 12 7.5Z" /><path d="M12 3.5v4M4.2 9.6 8.8 9.9M19.8 9.6l-4.6.3M6.6 19l3.4-5.2M17.4 19 14 13.8" /></>,
  handshake: <><path d="M3 11.5 7 8h4l2 1.6L11 11l-1.5-1" /><path d="M21 11.5 17 8h-3l-3 2.6 3.2 2.7 1.3-1.2 3 2.7" /><path d="M3 11.5v3l3 2.5M21 11.5v3l-3 2.5" /></>,
  medal1: <><circle cx="12" cy="14.5" r="5" /><path d="M8.5 10 6 3h5l1.5 4M15.5 10 18 3h-5" /><path d="M12 12.2v4.6M10.9 12.9l1.1-.7" /></>,
  medal2: <><circle cx="12" cy="14.5" r="5" /><path d="M8.5 10 6 3h5l1.5 4M15.5 10 18 3h-5" /><path d="M10.5 13.2c1.5-1.4 3-.4 2.6.9-.3 1-2.6 2.3-2.6 2.3h3" /></>,
  medal3: <><circle cx="12" cy="14.5" r="5" /><path d="M8.5 10 6 3h5l1.5 4M15.5 10 18 3h-5" /><path d="M10.6 12.8h2.8l-1.6 1.9c1.4 0 1.9.8 1.6 1.6-.3.9-2 1.1-2.9.3" /></>,
  door: <><path d="M14 3.5 6.5 5v14L14 20.5V3.5Z" /><path d="M14 5h3.5v14H14M11 12.2h.01" /></>,
  soundOn: <><path d="M4 9.5h3L11 6v12L7 14.5H4v-5Z" /><path d="M14.5 9a4 4 0 0 1 0 6M17 6.5a7.5 7.5 0 0 1 0 11" /></>,
  soundOff: <><path d="M4 9.5h3L11 6v12L7 14.5H4v-5Z" /><path d="m15 9.5 5 5M20 9.5l-5 5" /></>,
  party: <><path d="M4 20.5 8.5 8l7.5 7.5L4 20.5Z" /><path d="M14 3.5c0 1.5 1.5 1.5 1.5 3M18 6c1 .4 1.5 1.5 1 2.5M20.5 12.5c-.6.9-1.8 1-2.6.3M17.5 3l.01.01M21 8.5l.01.01" /></>,
  broken: <path d="M12 20.5c-2-1.6-7-4.6-7-9A4 4 0 0 1 12 9a4 4 0 0 1 7 2.5c0 4.4-5 7.4-7 9Zm0-11.5-1.5 3.2h3L12 15.5" />,
  star: <path d="M12 3.6 14.5 9l5.9.6-4.4 4 1.2 5.8L12 16.5 6.8 19.4 8 13.6 3.6 9.6 9.5 9 12 3.6Z" />,
  key: <><circle cx="8" cy="14" r="4" /><path d="m11 11 8-8M17 5l2 2M15.5 6.5l2 2" /></>,
  person: <><circle cx="12" cy="8" r="3.5" /><path d="M5 21c.5-4.2 2.8-6.2 7-6.2s6.5 2 7 6.2" /></>,
  people: <><circle cx="9" cy="8" r="3" /><path d="M3.5 20c.4-3.5 2.3-5.2 5.5-5.2s5.1 1.7 5.5 5.2M16 7a2.5 2.5 0 0 1 0 5c2.5.2 4 1.8 4.5 4.3" /></>,
  card: <><rect x="3" y="5.5" width="18" height="13" rx="2" /><path d="M3 10h18M6.5 14.5h4" /></>,
  link: <><path d="M10.5 13.5a3.5 3.5 0 0 0 5 0l2.5-2.5a3.54 3.54 0 0 0-5-5L11.5 7.5" /><path d="M13.5 10.5a3.5 3.5 0 0 0-5 0L6 13a3.54 3.54 0 0 0 5 5l1.5-1.5" /></>,
  moon: <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" />,
  pin: <><path d="M14.5 3 21 9.5l-3.2 1.2-3.4 6.3-4.4-4.4 6.3-3.4L14.5 3Z" /><path d="m9.5 14.5-5.5 6" /></>,
  chat: <><path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 3.5V16H6.5A2.5 2.5 0 0 1 4 13.5v-7Z" /><path d="M8.5 10h.01M12 10h.01M15.5 10h.01" /></>,
  heart: <path d="M12 20.5C9.5 18.5 4 15 4 10.8A4.3 4.3 0 0 1 12 8.5a4.3 4.3 0 0 1 8 2.3c0 4.2-5.5 7.7-8 9.7Z" />,
  idcard: <><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="8.5" cy="11" r="2" /><path d="M5.5 16c.3-1.6 1.4-2.4 3-2.4s2.7.8 3 2.4M14 10h4M14 13.5h3" /></>,
  coins: <><ellipse cx="12" cy="7" rx="7" ry="3" /><path d="M5 7v5c0 1.7 3.1 3 7 3s7-1.3 7-3V7M5 12v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5" /></>,
  hand: <><path d="M9 12V5.5a1.5 1.5 0 0 1 3 0V11" /><path d="M12 11V4.5a1.5 1.5 0 0 1 3 0V11" /><path d="M15 11V6.5a1.5 1.5 0 0 1 3 0V14a6 6 0 0 1-6 6h-.5A6.5 6.5 0 0 1 5 13.5V11a1.5 1.5 0 0 1 3 0" /></>,
  crown: <path d="M4 17.5 3 7l5 3.5L12 4l4 6.5L21 7l-1 10.5H4Z" />,
  target: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="4" /><circle cx="12" cy="12" r=".9" fill="currentColor" stroke="none" /></>,
  question: <><circle cx="12" cy="12" r="8.5" /><path d="M9.7 9.3a2.4 2.4 0 0 1 4.6.9c0 1.6-2.3 1.9-2.3 3.3M12 16.8h.01" /></>,
  ticket: <><path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h13A1.5 1.5 0 0 1 20 8.5v1.8a2 2 0 0 0 0 3.4v1.8a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 15.5v-1.8a2 2 0 0 0 0-3.4V8.5Z" /><path d="M13 7v2M13 15v2" /></>,
  glove: <><path d="M6.5 20v-4.5c-1.2-1-2-2.5-2-4.3V7a2 2 0 0 1 4 0v3" /><path d="M8.5 10V5.5a2 2 0 0 1 4 0V10M12.5 10V6.5a2 2 0 0 1 4 0v6c0 3-1.5 5-3 7.5" /></>,
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
