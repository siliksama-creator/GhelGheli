import React from 'react';
import { fa } from '../lib/api.js';
import { ASSETS } from './IconAsset.jsx';

/**
 * نشانِ سکهٔ لیگ در صفحهٔ نتیجهٔ مسابقه.
 *
 * ── چرا یک کامپوننتِ مشترک ──
 *
 * سه بازی (دوئل کارت، پنالتی، جفت‌یاب) همین نشان را نشان می‌دهند و اندروید
 * هم عیناً همین را دارد. اگر هر کدام نسخهٔ خودش را می‌ساخت، اولین تغییرِ
 * ظاهری در یکی جا می‌ماند و «آینهٔ کامل بودنِ وب و اندروید» می‌شکست.
 *
 * ── چرا وقتی صفر است چیزی نشان نمی‌دهد ──
 *
 * سکه فقط وقتی داده می‌شود که برنده سهمیهٔ روزش را داشته باشد و لیگی هم
 * فعال باشد. در بقیهٔ حالت‌ها `amount` صفر است و این کامپوننت `null`
 * برمی‌گرداند. نشان دادنِ «۰ سکه» بدتر از نشان ندادن است: کاربر فکر می‌کند
 * چیزی خراب شده، در حالی که فقط سکه‌ای در کار نبوده.
 *
 * @param {number} amount سکهٔ اعطا‌شده
 * @param {boolean} mine آیا این سکه به خودِ کاربر رسید
 */
export default function CoinAward({ amount, mine }) {
  const n = Number(amount || 0);
  if (!(n > 0)) return null;

  // برنده طلاییِ پررنگ می‌بیند، بازنده همان نشان را کم‌رنگ — تا بفهمد
  // سکه واقعاً وجود دارد و دفعهٔ بعد ارزشِ جنگیدن دارد. یک متن، نه دو تا.
  const color = mine ? '#FFD166' : '#94A3B8';
  return (
    <div
      className={mine ? 'coinAward coinAwardMine' : 'coinAward'}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: '7px',
        padding: '6px 14px', borderRadius: '99px',
        border: `1px solid ${color}${mine ? '' : '55'}`,
        background: mine
          ? 'linear-gradient(90deg,#FFD16622,#FF9F4322)'
          : 'rgba(255,255,255,0.04)',
        color, fontWeight: 900, fontSize: '12.5px',
        // انیمیشن فقط برای برنده — حرکتِ اضافه برای بازنده‌ای که همین حالا
        // امتیازش را باخته، توی ذوق می‌زند.
        animation: mine ? 'coinPop .5s cubic-bezier(.2,1.4,.4,1) both' : 'none',
      }}
    >
      <img
        src={ASSETS.coin} alt="" width={18} height={18}
        style={{ display: 'block', opacity: mine ? 1 : 0.55 }}
      />
      <span>{mine ? `+${fa(n)} سکه` : `${fa(n)} سکه به حریف`}</span>
    </div>
  );
}
