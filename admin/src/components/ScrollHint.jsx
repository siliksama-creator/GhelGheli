import React, { useCallback, useEffect, useRef, useState } from 'react';

/** راهنمای اسکرول تعاملی برای پنل ادمین — همان قرارداد userweb/Flutter. */
export function ScrollHint({
  children,
  label = 'پایین‌تر هم هست',
  className = '',
  padBottom = 0,
}) {
  const wrapRef = useRef(null);
  const scrollParentRef = useRef(null);
  const touchedRef = useRef(false);
  const [state, setState] = useState({
    scrollable: false, fraction: 0, viewport: 1, atBottom: true, touched: false,
  });

  const findScrollParent = useCallback((node) => {
    let el = node;
    while (el && el !== document.body) {
      const st = getComputedStyle(el);
      const oy = st.overflowY;
      if ((oy === 'auto' || oy === 'scroll' || oy === 'overlay') && el.scrollHeight > el.clientHeight + 8) {
        return el;
      }
      el = el.parentElement;
    }
    return null; // window
  }, []);

  const measure = useCallback(() => {
    const root = wrapRef.current;
    if (!root) return;
    let el = scrollParentRef.current;
    if (!el) {
      el = findScrollParent(root.parentElement) || null;
      scrollParentRef.current = el;
    }
    let scrollTop, clientH, scrollH;
    if (!el) {
      const doc = document.documentElement;
      scrollTop = window.scrollY || doc.scrollTop || 0;
      clientH = window.innerHeight || 1;
      scrollH = Math.max(doc.scrollHeight, document.body?.scrollHeight || 0);
    } else {
      if (el.scrollHeight <= el.clientHeight + 8) {
        const ca = root.closest('.content-area') || root.closest('.main-area');
        if (ca && ca.scrollHeight > ca.clientHeight + 8) {
          el = ca; scrollParentRef.current = ca;
        }
      }
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
      ) return prev;
      return { scrollable, fraction, viewport, atBottom, touched };
    });
  }, [findScrollParent]);

  const handleScrollDown = useCallback((e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const el = scrollParentRef.current;
    if (!el) {
      window.scrollBy({ top: 380, behavior: 'smooth' });
    } else {
      el.scrollBy({ top: 380, behavior: 'smooth' });
    }
  }, []);

  useEffect(() => {
    touchedRef.current = false;
    scrollParentRef.current = null;
    const onScroll = () => {
      const el = scrollParentRef.current;
      const st = !el
        ? (window.scrollY || document.documentElement.scrollTop || 0)
        : el.scrollTop;
      if (st > 8) touchedRef.current = true;
      measure();
    };
    const onResize = () => {
      scrollParentRef.current = null;
      measure();
    };
    measure();
    const timers = [80, 400, 1200].map((ms) => setTimeout(measure, ms));
    window.addEventListener('scroll', onScroll, { passive: true, capture: true });
    window.addEventListener('resize', onResize, { passive: true });
    let mo;
    try {
      mo = new MutationObserver(() => measure());
      mo.observe(document.body, { childList: true, subtree: true });
    } catch (_) {}
    return () => {
      timers.forEach(clearTimeout);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
      if (mo) mo.disconnect();
    };
  }, [measure, label, children]);

  const pill = state.scrollable && !state.atBottom && !state.touched;

  return (
    <div ref={wrapRef} className={`scrollHintRoot ${className}`.trim()}>
      {children}
      {state.scrollable && !state.atBottom && (
        <div className="scrollHintFade" style={{ bottom: padBottom }} aria-hidden />
      )}
      {state.scrollable && (
        <div className="scrollHintRail" style={{ bottom: 8 + padBottom }} aria-hidden>
          <i
            className="scrollHintThumb"
            style={{
              height: `${Math.max(12, Math.min(100, state.viewport * 100))}%`,
              top: `${state.fraction * (100 - Math.max(12, Math.min(100, state.viewport * 100)))}%`,
            }}
          />
        </div>
      )}
      {pill && (
        <div
          className="scrollHintPill"
          style={{ bottom: 16 + padBottom }}
          onClick={handleScrollDown}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleScrollDown(e); }}
          aria-label="اسکرول به ادامه مطالب"
          title="مشاهده ادامه محتوا"
        >
          <span className="scrollHintDot" aria-hidden="true" />
          <span className="scrollHintText">{label}</span>
          <span className="scrollHintChevron" aria-hidden="true">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </span>
        </div>
      )}
    </div>
  );
}
