import React, { useCallback, useEffect, useRef, useState } from 'react';

/**
 * راهنمای اسکرول تعاملی — آینهٔ mobile/lib/widgets/scroll_hint.dart
 * کلیک‌پذیر با اسکرول نرم، انیمیشن چورون، ظاهر گلس‌مورفیسم تیره.
 *
 * ⚠️ دسکتاپ: در نمایشگرهای دسکتاپ (عرض >= 900px)، کاربر دارای ماوس، اسکرول‌بار
 * مرورگر و تاچ‌پد است. المان‌های راهنمای اسکرول موبایلی (قرص، ریل، فید) هرگز در دسکتاپ
 * نباید رندر شوند تا چیدمان دسکتاپ کاملاً تمیز و بدون هیچ لایهٔ مزاحمی باشد.
 */
export function ScrollHint({
  children,
  label = 'پایین‌تر هم هست',
  target = 'window',
  className = '',
  padBottom = 0,
  showPill = true,
}) {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth < 900;
  });

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 900);
    };
    window.addEventListener('resize', handleResize, { passive: true });
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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
    if (!isMobile) return;
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
  }, [isMobile, resolveEl, target]);

  const handleScrollDown = useCallback((e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const el = resolveEl();
    if (!el || target === 'window') {
      window.scrollBy({ top: 380, behavior: 'smooth' });
    } else {
      el.scrollBy({ top: 380, behavior: 'smooth' });
    }
  }, [resolveEl, target]);

  useEffect(() => {
    if (!isMobile) return;
    const el = resolveEl();
    const onScroll = () => {
      const st = target === 'window' || !el
        ? (window.scrollY || document.documentElement.scrollTop || 0)
        : el.scrollTop;
      if (st > 30) {
        touchedRef.current = true;
      }
      measure();
    };
    const onResize = () => measure();

    measure();
    const t1 = setTimeout(measure, 300);
    const t2 = setTimeout(measure, 1200);

    if (target === 'window' || !el) {
      window.addEventListener('scroll', onScroll, { passive: true });
      window.addEventListener('resize', onResize, { passive: true });
    } else {
      el.addEventListener('scroll', onScroll, { passive: true });
      window.addEventListener('resize', onResize, { passive: true });
    }

    let ro;
    try {
      const targetEl = el || wrapRef.current;
      if (targetEl && typeof ResizeObserver !== 'undefined') {
        ro = new ResizeObserver(() => measure());
        ro.observe(targetEl);
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
  }, [isMobile, measure, resolveEl, target]);

  useEffect(() => {
    if (!isMobile) return;
    touchedRef.current = false;
    setState((s) => ({ ...s, touched: false }));
    const t = setTimeout(measure, 80);
    return () => clearTimeout(t);
  }, [isMobile, label, measure]);

  // در دسکتاپ، کودکان بدون هیچ wrapper یا المان اضافه‌ای مستقیماً رندر می‌شوند
  if (!isMobile) {
    return <>{children}</>;
  }

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
          onClick={handleScrollDown}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleScrollDown(e); }}
          aria-label="اسکرول به ادامه مطالب"
          title="مشاهده ادامه محتوا"
        >
          <span className="scrollHintDot" aria-hidden="true" />
          <span className="scrollHintText">{label.length > 20 ? 'ادامه پایین‌تر' : label}</span>
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

export default ScrollHint;
