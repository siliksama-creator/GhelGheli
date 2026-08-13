/**
 * نگهبانِ احراز هویت — هر مسیر باید عمداً باز یا بسته باشد.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * چرا این نگهبان لازم است
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * سرور ۱۵۱ مسیر دارد. هر کدام یکی از این سه حالت را دارند:
 *
 *     app.get('/api/x', auth, ...)         ← فقط کاربرِ واردشده
 *     app.get('/api/x', adminAuth, ...)    ← فقط مدیر
 *     app.get('/api/x', ...)               ← عمومی
 *
 * حالتِ سوم گاهی **درست** است (health، ثبت‌نام، ورود، فهرستِ عمومیِ
 * جوایز) و گاهی یک حفرهٔ امنیتی. تفاوتشان فقط در ذهنِ کسی است که خط را
 * نوشته — و هیچ‌جا ثبت نشده.
 *
 * ⚠️ خطرِ واقعی: کسی مسیرِ تازه‌ای اضافه می‌کند و `auth` را جا می‌اندازد.
 *    هیچ خطایی نمی‌دهد، تست‌ها سبز می‌مانند، و کلاینت هم کار می‌کند —
 *    چون کلاینت هرحال توکن می‌فرستد. تنها کسی که متوجه می‌شود مهاجمی
 *    است که بدونِ توکن امتحان می‌کند.
 *
 * پس این فایل **فهرستِ سفیدِ صریح** دارد: هر مسیرِ عمومی باید اینجا با
 * دلیل نوشته شود. مسیرِ عمومیِ ناشناخته = تستِ قرمز.
 *
 * این همان الگویی است که برای سیگنال‌های اثرانگشت جواب داد: به‌جای
 * اعتماد به یادِ آدم‌ها، فهرست را در تست بگذار.
 */
const fs = require('fs');
const path = require('path');

let pass = 0;
let fail = 0;

function ck(name, cond, detail = '') {
  if (cond) { pass += 1; console.log('  ✓', name); }
  else { fail += 1; console.log('  ✗', name, detail ? `→ ${detail}` : ''); }
}

const ROOT = path.join(__dirname, '..');
const serverSource = fs.readFileSync(path.join(ROOT, 'src/server.js'), 'utf8');

// ═══════════════════════════════════════════════════════════════════════════
// مسیرهایی که **عمداً** بدونِ احراز هویت‌اند
// ═══════════════════════════════════════════════════════════════════════════
//
// هر ورودی دلیل دارد. اگر مسیری اینجا نیست و auth هم ندارد، یا حفره است
// یا باید با دلیل اضافه شود — و همان لحظهٔ اضافه کردن، آدم مجبور می‌شود
// دلیلش را بنویسد و به آن فکر کند.
// ⚠️ نسخهٔ اولِ این فهرست از روی **حدس** نوشته شد و چهار ورودیِ
//    ناموجود داشت (login-password، reset-password، …). یعنی ابزار در
//    همان اجرای اول دو چیز را نشان داد: سه مسیرِ عمومیِ فهرست‌نشده، و
//    اینکه خودم مسیرها را حدس زده بودم نه خوانده.
//
//    هر سه مسیرِ پیداشده بررسی شدند و **حفره نبودند** — ولی همین که
//    لازم شد یکی‌یکی بازشان کنم و دلیلشان را بنویسم، دقیقاً کاری است
//    که این فایل باید هر بار مجبور کند.
const PUBLIC_OK = new Map([
  ['GET /health', 'بررسی سلامت برای مانیتورینگ و deploy'],
  // تصویرهای آپلودشده از قبل هم عمومی بودند (express.static). این مسیر
  // فقط نسخهٔ کوچکِ همان فایل را می‌سازد و هیچ دادهٔ تازه‌ای فاش نمی‌کند.
  // نامِ فایل با regex محدود شده تا پیمایشِ مسیر ممکن نباشد و عرض هم
  // فقط از فهرستِ ثابت پذیرفته می‌شود.
  ['GET /uploads/images/:file', 'بندانگشتیِ تصویرِ عمومی — همان فایلِ static'],
  ['POST /api/auth/register', 'ثبت‌نام — هنوز کاربری وجود ندارد'],
  ['POST /api/auth/register-password', 'ثبت‌نام با رمز'],
  ['POST /api/auth/login', 'ورود — توکن اینجا ساخته می‌شود'],
  ['POST /api/auth/request-otp', 'درخواستِ کدِ یک‌بارمصرف'],
  ['POST /api/auth/verify-otp', 'تأییدِ کد'],
  ['POST /api/admin/auth/login', 'ورودِ مدیر'],

  // ── سه موردی که خودِ همین ابزار پیدا کرد ──
  //
  // `/api/games`: فقط `CATALOG` را برمی‌گرداند — یک ثابتِ درون‌کدی با
  // نام و قواعدِ بازی‌ها. هیچ دادهٔ کاربری ندارد و صفحهٔ بازی‌ها قبل از
  // ورود هم آن را می‌خواند.
  ['GET /api/games', 'کاتالوگِ ثابتِ بازی‌ها — بدونِ دادهٔ کاربر'],

  // `/api/chat/canned-messages`: متن‌های آمادهٔ چت، ثابتِ درون‌کدی.
  // خودِ چت (`/api/chat/messages`) با `auth` محافظت شده و سقفِ امتیاز
  // هم دارد.
  ['GET /api/chat/canned-messages', 'متن‌های آمادهٔ ثابت — بدونِ دادهٔ کاربر'],

  // `forgot-password/reset`: نمی‌تواند auth داشته باشد چون کاربر دقیقاً
  // به این دلیل اینجاست که نمی‌تواند وارد شود. محافظتش سه لایه است:
  // `otpVerifyLimiter`، کدِ یک‌بارمصرفِ هش‌شده با انقضا، و مصرفِ کد بعد
  // از استفاده.
  ['POST /api/auth/forgot-password/reset',
    'بازنشانیِ رمز — با otpVerifyLimiter و کدِ یک‌بارمصرف محافظت می‌شود'],
]);

// ═══════════════════════════════════════════════════════════════════════════
// استخراجِ مسیرها
// ═══════════════════════════════════════════════════════════════════════════
//
// ⚠️ regex روی کد شکننده است. برای همین دو نگهبان دارد:
//   ۱. تعدادِ پیداشده با شمارشِ مستقلِ `app.<verb>(` مقایسه می‌شود
//   ۲. اگر کمتر از ۱۰۰ مسیر پیدا شود، خودِ ابزار مشکوک اعلام می‌شود
//
// بدونِ این‌ها، یک تغییرِ قالب‌بندی می‌تواند ابزار را کور کند و ما
// «صفر مشکل» ببینیم چون هیچ‌چیز بررسی نشده.
const routeRe =
  /\b(?:app|router)\.(get|post|patch|put|delete)\(\s*(['"`])([^'"`]+)\2\s*,?\s*([^)]{0,160})/g;

function walkJs(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walkJs(full)
      : (entry.isFile() && entry.name.endsWith('.js') ? [full] : []);
  });
}

// Focused routers are all mounted at /api. Recursively scanning them is a
// security requirement: splitting server.js must not make this guard blind.
const sources = [
  { source: serverSource, prefix: '' },
  ...walkJs(path.join(ROOT, 'src/routes')).map(file => ({
    source: fs.readFileSync(file, 'utf8'), prefix: '/api',
  })),
];
const routes = [];
let declared = 0;
for (const item of sources) {
  declared += (item.source.match(/\b(?:app|router)\.(get|post|patch|put|delete)\(/g) || []).length;
  routeRe.lastIndex = 0;
  let match;
  while ((match = routeRe.exec(item.source)) !== null) {
    routes.push({
      verb: match[1].toUpperCase(),
      p: item.prefix + match[3],
      tail: match[4].replace(/\s+/g, ' '),
    });
  }
}

console.log('\n══ ۱. خودِ ابزار سالم است ══');
ck(`${routes.length} مسیر استخراج شد`, routes.length >= 100,
  'کمتر از ۱۰۰ یعنی regex شکسته — همهٔ بررسی‌های بعدی بی‌معنی می‌شوند');
ck('همهٔ مسیرهای اعلام‌شده پارس شدند',
  routes.length === declared, `${routes.length} از ${declared}`);

console.log('\n══ ۲. هیچ مسیرِ محافظت‌نشدهٔ ناشناخته‌ای نیست ══');
const unguarded = [];
for (const r of routes) {
  const key = `${r.verb} ${r.p}`;
  // میان‌افزارهایی که یعنی «محافظت‌شده».
  const guarded = /\b(auth|adminAuth|requireRole|adminOnly)\b/.test(r.tail);
  if (guarded) continue;
  if (PUBLIC_OK.has(key)) continue;
  unguarded.push(`${key}  [${r.tail.slice(0, 60)}]`);
}
ck('هر مسیرِ عمومی در فهرستِ سفید هست', unguarded.length === 0,
  '\n      ' + unguarded.join('\n      '));

console.log('\n══ ۳. فهرستِ سفید کهنه نشده ══');
// مسیری که در فهرستِ سفید است ولی دیگر وجود ندارد یعنی فهرست کهنه شده.
// خطرش این است که روزی مسیری با همان نام برگردد و بی‌سروصدا عمومی شود.
const live = new Set(routes.map(r => `${r.verb} ${r.p}`));
const stale = [...PUBLIC_OK.keys()].filter(k => !live.has(k));
ck('هیچ ورودیِ مردهٔ در فهرست نیست', stale.length === 0,
  stale.join(', ') + ' — حذفشان کنید');

console.log('\n══ ۴. مسیرهای مدیریتی حتماً adminAuth دارند ══');
// هر چیزی زیرِ /api/admin باید مدیر بخواهد. یک `auth` ساده کافی نیست:
// یعنی هر کاربرِ عادی هم می‌تواند صدایش بزند.
const adminLeaks = [];
for (const r of routes) {
  if (!r.p.startsWith('/api/admin')) continue;
  if (`${r.verb} ${r.p}` === 'POST /api/admin/auth/login') continue;
  if (!/\badminAuth\b/.test(r.tail)) {
    adminLeaks.push(`${r.verb} ${r.p}  [${r.tail.slice(0, 50)}]`);
  }
}
ck('همهٔ مسیرهای /api/admin با adminAuth محافظت‌اند',
  adminLeaks.length === 0, '\n      ' + adminLeaks.join('\n      '));

console.log('\n══ ۵. مسیرهای پولی محافظتِ اضافه دارند ══');
// برداشتِ پول و خریدِ فروشگاه روی پولِ واقعی کار می‌کنند. اینجا فقط
// `auth` کافی است (کاربرِ خودش)، ولی باید **حتماً** باشد.
const money = routes.filter(r =>
  /withdraw|shop|wallet|plus/i.test(r.p) && !r.p.startsWith('/api/admin'));
const moneyUnguarded = money.filter(r => !/\bauth\b/.test(r.tail));
ck(`${money.length} مسیرِ پولی، همه با auth`,
  moneyUnguarded.length === 0,
  moneyUnguarded.map(r => `${r.verb} ${r.p}`).join(', '));

console.log('\n══ ۶. مسیرهای حساس سقفِ نرخ دارند ══');
// ورود و ثبت‌نام بدونِ سقفِ نرخ یعنی حدسِ رمز نامحدود.
const needLimiter = [
  'POST /api/auth/login-password',
  'POST /api/auth/login',
  'POST /api/admin/auth/login',
  'POST /api/auth/request-otp',
];
for (const key of needLimiter) {
  const r = routes.find(x => `${x.verb} ${x.p}` === key);
  if (!r) continue;   // مسیر ممکن است وجود نداشته باشد
  ck(`${key} سقفِ نرخ دارد`,
    /[Ll]imiter/.test(r.tail), `[${r.tail.slice(0, 60)}]`);
}

console.log(`\n${fail ? '✗' : '✓'} ${pass} موفق، ${fail} ناموفق\n`);
process.exit(fail ? 1 : 0);
