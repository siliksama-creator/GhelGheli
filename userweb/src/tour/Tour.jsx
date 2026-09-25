// ══════════════════════════════════════════════════════════════════════
// آموزشِ صوتیِ قلقلی — موتورِ تور (وب) — نسخهٔ ۲
//
// خواستهٔ مالک: «بعد از ورود، صدای خانم که دقیقاً هر بخشی که داره صحبت
// می‌شه یه علامت لمس نشونش می‌ده و قسمتی که در موردش صحبت نمی‌شه یکم تار
// بشه.»
//
// و دو اصلاحِ مالک (۵ مهر):
//   ۱) «وقتی می‌زنیم بعدی باید جای اون متنی که قرار گرفته عوض شه که زمان
//       توضیح قسمتی که مشخص شده رو نگیره.»
//       → کارتِ متن دیگر همیشه ته صفحه نمی‌چسبد؛ نسبت به هاله **قرینه**
//         می‌شود (اگر جا باشد زیرِ هدف، وگرنه بالای آن) تا روی بخشِ
//         درحالِ‌توضیح نیفتد. متنِ بلند داخلِ خودِ کارت اسکرول می‌شود، نه
//         روی صفحه.
//   ۲) «دکمهٔ تاچ و لمسی باید دقیقاً نشون بده که چطور اصلاً وارد اون قسمت
//       شده.»
//       → هر بخش سه مرحله دارد: (الف) انگشت روی **درِ ورودی** (تبِ نوار
//         پایین یا آیتمِ شیتِ «بیشتر») می‌نشیند و تاچ می‌کند، (ب) همان
//         مسیری که کاربر می‌رفت طی می‌شود (تب/زیرتب/شیت باز می‌شود)،
//         (ج) انگشت از در به سمتِ **هدفِ نهایی** سفر می‌کند و هاله آن‌جا
//         می‌نشیند. بعد صدا شروع می‌شود — پس کلِ روایت صرفِ همان بخشِ
//         روشن می‌شود.
//
// ── پنج تصمیمِ مهم ───────────────────────────────────────────────────
//
// ۱. تور روی هدف **کلیک نمی‌کند**؛ فقط نشان می‌دهد. اگر روی خودِ هدف کلیک
//    می‌کرد، کاربر وسطِ آموزش واردِ فروشگاه یا بازی می‌شد و تور از دست
//    می‌رفت. پس لایهٔ تور همهٔ کلیک‌ها را می‌گیرد و انگشت نمایشی است.
//    (بازکردنِ شیتِ «بیشتر» استثناست و از راهِ رویداد `gg:tour-more` انجام
//    می‌شود — یعنی دقیقاً همان کاری که خودِ کاربر می‌کند، نه شبیه‌سازیِ
//    کلیک روی یک تیغهٔ دلخواه.)
//
// ۲. اگر مرورگر پخشِ خودکار را رد کند (سیاستِ autoplay)، به‌جای سکوت،
//    کارتِ «شروع» نشان داده می‌شود — همان کلیک، اجازهٔ پخش می‌سازد.
//
// ۳. صدا که تمام شد، ~۷۰۰ms بعد خودش می‌رود جلو؛ ولی «بعدی» هم همیشه
//    هست. هرگز کاربر پشتِ صدای ناتمام زندانی نمی‌شود.
//
// ۴. «دیده شد» روی سرور ثبت می‌شود (`POST /api/onboarding/seen`) تا با
//    عوض‌کردنِ گوشی، آموزش از اول شروع نشود؛ «دوباره ببین» از پروفایل
//    رویداد `gg:tour-replay` می‌فرستد و همین موتور دوباره اجرا می‌شود.
//
// ۵. تورِ خودکار فقط از «خانه» شروع می‌شود؛ کسی که با لینکِ اتاقِ مشترک
//    وارد شده وسطِ بازیِ زنده است و تور نباید او را به خانه بکشد.
// ══════════════════════════════════════════════════════════════════════

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { API, req } from '../lib/api.js';
import { TOUR_UI } from './steps.js';
import './tour.css';

const PAD = 8;          // حاشیهٔ شفاف دورِ هدف (پیکسل)
const GAP = 12;         // فاصلهٔ کارت از هالهٔ هدف
const EDGE = 10;        // فاصلهٔ کارت از لبهٔ صفحه
const CARD_MAX = 360;   // سقفِ ارتفاعِ کارت — بقیه‌اش اسکرولِ داخلی
const ADVANCE_MS = 700; // مکثِ بعد از پایانِ صدا
const NAV_SETTLE = 560; // فرصتِ بازشدنِ صفحه/زیرتب/شیتِ تازه
const MAX_WAIT = 3400;  // حداکثر انتظار برای ظهورِ لنگر
const DOOR_MS = 1500;   // مکثِ مرحلهٔ «در»: انگشت می‌نشیند و تاچ می‌کند
const ENTER_MS = 1650;  // مکثِ سفرِ انگشت از در به هدف

/** انتظار برای ظاهر شدنِ یکی از چند انتخابگر؛ آخرین موردِ دیده‌شدنی برنده است. */
function waitForAny(selectors, timeout = MAX_WAIT) {
  const sel = selectors.filter(Boolean).join(',');
  if (!sel) return Promise.resolve(null);
  return new Promise((resolve) => {
    const started = Date.now();
    const tick = () => {
      let list = [];
      try { list = document.querySelectorAll(sel); } catch { list = []; }
      // از آخر به اول: اگر انتخابگر هم روی والد و هم روی فرزند نشسته باشد،
      // فرزند (که دیرتر در DOM می‌آید) دقیق‌تر است.
      for (let i = list.length - 1; i >= 0; i -= 1) {
        const r = list[i].getBoundingClientRect();
        if (r.width > 0 && r.height > 0) return resolve(list[i]);
      }
      if (Date.now() - started > timeout) return resolve(null);
      setTimeout(tick, 90);
    };
    tick();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/** کادرِ یک تیغه با محدودسازیِ داخلِ قاب — هاله هرگز بیرون نمی‌زند. */
function rectOf(el) {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.min(Math.max(r.width, 44), vw - 12);
  const height = Math.min(Math.max(r.height, 44), vh - 12);
  return {
    top: Math.min(Math.max(r.top, 6), vh - 40),
    left: Math.min(Math.max(r.left, 6), Math.max(6, vw - 6 - width)),
    width,
    height,
  };
}

const centerOf = (r) => (r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null);

/** انگشتِ خودکار: از `from` به `to` می‌آید و آن‌جا تاچ می‌کند. */
function Finger({ to, from, nonce }) {
  const style = { left: `${to.x}px`, top: `${to.y}px` };
  if (from) {
    style['--fx'] = `${Math.round(from.x - to.x)}px`;
    style['--fy'] = `${Math.round(from.y - to.y)}px`;
  }
  return (
    <div className={`tourFinger${from ? ' tourFinger--travel' : ''}`} style={style} key={nonce} aria-hidden="true">
      <span className="tourRipple" />
      <svg viewBox="0 0 40 56" width="38" height="53" className="tourHand">
        <path d="M14 22V8.5a4.2 4.2 0 0 1 8.4 0V21h1.9v-3.4a3.6 3.6 0 0 1 7.2 0V22h1.6v-2.1a3.4 3.4 0 0 1 6.8 0v12.6c0 8.4-4.6 14.5-12.6 14.5h-6.1c-4.2 0-6.9-1.8-9.3-5.4l-6.3-9.4c-1.6-2.4-.8-5.2 1.6-6.3 1.9-.9 3.9-.2 5.2 1.3l2.6 3.1h1.6z"
          fill="rgba(255,255,255,0.96)" stroke="rgba(2,6,23,0.55)" strokeWidth="1.4" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

export default function Tour({ token, tab, goTab }) {
  const [data, setData] = useState(null);   // پاسخِ سرور (ترتیب + متن + وضعیت)
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);
  const [rect, setRect] = useState(null);       // کادرِ هدفِ نهایی
  const [doorRect, setDoorRect] = useState(null); // کادرِ «درِ ورودی»
  const [stage, setStage] = useState('target');  // door | target
  const [tick, setTick] = useState(0);          // برای اجرای دوبارهٔ انیمیشن‌ها
  const [cardH, setCardH] = useState(300);      // ارتفاعِ واقعیِ کارت
  // `entering` = وسطِ انیمیشنِ ورود (در → سفر → هدف). جدا از `waiting` است
  // چون آن یکی یعنی «مرورگر پخشِ خودکار را رد کرد» و کاربر باید یک بار
  // بزند؛ در `entering` دکمهٔ اصلی «بعدی» می‌ماند تا کاربر گیر نکند.
  const [phase, setPhase] = useState('offer');  // offer | entering | playing | waiting | manual | error
  const [muted, setMuted] = useState(false);
  const [bootKey, setBootKey] = useState(0);
  const [done, setDone] = useState(false);      // صدای این بخش تمام شد؟

  const audioRef = useRef(null);
  const cardRef = useRef(null);
  const elRef = useRef(null);
  const dataRef = useRef(null);
  const runRef = useRef(0);
  const openRef = useRef(false);
  const blockedRef = useRef(false);
  const tabRef = useRef(tab);
  tabRef.current = tab;
  openRef.current = open;
  dataRef.current = data;

  // ── اندازه‌گیریِ دوبارهٔ هدف (چیدمان/اسکرول/چرخش) ─────────────────────
  const measure = useCallback(() => {
    const el = elRef.current;
    setRect(el ? rectOf(el) : null);
  }, []);

  // ── ارتفاعِ کارت: با تغییرِ متن/دکمه‌ها عوض می‌شود ────────────────────
  useLayoutEffect(() => {
    const el = cardRef.current;
    if (!el) return undefined;
    const read = () => {
      const h = el.offsetHeight || 300;
      // آستانهٔ ۶ پیکسل: بدونِ آن، «کارت بالا/پایین می‌رود → ارتفاع عوض
      // می‌شود → دوباره جابه‌جا می‌شود» به نوسان می‌افتد.
      setCardH(prev => (Math.abs(prev - h) > 6 ? h : prev));
    };
    read();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [idx, phase, stage, open]);

  // ── پخشِ صدای بخشِ جاری ──────────────────────────────────────────────
  const playCurrent = useCallback((step) => {
    const stepObj = step || dataRef.current?.steps?.[idx];
    if (!stepObj) return;
    const audio = audioRef.current;
    if (!audio || stepObj.audioReady === false) { setPhase('manual'); return; }
    // نشانی نسبی می‌ماند و هر بار `load()` می‌شود؛ همین سه خط جای اصلیِ
    // باگِ «صدا پخش نمی‌شود» بود (نشانیِ قدیمی به مسیرِ پروکسی‌نشده می‌رفت).
    const url = API + (stepObj.audioUrl || '');
    try {
      if (audio.getAttribute('src') !== url) { audio.src = url; audio.load(); }
      audio.currentTime = 0;
    } catch { audio.src = url; }
    setDone(false);
    const p = audio.play();
    if (p && typeof p.then === 'function') {
      p.then(() => setPhase('playing'))
        .catch((e) => {
          // «پخشِ خودکار رد شد» با «فایل خراب/۴۰۴» یکی نیست: اولی با یک لمسِ
          // کاربر حل می‌شود، دومی نه. برای همین دو حالتِ جدا نشان داده می‌شود.
          setPhase(e && e.name === 'NotAllowedError' ? 'waiting' : 'error');
        });
    } else {
      setPhase('playing');
    }
  }, [idx]);

  // ── اجرای یک بخش: در → مسیر → هدف → صدا ─────────────────────────────
  const present = useCallback(async (i, stepsArg) => {
    const steps = stepsArg || dataRef.current?.steps || [];
    const step = steps[i];
    if (!step) return;
    const run = ++runRef.current;
    const ui = TOUR_UI[step.id] || {};
    const nav = ui.nav || {};

    setIdx(i);
    setTick(t => t + 1);
    setPhase('entering');
    setStage('target');
    setRect(null);
    setDoorRect(null);
    setDone(false);
    elRef.current = null;
    audioRef.current?.pause();
    document.body.style.overflow = 'hidden';

    // شیتِ «بیشتر» اگر از بخشِ قبلی باز مانده باشد، این بخش در پشتِ آن
    // گم می‌شود؛ هر بخش از حالتِ بسته شروع می‌کند مگر خودش از شیت بیاید.
    const fromSheet = (ui.enter || []).find(x => String(x).startsWith('more:'));
    if (!fromSheet) {
      window.dispatchEvent(new CustomEvent('gg:tour-more', { detail: { open: false, stepId: step.id } }));
    }

    // ── ۱) مرحلهٔ «در» ────────────────────────────────────────────────
    const needTab = !!(nav.tab && nav.tab !== tabRef.current);
    const doorAnchor = fromSheet || (needTab ? `nav:${nav.tab}` : null);
    if (doorAnchor) {
      if (fromSheet) {
        // اول شیت باز شود، بعد دنبالِ آیتمش بگردیم.
        window.dispatchEvent(new CustomEvent('gg:tour-more', { detail: { open: true, stepId: step.id } }));
        await sleep(360);
        if (run !== runRef.current) return;
      }
      const doorEl = await waitForAny([`[data-tour="${doorAnchor}"]`], 2200);
      if (run !== runRef.current) return;
      const dr = rectOf(doorEl);
      setDoorRect(dr);
      if (dr) {
        setStage('door');
        await sleep(DOOR_MS);   // انگشت می‌نشیند و تاچ می‌کند
        if (run !== runRef.current) return;
      }
    }

    // ── ۲) طی‌کردنِ همان مسیری که کاربر می‌رفت ──────────────────────
    if (fromSheet) {
      // «در» یک آیتمِ شیت است: همان دو کاری که خودِ آیتم می‌کند —
      // تب عوض شود و شیت بسته شود.
      window.dispatchEvent(new CustomEvent('gg:tour-goto', { detail: { tab: nav.tab, stepId: step.id } }));
    } else if (needTab) {
      goTab?.(nav.tab);
    }
    if (nav.sub) {
      window.dispatchEvent(new CustomEvent('gg:tour-sub', { detail: { sub: nav.sub, stepId: step.id } }));
    }
    await sleep(NAV_SETTLE);
    if (run !== runRef.current) return;

    // ── ۳) هدف ───────────────────────────────────────────────────────
    const anchors = (ui.anchors || []).map(a => `[data-tour="${a}"]`);
    const el = await waitForAny(anchors);
    if (run !== runRef.current) return;
    elRef.current = el;
    if (el) {
      try { el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' }); } catch { /* بی‌حرکت هم قبول */ }
      await sleep(420);
      if (run !== runRef.current) return;
    }
    setRect(el ? rectOf(el) : null);
    setStage('target');
    // سفرِ انگشت از در به هدف: همین چند صد میلی‌ثانیه، «راهِ رسیدن» را
    // نشان می‌دهد و بعد صدا شروع می‌شود — پس کلِ روایت صرفِ همان بخشِ
    // روشن می‌شود، نه صرفِ پیدا کردنش.
    if (el) await sleep(ENTER_MS);
    if (run !== runRef.current) return;
    playCurrent(step);
  }, [goTab, playCurrent]);

  // ── پایانِ تور ───────────────────────────────────────────────────────
  const finish = useCallback(async (skipped) => {
    runRef.current += 1;
    document.body.style.overflow = '';
    audioRef.current?.pause();
    setOpen(false);
    setRect(null);
    setDoorRect(null);
    elRef.current = null;
    window.dispatchEvent(new CustomEvent('gg:tour-more', { detail: { open: false } }));
    try {
      await req('/api/onboarding/seen', 'POST',
        { version: dataRef.current?.version || 1, skipped: skipped === true }, token);
      setData(d => (d ? { ...d, seen: true, skipped: skipped === true } : d));
    } catch { /* ثبتِ پرچم نباید تجربه را بشکند */ }
  }, [token]);

  const next = useCallback(() => {
    const total = dataRef.current?.steps?.length || 0;
    if (idx + 1 >= total) return finish(false);
    return present(idx + 1);
  }, [idx, finish, present]);

  // «پخش دوباره» = بازپخشِ همین بخش از اول، با همان انیمیشنِ ورود.
  const replay = useCallback(() => present(idx), [idx, present]);

  // ── راه‌اندازی: کشیدنِ وضعیت از سرور ────────────────────────────────
  // `bootKey` فقط وقتی بالا می‌رود که تورِ خودکار به‌خاطرِ «کاربر وسطِ اتاقِ
  // مشترک است» عقب افتاده باشد؛ آن‌وقت با برگشتن به خانه از اول تلاش می‌کند.
  useEffect(() => {
    if (!token) return undefined;
    // تغییرِ تب در میانهٔ تور، ناوبریِ خودِ تور است؛ بازخوانی و ری‌استارت نه.
    if (openRef.current) return undefined;
    let alive = true;
    (async () => {
      const d = await req('/api/onboarding', 'GET', null, token).catch(() => null);
      if (!alive || !d?.steps?.length) return;
      setData(d);
      if (!d.enabled) return;
      const forced = new URLSearchParams(window.location.search).get('tour') === '1';
      if (d.seen && !forced) return;
      // تورِ خودکار فقط وقتی تب «خانه» است شروع می‌شود. اگر کاربر با لینکِ
      // اتاقِ مشترک وارد شده باشد تبش club است؛ تور روی بازیِ در جریان
      // نمی‌پرد و به‌محضِ برگشتن به خانه خودش می‌آید.
      if (!forced && tabRef.current !== 'home') { blockedRef.current = true; return; }
      setOpen(true);
      setIdx(0);
      await present(0, d.steps);
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, bootKey]);

  // ── پیش‌بارگذاریِ بخشِ بعد ─────────────────────────────────────────
  useEffect(() => {
    const nx = data?.steps?.[idx + 1];
    if (!nx?.audioUrl) return undefined;
    const a = new Audio();
    a.preload = 'auto';
    a.src = API + nx.audioUrl;
    return () => { try { a.removeAttribute('src'); a.load(); } catch { /* بی‌اهمیت */ } };
  }, [data, idx]);

  // ── عقب‌افتاده بود؟ با برگشت به خانه شروع کن ────────────────────────
  useEffect(() => {
    if (tab !== 'home' || !blockedRef.current || openRef.current) return;
    blockedRef.current = false;
    setBootKey(k => k + 1);
  }, [tab]);

  // ── «دوباره ببین» از پروفایل ────────────────────────────────────────
  useEffect(() => {
    const onReplay = () => {
      if (!dataRef.current?.steps?.length) return;
      setOpen(true);
      present(0);
    };
    window.addEventListener('gg:tour-replay', onReplay);
    return () => window.removeEventListener('gg:tour-replay', onReplay);
  }, [present]);

  // ── هم‌گام‌سازیِ هاله با چیدمان + کلیدهای میان‌بر ────────────────────
  useEffect(() => {
    if (!open) return undefined;
    const id = setInterval(measure, 320);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    const onKey = (e) => {
      if (e.key === 'Escape') finish(true);
      else if (e.key === 'ArrowLeft') next();
      else if (e.key === 'ArrowRight') replay();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      clearInterval(id);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, measure, finish, next, replay]);

  // ── بستنِ تمیز ───────────────────────────────────────────────────────
  useEffect(() => () => { document.body.style.overflow = ''; }, []);

  const step = data?.steps?.[idx];
  if (!open || !step) return null;
  const total = data.steps.length || 0;

  // ── جای کارت: قرینهِ هدف، تا روی بخشِ درحالِ‌توضیح نیفتد ──────────────
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const cardW = Math.min(520, vw - 20);
  const focus = stage === 'door' ? (doorRect || rect) : rect;
  let pos = { side: 'center', left: EDGE, width: cardW, maxH: CARD_MAX };
  if (focus) {
    const roomBelow = vh - (focus.top + focus.height + PAD + GAP) - EDGE;
    const roomAbove = (focus.top - PAD - GAP) - EDGE;
    const side = roomBelow >= cardH + 8 ? 'bottom'
      : roomAbove >= cardH + 8 ? 'top'
        : (roomBelow >= roomAbove ? 'bottom' : 'top');
    const room = Math.max(168, side === 'bottom' ? roomBelow : roomAbove);
    const left = Math.min(Math.max(focus.left + focus.width / 2 - cardW / 2, EDGE),
      Math.max(EDGE, vw - cardW - EDGE));
    pos = side === 'bottom'
      ? { side, left, width: cardW, top: focus.top + focus.height + PAD + GAP, maxH: Math.min(CARD_MAX, room) }
      : { side, left, width: cardW, bottom: Math.max(EDGE, vh - (focus.top - PAD - GAP)), maxH: Math.min(CARD_MAX, room) };
  }
  const ringRect = stage === 'door' ? doorRect : rect;
  const to = centerOf(ringRect);
  const from = centerOf(doorRect);
  const travel = stage === 'target' && from && to ? from : null;

  return (
    <div className="tourRoot" role="dialog" aria-modal="true" aria-label="آموزش صوتی قلقلی">
      {stage === 'target' && rect ? (
        <>
          {/* چهار پنلِ تار: هرچه جز خودِ بخشِ جاری، مات و تار می‌شود. */}
          <div className="tourShade" style={{ left: 0, right: 0, top: 0, height: Math.max(0, rect.top - PAD) }} />
          <div className="tourShade" style={{ left: 0, right: 0, top: rect.top + rect.height + PAD, bottom: 0 }} />
          <div className="tourShade" style={{ left: 0, top: Math.max(0, rect.top - PAD), width: Math.max(0, rect.left - PAD), height: rect.height + PAD * 2 }} />
          <div className="tourShade" style={{ left: rect.left + rect.width + PAD, right: 0, top: Math.max(0, rect.top - PAD), height: rect.height + PAD * 2 }} />
          {/* مسدودکنندهٔ حفره: تور خودش کلیک نمی‌کند و نمی‌گذارد کاربر هم
              وسطِ آموزش روی هدف بزند و از صحنه بیرون بیفتد. «رد کردن» و
              «بعدی» تنها راهِ تعامل‌اند — تا تور هرگز نصفه رها نشود. */}
          <div className="tourBlock" style={{ left: rect.left - PAD, top: rect.top - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 }} />
        </>
      ) : (
        <div className="tourShade tourShadeFull" />
      )}

      {ringRect && (
        <div className={`tourRing${stage === 'door' ? ' tourRing--door' : ''}`}
          style={{ left: ringRect.left - PAD, top: ringRect.top - PAD, width: ringRect.width + PAD * 2, height: ringRect.height + PAD * 2 }}
          aria-hidden="true" />
      )}
      {to && <Finger to={to} from={travel} nonce={`${stage}-${idx}-${tick}`} />}

      <div className="tourCard" ref={cardRef}
        style={{ left: pos.left, width: pos.width, maxHeight: pos.maxH, top: pos.top, bottom: pos.bottom }}>
        <div className="tourCardTop">
          <span className="tourBadge">آموزش صوتی قلقلی</span>
          <span className="tourCount">{idx + 1} از {total}</span>
          <button type="button" className="tourSkip" onClick={() => finish(true)}>رد کردن</button>
        </div>
        <div className="tourBar" aria-hidden="true"><i style={{ width: `${((idx + 1) / total) * 100}%` }} /></div>

        {/* متن اسکرولِ داخلی دارد: کارت هرگز روی هاله نمی‌افتد و متنِ بلند
            هم فضای بیشتر از سقفِ کارت نمی‌گیرد. */}
        <div className="tourBody">
          <h3 className="tourTitle">{step.title}</h3>
          <p className="tourText">{step.text}</p>
        </div>

        {phase === 'offer' && (
          <p className="tourHint">برای شروعِ پخشِ صدا یک‌بار بزن؛ بعدش خودش جلو می‌رود.</p>
        )}
        {phase === 'waiting' && (
          <p className="tourHint">مرورگر پخشِ خودکار را بست؛ یک‌بار روی «پخش صدا» بزن تا شروع شود.</p>
        )}
        {phase === 'entering' && (
          <p className="tourHint">داریم می‌رویم سراغِ «{step.title}»…</p>
        )}
        {phase === 'manual' && (
          <p className="tourHint">صدای این بخش در دسترس نیست؛ متن را بخوان و «بعدی» را بزن.</p>
        )}
        {phase === 'error' && (
          <p className="tourHint">صدا بارگیری نشد. اینترنت را چک کن و «پخش دوباره» را بزن.</p>
        )}

        <div className="tourActions">
          {(phase === 'offer' || phase === 'waiting') ? (
            <button type="button" className="tourPrimary" onClick={() => playCurrent(step)}>
              {phase === 'offer' ? 'شروع آموزش' : 'پخش صدا'}
            </button>
          ) : (
            <button type="button" className="tourPrimary" onClick={next}>
              {idx + 1 >= total ? 'پایان' : 'بعدی'}
            </button>
          )}
          <button type="button" className="tourSecondary"
            onClick={() => { setMuted(m => !m); if (audioRef.current) audioRef.current.muted = !muted; }}>
            {muted ? 'صدا خاموش' : 'صدا روشن'}
          </button>
          {(phase === 'playing' || phase === 'manual' || phase === 'error') && (
            <button type="button" className="tourSecondary" onClick={replay}>پخش دوباره</button>
          )}
        </div>
      </div>

      {/* عنصرِ صدا: یکی برای همهٔ بخش‌ها؛ با هر بخش `src` عوض می‌شود. */}
      <audio
        ref={audioRef}
        preload="auto"
        playsInline
        onEnded={() => {
          setDone(true);
          if (phase === 'playing') setTimeout(() => { next(); }, ADVANCE_MS);
        }}
        onError={() => {
          // خطای بارگیری (۴۰۴/بلاک/کدک) → پیامِ شبکه، نه پیامِ «پخشِ خودکار».
          if (phase !== 'offer') setPhase('error');
        }}
      />
    </div>
  );
}
