import React from 'react';
import { fa } from '../lib/api.js';
import { ASSETS } from './IconAsset.jsx';

// نوارِ کوچکِ نرخِ سکه — بالای فهرستِ بازی‌ها.
//
// ── چرا اینجا هم لازم است ──
//
// جدولِ کاملِ نرخ در صفحهٔ لیگ است، ولی تصمیمِ «کدام بازی را بازی کنم»
// در صفحهٔ بازی‌ها گرفته می‌شود. کاربر برای دیدنِ نرخ نباید به تبِ دیگری
// برود و برگردد؛ تا وقتی عدد جلوی چشمش نباشد، انتخابش تصادفی است.
//
// ── چرا این‌قدر کوچک ──
//
// خواستهٔ صریحِ مالک: «خیلی شلوغ نشه». پس این نسخه عمداً حداقلی است —
// سه ردیف، بدونِ عنوانِ توضیحی، بدونِ قواعد، بدونِ آیکونِ بازی. فقط
// همان چیزی که برای مقایسه لازم است. توضیحِ کامل یک تپ آن‌طرف‌تر در
// صفحهٔ لیگ می‌ماند.
//
// اعداد آینهٔ `COIN_TABLE` بک‌اند و `ROWS` در `CoinGuide.jsx` هستند.

const ROWS = [
  { game: 'دوئل کارت', s100: 2, s1000: 20 },
  { game: 'پنالتی', s100: 1, s1000: 10 },
  { game: 'جفت‌یاب', s100: 1, s1000: 10 },
];

export default function CoinRateStrip() {
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
          سکهٔ برد
        </span>
        <span style={{ fontSize: '10.5px', fontWeight: 800, color: '#94A3B8', textAlign: 'center' }}>ورودی ۱۰۰</span>
        <span style={{ fontSize: '10.5px', fontWeight: 800, color: '#94A3B8', textAlign: 'center' }}>ورودی ۱۰۰۰</span>
      </div>

      {ROWS.map((r, i) => (
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
        فقط بردِ آنلاین مقابل حریف واقعی سکه می‌دهد · رتبهٔ لیگ با سکه تعیین می‌شود
      </div>
    </div>
  );
}
