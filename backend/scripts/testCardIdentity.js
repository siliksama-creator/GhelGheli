/**
 * تستِ لایهٔ هویتِ کارت — واژه‌نامهٔ بازیکن (OCR فازی) + تصمیمِ اصلاحِ کد.
 *
 * دو چیز اینجا قفل می‌شود:
 *
 *   ۱) تطبیقِ فازیِ نام: نویزِ واقعیِ OCR روی کارت (`~EMBELE`, `HAALND`,
 *      `MBAPPE` با حروف کم) باید به بازیکنِ درست بند شود و هم‌تیمیِ
 *      هم‌رنگ/هم‌قالب (HAALAND در برابر RODRI) را قاطعانه تفکیک کند.
 *
 *   ۲) تصمیمِ یکپارچه: وقتی هویت قاطع با کد فرق می‌کند، کارتِ **غیرنقدی**
 *      خودکار به کارتِ درست اصلاح شود و کارتِ **نقدی** به صفِ ادمین برود.
 */
const assert = require('assert');
const pi = require('../src/services/playerIdentity');
const ci = require('../src/services/cardIdentity');
const svc = require('../src/services/photoCardService');

let pass = 0; let fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass += 1; console.log('  ✓', name); }
  else { fail += 1; console.log('  ✗', name, detail ? `→ ${detail}` : ''); }
};

console.log('\n== نرمال‌سازیِ نام ==');
ok('اعراب حذف می‌شوند (Dembélé→DEMBELE)', pi.normalizeName('Dembélé') === 'DEMBELE');
ok('نویز غیرحرفی حذف می‌شود (~HAALND!)', pi.normalizeName('~HAALND!') === 'HAALND');

console.log('\n== شباهت فازیِ توکن ==');
ok('EMBELE با DEMBELE خیلی نزدیک است', pi.tokenSim('EMBELE', 'DEMBELE') >= 0.85,
  `got ${pi.tokenSim('EMBELE', 'DEMBELE')}`);
ok('HAALND با HAALAND نزدیک است', pi.tokenSim('HAALND', 'HAALAND') >= 0.8,
  `got ${pi.tokenSim('HAALND', 'HAALAND')}`);
ok('HAALAND با RODRI دور است', pi.tokenSim('HAALAND', 'RODRI') < 0.5,
  `got ${pi.tokenSim('HAALAND', 'RODRI')}`);
ok('RAL داخل PORTUGAL عالی نمی‌شود (ضدتقلبِ زیررشته)', pi.tokenSim('RAL', 'PORTUGAL') < 0.6,
  `got ${pi.tokenSim('RAL', 'PORTUGAL')}`);

console.log('\n== امتیاز هویتِ نام ==');
// واژه‌نامه‌ها نرمال‌سازی می‌شوند؛ کارت رودری = RODRIGO HERNÁNDEZ (نام‌خانوادگی HERNANDEZ)
const LEX_HAALAND = ['erling', 'haaland'];
const LEX_RODRI = ['rodrigo', 'hernández'];
const LEX_DEMBELE = ['ousmane', 'dembélé'];

ok('OCR هالند به کارت هالند بالا می‌زند',
  pi.nameIdentity(['HAALAND', 'PREMIUM', 'CARD', 'ETIHAD'], LEX_HAALAND) >= 0.88);
ok('OCR هالند به کارت رودری صفر/کم است',
  (pi.nameIdentity(['HAALAND'], LEX_RODRI) ?? 1) <= 0.2);
ok('OCR تارِ EMBELE به دمبله می‌چسبد',
  pi.nameIdentity(['EMBELE'], LEX_DEMBELE) >= 0.85);
ok('بدون توکن → null (بی‌اطلاع)',
  pi.nameIdentity([], LEX_HAALAND) === null);

console.log('\n== شماره پیراهن (شکستنِ تساوی) ==');
ok('شماره موافق = ۱', pi.numberIdentity(['RONALDO', '#7'], '7') === 1);
ok('شماره مخالف = ۰', pi.numberIdentity(['RONALDO', '#9'], '7') === 0);
ok('بدون شماره = null', pi.numberIdentity(['RONALDO'], '7') === null);

console.log('\n== رتبه‌بندی هویت در میان کارت‌ها ==');
const designs = [
  { id: 'd-haaland', card_type_id: 'T-HAALAND', playerLexemes: LEX_HAALAND, playerNumber: '9' },
  { id: 'd-rodri', card_type_id: 'T-RODRI', playerLexemes: LEX_RODRI, playerNumber: '16' },
  { id: 'd-dembele', card_type_id: 'T-DEMBELE', playerLexemes: LEX_DEMBELE, playerNumber: '10' },
];

// سناریوی اصلی: عکس رودری، OCR خوانده RODRI/HERNANDEZ
const rRodri = pi.identityAgainst({
  textTokens: ['RODRI', 'HERNANDEZ', 'SPAIN', 'CITY', 'PREMIUM'], designs });
ok('عکس رودری، رودری را قاطعانه پیدا می‌کند', rRodri.found && rRodri.design.card_type_id === 'T-RODRI',
  `score=${rRodri.score} found=${rRodri.found} design=${rRodri.design.card_type_id}`);

// سناریوی هالند روی کتالوگ
const rHaaland = pi.identityAgainst({
  textTokens: ['HAALAND', 'NORWAY', 'ETIHAD'], designs });
ok('عکس هالند، هالند را پیدا می‌کند', rHaaland.found && rHaaland.design.card_type_id === 'T-HAALAND');

// متن فقط عمومی (PREMIUM/CARD) → هیچ هویتی
const rGeneric = pi.identityAgainst({ textTokens: ['PREMIUM', 'CARD'], designs });
ok('متن عمومی هیچ هویتی نمی‌دهد', !rGeneric.found && rGeneric.decisive === false);

console.log('\n== بردار عصبی (embedding) — افزونهٔ نصب‌نشده ==');
// شبیه‌سازی دو بردار: یکی نزدیک، یکی متعامد
const q = { textTokens: [], embedding: [1, 0, 0] };
ok('کسینوسِ هم‌جهت ≈ ۱', ci.cosine([1, 0, 0], [1, 0, 0]) > 0.99);
ok('کسینوسِ متعامد = ۰', Math.abs(ci.cosine([1, 0, 0], [0, 1, 0])) < 1e-9);
ok('طولِ نابرابر → null', ci.cosine([1, 0], [1, 0, 0]) === null);
const rEmb = ci.rankIdentity(
  { textTokens: [], embedding: [0.99, 0.14, 0], embeddingVersion: 2 },
  [{ id: 'a', card_type_id: 'T1', embedding: [1, 0, 0], embeddingVersion: 2 },
   { id: 'b', card_type_id: 'T2', embedding: [0, 1, 0], embeddingVersion: 2 }]);
ok('بدون متن، بردارِ عصبی قاطع انتخاب می‌کند', rEmb.found && rEmb.design.card_type_id === 'T1',
  `score=${rEmb.score}`);
// نسخه‌های ناسازگار نباید با هم مقایسه شوند (فضای برداری متفاوت).
const sameVer = ci.identityScore(
  { textTokens: [], embedding: [0.99, 0.14, 0], embeddingVersion: 2 },
  { embedding: [1, 0, 0], embeddingVersion: 2 });
ok('هم‌نسخه → بردار در امتیاز لحاظ می‌شود', sameVer.byEmbedding === true && sameVer.embed > 0.9);
const diffVer = ci.identityScore(
  { textTokens: [], embedding: [0.99, 0.14, 0], embeddingVersion: 1 },
  { embedding: [1, 0, 0], embeddingVersion: 2 });
ok('نسخهٔ بردارِ متفاوت → مقایسهٔ عصبی خاموش می‌شود', diffVer.byEmbedding === false && diffVer.embed === null);

console.log('\n== رگرسیونِ دادهٔ واقعی: هالندِ کمی‌تار (کسینوس خام) ==');
// سنجهٔ واقعی روی بردارِ ارسالیِ گوشی (مهر ۱۴۰۵): برنده هالند با کسینوسِ
// خامِ ۰.۸۴۵، نفر دوم یامال ۰.۷۲۹ (حاشیه ۰.۱۱۶، نسبت ۱.۱۶). کین ششم ۰.۶۵۸.
// قبلاً نگاشتِ (cos+1)/2 حاشیه را به ۰.۰۵۸ نصف می‌کرد و قاطعیت می‌مرد → پرونده
// با اثرانگشتِ مبهم به صف می‌رفت. بردارهایی با همان زاویهٔ کسینوس می‌سازیم.
function vecAtCos(base, c) {
  // بردار دوبُعدی که کسینوسش با base برابر c باشد.
  return [c, Math.sqrt(Math.max(0, 1 - c * c))];
}
const BASE = [1, 0];
const realRanks = ci.rankIdentity(
  { textTokens: [], embedding: BASE, embeddingVersion: 2 },
  [
    { id: 'haaland', card_type_id: 'T-HAALAND', embedding: vecAtCos(BASE, 0.845), embeddingVersion: 2 },
    { id: 'yamal', card_type_id: 'T-YAMAL', embedding: vecAtCos(BASE, 0.729), embeddingVersion: 2 },
    { id: 'salah', card_type_id: 'T-SALAH', embedding: vecAtCos(BASE, 0.708), embeddingVersion: 2 },
    { id: 'kane', card_type_id: 'T-KANE', embedding: vecAtCos(BASE, 0.658), embeddingVersion: 2 },
  ]);
ok('هالندِ واضح (کسینوس ۰.۸۴۵، حاشیه ۰.۱۱۶) قاطعانه یافت می‌شود',
  realRanks.found && realRanks.design.card_type_id === 'T-HAALAND',
  `found=${realRanks.found} score=${realRanks.score?.toFixed(3)} margin=${realRanks.margin?.toFixed(3)}`);

// حالات نزدیک‌به‌تساوی (کین ۰.۶۵۸، دو نامزد چسبیده) نباید قاطع شوند.
const tie = ci.rankIdentity(
  { textTokens: [], embedding: BASE, embeddingVersion: 2 },
  [
    { id: 'kane', card_type_id: 'T-KANE', embedding: vecAtCos(BASE, 0.66), embeddingVersion: 2 },
    { id: 'olise', card_type_id: 'T-OLISE', embedding: vecAtCos(BASE, 0.656), embeddingVersion: 2 },
  ]);
ok('دو نامزدِ چسبیده (حاشیه ~۰.۰۰۴، نمره پایین) قاطع نمی‌شوند → صف',
  !tie.found,
  `found=${tie.found} score=${tie.score?.toFixed(3)} margin=${tie.margin?.toFixed(3)}`);

// نمرهٔ بالا ولی حاشیهٔ کم (همان زوج‌های ۰.۹۰ کاتالوگ) هم باید احتیاط کنند.
const highTie = ci.rankIdentity(
  { textTokens: [], embedding: BASE, embeddingVersion: 2 },
  [
    { id: 'a', card_type_id: 'A', embedding: vecAtCos(BASE, 0.905), embeddingVersion: 2 },
    { id: 'b', card_type_id: 'B', embedding: vecAtCos(BASE, 0.90), embeddingVersion: 2 },
  ]);
ok('نمرهٔ بالا ولی حاشیهٔ کم (۰.۰۰۵) قاطع نمی‌شود',
  !highTie.found,
  `margin=${highTie.margin?.toFixed(3)}`);

console.log('\\n== رگرسیونِ واقعی: متنِ OCRِ بی‌ربط روی پشت، بردارِ قوی را خرد نکند ==');
// عکسِ پشتِ رودری با دوربینِ متوسط: بردار رودری ۰.۷۶۲، رقبا ~۰.۶۷؛ OCR چند
// واژهٔ پرتی دارد که نامِ هیچ بازیکنی را واقعاً نمی‌خواند (nameIdentity صفر).
// قبلاً فیوژنِ متن، نمره را به ۰.۳۳۵ و حاشیه را به ۰.۰۱۶ می‌رساند و به صف می‌رفت.
const backRodri = ci.rankIdentity(
  // توکن‌های OCRِ روی پشت: برند/کلماتِ عمومی، نه نام بازیکن.
  { textTokens: ['panini', 'fifa', 'club'], embedding: BASE, embeddingVersion: 2 },
  [
    { id: 'rodri', card_type_id: 'T-RODRI', playerLexemes: ['rodrigo', 'hernández'],
      embedding: vecAtCos(BASE, 0.762), embeddingVersion: 2 },
    { id: 'haaland', card_type_id: 'T-HAALAND', playerLexemes: ['erling', 'haaland'],
      embedding: vecAtCos(BASE, 0.679), embeddingVersion: 2 },
    { id: 'salah', card_type_id: 'T-SALAH', playerLexemes: ['mohamed', 'salah'],
      embedding: vecAtCos(BASE, 0.670), embeddingVersion: 2 },
  ]);
ok('بردار قویِ رودری با متنِ OCRِ بی‌ربط قاطع می‌ماند (مسیر بردار خام)',
  backRodri.found && backRodri.design.card_type_id === 'T-RODRI',
  `found=${backRodri.found} score=${backRodri.score?.toFixed(3)} margin=${backRodri.margin?.toFixed(3)} embedOnly=${backRodri.embedOnly}`);

console.log('\\n== اجماعِ مدل بصری + نامِ نیمه‌خوانده (عکس کادربندی‌شده/تار) ==');
// سناریوی واقعی چرکی: بردار چرکی ۰.۶۶۲ اول ولی حاشیه فقط ۰.۰۲۰ (صلاح ۰.۶۴۲)؛
// OCR «ERKI» خوانده (دو حرف اولِ CHERKI در سایه افتاده). هیچ نامی به‌تنهایی
// قاطع نیست (۰.۵۷ < ۰.۶)، ولی بردار و نام مستقلاً به چرکی اشاره می‌کنند.
const cherkiOcr = ['FRANCE', 'ERKI', '#2', '#5'];
const corr = ci.rankIdentity(
  { textTokens: cherkiOcr, embedding: BASE, embeddingVersion: 2 },
  [
    { id: 'cherki', card_type_id: 'T-CHERKI', playerLexemes: ['rayan', 'cherki'], playerNumber: '24',
      embedding: vecAtCos(BASE, 0.662), embeddingVersion: 2 },
    { id: 'salah', card_type_id: 'T-SALAH', playerLexemes: ['mohamed', 'salah'], playerNumber: '10',
      embedding: vecAtCos(BASE, 0.642), embeddingVersion: 2 },
    { id: 'rodri', card_type_id: 'T-RODRI', playerLexemes: ['rodrigo', 'hernández'], playerNumber: '16',
      embedding: vecAtCos(BASE, 0.603), embeddingVersion: 2 },
  ]);
ok('بردار چرکی با حاشیهٔ کم + نام ERKI (اجماع) → قاطعِ چرکی',
  corr.found && corr.design.card_type_id === 'T-CHERKI',
  `found=${corr.found} score=${corr.score?.toFixed(3)} margin=${corr.margin?.toFixed(3)}`);

// امنیت: همان بردارِ با حاشیهٔ کم ولی نامی نخوانده شده (اجماع نیست) → صف.
const noCorr = ci.rankIdentity(
  { textTokens: ['FRANCE', 'FIFA'], embedding: BASE, embeddingVersion: 2 },
  [
    { id: 'cherki', card_type_id: 'T-CHERKI', playerLexemes: ['rayan', 'cherki'],
      embedding: vecAtCos(BASE, 0.662), embeddingVersion: 2 },
    { id: 'salah', card_type_id: 'T-SALAH', playerLexemes: ['mohamed', 'salah'],
      embedding: vecAtCos(BASE, 0.642), embeddingVersion: 2 },
  ]);
ok('بردار با حاشیهٔ کم و بدون اجماع نام → قاطع نمی‌شود (صف)',
  !noCorr.found,
  `found=${noCorr.found} margin=${noCorr.margin?.toFixed(3)}`);

// امنیت ۲: نامِ مطمئنِ یک بازیکن برخلاف بردارِ قویِ بازیکنِ دیگر (تعارض واقعی)
// — بردار چرکی ۰.۸۰ قاطع ولی OCR واضح «SALAH» می‌خواند و بردارِ صلاح ضعیف
// (۰.۴۰) است؛ اجماع نیست و حاشیه کم می‌شود → صف، نه تأیید خودکار.
const conflicting = ci.rankIdentity(
  { textTokens: ['SALAH'], embedding: BASE, embeddingVersion: 2 },
  [
    { id: 'cherki', card_type_id: 'T-CHERKI', playerLexemes: ['rayan', 'cherki'],
      embedding: vecAtCos(BASE, 0.80), embeddingVersion: 2 },
    { id: 'salah', card_type_id: 'T-SALAH', playerLexemes: ['mohamed', 'salah'],
      embedding: vecAtCos(BASE, 0.40), embeddingVersion: 2 },
  ]);
ok('نام مطمئنِ خلاف بردار قوی (تعارض) → تأیید خودکار نمی‌کند (صف)',
  !conflicting.found,
  `found=${conflicting.found} top=${conflicting.design?.card_type_id} score=${conflicting.score?.toFixed(3)} margin=${conflicting.margin?.toFixed(3)}`);

// امنیت ۳: قطعه‌نامِ یک بازیکنِ دیگر جلوی اجماع را نگیرد به‌اشتباه — بردار
// چرکی اول، OCR «CHERKI» کامل را خوانده (textScore قوی) → قاطعِ چرکی.
const strongText = ci.rankIdentity(
  { textTokens: ['CHERKI', 'FRANCE'], embedding: BASE, embeddingVersion: 2 },
  [
    { id: 'cherki', card_type_id: 'T-CHERKI', playerLexemes: ['rayan', 'cherki'],
      embedding: vecAtCos(BASE, 0.66), embeddingVersion: 2 },
    { id: 'salah', card_type_id: 'T-SALAH', playerLexemes: ['mohamed', 'salah'],
      embedding: vecAtCos(BASE, 0.64), embeddingVersion: 2 },
  ]);
ok('نام کامل چرکی + بردار نزدیک → قاطعِ چرکی (مسیر متنی/اجماع)',
  strongText.found && strongText.design.card_type_id === 'T-CHERKI',
  `found=${strongText.found} score=${strongText.score?.toFixed(3)} byText=${strongText.byText}`);

console.log('\\n== نجات با نام: تساویِ بصری + اسم‌کوچکِ واضح (امیلیانو) ==');
// کارتِ دروازه‌بان EMILIANO MARTÍNEZ: بصری چرکی را یک‌ذره جلو انداخت (۰.۶۳۸)
// و امیلیانو ۰.۶۱۶ (اختلاف ۰.۰۲۲)؛ OCR اسم‌کوچکِ «EMILIANO» را کامل خواند.
const emiOcr = ['FIFA', 'EMILIANO', 'ARTIN', '#1', '#23'];
const emi = ci.rankIdentity(
  { textTokens: emiOcr, embedding: BASE, embeddingVersion: 2 },
  [
    { id: 'cherki', card_type_id: 'T-CHERKI', playerLexemes: ['rayan', 'cherki'],
      embedding: vecAtCos(BASE, 0.638), embeddingVersion: 2 },
    { id: 'emiliano', card_type_id: 'T-EMI', playerLexemes: ['emiliano', 'martinez'],
      embedding: vecAtCos(BASE, 0.616), embeddingVersion: 2 },
    { id: 'mbappe', card_type_id: 'T-MBAPPE', playerLexemes: ['kylian', 'mbappe'],
      embedding: vecAtCos(BASE, 0.605), embeddingVersion: 2 },
  ]);
ok('تساویِ بصری + اسم‌کوچکِ واضح EMILIANO → نجات به امیلیانو (قاطع)',
  emi.found && emi.design.card_type_id === 'T-EMI' && emi.nameRescued === true,
  `found=${emi.found} top=${emi.design?.card_type_id} margin=${emi.margin?.toFixed(3)} rescued=${emi.nameRescued}`);

// امنیت: اسم‌کوچکِ واضح برای بازیکنی که از نظر بصری اصلاً در کورس نیست
// (فاصلهٔ زیاد) نباید برنده را عوض کند → بصری قاطعِ خودش می‌ماند.
const farName = ci.rankIdentity(
  { textTokens: ['EMILIANO', '#23'], embedding: BASE, embeddingVersion: 2 },
  [
    { id: 'cherki', card_type_id: 'T-CHERKI', playerLexemes: ['rayan', 'cherki'],
      embedding: vecAtCos(BASE, 0.80), embeddingVersion: 2 },
    { id: 'emiliano', card_type_id: 'T-EMI', playerLexemes: ['emiliano', 'martinez'],
      embedding: vecAtCos(BASE, 0.30), embeddingVersion: 2 },
  ]);
ok('اسمِ واضحِ بازیکنِ دور از نظر بصری، برنده را عوض نمی‌کند (فقط کورس)',
  farName.design?.card_type_id === 'T-CHERKI',
  `top=${farName.design?.card_type_id} found=${farName.found}`);

console.log('\n== تصمیم یکپارچه (decideSubmission با هویت) ==');
const foundRodri = { found: true, decisive: true, score: 0.95, design: designs[1], byText: true, byEmbedding: false };
const foundHaaland = { found: true, decisive: true, score: 0.95, design: designs[0], byText: true, byEmbedding: false };

// ۱) کدِ هالند، عکس قاطعِ رودری، کارت غیرنقدی → اصلاحِ خودکار به رودری
//    (در مسیرِ کدِ نام‌دار path همان code_bound است و علت code_auto_corrected).
const d1 = svc.decideSubmission({
  expectedTypeId: 'T-HAALAND',
  match: { design: designs[1], score: 0.5, decisive: true },
  identity: foundRodri,
  isCashType: () => false,
});
ok('کدِ هالند + عکس رودریِ غیرنقدی → تأیید خودکارِ رودری (اصلاح کد)',
  d1.action === 'approve' && d1.cardTypeId === 'T-RODRI'
  && d1.path === 'code_bound' && d1.reason === 'code_auto_corrected',
  JSON.stringify(d1));

// ۲) همان، ولی **کدِ موردانتظار** نقدی است (حتی اگر عکس کارتِ امتیازی را
//    نشان دهد) → صف؛ محافظِ پول به کد نگاه می‌کند نه به نوعِ تشخیصِ عکس.
const d2 = svc.decideSubmission({
  expectedTypeId: 'T-HAALAND',
  match: { design: designs[1], score: 0.5, decisive: true },
  identity: foundRodri,
  isCashType: (id) => id === 'T-HAALAND',
});
ok('کدِ نقدی + عکس کارتِ دیگر → صف (پول بدون تأیید ادمین جابه‌جا نشود)',
  d2.action === 'review' && d2.reason === 'code_mismatch_suspected',
  JSON.stringify(d2));

// ۲ب) برعکسِ ۲: عکس یک کارتِ نقدی را نشان می‌دهد ولی کدِ موردانتظار امتیازی
//    است → باز هم صف، چون اصلاحِ خودکار به سمتِ کارتِ نقدی یعنی اعطای
//    خودکارِ اعتبارِ پولی بدون دیدنِ انسان.
const d2b = svc.decideSubmission({
  expectedTypeId: 'T-HAALAND',
  match: { design: designs[1], score: 0.5, decisive: true },
  identity: foundRodri,
  isCashType: (id) => id === 'T-RODRI',
});
ok('کدِ امتیازی + عکس کارتِ نقدیِ دیگر → صف (اعطای خودکارِ پول ممنوع)',
  d2b.action === 'review' && d2b.reason === 'code_mismatch_suspected',
  JSON.stringify(d2b));

// ۳) کد و هویت یکی → تأیید ساده
const d3 = svc.decideSubmission({
  expectedTypeId: 'T-HAALAND',
  match: { design: designs[0], score: 0.3, decisive: false },
  identity: foundHaaland,
  isCashType: () => false,
});
ok('کد و هویت هم‌خوان (حتی با تصویرِ کم‌شباهت) → تأیید',
  d3.action === 'approve' && d3.cardTypeId === 'T-HAALAND');

// ۴) بدون هویت → رفتار قدیمی دست‌نخورده (کد نام‌دار، عکس بلااستفاده)
const d4 = svc.decideSubmission({
  expectedTypeId: 'T-HAALAND',
  match: { design: null, score: 0 },
  hasReference: false,
  identity: null,
});
ok('بدون هویت/مرجع → رفتار قدیمی (کد حرف آخر را می‌زند)',
  d4.action === 'approve' && d4.cardTypeId === 'T-HAALAND');

// ۵) هویت قاطع نیست (مبهم) → مسیر قدیمی
const weak = { found: false, decisive: false, score: 0.5, design: designs[1] };
const d5 = svc.decideSubmission({
  expectedTypeId: 'T-HAALAND',
  match: { design: designs[1], score: 0.5, decisive: true },
  identity: weak,
  isCashType: () => false,
});
ok('هویت مبهم → تناقضِ تصویری قدیمی (type_mismatch → صف)',
  d5.action === 'review' && d5.reason === 'type_mismatch',
  JSON.stringify(d5));

console.log('\n══════════════════════════════════════════');
console.log(`  نتیجه: ${pass} موفق، ${fail} ناموفق`);
if (fail) process.exit(1);
console.log('  ✅ لایهٔ هویت کارت سالم است');
