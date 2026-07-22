require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const dir = path.join(__dirname, '..', 'migrations');
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
  await pool.query("CREATE TABLE IF NOT EXISTS schema_migrations (filename VARCHAR(255) PRIMARY KEY, executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
  for (const file of files) {
    const exists = await pool.query('SELECT 1 FROM schema_migrations WHERE filename=$1', [file]);
    if (exists.rowCount) { console.log(`skip ${file}`); continue; }
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    await pool.query('BEGIN');
    try {
      await pool.query(sql);
      await pool.query('INSERT INTO schema_migrations(filename) VALUES ($1) ON CONFLICT DO NOTHING', [file]);
      await pool.query('COMMIT');
      console.log(`migrated ${file}`);
    } catch (err) {
      await pool.query('ROLLBACK');
      throw err;
    }
  }
  await pool.end();
})().catch(err => { console.error(err); process.exit(1); });
