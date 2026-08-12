import React from 'react';

export const RARITY_META = {
  normal: { label:'معمولی', icon:'●' },
  silver: { label:'نقره‌ای', icon:'◆' },
  gold: { label:'طلایی', icon:'★' },
  premium: { label:'پرمیوم', icon:'✦' },
  legend: { label:'لجند', icon:'♛' },
};

export function CardRarityFrame({ rarity = 'normal', children, className = '' }) {
  const key = RARITY_META[rarity] ? rarity : 'normal';
  const meta = RARITY_META[key];
  return <div className={`rarityCardFrame rarity-${key} ${className}`}>
    <span className="rarityCardLabel"><i>{meta.icon}</i>{meta.label}</span>
    <div className="rarityCardContent">{children}</div>
    <span className="rarityCardShine" aria-hidden="true" />
  </div>;
}
