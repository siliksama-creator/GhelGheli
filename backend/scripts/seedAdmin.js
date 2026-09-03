require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool } = require('../src/config/db');

(async () => {
  // ── چرا دیگر پیش‌فرضِ عمومیِ رمز وجود ندارد ──
//
// مخزن public است و مقدارِ `Ali@0142` که قبلاً در `.env.example` و
// READMEها و همین فایل بود، برای هر کسی قابلِ دیدن است. ابرادمینِ
// `Admin` با رمزِ عمومی یعنی پنلِ مدیریتِ کلِ محصول در دستِ همه است.
// اگر `ADMIN_DEFAULT_PASSWORD` در .env نباشد، seed به‌جای ساختِ حسابِ
// ابرادمینِ با-رمز-عمومی، صریحاً می‌شکند.
if (!process.env.ADMIN_DEFAULT_PASSWORD) {
  console.error('seed:admin: backend/.env باید ADMIN_DEFAULT_PASSWORD را داشته باشد — پیش‌فرضِ عمومیِ رمز مجاز نیست (مخزن public است).');
  process.exit(1);
}
const adminAccounts = new Map([
    [process.env.ADMIN_DEFAULT_USERNAME || 'Admin', process.env.ADMIN_DEFAULT_PASSWORD],
  ]);

  // For the real owner/admin account, do not hardcode the password in the APK or repository.
  // Set MAIN_ADMIN_USERNAME and MAIN_ADMIN_PASSWORD in backend/.env, then run: npm run seed:admin
  if (process.env.MAIN_ADMIN_USERNAME && process.env.MAIN_ADMIN_PASSWORD) {
    adminAccounts.set(process.env.MAIN_ADMIN_USERNAME, process.env.MAIN_ADMIN_PASSWORD);
  }

  for (const [username, password] of adminAccounts.entries()) {
    const hash = await bcrypt.hash(password, 12);
    await pool.query(
      `INSERT INTO admin_users(username,password_hash,role,is_active)
       VALUES($1,$2,'super_admin',true)
       ON CONFLICT(username) DO UPDATE SET password_hash=EXCLUDED.password_hash, role='super_admin', is_active=true, updated_at=NOW()`,
      [username, hash]
    );
    console.log(`admin ready: ${username}`);
  }


  // Disable the old lowercase admin/admin test account if it exists from earlier seeds.
  if ((process.env.KEEP_LEGACY_ADMIN || 'false') !== 'true') {
    await pool.query("UPDATE admin_users SET is_active=false, updated_at=NOW() WHERE username='admin'");
    console.log('legacy lowercase admin disabled');
  }

  // کاربر عادی تست با همان نام کاربری ادمین — برای ورود به اپ/وب کاربر
  // بدون ساخت شماره موبایل جدا. رمز پیش‌فرض با MAIN_ADMIN (رمز واقعی
  // مالک) هم‌تراز است تا «همان Admin + همان پسورد» در هر دو سمت کار کند.
  // TEST_USER_PASSWORD فقط وقتی عمداً جدا می‌خواهید override می‌کند.
  const testMobile = process.env.TEST_USER_MOBILE
    || process.env.MAIN_ADMIN_USERNAME
    || process.env.ADMIN_DEFAULT_USERNAME
    || 'Admin';
  // FALLBACKِ ADMIN_DEFAULT_PASSWORD همیشه هست (بالا صریحاً چک شد)؛
  // پیش‌فرضِ عمومی دیگر نمی‌تواند راهِ فرار باشد.
  const testPassword = process.env.TEST_USER_PASSWORD
    || process.env.MAIN_ADMIN_PASSWORD
    || process.env.ADMIN_DEFAULT_PASSWORD;
  const testHash = await bcrypt.hash(testPassword, 12);
  const testNick = process.env.TEST_USER_NICKNAME || testMobile;
  await pool.query(
    `INSERT INTO users(mobile,mobile_verified,password_hash,nickname,status)
     VALUES($1,true,$2,$3,'active')
     ON CONFLICT(mobile) DO UPDATE SET mobile_verified=true, password_hash=EXCLUDED.password_hash,
       nickname=EXCLUDED.nickname, status='active', updated_at=NOW()`,
    [testMobile, testHash, testNick]
  );
  console.log(`mobile test user ready: ${testMobile}`);

  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
