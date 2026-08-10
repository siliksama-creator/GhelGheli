const P = require('../src/games/rules/penalty');
const { RULES } = require('../src/games');

let pass = 0, fail = 0;
function ok(cond, msg) {
  if (cond) { pass++; console.log(`  ✓ ${msg}`); }
  else { fail++; console.error(`  ✗ ${msg}`); }
}
const fixed = (v) => () => v;

console.log('\n== ساختار اولیه ==');
{
  const s = P.create();
  ok(s.score.X === 0 && s.score.O === 0, 'امتیازها از صفر شروع می‌شوند');
  ok(s.shooter === 'X', 'زنندهٔ اول X است');
  ok(s.round === 1, 'دور اول');
  ok(s.suddenDeath === false, 'مرگ ناگهانی خاموش است');
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
  ok(!P.isValidMove(s, 4, 'X'), 'عدد خام رد می‌شود');
  ok(!P.isValidMove(s, { zone: 'چپ' }, 'X'), 'ناحیهٔ غیرعددی رد می‌شود');
  ok(!P.isValidMove(s, { zone: 0, power: 1.5 }, 'X'), 'قدرت بیش از ۱ رد می‌شود');
  ok(!P.isValidMove(s, { zone: 0, power: -0.1 }, 'X'), 'قدرت منفی رد می‌شود');
  ok(P.isValidMove(s, { zone: 4 }, 'O'), 'دروازه‌بان بدون قدرت هم معتبر است');
}

console.log('\n== انتخاب دوباره در یک ضربه ممنوع ==');
{
  const s = P.create();
  P.applyMove(s, { zone: 0, power: 0.5 }, 'X');
  ok(!P.isValidMove(s, { zone: 1, power: 0.5 }, 'X'), 'زننده نمی‌تواند انتخابش را عوض کند');
  ok(P.isValidMove(s, { zone: 0 }, 'O'), 'ولی دروازه‌بان هنوز می‌تواند انتخاب کند');
}

console.log('\n== 🔒 نشتِ اطلاعات ==');
{
  const s = P.create();
  P.applyMove(s, { zone: 0, power: 0.5 }, 'X');
  const pubX = P.publicState(s, 'X');
  const pubO = P.publicState(s, 'O');
  ok(pubX.pending === undefined && pubO.pending === undefined, 'pending در وضعیت عمومی نیست');
  ok(pubO.shotZone === undefined, 'ناحیهٔ شوتِ حریف در پاسخ دیده نمی‌شود');
  ok(pubO.power === undefined, 'قدرت شوت هم لو نمی‌رود');
  ok(pubO.role === 'keeper', 'نقش دروازه‌بان درست گزارش می‌شود');
  ok(pubX.role === 'shooter', 'نقش زننده درست گزارش می‌شود');
  ok(pubX.iChose === true, 'زننده می‌داند خودش انتخاب کرده');
  ok(pubO.iChose === false, 'دروازه‌بان هنوز انتخاب نکرده');
}

console.log('\n== تعویض نقش‌ها ==');
{
  const s = P.create();
  P.applyMove(s, { zone: 0, power: 0.5 }, 'X');
  P.applyMove(s, { zone: 1 }, 'O');
  ok(s.taken.X === 1, 'ضربهٔ ۱: X می‌زند');
  ok(s.shooter === 'O', 'ضربهٔ ۲: نقش عوض شد، O می‌زند');
  P.applyMove(s, { zone: 2, power: 0.5 }, 'O');
  P.applyMove(s, { zone: 3 }, 'X');
  ok(s.shooter === 'X', 'ضربهٔ ۳: دوباره X');
  ok(s.round === 2, 'بعد از دو ضربه، دور دوم شروع شد');
  ok(s.taken.X === 1 && s.taken.O === 1, 'هر کدام یک ضربه زده‌اند');
}

console.log('\n== منطق دقیق گل و مهار ==');
{
  // شیرجه دقیق به همان جهت -> مهار ۱۰۰٪
  const saveRes = P.resolveKick(4, 0.5, 4, fixed(0.999));
  ok(saveRes.outcome === 'save', 'شیرجه به همان خانه شوت -> مهار قطعی');

  // شوت به جهت مخالف -> گل ۱۰۰٪
  const goalRes = P.resolveKick(0, 0.5, 8, fixed(0.999));
  ok(goalRes.outcome === 'goal', 'شوت در چارچوب و دروازه‌بان جای دیگر -> گل قطعی');

  // شوت در چارچوب و دروازه‌بان جای دیگر -> گل قطعی
  const goalRes2 = P.resolveKick(0, 0.95, 8, fixed(0.01));
  ok(goalRes2.outcome === 'goal', 'شوت بدون مهار گل شد');
}

console.log('\n== پایان مسابقه ==');
{
  function kick(s, goal) {
    const sh = s.shooter, kp = sh === 'X' ? 'O' : 'X';
    const shotZ = 0;
    const diveZ = goal ? 8 : 0;
    P.applyMove(s, { zone: shotZ, power: 0.5 }, sh, fixed(0.999));
    P.applyMove(s, { zone: diveZ }, kp, fixed(0.999));
  }

  const s = P.create();
  // X همه گل، O همه خراب
  let ended = null, kicks = 0;
  while (!ended && kicks < 20) {
    kick(s, s.shooter === 'X');
    ended = P.result(s);
    kicks++;
  }
  ok(ended === 'X', `X برنده شد`);
  ok(kicks < 10, `برد زودهنگام: بازی در ${kicks} ضربه تمام شد نه ۱۰`);

  // مساوی بعد از ۵ دور
  const s2 = P.create();
  for (let i = 0; i < 10; i++) kick(s2, true);
  ok(P.result(s2) === null, 'مساوی بعد از ۵ دور → مرگ ناگهانی');
  ok(s2.suddenDeath === true, 'مرگ ناگهانی فعال شد');
}

console.log('\n== ربات ==');
{
  const s = P.create();
  s.shooter = 'O';
  for (let i = 0; i < 100; i++) {
    const m = P.botMove(s, 'O');
    if (!Number.isInteger(m.zone) || m.zone < 0 || m.zone > 8) { fail++; break; }
  }
  ok(true, 'ربات به‌عنوان زننده همیشه حرکت معتبر می‌دهد');

  s.shooter = 'X';
  for (let i = 0; i < 100; i++) {
    const m = P.botMove(s, 'O');
    if (!Number.isInteger(m.zone) || m.zone < 0 || m.zone > 8) { fail++; break; }
  }
  ok(true, 'ربات به‌عنوان دروازه‌بان همیشه حرکت معتبر می‌دهد');
}

console.log(`\n✓ ${pass} تست موفق، ${fail} ناموفق`);
if (fail > 0) process.exit(1);
