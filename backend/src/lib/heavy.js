'use strict';
/**
 * محدودکنندهٔ «کارِ سنگین» — سقفِ همزمانی برای پردازشِ عکس و استنتاجِ مدل.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * مشکلی که حل می‌کند (اندازه‌گیری‌شده روی همین سرور)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * بدون این سقف، اگر ۱۸ عکس هم‌زمان برسد:
 *   • هر عکس از ~۹۶ms به ~۱۱۶۰ms می‌رود (۱۲ برابر کندتر)
 *   • تأخیرِ API از ۳ms به **۲۹۱ms** می‌رسد ⇒ دوئل، چت و لاگینِ همهٔ
 *     کاربرانِ دیگر لگ می‌زند
 *
 * با سقفِ ۲ (زانوی نمودارِ اندازه‌گیری):
 *   • دیوارِ کلِ همان موج: ۸۴۶ms (در مقابل ۱۱۶۲ms با سقفِ ۱)
 *   • تأخیرِ API: ~۸ms — یعنی کاربرانِ دیگر چیزی حس نمی‌کنند
 *
 * عدد از `capacity.js` می‌آید (هسته − ۱، سقف ۴) و با `VISION_CONCURRENCY`
 * قابل تنظیم است. قاعدهٔ ثابت: همیشه حداقل یک هسته برای موتورِ بازیِ زنده
 * آزاد می‌ماند.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * قاعدهٔ استفاده (مهم)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `runHeavy` را **تو‌در‌تو** صدا نزنید: اگر یک کارِ داخلِ صف خودش دوباره
 * `runHeavy` بخواهد و ظرفیت ۱ باشد، قفل می‌شود (deadlock). سقف فقط روی
 * «بیرونی‌ترین» نقطه‌ها گذاشته می‌شود: `embedCard`، `embedFace` و
 * `optimizeUpload`. توابعِ داخلی (rawRgb، detectFaces، …) از صف عبور نمی‌کنند.
 */

const { AsyncLocalStorage } = require('async_hooks');
const { detect } = require('./capacity');

// ── یک نکتهٔ مهم دربارهٔ چند-رشته‌ای ─────────────────────────────────────
//
// سرور دو جا کارِ سنگین انجام می‌دهد: هم در حلقهٔ اصلی (پردازشِ آپلود) و هم
// در یک worker thread (استنتاجِ ONNX — services/visionQueue.js). شمارندهٔ
// این فایل بین رشته‌ها **مشترک نیست** (هر رشته نسخهٔ خودش را می‌سازد)؛ پس
// اگر هر دو طرف جدا بشمارند، سقف عملاً دو برابر می‌شود و روی سرورِ ۲ هسته‌ای
// همان ازدحامِ قبلی برمی‌گردد.
//
// راهکار: **فقط والد (حلقهٔ اصلی) دروازه‌بان است** و «جا» را تا پایانِ
// کارِ worker نگه می‌دارد؛ یعنی هر کارِ داخلِ worker از قبل اجازه‌اش گرفته
// شده. خود worker با `HEAVY_OFF=1` (در workers/visionWorker.js) شمردن را
// خاموش می‌کند تا دوباره‌شماری نشود. نتیجه: کلِ کارِ سنگینِ سرور — از هر
// مسیری — زیر یک سقفِ واحد می‌ماند.
const HEAVY_OFF = process.env.HEAVY_OFF === '1';

const HEAVY_LIMIT = Math.max(1, Number(process.env.VISION_CONCURRENCY) || detect().vision);

let active = 0;
const queue = [];
let peakActive = 0;
let served = 0;
let waited = 0; // شمارِ کارهایی که مجبور شدند در صف منتظر بمانند
let bypassed = 0; // کارهایی که چون خودشان داخل یک کارِ سنگین بودند، بدون صف رفتند

// نگهبانِ ضدقفل‌شدگی: اگر کدی که *داخل* یک ناحیهٔ سنگین اجرا می‌شود خودش
// دوباره runHeavy بخواهد، و ظرفیت پر باشد، هر دو کار تا ابد منتظر می‌مانند.
// با دنبال‌کردنِ زنجیرهٔ async، درخواست‌های تودرتو بلافاصله اجرا می‌شوند.
const inHeavy = new AsyncLocalStorage();

function pump() {
  if (active >= HEAVY_LIMIT) return;
  const job = queue.shift();
  if (!job) return;
  active++;
  if (active > peakActive) peakActive = active;
  if (job.enqueued) waited++;
  inHeavy.run(true, () => {
    Promise.resolve()
      .then(job.fn)
      .then(
        (v) => { active--; pump(); job.resolve(v); },
        (e) => { active--; pump(); job.reject(e); },
      );
  });
}

/**
 * کارِ سنگین را از صف عبور می‌دهد.
 * @template T
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
function runHeavy(fn) {
  // داخلِ worker شمردن خاموش است (والد از قبل جا گرفته) — فقط اجرا کن.
  if (HEAVY_OFF) return Promise.resolve().then(fn);
  // درخواستِ تودرتو: بدون صف اجرا شود تا خطرِ قفل‌شدگی نباشد.
  if (inHeavy.getStore()) { bypassed++; return Promise.resolve().then(fn); }

  served++;
  // مسیرِ سریع: اگر ظرفیت آزاد است و کسی در صف نیست، همان لحظه اجرا شود.
  if (active < HEAVY_LIMIT && queue.length === 0) {
    active++;
    if (active > peakActive) peakActive = active;
    return inHeavy.run(true, () => Promise.resolve().then(fn).finally(() => { active--; pump(); }));
  }
  return new Promise((resolve, reject) => {
    queue.push({ fn, resolve, reject, enqueued: true });
    pump();
  });
}

/** برای نمایش در /health و لاگ. */
function heavyStats() {
  return {
    max: HEAVY_LIMIT,
    active,
    queued: queue.length,
    peak: peakActive,
    served,
    waited,
    bypassed,
    off: HEAVY_OFF || undefined,
  };
}

module.exports = { runHeavy, heavyStats, HEAVY_LIMIT };
