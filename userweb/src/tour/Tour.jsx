// ══════════════════════════════════════════════════════════════════════
// آموزشِ صوتیِ قلقلی — موتورِ تور (وب)
//
// خواستهٔ مالک: «بعد از ورود، صدای خانم که دقیقاً هر بخشی که داره صحبت
// می‌شه یه علامت لمس نشونش می‌ده و قسمتی که در موردش صحبت نمی‌شه یکم تار
// بشه. خیلی حرفه‌ای باید بسازی.»
//
// این کامپوننت چهار چیز را هم‌زمان نگه می‌دارد:
//   ۱) صدا — متن و ترتیب از سرور (`/api/onboarding`)؛ کلاینت متن نمی‌سازد.
//   ۲) لنگر — تیغهٔ واقعیِ رابط با `data-tour` پیدا و «هاله» می‌شود.
//   ۳) تارکردنِ بقیه — چهار پنلِ `backdrop-filter` دورِ هدف (حفره).
//   ۴) انگشتِ خودکار — روی مرکزِ همان هدف تاچ می‌کند، هم‌زمان با صدا.
//
// ── چهار تصمیمِ مهم ──────────────────────────────────────────────────
//
// ۱. تور **کلیک نمی‌کند**؛ فقط نشان می‌دهد. اگر روی خودِ هدف کلیک می‌کرد،
//    کاربر وسطِ آموزش واردِ فروشگاه یا بازی می‌شد و تور از دست می‌رفت.
//    پس لایهٔ تور همهٔ کلیک‌ها را می‌گیرد و انگشت فقط نمایشی است.
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
// ══════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useRef, useState } from 'react';
import { API, req } from '../lib/api.js';
import { TOUR_UI } from './steps.js';
import './tour.css';

const PAD = 8;          // حاشیهٔ شفاف دورِ هدف (پیکسل)
const ADVANCE_MS = 700; // مکثِ بعد از پایان صدا
const NAV_SETTLE = 520; // فرصتِ بازشدنِ صفحه/زیرتبِ تازه
const MAX_WAIT = 3200;  // حداکثر انتظار برای ظهورِ لنگر

/** انتظار برای ظاهر شدنِ یک انتخابگر (تا سقفِ زمانی). */
function waitFor(selector, timeout = MAX_WAIT) {
  return new Promise((resolve) => {
    const started = Date.now();
    const tick = () => {
      const el = document.querySelector(selector);
      if (el) return resolve(el);
      if (Date.now() - started > timeout) return resolve(null);
      setTimeout(tick, 90);
    };
    tick();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

export default function Tour({ token, tab, goTab }) {
  const [data, setData] = useState(null);   // پاسخِ سرور (ترتیب + متن + وضعیت)
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);
  const [rect, setRect] = useState(null);
  const [phase, setPhase] = useState('offer'); // offer | playing | waiting | manual
  const [muted, setMuted] = useState(false);   // «بعداً» بدونِ صدا؟ (تنها برای قطعِ صدا)

  const audioRef = useRef(null);
  const elRef = useRef(null);
  const runRef = useRef(0);          // شناسهٔ اجرای جاری — برای لغوِ کارهای کهنه
  const tabRef = useRef(tab);
  tabRef.current = tab;

  // ── اندازه‌گیریِ هدف ──────────────────────────────────────────────────
  const measure = useCallback(() => {
    const el = elRef.current;
    if (!el) { setRect(null); return; }
    const r = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    // هدفِ بیرونِ قاب (اسکرول‌شده) را به لبه می‌چسبانیم تا هاله گم نشود.
    const top = Math.min(Math.max(r.top, 6), vh - 40);
    const left = Math.min(Math.max(r.left, 6), vw - 40);
    setRect({
      top,
      left,
      width: Math.min(Math.max(r.width, 44), vw - 12),
      height: Math.min(Math.max(r.height, 44), vh - 12),
    });
  }, []);

  // ── پیدا کردنِ لنگرِ یک بخش (با ناوبریِ خودکار) ────────────────────────
  const locate = useCallback(async (step) => {
    const ui = TOUR_UI[step.id] || {};
    const nav = ui.nav || {};
    if (nav.tab && nav.tab !== tabRef.current) {
      goTab?.(nav.tab);
      await sleep(NAV_SETTLE);
    }
    if (nav.sub) {
      window.dispatchEvent(new CustomEvent('gg:tour-sub', { detail: { sub: nav.sub, stepId: step.id } }));
      await sleep(NAV_SETTLE);
    } else if (!nav.tab || nav.tab === tabRef.current) {
      await sleep(140); // صفحه از قبل باز است؛ فقط یک فریم فرصت
    }
    for (const anchor of (ui.anchors || [])) {
      const el = await waitFor(`[data-tour="${anchor}"]`);
      if (el) return el;
    }
    return null;
  }, [goTab]);

  // ── اجرای یک بخش ─────────────────────────────────────────────────────
  const present = useCallback(async (i, { replay = true } = {}) => {
    const run = ++runRef.current;
    const step = data?.steps?.[i];
    if (!step) return;
    setIdx(i);
    setPhase('waiting');
    const el = await locate(step);
    if (run !== runRef.current) return;
    elRef.current = el;
    if (el) {
      try {
        el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
      } catch { /* مرورگرهای قدیمی: بی‌حرکت هم قابل قبول است */ }
      await sleep(420);
      if (run !== runRef.current) return;
      measure();
    } else {
      setRect(null);
    }
    // قفلِ اسکرول بعد از نشاندنِ هدفِ وسط — وگرنه اندازه‌گیری می‌لرزد.
    document.body.style.overflow = 'hidden';
    if (!replay) return;
    playCurrent(step);
  }, [data, locate, measure]);

  /** پخشِ صدای بخشِ جاری. اگر مرورگر نگذارد، کارتِ «شروع» می‌ماند. */
  const playCurrent = useCallback((step) => {
    const stepObj = step || data?.steps?.[idx];
    if (!stepObj) return;
    const audio = audioRef.current;
    if (!audio || stepObj.audioReady === false) { setPhase('manual'); return; }
    audio.src = API + (stepObj.audioUrl || '');
    audio.currentTime = 0;
    const p = audio.play();
    if (p && typeof p.then === 'function') {
      p.then(() => setPhase('playing'))
        .catch(() => setPhase('offer')); // پخشِ خودکار رد شد → کارتِ شروع
    } else {
      setPhase('playing');
    }
  }, [data, idx]);

  // ── پایانِ تور ───────────────────────────────────────────────────────
  const finish = useCallback(async (skipped) => {
    runRef.current += 1;
    document.body.style.overflow = '';
    audioRef.current?.pause();
    setOpen(false);
    setRect(null);
    elRef.current = null;
    try {
      await req('/api/onboarding/seen', 'POST',
        { version: data?.version || 1, skipped: skipped === true }, token);
      setData(d => (d ? { ...d, seen: true, skipped: skipped === true } : d));
    } catch { /* ثبتِ پرچم نباید تجربه را بشکند */ }
  }, [data, token]);

  const next = useCallback(() => {
    const total = data?.steps?.length || 0;
    if (idx + 1 >= total) return finish(false);
    audioRef.current?.pause();
    return present(idx + 1);
  }, [data, idx, finish, present]);

  // ── راه‌اندازی: کشیدنِ وضعیت از سرور ────────────────────────────────
  useEffect(() => {
    if (!token) return undefined;
    let alive = true;
    (async () => {
      const d = await req('/api/onboarding', 'GET', null, token).catch(() => null);
      if (!alive || !d?.steps?.length) return;
      setData(d);
      if (!d.enabled) return;
      const forced = new URLSearchParams(window.location.search).get('tour') === '1';
      if (d.seen && !forced) return;
      setOpen(true);
      setIdx(0);
      // اول صدا؛ اگر مرورگر اجازه نداد خودش کارتِ شروع را نشان می‌دهد.
      setPhase('waiting');
      const run = ++runRef.current;
      const step = d.steps[0];
      const ui = TOUR_UI[step.id] || {};
      const nav = ui.nav || {};
      if (nav.tab && nav.tab !== tabRef.current) goTab?.(nav.tab);
      if (nav.sub) {
        window.dispatchEvent(new CustomEvent('gg:tour-sub', { detail: { sub: nav.sub, stepId: step.id } }));
      }
      await sleep(nav.tab || nav.sub ? NAV_SETTLE : 200);
      if (!alive || run !== runRef.current) return;
      let el = null;
      for (const anchor of (ui.anchors || [])) {
        el = await waitFor(`[data-tour="${anchor}"]`);
        if (el) break;
      }
      if (!alive || run !== runRef.current) return;
      elRef.current = el;
      if (el) {
        try { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch { /* بی‌حرکت */ }
        await sleep(380);
        if (!alive || run !== runRef.current) return;
        measure();
      }
      document.body.style.overflow = 'hidden';
      playCurrent(step);
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // ── «دوباره ببین» از پروفایل ────────────────────────────────────────
  useEffect(() => {
    const onReplay = () => {
      if (!data?.steps?.length) return;
      setOpen(true);
      present(0);
    };
    window.addEventListener('gg:tour-replay', onReplay);
    return () => window.removeEventListener('gg:tour-replay', onReplay);
  }, [data, present]);

  // ── هم‌گام‌سازیِ هاله با چیدمان + آزادکردنِ اسکرول در پایان ───────────
  useEffect(() => {
    if (!open) return undefined;
    const id = setInterval(measure, 320);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    const onKey = (e) => {
      if (e.key === 'Escape') finish(true);
      else if (e.key === 'ArrowLeft') next();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      clearInterval(id);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, measure, finish, next]);

  // ── بستنِ تمیز ───────────────────────────────────────────────────────
  useEffect(() => () => {
    document.body.style.overflow = '';
  }, []);

  const step = data?.steps?.[idx];
  if (!open || !step) return null;
  const total = data.steps.length || 0;

  return (
    <div className="tourRoot" role="dialog" aria-modal="true" aria-label="آموزش صوتی قلقلی">
      {rect ? (
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
          <div className="tourRing" style={{ left: rect.left - PAD, top: rect.top - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 }} aria-hidden="true" />
          {/* انگشت: هر بخش یک `key` تازه می‌گیرد تا انیمیشن از اول اجرا شود. */}
          <div className="tourFinger" key={`f-${idx}`} style={{ left: rect.left + rect.width / 2, top: rect.top + rect.height / 2 }} aria-hidden="true">
            <span className="tourRipple" />
            <svg viewBox="0 0 40 56" width="38" height="53" className="tourHand">
              <path d="M14 22V8.5a4.2 4.2 0 0 1 8.4 0V21h1.9v-3.4a3.6 3.6 0 0 1 7.2 0V22h1.6v-2.1a3.4 3.4 0 0 1 6.8 0v12.6c0 8.4-4.6 14.5-12.6 14.5h-6.1c-4.2 0-6.9-1.8-9.3-5.4l-6.3-9.4c-1.6-2.4-.8-5.2 1.6-6.3 1.9-.9 3.9-.2 5.2 1.3l2.6 3.1h1.6z"
                fill="rgba(255,255,255,0.96)" stroke="rgba(2,6,23,0.55)" strokeWidth="1.4" strokeLinejoin="round" />
            </svg>
          </div>
        </>
      ) : (
        <div className="tourShade tourShadeFull" />
      )}

      <div className="tourCard">
        <div className="tourCardTop">
          <span className="tourBadge">آموزش صوتی قلقلی</span>
          <span className="tourCount">{idx + 1} از {total}</span>
          <button type="button" className="tourSkip" onClick={() => finish(true)}>رد کردن</button>
        </div>
        <div className="tourBar" aria-hidden="true"><i style={{ width: `${((idx + 1) / total) * 100}%` }} /></div>

        <h3 className="tourTitle">{step.title}</h3>
        <p className="tourText">{step.text}</p>

        {phase === 'offer' && (
          <p className="tourHint">برای شروعِ پخشِ صدا یک‌بار بزن؛ بعدش خودش جلو می‌رود.</p>
        )}
        {phase === 'manual' && (
          <p className="tourHint">صدای این بخش در دسترس نیست؛ متن را بخوان و «بعدی» را بزن.</p>
        )}

        <div className="tourActions">
          {phase === 'offer' ? (
            <button type="button" className="tourPrimary" onClick={() => playCurrent(step)}>شروع آموزش</button>
          ) : (
            <button type="button" className="tourPrimary" onClick={next}>
              {idx + 1 >= total ? 'پایان' : 'بعدی'}
            </button>
          )}
          <button type="button" className="tourSecondary"
            onClick={() => { setMuted(m => !m); if (audioRef.current) audioRef.current.muted = !muted; }}>
            {muted ? 'صدا خاموش' : 'صدا روشن'}
          </button>
          {phase !== 'offer' && (
            <button type="button" className="tourSecondary" onClick={() => { audioRef.current?.pause(); playCurrent(step); }}>
              پخش دوباره
            </button>
          )}
        </div>
      </div>

      {/* عنصرِ صدا: یکی برای همهٔ بخش‌ها؛ با هر بخش `src` عوض می‌شود. */}
      <audio
        ref={audioRef}
        preload="auto"
        onEnded={() => { if (phase === 'playing') setTimeout(() => { next(); }, ADVANCE_MS); }}
        onError={() => { if (phase === 'playing') setPhase('manual'); }}
      />
    </div>
  );
}
