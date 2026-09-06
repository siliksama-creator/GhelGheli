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

const { nameIdentity, nameFragment, nameEvidence, numberIdentity } = require('./playerIdentity');

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
  //
  // ⚠️ باگِ مهم (مهر ۱۴۰۵، کارتِ پشتِ رودری با دوربینِ متوسط):
  // روی عکسِ پشت، OCR واژه‌های پراکنده می‌خواند ولی نامِ هیچ بازیکنی را واقعاً
  // تطبیق نمی‌دهد. در این حالت nameIdentity به‌جای «بی‌اطلاع» عدد ۰ برمی‌گرداند؛
  // نسخهٔ قبل آن ۰ را «متنِ مطمئن» فرض می‌کرد و با ضریبِ ۰.۶۲ نمرهٔ بردارِ قوی
  // را خرد می‌کرد (۰.۷۶۲ → ۰.۳۳۵، حاشیه ۰.۰۸۳ → ۰.۰۱۶) و یک تشخیصِ واضح به صف
  // می‌رفت و پیشنهادِ اشتباه نشان می‌داد.
  //
  // قانون درست: فقط وقتی متن **نامِ بازیکنی را با اطمینان خوانده** (نمرهٔ
  // نام بالاتر از آستانهٔ معنادار) در فیوژن شرکت می‌کند؛ یک تطبیقِ ضعیف/صفر
  // یعنی «متن چیزی نگفته» و باید کنار گذاشته شود تا بردار خام بماند.
  const TEXT_CONFIDENT = 0.6;
  const hasText = textScore != null && textScore >= TEXT_CONFIDENT;

  let score;
  let byText = false;
  let byEmbedding = false;
  if (hasText && embed != null) {
    // نامِ مطمئن روی کارت، قطعی‌ترین سیگنال است؛ بردار وزنِ مکمل می‌گیرد.
    score = 0.62 * textScore + 0.38 * Math.max(0, (embed + 1) / 2);
    byText = true; byEmbedding = true;
  } else if (hasText) {
    score = textScore;
    byText = true;
  } else if (embed != null) {
    // فقط بردار عصبی (یا متنِ نامطمئن که عمداً نادیده گرفته شد): امتیاز روی
    // **کسینوسِ خام** می‌ماند. rankIdentity حاشیه/نسبت را روی همین مقیاس می‌سنجد.
    score = embed;
    byEmbedding = true;
  } else {
    score = 0;
  }

  // شاهدِ مستقلِ نام (بدون گیتِ متن، برای اجماع با مدل بصری در rankIdentity):
  //   frag = شباهتِ خامِ نام‌خانوادگی؛ ev = بهترین تطبیق به هر واژه (اسم‌کوچک
  //   یا نام‌خانوادگی) — برای حالت «نام‌خانوادگی تار، اسم‌کوچک واضح».
  const frag = nameFragment(query?.textTokens, design?.playerLexemes);
  const ev = nameEvidence(query?.textTokens, design?.playerLexemes);
  const evScore = ev ? ev.score : null;
  const evWord = ev ? ev.word : null;

  return {
    score: Math.max(0, Math.min(1, score)),
    byText, byEmbedding,
    name: textScore, embed,
    frag,
    ev: evScore,
    evWord,
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
  // آستانه‌های مسیرِ فقط-بردار از روی دو منبع کالیبره شد:
  //   • شبیه‌سازیِ ۵۶ طرح (رو/پشت) × ۵ تخریب: در همهٔ ۲۸۰ حالت رتبه‌اول بازیکن
  //     درست بود، حتی تا حاشیهٔ ۰.۰۲؛ پس کفِ حاشیه را خیلی پایین امن کردیم.
  //   • دادهٔ واقعی: حاشیه‌های عکسِ واقعیِ کاربر (مستقل از عکس مرجع) کوچک‌ترند،
  //     پایین‌ترینِ درست حدود ۰.۰۴۴ (پشتِ رودری). حاشیهٔ ۰.۰۳۵ این‌ها را خودکار
  //     می‌کند و همچنان با ضریب امن بالای مرز نویز است.
  // حاشیه نسبت به نزدیک‌ترین بازیکنِ دیگر سنجیده می‌شود.
  const EMBED_ACCEPT = th.embedAccept ?? 0.55;
  const EMBED_MIN_MARGIN = th.embedMinMargin ?? 0.035;
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
  // قوتِ شاهدِ نام برای هر ردیف: بهترین تطبیقِ توکن‌های OCR به اسم‌کوچک یا
  // نام‌خانوادگیِ آن بازیکن (ev تطبیقِ کامل، frag نام‌خانوادگیِ نیمه‌خوانده).
  const nameHit = r => Math.max(r.frag ?? 0, r.ev ?? 0);
  const samePlayerRows = (a, b) =>
    (a?.design?.playerLexemes || []).slice().sort().join(',') ===
    (b?.design?.playerLexemes || []).slice().sort().join(',');

  // ── نجات با نام: تساویِ بصری + نامِ قاطع ──
  //
  // روی عکسِ کادربندی‌شده/تار گاهی بردارِ عصبی بازیکنِ درست را فقط یک‌ذره پشتِ
  // بازیکنِ دیگری می‌گذارد (مثلاً EMILIANO MARTÍNEZ: بصری چرکی ۰.۶۳۸ در برابر
  // مارتینز ۰.۶۱۶، اختلاف ۰.۰۲۲) ولی نامِ روی کارت واضح است (OCR «EMILIANO»
  // کامل خوانده شد). در فاصلهٔ کوچکِ بصری، نام برنده را تعیین می‌کند.
  //
  // محافظه‌کارانه — فقط در رژیمِ بصری (کسینوسِ خام) و با هر سه شرط:
  //   الف) بازیکنِ نام‌زده از نظر بصری هم در کورس است (فاصلهٔ امتیازِ بردار تا
  //        بهترین بصری ≤ ۰.۰۵)؛ اگر بصری اصلاً او را نشان ندهد دخالت نمی‌کنیم؛
  //   ب) نامش قوی بخورد (تطبیق کاملِ اسم ≥۰.۷۵ یا نام‌خانوادگی ≥۰.۵)؛
  //   ج) هیچ بازیکنِ دیگری آن‌قدر نام نخورده باشد (فاصلهٔ نام تا نفر بعد ≥۰.۲).
  let nameRescued = false;
  {
    const visRows = ranked.filter(r => r.byEmbedding && r.embed != null);
    if (visRows.length) {
      const visMax = Math.max(...visRows.map(r => r.embed));
      const near = visRows.filter(r => visMax - r.embed <= 0.05);
      let cand = null;
      for (const r of near) {
        const strong = (r.ev ?? 0) >= 0.75 || (r.frag ?? 0) >= 0.5;
        if (strong && (!cand || nameHit(r) > nameHit(cand))) cand = r;
      }
      if (cand) {
        const otherBest = visRows
          .filter(r => !samePlayerRows(r, cand))
          .reduce((m, r) => Math.max(m, nameHit(r)), 0);
        if (nameHit(cand) - otherBest >= 0.2) {
          if (cand !== ranked[0]) {
            ranked.splice(ranked.indexOf(cand), 1); ranked.unshift(cand);
          }
          nameRescued = true;
        }
      }
    }
  }

  const winner = ranked[0];
  const rivalR = ranked.slice(1).find(r => !isSamePlayer(r.design));
  const rivalScore = rivalR ? rivalR.score : 0;
  const visMargin = rivalR ? winner.score - rivalR.score : 1;
  const visRatio = rivalR && rivalR.score > 1e-6 ? winner.score / rivalR.score : 99;

  // مسیرِ فقط-بردار (بدون متن) آستانه‌های خودش را دارد؛ مسیر متنی همان ۰.۷۸.
  const embedOnly = winner.byEmbedding && !winner.byText;
  const acceptCut = embedOnly ? EMBED_ACCEPT : ACCEPT;
  let marginCut = embedOnly ? EMBED_MIN_MARGIN : (th.minMargin ?? 0.15);
  let ratioCut = embedOnly ? 1.06 : MIN_RATIO;

  // ── اجماعِ «مدل بصری + نام» وقتی نام رتبهٔ اول را تأیید می‌کند ──
  // نامِ نیمه‌خوانده (مثل «ERKI» از CHERKI) یا اسمِ واضح، برندهٔ بصری را تأیید
  // می‌کند؛ آن‌وقت حاشیهٔ لازم پایین می‌آید چون دو سیگنالِ مستقل هم‌نظرند.
  let nameCorroborated = false;
  if (!nameRescued && embedOnly) {
    const wHit = nameHit(winner);
    const rHit = rivalR ? nameHit(rivalR) : 0;
    if (wHit >= 0.5 && (wHit - rHit) >= 0.2) {
      nameCorroborated = true;
      marginCut = 0.015; ratioCut = 1.02;
    }
  }

  // حاشیه/نمره‌ای که گزارش می‌شود: در حالتِ نجات، نام تصمیم گرفته پس حاشیه بر
  // مبنای فاصلهٔ نام تا **همهٔ بازیکنانِ دیگر** (صرف‌نظر از رتبهٔ بصری‌شان) است
  // تا برنده‌ای که یک رقیبِ بصریِ کمی‌بالاتر داشته هم حاشیهٔ واقعی بدهد.
  let outMargin, outRatio, outScore;
  if (nameRescued) {
    const wHit = nameHit(winner);
    const rHit = ranked
      .filter(r => !samePlayerRows(r, winner))
      .reduce((m, r) => Math.max(m, nameHit(r)), 0);
    outMargin = wHit - rHit; outRatio = 99; outScore = winner.score;
  } else {
    outMargin = visMargin; outRatio = visRatio; outScore = winner.score;
  }

  const decisive = nameRescued
    ? true
    : winner.score >= acceptCut && visMargin >= marginCut && visRatio >= ratioCut;

  return {
    found: decisive,
    decisive,
    score: outScore,
    margin: outMargin,
    ratio: Number.isFinite(outRatio) ? outRatio : 99,
    byText: winner.byText,
    byEmbedding: winner.byEmbedding,
    embedOnly,
    corroborated: nameCorroborated || nameRescued,
    nameRescued,
    design: winner.design,
    ranked: ranked.slice(0, 3),
  };
}

module.exports = {
  cosine,
  identityScore,
  rankIdentity,
};
