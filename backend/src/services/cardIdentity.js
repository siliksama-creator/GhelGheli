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
    // فقط بردار عصبی: امتیاز را روی **کسینوس خام** نگه می‌داریم ([-۱,۱]، ولی
    // برای عکسِ کارت عملاً در ۰.۳ تا ۰.۹). نگاشتِ (cos+1)/2 فاصلهٔ اطمینانِ
    // دو نامزد برتر را نصف می‌کرد (حاشیه ۰.۱۱۶ → ۰.۰۵۸) و قاطعیتی که واقعاً
    // وجود داشت از بین می‌رفت — باگِ «هالندِ کمی‌تار به کین خورد و به صف رفت»
    // از همین بود. rankIdentity حاشیه و حداقلِ امتیاز را روی همین مقیاس می‌سنجد.
    score = embed;
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
  // نقطهٔ مرجع، متن (OCR) امتیازِ ۰..۱ می‌دهد؛ پس پیش‌فرضِ accept=0.78 و
  // حاشیهٔ ۰.۱۵ برای مسیرِ متنی درست است. اما مسیرِ فقط-بردار حالا کسینوسِ
  // خام را نگه می‌دارد ([-۱,۱]) و مقیاسِ حاشیه‌اش متفاوت است: اندازه‌گیری
  // روی کاتالوگِ واقعی نشان داد دو بازیکنِ متفاوت می‌توانند ~۰.۹۰ هم شباهت
  // داشته باشند، پس نمرهٔ مطلقِ بالا امن نیست؛ **حاشیه نسبت به نفر دوم** است
  // که قاطعیت را می‌سازد. عکسِ واقعیِ هالند: برنده ۰.۸۴۵، حاشیه ۰.۱۱۶، نسبت
  // ۱.۱۶. آستانه‌های پایین مخصوص بردار طوری است که این «واضحِ برتر» قاطع
  // شود ولی دو نامزدِ نزدیک (حاشیه ~۰) قاطع نشوند و به صف بروند.
  const ACCEPT = th.accept ?? 0.78;
  // آستانه‌های مسیرِ فقط-بردار از شبیه‌سازیِ ۵۶ طرح (رو و پشت) با خرابیِ
  // تار/فشرده/چرخیده آمد: با این مقادیر ۵۶/۵۶ خودکارِ درست و صفر بازیکنِ غلط.
  // حاشیه نسبت به نزدیک‌ترین بازیکنِ دیگر سنجیده می‌شود.
  const EMBED_ACCEPT = th.embedAccept ?? 0.55;
  const EMBED_MIN_MARGIN = th.embedMinMargin ?? 0.05;
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
  // حاشیه/نسبت نسبت به نزدیک‌ترین **بازیکنِ دیگر** سنجیده می‌شود، نه رتبهٔ
  // دومِ خام: واریانت‌های متفاوتِ یک بازیکن (معمولی/نقره‌ای/...) از نظر برداری
  // به هم خیلی نزدیک‌اند و اگر رقیب به‌حساب بیایند، حاشیه را الکی کوچک و یک
  // تشخیصِ واضح را «مبهم» می‌کنند (و انبوه کارتِ همان بازیکن بی‌خود به صف
  // می‌رود). پس ردیف‌هایی که به همان بازیکنِ برنده اشاره دارند رد می‌شوند.
  // هم‌بازیکن با کلماتِ نام (playerLexemes) یا شمارهٔ پیراهن تشخیص داده می‌شود.
  const bestLex = (best.design?.playerLexemes || []).filter(Boolean).slice().sort();
  const bestNum = best.design?.playerNumber || null;
  const isSamePlayer = (d) => {
    const lx = (d?.playerLexemes || []).filter(Boolean).slice().sort();
    if (bestLex.length && lx.length && bestLex.length === lx.length
        && bestLex.every((w, i) => w === lx[i])) return true;
    if (bestNum && d?.playerNumber && String(bestNum) === String(d.playerNumber)) return true;
    return false;
  };
  const rival = ranked
    .slice(1)
    .find(r => !isSamePlayer(r.design));
  const rivalScore = rival ? rival.score : 0;
  const margin = rival ? best.score - rivalScore : 1;
  const ratio = rival && rivalScore > 1e-6 ? best.score / rivalScore : 99;
  // مسیرِ فقط-بردار (بدون متن) آستانه‌های خودش را دارد؛ مسیر متنی همان
  // پذیرش ۰.۷۸. در حالت ترکیب (متن+بردار) هم نمره در مقیاس متنی است.
  const embedOnly = best.byEmbedding && !best.byText;
  const acceptCut = embedOnly ? EMBED_ACCEPT : ACCEPT;
  const marginCut = embedOnly ? EMBED_MIN_MARGIN : (th.minMargin ?? 0.15);
  const ratioCut = embedOnly ? 1.06 : MIN_RATIO;
  const decisive = best.score >= acceptCut && margin >= marginCut && ratio >= ratioCut;

  return {
    found: decisive,
    decisive,
    score: best.score,
    margin,
    ratio: Number.isFinite(ratio) ? ratio : 99,
    byText: best.byText,
    byEmbedding: best.byEmbedding,
    embedOnly,
    design: best.design,
    ranked: ranked.slice(0, 3),
  };
}

module.exports = {
  cosine,
  identityScore,
  rankIdentity,
};
