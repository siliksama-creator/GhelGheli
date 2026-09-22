// ─────────────────────────────────────────────────────────────────────
// ورودِ مدیر — بیرون آمده از server.js (بندِ ۱ ممیزی ۸ مهر ۱۴۰۵).
// ─────────────────────────────────────────────────────────────────────
const express = require('express');

module.exports = ({
  pool, asyncHandler, bcrypt, signAdmin,
  adminLoginLimiter,
}) => {
  const router = express.Router();

// Admin
router.post('/admin/auth/login', adminLoginLimiter, asyncHandler(async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM admin_users WHERE username=$1 AND is_active=true', [req.body.username]);
  const admin = rows[0];
  if (!admin || !(await bcrypt.compare(String(req.body.password || ''), admin.password_hash))) return res.status(401).json({ message: 'ورود نامعتبر' });
  res.json({ token: signAdmin(admin), admin: { id: admin.id, username: admin.username, role: admin.role } });
}));

  return router;
};
