/**
 * هویتِ بازیکن از روی متنِ OCR — «چشمِ نام‌خوان».
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * چرا این سرویس جدا ساخته شد
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * تا الان تطبیقِ متن (`imageFingerprintText.textSimilarity`) فقط دو مجموعهٔ
 * توکن را با هم می‌سنجید و دنبالِ «اشتراکِ کلمه» می‌گشت. این برای «این عکس با
 * خودش یکی است» کافی بود، ولی سه ضعف جدی برای *تعیین هویت* داشت:
 *
 *   ۱. واژه‌نامه‌ای نداشت. نمی‌دانست کلمه‌ای که خوانده باید یکی از نام‌های
 *      واقعیِ کاتالوگ باشد؛ فقط می‌گفت «توکن‌ها هم‌پوشانی دارند».
 *   ۲. تحملِ غلطِ املایی‌اش فقط «زیررشته» بود. `HAALND` (کمبودِ A) با
 *      `HAALAND` یکی نمی‌شد.
 *   ۳. نام‌خانوادگی و نام‌کوچک یک وزن داشتند، در حالی که روی کارت فقط نامِ
 *      بزرگ (نام‌خانوادگی) هویتِ اصلی است.
 *
 * این ماژول «واژه‌نامهٔ بازیکنان» را از خودِ کاتالوگ (`card_types.player_lexemes`)
 * می‌گیرد و متنِ نویزیِ OCR را با تطبیقِ فازی (فاصلهٔ ویرایشی + زیررشته) به
 * بازیکن می‌بندد. قوی‌ترین سیگنالِ هویتی برای سناریوی «کدِ هالند روی کارتِ
 * رودری» است: متنِ درشتِ روی کارت دروغ نمی‌گوید.
 *
 * ⚠️ برخلاف فاز بعدی (embedding عصبی)، این فاز کاملاً درون‌فرایندی، بدونِ
 *    وابستگی و بدونِ بارِ CPU است: مقایسهٔ چند ده رشته.
 *
 * @module
 */

// کلماتی که روی کارت چاپ می‌شوند ولی هویتِ بازیکن نیستند. هنگامِ امتیازدهی
// عملاً بی‌اثراند (امتیاز روی واژه‌نامهٔ بازیکن است) ولی برای گزارش و تمیزی
// نگه داشته می‌شوند.
const GENERIC_WORDS = new Set([
  'CARD', 'PREMIUM', 'SILVER', 'GOLD', 'NORMAL', 'LEGEND', 'RARE',
  'WORLD', 'WORLDCUP', 'WORLD CUP', 'LIMITED', 'ETERNAL', 'ETIHAD',
  'EMIRATES', 'BETTER', 'FOOTBALL', 'SOCCER', 'RIGHT', 'LEFT',
]);

/**
 * نرمال‌سازیِ نام: حذفِ اعراب/اکان، حروفِ بزرگ، فقط [A-Z0-9].
 *
 * @example normalizeName('Dembélé') === 'DEMBELE'
 * @example normalizeName('Júnior') === 'JUNIOR'
 * @example normalizeName('~HAALND!') === 'HAALND'
 */
function normalizeName(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // اکان‌ها (é, ñ, í, …)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** توکن‌های یک رشتهٔ نام (واژه‌های ≥۳ حرف) — هم برای نامِ کاتالوگ هم OCR. */
function tokensOf(s) {
  return normalizeName(s).split(' ').filter(w => w.length >= 3);
}

/** فاصلهٔ ویرایشیِ لوِنشتاین (دو رشتهٔ کوتاه — نام‌ها). */
function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = new Array(b.length + 1);
    cur[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[b.length];
}

/**
 * شباهتِ دو توکن، عددی در [۰,۱].
 *
 * سه سطح: یکسان (۱)؛ زیررشتهٔ مطمئن (۰.۹۲ — مثلِ EMBELE⊂DEMBELE که اولش
 * سایه/برش می‌خورد)؛ فاصلهٔ ویرایشی برای غلطِ تایپ/OCR.
 */
function tokenSim(a, b) {
  if (!a || !b) return 0;
  const A = a.toUpperCase();
  const B = b.toUpperCase();
  if (A === B) return 1;
  const len = Math.min(A.length, B.length);
  const max = Math.max(A.length, B.length);
  // زیررشته فقط وقتی قابل اتکاست که طرفِ کوتاه به اندازهٔ کافی بلند باشد تا
  // تصادفِ حروف رخ ندهد (مثلاً «RAL» نباید داخلِ «PORTUGAL» عالی شود).
  // ضریبِ نسبتِ طول، هم‌تطبیقِ حرف‌اول‌گم‌شده (EMBELE ⊂ DEMBELE) را بالا
  // نگه می‌دارد و هم تصادفِ کوتاه (RAL ⊂ PORTUGAL) را پایین.
  if (len >= 4 && (A.includes(B) || B.includes(A))) {
    const ratio = len / max;
    // تفاوت فقط یک حرف (مثلاً حرفِ اول در لبهٔ برش/سایه): نزدیکِ کامل.
    if (max - len <= 1) return 0.9 + 0.1 * ratio;
    return 0.85 * ratio;
  }
  return Math.max(0, 1 - levenshtein(A, B) / Math.max(1, max));
}

/**
 * امتیازِ هویتِ نام بین توکن‌های خوانده‌شده و واژه‌نامهٔ یک کارت.
 *
 * نام‌خانوادگی (آخرین واژهٔ نام) وزنِ بیشتری دارد: روی کارت همان با حروفِ
 * درشت چاپ می‌شود و هویتِ اصلی است. نام‌کوچک کمک‌کننده است.
 *
 * @param {string[]} ocrTokens   توکن‌های خوانده‌شده از عکس کاربر
 * @param {string[]} lexemes     واژه‌های نامِ بازیکن (نرمال‌شده، از کاتالوگ)
 * @returns {?number} [۰,۱] یا null اگر نامی در هیچ طرف نباشد (بی‌اطلاع)
 */
function nameIdentity(ocrTokens, lexemes) {
  const ocr = (ocrTokens || []).filter(t => t && t.charCodeAt(0) !== 35 && !t.startsWith('#'));
  // واژه‌های نام ممکن است از دیتابیس (lowercase) یا تست (uppercase) بیایند؛
  // اول نرمال می‌شوند سپس فیلترِ طول روی نتیجهٔ نرمال‌شده اعمال می‌شود تا
  // برچسبِ نسخه‌ای مثل «N» ناپدید نشود (normalize روی ورودیِ uppercase هم
  // درست کار می‌کند). فقط نام‌های ≥۲ حرفی نگه داشته می‌شوند.
  const lex = (lexemes || [])
    .filter(Boolean)
    .flatMap(w => normalizeName(w).split(' '))
    .filter(w => w.length >= 2);
  if (!ocr.length || !lex.length) return null;

  const perLexeme = lex.map((word, idx) => {
    const best = ocr.reduce((m, t) => Math.max(m, tokenSim(word, t)), 0);
    // نام‌خانوادگی (آخرین واژه) همان چیزی است که با حروفِ درشت روی کارت
    // چاپ می‌شود و هویتِ اصلی است؛ وزنِ ۶ در برابرِ ۱ برای نام‌کوچک.
    const weight = idx === lex.length - 1 ? 6 : 1;
    return { best, weight };
  });

  // اگر حتی نام‌خانوادگی تطبیقِ معناداری (≥۰.۶) ندارد، این بازیکن نیست.
  const surnameHit = perLexeme[perLexeme.length - 1].best >= 0.6;
  if (!surnameHit) return 0;

  const wsum = perLexeme.reduce((s, p) => s + p.weight, 0);
  const score = perLexeme.reduce((s, p) => s + p.best * p.weight, 0) / wsum;
  return Math.max(0, Math.min(1, score));
}

/**
 * شمارهٔ پیراهن: آیا توکن‌های `#N` عکس با شمارهٔ کارت یکی‌اند؟
 *
 * @returns {?number} ۱ موافق، ۰ مخالف، null اگر هیچ طرف شماره ندارد
 */
function numberIdentity(ocrTokens, playerNumber) {
  const ocrNums = (ocrTokens || [])
    .filter(t => t && (t.startsWith('#') || t.charCodeAt(0) === 35))
    .map(t => String(parseInt(t.replace('#', ''), 10)))
    .filter(n => n !== 'NaN');
  const want = String(playerNumber == null ? '' : playerNumber).trim();
  if (!want) return null;
  if (!ocrNums.length) return null;
  return ocrNums.includes(want) ? 1 : 0;
}

/**
 * بهترین بازیکن را از روی متنِ OCR در میان طرح‌های کاتالوگ پیدا می‌کند.
 *
 * @param {object}   opts
 * @param {string[]} opts.textTokens  توکن‌های خوانده‌شده از عکس کاربر
 * @param {Array<{id:string, card_type_id:string, playerLexemes?:string[],
 *                playerNumber?:string|null}>} opts.designs
 *        طراحی‌ها با واژه‌نامهٔ بازیکن (از join با card_types).
 * @param {number}  [opts.acceptScore=0.72]  آستانهٔ هویتِ قاطع
 * @param {number}  [opts.minMargin=0.12]    حاشیهٔ لازم تا رتبهٔ دوم
 * @param {number}  [opts.minRatio=1.18]     نسبتِ لازم رتبهٔ اول/دوم
 * @returns {{
 *   found:boolean, score:number, margin:number, ratio:number,
 *   decisive:boolean, design:object|null, ranked:Array
 * }}
 *   found    = آیا هویتِ قاطعی پیدا شد (امتیاز بالا + حاشیه + نسبت)
 *   decisive = آیا بین گزینه‌ها انتخاب ممکن است (جدا از آستانه)
 */
function identityAgainst({
  textTokens,
  designs,
  acceptScore = 0.72,
  minMargin = 0.12,
  minRatio = 1.18,
}) {
  const list = Array.isArray(designs) ? designs : [];
  if (!Array.isArray(textTokens) || !textTokens.length || !list.length) {
    return { found: false, score: 0, margin: 0, ratio: 99, decisive: false, design: null, ranked: [] };
  }

  const ranked = list
    .map(d => {
      const n = nameIdentity(textTokens, d.playerLexemes);
      const num = numberIdentity(textTokens, d.playerNumber);
      // اگر هر دو نام و شماره موجودند: نام ۰.۷۵، شماره ۰.۲۵. شماره فقط برای
      // شکستنِ تساویِ دو کارتِ یک‌بازیکن است (مثلاً رونالدو ۷ در برابر ۱۷).
      let score = n;
      if (n == null) score = null;
      else if (num != null) score = 0.75 * n + 0.25 * num;
      return { design: d, score: score == null ? 0 : score, hasName: n != null };
    })
    .filter(r => r.hasName)
    .sort((x, y) => y.score - x.score);

  if (!ranked.length) {
    return { found: false, score: 0, margin: 0, ratio: 99, decisive: false, design: null, ranked: [] };
  }

  const best = ranked[0];
  const secondScore = ranked.length > 1 ? ranked[1].score : 0;
  const margin = ranked.length > 1 ? best.score - secondScore : 1;
  const ratio = secondScore > 1e-6 ? best.score / secondScore : 99;
  const decisive = margin >= minMargin && ratio >= minRatio;

  return {
    found: best.score >= acceptScore && decisive,
    score: best.score,
    margin,
    ratio: Number.isFinite(ratio) ? ratio : 99,
    decisive,
    design: best.design,
    ranked: ranked.slice(0, 3),
  };
}

/** آیا یک توکنِ OCR صرفاً کلمهٔ عمومیِ کارت است (گزارش/پاکسازی)؟ */
function isGenericToken(t) {
  return GENERIC_WORDS.has(normalizeName(t));
}

module.exports = {
  normalizeName,
  tokensOf,
  levenshtein,
  tokenSim,
  nameIdentity,
  numberIdentity,
  identityAgainst,
  isGenericToken,
  GENERIC_WORDS,
};
