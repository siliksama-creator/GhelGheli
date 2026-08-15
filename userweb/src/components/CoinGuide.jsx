import React from 'react';
import { fa } from '../lib/api.js';
import { ASSETS } from './IconAsset.jsx';

// کارتِ «سکه چیست و چطور به دست می‌آید» — بالای جدولِ لیگ.
//
// ── چرا این کارت لازم است ──
//
// سکه ارزِ تازه‌ای است که یک‌شبه معیارِ رتبه‌بندی شد. کاربری که دیروز با
// امتیاز صدرنشین بود، امروز می‌بیند رتبه‌اش با عددی تعیین می‌شود که اسمش را
// هم نشنیده. بدون توضیح، تنها نتیجه‌گیریِ ممکن این است که «برنامه خراب شده».
//
// جدولِ سه‌ستونی عمدی است: نگفتنِ عددِ دقیق یعنی کاربر باید حدس بزند کدام
// بازی می‌ارزد، و حدس‌زدن همان چیزی است که حس «قمار» می‌دهد. عددها را
// می‌گذاریم وسط تا تصمیم آگاهانه باشد.

const ROWS = [
  { game: 'دوئل کارت', s100: 2, s1000: 20, hint: 'طولانی‌ترین و فکری‌ترین بازی' },
  { game: 'پنالتی', s100: 1, s1000: 10, hint: null },
  { game: 'جفت‌یاب', s100: 1, s1000: 10, hint: null },
];

function Cell({ children, gold }) {
  return (
    <div style={{
      textAlign: 'center', padding: '9px 4px', fontSize: '15px', fontWeight: 900,
      color: gold ? '#FFD166' : '#E2E8F0',
    }}>
      {children}
    </div>
  );
}

export default function CoinGuide({ open, onToggle }) {
  return (
    <div style={{
      margin: '0 0 16px', borderRadius: '18px', overflow: 'hidden',
      background: 'linear-gradient(135deg, #2A1F05, #14100A)',
      border: '1.5px solid rgba(255,209,102,0.45)',
    }}>
      {/* ── سرِ کارت: همیشه دیده می‌شود ── */}
      <button
        onClick={onToggle}
        aria-expanded={open}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: '12px',
          padding: '16px 18px', background: 'transparent', border: 'none',
          cursor: 'pointer', textAlign: 'right', color: '#FFF',
        }}
      >
        <img src={ASSETS.coin} alt="" width={44} height={44} style={{ display: 'block', flexShrink: 0 }} />
        <span style={{ flex: 1 }}>
          <b style={{ display: 'block', fontSize: '17px', fontWeight: 900, color: '#FFD166', marginBottom: '3px' }}>
            سکه چیست؟
          </b>
          <span style={{ display: 'block', fontSize: '13.5px', lineHeight: 1.6, color: 'rgba(255,255,255,0.86)' }}>
            رتبهٔ لیگ با <b style={{ color: '#FFD166' }}>سکه</b> تعیین می‌شود، نه امتیاز.
            سکه فقط با <b style={{ color: '#FFD166' }}>بردن مسابقه مقابل حریف واقعی</b> به دست می‌آید.
          </span>
        </span>
        <span style={{
          fontSize: '20px', color: '#FFD166', flexShrink: 0,
          transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s',
        }}>⌄</span>
      </button>

      {/* ── جزئیات: بازشدنی ── */}
      {open && (
        <div style={{ padding: '0 18px 18px' }}>
          <div style={{
            display: 'grid', gridTemplateColumns: '1.35fr 1fr 1fr',
            borderRadius: '14px', overflow: 'hidden',
            background: 'rgba(0,0,0,0.28)', border: '1px solid rgba(255,209,102,0.22)',
          }}>
            <div style={{ padding: '9px 10px', fontSize: '12.5px', fontWeight: 800, color: '#94A3B8' }}>بازی</div>
            <div style={{ padding: '9px 4px', fontSize: '12.5px', fontWeight: 800, color: '#94A3B8', textAlign: 'center' }}>ورودی ۱۰۰</div>
            <div style={{ padding: '9px 4px', fontSize: '12.5px', fontWeight: 800, color: '#94A3B8', textAlign: 'center' }}>ورودی ۱۰۰۰</div>

            {ROWS.map(r => (
              <React.Fragment key={r.game}>
                <div style={{
                  padding: '9px 10px', fontSize: '14px', fontWeight: 800, color: '#FFF',
                  borderTop: '1px solid rgba(255,255,255,0.07)',
                }}>
                  {r.game}
                  {r.hint && (
                    <span style={{ display: 'block', fontSize: '11.5px', fontWeight: 600, color: '#94A3B8', marginTop: '2px' }}>
                      {r.hint}
                    </span>
                  )}
                </div>
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
                  <Cell gold>{fa(r.s100)}</Cell>
                </div>
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
                  <Cell gold>{fa(r.s1000)}</Cell>
                </div>
              </React.Fragment>
            ))}
          </div>

          {/* ── قواعدی که کاربر باید بداند، وگرنه فکر می‌کند باگ است ── */}
          <ul style={{
            margin: '14px 0 0', padding: 0, listStyle: 'none',
            display: 'flex', flexDirection: 'column', gap: '9px',
          }}>
            {[
              ['✅', 'فقط برنده سکه می‌گیرد — مقابل حریف واقعی و با ورودی امتیاز.'],
              ['🚫', 'مساوی، باخت، بازی با ربات و تمرین رایگان سکه ندارند.'],
              ['🔒', 'سکه هرگز از شما کم نمی‌شود؛ حتی وقتی ببازید.'],
              ['📅', 'هر روز تا ۳۰ برد در ورودی ۱۰۰ و ۱۵ برد در ورودی ۱۰۰۰ سکه می‌دهد. بعد از آن، برد امتیاز دارد ولی سکه نه.'],
              ['🏆', 'در پایان فصل، جوایز بر اساس سکه پرداخت و سکه‌ها صفر می‌شود.'],
            ].map(([icon, text]) => (
              <li key={text} style={{ display: 'flex', gap: '9px', alignItems: 'flex-start' }}>
                <span style={{ fontSize: '15px', flexShrink: 0, lineHeight: 1.5 }}>{icon}</span>
                <span style={{ fontSize: '13.5px', lineHeight: 1.65, color: 'rgba(255,255,255,0.88)' }}>{text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
