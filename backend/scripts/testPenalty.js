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
  ok(s.suddenDeath === false, 'در شروع وقتِ اضافه نداریم');
  ok(P.ZONES === 6, 'دروازه ۶ ناحیه دارد (خواستهٔ مالک، مهر ۱۴۰۵)');
  ok(P.ZONE_COLS === 3 && P.ZONE_ROWS === 2, 'هندسه: ۳ ستون × ۲ ردیف');
  ok(P.ROUNDS === 5, 'هر بازیکن ۵ ضربه در وقتِ قانونی می‌زند');
  ok(P.result(s) === null, 'در شروع برنده‌ای نیست');
}

console.log('\n== اعتبارسنجی حرکت ==');
{
  const s = P.create();
  ok(P.isValidMove(s, { zone: 0, power: 0.5 }, 'X'), 'ناحیهٔ ۰ پذیرفته می‌شود');
  ok(P.isValidMove(s, { zone: 5, power: 0.5 }, 'X'), 'ناحیهٔ ۵ (آخرین) پذیرفته می‌شود');
  ok(!P.isValidMove(s, { zone: 6, power: 0.5 }, 'X'), 'ناحیهٔ ۶ رد می‌شود (فقط ۰..۵)');
  ok(!P.isValidMove(s, { zone: 8, power: 0.5 }, 'X'), 'ناحیهٔ ۸ رد می‌شود (هندسهٔ قدیم)');
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
  // شیرجه دقیق به همان ناحیه -> مهار ۱۰۰٪
  const saveRes = P.resolveKick(3, 0.5, 3, fixed(0.999));
  ok(saveRes.outcome === 'save', 'شیرجه به همان خانه شوت -> مهار قطعی');

  // شوت به ناحیهٔ دیگر -> گل ۱۰۰٪
  const goalRes = P.resolveKick(0, 0.5, 5, fixed(0.999));
  ok(goalRes.outcome === 'goal', 'شوت در چارچوب و دروازه‌بان جای دیگر -> گل قطعی');

  const goalRes2 = P.resolveKick(0, 0.95, 5, fixed(0.01));
  ok(goalRes2.outcome === 'goal', 'شوت بدون مهار گل شد');

  // هر شش ناحیه: شیرجهٔ هم‌جهت همیشه مهار است
  let allSaved = true;
  for (let z = 0; z < P.ZONES; z++) {
    if (P.resolveKick(z, 0.6, z, fixed(0.5)).outcome !== 'save') allSaved = false;
  }
  ok(allSaved, 'در هر ۶ ناحیه، شیرجهٔ هم‌جهت مهار است');

  // احتمالِ گلِ زنندهٔ تصادفی = ۵/۶
  let goals = 0;
  const N = 60000;
  for (let i = 0; i < N; i++) {
    const shot = Math.floor(Math.random() * P.ZONES);
    const dive = Math.floor(Math.random() * P.ZONES);
    if (P.resolveKick(shot, 0.6, dive).outcome === 'goal') goals++;
  }
  const rate = goals / N;
  ok(Math.abs(rate - 5 / 6) < 0.02,
    `نرخِ گلِ تصادفی ≈ ۵/۶ (اندازه‌گیری: ${rate.toFixed(3)})`);
}

// ── یک ضربهٔ کامل ──
// زننده همیشه به ناحیهٔ ۰ می‌زند؛ `save` یعنی دروازه‌بان همان‌جا می‌پرد.
function kick(s, save) {
  const sh = s.shooter;
  const kp = sh === 'X' ? 'O' : 'X';
  P.applyMove(s, { zone: 0, power: 0.5 }, sh, fixed(0.5));
  P.applyMove(s, { zone: save ? 0 : 5 }, kp, fixed(0.5));
}

// فقط نیمی از یک راند: زننده زد، دروازه‌بان هنوز نپریده.
function shootOnly(s) {
  P.applyMove(s, { zone: 0, power: 0.5 }, s.shooter, fixed(0.5));
}

console.log('\n== 🏁 پایان مسابقه ==');
{
  // ── بردِ زودهنگام ──
  const s = P.create();
  let ended = null, kicks = 0;
  while (!ended && kicks < 40) {
    kick(s, s.shooter === 'X' ? false : true); // X گل می‌زند، O مهار می‌شود
    ended = P.result(s);
    kicks++;
  }
  ok(ended === 'X', 'X برنده شد');
  // هر `kick` یک ضربه است، نه یک راند: نوبت بین X و O عوض می‌شود. وقتِ
  // قانونی ۱۰ ضربه است (۵ برای هر طرف)، ولی در ۳-۰ کار زودتر تمام می‌شود:
  // بعد از ضربهٔ ششم، O دو ضربه دارد و X سه گل — حتی با دو گل هم نمی‌رسد.
  ok(kicks === 6, `بردِ زودهنگام: بازی در ${kicks} ضربه تمام شد (نه ۱۰)`);
  ok(kicks < P.ROUNDS * 2, 'و قطعاً زودتر از پایانِ وقتِ قانونی تمام شد');

  // ── ۵-۵ مساوی ⇒ نه تساوی، بلکه وقتِ اضافه ──
  //
  // این همان سناریویی است که مالک تغییرش داد: «اگه در ۵ ۵ مساوی بود ۱ راند
  // دیگه اضافه میشه انقدر ادامه پیدا میکنه تا برنده داشته باشه».
  const s2 = P.create();
  for (let i = 0; i < 10; i++) kick(s2, false); // همه گل
  ok(s2.taken.X === 5 && s2.taken.O === 5, 'هر کس دقیقاً ۵ ضربه زد');
  ok(P.result(s2) !== 'DRAW', 'مساویِ ۵-۵ دیگر نتیجهٔ تساوی نیست');
  ok(P.result(s2) === null, 'و هنوز برنده‌ای اعلام نشده — بازی ادامه دارد');
  ok(s2.suddenDeath === true, 'پرچمِ وقتِ اضافه روشن شد');

  // ── راندِ اضافه: تا وقتی هر دو نزده‌اند، برنده‌ای نیست ──
  shootOnly(s2); // X انتخاب کرد؛ هنوز هیچ‌چیزی ثبت نشده
  ok(P.result(s2) === null, 'در میانهٔ راندِ اضافه نتیجه اعلام نمی‌شود');
  ok(s2.taken.X === 5 && s2.taken.O === 5, 'تا هر دو انتخاب نکنند، ضربه‌ای ثبت نمی‌شود');
  ok(s2.score.X === 5 && s2.score.O === 5, 'و امتیازی هم عوض نشده');

  // O می‌پرد (اشتباه) ⇒ X گل می‌زند: ۶-۵
  P.applyMove(s2, { zone: 5 }, 'O', fixed(0.5));
  ok(s2.taken.X === 6 && s2.taken.O === 5, 'ضربهٔ ششمِ X ثبت شد');
  ok(P.result(s2) === null,
    'X جلو افتاد ولی راند کامل نشده — O هنوز می‌تواند جبران کند');

  // O هم گل می‌زند → ۶-۶، باز هم ادامه
  kick(s2, false);
  ok(s2.taken.X === 6 && s2.taken.O === 6, 'هر دو شش ضربه زدند');
  ok(P.result(s2) === null, '۶-۶ یعنی راندِ بعدی، نه تساوی');
  ok(s2.suddenDeath === true, 'پرچمِ وقتِ اضافه روشن می‌ماند');

  // ── راندِ بعدی: X گل، O مهار ⇒ برنده ──
  kick(s2, false); // هفتمین ضربهٔ X: گل → ۷-۶
  ok(P.result(s2) === null, 'نیمهٔ اولِ راندِ هفتم هنوز برنده ندارد');
  kick(s2, true); // هفتمین ضربهٔ O: مهار
  ok(s2.score.X === 7 && s2.score.O === 6, 'امتیاز ۷-۶ شد');
  ok(s2.taken.X === 7 && s2.taken.O === 7, 'هر دو هفت ضربه زدند');
  ok(P.result(s2) === 'X', 'X در راندِ اضافه برنده شد');

  // ── برندهٔ امتیازِ بیشتر در ضربهٔ پنجم ──
  const s4 = P.create();
  for (let i = 0; i < 10; i++) kick(s4, i === 1); // دومین ضربه (اولینِ O) مهار می‌شود
  ok(s4.taken.X === 5 && s4.taken.O === 5, 'هر دو ۵ ضربه زدند');
  ok(P.result(s4) === 'X', '۵-۴ ⇒ برنده X است، بی نیاز به وقتِ اضافه');
  ok(s4.suddenDeath === false, 'وقتی برنده در وقتِ قانونی است، اضافه‌ای در کار نیست');
}

console.log('\n== 🚫 این بازی تساوی ندارد ==');
{
  // تصادفیِ کامل: ۳۰۰۰ بازیِ کامل. هر بازی باید با یک برنده تمام شود.
  let draws = 0, stuck = 0, sudden = 0, maxRounds = 0, winners = { X: 0, O: 0 };
  for (let g = 0; g < 3000; g++) {
    const s = P.create();
    let guard = 0;
    let r = P.result(s);
    while (!r && guard++ < 400) {
      const sh = s.shooter;
      const kp = sh === 'X' ? 'O' : 'X';
      P.applyMove(s, { zone: Math.floor(Math.random() * P.ZONES), power: 0.5 }, sh, fixed(0.5));
      P.applyMove(s, { zone: Math.floor(Math.random() * P.ZONES) }, kp, fixed(0.5));
      r = P.result(s);
    }
    if (r === 'DRAW') draws++;
    else if (r !== 'X' && r !== 'O') stuck++;
    else winners[r]++;
    if (s.suddenDeath) sudden++;
    maxRounds = Math.max(maxRounds, s.taken.X);
    // هرگز نباید از تعدادِ ضربه‌های هر دو طرف بیشتر از یکی فاصله بگیرد
    if (Math.abs(s.taken.X - s.taken.O) > 1) stuck++;
  }
  ok(draws === 0, `هیچ بازی‌ای مساوی نشد (تساوی‌ها: ${draws})`);
  ok(stuck === 0, 'هیچ بازی‌ای بی‌پایان نماند یا کج پیش نرفت');
  ok(winners.X > 0 && winners.O > 0, `هر دو طرف برنده داشتند (X:${winners.X} O:${winners.O})`);
  ok(Math.abs(winners.X - winners.O) < 400,
    `برنده‌ها بین دو طرف متوازن‌اند (X:${winners.X} O:${winners.O})`);
  ok(sudden > 0, `بعضی بازی‌ها واقعاً به وقتِ اضافه رفتند (${sudden} از ۳۰۰۰)`);
  ok(maxRounds < 60, `طولانی‌ترین بازی معقول بود (${maxRounds} ضربه برای یک طرف)`);
  console.log(`    طولانی‌ترین بازی: ${maxRounds} ضربه برای یک طرف`);
}

console.log('\n== پرچمِ وقتِ اضافه برای کلاینت‌ها ==');
{
  // کلاینتِ نصب‌شده `suddenDeath` را می‌خواند؛ باید در وضعیتِ عمومی باشد تا
  // بتواند برچسبِ «راندِ اضافه» را نشان دهد.
  const s = P.create();
  for (let i = 0; i < 10; i++) kick(s, false);
  const pub = P.publicState(s, 'X');
  ok(pub.suddenDeath === true, 'وقتی اضافه در وضعیتِ عمومی هم هست');
  ok(pub.pending === undefined, 'و هنوز انتخابِ پنهان لو نمی‌رود');
  ok(P.create().suddenDeath === false, 'بازیِ تازه هرگز در وقتِ اضافه شروع نمی‌شود');
}

console.log('\n== ربات ==');
{
  const s = P.create();
  s.shooter = 'O';
  let bad = 0;
  for (let i = 0; i < 2000; i++) {
    const m = P.botMove(s, 'O');
    if (!Number.isInteger(m.zone) || m.zone < 0 || m.zone >= P.ZONES) bad++;
  }
  ok(bad === 0, 'ربات به‌عنوان زننده همیشه ناحیهٔ معتبر (۰..۵) می‌دهد');

  s.shooter = 'X';
  bad = 0;
  const seen = new Set();
  for (let i = 0; i < 2000; i++) {
    const m = P.botMove(s, 'O');
    if (!Number.isInteger(m.zone) || m.zone < 0 || m.zone >= P.ZONES) bad++;
    seen.add(m.zone);
  }
  ok(bad === 0, 'ربات به‌عنوان دروازه‌بان همیشه ناحیهٔ معتبر می‌دهد');
  ok(seen.size === P.ZONES, `ربات از همهٔ ${P.ZONES} ناحیه استفاده می‌کند (هیچ‌کدام بی‌دفاع نیست)`);
}

console.log('\n== ثباتِ قراردادِ موتور ==');
{
  ok(RULES.penalty === P, 'همان ماژولی که موتور بار می‌کند تست می‌شود');
  ok(RULES.penalty.ZONES === 6 && RULES.penalty.ROUNDS === 5,
    'موتور هم ۶ ناحیه و ۵ ضربه می‌بیند');
  // ⚠️ `'DRAW'` هنوز قراردادِ معتبرِ موتور است (دوئلِ کارت واقعاً مساوی
  //    می‌شود)؛ فقط پنالتی است که دیگر آن را تولید نمی‌کند.
  ok(P.result(P.create()) === null,
    'بازیِ تازه برنده‌ای ندارد (و نه تساوی — فقط «ادامه دارد»)');
}

console.log(`\n✓ ${pass} تست موفق، ${fail} ناموفق`);
if (fail > 0) process.exit(1);
