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
const fs = require('fs');
const path = require('path');
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

console.log('\n== کالیبراسیون: لول ۱۰۰ = شش ماه تلاش مداوم ==');
{
  // ═══════════════════════════════════════════════════════════════════════
  // چرا این عددها و نه «سخت باشد» کیفی
  // ═══════════════════════════════════════════════════════════════════════
  //
  // خواستهٔ مالک صریح و عددی بود: «کاربر برای اینکه به لول ۱۰۰ برسه
  // نیاز به ۶ ماه تلاش مداوم داره».
  //
  // «مداوم» به یک تعریفِ عملیاتی ترجمه شد: بازیکنی که **هر روز** ۳۰
  // بازیِ آنلاین می‌کند و نیمی را می‌برد. این تست همان تعریف را قفل
  // می‌کند تا اگر کسی فردا ضریبی را دستکاری کند، فوراً قرمز شود.
  //
  // نسخهٔ قبلی ۳.۹ سال بود — کالیبراسیونی بر اساسِ حدسِ من از «سخت»،
  // نه عددی که مالک داد.
  const perDayHeavy = 30 * (L.XP_PLAY + (L.XP_PLAY + L.XP_WIN_BONUS)) / 2;
  const total = L.totalXpFor(100);
  const months = total / perDayHeavy / 30;

  ok(months > 5.4 && months < 6.6,
    `بازیکنِ پرکار در ${months.toFixed(1)} ماه به ۱۰۰ می‌رسد (هدف: ۶)`);

  // بازیکنِ معمولی باید مسیرِ بلندتری داشته باشد، وگرنه لول بی‌ارزش
  // می‌شود — ولی نه آن‌قدر بلند که ناامیدکننده باشد.
  const perDayNormal = 15 * (L.XP_PLAY + (L.XP_PLAY + L.XP_WIN_BONUS)) / 2;
  const normalMonths = total / perDayNormal / 30;
  ok(normalMonths > 9 && normalMonths < 18,
    `بازیکنِ معمولی در ${normalMonths.toFixed(0)} ماه می‌رسد`);

  // و حرفه‌ای‌ترین بازیکن هم نباید در چند هفته تمامش کند.
  const perDayPro = 50 * (L.XP_PLAY + (L.XP_PLAY + L.XP_WIN_BONUS)) / 2;
  const proMonths = total / perDayPro / 30;
  ok(proMonths > 2.5,
    `حتی حرفه‌ای‌ترین بازیکن هم ${proMonths.toFixed(1)} ماه وقت می‌گذارد`);
}

console.log('\n== چند لول اول واقعاً راحت‌اند ==');
{
  // «چندتا لول اول راحت باشه» — خواستهٔ قبلیِ مالک که باید بعد از
  // بازکالیبراسیون هم برقرار بماند.
  ok(L.xpForLevel(1) <= L.XP_PLAY,
    `لول اول با یک بازی می‌آید (${L.xpForLevel(1)} XP)`);
  ok(L.levelFromXp(L.XP_PLAY).level >= 1,
    'بعد از اولین بازی، کاربر لول‌آپ را می‌بیند');

  // بعد از یک ماهِ بازیِ معمولی باید پیشرفتِ محسوس ولی نه افراطی باشد.
  const monthNormal = 15 * (L.XP_PLAY + (L.XP_PLAY + L.XP_WIN_BONUS)) / 2 * 30;
  const lvl = L.levelFromXp(monthNormal).level;
  ok(lvl >= 15 && lvl <= 45,
    `بازیکنِ معمولی بعد از یک ماه لول ${lvl} است`);
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
  const eng = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'games', 'engine.js'), 'utf8');

  // بازی رایگانِ خصوصی هم طبق تصمیم محصول XP ندارد؛ بنابراین نگهبان
  // کامل حالا هم انسان‌بودن حریف و هم stake مثبت را می‌سنجد.
  const guardMatch = eng.match(/if\s*\(\s*!room\.vsBot\s*&&\s*room\.stake\s*>\s*0\s*\)/);
  const guard = guardMatch?.index ?? -1;
  const call = eng.indexOf('grantGameXp');
  ok(guard > 0, 'نگهبانِ انسان‌بودن + stake مثبت در موتور هست');
  ok(call > guard, 'فراخوانیِ XP لول بعد از نگهبان است');

  const block = eng.slice(guard, eng.indexOf('} catch', guard));
  ok(block.includes('grantGameXp'),
    'XP لول داخلِ بلوکِ مسابقهٔ آنلاین امتیازی است');
  ok(block.includes('won: resolvedWinner === sym'),
    'XP بردِ لول از resolvedWinner می‌آید نه از DISCONNECT');
  ok(block.includes('if (resolvedWinner === sym)'),
    'XP بردِ گذر نبرد هم از resolvedWinner است');
}

console.log('\n== مسیرهای require واقعاً وجود دارند ==');
{
  // ═══════════════════════════════════════════════════════════════════════
  // چرا این تست وجود دارد — یک باگِ واقعی که تستِ واحد نگرفت
  // ═══════════════════════════════════════════════════════════════════════
  //
  // `levelService` پول را **تنبل** بارگذاری می‌کند تا منحنی بدون
  // دیتابیس قابل تست باشد. عوارضش این بود که مسیرِ اشتباهِ
  // `require('../db')` تا **زمانِ اجرا روی سرور** پنهان ماند:
  //
  //     [level] statusFor failed: Cannot find module '../db'
  //
  // همهٔ ۳۸ تستِ واحد سبز بودند چون هیچ‌کدام تابعی را صدا نمی‌زدند که
  // به دیتابیس نیاز داشته باشد. تابع هم خطا را می‌بلعد و مقدارِ
  // پیش‌فرض می‌دهد، پس API «کار می‌کرد» و همه‌جا لول صفر نشان می‌داد
  // — بدونِ هیچ خطای قابل دیدنی برای کاربر.
  //
  // این تست همان مسیرها را **بدون اتصال به دیتابیس** بررسی می‌کند:
  // `require.resolve` فقط وجودِ فایل را می‌سنجد و چیزی را اجرا
  // نمی‌کند.
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'services', 'levelService.js'), 'utf8');
  const paths = [...src.matchAll(/require\('(\.\.?\/[^']+)'\)/g)].map(m => m[1]);
  ok(paths.length > 0, `${paths.length} مسیرِ نسبی در سرویس هست`);

  let allResolve = true;
  for (const rel of paths) {
    try {
      require.resolve(path.join(__dirname, '..', 'src', 'services', rel));
    } catch {
      allResolve = false;
      console.error(`    مسیرِ شکسته: ${rel}`);
    }
  }
  ok(allResolve, 'همهٔ مسیرهای require قابل حل هستند');

  // و مسیرِ درستِ pool همان چیزی باشد که بقیهٔ سرویس‌ها استفاده می‌کنند.
  const passSrc = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'services', 'passService.js'), 'utf8');
  const dbPath = (passSrc.match(/require\('(\.\.\/[^']*db)'\)/) || [])[1];
  ok(dbPath && src.includes(dbPath),
    `مسیرِ دیتابیس با بقیهٔ سرویس‌ها یکی است (${dbPath})`);
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
