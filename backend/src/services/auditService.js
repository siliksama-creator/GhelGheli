const { pool } = require('../config/db');
async function audit(adminId, action, targetType, targetId, reason, metadata = {}) {
  if (!adminId) return;
  await pool.query(
    'INSERT INTO audit_log(admin_user_id, action, target_type, target_id, reason, metadata) VALUES ($1,$2,$3,$4,$5,$6)',
    [adminId, action, targetType || null, targetId || null, reason || null, metadata]
  );
}
module.exports = { audit };
