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

console.log('\n== تصمیم یکپارچه (decideSubmission با هویت) ==');
const foundRodri = { found: true, decisive: true, score: 0.95, design: designs[1], byText: true, byEmbedding: false };
const foundHaaland = { found: true, decisive: true, score: 0.95, design: designs[0], byText: true, byEmbedding: false };

// ۱) کدِ هالند، عکس قاطعِ رودری، کارت غیرنقدی → اصلاحِ خودکار به رودری
const d1 = svc.decideSubmission({
  expectedTypeId: 'T-HAALAND',
  match: { design: designs[1], score: 0.5, decisive: true },
  identity: foundRodri,
  isCashType: () => false,
});
ok('کدِ هالند + عکس رودریِ غیرنقدی → تأیید خودکارِ رودری (اصلاح کد)',
  d1.action === 'approve' && d1.cardTypeId === 'T-RODRI' && d1.path === 'identity_override',
  JSON.stringify(d1));

// ۲) همان، ولی کارت رودری نقدی → صف با علت code_mismatch_suspected
const d2 = svc.decideSubmission({
  expectedTypeId: 'T-HAALAND',
  match: { design: designs[1], score: 0.5, decisive: true },
  identity: foundRodri,
  isCashType: (id) => id === 'T-RODRI',
});
ok('کدِ هالند + عکس رودریِ نقدی → صف (پول بدون تأیید ادمین جابه‌جا نشود)',
  d2.action === 'review' && d2.reason === 'code_mismatch_suspected',
  JSON.stringify(d2));

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
