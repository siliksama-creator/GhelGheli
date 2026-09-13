import React, { useCallback, useEffect, useRef, useState } from 'react';

/**
 * راهنمای اسکرول — آینهٔ mobile/lib/widgets/scroll_hint.dart
 * FIX FUNDAMENTAL v2: حذف MutationObserver سنگین روی کل document.body که هر تغییر
 * در لیگ/چت باعث اندازه‌گیری و رندروم می‌شد و "فنر" ایجاد می‌کرد.
 * حالا فقط ResizeObserver روی خودِ محتوا + window resize/scroll
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
  const rafRef = useRef(0);

  const resolveEl = useCallback(() => {
    if (target === 'window') return null;
    if (target && target.current) return target.current;
    if (target instanceof HTMLElement) return target;
    return wrapRef.current;
  }, [target]);

  const measure = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
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
          Math.abs(prev.fraction - fraction) < 0.006 &&
          Math.abs(prev.viewport - viewport) < 0.006 &&
          prev.atBottom === atBottom &&
          prev.touched === touched
        ) {
          return prev;
        }
        return { scrollable, fraction, viewport, atBottom, touched };
      });
    });
  }, [resolveEl, target]);

  useEffect(() => {
    const el = resolveEl();
    const onScroll = () => {
      if (!touchedRef.current) {
        const st = target === 'window' || !el
          ? (window.scrollY || document.documentElement.scrollTop || 0)
          : el.scrollTop;
        if (st > 8) touchedRef.current = true;
      }
      measure();
    };
    const onResize = () => measure();

    measure();
    // فقط دو بار بعد از لود اولیه اندازه بگیر، نه سه بار + MutationObserver سنگین
    const t1 = setTimeout(measure, 300);
    const t2 = setTimeout(measure, 1200);

    if (target === 'window' || !el) {
      window.addEventListener('scroll', onScroll, { passive: true });
      window.addEventListener('resize', onResize, { passive: true });
    } else {
      el.addEventListener('scroll', onScroll, { passive: true });
      window.addEventListener('resize', onResize, { passive: true });
    }
    // ResizeObserver سبک فقط روی خودِ محتوا، نه کل body
    let ro;
    try {
      const targetEl = el || wrapRef.current;
      if (targetEl && typeof ResizeObserver !== 'undefined') {
        ro = new ResizeObserver(() => measure());
        ro.observe(targetEl);
        // اگر window target است، body را هم observe کن ولی فقط size نه childList
        if (target === 'window' && document.body) {
          ro.observe(document.body);
        }
      }
    } catch (_) { /* ignore */ }

    return () => {
      clearTimeout(t1); clearTimeout(t2);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      if (el) el.removeEventListener('scroll', onScroll);
      if (ro) ro.disconnect();
    };
  }, [measure, resolveEl, target]);

  // reset touch when tab/content identity changes via key on parent
  useEffect(() => {
    touchedRef.current = false;
    setState((s) => ({ ...s, touched: false }));
    const t = setTimeout(measure, 80);
    return () => clearTimeout(t);
  }, [label, measure]);

  const pillVisible =
    showPill && state.scrollable && !state.atBottom && !state.touched;

  return (
    <div
      ref={wrapRef}
      className={`scrollHintRoot ${className}`.trim()}
      data-scrollable={state.scrollable ? '1' : '0'}
      style={{ contain: 'layout' }}
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
