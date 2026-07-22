require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool } = require('../src/config/db');

(async () => {
  const adminAccounts = new Map([
    [process.env.ADMIN_DEFAULT_USERNAME || 'Admin', process.env.ADMIN_DEFAULT_PASSWORD || 'Ali@0142'],
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

  const testMobile = process.env.TEST_USER_MOBILE || 'Admin';
  const testPassword = process.env.TEST_USER_PASSWORD || 'Ali@0142';
  const testHash = await bcrypt.hash(testPassword, 12);
  await pool.query(
    `INSERT INTO users(mobile,mobile_verified,password_hash,nickname,status)
     VALUES($1,true,$2,'کاربر تست','active')
     ON CONFLICT(mobile) DO UPDATE SET mobile_verified=true, password_hash=EXCLUDED.password_hash, nickname='کاربر تست', status='active', updated_at=NOW()`,
    [testMobile, testHash]
  );
  console.log(`mobile test user ready: ${testMobile}`);

  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
