#!/usr/bin/env node
// Guardrails for the daily login streak feature.
//
// The owner called the old daily streak “awful”. These checks keep both parts
// fixed: the backend contract (one claim per Tehran day, safe point ledger) and
// the new premium first-frame UX on web/Android (bootstrap data + hero art).
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (cond, name) => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ ${name}`); }
};

const root = path.join(__dirname, '..', '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

const svc = read('backend/src/services/loginStreakService.js');
const server = read('backend/src/server.js');
const migration = read('backend/migrations/046_login_streak.sql');
const mobileCard = read('mobile/lib/screens/user/login_streak_card.dart');
const dashboard = read('mobile/lib/screens/user/dashboard_page.dart');
const webCard = read('userweb/src/components/LoginStreak.jsx');
const webHome = read('userweb/src/screens/Home.jsx');
const webMain = read('userweb/src/main.jsx');
const webCss = read('userweb/src/style.css');

console.log('\n== قرارداد سرور استریک روزانه ==');
{
  const rewardMatch = /const REWARDS = Object\.freeze\(\[([^\]]+)\]\)/.exec(svc);
  const rewards = rewardMatch[1].split(',').map(s => Number(s.trim())).filter(Boolean);
  ok(rewards.length === 7, 'چرخه دقیقاً ۷ روز دارد');
  ok(rewards[0] === 100 && rewards[6] === 500 && rewards[6] > rewards[5],
    'روز هفتم جایزهٔ بزرگ‌تر دارد');
  ok(/const CYCLE_DAYS = REWARDS\.length/.test(svc),
    'طول چرخه از خود لیست جوایز می‌آید، نه عددِ جدا');
  ok(/day >= CYCLE_DAYS \? 1 : day \+ 1/.test(svc),
    'بعد از روز هفتم، چرخهٔ هفتگی از روز اول ریست می‌شود');
  ok(/timeZone:\s*'Asia\/Tehran'/.test(svc),
    'محاسبهٔ روز با منطقهٔ زمانی تهران انجام می‌شود');
  ok(!/toISOString\(\)\.slice\(0, 10\)/.test(svc),
    'تاریخ با toISOString یک روز عقب نمی‌افتد');
  ok(/FOR UPDATE/.test(svc), 'claim ردیف کاربر را قفل می‌کند');
  ok(/dateValue\(row\?\.last_claimed_date\) === today/.test(svc)
     && /claimedNow:\s*false/.test(svc),
    'claim دوبارهٔ همان روز idempotent است و امتیاز دوباره نمی‌دهد');
  ok(/source:\s*'login_streak'/.test(svc) && /league:\s*false/.test(svc),
    'امتیاز استریک در دفتر با منبع مستقل ثبت می‌شود و لیگ را دستکاری نمی‌کند');
  ok(/publicStatus/.test(svc) && /module\.exports[\s\S]*publicStatus/.test(svc),
    'وضعیت عمومی یک مسیر تست‌پذیر و پایدار دارد');
}

console.log('\n== دیتابیس و API ==');
{
  ok(/CREATE TABLE IF NOT EXISTS login_streaks/.test(migration),
    'جدول login_streaks ساخته می‌شود');
  ok(/streak_day[\s\S]*CHECK \(streak_day BETWEEN 0 AND 7\)/.test(migration),
    'streak_day در بازهٔ ۰ تا ۷ قفل است');
  ok(/'login_streak'/.test(migration),
    'منبع login_streak در CHECK دفتر امتیازات مجاز است');
  ok(/streakState/.test(server) && /loginStreak\.status\(req\.user\.id\)\.catch\(\(\) => null\)/.test(server),
    'bootstrap وضعیت استریک را بدون شکستن داشبورد برمی‌گرداند');
  ok(/loginStreak:\s*streakState/.test(server),
    'کلاینت‌ها loginStreak را از /api/bootstrap می‌گیرند');
  ok(/app\.post\('\/api\/login-streak\/claim'/.test(server)
     && /loginStreakLimiter/.test(server),
    'مسیر claim محدودکنندهٔ نرخ دارد');
}

console.log('\n== اندروید: ظاهر و رفتار ۲۰۲۶ ==');
{
  ok(fs.existsSync(path.join(root, 'mobile/assets/pass/streak_hero.webp')),
    'تصویر جدید streak_hero.webp داخل assets اندروید وجود دارد');
  ok(fs.existsSync(path.join(root, 'mobile/assets/pass/cta_spark.png')),
    'آیکون شفاف CTA برای دکمهٔ دریافت داخل assets اندروید وجود دارد');
  ok(/SingleTickerProviderStateMixin/.test(mobileCard) && /AnimationController/.test(mobileCard),
    'کارت اندروید انیمیشن دائمی سبک دارد');
  ok(/CustomPaint/.test(mobileCard) && /_StreakParticlesPainter/.test(mobileCard),
    'ذرات و گلوهای پس‌زمینه با painter ارزان کشیده می‌شوند');
  ok(/assets\/pass\/streak_hero\.webp/.test(mobileCard),
    'کارت اندروید از تصویر قهرمان جدید استفاده می‌کند');
  ok(/assets\/pass\/cta_spark\.png/.test(mobileCard),
    'دکمهٔ دریافت اندروید از آیکون شفاف اختصاصی استفاده می‌کند');
  ok(/initialData/.test(mobileCard) && /onClaimed/.test(mobileCard),
    'کارت اندروید با bootstrap شروع می‌شود و بعد از claim امتیاز هدر را تازه می‌کند');
  ok(/_CompactStreakUnavailable/.test(mobileCard) && /widget\.compact\) return _CompactStreakUnavailable/.test(mobileCard),
    'در حالت فشرده، استریک هرگز از داشبورد غیب نمی‌شود و fallback دارد');
  ok(/استریک روزانه/.test(mobileCard) && /چرخه ۷ روزه/.test(mobileCard),
    'عنوان استریک روزانه و چرخهٔ هفت‌روزه در کارت فشرده واضح است');
  ok(/LoginStreakCard\([\s\S]*initialData:[\s\S]*loginStreak[\s\S]*onClaimed/.test(dashboard),
    'داشبورد اندروید دادهٔ bootstrap را به کارت استریک پاس می‌دهد');
  ok(/RadialGradient/.test(read('mobile/lib/screens/user/home_shell.dart')),
    'پوستهٔ اندروید یک پس‌زمینهٔ aurora سراسری دارد');
  ok(/_AdminBackdrop/.test(read('mobile/lib/screens/admin/admin_shell.dart')),
    'پنل ادمین اندروید هم از پس‌زمینهٔ پریمیوم یکپارچه استفاده می‌کند');
}

console.log('\n== وب: هم‌تراز با اندروید ==');
{
  ok(fs.existsSync(path.join(root, 'userweb/public/pass/streak_hero.webp')),
    'تصویر جدید برای وب هم منتشر می‌شود');
  ok(fs.existsSync(path.join(root, 'userweb/public/pass/cta_spark.png')),
    'آیکون شفاف CTA برای وب هم منتشر می‌شود');
  ok(/initialData/.test(webCard) && /onClaimed/.test(webCard),
    'کارت وب با bootstrap شروع می‌شود و بعد از claim reload می‌کند');
  ok(/streak_hero\.webp/.test(webCard), 'کارت وب از تصویر قهرمان جدید استفاده می‌کند');
  ok(/cta_spark\.png/.test(webCard), 'دکمهٔ دریافت وب از آیکون شفاف CTA استفاده می‌کند');
  ok(/loginStreak:\s*boot\.loginStreak/.test(webMain),
    'وب loginStreak را در state بوت‌استرپ نگه می‌دارد');
  ok(/initialData=\{p\.loginStreak\}/.test(webHome) && /onClaimed=\{load\}/.test(webHome),
    'صفحهٔ خانهٔ وب دادهٔ استریک و refresh را وصل کرده است');
  ok(/streakSpin/.test(webCss) && /streakHeroArt/.test(webCss) && /streakProgress/.test(webCss),
    'CSS وب کارت استریک را با گلو، تصویر و نوار پیشرفت جدید رندر می‌کند');
}

console.log(`\n${fail === 0 ? '✓' : '✗'} ${pass} تست موفق، ${fail} ناموفق`);
process.exit(fail === 0 ? 0 : 1);
