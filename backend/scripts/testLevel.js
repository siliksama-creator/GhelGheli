#!/usr/bin/env node
// تست‌های سیستم لول‌بندیِ بازیکن.
//
// ═══════════════════════════════════════════════════════════════════════════
// چرا این تست‌ها بدون دیتابیس اجرا می‌شوند
// ═══════════════════════════════════════════════════════════════════════════
//
// منحنیِ لول یک **تابعِ ریاضیِ محض** است. اگر تستش به یک Postgresِ در
// حالِ اجرا نیاز داشت، در CI و روی ماشینِ توسعه‌دهنده اجرا نمی‌شد —
// یعنی دقیقاً جایی که باید جلوی رگرسیون را بگیرد، ساکت می‌ماند.
//
// برای همین `levelService` پول را تنبل (lazy) بارگذاری می‌کند و این
// فایل فقط بخشِ محض را می‌سنجد.
//
//   node scripts/testLevel.js
const L = require('../src/services/levelService');

let pass = 0, fail = 0;
const ok = (cond, name) => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ ${name}`); }
};

console.log('\n== مرزهای لول ==');
{
  // درخواست مالک: «در قسمت بازی ها هم Level 0» — کاربرِ تازه باید صفر
  // ببیند، نه یک.
  ok(L.levelFromXp(0).level === 0, 'کاربر تازه لول ۰ است');
  ok(L.MIN_LEVEL === 0, 'کمینهٔ لول صفر است');
  ok(L.MAX_LEVEL === 100, 'بیشینهٔ لول ۱۰۰ است');

  ok(L.levelFromXp(-500).level === 0, 'XP منفی هم لول ۰ می‌دهد');
  ok(L.levelFromXp(null).level === 0, 'null کرش نمی‌کند');
  ok(L.levelFromXp(undefined).level === 0, 'undefined کرش نمی‌کند');
  ok(L.levelFromXp('abc').level === 0, 'رشتهٔ نامعتبر کرش نمی‌کند');
  ok(L.levelFromXp(NaN).level === 0, 'NaN کرش نمی‌کند');

  const max = L.levelFromXp(Number.MAX_SAFE_INTEGER);
  ok(max.level === 100, 'XP بی‌نهایت روی ۱۰۰ متوقف می‌شود');
  ok(max.isMax === true, 'پرچم isMax ست می‌شود');
  ok(max.progress === 1, 'پیشرفتِ لولِ نهایی کامل است');
  ok(max.needed === 0, 'لولِ نهایی نیازِ بعدی ندارد');
}

console.log('\n== منحنی یکنواختِ صعودی است ==');
{
  // اگر هزینهٔ یک لول از لولِ قبلی کمتر شود، بازیکن با XP بیشتر
  // می‌تواند لولِ پایین‌تر بگیرد — یک باگِ فاحش ولی راحت‌ازدست‌رفتنی
  // اگر کسی فرمول را دستکاری کند.
  let monotonic = true;
  for (let n = 1; n < L.MAX_LEVEL; n++) {
    if (L.xpForLevel(n + 1) <= L.xpForLevel(n)) monotonic = false;
  }
  ok(monotonic, 'هزینهٔ هر لول از قبلی بیشتر است');

  let cumOk = true;
  for (let lvl = 1; lvl <= L.MAX_LEVEL; lvl++) {
    if (L.totalXpFor(lvl) <= L.totalXpFor(lvl - 1)) cumOk = false;
  }
  ok(cumOk, 'مجموعِ تجمعی هم اکیداً صعودی است');

  // مرزهای دقیق: یک XP کمتر از آستانه نباید لول بدهد.
  let boundaryOk = true;
  for (let lvl = 1; lvl <= L.MAX_LEVEL; lvl++) {
    const need = L.totalXpFor(lvl);
    if (L.levelFromXp(need).level !== lvl) boundaryOk = false;
    if (need > 0 && L.levelFromXp(need - 1).level !== lvl - 1) boundaryOk = false;
  }
  ok(boundaryOk, 'هر آستانه دقیقاً همان لول را می‌دهد، نه یکی کم یا زیاد');
}

console.log('\n== «چند لول اول راحت، بعد خیلی بیشتر» ==');
{
  // خواستهٔ صریحِ مالک. اگر کسی منحنی را خطی کند، این تست‌ها می‌گیرند.
  const first = L.xpForLevel(1);
  const tenth = L.xpForLevel(10);
  const fiftieth = L.xpForLevel(50);
  const last = L.xpForLevel(99);

  ok(first <= 100, `لول اول ارزان است (${first} XP)`);
  ok(tenth > first * 5, `لول ۱۰ چند برابرِ اول است (${tenth} در برابر ${first})`);
  ok(fiftieth > tenth * 5, `لول ۵۰ خیلی گران‌تر از ۱۰ است (${fiftieth})`);
  ok(last > fiftieth * 1.5, `آخرین لول‌ها گران‌ترین‌اند (${last})`);

  // چند لولِ اول باید در یک نشستِ بازی قابل دستیابی باشند، وگرنه
  // کاربرِ تازه هیچ بازخوردی نمی‌گیرد.
  const afterThreeGames = 3 * L.XP_PLAY;
  ok(L.levelFromXp(afterThreeGames).level >= 1,
    `بعد از ۳ بازی دست‌کم لول ۱ (${afterThreeGames} XP)`);
}

console.log('\n== رسیدن به ۱۰۰ سخت است ولی غیرممکن نیست ==');
{
  // ═══════════════════════════════════════════════════════════════════════
  // چرا این تست وجود دارد
  // ═══════════════════════════════════════════════════════════════════════
  //
  // نسخهٔ اولِ منحنی فقط نمایی بود و محاسبه نشان داد لول ۱۰۰ برای
  // فعال‌ترین بازیکنِ ممکن ~۴۰ سال طول می‌کشد. آن «سخت» نیست،
  // **غیرممکن** است — و یک سقفِ غیرممکن انگیزه نمی‌سازد، از بین
  // می‌برد. با افزودنِ «زانو» در لول ۳۵ اصلاح شد.
  //
  // این تست هر دو کران را قفل می‌کند: نه آن‌قدر آسان که بی‌ارزش شود،
  // نه آن‌قدر سخت که بی‌معنی.
  const total = L.totalXpFor(100);
  // بازیکنِ حرفه‌ای: ۴۵ بازی آنلاین در روز، نیمی برد.
  const heavyPerDay = 45 * (L.XP_PLAY + L.XP_WIN_BONUS / 2);
  const years = total / heavyPerDay / 365;

  ok(years > 2, `برای پرکارترین بازیکن هم بیش از ۲ سال است (${years.toFixed(1)} سال)`);
  ok(years < 12, `ولی در افقِ دید هست، نه غیرممکن (${years.toFixed(1)} سال)`);

  // بازیکنِ معمولی باید در چند ماهِ اول پیشرفتِ محسوس ببیند.
  const casualPerDay = 8 * L.XP_PLAY;
  const lvlAfterMonth = L.levelFromXp(casualPerDay * 30).level;
  ok(lvlAfterMonth >= 5 && lvlAfterMonth <= 20,
    `بازیکنِ معمولی بعد از یک ماه لول ${lvlAfterMonth} است`);
}

console.log('\n== پیشرفتِ داخل لول ==');
{
  const info = L.levelFromXp(L.totalXpFor(5) + 10);
  ok(info.level === 5, 'لولِ درست');
  ok(info.into === 10, 'مقدارِ پیشرفتِ داخل لول درست است');
  ok(info.needed === L.xpForLevel(6), 'نیازِ لولِ بعدی درست است');
  ok(info.progress > 0 && info.progress < 1, 'پیشرفت بین ۰ و ۱ است');

  // دقیقاً روی آستانه: پیشرفت باید صفر شود نه یک.
  const exact = L.levelFromXp(L.totalXpFor(7));
  ok(exact.into === 0, 'روی آستانه، پیشرفت از صفر شروع می‌شود');
  ok(exact.progress === 0, 'نوارِ پیشرفت خالی است');

  // هیچ پیشرفتی نباید بیرون از بازهٔ ۰..۱ بیفتد.
  let inRange = true;
  for (let xp = 0; xp < 300000; xp += 977) {
    const p = L.levelFromXp(xp).progress;
    if (p < 0 || p > 1 || Number.isNaN(p)) inRange = false;
  }
  ok(inRange, 'پیشرفت همیشه بین ۰ و ۱ است');
}

console.log('\n== ضریب‌های XP ==');
{
  ok(L.XP_PLAY > 0, 'بازی کردن XP دارد');
  ok(L.XP_WIN_BONUS > 0, 'برد پاداشِ اضافه دارد');

  // ═══════════════════════════════════════════════════════════════════════
  // چرا نسبتِ برد به باخت محدود است
  // ═══════════════════════════════════════════════════════════════════════
  //
  // اگر بردن خیلی بیشتر می‌داد، بازیکنانِ ضعیف‌تر عملاً هیچ پیشرفتی
  // نمی‌دیدند و بازی را رها می‌کردند — در اپی که مخاطبش نوجوان است،
  // این مهم‌تر از عدالتِ رقابتی است.
  //
  // ولی اگر برابر بود، انگیزهٔ برد از بین می‌رفت.
  const ratio = (L.XP_PLAY + L.XP_WIN_BONUS) / L.XP_PLAY;
  ok(ratio > 1.2, `برد محسوس بیشتر است (${ratio.toFixed(2)}×)`);
  ok(ratio < 2.5, `ولی باخت هم بی‌ارزش نیست (${ratio.toFixed(2)}×)`);
}

console.log('\n== فقط بازیِ آنلاین XP می‌دهد ==');
{
  // مالک قبلاً صریح گفته بود بازیِ آفلاین نباید XP بدهد، و همان قانون
  // باید برای لول هم برقرار باشد — وگرنه می‌شود در چند دقیقه با ربات
  // لول گرفت.
  const fs = require('fs');
  const path = require('path');
  const eng = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'games', 'engine.js'), 'utf8');

  // فراخوانیِ لول باید **داخل** همان بلوکِ `if (!room.vsBot)` باشد.
  const guard = eng.indexOf('if (!room.vsBot)');
  const call = eng.indexOf('grantGameXp');
  ok(guard > 0, 'نگهبانِ vsBot در موتور هست');
  ok(call > guard, 'فراخوانیِ XP لول بعد از نگهبان است');

  // و باید در همان بلوک بماند: تا بستهٔ آکولاد نباید بیرون بیفتد.
  const block = eng.slice(guard, eng.indexOf('} catch', guard));
  ok(block.includes('grantGameXp'),
    'XP لول داخلِ بلوکِ vsBot است، نه بیرونش');
}

console.log('\n== کارایی ==');
{
  // این تابع در هر ردیفِ جدولِ لیگ و هر پیامِ چت صدا زده می‌شود.
  const t0 = Date.now();
  for (let i = 0; i < 200000; i++) L.levelFromXp(i * 13);
  const ms = Date.now() - t0;
  ok(ms < 500, `۲۰۰هزار محاسبه در ${ms}ms — به‌اندازهٔ کافی سریع`);
}

console.log(`\n${fail === 0 ? '✓' : '✗'} ${pass} تست موفق، ${fail} ناموفق`);
process.exit(fail === 0 ? 0 : 1);
