import React, { useCallback, useEffect, useRef, useState } from 'react';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  راهنمای اسکرول — یک پیاده‌سازیِ واحد (وب / پنل ادمین / آینهٔ اندروید)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ── خواستهٔ مالک (۲۹ شهریور) ──────────────────────────────────────────────
 *
 * «هر تبی که کاربرا نیاز دارن به اسکرول کنن، بهشون راهنمایی نشون داده بشه
 *  ولی هیچ‌کدوم به خوبی و درستی کار نکردن؛ یا اسکرول‌Help دسکتاپ صفحه رو به
 *  هم ریخته. اینو بصورت یکپارچه یه بار برای همیشه درستش کن.»
 *
 * ── چه چیزی در نسخه‌های قبلی خراب بود ────────────────────────────────────
 *
 *  ۱. **نسخهٔ وب کاملاً خاموش بود.** یک کامپوننتِ passthrough شده بود
 *     («در وب غیرفعال شده است تا چیدمان ... به‌هم نریزد») — یعنی کاربرِ وب
 *     هیچ راهنمایی نداشت.
 *  ۲. **نسخهٔ پنل ادمین به نمای صفحه چسبیده بود، نه به ستونِ اپ.**
 *     (`position:fixed; right:22px`) — روی مانیتور، قرص و ریلْ بیرونِ ستونِ
 *     ۵۴۰ پیکسلی و کنارِ لبهٔ نمایشگر می‌نشستند؛ همان «دسکتاپ به‌هم می‌ریزد».
 *  ۳. **منطقِ نمایش شکننده بود:** با هر `scroll` — از جمله اسکرولِ برنامه‌ای
 *     (پرش به بالا، بازسازیِ صفحه) — «کاربر اسکرول کرد» ثبت می‌شد و راهنما
 *     برای همیشه می‌رفت؛ یا برعکس، در صفحه‌های بی‌اسکرول هم می‌ماند.
 *
 * ── قراردادِ واحد (این فایل مرجع است؛ اندروید آینهٔ آن است) ───────────────
 *
 *   • **لنگر = ستونِ اپ، نه نما.** همهٔ عناصر داخل یک لایهٔ `fixed` با
 *     `max-width` ستون و `margin-inline:auto` می‌نشینند. روی دسکتاپ هیچ
 *     چیزی بیرونِ ستون نمی‌رود و چون `fixed` است، هیچ‌وقت چیدمان را جابه‌جا
 *     نمی‌کند (خودِ ریشهٔ «دسکتاپ به‌هم ریخت»).
 *   • **لایه `pointer-events:none` است** و فقط خودِ قرص کلیک‌پذیر است؛ پس
 *     هیچ دکمه‌ای زیرش گم نمی‌شود.
 *   • سه نشانه، همه فقط وقتی محتوا واقعاً سرریز دارد:
 *     ۱. **محوشدگیِ پایین** (کاربر می‌فهمد ادامه هست)،
 *     ۲. **ریلِ باریک** با دستگیرهٔ برَند روی لبهٔ ستون (کجای مسیر هست)،
 *     ۳. **قرصِ راهنما** با جملهٔ همان تب + شِورانِ متحرک، **کلیک‌پذیر**:
 *        با یک لمس/کلیک نرم به اندازهٔ یک صفحه پایین می‌رود.
 *   • **چه وقت دیده می‌شود:** فقط وقتی اسکرول لازم است، کاربر پایین نیست،
 *     و خودش هنوز دست به اسکرول نزده. بعد از اولین اسکرولِ **واقعیِ** کاربر
 *     محو می‌شود (انیمیشن ۲۴۰ms) و دیگر برنمی‌گردد تا تب عوض شود.
 *   • **هر تب راهنمای خودش را دارد** (`hintLabel` + `resetKey`): بعد از
 *     عوض شدنِ تب، «نو شدگی» صفر می‌شود؛ همان چیزی که در اندروید با
 *     `_scrollHints` بود و در وب نبود.
 *
 * @param {object} props
 * @param {string} props.hintLabel  جملهٔ قرص («جوایز بیشتری پایین‌تر هست»).
 * @param {any}    props.resetKey   عوض شدنش = تبِ تازه؛ راهنما دوباره فعال می‌شود.
 * @param {boolean} props.enabled   خاموش‌کردنِ کامل (شیت باز، بازی، مودال…).
 * @param {number} props.padBottom  فاصله از پایینِ ستون (ارتفاعِ نوارِ ناوبری).
 * @param {number} props.topOffset  فاصله از بالا (ارتفاعِ نوارِ عنوانِ چسبان).
 * @param {number} props.maxWidth   عرضِ ستونِ اپ (۵۴۰ در وب، ۱۰۰٪ در پنل ادمین).
 */
export function ScrollHint({
  hintLabel = 'پایین‌تر هم هست',
  resetKey = '',
  enabled = true,
  padBottom = 86,
  topOffset = 74,
  maxWidth = 540,
}) {
  const touchedRef = useRef(false);
  const [state, setState] = useState({
    scrollable: false, fraction: 0, viewport: 1, atBottom: true, touched: false,
  });

  /**
   * سنجشِ وضعیتِ اسکرول.
   *
   * اسکرولِ پرتال روی خودِ سند است (`.portal` اسکرولِ درونی ندارد)، ولی اگر
   * روزی صفحه‌ای اسکرولِ درونی گرفت، همان را هم می‌فهمیم: اولین والدِ
   * اسکرول‌شوندهٔ لایه را پیدا می‌کنیم و اگر نبود، `window`.
   */
  const measure = useCallback(() => {
    let top = 0, view = 1, total = 1;

    const doc = document.scrollingElement || document.documentElement;
    const winTotal = Math.max(doc?.scrollHeight || 0, document.body?.scrollHeight || 0);
    const winView = window.innerHeight || 1;
    if (winTotal > winView + 12) {
      top = window.scrollY || doc.scrollTop || 0;
      view = winView;
      total = winTotal;
    }

    const max = Math.max(0, total - view);
    const scrollable = max > 24;           // آستانه: سرریزِ واقعی، نه ۱ پیکسل
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
  }, []);

  // ── گوش‌دادن به اسکرول/تغییر اندازه/رشدِ محتوا ─────────────────────────
  useEffect(() => {
    /**
     * ⚠️ فقط اسکرولِ **کاربر** «دیده شد» را ثبت می‌کند.
     *
     * تفکیک: یک `wheel`/`touchmove`/`keydown(Arrow|PageUp|…)` کاربر است؛
     * ولی `scroll` می‌تواند برنامه‌ای هم باشد (پرشِ تب، بازچینشِ محتوا،
     * فوکوسِ خودکار). نسخهٔ قبلی هر `scroll` را کاربر می‌شمرد و راهنما را
     * در همان لحظهٔ اول بی‌صدا می‌بست.
     */
    let userIntent = false;
    const markIntent = () => { userIntent = true; };
    const onScroll = () => {
      if (userIntent && !touchedRef.current && (window.scrollY || 0) > 24) {
        touchedRef.current = true;
      }
      measure();
    };
    const onResize = () => measure();

    window.addEventListener('wheel', markIntent, { passive: true });
    window.addEventListener('touchstart', markIntent, { passive: true });
    window.addEventListener('pointerdown', markIntent, { passive: true });
    window.addEventListener('keydown', markIntent);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize, { passive: true });

    measure();
    // محتوا بعد از شبکه/lazy-load رشد می‌کند؛ سه نوبتِ سنجش مثل بقیهٔ
    // گاردهای همین پروژه، هزینه‌اش صفر است و «دیر آمدنِ راهنما» را می‌گیرد.
    const timers = [90, 420, 1300, 2600].map((ms) => setTimeout(measure, ms));
    let mo;
    try {
      mo = new MutationObserver(() => measure());
      mo.observe(document.body, { childList: true, subtree: true });
    } catch { /* مرورگرهای قدیمی: بی‌خیالِ observer، تایمرها کار می‌کنند */ }

    return () => {
      timers.forEach(clearTimeout);
      window.removeEventListener('wheel', markIntent);
      window.removeEventListener('touchstart', markIntent);
      window.removeEventListener('pointerdown', markIntent);
      window.removeEventListener('keydown', markIntent);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      if (mo) mo.disconnect();
    };
  }, [measure]);

  // ── تبِ تازه = راهنمای تازه ────────────────────────────────────────────
  useEffect(() => {
    touchedRef.current = false;
    setState((prev) => (prev.touched ? { ...prev, touched: false } : prev));
    // محتوای تبِ تازه در فریم‌های بعد می‌نشیند؛ یک سنجشِ فوری + یکی بعدِ
    // رندر کافی است (MutationObserver بقیه را می‌گیرد).
    measure();
    const t = setTimeout(measure, 260);
    return () => clearTimeout(t);
  }, [resetKey, measure]);

  const handleTap = useCallback(() => {
    const step = Math.round(window.innerHeight * 0.62);
    // «دیده شد» را ثبت می‌کنیم: کاربر خودش نشانه را لمس کرده، پس دیگر
    // لازم نیست قرص باقی بماند.
    touchedRef.current = true;
    window.scrollBy({ top: step, behavior: 'smooth' });
    setTimeout(measure, 420);
  }, [measure]);

  if (!enabled) return null;

  const showFade = state.scrollable && !state.atBottom;
  const showPill = state.scrollable && !state.atBottom && !state.touched;
  const thumbPct = Math.max(12, Math.min(100, state.viewport * 100));

  return (
    <div
      className="scrollHintLayer"
      style={{ '--scrollHint-pad': `${padBottom}px`, '--scrollHint-top': `${topOffset}px`, maxWidth }}
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
