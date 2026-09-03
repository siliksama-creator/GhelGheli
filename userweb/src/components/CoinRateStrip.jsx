import React from 'react';
import { fa } from '../lib/api.js';
// متن‌های زنده (فاز ۲) — رشته‌های پایین فول‌بک‌اند، نه متنِ رقیب.
import { text, useLive } from '../lib/liveConfig.js';
import { ASSETS } from './IconAsset.jsx';

// نوارِ کوچکِ نرخِ سکه — بالای فهرستِ بازی‌ها.
//
// ⚠️ دورِ ۳۳: اعداد از `/api/config` (تنظیماتِ ادمین) می‌آیند نه از
//    جدولِ هاردکد — پس وقتی ادمین در پنل نرخ را عوض کند، این نوار و
//    همهٔ نوشته‌های سکه در وب و اندروید **بدونِ آپدیت** عوض می‌شوند.
//    پیش‌فرض‌ها همان اعدادِ قبلی‌اند.

const DEFAULT_ROWS = [
  { key: 'win', game: 'برد', s100: 10, s1000: 30 },
  { key: 'draw', game: 'مساوی', s100: 3, s1000: 9 },
  { key: 'loss', game: 'باخت', s100: 1, s1000: 3 },
];

export function coinExplanation(economy) {
  const pct = economy?.coinCarryoverPercent ?? 10;
  const pctText = pct === 0
    ? text('coinGuide.carryoverZero', 'انتقالِ سکه به لیگِ بعدی صفر است')
    : text('coinGuide.carryoverPercent',
      `${fa(pct)}٪ از سکه به لیگِ بعدی منتقل می‌شود`, { percent: pct });
  return `سکه مبنای دریافتِ جایزهٔ لیگ است؛ رتبهٔ لیگ بر اساسِ سکه تعیین می‌شود و با سکه‌ها در استخرِ جایزه شرکت می‌کنی. سکه‌ها بعد از پایانِ لیگ صفر می‌شوند و ${pctText}.`;
}

export default function CoinRateStrip({ mode, economy, gamePoints }) {
  useLive();
  const coinless = mode === 0 || mode === -1;

  if (coinless) {
    return (
      <div style={{
        margin: '0 0 12px', borderRadius: '14px', padding: '9px 12px',
        display: 'flex', alignItems: 'center', gap: '8px',
        background: 'rgba(148,163,184,0.08)',
        border: '1px solid rgba(148,163,184,0.22)',
      }}>
        <img src={ASSETS.coin} alt="" width={18} height={18}
          style={{ display: 'block', flexShrink: 0, opacity: 0.45 }} />
        <span style={{ fontSize: '12px', lineHeight: 1.55, color: '#94A3B8' }}>
          {mode === 0
            ? text('coinGuide.botNote',
              'تمرین با ربات سکه ندارد — برای سکه، ورودی ۱۰۰ یا ۱۰۰۰ را انتخاب کن.',
              { stakeLow: 100, stakeHigh: 1000 })
            : text('coinGuide.privateNote',
              'اتاق خصوصی سکه ندارد — برای سکه، ورودی ۱۰۰ یا ۱۰۰۰ را انتخاب کن.',
              { stakeLow: 100, stakeHigh: 1000 })}
        </span>
      </div>
    );
  }

  // جدول از تنظیماتِ ادمین؛ اگر نیامده بود (آفلاین/قدیمی) پیش‌فرض.
  const table = economy?.coinRewards;
  const rows = DEFAULT_ROWS.map(r => {
    const c100 = table?.card_duel?.[100]?.[r.key] ?? r.s100;
    const c1000 = table?.card_duel?.[1000]?.[r.key] ?? r.s1000;
    return { ...r, s100: Number(c100), s1000: Number(c1000) };
  });

  return (
    <div style={{
      margin: '0 0 12px', borderRadius: '14px', overflow: 'hidden',
      background: 'linear-gradient(135deg, rgba(42,31,5,0.9), rgba(20,16,10,0.9))',
      border: '1px solid rgba(255,209,102,0.32)',
    }}>
      <div style={{
        display: 'grid', gridTemplateColumns: '1.3fr 1fr 1fr',
        alignItems: 'center', padding: '7px 12px 6px',
        borderBottom: '1px solid rgba(255,209,102,0.16)',
      }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 900, color: '#FFD166' }}>
          <img src={ASSETS.coin} alt="" width={16} height={16} style={{ display: 'block', flexShrink: 0 }} />
          سکه در هر بازی
        </span>
        <span style={{ fontSize: '10.5px', fontWeight: 800, color: '#94A3B8', textAlign: 'center' }}>ورودی ۱۰۰</span>
        <span style={{ fontSize: '10.5px', fontWeight: 800, color: '#94A3B8', textAlign: 'center' }}>ورودی ۱۰۰۰</span>
      </div>

      {rows.map((r, i) => (
        <div key={r.game} style={{
          display: 'grid', gridTemplateColumns: '1.3fr 1fr 1fr', alignItems: 'center',
          padding: '5px 12px',
          borderTop: i === 0 ? 'none' : '1px solid rgba(255,255,255,0.05)',
        }}>
          <span style={{ fontSize: '12px', fontWeight: 700, color: 'rgba(255,255,255,0.92)' }}>{r.game}</span>
          <span style={{ fontSize: '13px', fontWeight: 900, color: '#FFD166', textAlign: 'center' }}>{fa(r.s100)}</span>
          <span style={{ fontSize: '13px', fontWeight: 900, color: '#FFD166', textAlign: 'center' }}>{fa(r.s1000)}</span>
        </div>
      ))}

      <div style={{
        padding: '5px 12px 6px', fontSize: '10.5px', lineHeight: 1.5,
        color: 'rgba(255,255,255,0.55)', borderTop: '1px solid rgba(255,209,102,0.14)',
      }}>
        {coinExplanation(economy)}
        {gamePoints?.enabled && (
          <div style={{ marginTop: 4, color: 'rgba(255,255,255,0.72)' }}>
            امتیاز آنلاین: برد +{fa(gamePoints.winPoints)}
            {' · '}باخت {fa(gamePoints.losePoints)}
            {' · '}مساوی {fa(gamePoints.drawPoints)}
          </div>
        )}
      </div>
    </div>
  );
}
