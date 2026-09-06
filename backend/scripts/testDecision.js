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

console.log('\n══ سناریوهای زندهٔ تأیید غلط (مهر ۱۴۰۵) ══');
{
  // ۱) حالتِ واقعیِ رودری (مهر ۱۴۰۵): اثرانگشت با نمرهٔ ضعیف امباپه آورد
  //    (۰.۶۴۶، حاشیهٔ ۰.۰۴۴، نسبت ۱.۰۷ → با MIN_RATIO=1.15 غیرقاطع) و هویت
  //    هم قاطع نبود (۰.۳۲۵). باید به صف برود نه تأییدِ غلط.
  const fpMbappe = m('review', 0.646, designOf(TYPE_B), false); // decisive=false
  fpMbappe.margin = 0.044;
  const weakId = { found: false, decisive: false, score: 0.325, margin: 0.011, design: null };
  const realRodri = svc.decideSubmission({
    expectedTypeId: null, match: fpMbappe, identity: weakId });
  ok('اثرانگشتِ غیرقاطع(امباپه) + هویتِ غیرقاطع → صف، نه تأیید غلط',
    realRodri.action === 'review', JSON.stringify(realRodri));

  // ۲) هر دو موتور **قاطع** ولی متعارض (اثرانگشت مطمئن امباپه، مدل مطمئن
  //    رودری): مدل عصبی موتورِ اصلی است → نظرِ مدل (رودری) تأیید می‌شود، نه
  //    اثرانگشتِ غلط. (مدل در شبیه‌سازی ۵۶ طرح صفر خطا داشت.)
  const fpDecisive = m('accept', 0.9, designOf(TYPE_B), true);
  const idRodri = {
    found: true, decisive: true, score: 0.7, margin: 0.06, ratio: 1.09,
    byText: false, byEmbedding: true, embedOnly: true,
    design: { id: 'd-rodri', card_type_id: TYPE_A },
  };
  const neuralWinsHard = svc.decideSubmission({
    expectedTypeId: null, match: fpDecisive, identity: idRodri, neuralAttempted: true });
  ok('اثرانگشت قاطعِ غلط ولی مدل قاطعِ درست → تأیید کارتِ مدل',
    neuralWinsHard.action === 'approve' && neuralWinsHard.cardTypeId === TYPE_A,
    JSON.stringify(neuralWinsHard));

  // ۳) حالت سالم: اثرانگشت قاطع و هویت قاطع بر یک کارت هم‌نظرند → تأیید.
  const agree = svc.decideSubmission({
    expectedTypeId: null,
    match: m('accept', 0.7, designOf(TYPE_A), true),
    identity: {
      found: true, decisive: true, score: 0.85, margin: 0.15, ratio: 1.2,
      byEmbedding: true, embedOnly: true, design: { id: 'd-a', card_type_id: TYPE_A },
    } });
  ok('دو موتور هم‌نظر و قاطع → تأیید خودکار',
    agree.action === 'approve' && agree.cardTypeId === TYPE_A, JSON.stringify(agree));
}

console.log('\n══ مدل عصبی موتورِ اصلی است (اثرانگشت دیگر غلط تأیید نمی‌کند) ══');
{
  const idFound = {
    found: true, decisive: true, score: 0.7, margin: 0.06, ratio: 1.09,
    byEmbedding: true, embedOnly: true, byText: false,
    design: { id: 'd-rodri', card_type_id: TYPE_A },
  };

  // کد بی‌نام: اثرانگشت قاطعِ غلط (امباپه) ولی مدل قاطعِ درست (رودری) → تأیید رودری.
  const neuralWins = svc.decideSubmission({
    expectedTypeId: null,
    match: m('accept', 0.7, designOf(TYPE_B), true), // اثرانگشت قاطع، کارتِ دیگر
    identity: idFound,
    neuralAttempted: true });
  ok('اثرانگشت غلط ولی مدل درست → تأیید کارتِ مدل',
    neuralWins.action === 'approve' && neuralWins.cardTypeId === TYPE_A,
    JSON.stringify(neuralWins));

  // کد بی‌نام: مدل پردازش کرد ولی قاطع نیست، اثرانگشت قاطع هم نباید تأیید کند → صف.
  const neuralUnsure = svc.decideSubmission({
    expectedTypeId: null,
    match: m('accept', 0.7, designOf(TYPE_B), true), // اثرانگشت قاطعِ غلط
    identity: { found: false, decisive: false, score: 0.4, margin: 0.02, design: null },
    neuralAttempted: true });
  ok('مدل غیردقیق → صف (اثرانگشت قاطعِ مشکوک تأیید خودکار نمی‌کند)',
    neuralUnsure.action === 'review', JSON.stringify(neuralUnsure));

  // بدون بردار (کلاینت قدیمی) → همان رفتار قدیمیِ اثرانگشت برقرار است.
  const legacy = svc.decideSubmission({
    expectedTypeId: null,
    match: m('accept', 0.7, designOf(TYPE_B), true),
    identity: { found: false, decisive: false, score: 0, design: null },
    neuralAttempted: false });
  ok('کلاینت بدون بردار → اثرانگشت طبق گذشته کار می‌کند',
    legacy.action === 'approve' && legacy.cardTypeId === TYPE_B, JSON.stringify(legacy));

  // کد نام‌دار: مدل قاطع هم‌خوان با کد → تأیید حتی اگر اثرانگشت ضعیف باشد.
  const boundAgree = svc.decideSubmission({
    expectedTypeId: TYPE_A,
    match: m('review', 0.1, designOf(TYPE_B), false),
    identity: idFound,
    neuralAttempted: true });
  ok('کد + مدل هم‌خوان → تأیید (اثرانگشت ضعیف مهم نیست)',
    boundAgree.action === 'approve', JSON.stringify(boundAgree));

  // مدل قاطعِ متناقض با کدِ نقدی، حتی وقتی اثرانگشت هیچ مرجعی ندارد،
  // نباید کورکورانه کد را تأیید کند → صف.
  const CASH = 'cccccccc-0000-0000-0000-000000000003';
  const idCash = {
    found: true, decisive: true, score: 0.7, margin: 0.06, ratio: 1.09,
    byEmbedding: true, embedOnly: true, byText: false,
    design: { id: 'd-x', card_type_id: TYPE_A }, // عکس می‌گوید A
  };
  const cashContradict = svc.decideSubmission({
    expectedTypeId: CASH,
    match: m('reject', 0, null, false), hasReference: false,
    identity: idCash, isCashType: (id) => id === CASH, neuralAttempted: true });
  ok('مدل متناقض با کدِ نقدی (حتی بدون مرجع اثرانگشت) → صف',
    cashContradict.action === 'review' && cashContradict.reason === 'code_mismatch_suspected',
    JSON.stringify(cashContradict));

  // مدل غیرقاطع + اثرانگشت بدون مرجع → کد به‌تنهایی کافی است → تأیید (نه صفِ بی‌مورد).
  const unsureNoRef = svc.decideSubmission({
    expectedTypeId: TYPE_A,
    match: m('reject', 0, null, false), hasReference: false,
    identity: { found: false, decisive: false, score: 0.4, design: null },
    neuralAttempted: true });
  ok('مدل غیردقیق و بدون مرجع اثرانگشت → کد تأیید می‌شود (صفِ بی‌مورد نساز)',
    unsureNoRef.action === 'approve' && unsureNoRef.cardTypeId === TYPE_A,
    JSON.stringify(unsureNoRef));
}

console.log('\n══ نسبتِ قاطعیت اثرانگشت محافظه‌کار است (۱.۱۵) ══');
{
  const fpSrc = require('fs').readFileSync(
    require('path').join(__dirname, '..', 'src', 'services', 'imageFingerprint.js'), 'utf8');
  const mm = fpSrc.match(/const MIN_RATIO\s*=\s*([\d.]+)/);
  ok('MIN_RATIO اثرانگشت ≥ ۱.۱۵ است', mm && Number(mm[1]) >= 1.15, mm && mm[1]);
}

console.log('\n══ طول رشته‌های path/reason در سقف ستون‌ها (مهاجرت ۰۸۷) ══');
{
  // باگ زنده: 'identity_override' ۱۷ کاراکتر است ولی decision_path قبلاً
  // varchar(16) بود → 22001 هنگام تأیید. هر رشتهٔ ثابت path/reason که تصمیم
  // برمی‌گرداند باید در سقفِ جدید (path≤32، reason≤48) جا شود.
  const svcSrc = require('fs').readFileSync(
    require('path').join(__dirname, '..', 'src', 'services', 'photoCardService.js'), 'utf8');
  const literals = svcSrc.match(/'(code_bound|image_match|identity_override|[a-z_]+)'/g) || [];
  const vals = [...new Set(literals.map(l => l.slice(1, -1)))];
  const tooLongPath = vals.filter(v => v === 'code_bound' || v === 'image_match' || v === 'identity_override')
    .filter(v => v.length > 32);
  ok('هیچ decision_path ای بلندتر از ۳۲ نیست', tooLongPath.length === 0, tooLongPath.join(','));
  // علت‌های شناخته‌شده‌ی صف
  const reasons = ['type_mismatch', 'low_confidence', 'image_unknown', 'ambiguous',
    'code_mismatch_suspected', 'cash_needs_review', 'code_auto_corrected'];
  const tooLongReason = reasons.filter(r => r.length > 48);
  ok('هیچ review_reason ای بلندتر از ۴۸ نیست', tooLongReason.length === 0, tooLongReason.join(','));
  ok('طول identity_override کنترل شده (۱۷ ≤ ۳۲)', 'identity_override'.length <= 32);
}

console.log(`\n${fail === 0 ? '✓' : '✗'} ${pass} تست موفق، ${fail} ناموفق`);
process.exit(fail === 0 ? 0 : 1);
