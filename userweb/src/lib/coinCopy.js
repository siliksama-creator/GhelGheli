// ابزارهایِ مشترکِ «جمله‌های سکه» — یک پیاده‌سازی، دو مصرف‌کننده.
//
// ── چرا این فایل جدا شد ──
// `CoinGuide.jsx` (کارتِ راهنما در صفحهٔ لیگ) و `CoinRateStrip.jsx` (نوارِ
// بالای فهرستِ بازی) هر دو به دو چیز نیاز دارند: «برچسبِ یک لایهٔ ورودی»
// و «جملهٔ درصدِ انتقالِ سکه». وقتی هر کدام جدا می‌نوشتند، دو باگِ واقعی
// دیدیم:
//
//   ۱. نرخ‌نوار برای `coinGuide.botNote` عددِ خام پاس می‌کرد
//      ({ stakeLow: 100 }) و قالبِ سرور هم «ورودی {stakeLow}» داشت —
//      یعنی خروجی «ورودی 100» با رقمِ لاتین وسطِ متنِ فارسی، در حالی که
//      همان جمله در کارتِ راهنما «ورودی ۱۰۰» می‌شد. گاردِ همسانی چون فقط
//      بودِنِ کلید را می‌سنجید، سبز ماند.
//   ۲. شرطِ `pct === 0` دو بار نوشته شده بود؛ یکی با `text()` و یکی
//      بدونِ آن. یعنی «انتقالِ سکه صفر است» در یک صفحه از پنل عوض می‌شد
//      و در صفحهٔ دیگر نه.
//
// پس اینجا **فقط** همان دو کار را می‌کنیم و هیچ متنِ تازه‌ای اختراع نمی‌کند:
// رشته‌های پیشِ رو دقیقاً همان فول‌بک‌های دیروزند تا اولین رندر با امروزِ
// محصول واژه‌به‌واژه یکی بماند (بند ۱ نقشه‌راه: درِ داده، نه تغییرِ ظاهر).
import { text, rawText } from './liveConfig.js';
import { fa } from './api.js';

/** «ورودی ۱۰۰» — از همان `coinGuide.stakeLabel` که جدول می‌سازد. */
export function stakeLabel(stake) {
  return text('coinGuide.stakeLabel', `ورودی ${fa(stake)}`, { stake });
}

/**
 * لایه‌های امتیازآورِ سکه از `economy.dailyCoinQuota`.
 *
 * چرا از سقفِ سهمیه و نه از یک فهرستِ ثابت: سهمیه، تنها جایی است که سرور
 * صادقانه می‌گوید کدام ورودی‌ها اصلاً سکه می‌دهند. اگر ادمین لایهٔ تازه‌ای
 * تعریف کند، جدول و جمله‌ها خودکار ردیفِ تازه می‌گیرند.
 */
export function coinStakeTiers(economy) {
  const quota = (economy?.dailyCoinQuota && typeof economy.dailyCoinQuota === 'object')
    ? economy.dailyCoinQuota : {};
  const tiers = Object.keys(quota)
    .map(Number).filter(n => Number.isFinite(n) && n > 0).sort((a, b) => a - b);
  return tiers.length ? tiers : [100, 1000];
}

/** جملهٔ «٪ از سکه منتقل می‌شود» — صفر یعنی صریح بگوییم صفر. */
export function carryoverText(pct) {
  return pct === 0
    ? rawText('coinGuide.carryoverZero', 'انتقالِ سکه به لیگِ بعدی صفر است')
    : text('coinGuide.carryoverPercent',
      `${fa(pct)}٪ از سکه به لیگِ بعدی منتقل می‌شود`, { percent: pct });
}
