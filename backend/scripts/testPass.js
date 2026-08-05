#!/usr/bin/env node
// تست‌های گذر نبرد و یادآور گردونه.
//
// این‌ها منطق خالص را می‌سنجند (منحنی XP، ساعات استراحت، اقتصاد جوایز)
// بدون نیاز به دیتابیس — همان الگویی که بقیهٔ اسکریپت‌های تست دارند.
//
//   node scripts/testPass.js
let pass = 0, fail = 0;
const ok = (cond, name) => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ ${name}`); }
};

// ── منحنی XP ──────────────────────────────────────────────────────────────
// از سورس واقعی خوانده می‌شود نه کپی، تا drift نکند.
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'services', 'passService.js'), 'utf8');

function extract(name) {
  const start = src.indexOf(`function ${name}(`);
  if (start === -1) throw new Error(`${name} پیدا نشد`);
  let d = 0, end = -1, started = false;
  for (let i = start; i < src.length; i++) {
    if (src[i] === '{') { d++; started = true; }
    else if (src[i] === '}') { d--; if (started && d === 0) { end = i + 1; break; } }
  }
  return src.slice(start, end);
}
const TIER_COUNT = Number(/const TIER_COUNT = (\d+)/.exec(src)[1]);
// eslint-disable-next-line no-new-func
const pgDateToDay = new Function(`${extract('pgDateToDay')}; return pgDateToDay;`)();
const XP_BASE = Number(/const XP_BASE = (\d+)/.exec(src)[1]);
const XP_STEP = Number(/const XP_STEP = (\d+)/.exec(src)[1]);
// eslint-disable-next-line no-new-func
const fns = new Function(
  `const TIER_COUNT=${TIER_COUNT},XP_BASE=${XP_BASE},XP_STEP=${XP_STEP};
   ${extract('xpForTier')} ${extract('cumulativeXp')} ${extract('tierFromXp')}
   return {xpForTier,cumulativeXp,tierFromXp};`)();
const { xpForTier, cumulativeXp, tierFromXp } = fns;

console.log('\n== منحنی XP ==');
{
  ok(TIER_COUNT === 50, 'فصل ۵۰ پله دارد');
  ok(xpForTier(1) === 100, 'پلهٔ اول ۱۰۰ XP است');
  ok(xpForTier(50) > xpForTier(1), 'منحنی صعودی است');
  let mono = true;
  for (let t = 2; t <= 50; t++) if (xpForTier(t) <= xpForTier(t - 1)) mono = false;
  ok(mono, 'هر پله از قبلی گران‌تر است');

  const total = cumulativeXp(50);
  ok(total > 9000 && total < 12000,
    `کل فصل ${total.toLocaleString()} XP — در بازهٔ قابل دستیابی`);

  // یک کاربر فعال روزانه ~۲۵۰ XP می‌گیرد؛ در ۴۲ روز باید تقریباً تمام کند.
  const daily = 250, days = 42;
  const reachable = daily * days;
  ok(reachable >= total * 0.9,
    `کاربر فعال (${daily} XP در روز) در ${days} روز به ${(reachable / total * 100).toFixed(0)}٪ مسیر می‌رسد`);
  // ولی کاربر نصفه‌فعال نباید تمام کند — وگرنه پلاس بی‌ارزش می‌شود.
  ok(daily * 0.4 * days < total,
    'کاربر کم‌فعال کل مسیر را تمام نمی‌کند');
}

console.log('\n== تبدیل XP به پله ==');
{
  ok(tierFromXp(0).tier === 0, 'صفر XP یعنی پلهٔ صفر');
  ok(tierFromXp(99).tier === 0, 'کمتر از پلهٔ اول هنوز صفر است');
  ok(tierFromXp(100).tier === 1, 'دقیقاً ۱۰۰ یعنی پلهٔ ۱');
  ok(tierFromXp(cumulativeXp(10)).tier === 10, 'XP تجمعی پلهٔ ۱۰ درست است');
  ok(tierFromXp(cumulativeXp(50)).tier === 50, 'انتهای مسیر پلهٔ ۵۰ است');
  ok(tierFromXp(999999).tier === 50, 'XP بیش از حد از ۵۰ فراتر نمی‌رود');
  ok(tierFromXp(-5).tier === 0, 'XP منفی کرش نمی‌کند');
  const p = tierFromXp(150);
  ok(p.tier === 1 && p.into === 50, 'پیشرفت داخل پله درست حساب می‌شود');
}

console.log('\n== 🔒 سقف سخت ۲ پله در روز — ایراد مالک ==');
{
  const svc = src;
  const MAX = Number(/const MAX_TIERS_PER_DAY = (\d+)/.exec(svc)[1]);
  ok(MAX === 2, `سقف روزانه ${MAX} پله است`);

  // اندازه‌گیریِ مشکلِ قبلی، تا هرگز برنگردد
  const caps = [...svc.matchAll(/dailyCap:\s*(\d+)/g)].map(m => Number(m[1]));
  const maxXp = caps.reduce((a, b) => a + b, 0);
  let acc = 0, tiersInOneDay = 0;
  for (let t = 1; t <= 50; t++) {
    acc += xpForTier(t);
    if (acc <= maxXp) tiersInOneDay = t; else break;
  }
  ok(tiersInOneDay > MAX,
    `بدون سقف، کاربر ${tiersInOneDay} پله در روز باز می‌کرد — برای همین سقف لازم بود`);

  ok(/unlocked_tier/.test(svc), 'پلهٔ باز شده جدا از XP ذخیره می‌شود');
  ok(/const room = Math\.max\(0, MAX_TIERS_PER_DAY - usedToday\)/.test(svc),
    'فضای باقی‌ماندهٔ امروز محاسبه می‌شود');
  ok(/const grant = Math\.min\(Math\.max\(0, earned - current\), room\)/.test(svc),
    'تعداد پلهٔ اعطایی به سقف روزانه محدود است');

  // claim باید از unlocked_tier بخواند نه XP — وگرنه سقف بی‌معنی است
  ok(/unlocked < tier\.tier/.test(svc),
    'دریافت جایزه از unlocked_tier بررسی می‌شود نه از XP');
  ok(!/pos\.tier < tier\.tier/.test(svc),
    'مسیر قدیمیِ مبتنی بر XP حذف شده');

  // XP نباید سوزانده شود
  ok(/xp = user_pass_progress\.xp \+ EXCLUDED\.xp/.test(svc),
    'XP اضافه همیشه ذخیره می‌شود — فردا تبدیل به پله می‌شود');

  // وضعیت باید سقف را به کلاینت بگوید (برای نشانِ قرمز)
  ok(/tiersToday/.test(svc) && /maxTiersPerDay/.test(svc),
    'وضعیت شمارندهٔ امروز را برای نشانِ آیکون می‌فرستد');
  ok(/dayCapReached/.test(svc), 'وضعیت می‌گوید سقف امروز پر شده یا نه');
  ok(/pendingTiers/.test(svc), 'پله‌های معلق (XP دارد ولی سقف پر) گزارش می‌شود');

  const srv = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'server.js'), 'utf8');
  ok(/tiersToday: st\.tiersToday/.test(srv),
    'بوت‌استرپ شمارندهٔ امروز را می‌فرستد — نشانِ نوار بالا به آن نیاز دارد');

  const mig = fs.readFileSync(
    path.join(__dirname, '..', 'migrations', '032_pass_daily_tier_cap.sql'), 'utf8');
  ok(/unlocked_tier/.test(mig) && /tiers_today/.test(mig),
    'مایگریشن ستون‌های لازم را می‌سازد');
  ok(/n \* \(195 \+ 5 \* n\) \/ 2 <= p\.xp/.test(mig),
    'کاربران فعلی پله‌شان از روی XP بازسازی می‌شود، نه صفر');
}

console.log('\n== 🐛 دو باگ واقعی که روی سرور زنده پیدا شدند ==');
{
  const svc = src;

  // باگ ۱: وقتی سقفِ XPِ یک منبع پر بود، grantXp زودهنگام return می‌کرد
  // و پله **هرگز** باز نمی‌شد — حتی فردا.
  ok(/const sync = await syncTiers\(userId, season\.id, client\);\s*\n\s*await client\.query\('COMMIT'\);\s*\n\s*return \{ gained: 0/.test(svc),
    'وقتی سقف XP منبع پر است، باز هم پله‌ها همگام می‌شوند');
  ok(/await syncTiers\(userId, season\.id\)\.catch/.test(svc),
    'status هم پله‌ها را همگام می‌کند — کاربری که فقط صفحه را باز می‌کند هم پله می‌گیرد');

  // باگ ۲: خطای منطقهٔ زمانی. pg یک DATE را با منطقهٔ سرور تفسیر می‌کند،
  // پس toISOString() یک روز عقب می‌داد و سقف هر بار صفر می‌شد.
  ok(typeof pgDateToDay === 'function', 'تابع تبدیل تاریخ وجود دارد');
  ok(!/toISOString\(\)\.slice\(0, 10\)/.test(svc),
    'هیچ‌جای سرویس دیگر از toISOString برای تاریخ استفاده نمی‌کند');
  ok(/pgDateToDay\(row\.tiers_day\) === day/.test(svc)
     && /pgDateToDay\(pr\.tiers_day\) === day/.test(svc),
    'هر دو مقایسهٔ تاریخ از تابع امن استفاده می‌کنند');

  // خودِ تابع را بسنج: یک DATE که pg برمی‌گرداند
  const asPgWouldReturn = new Date(2026, 7, 4); // ۴ آگوست، محلی
  ok(pgDateToDay(asPgWouldReturn) === '2026-08-04',
    'DATE محلی درست به رشته تبدیل می‌شود (نه یک روز عقب)');
  ok(pgDateToDay('2026-08-04') === '2026-08-04', 'رشته هم پشتیبانی می‌شود');
  ok(pgDateToDay(null) === null, 'null کرش نمی‌کند');
  ok(pgDateToDay('bad') === 'bad'.slice(0, 10), 'ورودی خراب کرش نمی‌کند');

  // اثباتِ باگ، مستقل از منطقهٔ زمانیِ ماشینی که تست را اجرا می‌کند:
  // سرور روی Asia/Tehran (UTC+3:30) است، پس نیمه‌شبِ محلی در UTC مربوط
  // به روز قبل است. یک Date با آفست مثبت می‌سازیم تا همان شرایط را
  // بازتولید کند.
  const tehranMidnightUtc = new Date('2026-08-03T20:30:00.000Z');
  ok(tehranMidnightUtc.toISOString().slice(0, 10) === '2026-08-03',
    'روش قدیمی روی نیمه‌شبِ تهران «2026-08-03» می‌داد — یک روز عقب، و همین سقف را بی‌اثر می‌کرد');
}

console.log('\n== ریاضیِ بازسازی پله برای کاربران فعلی ==');
{
  // فرمول SQL باید دقیقاً با cumulativeXp بخواند، وگرنه کاربران موجود
  // یک پله جلو یا عقب می‌افتند.
  const formula = (n) => (n * (195 + 5 * n)) / 2;
  let same = true;
  for (let n = 1; n <= 50; n++) if (cumulativeXp(n) !== formula(n)) same = false;
  ok(same, 'فرمول SQL با cumulativeXp دقیقاً یکی است');
}

console.log('\n== سقف روزانهٔ منابع XP ==');
{
  const caps = [...src.matchAll(/dailyCap:\s*(\d+)/g)].map(m => Number(m[1]));
  ok(caps.length >= 6, `${caps.length} منبع XP تعریف شده`);
  const maxDaily = caps.reduce((a, b) => a + b, 0);
  ok(maxDaily < cumulativeXp(50),
    `حتی با پر کردن همهٔ سقف‌ها (${maxDaily} XP در روز) نمی‌شود فصل را یک‌روزه تمام کرد`);
  ok(maxDaily * 3 < cumulativeXp(50),
    'حتی سه روزِ کاملاً پر هم کافی نیست — گذر واقعاً فصلی می‌ماند');
}

console.log('\n== ساعات استراحت یادآور گردونه ==');
{
  const w = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'services', 'wheelReminderService.js'), 'utf8');
  const start = w.indexOf('function withinQuietHours(');
  let d = 0, end = -1, started = false;
  for (let i = start; i < w.length; i++) {
    if (w[i] === '{') { d++; started = true; }
    else if (w[i] === '}') { d--; if (started && d === 0) { end = i + 1; break; } }
  }
  const hourSrc = w.slice(w.indexOf('function tehranHour('),
    w.indexOf('/** روز جاری'));
  // eslint-disable-next-line no-new-func
  const quiet = new Function(`${hourSrc}\n${w.slice(start, end)}\nreturn withinQuietHours;`)();

  // زمان‌ها به UTC ساخته می‌شوند و تابع خودش به تهران تبدیل می‌کند.
  const at = (tehranH) => {
    // تهران UTC+3:30 → ساعت UTC معادل
    const utcH = (tehranH - 3.5 + 24) % 24;
    const d2 = new Date(Date.UTC(2026, 6, 15, Math.floor(utcH), (utcH % 1) * 60));
    return d2;
  };
  ok(quiet(at(23)) === true, 'ساعت ۲۳ تهران: ساکت ✓');
  ok(quiet(at(2)) === true, 'ساعت ۲ بامداد: ساکت ✓');
  ok(quiet(at(7)) === true, 'ساعت ۷ صبح: ساکت ✓');
  ok(quiet(at(8)) === true, 'ساعت ۸ صبح: هنوز ساکت ✓');
  ok(quiet(at(10)) === false, 'ساعت ۱۰ صبح: مجاز');
  ok(quiet(at(18)) === false, 'ساعت ۱۸: مجاز — زمان ارسال یادآور');
  ok(quiet(at(21)) === false, 'ساعت ۲۱: هنوز مجاز');
  ok(quiet(at(22)) === true, 'ساعت ۲۲: شروع سکوت ✓');

  ok(/timezone:\s*'Asia\/Tehran'/.test(
      fs.readFileSync(path.join(__dirname, '..', 'src', 'server.js'), 'utf8')),
    'cron با منطقهٔ زمانی تهران تنظیم شده');
  ok(/cron\.schedule\('30 18 \* \* \*'/.test(
      fs.readFileSync(path.join(__dirname, '..', 'src', 'server.js'), 'utf8')),
    'یادآور ساعت ۱۸:۳۰ اجرا می‌شود، نه نیمه‌شب');
}

console.log('\n== اقتصاد جوایز — بدون نقدی ==');
{
  const mig = fs.readFileSync(
    path.join(__dirname, '..', 'migrations', '031_pass_no_cash_economics.sql'), 'utf8');

  // ═══════════════════════════════════════════════════════════════════════
  // ایرادی که مالک گرفت: کمیسیون کافه‌بازار در مدل اول نبود.
  // ═══════════════════════════════════════════════════════════════════════
  const PRICE = Number(
    /const PLUS_PRICE = (\d+)/.exec(
      fs.readFileSync(path.join(__dirname, '..', 'src', 'services', 'shopService.js'), 'utf8'))[1]);
  const VAT = 0.10, COMMISSION = 0.15, COMMISSION_HIGH = 0.30;
  const net     = PRICE / (1 + VAT) * (1 - COMMISSION);
  const netHigh = PRICE / (1 + VAT) * (1 - COMMISSION_HIGH);

  ok(PRICE === 59000, `قیمت پلاس ${PRICE.toLocaleString()} تومان`);
  ok(Math.round(net) === 45591,
    `درآمد خالص بعد از ارزش افزوده و کمیسیون ۱۵٪: ${Math.round(net).toLocaleString()} تومان`);

  // هزینهٔ واقعی: فقط چرخش‌ها. آیتم ظاهری یک فایل است، نه پول.
  const SPIN_EV = 0.80;
  const plusSpins = 60, freeSpins = 15;
  const realCostPlus = plusSpins * SPIN_EV;
  const realCostFree = freeSpins * SPIN_EV;

  ok(realCostPlus < 100,
    `هزینهٔ واقعی مسیر پلاس: ${Math.round(realCostPlus)} تومان (فقط EV چرخش‌ها)`);
  const margin = (net - realCostPlus) / net;
  ok(margin > 0.98,
    `حاشیهٔ سود ${(margin * 100).toFixed(0)}٪ — قبلاً با نقدی ۳۷٪ بود`);
  ok(netHigh - realCostPlus > 30000,
    `حتی با کمیسیون ۳۰٪ سود ${Math.round(netHigh - realCostPlus).toLocaleString()} می‌ماند`);

  // با ۱۰٬۰۰۰ کاربر رایگان
  const freeTotal = 10000 * realCostFree;
  ok(freeTotal < 200000,
    `هزینهٔ ۱۰٬۰۰۰ کاربر رایگان در کل فصل: ${Math.round(freeTotal).toLocaleString()} تومان`);

  // ── هیچ نقدی‌ای نباید در هیچ مسیری بماند ────────────────────────────
  ok(/kind='spins'[\s\S]{0,200}track='free' AND kind='cash'/.test(mig),
    'نقدیِ مسیر رایگان به چرخش تبدیل شد');
  ok(/track='plus' AND kind='cash'/.test(mig),
    'نقدیِ مسیر پلاس هم تبدیل شد');
  ok(!/kind='cash', amount=[1-9]/.test(mig),
    'مایگریشن هیچ نقدیِ جدیدی نمی‌سازد');

  // ارزش درک‌شده باید خیلی بیشتر از قیمت باشد، وگرنه کسی نمی‌خرد
  const ITEM_PRICE = 19000, plusItems = 8;
  const perceived = plusItems * ITEM_PRICE;
  ok(perceived > PRICE * 2,
    `ارزش درک‌شدهٔ آیتم‌ها ${perceived.toLocaleString()} = ${(perceived / PRICE).toFixed(1)} برابر قیمت`);

  ok(/UPDATE shop_items SET price = 19000 WHERE kind = 'club_badge'/.test(
      fs.readFileSync(path.join(__dirname, '..', 'migrations', '030_battle_pass.sql'), 'utf8')),
    'نشان باشگاه ۱۹٬۰۰۰ تومان');
}

console.log('\n== محافظ‌های امنیتی ==');
{
  const svc = src;
  ok(/ON CONFLICT DO NOTHING RETURNING tier_id/.test(svc),
    'دریافت دوبارهٔ یک پله در سطح دیتابیس مسدود است');
  ok(/PRIMARY KEY \(user_id, tier_id\)/.test(
      fs.readFileSync(path.join(__dirname, '..', 'migrations', '030_battle_pass.sql'), 'utf8')),
    'کلید مرکب، تضمینِ یک‌بار-دریافت');
  ok(/hasPlus\(userId, client\)/.test(svc),
    'جایزهٔ مسیر پلاس بدون اشتراک داده نمی‌شود');
  ok(!/grantXp[\s\S]{0,400}price|buyXp|purchaseXp/.test(svc),
    'هیچ راهی برای خریدن XP وجود ندارد — pay-to-win نیست');
  ok(/source: 'pass'/.test(svc), 'واریز نقدی منبع اختصاصی دارد');
}

// ═══════════════════════════════════════════════════════════════════════════
// ثبت کارت هرگز نباید گذر نبرد را باز کند
// ═══════════════════════════════════════════════════════════════════════════
//
// خواستهٔ صریح مالک: «ثبت کارت در هیچ حالتی نباید بتل‌پس رو چه در رایگان
// چه در پلاس باز کنه».
//
// چرا سه بررسیِ جدا و نه یکی:
//
//   ۱. اکشن در `SOURCES` نباشد — چون `grantXp` برای اکشنِ ناشناخته
//      بی‌سروصدا return می‌کند، این تنها ضمانتِ واقعی است.
//   ۲. هیچ فایلی `grantXp` را با اکشنِ کارتی صدا نزند — تا اگر روزی
//      کسی اکشن را برگرداند، این هم بگیردش.
//   ۳. مسیرهای ثبت کارت اصلاً `grantXp` نداشته باشند — نگهبانِ سوم،
//      چون نامِ اکشن ممکن است فردا عوض شود.
{
  const svcPath = path.join(__dirname, '..', 'src', 'services', 'passService.js');
  const svcSrc = fs.readFileSync(svcPath, 'utf8');

  // فقط بدنهٔ SOURCES، نه کامنت‌هایی که دربارهٔ حذفش توضیح می‌دهند.
  const srcBlock = /const SOURCES = \{([\s\S]*?)\n\};/.exec(svcSrc)[1]
    .split('\n')
    .filter(line => !line.trim().startsWith('//'))
    .join('\n');

  ok(!/card_redeem|card_photo|photo_card/.test(srcBlock),
    'هیچ اکشنی برای ثبت کارت در SOURCES نیست');

  // فراخوانی‌ها در کلِ بک‌اند
  const roots = [
    path.join(__dirname, '..', 'src'),
  ];
  const files = [];
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      if (fs.statSync(full).isDirectory()) walk(full);
      else if (name.endsWith('.js')) files.push(full);
    }
  };
  roots.forEach(walk);

  let cardXpCall = null;
  let cardRouteXp = null;
  for (const f of files) {
    const body = fs.readFileSync(f, 'utf8');
    const code = body.split('\n')
      .filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
      .join('\n');

    if (/grantXp\s*\([^)]*['"](card_redeem|card_photo|photo_card)['"]/.test(code)) {
      cardXpCall = f;
    }
    // مسیرهای «ثبت کارت با عکس» نباید هیچ grantXpی داشته باشند.
    if (f.endsWith('photoCards.js') && /grantXp/.test(code)) {
      cardRouteXp = f;
    }
  }
  ok(cardXpCall === null,
    `هیچ‌جا grantXp با اکشنِ کارتی صدا زده نمی‌شود${cardXpCall ? ` (${cardXpCall})` : ''}`);
  ok(cardRouteXp === null,
    `مسیرِ «کارت با عکس» هیچ XP گذر نبردی نمی‌دهد${cardRouteXp ? ` (${cardRouteXp})` : ''}`);

  // مسیرِ قدیمیِ ثبت کد هم همین‌طور: بلوکِ /api/cards/redeem را جدا کن.
  const serverSrc = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'server.js'), 'utf8');
  const redeemStart = serverSrc.indexOf("app.post('/api/cards/redeem'");
  const redeemEnd = serverSrc.indexOf("app.post('/api/cards/", redeemStart + 10);
  const redeemBlock = serverSrc.slice(
    redeemStart, redeemEnd > 0 ? redeemEnd : redeemStart + 6000)
    .split('\n')
    .filter(l => !l.trim().startsWith('//'))
    .join('\n');
  ok(!/grantXp/.test(redeemBlock),
    'مسیرِ قدیمیِ «ثبت کد کارت» هم XP گذر نبرد نمی‌دهد');
}

console.log(`\n${fail === 0 ? '✓' : '✗'} ${pass} تست موفق، ${fail} ناموفق`);
process.exit(fail === 0 ? 0 : 1);
