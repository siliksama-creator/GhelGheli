require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool } = require('../src/config/db');

(async () => {
  const defaultUsername = process.env.ADMIN_DEFAULT_USERNAME || 'Admin';
  const defaultPassword = process.env.ADMIN_DEFAULT_PASSWORD || 'admin';
  const adminAccounts = new Map([
    [defaultUsername, defaultPassword],
    ['Admin', 'admin'],
    ['admin', 'admin'],
  ]);

  for (const [username, password] of adminAccounts.entries()) {
    const hash = await bcrypt.hash(password, 12);
    await pool.query(
      `INSERT INTO admin_users(username,password_hash,role,is_active)
       VALUES($1,$2,'super_admin',true)
       ON CONFLICT(username) DO UPDATE SET password_hash=EXCLUDED.password_hash, role='super_admin', is_active=true, updated_at=NOW()`,
      [username, hash]
    );
    console.log(`admin ready: ${username} / ${password}`);
  }

  const testMobile = process.env.TEST_USER_MOBILE || 'Admin';
  const testPassword = process.env.TEST_USER_PASSWORD || 'admin';
  const testHash = await bcrypt.hash(testPassword, 12);
  await pool.query(
    `INSERT INTO users(mobile,mobile_verified,password_hash,nickname,status)
     VALUES($1,true,$2,'کاربر تست','active')
     ON CONFLICT(mobile) DO UPDATE SET mobile_verified=true, password_hash=EXCLUDED.password_hash, nickname='کاربر تست', status='active', updated_at=NOW()`,
    [testMobile, testHash]
  );
  console.log(`mobile test user ready: ${testMobile} / ${testPassword}`);

  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
