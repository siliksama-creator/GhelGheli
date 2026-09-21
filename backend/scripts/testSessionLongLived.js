#!/usr/bin/env node
/**
 * گاردِ «جلسهٔ همیشگی» — خواستهٔ مالک، ۲۶ شهریور.
 *
 * ── داستان ────────────────────────────────────────────────────────────────
 *
 * مالک گفت: «یک‌کاری کن وقتی ورودِ موفق با شماره داشتند، جلسه‌شان برای همیشه
 * فعال بماند.» یعنی توکنِ کاربر باید عملاً بی‌انقضا باشد. این کار در نگاهِ
 * اول یک خط تغییر است (`expiresIn`)، ولی دو تا تله دارد که این گارد قفل
 * می‌کند:
 *
 *   ۱) توکنِ طولانی بدونِ «کلیدِ خاموش‌کردن» قرضِ امنیتی است. اگر گوشی گم
 *      شود، آن توکن ۱۰ سال کار می‌کند. پس `session_epoch` (migration 092)
 *      باید در توکن بیاید (`tv`) و در همهٔ مسیرهای ورود بررسی شود —
 *      REST، مسیرِ اختیاری، و سوکتِ بازی. اگر یکی جا بماند، «خاموش‌کردنِ
 *      جلسه» نصفه کار می‌کند و کسی هم متوجه نمی‌شود.
 *
 *   ۲) توکنِ **ادمین** نباید قربانیِ این خواسته شود. پنلِ مدیریت به پول و
 *      کاربران دسترسی دارد؛ اگر جلسهٔ ادمین هم همیشگی شود، یک لپ‌تاپِ
 *      گم‌شده یعنی دسترسیِ ابدی به پولِ برنامه.
 *
 * پس سه دسته بررسی: طولِ عمرِ درست، زنجیرهٔ خاموش‌کردنِ کامل، و سقفِ
 * سختِ ادمین.
 */
const fs = require('fs');
const path = require('path');

let pass = 0; let fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass += 1; console.log('  ✓', name); } else { fail += 1; console.log('  ✗', name, detail ? `→ ${detail}` : ''); }
};

const SRC = path.join(__dirname, '..', 'src');
const serverSrc = fs.readFileSync(path.join(SRC, 'server.js'), 'utf8');
const authSrc = fs.readFileSync(path.join(SRC, 'routes', 'auth.js'), 'utf8');
const adminUsersSrc = fs.readFileSync(path.join(SRC, 'routes', 'adminUsers.js'), 'utf8');
const envExample = fs.readFileSync(path.join(__dirname, '..', '.env.example'), 'utf8');
const migration = fs.readFileSync(path.join(__dirname, '..', 'migrations', '092_user_session_epoch.sql'), 'utf8');

console.log('\n══ ۱) عمرِ جلسهٔ کاربر «همیشگی» است ══');
{
  const m = serverSrc.match(/const USER_TOKEN_TTL\s*=\s*process\.env\.JWT_EXPIRES_IN\s*\|\|\s*'(\d+)d'/);
  ok('عمرِ توکنِ کاربر از JWT_EXPIRES_IN می‌آید و پیش‌فرضش ۱۰ سال است',
    !!m && Number(m[1]) >= 3650, m ? `مقدار: ${m[1]}d` : 'الگو پیدا نشد');
  ok('signUser از همان ثابت استفاده می‌کند (عددِ دستیِ دوباره ندارد)',
    /const signUser[\s\S]{0,220}expiresIn:\s*USER_TOKEN_TTL/.test(serverSrc));
  ok('دیگر هیچ‌جا توکنِ کاربر با ۳۰ روز صادر نمی‌شود',
    !/expiresIn:\s*process\.env\.JWT_EXPIRES_IN\s*\|\|\s*'30d'/.test(serverSrc));
  // ⚠️ چرا نمونهٔ env را هم می‌سنجیم: اگر کسی روزی این فایل را به «۳۰d»
  // برگرداند، سرورِ تازه‌نصب دوباره ماهانه کاربر را بیرون می‌اندازد و
  // خواستهٔ مالک بی‌صدا از دست می‌رود.
  const e = envExample.match(/^JWT_EXPIRES_IN=(\d+)d$/m);
  ok('نمونهٔ env هم همان مقدارِ همیشگی را دارد', !!e && Number(e[1]) >= 3650,
    e ? `مقدار: ${e[1]}d` : '.env.example خطِ JWT_EXPIRES_IN ندارد');
}

console.log('\n══ ۲) توکنِ ادمین عمداً کوتاه مانده ══');
{
  const m = serverSrc.match(/const signAdmin[\s\S]{0,200}?expiresIn:\s*'(\d+)h'/);
  ok('عمرِ توکنِ ادمین حداکثر ۲۴ ساعت است', !!m && Number(m[1]) <= 24,
    m ? `مقدار: ${m[1]} ساعت` : 'الگو پیدا نشد');
  ok('signAdmin از USER_TOKEN_TTL استفاده نمی‌کند',
    !/const signAdmin[\s\S]{0,200}?USER_TOKEN_TTL/.test(serverSrc));
}

console.log('\n══ ۳) کلیدِ خاموش‌کردن: مهر «نسخهٔ جلسه» داخلِ توکن ══');
{
  ok('توکنِ کاربر claimِ `tv` را می‌گیرد',
    /jwt\.sign\(\s*\{\s*sub:\s*user\.id,\s*type:\s*'user',\s*tv:\s*Number\(user\.session_epoch\s*\|\|\s*0\)/.test(serverSrc));
  ok('تابعِ مقایسهٔ مهر یک‌جا تعریف شده (چهار کپیِ دستی نداریم)',
    (serverSrc.match(/function sessionEpochMatches/g) || []).length === 1);
  ok('مقایسه، توکنِ بی‌مهرِ قدیمی را معتبر می‌شمارد (کاربرانِ فعلی پرت نشوند)',
    /Number\(payload\?\.tv\s*\|\|\s*0\)\s*===\s*Number\(userRow\?\.session_epoch\s*\|\|\s*0\)/.test(serverSrc));

  // هر سه مسیرِ ورود باید چک کنند: REST، مسیرِ اختیاری، سوکت.
  const restOk = /if \(!sessionEpochMatches\(payload, rows\[0\]\)\) return res\.status\(401\)/.test(serverSrc);
  const optionalOk = /rows\[0\]\.status === 'active' && sessionEpochMatches\(payload, rows\[0\]\)/.test(serverSrc);
  const socketOk = /session_epoch[\s\S]{0,600}if \(!sessionEpochMatches\(payload, rows\[0\]\)\) throw new Error\('stale-session'\)/.test(serverSrc);
  ok('مسیرِ REST بررسی می‌کند', restOk, 'auth بدونِ این، خاموش‌کردنِ جلسه کار نمی‌کند');
  ok('مسیرِ اختیاری (مهمان/کاربر) بررسی می‌کند', optionalOk);
  ok('سوکتِ بازی هم ستون را می‌خواند و بررسی می‌کند', socketOk,
    'بدونِ این، کاربرِ اخراج‌شده تا قطعِ اتصال در بازی می‌ماند');
  ok('سوکت `session_epoch` را در SELECT دارد',
    /equipped_emote_pack,profile_title,\s*\n\s*session_epoch\s*\n\s*FROM users WHERE id=\$1/.test(serverSrc));
}

console.log('\n══ ۴) هر مسیرِ تغییرِ رمز، مهر را جلو می‌برد ══');
{
  const bumps = {
    'تغییرِ رمز توسط خودِ کاربر': /UPDATE users SET password_hash=\$1, session_epoch=session_epoch\+1[\s\S]{0,220}req\.user\.id/,
    'ریستِ رمز توسط ادمین/پشتیبانی': /UPDATE users SET password_hash=\$1, session_epoch=session_epoch\+1[\s\S]{0,80}req\.params\.id/,
    'بازیابیِ رمز با کدِ پیامکی': /UPDATE users SET password_hash=\$1, session_epoch=session_epoch\+1 WHERE mobile=\$2/,
    'ثبت‌نام/تغییرِ رمزِ رمزی (upsert)': /session_epoch=users\.session_epoch\+1/,
    'ثبت‌نامِ تأییدشده با کد (register)': /nickname=\$3, session_epoch=session_epoch\+1/,
  };
  const haystack = { auth: authSrc, admin: adminUsersSrc, server: serverSrc };
  const where = {
    'تغییرِ رمز توسط خودِ کاربر': 'server',
    'ریستِ رمز توسط ادمین/پشتیبانی': 'admin',
    'بازیابیِ رمز با کدِ پیامکی': 'auth',
    'ثبت‌نام/تغییرِ رمزِ رمزی (upsert)': 'auth',
    'ثبت‌نامِ تأییدشده با کد (register)': 'auth',
  };
  for (const [label, re] of Object.entries(bumps)) {
    ok(`«${label}» جلسه‌های قبلی را می‌کشد`, re.test(haystack[where[label]]),
      'اگر اینجا جا بماند، توکنِ ۱۰سالهٔ قدیمی زنده می‌ماند');
  }

  // چرا این یکی *مثبت* سنجیده می‌شود نه منفی: خواستهٔ مالک «همیشه وارد
  // بماند» است، پس کاربری که خودش رمز را عوض می‌کند نباید از حسابش پرت
  // شود — توکنِ تازه باید در پاسخِ همان درخواست برگردد.
  ok('کاربری که خودش رمز را عوض می‌کند بیرون نمی‌افتد (توکنِ تازه می‌گیرد)',
    /session_epoch=session_epoch\+1, updated_at=NOW\(\) WHERE id=\$2 RETURNING \*[\s\S]{0,400}?token:\s*signUser\(rows\[0\]\)/.test(serverSrc));
  ok('پاسخِ تغییرِ رمز، خروجِ بقیهٔ دستگاه‌ها را هم به کاربر می‌گوید',
    /بقیهٔ دستگاه‌ها از حساب خارج شدند/.test(serverSrc));
  ok('پاسخِ بازیابیِ رمز هم همین را می‌گوید',
    /همهٔ دستگاه‌ها از حساب خارج شدند/.test(authSrc));
}

console.log('\n══ ۵) دیتابیس: ستونِ مهر وجود دارد و مهاجرت idempotent است ══');
{
  ok('migration 092 ستون را با پیش‌فرضِ ۰ می‌سازد',
    /ALTER TABLE users ADD COLUMN IF NOT EXISTS session_epoch INTEGER NOT NULL DEFAULT 0/.test(migration));
  // ⚠️ دو نگهبانِ عملیاتی: کدِ پیش‌فرض کافی نیست، چون `.env` سرور آن را
  // بازنویسی می‌کند. یک‌بار همین اتفاق افتاد (env=۳۰d و کد=۱۰ سال) و
  // هیچ‌کس نفهمید. این دو بررسی نمی‌گذارند آن نگهبان‌ها حذف شوند.
  const deploySrc = fs.readFileSync(path.join(__dirname, '..', '..', 'scripts', 'deploy.sh'), 'utf8');
  ok('دیپلوی، مقدارِ کوتاهِ JWT_EXPIRES_IN را هشدار می‌دهد',
    /JWT_EXPIRES_IN=\$TTL_VALUE|JWT_EXPIRES_IN=%s/.test(deploySrc) && /TTL_DAYS/.test(deploySrc));
  ok('خودِ سرور هم هنگامِ بالا آمدن دربارهٔ مقدارِ کوتاه هشدار می‌دهد',
    /JWT_EXPIRES_IN=\$\{ttl\} → جلسهٔ کاربران کوتاه است/.test(serverSrc));
  ok('migration توضیحِ «چرا» را دارد (نه فقط SQL)',
    migration.includes('کلیدِ خاموش') || migration.includes('خاموش'));
  // ⚠️ تلهٔ سفارشِ مایگریشن‌ها: شماره باید یکتا باشد وگرنه `migrate.js`
  // هر دو فایل را به ترتیبِ الفبایی اجرا می‌کند و ممکن است دیرتر از
  // کدی اجرا شود که به ستون نیاز دارد.
  const dir = path.join(__dirname, '..', 'migrations');
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
  ok('شمارهٔ ۰۹۲ تکراری نیست',
    files.filter(f => f.startsWith('092')).length === 1, files.filter(f => f.startsWith('092')).join(', '));
}

console.log(`\n${fail === 0 ? '✓' : '✗'} ${pass} تست موفق، ${fail} ناموفق\n`);
process.exit(fail === 0 ? 0 : 1);
