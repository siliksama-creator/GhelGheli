import React, { useCallback, useEffect, useRef, useState } from 'react';

/**
 * راهنمای اسکرول — آینهٔ mobile/lib/widgets/scroll_hint.dart
 *
 * سه نشانه وقتی محتوا از viewport بلندتر است:
 *  ۱) ریل کناری همیشه دیده
 *  ۲) محوشدگی لبهٔ پایین
 *  ۳) قرصِ «پایین‌تر» با bob تا اولین اسکرول کاربر
 *
 * target: 'window' | HTMLElement | ref
 */
export function ScrollHint({
  children,
  label = 'پایین‌تر هم هست',
  target = 'window',
  className = '',
  padBottom = 0,
  showPill = true,
}) {
  const wrapRef = useRef(null);
  const [state, setState] = useState({
    scrollable: false,
    fraction: 0,
    viewport: 1,
    atBottom: true,
    touched: false,
  });
  const touchedRef = useRef(false);

  const resolveEl = useCallback(() => {
    if (target === 'window') return null; // window metrics
    if (target && target.current) return target.current;
    if (target instanceof HTMLElement) return target;
    return wrapRef.current;
  }, [target]);

  const measure = useCallback(() => {
    const el = resolveEl();
    let scrollTop, clientH, scrollH;
    if (!el || target === 'window') {
      const doc = document.documentElement;
      scrollTop = window.scrollY || doc.scrollTop || 0;
      clientH = window.innerHeight || doc.clientHeight || 1;
      scrollH = Math.max(doc.scrollHeight, document.body?.scrollHeight || 0);
    } else {
      scrollTop = el.scrollTop;
      clientH = el.clientHeight || 1;
      scrollH = el.scrollHeight || 0;
    }
    const max = Math.max(0, scrollH - clientH);
    const scrollable = max > 12;
    const fraction = max <= 0 ? 0 : Math.min(1, Math.max(0, scrollTop / max));
    const viewport = clientH / Math.max(1, scrollH);
    const atBottom = max - scrollTop <= 28;
    setState((prev) => {
      const touched = touchedRef.current;
      if (
        prev.scrollable === scrollable &&
        Math.abs(prev.fraction - fraction) < 0.004 &&
        Math.abs(prev.viewport - viewport) < 0.004 &&
        prev.atBottom === atBottom &&
        prev.touched === touched
      ) {
        return prev;
      }
      return { scrollable, fraction, viewport, atBottom, touched };
    });
  }, [resolveEl, target]);

  useEffect(() => {
    const el = resolveEl();
    const onScroll = () => {
      if (!touchedRef.current) {
        // فقط وقتی واقعاً حرکت کرده
        const st = target === 'window' || !el
          ? (window.scrollY || document.documentElement.scrollTop || 0)
          : el.scrollTop;
        if (st > 8) touchedRef.current = true;
      }
      measure();
    };
    const onResize = () => measure();

    measure();
    // بعد از paintهای تنبل (تصاویر/فونت) دوباره اندازه بگیر
    const t1 = setTimeout(measure, 120);
    const t2 = setTimeout(measure, 600);
    const t3 = setTimeout(measure, 1800);

    if (target === 'window' || !el) {
      window.addEventListener('scroll', onScroll, { passive: true });
      window.addEventListener('resize', onResize, { passive: true });
    } else {
      el.addEventListener('scroll', onScroll, { passive: true });
      window.addEventListener('resize', onResize, { passive: true });
    }
    // MutationObserver سبک برای محتوای دیررس
    let mo;
    try {
      mo = new MutationObserver(() => measure());
      mo.observe(el || document.body, { childList: true, subtree: true, characterData: false });
    } catch (_) { /* ignore */ }

    return () => {
      clearTimeout(t1); clearTimeout(t2); clearTimeout(t3);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      if (el) el.removeEventListener('scroll', onScroll);
      if (mo) mo.disconnect();
    };
  }, [measure, resolveEl, target, children]);

  // reset touch when tab/content identity changes via key on parent
  useEffect(() => {
    touchedRef.current = false;
    setState((s) => ({ ...s, touched: false }));
    const t = setTimeout(measure, 50);
    return () => clearTimeout(t);
  }, [label]); // eslint-disable-line react-hooks/exhaustive-deps

  const pillVisible =
    showPill && state.scrollable && !state.atBottom && !state.touched;

  return (
    <div
      ref={wrapRef}
      className={`scrollHintRoot ${className}`.trim()}
      data-scrollable={state.scrollable ? '1' : '0'}
    >
      {children}
      {state.scrollable && !state.atBottom && (
        <div
          className="scrollHintFade"
          style={{ bottom: padBottom }}
          aria-hidden="true"
        />
      )}
      {state.scrollable && (
        <div
          className="scrollHintRail"
          style={{ bottom: 8 + padBottom }}
          aria-hidden="true"
        >
          <i
            className="scrollHintThumb"
            style={{
              height: `${Math.max(12, Math.min(100, state.viewport * 100))}%`,
              top: `${state.fraction * (100 - Math.max(12, Math.min(100, state.viewport * 100)))}%`,
            }}
          />
        </div>
      )}
      {pillVisible && (
        <div
          className="scrollHintPill"
          style={{ bottom: 14 + padBottom }}
          aria-hidden="true"
        >
          <span>{label.length > 18 ? 'ادامه پایین‌تر' : label}</span>
          <b>↓↓</b>
        </div>
      )}
    </div>
  );
}

export default ScrollHint;
