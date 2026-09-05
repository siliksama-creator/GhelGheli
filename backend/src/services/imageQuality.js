/**
 * گیتِ کیفیت عکس — قبل از آنکه عکس به موتورِ تشخیص خورده شود.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * چرا لازم شد
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * پیش از این، عکسِ بسیار تار/تاریک/کم‌کنتراست به موتور اثر انگشت می‌رسید؛
 * موتور نمرهٔ پایین می‌داد و پرونده به صفِ مدیر می‌رفت. مشکل دو بخش بود:
 *
 *   • کاربر نمی‌فهمید عکس قابل استفاده نیست و همان عکس بد را با چند کد
 *     می‌فرستاد و صف را شلوغ می‌کرد.
 *   • «نشدم چون عکس بد است» از «نشدم چون کارت را نشناختم» تفکیک نمی‌شد.
 *
 * این تابع با سه سنجهٔ سبک (که روی همان تصویرِ بریده‌شدهٔ کارت محاسبه
 * می‌شوند، بدون هیچ وابستگی‌ای جز sharp) می‌گوید عکس در لحظهٔ آپلود قابلِ
 * تشخیص هست یا باید کاربر دوباره عکس بگیرد:
 *
 *   ۱. تاری  — واریانسِ لاپلاسین (پراکندگیِ لبه‌ها). کارتِ خوانا لبه‌های
 *      متن و طرح دارد و عددش بالاست؛ تصویر تار/تَه‌رنگ عددی نزدیک صفر دارد.
 *   ۲. روشنایی — میانگینِ روشنایی خاکستری؛ هم تاریکیِ شدید و هم فلاشِ
 *      کاملاً سوخته قابل استفاده نیستند.
 *   ۳. کنتراست — بازهٔ صدک ۲ تا ۹۸؛ اگر تصویر یکدست باشد هیچ سیگنالی نیست.
 *
 * ⚠️ عمداً سخت‌گیر نیست: کیفیتِ «متوسطِ» عکسِ گوشی باید رد شود، نه فقط
 *    فاجعه. آستانه‌ها طوری است که همان عکس‌هایی که امروز نمرهٔ تطبیقِ
 *    زیر آستانه می‌گرفتند، حالا همان لحظه بازگردانده شوند با راهنمای فارسی.
 *
 * این یک «راهنمای مشتری» است نه ردِ امنیتی: تصمیم نهایی ثبت همچنان با موتور
 * و در حالتِ مبهم با مدیر است (مقدار `enforce=false` رفتار قدیمی را حفظ
 * می‌کند).
 */

const sharp = require('sharp');

// آستانه‌ها — روی تصویرِ **بریده‌شدهٔ کارت** (workBuf پس از cardCrop).
const BLUR_MIN = 60;        // واریانسِ لاپلاسین زیر این = تار
const DARK_MEAN = 38;       // میانگینِ روشنایی زیر این = خیلی تاریک
const BLOWN_MEAN = 242;     // میانگینِ بالای این + کنتراست کم = سوخته
const CONTRAST_MIN = 28;    // بازهٔ روشناییِ صدک۲–۹۸ زیر این = تخت/بی‌جزئیات

/**
 * سنجه‌های کیفیت یک تصویر را برمی‌گرداند.
 *
 * @param {Buffer} buf بافرِ تصویر (ترجیحاً نسخهٔ بریده‌شدهٔ کارت)
 * @returns {Promise<{
 *   blur:number, mean:number, contrast:number, width:number, height:number,
 *   reasons:string[], usable:boolean
 * }>}
 */
async function assess(buf) {
  const reasons = [];
  const { data, info } = await sharp(buf, { failOn: 'none' })
    .rotate()
    .removeAlpha()
    .greyscale()
    .resize(256, 256, { fit: 'fill', kernel: 'lanczos3' })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const N = info.width * info.height; // ۲۵۶×۲۵۶

  // ── واریانسِ لاپلاسین (هستهٔ ۳×۳ مرکز ۴، همسایه‌ها ۱-) ──
  //
  // در پیکسل‌های مرزی درگیر نمی‌شویم تا اندیس از کادر بیرون نزند. لاپلاسین
  // پاسخِ گوشه‌هاست؛ واریانسِ آن روی تصویرِ تار به‌شدت افت می‌کند.
  const W = info.width;
  const lap = new Float64Array(N);
  let lapSum = 0;
  for (let y = 1; y < info.height - 1; y++) {
    for (let x = 1; x < info.width - 1; x++) {
      const i = y * W + x;
      const v = 4 * data[i]
        - data[i - 1] - data[i + 1] - data[i - W] - data[i + W];
      lap[i] = v;
      lapSum += v;
    }
  }
  const lapMean = lapSum / N;
  let lapVar = 0;
  for (let i = 0; i < N; i++) lapVar += (lap[i] - lapMean) ** 2;
  lapVar /= N;

  // ── میانگین و کنتراستِ صدکی ──
  const hist = new Uint32Array(256);
  let sum = 0;
  for (let i = 0; i < N; i++) { const v = data[i]; hist[v]++; sum += v; }
  const mean = sum / N;
  const pct = (p) => {
    const target = p * N;
    let acc = 0;
    for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= target) return v; }
    return 255;
  };
  const contrast = pct(0.98) - pct(0.02);

  // لاپلاسینِ خام روی گرادیانِ ۰–۲۵۵ است؛ به مقیاسی ساده نرمال می‌کنیم که
  // آستانهٔ خوانا (BLUR_MIN) معنا داشته باشد.
  const blur = lapVar / 100;

  if (blur < BLUR_MIN) reasons.push('blur');
  if (mean < DARK_MEAN) reasons.push('dark');
  if (mean > BLOWN_MEAN && contrast < CONTRAST_MIN) reasons.push('blown');
  if (contrast < CONTRAST_MIN) reasons.push('flat');

  return {
    blur: Math.round(blur * 10) / 10,
    mean: Math.round(mean),
    contrast: Math.round(contrast),
    width: info.width,
    height: info.height,
    reasons,
    usable: reasons.length === 0,
  };
}

/**
 * راهنمای فارسی برای هر علت (به کلاینت می‌رود تا کاربر عکس بهتر بگیرد).
 */
const REASON_TEXT = {
  blur: 'عکس تار است. لطفاً گوشی را ثابت نگه دارید، کارت را تمامِ کادر بگیرید و نزدیک‌تر شوید.',
  dark: 'تصویر خیلی تاریک است. در نورِ کافی و بدونِ سایه روی کارت عکس بگیرید.',
  blown: 'فلاش بیش از حد بازتابیده. کمی فاصله بگیرید یا فلاش را خاموش کنید.',
  flat: 'کارت به‌وضوح دیده نمی‌شود؛ مطمئن شوید کارت صاف و روبه‌روی دوربین باشد و میز/زمینه در عکس نباشد.',
};

/**
 * متنِ پیامِ فارسی برای علت‌های کیفیت.
 */
function qualityMessage(reasons) {
  if (!reasons || !reasons.length) return null;
  const parts = reasons.map(r => REASON_TEXT[r]).filter(Boolean);
  return parts[0];
}

module.exports = {
  assess,
  qualityMessage,
  REASON_TEXT,
  BLUR_MIN,
  DARK_MEAN,
  BLOWN_MEAN,
  CONTRAST_MIN,
};
