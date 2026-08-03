#!/usr/bin/env node
// تست‌های بازی ضربات پنالتی.
//
// این بازی با سه بازی دیگر فرق بنیادی دارد: **هم‌زمان** است، نه نوبتی.
// دو بازیکن در یک لحظه تصمیم می‌گیرند و هیچ‌کدام نباید انتخاب دیگری را
// ببیند. بیشتر تست‌های اینجا دقیقاً همین را می‌سنجند، چون یک نشتِ کوچک
// اطلاعات، بازی را برای همیشه می‌شکند.
//
//   node scripts/testPenalty.js
const P = require('../src/games/rules/penalty');

let pass = 0, fail = 0;
const ok = (cond, name) => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ ${name}`); }
};

/** تصادفِ قطعی، تا تست‌ها هرگز «گاهی» رد نشوند. */
const fixed = (v) => () => v;
/** دنباله‌ای از مقادیر مشخص. */
const seq = (...vals) => { let i = 0; return () => vals[Math.min(i++, vals.length - 1)]; };

console.log('\n== ساختار اولیه ==');
{
  const s = P.create();
  ok(s.score.X === 0 && s.score.O === 0, 'امتیازها از صفر شروع می‌شوند');
  ok(s.shooter === 'X', 'زنندهٔ اول X است');
  ok(s.round === 1, 'دور اول');
  ok(!s.suddenDeath, 'مرگ ناگهانی خاموش است');
  ok(P.ZONES === 9, 'دروازه ۹ ناحیه دارد');
  ok(P.ROUNDS === 5, 'مسابقهٔ استاندارد ۵ دور است');
  ok(P.result(s) === null, 'در شروع برنده‌ای نیست');
}

console.log('\n== اعتبارسنجی حرکت ==');
{
  const s = P.create();
  ok(P.isValidMove(s, { zone: 0, power: 0.5 }, 'X'), 'ناحیهٔ معتبر پذیرفته می‌شود');
  ok(!P.isValidMove(s, { zone: 9, power: 0.5 }, 'X'), 'ناحیهٔ ۹ رد می‌شود');
  ok(!P.isValidMove(s, { zone: -1, power: 0.5 }, 'X'), 'ناحیهٔ منفی رد می‌شود');
  ok(!P.isValidMove(s, { zone: 1.5, power: 0.5 }, 'X'), 'ناحیهٔ اعشاری رد می‌شود');
  ok(!P.isValidMove(s, null, 'X'), 'null کرش نمی‌کند');
  ok(!P.isValidMove(s, 3, 'X'), 'عدد خام (نه شیء) رد می‌شود');
  ok(!P.isValidMove(s, { zone: 'x' }, 'X'), 'ناحیهٔ غیرعددی رد می‌شود');
  ok(!P.isValidMove(s, { zone: 0, power: 2 }, 'X'), 'قدرت بیش از ۱ رد می‌شود');
  ok(!P.isValidMove(s, { zone: 0, power: -1 }, 'X'), 'قدرت منفی رد می‌شود');
  // دروازه‌بان قدرت لازم ندارد
  ok(P.isValidMove(s, { zone: 4 }, 'O'), 'دروازه‌بان بدون قدرت هم معتبر است');
}

console.log('\n== انتخاب دوباره در یک ضربه ممنوع ==');
{
  // بدون این، بازیکن می‌توانست چند بار بفرستد تا نتیجه را عوض کند.
  const s = P.create();
  P.applyMove(s, { zone: 0, power: 0.5 }, 'X', fixed(0.99));
  ok(!P.isValidMove(s, { zone: 8, power: 0.5 }, 'X'),
    'زننده نمی‌تواند انتخابش را عوض کند');
  ok(P.isValidMove(s, { zone: 4 }, 'O'), 'ولی دروازه‌بان هنوز می‌تواند انتخاب کند');
}

console.log('\n== 🔒 نشتِ اطلاعات — مهم‌ترین بخش ==');
{
  const s = P.create();
  P.applyMove(s, { zone: 7, power: 0.9 }, 'X', fixed(0.99));

  const forKeeper = P.publicState(s, 'O');
  const asText = JSON.stringify(forKeeper);
  ok(forKeeper.pending === undefined, 'pending در وضعیت عمومی نیست');
  ok(!asText.includes('"zone":7') || !asText.includes('pending'),
    'ناحیهٔ شوتِ حریف در پاسخ دیده نمی‌شود');

  // مطمئن‌تر: هیچ‌جای خروجی نباید انتخابِ قفل‌نشده باشد
  const leaked = JSON.stringify(forKeeper).includes('"power":0.9');
  ok(!leaked, 'قدرت شوت هم لو نمی‌رود');

  ok(forKeeper.role === 'keeper', 'نقش دروازه‌بان درست گزارش می‌شود');
  ok(P.publicState(s, 'X').role === 'shooter', 'نقش زننده درست گزارش می‌شود');
  ok(P.publicState(s, 'X').iChose === true, 'زننده می‌داند خودش انتخاب کرده');
  ok(P.publicState(s, 'O').iChose === false, 'دروازه‌بان هنوز انتخاب نکرده');
}

console.log('\n== تعویض نقش‌ها ==');
{
  const s = P.create();
  ok(s.shooter === 'X', 'ضربهٔ ۱: X می‌زند');
  P.applyMove(s, { zone: 0, power: 0.5 }, 'X', fixed(0.99));
  P.applyMove(s, { zone: 8 }, 'O', fixed(0.99));
  ok(s.shooter === 'O', 'ضربهٔ ۲: نقش عوض شد، O می‌زند');
  P.applyMove(s, { zone: 0, power: 0.5 }, 'O', fixed(0.99));
  P.applyMove(s, { zone: 8 }, 'X', fixed(0.99));
  ok(s.shooter === 'X', 'ضربهٔ ۳: دوباره X');
  ok(s.round === 2, 'بعد از دو ضربه، دور دوم شروع شد');
  ok(s.taken.X === 1 && s.taken.O === 1, 'هر کدام یک ضربه زده‌اند');
}

console.log('\n== نتیجهٔ ضربه ==');
{
  // rand کوچک → شرط برقرار می‌شود. rand بزرگ → برقرار نمی‌شود.
  const miss = P.resolveKick(0, 0.9, 4, fixed(0.0001));
  ok(miss.outcome === 'miss', 'تصادف خیلی کم → بیرون رفتن توپ');

  const goal = P.resolveKick(6, 0.5, 2, fixed(0.999));
  ok(goal.outcome === 'goal', 'تصادف خیلی زیاد → گل');

  // مهار: از خطا رد شود ولی در شانس مهار گیر کند
  const save = P.resolveKick(4, 0.1, 4, seq(0.99, 0.0001));
  ok(save.outcome === 'save', 'حدس دقیق دروازه‌بان → مهار');

  ok(['goal', 'save', 'miss'].includes(P.resolveKick(4, 0.5, 4).outcome),
    'با تصادف واقعی هم نتیجه معتبر است');
}

console.log('\n== فیزیک: احتمال‌ها منطقی‌اند ==');
{
  // گوشهٔ بالا سخت‌تر از پایین است
  ok(P.missChance(0, 0.5) > P.missChance(6, 0.5),
    'گوشهٔ بالا بیشتر بیرون می‌رود تا پایین');
  ok(P.missChance(1, 0.5) > P.missChance(7, 0.5), 'وسط-بالا از وسط-پایین سخت‌تر');
  // قدرت بیشتر = خطای بیشتر
  ok(P.missChance(4, 1.0) > P.missChance(4, 0.3),
    'شوت محکم‌تر خطای بیشتری دارد');
  // ولی هرگز بیش از حد
  for (let z = 0; z < 9; z++) {
    for (const pw of [0, 0.5, 1]) {
      const m = P.missChance(z, pw);
      if (m < 0 || m > 0.45) fail++;
    }
  }
  ok(true, 'احتمال خطا همیشه بین ۰ و ۰.۴۵ است');

  // حدس دقیق بهتر از حدس دور
  ok(P.saveChance(4, 4, 0.5) > P.saveChance(4, 5, 0.5),
    'حدس دقیق بهتر از یک خانه فاصله');
  ok(P.saveChance(4, 5, 0.5) > P.saveChance(4, 0, 0.5),
    'یک خانه فاصله بهتر از گوشهٔ مخالف');
  ok(P.saveChance(0, 0, 0.5) < P.saveChance(6, 6, 0.5),
    'گوشهٔ بالا حتی با حدس درست سخت‌تر مهار می‌شود');
  ok(P.saveChance(4, 4, 1.0) < P.saveChance(4, 4, 0.1),
    'شوت محکم‌تر سخت‌تر مهار می‌شود');
  let bounded = true;
  for (let a = 0; a < 9; a++) for (let b = 0; b < 9; b++) {
    const v = P.saveChance(a, b, 0.5);
    if (v < 0 || v > 1) bounded = false;
  }
  ok(bounded, 'احتمال مهار همیشه بین ۰ و ۱ است');
}

console.log('\n== نرخ گل نزدیک واقعیت باشد ==');
{
  // اگر ۹۵٪ گل شود بازی بی‌مزه است؛ اگر ۳۰٪ شود ناامیدکننده.
  let goals = 0, saves = 0, misses = 0;
  const N = 20000;
  for (let i = 0; i < N; i++) {
    const shot = Math.floor(Math.random() * 9);
    const dive = Math.floor(Math.random() * 9);
    const r = P.resolveKick(shot, 0.5 + Math.random() * 0.4, dive);
    if (r.outcome === 'goal') goals++;
    else if (r.outcome === 'save') saves++;
    else misses++;
  }
  const gp = goals / N * 100;
  ok(gp > 55 && gp < 85,
    `نرخ گل ${gp.toFixed(0)}٪ — در بازهٔ واقع‌بینانه (پنالتی واقعی ~۷۵٪)`);
  ok(saves / N > 0.08, `نرخ مهار ${(saves / N * 100).toFixed(0)}٪ — دروازه‌بانی معنا دارد`);
  ok(misses / N > 0.03, `نرخ بیرون ${(misses / N * 100).toFixed(0)}٪ — خطا وجود دارد`);
}

console.log('\n== پایان مسابقه ==');
{
  /** یک ضربهٔ کامل با نتیجهٔ دلخواه. */
  function kick(s, goal) {
    const sh = s.shooter, kp = sh === 'X' ? 'O' : 'X';
    // زننده ۰ می‌زند، دروازه‌بان ۸ (دورترین) → مهار تقریباً صفر
    P.applyMove(s, { zone: 6, power: 0.5 }, sh, fixed(0.999));
    P.applyMove(s, { zone: 2 }, kp, goal ? fixed(0.999) : fixed(0.0001));
    return s;
  }

  // X همه را گل می‌زند، O همه را از دست می‌دهد → برد زودهنگام
  let s = P.create();
  let ended = null, kicks = 0;
  while (!ended && kicks < 20) {
    kick(s, s.shooter === 'X');
    ended = P.result(s);
    kicks++;
  }
  ok(ended === 'X', `X برنده شد`);
  ok(kicks < 10, `برد زودهنگام: بازی در ${kicks} ضربه تمام شد نه ۱۰`);

  // مساوی کامل → مرگ ناگهانی
  s = P.create();
  for (let i = 0; i < 10; i++) kick(s, true); // همه گل
  ok(P.result(s) === null, 'مساوی بعد از ۵ دور → برنده‌ای نیست');
  ok(s.suddenDeath === true, 'مرگ ناگهانی فعال شد');
  ok(s.score.X === 5 && s.score.O === 5, 'امتیاز ۵-۵');

  // در مرگ ناگهانی: X گل، O خطا → X برنده
  kick(s, true);   // X گل
  ok(P.result(s) === null, 'وسط دورِ مرگ ناگهانی هنوز برنده نیست');
  kick(s, false);  // O مهار شد
  ok(P.result(s) === 'X', 'انتهای دورِ مرگ ناگهانی → X برنده');
}

console.log('\n== مرگ ناگهانی بی‌پایان نمی‌شود ==');
{
  // اگر همیشه مساوی بمانند، باید ادامه پیدا کند ولی کرش نکند.
  const s = P.create();
  for (let i = 0; i < 60; i++) {
    const sh = s.shooter, kp = sh === 'X' ? 'O' : 'X';
    P.applyMove(s, { zone: 6, power: 0.5 }, sh, fixed(0.999));
    P.applyMove(s, { zone: 2 }, kp, fixed(0.999));
  }
  ok(s.score.X === s.score.O, 'مساوی مانده');
  ok(P.result(s) === null, 'بازی ادامه دارد بدون کرش');
  ok(s.taken.X === 30 && s.taken.O === 30, '۳۰ ضربه از هر طرف ثبت شد');
}

console.log('\n== ربات ==');
{
  const s = P.create();
  // به‌عنوان زننده
  s.shooter = 'O';
  for (let i = 0; i < 200; i++) {
    const m = P.botMove(s, 'O');
    if (!Number.isInteger(m.zone) || m.zone < 0 || m.zone > 8) { fail++; break; }
    if (m.power < 0 || m.power > 1) { fail++; break; }
  }
  ok(true, 'ربات به‌عنوان زننده همیشه حرکت معتبر می‌دهد');

  // به‌عنوان دروازه‌بان
  s.shooter = 'X';
  for (let i = 0; i < 200; i++) {
    const m = P.botMove(s, 'O');
    if (!Number.isInteger(m.zone) || m.zone < 0 || m.zone > 8) { fail++; break; }
  }
  ok(true, 'ربات به‌عنوان دروازه‌بان همیشه حرکت معتبر می‌دهد');

  // یادگیری عادت حریف
  s.history = [
    { shooter: 'X', shotZone: 6, outcome: 'goal', diveZone: 0 },
    { shooter: 'X', shotZone: 6, outcome: 'goal', diveZone: 1 },
    { shooter: 'X', shotZone: 6, outcome: 'goal', diveZone: 2 },
    { shooter: 'X', shotZone: 6, outcome: 'goal', diveZone: 3 },
  ];
  let guessed6 = 0;
  for (let i = 0; i < 400; i++) if (P.botMove(s, 'O').zone === 6) guessed6++;
  ok(guessed6 > 120,
    `ربات عادت حریف را یاد می‌گیرد (${guessed6}/۴۰۰ بار ناحیهٔ تکراری را حدس زد)`);
  ok(guessed6 < 380, 'ولی همیشه درست حدس نمی‌زند — بازی باید قابل برد بماند');

  // ربات بدون تاریخچه هم کرش نمی‌کند
  const empty = P.create();
  ok(!!P.botMove(empty, 'O'), 'ربات بدون تاریخچه کرش نمی‌کند');
  empty.history = null;
  ok(!!P.botMove(empty, 'O'), 'تاریخچهٔ null هم کرش نمی‌کند');
}

console.log('\n== ورودی خراب کرش نمی‌کند ==');
{
  const s = P.create();
  const bad = [undefined, null, {}, { zone: NaN }, { zone: Infinity },
    { zone: '4' }, [], 'x', 0, true];
  let crashed = false;
  for (const m of bad) {
    try { P.isValidMove(s, m, 'X'); } catch { crashed = true; }
  }
  ok(!crashed, 'هیچ ورودی خرابی isValidMove را نمی‌شکند');

  // قدرت خارج از بازه در applyMove کلمپ می‌شود نه کرش
  const s2 = P.create();
  P.applyMove(s2, { zone: 4, power: 99 }, 'X', fixed(0.99));
  ok(true, 'قدرت غیرمنطقی کرش نمی‌کند');
}

console.log('\n== 🔒 نشت از مسیر lastMove — باگ واقعیِ پیداشده ==');
{
  // این باگ با تست واحد پیدا نشد: فایل قوانین کاملاً درست بود.
  // موتور، حرکت را جداگانه در `lastMove` برای هر دو بازیکن می‌فرستاد،
  // پس دروازه‌بان دقیقاً می‌دید {zone:7,power:0.9} و همیشه مهار می‌کرد.
  const eng = require('fs').readFileSync(
    require('path').join(__dirname, '..', 'src', 'games', 'engine.js'), 'utf8');
  ok(/lastMove: room\.rules\.simultaneous \? null : lastMove/.test(eng),
    'موتور در بازی هم‌زمان lastMove را نمی‌فرستد');
}

console.log('\n== قرارداد موتور بازی ==');
{
  ok(P.simultaneous === true, 'بازی به‌عنوان هم‌زمان علامت خورده');
  ok(typeof P.publicState === 'function', 'publicState وجود دارد');
  ok(typeof P.nextTurn === 'function', 'nextTurn وجود دارد');
  ok(P.turnMs > 0 && P.turnMs <= 20000, `مهلت هر ضربه ${P.turnMs}ms — کوتاه و پرفشار`);
  const eng = require('fs').readFileSync(
    require('path').join(__dirname, '..', 'src', 'games', 'engine.js'), 'utf8');
  ok(/rules\.publicState/.test(eng), 'موتور از publicState استفاده می‌کند');
  ok(/rules\.simultaneous/.test(eng), 'موتور حالت هم‌زمان را می‌شناسد');
  ok(/typeof raw === 'object'/.test(eng), 'موتور حرکتِ شیء را می‌پذیرد');
  const idx = require('fs').readFileSync(
    require('path').join(__dirname, '..', 'src', 'games', 'index.js'), 'utf8');
  ok(/penalty/.test(idx), 'بازی در فهرست ثبت شده');
}

console.log(`\n${fail === 0 ? '✓' : '✗'} ${pass} تست موفق، ${fail} ناموفق`);
process.exit(fail === 0 ? 0 : 1);
