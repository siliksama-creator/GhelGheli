/**
 * منطقِ تصمیمِ ثبتِ کارت — ادغامِ «کدِ نام‌دار» و «کدِ بی‌نام».
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * چه چیزی اینجا سنجیده می‌شود
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `decideSubmission` تنها جایی است که سرنوشتِ یک ثبت تعیین می‌شود. اگر
 * اشتباه کند دو فاجعهٔ متفاوت ممکن است:
 *
 *   • خیلی سخت‌گیر → کاربری که کارتِ واقعی خریده به صف بررسی می‌رود.
 *     کارِ دستیِ مدیر زیاد می‌شود؛ دقیقاً همان چیزی که قرار بود حل شود.
 *
 *   • خیلی آسان‌گیر → کسی بدون کارت امتیاز می‌گیرد، یا امتیازِ کارتِ
 *     گران‌تر از آنچه دارد.
 *
 * چون تابع **خالص** است (هیچ I/O ندارد)، همهٔ شاخه‌ها مستقیم و سریع
 * سنجیده می‌شوند — بدون دیتابیس، بدون تصویرِ واقعی.
 */
const svc = require('../src/services/photoCardService');

let pass = 0; let fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass += 1; console.log('  ✓', name); } else {
    fail += 1; console.log('  ✗', name, detail ? `→ ${detail}` : '');
  }
};

const TYPE_A = 'aaaaaaaa-0000-0000-0000-000000000001';
const TYPE_B = 'bbbbbbbb-0000-0000-0000-000000000002';
const designOf = (typeId, id = 'd1') => ({ id, card_type_id: typeId });

/** ساختِ خروجیِ جعلیِ موتورِ تصویر. */
const m = (verdict, score, design = null, decisive = true) =>
  ({ verdict, score, design, margin: 0.1, decisive });

console.log('\n══ کدِ نام‌دار: عکس فقط باید ثابت کند کارت در دست است ══');

{
  // شباهتِ ضعیف ولی بالای آستانه، و همان کارت.
  const d = svc.decideSubmission({
    expectedTypeId: TYPE_A, match: m('review', 0.22, designOf(TYPE_A)) });
  ok('۲۲٪ شباهت با همان کارت → تأیید خودکار', d.action === 'approve', JSON.stringify(d));
  ok('نوعِ کارت از خودِ کد می‌آید', d.cardTypeId === TYPE_A);
  ok('مسیر code_bound ثبت می‌شود', d.path === 'code_bound');
}

{
  // موتور اصلاً چیزی نشناخت (verdict=reject) ولی نمرهٔ خام کافی است.
  const d = svc.decideSubmission({
    expectedTypeId: TYPE_A, match: m('reject', 0.25, designOf(TYPE_A)) });
  ok('verdictِ reject مانعِ کدِ نام‌دار نمی‌شود', d.action === 'approve',
    JSON.stringify(d));
}

{
  // کاتالوگ کاملاً خالی است.
  const d = svc.decideSubmission({
    expectedTypeId: TYPE_A, match: m('reject', 0, null), hasReference: false });
  ok('بدونِ هیچ طرحِ مرجع هم تأیید می‌شود', d.action === 'approve',
    JSON.stringify(d));
  ok('و design برابر null است', d.design === null);
  ok('ولی نوعِ کارت معلوم است', d.cardTypeId === TYPE_A);
}

{
  // ⚠️ باگی که فقط تستِ زنده گرفت.
  //
  // کاتالوگ **پر** است ولی هیچ طرحی برای این کارتِ خاص ندارد. موتور
  // بهترینِ کلِ کاتالوگ را می‌دهد — یعنی طرحِ یک کارتِ دیگر، شاید با
  // نمرهٔ بالا. بدونِ `hasReference` این «تناقض» تفسیر می‌شد و پرونده
  // با علتِ type_mismatch به صف می‌رفت، برای کارتی که اصلاً عکسِ
  // مرجعی ندارد و مقایسه بی‌معنی است.
  const d = svc.decideSubmission({
    expectedTypeId: TYPE_A,
    match: m('accept', 0.82, designOf(TYPE_B, 'dB')),
    hasReference: false,
  });
  ok('کاتالوگِ پر ولی بدونِ طرحِ این کارت → تأیید، نه تناقض',
    d.action === 'approve', JSON.stringify(d));
  ok('و کارتِ درست داده می‌شود', d.cardTypeId === TYPE_A);
}

{
  const d = svc.decideSubmission({
    expectedTypeId: TYPE_A, match: m('reject', 0.19, designOf(TYPE_A)) });
  ok('۱۹٪ (زیرِ آستانه) → صف بررسی', d.action === 'review', JSON.stringify(d));
  ok('علتش low_confidence است', d.reason === 'low_confidence');
  ok('نوعِ کارت برای مدیر حفظ می‌شود', d.cardTypeId === TYPE_A);
}

{
  // مرزِ دقیق.
  const at = svc.decideSubmission({
    expectedTypeId: TYPE_A, match: m('review', 0.20, designOf(TYPE_A)) });
  ok('دقیقاً ۰.۲۰ پذیرفته می‌شود (>=)', at.action === 'approve');
  const below = svc.decideSubmission({
    expectedTypeId: TYPE_A, match: m('review', 0.1999, designOf(TYPE_A)) });
  ok('۰.۱۹۹۹ پذیرفته نمی‌شود', below.action === 'review');
}

console.log('\n══ تناقضِ کد و عکس — خطرناک‌ترین حالت ══');

{
  // کد می‌گوید A، عکس با اطمینان B را نشان می‌دهد.
  const d = svc.decideSubmission({
    expectedTypeId: TYPE_A, match: m('accept', 0.88, designOf(TYPE_B, 'dB')) });
  ok('عکسِ کارتِ دیگر با اطمینان بالا → صف بررسی نه تأیید',
    d.action === 'review', JSON.stringify(d));
  ok('علتش type_mismatch است', d.reason === 'type_mismatch', d.reason);
  ok('کارتِ B بی‌سروصدا داده نمی‌شود', d.cardTypeId === TYPE_A);
}

{
  // نمره بالای آستانهٔ نرم است و موتور قاطع → این واقعاً تناقض است،
  // حتی اگر نمرهٔ مطلق پایین باشد. عکسی که از زاویهٔ بد گرفته شده
  // نمره‌اش می‌افتد ولی هنوز واضح کارتِ دیگری است.
  const d = svc.decideSubmission({
    expectedTypeId: TYPE_A, match: m('review', 0.30, designOf(TYPE_B, 'dB')) });
  ok('تطبیقِ بالای آستانه با کارتِ دیگر → بررسی', d.action === 'review');
  ok('و type_mismatch علامت می‌خورد', d.reason === 'type_mismatch', d.reason);
}

{
  // ولی اگر موتور **قاطع نباشد**، ادعای «کارتِ دیگری است» بی‌پایه
  // می‌شود: خودِ موتور نمی‌داند کدام است.
  const d = svc.decideSubmission({
    expectedTypeId: TYPE_A,
    match: m('review', 0.30, designOf(TYPE_B, 'dB'), false) });
  ok('تطبیقِ غیرقاطع با کارتِ دیگر → low_confidence نه تناقض',
    d.reason === 'low_confidence', d.reason);
}

{
  // زیرِ آستانهٔ نرم: «کیفیتِ پایین» توضیحِ محتمل‌تری است.
  const d = svc.decideSubmission({
    expectedTypeId: TYPE_A, match: m('review', 0.12, designOf(TYPE_B, 'dB')) });
  ok('تطبیقِ زیرِ آستانه با کارتِ دیگر → low_confidence',
    d.reason === 'low_confidence', d.reason);
}

console.log('\n══ کدِ بی‌نام: آستانهٔ ۴۰٪ + شرطِ قاطعیت ══');

{
  const d = svc.decideSubmission({
    expectedTypeId: null, match: m('accept', 0.70, designOf(TYPE_A)) });
  ok('۷۰٪ و قاطع → تأیید خودکار', d.action === 'approve', JSON.stringify(d));
  ok('نوعِ کارت از طرحِ تطبیق‌خورده می‌آید', d.cardTypeId === TYPE_A);
  ok('مسیر image_match است', d.path === 'image_match');
}

{
  // گاردِ پول در حالتِ کدِ بی‌نام: کارتِ نقدی با وجود اطمینانِ بالا نباید
  // خودکار تأیید شود (پول بدون تأیید انسان جابه‌جا نشود) → صف برای ادمین.
  const d = svc.decideSubmission({
    expectedTypeId: null,
    match: m('accept', 0.80, designOf(TYPE_A)),
    isCashType: (id) => id === TYPE_A,
  });
  ok('کدِ بی‌نام + کارتِ نقدیِ قاطع → صف ادمین', d.action === 'review',
    JSON.stringify(d));
  ok('علت cash_needs_review است', d.reason === 'cash_needs_review', d.reason);
  // کارتِ غیرنقدی با همان شرایط خودکار تأیید می‌شود.
  const e = svc.decideSubmission({
    expectedTypeId: null,
    match: m('accept', 0.80, designOf(TYPE_A)),
    isCashType: () => false,
  });
  ok('کدِ بی‌نام + کارتِ غیرنقدیِ قاطع → تأیید خودکار', e.action === 'approve');
}

{
  // خواستهٔ صریح مالک: «بیش از ۴۰ درصد → اتوماتیک».
  const d = svc.decideSubmission({
    expectedTypeId: null, match: m('review', 0.42, designOf(TYPE_A)) });
  ok('۴۲٪ تأیید می‌شود (verdict قدیمی review بود)',
    d.action === 'approve', JSON.stringify(d));
}

{
  const at = svc.decideSubmission({
    expectedTypeId: null, match: m('review', 0.40, designOf(TYPE_A)) });
  ok('دقیقاً ۴۰٪ پذیرفته می‌شود (>=)', at.action === 'approve');
  const below = svc.decideSubmission({
    expectedTypeId: null, match: m('review', 0.3999, designOf(TYPE_A)) });
  ok('۳۹.۹۹٪ به صف بررسی می‌رود', below.action === 'review');
}

{
  // ⚠️ مهم‌ترین محافظ: نمره کافی است ولی موتور بین دو گزینه شک دارد.
  //
  // در مسیرِ بی‌نام، عکس باید **هویتِ کارت** را تعیین کند. اگر دو طرح
  // هر دو ۰.۴۵ بگیرند، تأییدِ خودکار یعنی انتخابِ تصادفی و کاربر
  // امتیازِ کارتِ اشتباه می‌گیرد.
  const d = svc.decideSubmission({
    expectedTypeId: null,
    match: m('review', 0.60, designOf(TYPE_A), false) });
  ok('نمرهٔ بالا ولی غیرقاطع → صف بررسی', d.action === 'review',
    JSON.stringify(d));
  ok('علتش ambiguous است تا مدیر بداند چرا', d.reason === 'ambiguous',
    d.reason);
}

{
  const d = svc.decideSubmission({
    expectedTypeId: null, match: m('reject', 0.30, designOf(TYPE_A)) });
  ok('۳۰٪ → صف بررسی', d.action === 'review');
  ok('علت low_confidence (شبیه هست ولی کم)',
    d.reason === 'low_confidence', d.reason);
}

{
  const d = svc.decideSubmission({
    expectedTypeId: null, match: m('reject', 0.05, designOf(TYPE_A)) });
  ok('۵٪ → image_unknown (اصلاً شبیه نیست)',
    d.reason === 'image_unknown', d.reason);
}

{
  // رگرسیون: آستانهٔ نرمِ کدِ نام‌دار نباید به مسیرِ بی‌نام نشت کند.
  const d = svc.decideSubmission({
    expectedTypeId: null, match: m('review', 0.25, designOf(TYPE_A)) });
  ok('آستانهٔ ۲۰٪ به مسیرِ بی‌نام نشت نمی‌کند', d.action === 'review',
    JSON.stringify(d));
}

console.log('\n══ ورودی‌های خراب کرش نمی‌دهند ══');

{
  ok('بدونِ آرگومان', svc.decideSubmission().action === 'review');
  ok('match تهی', svc.decideSubmission({ match: null }).action === 'review');
  ok('match بدونِ design',
    svc.decideSubmission({ match: { verdict: 'accept', score: 0.9 } }).action === 'review');
  ok('score رشته‌ای',
    svc.decideSubmission({ expectedTypeId: TYPE_A,
      match: { verdict: 'review', score: '0.5', design: designOf(TYPE_A),
        decisive: true } }).action === 'approve');
  ok('score نامعتبر → بررسی',
    svc.decideSubmission({ expectedTypeId: TYPE_A,
      match: { verdict: 'review', score: NaN, design: designOf(TYPE_A) } })
      .action === 'review');
}

console.log('\n══ آستانه قابل تنظیم است ══');
{
  const strict = svc.decideSubmission({
    expectedTypeId: TYPE_A, boundThreshold: 0.5,
    match: m('review', 0.30, designOf(TYPE_A)) });
  ok('با آستانهٔ ۰.۵، نمرهٔ ۰.۳ رد می‌شود', strict.action === 'review');
  ok('آستانهٔ کدِ نام‌دار ۰.۲۰ است', svc.BOUND_ACCEPT_SCORE === 0.20);
  ok('آستانهٔ کدِ بی‌نام ۰.۴۰ است', svc.FREE_ACCEPT_SCORE === 0.40);
  const strictFree = svc.decideSubmission({
    expectedTypeId: null, freeThreshold: 0.8,
    match: m('review', 0.50, designOf(TYPE_A)) });
  ok('آستانهٔ بی‌نام هم قابل تنظیم است', strictFree.action === 'review');
}

console.log(`\n${fail === 0 ? '✓' : '✗'} ${pass} تست موفق، ${fail} ناموفق`);
process.exit(fail === 0 ? 0 : 1);
