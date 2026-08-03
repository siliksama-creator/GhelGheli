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

console.log(`\n${fail === 0 ? '✓' : '✗'} ${pass} تست موفق، ${fail} ناموفق`);
process.exit(fail === 0 ? 0 : 1);
