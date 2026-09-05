// تلهٔ سراسریِ خطای پنل ادمین.
//
// چرا لازم بود: وب‌کاربر و اپ اندروید کرش‌هایشان را به صندوق خطا می‌فرستادند
// و خود بک‌اند هم خطای ۵xx را ثبت می‌کرد، اما پنل ادمین هیچ مکانیزمِ
// گزارشی نداشت — یک استثنای جاوااسکریپت در صفحهٔ مدیر فقط در کنسولِ
// مرورگرِ خودش می‌ماند و تیم هرگز نمی‌دید.
//
// رفتار:
//   • window.onerror            خطای همگام/ساختارِ ریکت را می‌گیرد.
//   • unhandledrejection        Promise رهاشده را می‌گیرد.
//   • گزارش‌ها با همان توکنِ ادمین به /api/telemetry/crash می‌روند و با
//     platform='admin' دسته می‌شوند (بک‌اند این مقدار را می‌پذیرد).
//   • خطای محضِ خارجیِ «Script error.» بدون جزئیات عمداً نادیده گرفته می‌شود
//     (همان قاعدهٔ وب‌کاربر: کدِ ما نیست، تحلیل‌ناپذیر است، صندوق را کور
//     می‌کند).
//   • محدودیتِ نرخ سمت کلاینت: حداکثر ۱۰ گزارش در هر نشست، و یک پیام یکتا
//     فقط یک‌بار فرستاده می‌شود تا حلقهٔ خطا، صندوق را پر نکند.

import { API_BASE } from './api.js';

const MAX_REPORTS = 10;
let sentCount = 0;
const seen = new Set();

function squeeze(text, limit) {
  const s = String(text || 'unknown');
  if (s.length <= limit) return s;
  const head = Math.ceil((limit - 20) * 0.7);
  const tail = limit - 20 - head;
  return `${s.slice(0, head)} … [${s.length}] … ${s.slice(s.length - tail)}`;
}

function send(source, message, stack) {
  if (sentCount >= MAX_REPORTS) return;
  const key = `${source}:${String(message).slice(0, 120)}`;
  if (seen.has(key)) return;
  seen.add(key);
  sentCount += 1;

  const token = localStorage.getItem('adminToken');
  // بدون توکن هم می‌فرستیم (مسیر مهمان‌پذیر است)؛ ولی عملاً پنل ادمین
  // همیشه پشتِ ورود است، پس توکن باید حاضر باشد.
  fetch(`${API_BASE}/api/telemetry/crash`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      platform: 'admin',
      source,
      release: import.meta.env.VITE_APP_RELEASE || 'admin-web',
      message: squeeze(message, 2000),
      stack: String(stack || '').slice(0, 10000),
      context: {
        path: location.hash || location.pathname,
        href: location.pathname,
        ua: navigator.userAgent.slice(0, 200),
      },
    }),
    // هرگز نباید مسیر گزارش خطا، خودش خطای دیگری بیرون بدهد.
  }).catch(() => {});
}

let installed = false;

export function installAdminErrorMonitor() {
  if (installed) return;
  installed = true;

  window.addEventListener('error', (event) => {
    const opaque =
      (event.message === 'Script error.' || event.message === 'Script error')
      && !event.error && !event.filename;
    if (opaque) return;
    const where = event.filename
      ? `${event.filename.split('/').pop()}:${event.lineno || 0}`
      : 'admin-web';
    send(where, event.message || 'unknown', event.error?.stack);
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const message = reason?.message || String(reason);
    // خطای عمدیِ «نشست منقضی شده» که خودمان هندل می‌کنیم را کرش نگیریم.
    if (/منقضی|لغو شده|unauthorized|401/i.test(message)) return;
    send('unhandledrejection', message, reason?.stack);
  });
}
