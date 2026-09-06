/**
 * تستِ گیتِ بازبینیِ خودکارِ سرور (فاز ۴ — دولایه + برش چندگانه).
 *
 * خط‌قرمز: صفر تأییدِ اشتباه. قفل می‌کند:
 *   • لایهٔ A (card-only): بصری فوق‌قوی → تأیید، مگر تضادِ قاطعِ چهره.
 *   • لایهٔ B (card+face): بصری خوب + چهرهٔ یکتای پراطمینانِ موافق → تأیید.
 *   • بصری ضعیف/حاشیه‌کم → صف.
 *   • چهرهٔ مطمئنِ بازیکنِ دیگر (تضاد) → صف، حتی اگر بصری خوب باشد.
 *   • نبودِ چهره (انیمه) مانعِ لایهٔ A نیست.
 *
 * مدل اجرا نمی‌شود؛ فقط تابعِ خالصِ `gate`.
 */
const sv = require('../src/services/serverVerify');

let pass = 0; let fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass += 1; console.log('  ✓', name); }
  else { fail += 1; console.log('  ✗', name, detail ? `→ ${detail}` : ''); }
};

const C = 'card-type-1';
const O = 'card-type-2';
const card = (score, margin, type = C) => ({ score, margin, cardTypeId: type });
const face = (score, margin, type = C) => ({ score, margin, cardTypeId: type });

console.log('\n== لایهٔ A: تأیید فقط با بصریِ فوق‌قوی ==');

// A1) بصری فوق‌قوی بدون چهره (کارت انیمه) → تأیید.
{
  const r = sv.gate({ topCard: card(0.74, 0.10), topFace: null, faceUsable: false });
  ok('بصری فوق‌قوی + بدون چهره → تأیید (A)', r.action === 'approve' && /card-strong/.test(r.reason));
}
// A2) بصری فوق‌قوی + چهرهٔ موافق → تأیید.
{
  const r = sv.gate({ topCard: card(0.74, 0.10), topFace: face(0.8, 0.35), faceUsable: true });
  ok('بصری فوق‌قوی + چهره موافق → تأیید', r.action === 'approve');
}
// A3) بصری فوق‌قوی ولی چهرهٔ مطمئنِ بازیکنِ دیگر → تضاد → صف.
{
  const r = sv.gate({ topCard: card(0.74, 0.10), topFace: face(0.8, 0.35, O), faceUsable: true });
  ok('بصری قوی + تضادِ چهره → صف', r.action === 'queue' && r.reason === 'face-contradicts');
}
// A4) حاشیهٔ بصری زیر آستانهٔ A → نباید card-only تأیید شود (حتی نمره بالا).
{
  const r = sv.gate({ topCard: card(0.70, 0.04), topFace: null, faceUsable: false });
  ok('حاشیهٔ کمِ بصری → صف (A رد)', r.action === 'queue');
}
// A5) نمرهٔ بصری زیر آستانهٔ A → صف.
{
  const r = sv.gate({ topCard: card(0.55, 0.20), topFace: null, faceUsable: false });
  ok('نمرهٔ بصری متوسط بدون چهره → صف', r.action === 'queue');
}

console.log('\n== لایهٔ B: بصری خوب + چهرهٔ موافق ==');

// B1) بصری خوب (زیر آستانهٔ A) + چهرهٔ قویِ موافق → تأیید.
{
  const r = sv.gate({ topCard: card(0.50, 0.02), topFace: face(0.8, 0.35), faceUsable: true });
  ok('بصری خوب + چهرهٔ موافق → تأیید (B)', r.action === 'approve' && r.reason === 'card+face-agree');
}
// B2) بصری خوب + چهرهٔ قویِ مخالف → صف.
{
  const r = sv.gate({ topCard: card(0.50, 0.02), topFace: face(0.8, 0.35, O), faceUsable: true });
  ok('بصری خوب + چهرهٔ مخالف → صف', r.action === 'queue' && r.reason === 'face-contradicts');
}
// B3) بصریِ فوق‌قوی حتی اگر چهره حاشیه کم داشت → لایهٔ A تأیید (چهرهٔ
//     غیرقاطع ترمز نیست؛ فقط تضادِ قاطع ترمز است).
{
  const r = sv.gate({ topCard: card(0.90, 0.15), topFace: face(0.8, 0.05), faceUsable: true });
  ok('بصری فوق‌قوی + چهرهٔ غیرقاطع → تأیید (A)', r.action === 'approve');
}
// B4) بصریِ متوسط (زیر A) + چهره با حاشیهٔ کم → صف (نه B، نه A).
{
  const r = sv.gate({ topCard: card(0.50, 0.02), topFace: face(0.8, 0.05), faceUsable: true });
  ok('بصری متوسط + چهرهٔ غیرقاطع → صف', r.action === 'queue');
}

console.log('\n== موارد امنیتیِ کلی ==');

// S1) بصری ضعیف حتی با چهرهٔ خوب → صف.
{
  const r = sv.gate({ topCard: card(0.30, 0.01), topFace: face(0.9, 0.5), faceUsable: true });
  ok('بصری ضعیف → صف', r.action === 'queue' && r.reason === 'card-weak');
}
// S2) بدون هیچ مرجعی → صف.
{
  const r = sv.gate({ topCard: null, topFace: null, faceUsable: false });
  ok('بدون مرجع → صف', r.action === 'queue');
}
// S3) چهرهٔ غیرقابل‌اتکا (مثلاً چندچهره‌ای، faceUsable=false) نباید ترمزِ اشتباه بزند
//     و نباید به‌عنوان شاهد قبول شود؛ لایهٔ A با بصری قوی تأیید می‌کند.
{
  const r = sv.gate({ topCard: card(0.70, 0.10), topFace: null, faceUsable: false });
  ok('چهرهٔ غیرقابل‌اتکا نادیده گرفته می‌شود (بصری قوی → A)', r.action === 'approve');
}

console.log(`\n${fail === 0 ? '✓' : '✗'} ${pass} تست موفق، ${fail} ناموفق`);
process.exit(fail === 0 ? 0 : 1);
