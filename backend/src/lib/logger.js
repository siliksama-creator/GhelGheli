// ── logger سبک با LOG_LEVEL ─────────────────────────────────────────────
// LOG_LEVEL=error → فقط error
// LOG_LEVEL=warn  → warn + error
// LOG_LEVEL=info  → info + warn + error (پیش‌فرض production)
// LOG_LEVEL=debug → همه (پیش‌فرض development)
// برای ساکت کردن pm2 logs کافیست LOG_LEVEL=warn بگذارید تا پیام‌های
// عملیاتیِ [upload]/[cleanup]/[redis] نریزند ولی خطاها بمانند.
const raw = String(process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug')).toLowerCase();
const levels = { error: 0, warn: 1, info: 2, debug: 3 };
const current = levels[raw] ?? 2;
const should = lvl => levels[lvl] <= current;
module.exports = {
  info: (...a) => { if (should('info')) console.log(...a); },
  warn: (...a) => { if (should('warn')) console.warn(...a); },
  error: (...a) => { if (should('error')) console.error(...a); },
  debug: (...a) => { if (should('debug')) console.log(...a); },
  // برای تست: سطح فعلی
  _level: raw,
};
