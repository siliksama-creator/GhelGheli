import React, { useEffect, useMemo, useRef, useState } from 'react';
import { SvgIcon } from './IconAsset.jsx';
import { text, ruleNumber } from '../lib/liveConfig.js';
import { fa } from '../lib/api.js';
import { onRewardMoment, REWARD_MOMENTS } from '../lib/rewardMoment.js';
import { play } from '../gameAudio.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * «لحظهٔ جایزه» — تنها سیستمِ نمایشِ جایزه/نتیجه در وب (به‌جز دوئل کارت و پنالتی)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ── خواستهٔ مالک (۲۹ شهریور) ──────────────────────────────────────────────
 *
 * «هر وقت کاربر امتیاز/سکه/هدیه/آیتمی به دست می‌آورد، دیگه یه گوشه ننویسه
 * "شما ۱۰۰۰ امتیاز دریافت کردید" یا "شما بازی رو بردید"/"شما باختید".
 * به‌جاش یه سیستمِ خوشگلِ زیبای انیمیشنیِ جذاب، یکپارچه در وب و اندروید که
 * یه لحظه اون چیزی که به دست آورده رو نشون بده، یه جشنِ کوچیک براش بگیره،
 * بعد چند ثانیه بره — و اصلاً اگه یکم دیرتر هم بره هیچ اختلالی در ادامهٔ کار
 * کاربر ایجاد نکنه.»
 *
 * ── چهار قاعده‌ای که «بی‌اختلال بودن» را می‌سازند ────────────────────────
 *
 *  ۱. `pointer-events: none` روی کلِ لایه: هیچ کلیکی را نمی‌خورد. کاربر
 *     می‌تواند وسطِ نمایش، دکمهٔ بعدی را بزند.
 *  ۲. `position: fixed` + جداشدنِ کامل از جریانِ صفحه: نه اسکرول را جابه‌جا
 *     می‌کند، نه ارتفاعی اشغال می‌کند، نه `layout` را می‌لرزاند.
 *  ۳. هیچ‌وقت بیش از یکی روی صفحه نیست (صف) و سقفِ صف دارد: کارت‌های
 *     پشت‌سرهم به‌جای روی‌هم‌افتادن، به‌ترتیب می‌آیند.
 *  ۴. اگر صفحه عوض شود یا تمرکز برود (`prefers-reduced-motion`)، انیمیشن
 *     سبک/بی‌حرکت می‌شود و کارت زودتر می‌رود — ولی هیچ‌وقت «گیر» نمی‌کند.
 *
 * ── چرا متن از سرور ──────────────────────────────────────────────────────
 *
 * عنوان‌ها و جمله‌ها همه کلیدِ `reward.*` در قراردادِ متنِ زنده‌اند. دو دلیل:
 *   • وب و اندروید هرگز دو جملهٔ متفاوت نشان نمی‌دهند؛
 *   • مالک می‌تواند لحنِ باخت (یا هر چیز دیگر) را از پنل عوض کند — بدونِ
 *     آپدیتِ اپ. جمله‌ای که خودش گفت نمی‌داند چه باشد، از پنل قابلِ تغییر
 *     می‌ماند تا وقتی که لحنِ درست را پیدا کند.
 *
 * ⚠️ کلیدها باید در شکلی *دیده‌شوند* که گاردِ `live-copy-coverage` می‌فهمد
 *    (`text('reward.x', …)`)؛ وگرنه متنِ قابلِ‌ویرایش «مرده» گزارش می‌شود و
 *    راست می‌گوید: از چشمِ پنل، جایی خوانده نمی‌شود.
 */
const QUEUE_LIMIT = 4;

/**
 * مدتِ نمایش: از پنل (قاعدهٔ `rewardSeconds`) با فول‌بکِ امروزِ محصول.
 * حداقل ۴ ثانیه کاملاً دیده شود (خواستهٔ مالک)، بعد محو. پنل می‌تواند
 * بیشتر بگوید، نه کمتر.
 */
/** بهانهٔ خروجِ نرم: قبل از برداشتنِ کارت، محو می‌شود. */
const LEAVE_MS = 420;

function visibleMs() {
  return Math.max(4000, ruleNumber('rewardSeconds', 4) * 1000) + LEAVE_MS;
}

/** عنوانِ هر منبع، از قراردادِ متنِ زنده (شکلِ فراخوانی، نه نگاشت). */
function sourceTitle(source) {
  if (source === 'daily') return text('reward.daily', 'جایزهٔ روزانه');
  if (source === 'custom') return text('reward.custom', 'ماموریت اختصاصی');
  if (source === 'wheel') return text('reward.wheel', 'جایزهٔ گردونه');
  if (source === 'streak') return text('reward.streak', 'پاداش زنجیرهٔ ورود');
  if (source === 'pass') return text('reward.pass', 'پاداش گذر نبرد');
  if (source === 'shop') return text('reward.shop', 'خریدِ فروشگاه');
  if (source === 'tap') return text('reward.tap', 'دستاورد ضربه‌زن');
  if (source === 'memory') return text('reward.memory', 'نبرد جفت‌یاب');
  if (source === 'league') return text('reward.league', 'جایزهٔ لیگ');
  return text('reward.mission', 'جایزهٔ ماموریت');
}

/**
 * آیکونِ هر لحظه — از مجموعهٔ SVGِ خودمان.
 * ⚠️ هر نامی این‌جا بیاید باید در **هر دو** مجموعهٔ آیکون باشد (وب
 *    `IconAsset.jsx` و اندروید `ui_icon.dart`)؛ گاردِ `icon-parity` و
 *    `reward-parity` همین را می‌سنجند. بدونِ آن، کاربرِ یک پلتفرم آیکونِ
 *    خالی می‌بیند.
 */
const SOURCE_ICON = {
  mission: 'check',
  daily: 'gift',
  custom: 'sparkle',
  wheel: 'party',
  streak: 'flame',
  pass: 'medal',
  shop: 'shop',
  tap: 'bolt',
  memory: 'target',
  league: 'crown',
};

const KIND_ICON = { win: 'trophy', loss: 'shield', draw: 'handshake' };

/** رنگِ هالهٔ هر لحظه — یک پالتِ واحد، هیچ رنگِ قرمزِ تندی برای باخت. */
const KIND_TONE = {
  gain: 'gold',
  win: 'gold',
  draw: 'sky',
  loss: 'steel',
};

/** ۱۴ ذرهٔ ریزِ بالا‌رونده. بدونِ تصادفِ زمانِ اجرا تا اسکرین‌شات‌ها یکسان بمانند. */
function Particles() {
  const colors = ['#FFD166', '#00D49A', '#38BDF8', '#A78BFA', '#F472B6'];
  return (
    <div className="momentParticles" aria-hidden="true">
      {Array.from({ length: 14 }, (_, i) => (
        <span key={i} style={{
          '--i': i,
          '--x': `${(i * 41) % 100}%`,
          '--c': colors[i % colors.length],
          '--d': `${(i % 6) * 0.09}s`,
        }} />
      ))}
    </div>
  );
}

function Chip({ icon, kind, children }) {
  return (
    <span className="momentChip" data-kind={kind}>
      <SvgIcon name={icon} size={17} />
      {children}
    </span>
  );
}

/**
 * کارتِ یک لحظه.
 *
 * چهار حالت دارد ولی **یک** زبانِ بصری: هالهٔ چرخان + نشانِ آیکون + عنوان +
 * چیپ‌های مقدار + یک درخششِ کشیده روی سطح. تفاوتِ برد/باخت فقط در پالت و
 * در این است که ذره‌ها فقط برای برد و جایزه می‌آیند — برای باخت هیچ حرکتِ
 * شادِ اضافه‌ای نیست تا حسِ مسخره‌شدن ندهد.
 */
function MomentCard({ item, leaving }) {
  const kind = item.kind || REWARD_MOMENTS.GAIN;
  const isGain = kind === REWARD_MOMENTS.GAIN;
  const isLoss = kind === REWARD_MOMENTS.LOSS;
  const isDraw = kind === REWARD_MOMENTS.DRAW;

  const title = isGain
    ? sourceTitle(item.source)
    : isLoss
      ? text('reward.lossTitle', 'این دور تمام شد')
      : isDraw
        ? text('reward.drawTitle', 'پایاپای')
        : text('reward.winTitle', 'بردِ تو ثبت شد');

  const subtitle = isGain
    ? text('reward.received', 'دریافت شد')
    : isLoss
      ? text('reward.lossLine', 'سکه‌هایت سرِ جایشان است — چیزی از دست ندادی')
      : isDraw
        ? text('reward.drawLine', 'هیچ‌کس کم نیاورد؛ یک دستِ دیگر؟')
        : text('reward.winLine', 'حسابِ این برد در پروفایلت ثبت شد');

  const icon = isGain ? (SOURCE_ICON[item.source] || 'gift') : KIND_ICON[kind];

  const amounts = [];
  if (Number(item.points) > 0) {
    amounts.push(<Chip key="p" icon="star">
      {text('reward.points', `+${fa(item.points)} امتیاز`, { amount: item.points })}
    </Chip>);
  }
  if (Number(item.coins) > 0) {
    amounts.push(<Chip key="c" icon="coins">
      {text('reward.coins', `+${fa(item.coins)} سکه`, { amount: item.coins })}
    </Chip>);
  }
  if (Number(item.xp) > 0) {
    amounts.push(<Chip key="x" icon="bolt">
      {text('reward.xp', `+${fa(item.xp)} تجربه`, { amount: item.xp })}
    </Chip>);
  }
  // ── «چه لولی گرفته» یک چیپِ درجه‌یک است، نه یک جملهٔ دست‌ساز ──
  //
  // قبلاً ضربه‌زن لول را داخلِ `note` می‌فرستاد («لولِ ۵»). چون `note`
  // جایگزینِ چیپ‌ها می‌شد، کاربر لول را می‌دید ولی امتیاز و سکه‌ای که
  // همان لحظه گرفته بود را **نمی‌دید** — دقیقاً شکایتِ مالک.
  if (Number(item.level) > 0) {
    amounts.push(<Chip key="l" icon="medal" kind="level">
      {text('reward.level', `لولِ ${fa(item.level)}`, { level: item.level })}
    </Chip>);
  }
  const itemName = String(item.item || '').trim();
  if (itemName) amounts.push(<Chip key="i" icon="item">{itemName}</Chip>);

  return (
    <div
      className={`momentCard${leaving ? ' isLeaving' : ''}`}
      data-kind={kind}
      data-tone={KIND_TONE[kind]}
      data-source={item.source}
    >
      {!isLoss && <Particles />}
      <span className="momentHalo" aria-hidden="true">
        <i />
      </span>
      <span className="momentIcon" aria-hidden="true">
        <SvgIcon name={icon} size={30} />
      </span>
      <div className="momentBody">
        <b className="momentTitle">{title}</b>
        <span className="momentSub">{subtitle}</span>
        {/* ── مقدار همیشه دیده می‌شود ──
            این سه قبلاً `؟ :` زنجیره‌ای بودند، یعنی وجودِ `note` چیپ‌های
            مقدار را خاموش می‌کرد. خواستهٔ مالک صریح است: «حتماً بنویسه
            که اون ریوارد چقدر بوده». پس مقدارها همیشه می‌آیند و `note`
            فقط یک سطرِ توضیحیِ اضافه است. */}
        {amounts.length > 0 && <div className="momentRow">{amounts}</div>}
        {item.note && <span className="momentNote">{item.note}</span>}
      </div>
      <span className="momentShine" aria-hidden="true" />
    </div>
  );
}

/**
 * میزبانِ لحظه‌ها — **یک‌بار** در ریشهٔ اپ سوار می‌شود (main.jsx).
 *
 * چرا در ریشه: گردونه و بازی‌ها تمام‌صفحه‌اند و تبِ باشگاه و فروشگاه در
 * صفحه‌های دیگری‌اند. اگر میزبان داخلِ هر صفحه بود، جشن بدونِ صفحه‌اش
 * می‌مرد و کاربر «هیچ اتفاقی نیفتاد» می‌دید.
 */
export default function RewardMomentHost() {
  const [queue, setQueue] = useState([]);
  const [current, setCurrent] = useState(null);
  const [leaving, setLeaving] = useState(false);
  const seq = useRef(0);

  useEffect(() => onRewardMoment((payload) => {
    seq.current += 1;
    setQueue((q) => (q.length >= QUEUE_LIMIT ? q : [...q, { ...payload, _id: seq.current }]));
  }), []);

  // برداشتنِ سرِ صف، وقتی چیزی روی صفحه نیست.
  useEffect(() => {
    if (current || !queue.length) return undefined;
    const [next, ...rest] = queue;
    setQueue(rest);
    setCurrent(next);
    setLeaving(false);
    return undefined;
  }, [queue, current]);

  // چرخهٔ عمرِ کارت: نمایش → محوِ نرم → برداشتن. هر دو تایمر پاک می‌شوند تا
  // عوض‌کردنِ صفحه وسطِ راه، کارتی روی صفحه جا نگذارد (درسِ حسابِ کهنه).
  useEffect(() => {
    if (!current) return undefined;
    // آهنگِ کوتاهِ جایزه فقط برای دریافت و برد. باخت و تساوی لحنِ خودشان
    // را دارند و این زنگ را نمی‌گیرند. پخش fire-and-forget است.
    if (current.kind !== REWARD_MOMENTS.LOSS && current.kind !== REWARD_MOMENTS.DRAW) {
      play('reward', 0.85);
    }
    const show = Math.max(600, visibleMs() - LEAVE_MS);
    const t1 = setTimeout(() => setLeaving(true), show);
    const t2 = setTimeout(() => setCurrent(null), show + LEAVE_MS);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [current]);

  const host = useMemo(() => ({ role: 'status', 'aria-live': 'polite' }), []);
  if (!current) return null;
  return (
    <div className="momentHost" {...host}>
      <MomentCard key={current._id} item={current} leaving={leaving} />
    </div>
  );
}
