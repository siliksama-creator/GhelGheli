import React from 'react';

import CachedImg from './CachedImg.jsx';
import { CardRarityFrame } from './CardRarityFrame.jsx';
import {
  CARD_RARITY_META,
  cardArtOf,
  cardNameOf,
  cardPointValueOf,
  cardPowerOf,
  cardQtyOf,
  cardRarityOf,
  cardStatsOf,
} from '../lib/cards.js';
import { fa } from '../lib/api.js';

function CardFallback({ item, loading = false }) {
  const rarity = cardRarityOf(item);
  const meta = CARD_RARITY_META[rarity] || CARD_RARITY_META.normal;
  const initial = Array.from(cardNameOf(item))[0] || 'ک';
  return (
    <div className={`ggCardFallback ${item?.id?.startsWith('bot-') ? 'bot' : ''}`} style={{ '--card-accent': meta.accent }}>
      {loading ? (
        <span className="ggCardSpinner" aria-hidden="true" />
      ) : (
        <>
          <span className="ggCardFallbackGlyph" aria-hidden="true">{item?.id?.startsWith('bot-') ? '🤖' : initial}</span>
          <b>{meta.label}</b>
          <small>{item?.effectLabel || item?.effect || 'بدون افکت'}</small>
        </>
      )}
    </div>
  );
}

function StatGrid({ item, compact }) {
  const values = cardStatsOf(item);
  if (compact) return null;
  return (
    <div className="ggCardStats">
      {values.map(([label, value]) => (
        <span key={label}><i>{label}</i><b>{fa(value || 0)}</b></span>
      ))}
    </div>
  );
}

export default function PlayerCard({
  item,
  selected = false,
  compact = false,
  disabled = false,
  winner = false,
  loser = false,
  showStats = true,
  showName = true,
  showFooter = true,
  badge = '',
  onClick,
  className = '',
}) {
  const rarity = cardRarityOf(item);
  const meta = CARD_RARITY_META[rarity] || CARD_RARITY_META.normal;
  const art = cardArtOf(item);
  const qty = cardQtyOf(item);
  const power = cardPowerOf(item);
  const pointValue = cardPointValueOf(item);

  return (
    <CardRarityFrame rarity={rarity} className={`ggPlayerCardFrame ${compact ? 'compact' : ''} ${className}`}>
      <button type="button"
        className={[
          'ggPlayerCard',
          compact && 'compact',
          selected && 'selected',
          disabled && 'disabled',
          winner && 'winner',
          loser && 'loser',
        ].filter(Boolean).join(' ')}
        style={{ '--card-accent': meta.accent }}
        data-clickable={Boolean(onClick) && !disabled}
        onClick={disabled ? undefined : onClick}
        disabled={disabled}
      >
        <span className="ggCardAurora" aria-hidden="true" />
        <span className="ggCardSweep" aria-hidden="true" />
        <div className="ggCardArt">
          <div className="ggCardFallbackWrap">
            <CardFallback item={item} loading={!art} />
          </div>
          {art
            ? <CachedImg src={art} alt={cardNameOf(item)} loading="lazy" decoding="async" onError={event => {
                event.currentTarget.style.display = 'none';
              }} />
            : null}
          {!!power && <span className="ggCardPower">{fa(power)}</span>}
          {selected && <span className="ggCardCheck">✓</span>}
          {qty > 1 && <span className="ggCardQty">×{fa(qty)}</span>}
          {badge && <span className="ggCardBadge">{badge}</span>}
          {winner && <span className="ggCardWinnerStamp">WINNER</span>}
          {loser && <span className="ggCardLoserVeil" aria-hidden="true" />}
        </div>
        <div className="ggCardBody">
          {showName && <b className="ggCardName">{cardNameOf(item)}</b>}
          {showFooter && (
            <div className="ggCardMeta">
              <span>{meta.label}</span>
              <small>{fa(pointValue)} امتیاز</small>
            </div>
          )}
          {showStats && <StatGrid item={item} compact={compact} />}
        </div>
      </button>
    </CardRarityFrame>
  );
}
