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
export default function CoinChip({ value, size = 14 }) {
  const n = Number(value || 0);
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#FFD166', fontWeight: '900' }}>
      <img src={ASSETS.coin} alt="" width={size} height={size} style={{ display: 'block' }} />
      {fa(Number.isFinite(n) ? n : 0)}
    </span>
  );
}
