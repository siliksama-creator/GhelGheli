/**
 * لایهٔ هویتِ کارت — ترکیبِ «نام‌خوان» (واژه‌نامهٔ OCR) و بردارِ عصبی (embedding).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * چرا یک لایهٔ جدا
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * موتورِ اثر انگشتِ کلاسیک (`imageFingerprint`) و واژه‌نامهٔ بازیکن
 * (`playerIdentity`) و بردارِ عصبیِ فاز ۲ (روی گوشی یا سرویس ساخته می‌شود)
 * هر کدام یک «نظر» می‌دهند. تصمیمِ نهاییِ هویت — و مهم‌تر از همه اصلاحِ خودکارِ
 * «کدِ جابه‌جاشدهٔ شرکت» (سناریوی کدِ هالند روی کارتِ رودری) — نباید در route
 * پخش شود. این ماژول آن نظرات را به یک خروجیِ واحد و تست‌پذیر می‌رساند.
 *
 * ── سلسله‌مراتبِ اعتماد ──
 *
 *   ۱. **نامِ روی کارت (OCR + واژه‌نامه):** قطعی‌ترین سیگنالِ هویت. نامِ
 *      درشتِ بازیکن روی کارت چاپ شده و دروغ نمی‌گوید. اگر با اطمینانِ بالا
 *      خوانده شود، بیشترین وزن را می‌گیرد.
 *   ۲. **بردارِ عصبی (embedding):** چهره/ژست/ترکیب‌بندی را مستقل از رنگ و
 *      متن می‌بیند. وقتی متن تار است به داد می‌رسد و وقتی متن هست تأییدش می‌کند.
 *   ۳. **اثر انگشتِ کلاسیک:** تورِ امنیت و حالتِ بدونِ دادهٔ جدید.
 *
 * بردارِ عصبی حالا به‌صورت **افزونهٔ نصب‌نشده** پشتیبانی می‌شود: طرح‌هایی که
 * `embedding` داشته باشند از آن استفاده می‌کنند؛ بقیه به متن/تصویر کلاسیک
 * تکیه می‌کنند. پس وقتی مدلِ روی‌گوشی/سرویس به جریان وصل شد، فقط کافی است
 * `embedding` هنگام آپلودِ مرجع و ثبتِ کاربر پر شود — همین.
 */

const { nameIdentity, numberIdentity } = require('./playerIdentity');

/**
 * شباهتِ کسینوسیِ دو بردار (برای بردارِ عصبی).
 */
function cosine(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || !a.length || a.length !== b.length) return null;
  let dot = 0; let na = 0; let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na < 1e-12 || nb < 1e-12) return null;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/**
 * امتیازِ هویتِ یک طراحی در برابر عکسِ کاربر.
 *
 * @param {object} query   اثر انگشتِ عکسِ کاربر: { textTokens, embedding }
 * @param {object} design  طراحیِ مرجع با { playerLexemes, playerNumber, embedding }
 * @returns {{ score:number, byText:boolean, byEmbedding:boolean, name:number|null, embed:number|null }}
 */
function identityScore(query, design) {
  const name = nameIdentity(query?.textTokens, design?.playerLexemes);
  const num = numberIdentity(query?.textTokens, design?.playerNumber);
  let textScore = name;
  if (name != null && num != null) textScore = 0.75 * name + 0.25 * num;
  else if (name == null) textScore = null;

  // بردار فقط وقتی معنا دارد که با همان نسخهٔ مدل ساخته شده باشد؛ فضای برداریِ
  // نسخه‌های مختلف با هم قابل‌مقایسه نیست. نسخهٔ نامعلوم را رد می‌کنیم تا
  // بردارِ v1 با v2 قاطی نشود.
  const qv = query?.embeddingVersion;
  const dv = design?.embeddingVersion;
  const sameVersion = qv != null && dv != null && qv === dv;
  const embed = (query?.embedding && design?.embedding && sameVersion)
    ? cosine(query.embedding, design.embedding)
    : null;

  // ترکیبِ متن و بردارِ عصبی.
  let score;
  let byText = false;
  let byEmbedding = false;
  if (textScore != null && embed != null) {
    // هر دو هستند: نام بالاترین اعتماد؛ بردار وزنِ مکمل.
    score = 0.62 * textScore + 0.38 * Math.max(0, (embed + 1) / 2);
    byText = true; byEmbedding = true;
  } else if (textScore != null) {
    score = textScore;
    byText = textScore > 0;
  } else if (embed != null) {
    // فقط بردار عصبی؛ نگاشت [-۱,۱] → [۰,۱].
    score = Math.max(0, (embed + 1) / 2);
    byEmbedding = true;
  } else {
    score = 0;
  }

  return {
    score: Math.max(0, Math.min(1, score)),
    byText, byEmbedding,
    name: textScore, embed,
  };
}

/**
 * رتبه‌بندیِ هویتیِ طرح‌ها.
 *
 * @param {object} query   { textTokens, embedding }
 * @param {object[]} designs  هر طراحی با card_type_id و (اختیاری) playerLexemes/embedding
 * @param {object} [th]
 * @param {number} [th.accept=0.78]   امتیازِ قاطعِ هویت
 * @param {number} [th.minMargin=0.15] حاشیهٔ لازم تا رتبهٔ دوم
 * @param {number} [th.minRatio=1.25]  نسبتِ لازم رتبهٔ اول/دوم
 */
function rankIdentity(query, designs, th = {}) {
  const ACCEPT = th.accept ?? 0.78;
  const MIN_MARGIN = th.minMargin ?? 0.15;
  const MIN_RATIO = th.minRatio ?? 1.25;

  const list = Array.isArray(designs) ? designs : [];
  const ranked = list
    .map(d => ({ design: d, ...identityScore(query, d) }))
    // فقط طرح‌هایی که حداقل یک سیگنالِ هویتی دارند.
    .filter(r => r.byText || r.byEmbedding)
    .sort((x, y) => y.score - x.score);

  if (!ranked.length) {
    return { found: false, decisive: false, score: 0, margin: 0, ratio: 99, design: null, ranked: [] };
  }

  const best = ranked[0];
  const second = ranked.length > 1 ? ranked[1].score : 0;
  const margin = ranked.length > 1 ? best.score - second : 1;
  const ratio = second > 1e-6 ? best.score / second : 99;
  const decisive = margin >= MIN_MARGIN && ratio >= MIN_RATIO;

  return {
    found: best.score >= ACCEPT && decisive,
    decisive,
    score: best.score,
    margin,
    ratio: Number.isFinite(ratio) ? ratio : 99,
    byText: best.byText,
    byEmbedding: best.byEmbedding,
    design: best.design,
    ranked: ranked.slice(0, 3),
  };
}

module.exports = {
  cosine,
  identityScore,
  rankIdentity,
};
