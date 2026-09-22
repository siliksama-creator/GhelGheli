// ─────────────────────────────────────────────────────────────────────
// اعلان‌های کاربر و خوانده‌شده علامت زدن —
// بیرون آمده از server.js (بندِ ۱ نقشهٔ راه). بدنه‌ها مو به مو منتقل شده‌اند.
// ─────────────────────────────────────────────────────────────────────
const express = require('express');

module.exports = ({
  pool, auth, asyncHandler, validateUuid,
}) => {
  const router = express.Router();

router.get('/notifications', auth, asyncHandler(async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM notifications WHERE user_id=$1 OR user_id IS NULL ORDER BY created_at DESC LIMIT 100', [req.user.id]); res.json(rows);
}));

router.patch('/notifications/:id/read', auth, validateUuid('id'), asyncHandler(async (req, res) => {
  await pool.query('UPDATE notifications SET is_read=true WHERE id=$1 AND (user_id=$2 OR user_id IS NULL)', [req.params.id, req.user.id]); res.json({ message: 'خوانده شد' });
}));

  return router;
};
