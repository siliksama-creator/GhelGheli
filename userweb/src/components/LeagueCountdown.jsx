// ═══════════════════════════════════════════════════════════════════════════
// کارتِ شماره معکوسِ شروعِ لیگ — کامپوننتِ مشترکِ وب
// ═══════════════════════════════════════════════════════════════════════════
//
// ── خواستهٔ مالک (۲۷ شهریور) ────────────────────────────────────────────────
//
//   «وقتی فعال شد، شماره معکوس در قسمتِ لیگ یا بازیِ آنلاین یا بازیِ ضربه‌زن
//    نمایش داده بشه... خیلی زیبا... متنش هم از پنل قابلِ تغییر باشه.»
//
// ── سه تصمیمی که این فایل را شکل داده ──────────────────────────────────────
//
//   ۱. **یک درخواست برای هر سه صفحه.** سه صفحه (لیگ، بازیِ آنلاین، ضربه‌زن)
//      این کارت را نشان می‌دهند. اگر هرکدام جداگانه می‌گرفت، کاربر در رفتن
//      بین تب‌ها سه بار همان داده را می‌کشید. حالا یک «مخزنِ کوچک» ماژولی
//      هست: اولین صفحه می‌گیرد، بقیه همان را می‌خوانند و هر ۶۰ ثانیه تازه
//      می‌شود (پس تغییرِ متن از پنل بدونِ رفرشِ صفحه دیده می‌شود).
//
//   ۲. **شمارش با ساعتِ سرور.** ساعتِ گوشی و مرورگرِ کاربر می‌تواند دقیقه‌ها
//      جلو/عقب باشد. اختلاف در لحظهٔ دریافتِ پاسخ محاسبه و از آن به بعد
//      اعمال می‌شود (`skew`)، وگرنه کسی که ساعتش جلوست کارتِ تمام‌شده می‌بیند.
//
//   ۳. **صفر = پنهانشدنِ خودکار.** وقتی به صفر رسید، یک‌بار از سرور تازه
//      می‌خوانیم؛ سرور آن لحظه `active:false` می‌دهد، کارت `null` برمی‌گرداند
//      و دکمه‌های بازی هم خودشان آزاد می‌شوند. هیچ دکمه/تیکِ دستی‌ای در کار
//      نیست — دقیقاً چیزی که مالک خواست.
import React, { useEffect, useRef, useState } from 'react';
import { req, fa } from '../lib/api.js';
import { SvgIcon } from './IconAsset.jsx';

const PATH = '/api/league/countdown';
const REFRESH_MS = 60_000;

// ── مخزنِ کوچک (خارج از React) ─────────────────────────────────────────────
// `subs` فهرستِ setStateِ هر صفحهٔ باز است تا تازه‌شدنِ داده به همه برسد.
const subs = new Set();
let store = null;       // آخرین پاسخِ سرور
let storeAt = 0;        // چه زمانی گرفتیمش
let inflight = null;    // جلوگیری از درخواستِ هم‌زمان از دو صفحه
let skew = 0;           // ساعتِ سرور منهای ساعتِ مرورگر

function notify() {
  for (const fn of subs) {
    try { fn(store); } catch { /* یک صفحهٔ خراب نباید بقیه را بخواباند */ }
  }
}

function fetchCountdown(force = false) {
  if (inflight) return inflight;
  if (!force && store && Date.now() - storeAt < REFRESH_MS) return Promise.resolve(store);
  inflight = req(PATH, 'GET', null, null)
    .then((data) => {
      if (data && typeof data === 'object') {
        store = data;
        storeAt = Date.now();
        const serverNow = Date.parse(data.serverNow || '');
        skew = Number.isFinite(serverNow) ? serverNow - Date.now() : 0;
        notify();
      }
      return store;
    })
    // شبکه لرزید؟ مقدارِ قبلی می‌ماند. «نمی‌دانم» هرگز نباید به «قفل کن»
    // ترجمه شود — سرور خودش تصمیمِ نهایی را دارد.
    .catch(() => store)
    .finally(() => { inflight = null; });
  return inflight;
}

/**
 * وضعیتِ زندهٔ شماره معکوس برای هر صفحهٔ وب.
 * برمی‌گرداند: `{ active, blocks:{online,tap}, leftMs, title, subtitle, note, message, startsAt }`
 */
export function useLeagueCountdown() {
  const [state, setState] = useState(store);
  const [, setTick] = useState(0);
  const zeroFired = useRef(false);

  useEffect(() => {
    subs.add(setState);
    fetchCountdown(false);
    return () => { subs.delete(setState); };
  }, []);

  const active = Boolean(state?.active);

  // تیکِ یک‌ثانیه‌ای فقط وقتی کارت واقعاً روی صفحه است؛ در بقیهٔ حالت‌ها
  // هیچ تایمری نمی‌چرخد (باتری و CPU کاربر).
  useEffect(() => {
    if (!active) return undefined;
    const t = window.setInterval(() => setTick((v) => v + 1), 1000);
    return () => window.clearInterval(t);
  }, [active]);

  const startsMs = state?.startsAt ? Date.parse(state.startsAt) : NaN;
  const leftMs = active && Number.isFinite(startsMs)
    ? Math.max(0, startsMs - (Date.now() + skew))
    : 0;

  // رسیدن به صفر ⇒ یک‌بار پرس‌وجوی تازه (تا سرور بگوید باز شد).
  useEffect(() => {
    if (active && leftMs <= 0 && !zeroFired.current) {
      zeroFired.current = true;
      fetchCountdown(true);
    }
  }, [active, leftMs]);

  if (!state) return { active: false, leftMs: 0, blocks: { online: false, tap: false } };
  return { ...state, active, leftMs };
}

const pad2 = (n) => String(Math.max(0, Math.floor(n))).padStart(2, '0');

function splitLeft(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return {
    days: Math.floor(total / 86400),
    hours: Math.floor((total % 86400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  };
}

/** «۱ مهر، ساعت ۲۰:۳۰» — با تقویم و رقم‌های فارسیِ خودِ مرورگر. */
function faDateTime(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  try {
    return new Intl.DateTimeFormat('fa-IR', { dateStyle: 'short', timeStyle: 'short' }).format(d);
  } catch {
    return d.toLocaleString('fa-IR');
  }
}

/**
 * کارتِ شماره معکوس.
 *
 * ⚠️ اگر فعال نباشد **هیچ‌چیز** رندر نمی‌کند. این «پنهان‌شدنِ خودکار» است،
 *    نه یک تصمیمِ ظاهری: بعد از رسیدن به صفر هم همین تابع خالی برمی‌گرداند.
 *
 * @param {{ compact?: boolean, className?: string }} props
 */
export default function LeagueCountdown({ compact = false, className = '' }) {
  const cd = useLeagueCountdown();
  if (!cd.active) return null;

  const { days, hours, minutes, seconds } = splitLeft(cd.leftMs);
  const total = Math.max(1, Date.parse(cd.startsAt) - (Date.parse(cd.serverNow) || Date.now()));
  const pct = Math.min(100, Math.max(0, 100 - (cd.leftMs / total) * 100));

  const units = [
    { key: 'd', value: days, label: 'روز' },
    { key: 'h', value: hours, label: 'ساعت' },
    { key: 'm', value: minutes, label: 'دقیقه' },
    { key: 's', value: seconds, label: 'ثانیه' },
  ];

  return (
    <section className={`leagueCountdown${compact ? ' compact' : ''}${className ? ` ${className}` : ''}`}>
      <header className="lgcdHead">
        <span className="lgcdIcon" aria-hidden="true"><SvgIcon name="clock" size={20} /></span>
        <div className="lgcdTitles">
          <b>{cd.title}</b>
          {cd.subtitle ? <small>{cd.subtitle}</small> : null}
        </div>
      </header>

      <div className="lgcdGrid">
        {units.map((u) => (
          <div className="lgcdBox" key={u.key}>
            <strong>{fa(pad2(u.value))}</strong>
            <span>{u.label}</span>
          </div>
        ))}
      </div>

      <div className="lgcdBar" aria-hidden="true"><i style={{ width: `${pct.toFixed(2)}%` }} /></div>

      <div className="lgcdFoot">
        {cd.startsAt ? <span>شروعِ لیگ: {faDateTime(cd.startsAt)}</span> : <span />}
        {cd.note ? <small>{cd.note}</small> : null}
      </div>
    </section>
  );
}
