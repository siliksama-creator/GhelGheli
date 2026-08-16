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
//
// ── بازطراحیِ دورِ بیست‌ویکم: «بدون اسکرول» ──
//
// نسخهٔ قبلی همه‌چیز — از جمله جدولِ نرخ — را پشتِ یک آکاردئونِ بسته پنهان
// می‌کرد. یعنی کاربر برای فهمیدنِ «سکه چطور به دست می‌آید» باید اول کارت را
// پیدا می‌کرد، بعد بازش می‌کرد، بعد اسکرول می‌کرد. عملاً هیچ‌کس این سه کار
// را نمی‌کند و کارت مثل این بود که وجود ندارد.
//
// حالا تفکیک بر اساسِ «چیزی که باید بدانی» در برابر «چیزی که خوب است بدانی»
// است، نه بر اساسِ کم‌کردنِ ارتفاع:
//
//   • همیشه پیدا  → یک جمله (سکه = بردنِ مسابقه مقابل حریف واقعی)
//                    + جدولِ نرخ. این همان پاسخِ سؤال است و هرگز پنهان نیست.
//   • بازشدنی     → پنج قاعدهٔ ریز (سقفِ روزانه، مساویِ بی‌سکه، ریستِ فصل...)
//                    که فقط وقتی کسی واقعاً کنجکاو شد لازم می‌شوند.
//
// `open`/`onToggle` حالا فقط همان بخشِ دومند. کلیدِ `coinGuideSeen` معنایش
// عوض نشده: «این کاربر قبلاً جزئیات را دیده».

// زیرنویسِ توضیحیِ بازی‌ها حذف شد (خواستهٔ مالک، دورِ ۲۲): جدول باید
// عدد بدهد، نه نقد و بررسیِ بازی. حذفش یک سطرِ اضافه از هر ردیف کم کرد.
const ROWS = [
  { game: 'دوئل کارت', s100: 2, s1000: 20 },
  { game: 'پنالتی', s100: 1, s1000: 10 },
  { game: 'جفت‌یاب', s100: 1, s1000: 10 },
];

const RULES = [
  ['✅', 'فقط برنده سکه می‌گیرد — مقابل حریف واقعی و با ورودی امتیاز.'],
  ['🚫', 'مساوی، باخت، بازی با ربات و تمرین رایگان سکه ندارند.'],
  ['🔒', 'سکه هرگز از شما کم نمی‌شود؛ حتی وقتی ببازید.'],
  ['📅', 'هر روز تا ۳۰ برد در ورودی ۱۰۰ و ۱۵ برد در ورودی ۱۰۰۰ سکه می‌دهد. بعد از آن، برد امتیاز دارد ولی سکه نه.'],
  ['🏆', 'در پایان فصل، جوایز بر اساس سکه پرداخت و سکه‌ها صفر می‌شود.'],
];

export default function CoinGuide({ open, onToggle }) {
  return (
    <div className="coinGuide" style={{
      margin: '0 0 12px', borderRadius: '16px', overflow: 'hidden',
      background: 'linear-gradient(135deg, #2A1F05, #14100A)',
      border: '1.5px solid rgba(255,209,102,0.45)',
      boxShadow: '0 0 30px rgba(255,209,102,0.10)',
    }}>
      {/* ── پاسخِ سؤال: همیشه دیده می‌شود، بدونِ کلیک و بدونِ اسکرول ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '11px', padding: '11px 14px 9px' }}>
        <img src={ASSETS.coin} alt="" width={40} height={40}
          style={{ display: 'block', flexShrink: 0, filter: 'drop-shadow(0 0 10px rgba(255,209,102,0.45))' }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <b style={{ display: 'block', fontSize: '16px', fontWeight: 900, color: '#FFD166', marginBottom: '2px' }}>
            سکه چطور به دست می‌آید؟
          </b>
          <span style={{ display: 'block', fontSize: '12.5px', lineHeight: 1.55, color: 'rgba(255,255,255,0.9)' }}>
            رتبهٔ لیگ با <b style={{ color: '#FFD166' }}>سکه</b> تعیین می‌شود، نه امتیاز — و سکه فقط با{' '}
            <b style={{ color: '#FFD166' }}>بردن مسابقه مقابل حریف واقعی</b> به دست می‌آید.
          </span>
        </div>
      </div>

      {/* ── جدولِ نرخ: مهم‌ترین عددهای صفحه، پس پنهان نمی‌شوند ── */}
      <div style={{ padding: '0 14px 11px' }}>
        <div style={{
          display: 'grid', gridTemplateColumns: '1.35fr 1fr 1fr',
          borderRadius: '14px', overflow: 'hidden',
          background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,209,102,0.24)',
        }}>
          <div style={{ padding: '6px 10px', fontSize: '11.5px', fontWeight: 800, color: '#94A3B8' }}>بردِ شما در</div>
          <div style={{ padding: '6px 4px', fontSize: '11.5px', fontWeight: 800, color: '#94A3B8', textAlign: 'center' }}>ورودی ۱۰۰</div>
          <div style={{ padding: '6px 4px', fontSize: '11.5px', fontWeight: 800, color: '#94A3B8', textAlign: 'center' }}>ورودی ۱۰۰۰</div>

          {ROWS.map(r => (
            <React.Fragment key={r.game}>
              <div style={{
                padding: '7px 10px', fontSize: '13.5px', fontWeight: 800, color: '#FFF',
                borderTop: '1px solid rgba(255,255,255,0.07)',
              }}>
                {r.game}
              </div>
              {[r.s100, r.s1000].map((v, i) => (
                <div key={i} style={{
                  borderTop: '1px solid rgba(255,255,255,0.07)', display: 'flex',
                  alignItems: 'center', justifyContent: 'center', gap: '4px', padding: '7px 4px',
                }}>
                  <img src={ASSETS.coin} alt="" width={16} height={16} style={{ display: 'block', flexShrink: 0 }} />
                  <span style={{ fontSize: '14.5px', fontWeight: 900, color: '#FFD166' }}>{fa(v)}</span>
                </div>
              ))}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* ── قواعدِ ریز: بازشدنی، چون پاسخِ سؤالِ اصلی نیستند ── */}
      <button
        onClick={onToggle}
        aria-expanded={open}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: '7px', padding: '9px 16px', background: 'rgba(255,209,102,0.09)',
          border: 'none', borderTop: '1px solid rgba(255,209,102,0.22)',
          cursor: 'pointer', color: '#FFD166', fontSize: '12.5px', fontWeight: 900,
        }}
      >
        {open ? 'بستن جزئیات' : 'قوانین کامل سکه'}
        <span style={{
          fontSize: '17px', lineHeight: 1,
          transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s',
        }}>⌄</span>
      </button>

      {open && (
        <ul style={{
          margin: 0, padding: '13px 16px 16px', listStyle: 'none',
          display: 'flex', flexDirection: 'column', gap: '9px',
        }}>
          {RULES.map(([icon, text]) => (
            <li key={text} style={{ display: 'flex', gap: '9px', alignItems: 'flex-start' }}>
              <span style={{ fontSize: '15px', flexShrink: 0, lineHeight: 1.5 }}>{icon}</span>
              <span style={{ fontSize: '13.5px', lineHeight: 1.65, color: 'rgba(255,255,255,0.88)' }}>{text}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
