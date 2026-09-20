import React, { useCallback, useEffect, useRef, useState } from 'react';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  راهنمای اسکرول — پنل ادمین (پورتِ همان قراردادِ واحدِ وب/اندروید)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ── خواستهٔ مالک (۲۹ شهریور) ──────────────────────────────────────────────
 *
 * «هر تبی که کاربرا نیاز دارن به اسکرول کنن، راهنمایی نشون داده بشه…
 *  اسکرول‌Help دسکتاپ صفحه رو به هم ریخته.» پنل ادمین هم جزو همان «همه‌جا»
 * است: صفحه‌های بلندِ پنل (کاربران، ریزِ امتیازات، صندوق کارت) بی‌نشانه
 * می‌مانند و مدیر فکر می‌کند فهرست تمام شده.
 *
 * ── چه چیزی خراب بود (نسخهٔ قبلیِ همین فایل) ─────────────────────────────
 *
 *  ۱. **چسبیده به نمای صفحه بود، نه به ستونِ پنل:** `.scrollHintRail` با
 *     `position:fixed; right:6px` و قرص با `fixed; right:22px` رندر می‌شدند؛
 *     روی مانیتورِ پهن، ریلْ کنارِ لبهٔ نمایشگر (بیرونِ قابِ محتوا) می‌نشست —
 *     همان «چیدمان به‌هم ریخته». ریلِ `fixed` با `top:88px` هم زیرِ نوارِ
 *     بالای پنل می‌افتاد، در حالی که محتوای واقعی از زیرِ آن شروع می‌شود.
 *  ۲. **اسکرولِ برنامه‌ای را «کاربر اسکرول کرد» می‌شمرد:** با هر `scroll`
 *     (کلیک روی آیتمِ منو، بازچینشِ جدول) راهنما برای همیشه می‌رفت.
 *  ۳. **هیچ تشخیصِ سرریزِ واقعی نداشت** روی ظرفِ اسکرولِ پنل (`.content-area`)
 *     و به `window` تکیه می‌کرد که در پنل اسکرول نمی‌شود.
 *
 * ── قراردادِ واحد (آینهٔ `userweb/src/components/ScrollHint.jsx`) ─────────
 *
 *   • **لنگر = قابِ محتوا، نه نما.** لایه `absolute` داخل `.main-area` است؛
 *     پس روی هر عرضی داخل قاب می‌ماند و چون از جریانِ چیدمان بیرون است
 *     (`absolute`) هیچ‌وقت چیزی را جابه‌جا نمی‌کند.
 *   • **`pointer-events:none` روی لایه، `auto` فقط روی قرص.**
 *   • سه نشانه، همه **فقط** با سرریزِ واقعی: محوشدگی، ریل با دستگیره، و
 *     قرصِ کلیک‌پذیر (کلیک = یک صفحه پایین).
 *   • **مخاطبِ اسکرول = ظرفِ درونیِ پنل** (`.content-area`) که از `targetRef`
 *     می‌آید؛ اگر نبود، `window`.
 *   • فقط اسکرولِ **کاربر** (`wheel` / `touchmove` / `keydown`) «دیده شد»
 *     ثبت می‌کند.
 *
 * @param {object} props
 * @param {string} props.hintLabel جملهٔ قرص («ادامهٔ فهرست پایین‌تر است»).
 * @param {any}    props.resetKey  عوض شدنش = صفحهٔ تازه؛ راهنما دوباره فعال.
 * @param {boolean} props.enabled  خاموش‌کردن کامل (مودالِ باز، تبِ بازی…).
 * @param {number} props.padBottom فاصله از پایینِ قاب.
 * @param {number} props.topOffset فاصله از بالا (ارتفاعِ نوارِ بالای پنل).
 * @param {React.RefObject<HTMLElement>} props.targetRef ظرفِ اسکرولِ پنل.
 */
export function ScrollHint({
  hintLabel = 'پایین‌تر هم هست',
  resetKey = '',
  enabled = true,
  padBottom = 14,
  topOffset = 72,
  maxWidth = '100%',
  targetRef = null,
}) {
  const touchedRef = useRef(false);
  const layerRef = useRef(null);
  const boxRef = useRef({ top: -1, bottom: -1 });
  const [box, setBox] = useState({ top: topOffset, bottom: padBottom });
  const [state, setState] = useState({
    scrollable: false, fraction: 0, viewport: 1, atBottom: true, touched: false,
  });

  /** ظرفِ اسکرول: اول `targetRef`، بعد نزدیک‌ترین والدِ اسکرول‌شونده، بعد `window`. */
  const resolveTarget = useCallback(() => {
    const el = targetRef?.current;
    if (el && el.scrollHeight > el.clientHeight + 24) return el;
    return el || null;
  }, [targetRef]);

  const measure = useCallback(() => {
    const el = resolveTarget();
    /**
     * جای دقیقِ ظرفِ اسکرول داخلِ لایه.
     *
     * چرا نمی‌شود یک عدد ثابت گذاشت: ارتفاعِ نوارِ بالای پنل با زیرعنوانِ
     * صفحه عوض می‌شود و روی موبایل هم نوار جابه‌جا می‌شود. با اندازه‌گیریِ
     * واقعی، ریل و قرص همیشه به لبهٔ **قابِ محتوا** می‌چسبند، نه به لبهٔ
     * نمایشگر — همان چیزی که قبلاً به‌هم‌ریخته به نظر می‌رسید.
     */
    const layer = layerRef.current;
    if (el && layer) {
      const pr = layer.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      const topInset = Math.round(r.top - pr.top);
      const bottomInset = Math.round(pr.bottom - r.bottom);
      if (Math.abs(boxRef.current.top - topInset) > 2 || Math.abs(boxRef.current.bottom - bottomInset) > 2) {
        boxRef.current = { top: topInset, bottom: bottomInset };
        setBox({ top: topInset, bottom: bottomInset });
      }
    }
    let top, view, total;
    if (el) {
      top = el.scrollTop || 0;
      view = el.clientHeight || 1;
      total = el.scrollHeight || 1;
    } else {
      const doc = document.scrollingElement || document.documentElement;
      total = Math.max(doc?.scrollHeight || 0, document.body?.scrollHeight || 0);
      view = window.innerHeight || 1;
      top = window.scrollY || doc?.scrollTop || 0;
    }
    const max = Math.max(0, total - view);
    const scrollable = max > 24;
    const fraction = max <= 0 ? 0 : Math.min(1, Math.max(0, top / max));
    const viewport = view / Math.max(1, total);
    const atBottom = max - top <= 28;

    setState((prev) => {
      const touched = touchedRef.current;
      if (
        prev.scrollable === scrollable
        && Math.abs(prev.fraction - fraction) < 0.004
        && Math.abs(prev.viewport - viewport) < 0.004
        && prev.atBottom === atBottom
        && prev.touched === touched
      ) return prev;
      return { scrollable, fraction, viewport, atBottom, touched };
    });
    return atBottom;
  }, [resolveTarget]);

  // ── گوش‌دادن به اسکرول/تغییر اندازه/رشدِ محتوا ──────────────────────────
  useEffect(() => {
    let userIntent = false;
    const markIntent = () => { userIntent = true; };
    const scrollTopNow = () => {
      const el = resolveTarget();
      return el ? (el.scrollTop || 0) : (window.scrollY || 0);
    };
    const onScroll = () => {
      if (userIntent && !touchedRef.current && scrollTopNow() > 24) touchedRef.current = true;
      measure();
    };
    const onResize = () => measure();

    window.addEventListener('wheel', markIntent, { passive: true });
    window.addEventListener('touchstart', markIntent, { passive: true });
    window.addEventListener('pointerdown', markIntent, { passive: true });
    window.addEventListener('keydown', markIntent);
    // `capture` لازم است: اسکرولِ ظرفِ درونی به window بالا نمی‌آید.
    window.addEventListener('scroll', onScroll, { passive: true, capture: true });
    window.addEventListener('resize', onResize, { passive: true });

    measure();
    const timers = [90, 420, 1300, 2600].map((ms) => setTimeout(measure, ms));
    let mo;
    try {
      mo = new MutationObserver(() => measure());
      mo.observe(document.body, { childList: true, subtree: true });
    } catch { /* مرورگرِ قدیمی: تایمرها کار می‌کنند */ }

    return () => {
      timers.forEach(clearTimeout);
      window.removeEventListener('wheel', markIntent);
      window.removeEventListener('touchstart', markIntent);
      window.removeEventListener('pointerdown', markIntent);
      window.removeEventListener('keydown', markIntent);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
      if (mo) mo.disconnect();
    };
  }, [measure, resolveTarget]);

  // ── صفحهٔ تازه = راهنمای تازه ───────────────────────────────────────────
  useEffect(() => {
    touchedRef.current = false;
    setState((prev) => (prev.touched ? { ...prev, touched: false } : prev));
    measure();
    const t = setTimeout(measure, 260);
    return () => clearTimeout(t);
  }, [resetKey, measure]);

  const handleTap = useCallback(() => {
    const el = resolveTarget();
    const step = Math.round((el ? el.clientHeight : window.innerHeight) * 0.62);
    touchedRef.current = true;
    if (el) el.scrollBy({ top: step, behavior: 'smooth' });
    else window.scrollBy({ top: step, behavior: 'smooth' });
    setTimeout(measure, 420);
  }, [measure, resolveTarget]);

  if (!enabled) return null;

  const showFade = state.scrollable && !state.atBottom;
  const showPill = showFade && !state.touched;
  const thumbPct = Math.max(12, Math.min(100, state.viewport * 100));

  return (
    <div
      ref={layerRef}
      className="scrollHintLayer"
      style={{
        '--scrollHint-pad': `${Math.max(0, box.bottom) + padBottom}px`,
        '--scrollHint-top': `${Math.max(0, box.top) + 10}px`,
        maxWidth,
      }}
    >
      {showFade && <div className="scrollHintFade" aria-hidden="true" />}
      {showFade && (
        <div className="scrollHintRail" aria-hidden="true">
          <i
            className="scrollHintThumb"
            style={{ height: `${thumbPct}%`, top: `${state.fraction * (100 - thumbPct)}%` }}
          />
        </div>
      )}
      {showPill && (
        <button
          type="button"
          className="scrollHintPill"
          onClick={handleTap}
          aria-label={`${hintLabel} — پایین‌تر برو`}
          title="مشاهدهٔ ادامهٔ محتوا"
        >
          <span className="scrollHintDot" aria-hidden="true" />
          <span className="scrollHintText">{hintLabel}</span>
          <span className="scrollHintChevron" aria-hidden="true">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </span>
        </button>
      )}
    </div>
  );
}

export default ScrollHint;
