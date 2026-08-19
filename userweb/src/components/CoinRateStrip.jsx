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

// 🔴 این اعداد تا دورِ ۲۶ منسوخ بودند: دوئل ۲/۲۰ و بقیه ۱/۱۰، در حالی
//    که `COIN_TABLE` بک‌اند مدت‌ها بود هر سه بازی را یکسان کرده بود.
//    یعنی نوار به کاربر عددی نشان می‌داد که هیچ‌وقت نمی‌گرفت.
//
//    حالا هر سه بازی یکی‌اند، پس یک ردیف «همهٔ بازی‌ها» کافی است و
//    خواستهٔ «خیلی شلوغ نشه» را بهتر برآورده می‌کند.
const ROWS = [
  { game: 'برد', s100: 10, s1000: 30 },
  { game: 'مساوی', s100: 3, s1000: 9 },
  { game: 'باخت', s100: 1, s1000: 3 },
];

// 🔴 دورِ ۳۲ — `mode` اضافه شد.
//
// شکایتِ کاربر: «توضیحاتِ سکه با تغییراتِ جدید دقیق نشان داده نمی‌شود.»
// اعداد را با `COIN_TABLE` بک‌اند سطربه‌سطر مقابله کردیم: دقیقاً درست
// بودند. اما نوار *همیشه* رندر می‌شد — از جمله وقتی کاربر «تمرین با ربات»
// یا «اتاق خصوصی» را انتخاب کرده بود، دو حالتی که طبقِ قاعدهٔ خودمان
// («بازی با ربات، تمرین رایگان و لابی خصوصی سکه ندارند») هیچ سکه‌ای
// نمی‌دهند. یعنی نوار با اطمینانِ کامل «برد = ۱۰ سکه» را جلوی چشمِ کسی
// می‌گذاشت که قرار نبود حتی یک سکه بگیرد.
//
// این «عددِ غلط» نیست، «عددِ بی‌ربط به حالتِ فعلی» است — و از دیدِ کاربر
// همان «دقیق نشان داده نمی‌شود» است. حالا در حالت‌های بی‌سکه به‌جای جدول،
// یک خطِ صریح می‌گوید چرا خبری از سکه نیست.
export default function CoinRateStrip({ mode }) {
  // `mode` را اختیاری نگه می‌داریم: اگر پاس داده نشد، رفتارِ قبلی (نمایشِ
  // جدول) حفظ می‌شود تا هیچ مصرف‌کنندهٔ دیگری نشکند.
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
            ? 'تمرین با ربات سکه ندارد — برای سکه، ورودی ۱۰۰ یا ۱۰۰۰ را انتخاب کن.'
            : 'اتاق خصوصی سکه ندارد — برای سکه، ورودی ۱۰۰ یا ۱۰۰۰ را انتخاب کن.'}
        </span>
      </div>
    );
  }

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
        هر سه بازی یکسان · فقط مقابل حریف واقعی · رتبهٔ لیگ با سکه تعیین می‌شود
      </div>
    </div>
  );
}
