/**
 * نگهبانِ لوگوهای باشگاه — «فقط لوگو های باشگاه دست نخوره».
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * چرا این تست وجود دارد
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * درخواستِ صریحِ مالک هنگامِ ساختِ APK. و نگرانی‌اش بی‌جا نبود: در همین
 * جلسه ابزارِ `reset_for_launch.py` نوشته شد که **۴۷۳ فایل** را از
 * `uploads/` پاک می‌کند، و منطقش «هر فایلی که در دیتابیس ارجاع ندارد».
 *
 * لوگوها امروز از آن ابزار در امان‌اند — ولی به دلیلی که در **جای دیگری**
 * نوشته شده و به‌راحتی می‌تواند عوض شود:
 *
 *   • لوگوها در `userweb/public/shop/` و `mobile/assets/shop/` هستند،
 *     نه در `backend/uploads/`. پس ابزارِ پاکسازی اصلاً آن پوشه را
 *     نمی‌بیند.
 *   • در git ردیابی می‌شوند، پس `git checkout` برشان می‌گرداند.
 *
 * ⚠️ خطرِ واقعی این است که کسی (شاید خودِ من، شش ماه بعد) تصمیم بگیرد
 *    لوگوها را به `uploads/` منتقل کند تا «مدیر بتواند از پنل عوضشان
 *    کند». آن لحظه، اولین اجرای پاکسازی همه را می‌برد و هیچ‌کس تا
 *    باز کردنِ صفحهٔ فروشگاه متوجه نمی‌شود.
 *
 * این تست سه چیز را قفل می‌کند:
 *
 *   ۱. هر ردیفِ `club_badge` در مایگریشن‌ها فایلِ واقعی روی دیسک دارد
 *   ۲. هر سه کلاینت (وب، اندروید، و نسخهٔ عمومیِ بک‌اند) همان مجموعه
 *      را دارند — وگرنه اپ لوگویی نشان می‌دهد که وب ندارد یا برعکس
 *   ۳. هیچ لوگویی زیرِ `uploads/` نیست، یعنی از دستِ ابزارِ پاکسازی
 *      در امان است
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
const REPO = path.join(ROOT, '..');

// ── مجموعهٔ مرجع: چیزی که واقعاً روی دیسکِ وب‌اپ است ──
const WEB_DIR = path.join(REPO, 'userweb/public/shop');
const APP_DIR = path.join(REPO, 'mobile/assets/shop');

console.log('\n══ ۱. پوشه‌های لوگو وجود دارند ══');
ck('userweb/public/shop هست', fs.existsSync(WEB_DIR), WEB_DIR);
ck('mobile/assets/shop هست', fs.existsSync(APP_DIR), APP_DIR);
if (fail) {
  console.log('\n✗ پوشهٔ لوگو گم شده — بقیهٔ بررسی‌ها بی‌معنی است.\n');
  process.exit(1);
}

const web = fs.readdirSync(WEB_DIR).filter(f => f.endsWith('.webp')).sort();
const app = fs.readdirSync(APP_DIR).filter(f => f.endsWith('.webp')).sort();

console.log('\n══ ۲. هیچ لوگویی گم نشده ══');
// عددِ سفت‌وسخت عمدی است. اگر روزی باشگاهِ تازه‌ای اضافه شد، این تست
// قرمز می‌شود و همان لحظه یادآوری می‌کند که هر سه جا باید به‌روز شوند.
// قرمز شدنِ آگاهانه بهتر از اضافه شدنِ بی‌صدای لوگو به یک کلاینت است.
const EXPECTED = 11;
ck(`وب ${EXPECTED} لوگو دارد`, web.length === EXPECTED,
  `${web.length} تا — اگر باشگاه اضافه/کم شده، EXPECTED را به‌روز کن`);
ck(`اندروید ${EXPECTED} لوگو دارد`, app.length === EXPECTED,
  `${app.length} تا`);
ck('وب و اندروید دقیقاً یک مجموعه دارند',
  JSON.stringify(web) === JSON.stringify(app),
  `فقط در وب: ${web.filter(f => !app.includes(f))} | `
  + `فقط در اندروید: ${app.filter(f => !web.includes(f))}`);

console.log('\n══ ۳. هیچ فایلی خالی یا خراب نیست ══');
// فایلِ صفر بایتی همان‌قدر بد است که فایلِ غایب، ولی سکوت می‌کند:
// `existsSync` راضی است و کاربر یک مربعِ خالی می‌بیند.
let tiny = [];
for (const f of web) {
  const s = fs.statSync(path.join(WEB_DIR, f)).size;
  if (s < 200) tiny.push(`${f}=${s}b`);
}
ck('همهٔ لوگوهای وب حجمِ معقول دارند', tiny.length === 0, tiny.join(', '));

// امضای WebP: بایت‌های 0..3 = 'RIFF' و 8..11 = 'WEBP'
let notWebp = [];
for (const f of web) {
  const b = fs.readFileSync(path.join(WEB_DIR, f)).subarray(0, 12);
  if (b.toString('ascii', 0, 4) !== 'RIFF'
      || b.toString('ascii', 8, 12) !== 'WEBP') notWebp.push(f);
}
ck('همه واقعاً WebP هستند (نه فقط پسوند)',
  notWebp.length === 0, notWebp.join(', '));

console.log('\n══ ۴. هر ردیفِ فروشگاه فایلِ واقعی دارد ══');
// مسیرِ عکس در مایگریشن نوشته می‌شود. اگر نامِ فایل و نامِ ردیف از هم
// جدا بیفتند، فروشگاه یک خانهٔ خالی نشان می‌دهد بدونِ هیچ خطایی.
const migrations = fs.readdirSync(path.join(ROOT, 'migrations'))
  .filter(f => f.endsWith('.sql'))
  .map(f => fs.readFileSync(path.join(ROOT, 'migrations', f), 'utf8'))
  .join('\n');

// فقط ردیف‌هایی که **حذف نشده‌اند**: مایگریشنِ ۰۲۰ باشگاه‌های ایرانی را
// اضافه کرد و مایگریشنِ بعدی حذفشان کرد، پس ارجاعشان در فایلِ SQL هست
// ولی در دیتابیس نیست. معیارِ درست «چیزی که روی دیسک است» است.
const referenced = [...migrations.matchAll(/'\/shop\/(club_[a-z_]+\.webp)'/g)]
  .map(m => m[1]);
const uniqRef = [...new Set(referenced)];
const alive = uniqRef.filter(f => web.includes(f));
ck(`${alive.length} لوگوی ارجاع‌شده روی دیسک هست`,
  alive.length === web.length,
  `روی دیسک ${web.length}، ارجاع‌شدهٔ زنده ${alive.length}`);

// و برعکس: فایلی که هیچ ردیفی ندارد یعنی یا فراموش شده یا زباله.
const orphanFiles = web.filter(f => !uniqRef.includes(f));
ck('هیچ فایلِ بی‌صاحبی نیست', orphanFiles.length === 0,
  `${orphanFiles.join(', ')} — ردیفِ فروشگاه ندارند`);

console.log('\n══ ۵. لوگوها از دسترسِ ابزارِ پاکسازی دورند ══');
// ⚠️ مهم‌ترین بررسیِ این فایل.
//
// `reset_for_launch.py` هر فایلی در `backend/uploads/images/` که در
// دیتابیس ارجاع ندارد را **پاک می‌کند**. اگر روزی کسی لوگوها را به
// آنجا منتقل کند، اولین اجرای پاکسازی همه را می‌برد.
const UPLOADS = path.join(ROOT, 'uploads');
let inUploads = [];
if (fs.existsSync(UPLOADS)) {
  const walk = d => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/^club_.*\.webp$/.test(e.name)) inUploads.push(p);
    }
  };
  walk(UPLOADS);
}
ck('هیچ لوگوی باشگاهی زیرِ uploads/ نیست',
  inUploads.length === 0,
  `${inUploads.join(', ')} — ابزارِ پاکسازی این‌ها را حذف می‌کند!`);

// و اینکه ابزارِ پاکسازی هم هرگز به پوشهٔ لوگوها نگاه نکند.
const resetTool = path.join(REPO, 'tools/reset_for_launch.py');
if (fs.existsSync(resetTool)) {
  const src = fs.readFileSync(resetTool, 'utf8');
  ck('ابزارِ پاکسازی فقط uploads/images را هدف می‌گیرد',
    /UPLOADS\s*=\s*'[^']*backend\/uploads\/images'/.test(src),
    'اگر مسیرش عوض شده، ممکن است لوگوها را هم ببیند');
  ck('ابزارِ پاکسازی به public/shop کاری ندارد',
    !src.includes('public/shop') && !src.includes('assets/shop'));
}

console.log('\n══ ۶. لوگوها در git ردیابی می‌شوند ══');
// اگر gitignore شوند، `git clone` روی سرورِ تازه بدونشان می‌آید و
// restore.sh هم برشان نمی‌گرداند.
const gitignore = fs.readFileSync(path.join(REPO, '.gitignore'), 'utf8');
ck('.gitignore پوشهٔ shop را نادیده نمی‌گیرد',
  !/^\s*.*shop\/\s*$/m.test(gitignore),
  'لوگوها از مخزن حذف می‌شوند و روی سرورِ تازه نمی‌آیند');
ck('userweb/public در .gitignore نیست',
  !/^\s*userweb\/public/m.test(gitignore));
ck('mobile/assets در .gitignore نیست',
  !/^\s*mobile\/assets/m.test(gitignore));

console.log(`\n${fail ? '✗' : '✓'} ${pass} موفق، ${fail} ناموفق\n`);
process.exit(fail ? 1 : 0);
