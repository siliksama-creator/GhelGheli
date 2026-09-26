// بازیابیِ «Failed to fetch dynamically imported module».
//
// admin/src/lib/chunkRecovery.js و userweb/src/lib/chunkRecovery.js باید یکی بمانند
// (گاردِ userweb/tool/chunk-recovery-guard.mjs این را قفل کرده است).
//
// چرا یک رفرشِ معمولی کافی نیست:
//   Vite اسمِ چانک را hash می‌کند و nginx به /assets/ هدرِ
//   `immutable` یک‌ساله می‌دهد — حتی روی ۴۰۴، اگر `add_header ... always`
//   باشد. مرورگر همان ۴۰۴ را تا یک سال تکرار می‌کند و `location.reload()`
//   همان سندِ کش‌شده را برمی‌گرداند. رفرش باید نشانیِ سند را عوض کند
//   (`?__r=`) تا index.html تازه، با اسمِ چانکِ تازه، گرفته شود.
//
// پرچمِ sessionStorage فقط جلوی حلقهٔ بی‌نهایت است. بعد از یک صفحهٔ سالم
// پاک می‌شود تا دیپلویِ بعدی دوباره بتواند خودش را جمع کند. دکمهٔ کاربر
// همیشه force است و به آن پرچم نگاه نمی‌کند.

const KEY = 'gg-chunk-reload';

let sawChunkError = false;

export function isChunkLoadError(err) {
  const msg = String(err?.message || err || '');
  return /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Loading chunk|Loading CSS chunk/i.test(msg);
}

export function recoverFromChunkError({ force = false } = {}) {
  if (typeof window === 'undefined') return false;
  sawChunkError = true;
  let already = false;
  try {
    already = sessionStorage.getItem(KEY) === '1';
    if (!already) sessionStorage.setItem(KEY, '1');
  } catch {
    already = false;
  }
  if (already && !force) return false;
  const url = new URL(window.location.href);
  url.searchParams.set('__r', String(Date.now()));
  window.location.replace(url.toString());
  return true;
}

export function installChunkRecovery() {
  if (typeof window === 'undefined' || window.__ggChunkRecovery) return;
  window.__ggChunkRecovery = true;
  window.addEventListener('vite:preloadError', (event) => {
    if (recoverFromChunkError()) {
      try { event.preventDefault(); } catch { /* ignore */ }
    }
  });
  window.addEventListener('unhandledrejection', (event) => {
    if (!isChunkLoadError(event.reason)) return;
    if (recoverFromChunkError()) {
      try { event.preventDefault(); } catch { /* ignore */ }
    }
  });
  // صفحهٔ سالم پرچم را برمی‌دارد تا دیپلویِ بعدی دوباره یک رفرشِ خودکار
  // داشته باشد. اگر همین صفحه خطا داده، پرچم می‌ماند تا حلقه نشود.
  window.addEventListener('load', () => {
    window.setTimeout(() => {
      if (sawChunkError) return;
      try { sessionStorage.removeItem(KEY); } catch { /* ignore */ }
      try {
        const url = new URL(window.location.href);
        if (!url.searchParams.has('__r')) return;
        url.searchParams.delete('__r');
        const next = url.pathname + url.search + url.hash;
        window.history.replaceState(window.history.state, '', next);
      } catch { /* ignore */ }
    }, 8000);
  });
}

export function loadLazy(importer) {
  return importer().catch((err) => {
    if (isChunkLoadError(err) && recoverFromChunkError()) return new Promise(() => {});
    throw err;
  });
}
