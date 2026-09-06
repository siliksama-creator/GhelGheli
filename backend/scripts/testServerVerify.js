/**
 * تستِ گیتِ بازبینیِ خودکارِ سرور (فاز ۴).
 *
 * خط‌قرمز: تأییدِ خودکار فقط وقتی که **بصریِ قوی** و **چهرهٔ یکتای پراطمینان**
 * هر دو بر **یک بازیکن** باشند. این تست تمامِ حالت‌های مرزی را قفل می‌کند:
 *   • بصری+چهره موافق و پراطمینان → تأیید.
 *   • بصری قوی ولی چهره نبود/چندچهره/حاشیه کم → صف.
 *   • چهرهٔ مطمئنِ بازیکنِ دیگر (تضاد) → صف (هرگز تأیید با بازیکن غلط).
 *   • بصری ضعیف حتی با چهرهٔ خوب → صف.
 *
 * مدل اینجا اجرا نمی‌شود (آهسته و وابسته به فایل)؛ فقط تابعِ خالصِ `gate`.
 */
const assert = require('assert');
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

console.log('\n== گیتِ تأییدِ خودکار ==');

// ۱) هر دو قوی و موافق → تأیید.
{
  const r = sv.gate({
    topCard: card(0.90, 0.15), topFace: face(0.80, 0.35),
    faceCount: 1, faceDetected: 0.95,
  });
  ok('بصری+چهرهٔ قویِ موافق → تأیید', r.action === 'approve');
}

// ۲) بصری قوی، چهره‌ای نیست → صف.
{
  const r = sv.gate({
    topCard: card(0.90, 0.15), topFace: null,
    faceCount: 0, faceDetected: 0,
  });
  ok('بدون چهره → صف', r.action === 'queue' && r.reason === 'face-not-confident');
}

// ۳) چندچهره‌ای (پوستر گروهی) حتی اگر یکی شبیه بود → صف.
{
  const r = sv.gate({
    topCard: card(0.90, 0.15), topFace: face(0.80, 0.35),
    faceCount: 5, faceDetected: 0.94,
  });
  ok('کادر چندچهره‌ای → صف (روی چهره تکیه نمی‌شود)', r.action === 'queue');
}

// ۴) چهرهٔ مطمئنِ بازیکنِ دیگر → تضاد → صف (هرگز تأیید غلط).
{
  const r = sv.gate({
    topCard: card(0.90, 0.15), topFace: face(0.80, 0.35, O),
    faceCount: 1, faceDetected: 0.95,
  });
  ok('چهرهٔ مطمئنِ بازیکنِ دیگر → تضاد → صف',
    r.action === 'queue' && r.reason === 'face-contradicts');
}

// ۵) بصری ضعیف (نمره پایین) حتی با چهرهٔ خوبِ موافق → صف.
{
  const r = sv.gate({
    topCard: card(0.30, 0.02), topFace: face(0.80, 0.35),
    faceCount: 1, faceDetected: 0.95,
  });
  ok('بصری ضعیف → صف', r.action === 'queue' && r.reason === 'card-weak');
}

// ۶) حاشیهٔ بصری کم (چند بازیکن چسبیده) حتی با چهره → صف.
{
  const r = sv.gate({
    topCard: card(0.90, 0.004), topFace: face(0.80, 0.35),
    faceCount: 1, faceDetected: 0.95,
  });
  ok('حاشیهٔ بصری کم → صف', r.action === 'queue' && r.reason === 'card-weak');
}

// ۷) چهره حاشیه کم (دو بازیکن چسبیده) حتی موافق → صف.
{
  const r = sv.gate({
    topCard: card(0.90, 0.15), topFace: face(0.80, 0.05),
    faceCount: 1, faceDetected: 0.95,
  });
  ok('حاشیهٔ چهره کم → صف', r.action === 'queue' && r.reason === 'face-not-confident');
}

// ۸) نمرهٔ چهره زیر آستانه → صف.
{
  const r = sv.gate({
    topCard: card(0.90, 0.15), topFace: face(0.40, 0.30),
    faceCount: 1, faceDetected: 0.95,
  });
  ok('نمرهٔ چهره پایین → صف', r.action === 'queue');
}

// ۹) اطمینانِ آشکارساز کم (چهرهٔ محو) → صفحهٔ چهره نادیده گرفته می‌شود → صف.
{
  const r = sv.gate({
    topCard: card(0.90, 0.15), topFace: face(0.90, 0.5),
    faceCount: 1, faceDetected: 0.5,
  });
  ok('آشکارسازیِ ضعیفِ چهره → صف', r.action === 'queue');
}

// ۱۰) دو طرح هم‌بازیکن ولی چهره بازیکن درست را گفت → تأیید.
{
  const r = sv.gate({
    topCard: card(0.95, 0.20), topFace: face(0.85, 0.40, C),
    faceCount: 1, faceDetected: 0.9,
  });
  ok('حاشیهٔ خوب هر دو → تأیید', r.action === 'approve');
}

console.log(`\n${fail === 0 ? '✓' : '✗'} ${pass} تست موفق، ${fail} ناموفق`);
process.exit(fail === 0 ? 0 : 1);
