import React from 'react';
import { fa } from '../lib/api.js';
import { ASSETS } from './IconAsset.jsx';

// نشانِ سکهٔ فصل — دقیقاً معادلِ `mobile/lib/widgets/coin_chip.dart`.
//
// قبلاً این کامپوننت داخلِ League.jsx تعریف شده بود. با اضافه‌شدنِ سکه به
// پروفایلِ عمومی، دو نسخه لازم می‌شد و دو نسخه یعنی دو رنگِ طلاییِ کمی
// متفاوت و دو جورِ فاصله‌گذاری. یک فایل، یک حقیقت.
//
// ⚠️ `Number(value || 0)` عمدی است و نباید به cast خام تبدیل شود: این چیپ
// داخلِ لیست رندر می‌شود و ستونِ coins اگر روزی BIGINT شود، درایورِ Postgres
// رشته برمی‌گرداند. `NaN` روی صفحه بدتر از صفر است.
// ⚠️ اندازهٔ پیش‌فرض عمداً ۲۲px است، نه ۱۴px.
//
// نسخهٔ اول با آیکونِ ۱۴ پیکسلی ساخته شد و روی گوشیِ واقعی عملاً دیده
// نمی‌شد: آیکون یک لکهٔ نارنجی بود و عددِ کنارش از فونتِ بدنه هم کوچک‌تر.
// سکه معیارِ رتبه‌بندیِ کلِ لیگ است — مهم‌ترین عددِ آن صفحه — و نباید از
// امتیاز که حالا فقط تساوی‌شکن است ریزتر دیده شود.
export default function CoinChip({ value, size = 22 }) {
  const n = Number(value || 0);
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', color: '#FFD166', fontWeight: '900' }}>
      <img src={ASSETS.coin} alt="" width={size} height={size} style={{ display: 'block', flexShrink: 0 }} />
      <span style={{ fontSize: `${Math.round(size * 0.78)}px`, lineHeight: 1 }}>
        {fa(Number.isFinite(n) ? n : 0)}
      </span>
    </span>
  );
}
