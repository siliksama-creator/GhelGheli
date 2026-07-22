require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool } = require('../src/config/db');
(async () => {
  const username = process.env.ADMIN_DEFAULT_USERNAME || 'admin';
  const password = process.env.ADMIN_DEFAULT_PASSWORD || 'ChangeMe123!';
  const hash = await bcrypt.hash(password, 12);
  await pool.query(
    `INSERT INTO admin_users(username,password_hash,role) VALUES($1,$2,'super_admin')
     ON CONFLICT(username) DO NOTHING`, [username, hash]
  );
  console.log(`admin ready: ${username}`);
  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
