const { Pool } = require('pg');

// Explicit pool limits and timeouts.
//
// The default pool had no `max`, no idle timeout and — critically — no
// 'error' listener. node-postgres emits 'error' on idle clients when the
// server or a network device drops the connection; with no listener that is
// an unhandled 'error' event, which terminates the whole API process.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // The VPS runs a single API process next to Postgres; 10 is plenty for
  // this workload and keeps us far below Postgres' default max_connections.
  max: Number(process.env.PG_POOL_MAX || 10),
  idleTimeoutMillis: 30_000,
  // Fail fast instead of hanging a request forever when the DB is stuck.
  connectionTimeoutMillis: 8_000,
  // Guards against a runaway query pinning a connection indefinitely.
  statement_timeout: 15_000,
  query_timeout: 15_000,
  keepAlive: true,
});

pool.on('error', (err) => {
  // Never let an idle-client error become an unhandled 'error' event.
  console.error('[db] idle client error:', err.message);
});

module.exports = { pool };
