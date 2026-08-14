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

// ═══════════════════════════════════════════════════════════════════════════
//  ⚠️⚠️ باگ: کارتِ بدونِ تصویر برای همیشه اسپینر نشان می‌داد
// ═══════════════════════════════════════════════════════════════════════════
//
// ── گزارشِ مالک ──
//   «نسخه وب کاملا بهم ریختست و اصلا کپی اپلیکیشن موبایل نشده»
//
// ── چیزی که واقعاً اتفاق می‌افتاد ──
//
// جانشین با `loading={!art}` صدا زده می‌شد. یعنی «تصویر نداری؟ پس در
// حالِ بارگذاری‌ای». ولی این دو **اصلاً یکی نیستند**:
//
//   • `art` هست ولی هنوز نیامده  → واقعاً در حالِ بارگذاری
//   • `art` اصلاً وجود ندارد      → هرگز نخواهد آمد
//
// کارت‌های تمرینی (`practiceCards`) در سرور `imageUrl: null` دارند —
// تأیید شده روی API زنده. پس هر پنج کارتِ حالتِ تمرین، و هر کارتِ ربات،
// یک **اسپینرِ ابدی** نشان می‌دادند. کاربر یک آرنای خالی می‌دید با پنج
// دایرهٔ چرخانِ بی‌پایان.
//
// اپِ اندروید همین حالت را درست مدیریت می‌کند: `_PaintedFace` حرفِ اولِ
// نام و برچسبِ کمیابی را نقاشی می‌کند و اسپینر را **فقط** وقتی نشان
// می‌دهد که `loading: true` صریحاً پاس داده شود. وب از همان اول این
// تفکیک را نداشت.
//
// ⚠️ درسِ عمومی: `!x` را به‌جای «در حالِ بارگذاری» نگذارید. نبودِ داده و
//    نیامدنِ داده دو حالتِ متفاوت‌اند و یکی‌کردنشان انتظارِ بی‌پایان
//    می‌سازد.
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
  eager = false,
  onClick,
  className = '',
}) {
  const rarity = cardRarityOf(item);
  const meta = CARD_RARITY_META[rarity] || CARD_RARITY_META.normal;
  const art = cardArtOf(item);
  // دو حالتِ جدا: «آمد» و «شکست خورد». هر دو اسپینر را خاموش می‌کنند.
  const [artReady, setArtReady] = React.useState(false);
  const [artFailed, setArtFailed] = React.useState(false);
  React.useEffect(() => { setArtReady(false); setArtFailed(false); }, [art]);
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
            {/* ⚠️ `loading` فقط وقتی درست است که تصویری هست و هنوز
                نیامده. کارتِ بی‌تصویر باید چهرهٔ نقاشی‌شده بگیرد، نه
                اسپینرِ ابدی — دقیقاً مثلِ `_PaintedFace` در اندروید. */}
            <CardFallback item={item} loading={Boolean(art) && !artReady && !artFailed} />
          </div>
          {art
            ? <CachedImg src={art} w={480} alt={cardNameOf(item)}
                loading={eager ? 'eager' : 'lazy'}
                fetchPriority={eager ? 'high' : 'auto'} decoding="async"
                onLoad={() => setArtReady(true)}
                onError={event => {
                  // تصویری که ۴۰۴ می‌دهد هم نباید اسپینر را برای همیشه
                  // نگه دارد؛ به همان چهرهٔ نقاشی‌شده عقب می‌نشینیم.
                  event.currentTarget.style.display = 'none';
                  setArtFailed(true);
                }} />
            : null}
          {!!power && <span className="ggCardPower">{fa(power)}</span>}
          {selected && <span className="ggCardCheck">✓</span>}
          {qty > 1 && <span className="ggCardQty">×{fa(qty)}</span>}
          {badge && <span className="ggCardBadge">{badge}</span>}
          {winner && <span className="ggCardWinnerStamp">برنده</span>}
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
