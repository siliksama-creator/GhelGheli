/**
 * اعتبارسنجی و ابزارِ بردارِ عصبیِ کارت (فاز ۲ — حالتِ سایه / Shadow Mode).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * مرزِ مسئولیت
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * این ماژول **هیچ مدلی اجرا نمی‌کند**. مدل روی گوشی/کلاینت اجرا می‌شود و فقط
 * یک بردارِ شناور به سرور می‌آید (هزینهٔ ماهانه≈۰؛ سرور فقط مقایسهٔ برداری
 * می‌کند). اینجا فقط:
 *
 *   • ورودیِ (هرز/خراب/بدخواه) پالوده می‌شود — بردار باید آرایه‌ای از اعداد با
 *     بُعدِ توافق‌شده باشد، نه رشته/آبجکت/بُعد اشتباه.
 *   • بردار نرمالِ L2 می‌شود تا مقایسهٔ کسینوسی در `cardIdentity` پایدار باشد.
 *
 * نسخهٔ بردار (`EMBEDDING_VERSION`) با مدلِ کلاینت هم‌گام است: اگر بعداً مدل
 * عوض شد و بُعد/توزیع فرق کرد، نسخه بالا می‌رود تا بردارهای قدیمی با جدید
 * قاطی نشوند.
 *
 * PoCِ روی ۵۶ عکسِ واقعی (MobileNetV3-Large، بردار ۱۲۸۰) نشان داد پس از
 * کادر‌بندیِ کارت، رتبه‌اول ۱۰۰٪ و تأییدِ غلط صفر است؛ پس بُعدِ پیش‌فرض
 * روی همان مدل گذاشته شده.
 */

// بُعدِ بردارِ مدلِ مرجع (MobileNetV3-Large pooled features).
const EMBED_DIM = 1280;

// نسخهٔ مدل/بُعد. با هر تعویضِ مدلِ کلاینت +۱ می‌شود.
// v2: مدلِ مستقلِ MobileNetV3-Large (وزن‌ها داخلِ ONNX) که عملاً روی کلاینت
// لود می‌شود؛ v1 فقط گراف بود و وزن‌هایش در فایلِ خارجیِ گم‌شده بود و هیچ
// وقت برداری نساخت.
const EMBEDDING_VERSION = 2;

// سقفِ امن برای اندازهٔ بایتِ JSON بردار (جلوگیری از سوءمصرف/دیتای غول‌پیکر).
const MAX_JSON_BYTES = 64 * 1024;

/**
 * ورودی را به یک بردارِ معتبر و نرمال‌شده تبدیل می‌کند.
 *
 * @param {*} raw  آرایهٔ اعداد، یا رشتهٔ JSON آرایه
 * @returns {{ v:number[], version:number } | null} بردار نرمال‌شده یا null
 */
function sanitizeEmbedding(raw) {
  let arr = raw;
  if (typeof raw === 'string') {
    if (raw.length > MAX_JSON_BYTES) return null;
    try { arr = JSON.parse(raw); } catch { return null; }
  }
  if (!Array.isArray(arr) || arr.length !== EMBED_DIM) return null;

  const v = new Array(EMBED_DIM);
  let norm = 0;
  for (let i = 0; i < EMBED_DIM; i++) {
    const n = arr[i];
    if (typeof n !== 'number' || !Number.isFinite(n)) return null;
    v[i] = n;
    norm += n * n;
  }
  // بردارِ صفر بی‌معناست (مدل خروجی نداده).
  if (norm < 1e-12) return null;

  const inv = 1 / Math.sqrt(norm);
  for (let i = 0; i < EMBED_DIM; i++) v[i] *= inv;
  return { v, version: EMBEDDING_VERSION };
}

module.exports = {
  EMBED_DIM,
  EMBEDDING_VERSION,
  sanitizeEmbedding,
};
