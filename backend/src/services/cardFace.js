/**
 * اعتبارسنجی و ابزارِ بردارِ چهرهٔ بازیکن (فاز ۳ — حالتِ سایه / Shadow Mode).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * مرزِ مسئولیت
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * مثل سرویس بردارِ کارت، اینجا **هیچ مدلی اجرا نمی‌شود**. مدل چهره (آشکارساز
 * YuNet + شناساگر SFace) روی کلاینت/گوشی اجرا می‌شود و فقط یک بردار به سرور
 * می‌آید؛ سرور آن را پالوده/نرمال می‌کند و در سنجشِ شباهتِ کسینوسی به کار
 * می‌برد.
 *
 * بُعدِ بردار ۱۲۸ است (خروجی SFace پس از هم‌ترازیِ چهره به ۱۱۲×۱۱۲). نسخه با
 * مدلِ چهره گره خورده؛ اگر مدل عوض شد و بُعد/توزیع فرق کرد، نسخه بالا می‌رود.
 *
 * **چرا چهره فقط مکمل است:** بردار چهره هویتِ بازیکن را «عرضِ قالب کارت»
 * می‌گوید (نقره‌ای/معمولیِ یک بازیکن را به هم نزدیک می‌کند) ولی نوع/ارزش/
 * یکتابودنِ کارت را نمی‌گوید. پس در تصمیمِ «کدام طرحِ کارت» جایگزین بردارِ
 * کارت نمی‌شود؛ فقط به‌عنوان شاهدِ هویتیِ کمکی در حالت سایه ثبت/سنجیده می‌شود.
 */

// بُعدِ بردارِ چهره (SFace).
const FACE_DIM = 128;

// نسخهٔ مدلِ چهره. با هر تعویضِ مدلِ کلاینت +۱ می‌شود.
const FACE_VERSION = 1;

// سقفِ امن برای اندازهٔ بایتِ JSON بردار.
const MAX_JSON_BYTES = 16 * 1024;

/**
 * ورودی را به یک بردارِ چهرهٔ معتبر و نرمال‌شده تبدیل می‌کند.
 *
 * @param {*} raw  آرایهٔ اعداد، یا رشتهٔ JSON آرایه
 * @returns {{ v:number[], version:number } | null}
 */
function sanitizeFaceEmbedding(raw) {
  let arr = raw;
  if (typeof raw === 'string') {
    if (raw.length > MAX_JSON_BYTES) return null;
    try { arr = JSON.parse(raw); } catch { return null; }
  }
  if (!Array.isArray(arr) || arr.length !== FACE_DIM) return null;

  const v = new Array(FACE_DIM);
  let norm = 0;
  for (let i = 0; i < FACE_DIM; i++) {
    const n = arr[i];
    if (typeof n !== 'number' || !Number.isFinite(n)) return null;
    v[i] = n;
    norm += n * n;
  }
  if (norm < 1e-12) return null;

  const inv = 1 / Math.sqrt(norm);
  for (let i = 0; i < FACE_DIM; i++) v[i] *= inv;
  return { v, version: FACE_VERSION };
}

module.exports = {
  FACE_DIM,
  FACE_VERSION,
  sanitizeFaceEmbedding,
};
