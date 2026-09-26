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
//
// ۶. 🔴 تور **داخلِ قابِ خودِ اپ** می‌نشیند، نه روی کلِ پنجره.
//    اپ روی دسکتاپ یک ستونِ وسط‌چین است (`main.tabPane` با
//    `max-width:540px; margin-inline:auto` داخلِ `.portal`)، ولی نسخهٔ
//    اولِ تور `inset:0` روی نما می‌نشست؛ نتیجه: هم لایهٔ تارِ تیره و هم
//    کارتِ متن از دو طرفِ قاب بیرون می‌زدند. خودِ اپ این درس را یک بار
//    برای لایهٔ «راهنمای اسکرول» نوشته بود («یک لایهٔ fixed داخلِ ستونِ
//    اپ، نه چسبیده به نما»). این‌جا همان قاعده با `readFrame()` اجرا
//    می‌شود: کادرِ ستونِ اپ خوانده و **قطع** می‌شود با ناحیهٔ دیده‌شدنیِ
//    واقعی (`visualViewport` که نوارِ آدرسِ مرورگرِ موبایل را هم حساب
//    می‌کند). همهٔ مختصاتِ داخلِ تور نسبت به همین قاب‌اند و در پایانِ کار
//    هر لبه با `clampBox` به داخلِ قاب **دوخته** می‌شود: هاله حتی یک پیکسل
//    هم بیرون نمی‌زند.
// ══════════════════════════════════════════════════════════════════════

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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

/**
 * قابِ تور = ستونِ اپ، بریده‌شده با ناحیهٔ دیده‌شدنیِ واقعی.
 *
 * چرا `visualViewport` و نه `innerWidth/innerHeight`: روی موبایل، نوارِ
 * آدرس/ابزارِ مرورگر بخشی از نما را می‌پوشاند و `innerHeight` آن را حساب
 * نمی‌کند؛ نتیجه می‌شد کارتی که پایینش زیرِ نوارِ مرورگر می‌ماند. با
 * `visualViewport` همان ناحیه‌ای خوانده می‌شود که کاربر واقعاً می‌بیند.
 *
 * چرا ستونِ اپ و نه کلِ پنجره: روی دسکتاپ اپ یک ستونِ وسط‌چین است؛ تورِ
 * تمام‌عرض از قاب بیرون می‌زد (گزارشِ مالک: «از سایز وب‌اپ و از کادر خارج
 * می‌شه»). اگر ستونِ اپ پیدا نشد (یا بی‌معنی باریک بود) به نما برمی‌گردیم —
 * یعنی رفتارِ موبایل هرگز بدتر از قبل نمی‌شود.
 */
function readFrame() {
  const vv = window.visualViewport;
  const vw = Math.round(vv ? vv.width : document.documentElement.clientWidth);
  const vh = Math.round(vv ? vv.height : document.documentElement.clientHeight);
  const vTop = Math.round(vv ? vv.offsetTop : 0);
  const vLeft = Math.round(vv ? vv.offsetLeft : 0);
  const frame = { left: vLeft, top: vTop, width: vw, height: vh };
  const col = document.querySelector('main.tabPane')
    || document.querySelector('.page')
    || document.querySelector('.portal');
  if (!col) return frame;
  const r = col.getBoundingClientRect();
  const start = Math.max(vLeft, Math.round(r.left));
  const end = Math.min(vLeft + vw, Math.round(r.right));
  // کمتر از ۲۴۰ پیکسل یعنی عنصرِ اشتباهی پیدا شده؛ نما امن‌تر است.
  if (end - start >= 240) {
    frame.left = start;
    frame.width = end - start;
  }
  return frame;
}

/** کادرِ عنصر در مختصاتِ **قاب** (نه پنجره). */
function rectInFrame(el, frame) {
  if (!el || !frame) return null;
  const r = el.getBoundingClientRect();
  if (r.width < 1 || r.height < 1) return null;
  const width = Math.min(r.width, frame.width - 2 * EDGE);
  const height = Math.min(Math.max(r.height, 40), frame.height - 2 * EDGE);
  return {
    left: Math.min(Math.max(r.left - frame.left, 0), Math.max(0, frame.width - width)),
    top: Math.min(Math.max(r.top - frame.top, 0), Math.max(0, frame.height - height)),
    width,
    height,
  };
}

/**
 * دوختنِ یک کادر به قاب: برای هاله که `PAD` پیکسل بزرگ‌تر از هدف است،
 * لبهٔ بیرون‌زده با **کوچک‌کردن** کادر جبران می‌شود (نه جابه‌جا کردن).
 * نتیجه: هاله هیچ‌وقت از قاب بیرون نمی‌زند، حتی روی تیغه‌ای که خودش تا لبهٔ
 * ستون می‌رود.
 */
function clampBox(box, frame) {
  let { left, top, width, height } = box;
  if (left < 0) { width += left; left = 0; }
  if (top < 0) { height += top; top = 0; }
  if (left + width > frame.width) width = frame.width - left;
  if (top + height > frame.height) height = frame.height - top;
  return { left, top, width: Math.max(24, width), height: Math.max(24, height) };
}

const centerOf = (r) => (r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null);

/** مرکزِ هدف، دوخته‌شده به قاب — دستِ انگشت هم بیرون نمی‌زند. */
function clampPoint(p, frame) {
  const MX = 22;  // نصفِ عرضِ دست (۳۸px) + حاشیه
  const MY = 30;  // نصفِ ارتفاعِ دست (۵۳px) + حاشیه
  return {
    x: Math.min(Math.max(p.x, MX), Math.max(MX, frame.width - MX)),
    y: Math.min(Math.max(p.y, MY), Math.max(MY, frame.height - MY)),
  };
}

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
  const [frame, setFrame] = useState(() => readFrame());
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
  const frameRef = useRef(frame);
  frameRef.current = frame;
  const runRef = useRef(0);
  const openRef = useRef(false);
  const blockedRef = useRef(false);
  const tabRef = useRef(tab);
  tabRef.current = tab;
  openRef.current = open;
  dataRef.current = data;

  // ── اندازه‌گیریِ دوبارهٔ هدف و قاب (چیدمان/اسکرول/چرخش/نوارِ مرورگر) ──
  const measure = useCallback(() => {
    const f = readFrame();
    const el = elRef.current;
    const r = rectInFrame(el, f);
    // آستانهٔ ۰٫۵ پیکسل: بدونِ آن هر اندازه‌گیری یک state تازه می‌سازد و
    // چرخهٔ رندر/اندازه‌گیری بی‌دلیل گرم می‌ماند.
    setFrame(prev => (Math.abs(prev.left - f.left) > 0.5 || Math.abs(prev.top - f.top) > 0.5
      || Math.abs(prev.width - f.width) > 0.5 || Math.abs(prev.height - f.height) > 0.5 ? f : prev));
    setRect(prev => {
      if (!r) return prev ? null : prev;
      if (prev && Math.abs(prev.left - r.left) < 0.5 && Math.abs(prev.top - r.top) < 0.5
        && Math.abs(prev.width - r.width) < 0.5 && Math.abs(prev.height - r.height) < 0.5) return prev;
      return r;
    });
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
      const dr = rectInFrame(doorEl, frameRef.current);
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
    // بعد از سفر، اگر قاب عوض شده باشد (شیت بسته شد / نوارِ مرورگر جمع شد)
    // دوباره از نو خوانده می‌شود؛ وگرنه هاله به مختصاتِ قدیمی می‌چسبد.
    setFrame(readFrame());
    setRect(rectInFrame(el, frameRef.current));
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
    // نوارِ آدرسِ موبایل با اسکرول جمع/باز می‌شود و قابِ دیده‌شدنی عوض
    // می‌شود؛ بدونِ این دو لیسنر، کارت زیرِ نوارِ مرورگر می‌ماند.
    const vv = window.visualViewport;
    vv?.addEventListener('resize', measure);
    vv?.addEventListener('scroll', measure);
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
      vv?.removeEventListener('resize', measure);
      vv?.removeEventListener('scroll', measure);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, measure, finish, next, replay]);

  // ── بستنِ تمیز ───────────────────────────────────────────────────────
  useEffect(() => () => { document.body.style.overflow = ''; }, []);

  const step = data?.steps?.[idx];
  if (!open || !step) return null;
  const total = data.steps.length || 0;

  // ── هندسهٔ داخلِ قاب ────────────────────────────────────────────────
  // همهٔ اعدادِ پایین **نسبت به قاب** هستند (نه پنجره)؛ قاب همان ستونِ اپ
  // است که `readFrame` می‌دهد. این‌ها تنها جایی هستند که مختصات ساخته
  // می‌شود — بقیهٔ JSX فقط مصرف می‌کند.
  const ringRect = stage === 'door' ? doorRect : rect;
  // هاله = هدف + PAD، دوخته‌شده به قاب (لبهٔ بیرون‌زده کوچک می‌شود).
  const ringBox = ringRect
    ? clampBox({
      left: ringRect.left - PAD,
      top: ringRect.top - PAD,
      width: ringRect.width + PAD * 2,
      height: ringRect.height + PAD * 2,
    }, frame)
    : null;
  const holeBox = ringRect
    ? clampBox({ left: ringRect.left, top: ringRect.top, width: ringRect.width, height: ringRect.height }, frame)
    : null;

  const to = ringBox ? centerOf(ringBox) : null;
  const doorCenter = doorRect ? centerOf(doorRect) : null;
  const from = stage === 'target' ? doorCenter : null;
  const fingerTo = to ? clampPoint(to, frame) : null;
  const fingerFrom = from && fingerTo ? clampPoint(from, frame) : null;

  // ── جای کارت: قرینهِ هدف، داخلِ قاب ─────────────────────────────────
  // «وقتی می‌زنیم بعدی باید جای اون متن عوض شه که زمانِ توضیحِ قسمتی که
  //  مشخص شده رو نگیره.» + «از کادر خارج نشه.»
  const cardW = Math.max(220, Math.min(520, frame.width - EDGE * 2));
  const focus = holeBox;
  let pos = { left: Math.round((frame.width - cardW) / 2), width: cardW, maxH: CARD_MAX };
  if (focus) {
    const roomBelow = frame.height - (focus.top + focus.height + GAP) - EDGE;
    const roomAbove = focus.top - GAP - EDGE;
    const side = roomBelow >= cardH + 8 ? 'bottom'
      : roomAbove >= cardH + 8 ? 'top'
        : (roomBelow >= roomAbove ? 'bottom' : 'top');
    const room = Math.max(150, side === 'bottom' ? roomBelow : roomAbove);
    // مرکزِ هدف، بعد دوختنِ همان مرکز به قاب — کارت هرگز از قاب بیرون نمی‌زند.
    const centered = focus.left + focus.width / 2 - cardW / 2;
    const left = Math.min(Math.max(centered, EDGE), Math.max(EDGE, frame.width - cardW - EDGE));
    pos = side === 'bottom'
      ? { left, width: cardW, top: Math.round(focus.top + focus.height + GAP), maxH: Math.min(CARD_MAX, room) }
      : { left, width: cardW, bottom: Math.round(frame.height - (focus.top - GAP)), maxH: Math.min(CARD_MAX, room) };
  }

  // ── پورتال به body ──────────────────────────────────────────────────
  // چرا: اگر روزی یکی از والدهای اپ `transform/filter/overflow` بگیرد،
  // `position: fixed` به همان والد می‌چسبد و تور جا به جا می‌شود. با
  // پورتال، لایه همیشه نسبت به نماست و هیچ قابِ اپی آن را نمی‌بُرد.
  return createPortal(
    <div className="tourRoot"
      style={{ left: frame.left, top: frame.top, width: frame.width, height: frame.height }}
      role="dialog" aria-modal="true" aria-label="آموزش صوتی قلقلی">
      {stage === 'target' && holeBox ? (
        <>
          {/* چهار پنلِ تار: هرچه جز خودِ بخشِ جاری، مات و تار می‌شود.
              همه از «سوراخِ» دوخته‌شده حساب می‌شوند تا لبه‌شان قاب را
              دقیقاً پر کند. */}
          <div className="tourShade" style={{ left: 0, right: 0, top: 0, height: holeBox.top }} />
          <div className="tourShade" style={{ left: 0, right: 0, top: holeBox.top + holeBox.height, bottom: 0 }} />
          <div className="tourShade" style={{ left: 0, top: holeBox.top, width: holeBox.left, height: holeBox.height }} />
          <div className="tourShade" style={{ left: holeBox.left + holeBox.width, right: 0, top: holeBox.top, height: holeBox.height }} />
          {/* مسدودکنندهٔ حفره: تور خودش کلیک نمی‌کند و نمی‌گذارد کاربر هم
              وسطِ آموزش روی هدف بزند و از صحنه بیرون بیفتد. «رد کردن» و
              «بعدی» تنها راهِ تعامل‌اند — تا تور هرگز نصفه رها نشود. */}
          <div className="tourBlock" style={{ left: holeBox.left, top: holeBox.top, width: holeBox.width, height: holeBox.height }} />
        </>
      ) : (
        <div className="tourShade tourShadeFull" />
      )}

      {ringBox && (
        <div className={`tourRing${stage === 'door' ? ' tourRing--door' : ''}`}
          style={{ left: ringBox.left, top: ringBox.top, width: ringBox.width, height: ringBox.height }}
          aria-hidden="true" />
      )}
      {fingerTo && <Finger to={fingerTo} from={fingerFrom} nonce={`${stage}-${idx}-${tick}`} />}

      <div className="tourCard" ref={cardRef}
        style={{ left: pos.left, width: pos.width, maxWidth: frame.width - EDGE * 2, maxHeight: pos.maxH, top: pos.top, bottom: pos.bottom }}>
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
    </div>,
    document.body,
  );
}
