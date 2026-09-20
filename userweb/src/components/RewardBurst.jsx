import React, { useEffect, useRef, useState } from 'react';
import { SvgIcon } from './IconAsset.jsx';
import { text } from '../lib/liveConfig.js';
import { fa } from '../lib/api.js';
import { onReward } from '../lib/rewards.js';

/**
 * جشنِ کوچکِ «دریافت شد» — وسطِ نما، روی هر صفحه‌ای.
 *
 * ── چه چیزی را حل می‌کند ──────────────────────────────────────────────────
 *
 * پیش از این، پیامِ دریافتِ جایزه در `toast` بالای صفحه می‌نشست. کاربر
 * واقعی اما پشتِ همان صفحه اسکرول کرده است (فهرست ماموریت‌ها، گردونه،
 * پنل رشد) و `toast` بیرونِ دیدش می‌ماند؛ نتیجه: «امتیاز گرفتم؟ نمی‌دانم».
 * این کامپوننت یک لایهٔ `position: fixed` است که به اسکرول کار ندارد، پس
 * همیشه همان‌جایی است که چشم کاربر هست.
 *
 * ── قواعدی که رعایت شده ───────────────────────────────────────────────────
 *
 *  • **بدون ایموجی.** گاردِ `test:no-emoji` روی کلِ محصول است؛ گذشته از
 *    تست، شکلِ ایموجی را فونتِ سیستم‌عامل می‌کشد و در سه دستگاه سه شکل
 *    می‌شود. آیکون از مجموعهٔ SVGِ خودمان (`SvgIcon`) می‌آید.
 *  • **متن از سرور.** عنوان و قالبِ عددها از قراردادِ متنِ زنده می‌آید
 *    (`reward.*`) تا وب و اندروید هرگز دو جملهٔ متفاوت نشان ندهند و ادمین
 *    بتواند بدونِ آپدیت عوضش کند.
 *  • **رقمِ فارسی** با `fa()` — عددِ لاتین در این محصول جایی ندارد.
 *  • **صِف** برای جایزه‌های پشت‌سرهم: اگر کاربر سه ماموریت را سریع دریافت
 *    کند، سه جشن پشتِ هم می‌آید، نه یک جشنِ روی‌هم‌افتاده.
 *  • **بی‌آزار برای صفحه‌خوان** (`role="status"`/`aria-live="polite"`) و
 *    **بدونِ گرفتنِ کلیک** (`pointer-events: none`) تا دکمهٔ زیرش از کار
 *    نیفتد.
 *
 * ── چرا ۲٬۴ ثانیه ────────────────────────────────────────────────────────
 *
 * اندازه‌گیریِ چشمی روی نسخهٔ اندرویدِ همین الگو: زیرِ ۲ ثانیه کاربرِ
 * درحالِ‌اسکرول فرصتِ دیدنِ عدد را ندارد؛ بالای ۳ ثانیه هم اگر پشت‌سرهم
 * بیاید روی هم می‌افتد و مزاحم است. ۲٬۴ ثانیه، همان عددی است که در
 * `reward_burst.dart` هم نشسته — آینگی وب و اندروید.
 */
const VISIBLE_MS = 2400;

/**
 * عنوانِ جشن، از قراردادِ متنِ زنده.
 *
 * ⚠️ عمداً زنجیرهٔ `if` است و نه یک نگاشتِ `{source: 'reward.x'}`:
 * گاردِ `live-copy-coverage` مصرفِ کلید را از *شکلِ فراخوانی* می‌فهمد
 * (`text('reward.x', …)`). نسخهٔ اولِ این کامپوننت کلید را داخلِ داده
 * نگه می‌داشت؛ نتیجه: گارد پنج کلیدِ `reward.*` را «مرده» گزارش کرد و
 * راست می‌گفت — از چشمِ ابزار، متنی که ادمین ویرایش می‌کند جایی خوانده
 * نمی‌شد. متنِ زنده باید در کد *دیده* شود تا نشود پنهانی از قرارداد بیرون
 * انداختش.
 */
function titleOf(source) {
  if (source === 'daily') return text('reward.daily', 'جایزهٔ روزانه');
  if (source === 'custom') return text('reward.custom', 'ماموریت اختصاصی');
  if (source === 'wheel') return text('reward.wheel', 'جایزهٔ گردونه');
  if (source === 'streak') return text('reward.streak', 'پاداش زنجیرهٔ ورود');
  return text('reward.mission', 'جایزهٔ ماموریت');
}

// ⚠️ کلیدها باید در هر دو مجموعهٔ آیکون باشند (وب `IconAsset.jsx` و
// اندروید `ui_icon.dart`)؛ گاردِ `icon-parity` همین را می‌سنجد. برای همین
// اینجا `party`/`flame`/`star` آمده و نه نام‌های خیالیِ `wheel`/`streak`.
const SOURCE_ICON = {
  mission: 'check',
  daily: 'gift',
  custom: 'sparkle',
  wheel: 'party',
  streak: 'flame',
};

/** قطعه‌های کاغذرنگی — بدونِ JSِ تصادفی تا اسکرین‌شاتِ تست‌ها یکسان بماند. */
function Burst() {
  const colors = ['#B5EF58', '#00D49A', '#FFD166', '#38BDF8', '#A78BFA', '#F472B6'];
  return (
    <div className="rewardBurstConfetti" aria-hidden="true">
      {Array.from({ length: 10 }, (_, i) => (
        <span key={i} style={{ '--i': i, '--c': colors[i % colors.length] }} />
      ))}
    </div>
  );
}

/**
 * چیپِ مقدار (امتیاز/سکه/تجربه).
 *
 * ⚠️ فول‌بک عمداً خودش عدد را دارد و نه `{amount}`: `text()` وقتی قالبِ زندهٔ
 * سرور نرسیده باشد فول‌بک را **بی‌دست‌زدن** برمی‌گرداند، پس قالبِ ناپر روی
 * صفحهٔ کاربرِ آفلاین/سرورِ قدیمی به‌صورت آکولاد چاپ می‌شود. گاردِ
 * `live-copy-parity` (بند ۵.۶) هم همین را می‌گیرد. `vars` می‌ماند تا وقتی
 * ادمین قالب را از پنل عوض می‌کند، همان جا پر شود.
 */
function Chip({ icon, value }) {
  return (
    <span className="rewardBurstChip">
      <SvgIcon name={icon} size={18} />
      {value}
    </span>
  );
}

function BurstCard({ item }) {
  const amounts = [];
  if (Number(item.points) > 0) {
    amounts.push(<Chip key="p" icon="star"
      value={text('reward.points', `${fa(item.points)} امتیاز`, { amount: item.points })} />);
  }
  if (Number(item.coins) > 0) {
    amounts.push(<Chip key="c" icon="coins"
      value={text('reward.coins', `${fa(item.coins)} سکه`, { amount: item.coins })} />);
  }
  if (Number(item.xp) > 0) {
    amounts.push(<Chip key="x" icon="bolt"
      value={text('reward.xp', `${fa(item.xp)} تجربه`, { amount: item.xp })} />);
  }
  return (
    <div className="rewardBurst" data-source={item.source}>
      <Burst />
      <span className="rewardBurstIcon" aria-hidden="true">
        <SvgIcon name={SOURCE_ICON[item.source] || 'gift'} size={26} />
      </span>
      <div className="rewardBurstBody">
        <b>{titleOf(item.source)}</b>
        <span className="rewardBurstState">{text('reward.received', 'دریافت شد')}</span>
        <div className="rewardBurstRow">
          {item.note ? <span className="rewardBurstNote">{item.note}</span> : amounts}
        </div>
      </div>
    </div>
  );
}

/** میزبانِ جشن — یک‌بار در ریشهٔ اپ سوار می‌شود. */
export default function RewardBurstHost() {
  const [queue, setQueue] = useState([]);
  const [current, setCurrent] = useState(null);
  const idRef = useRef(0);

  useEffect(() => onReward(payload => {
    idRef.current += 1;
    setQueue(q => [...q, { ...payload, _id: idRef.current }]);
  }), []);

  useEffect(() => {
    if (current || !queue.length) return undefined;
    const [next, ...rest] = queue;
    setQueue(rest);
    setCurrent(next);
    const t = setTimeout(() => setCurrent(null), VISIBLE_MS);
    return () => clearTimeout(t);
  }, [queue, current]);

  if (!current) return null;
  return (
    <div className="rewardBurstHost" role="status" aria-live="polite">
      <BurstCard key={current._id} item={current} />
    </div>
  );
}
