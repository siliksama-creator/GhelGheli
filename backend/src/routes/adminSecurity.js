/** Administrator account lifecycle and audit-log routes. */
const express = require('express');

module.exports = function createAdminSecurityRoutes(deps) {
  const {
    pool, adminAuth, requireRole, asyncHandler, audit, validateUuid, bcrypt,
  } = deps;
  const router = express.Router();

router.get('/admin/admins', adminAuth, requireRole(), asyncHandler(async (req, res) => res.json((await pool.query('SELECT id,username,role,is_active,created_at FROM admin_users ORDER BY created_at DESC')).rows)));
router.post('/admin/admins', adminAuth, requireRole(), asyncHandler(async (req, res) => { const hash=await bcrypt.hash(req.body.password,12); const r=await pool.query('INSERT INTO admin_users(username,password_hash,role) VALUES($1,$2,$3) RETURNING id,username,role,is_active,created_at',[req.body.username,hash,req.body.role]); await audit(req.admin.id,'create_admin','admin_users',r.rows[0].id,null,{username:req.body.username,role:req.body.role}); res.json(r.rows[0]); }));
// There was previously no way to revoke an admin/support account once
// created — only DB access could set is_active=false. A departing
// support/support-with-a-compromised-password account could keep a fully
// working session/token until natural JWT expiry (12h) with no way for a
// super_admin to cut it off sooner or prevent future logins.
router.patch('/admin/admins/:id/status', adminAuth, validateUuid('id'), requireRole(), asyncHandler(async (req, res) => {
  if (req.params.id === req.admin.id) return res.status(400).json({ message: 'نمی‌توانید حساب خودتان را غیرفعال کنید' });
  const isActive = req.body.isActive !== false;
  const { rows } = await pool.query('UPDATE admin_users SET is_active=$1, updated_at=NOW() WHERE id=$2 RETURNING id,username,role,is_active', [isActive, req.params.id]);
  if (!rows[0]) return res.status(404).json({ message: 'ادمین پیدا نشد' });
  await audit(req.admin.id, isActive ? 'activate_admin' : 'deactivate_admin', 'admin_users', req.params.id, req.body.reason || null, { username: rows[0].username });
  res.json(rows[0]);
}));
// ── دفتر رخدادها ──────────────────────────────────────────────────────────
//
// ═══════════════════════════════════════════════════════════════════════════
// چرا صفحه‌بندی شد و چرا ستون‌ها محدود شدند
// ═══════════════════════════════════════════════════════════════════════════
//
// نسخهٔ قبلی `SELECT a.*` با `LIMIT 500` بود. اندازه‌گیری روی سرور زنده:
//
//     ۱۹۳٬۷۹۸ بایت JSON خام (۲۹ کیلوبایت فشرده)
//
// یعنی هشت برابرِ سنگین‌ترین endpoint بعدی. `a.*` شامل ستون JSONB
// `metadata` است که برای هر ویرایش کل بدنهٔ درخواست را نگه می‌دارد —
// چیزی که فهرست هرگز نشان نمی‌دهد و فقط در جزئیات یک رخداد به‌کار
// می‌آید.
//
// روی گوشی، آن ۱۹۳ کیلوبایت باید کامل پارس شود و به‌صورت Map های دارت در
// حافظه بماند؛ با سربارِ آبجکت‌های دارت، چند برابرِ خودِ متن رم می‌گیرد.
// این دقیقاً همان «مصرف رم» است که باید پایین بیاید، بدون کم شدن امکانات.
//
// حالا:
//   • فقط ستون‌های موردنیازِ فهرست انتخاب می‌شوند.
//   • به‌جای دو ستون سنگین، فقط یک پرچم بولین می‌گوید آیا جزئیاتی هست.
//   • صفحه‌بندی با limit/offset، پیش‌فرض ۵۰ به‌جای ۵۰۰.
//
// امکانات کم نشد: هر رخدادی که قبلاً دیده می‌شد هنوز دیده می‌شود، فقط
// صفحه‌به‌صفحه — و جزئیات کامل از endpoint تک‌رخداد در دسترس است.
router.get('/admin/audit-log', adminAuth, requireRole(), asyncHandler(async (req, res) => {
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
  const offset = Math.max(0, Number(req.query.offset) || 0);
  // جست‌وجو روی عمل/کاربر/دلیل — بدون این، دفتر ۵۰ رخداد آخر است و
  // «چه کسی امتیاز فلان کاربر را کم کرد» فقط با اسکرول شانسی پیدا می‌شد.
  const q = String(req.query.q || '').trim().slice(0, 80);
  const action = String(req.query.action || '').trim().slice(0, 80);
  const like = q ? `%${q}%` : null;
  const { rows } = await pool.query(
    `SELECT a.id, a.admin_user_id, a.action, a.target_type, a.target_id,
            a.reason, a.created_at, ad.username,
            (a.metadata IS NOT NULL AND a.metadata::text <> '{}') AS has_detail
       FROM audit_log a
       LEFT JOIN admin_users ad ON ad.id = a.admin_user_id
      WHERE ($3::text IS NULL OR a.action ILIKE $3 OR ad.username ILIKE $3
             OR COALESCE(a.reason,'') ILIKE $3 OR COALESCE(a.target_type,'') ILIKE $3)
        AND ($4::text IS NULL OR $4 = '' OR a.action = $4)
      ORDER BY a.created_at DESC
      LIMIT $1 OFFSET $2`, [limit, offset, like, action || null]);
  const { rows: cnt } = await pool.query(
    `SELECT count(*)::int AS n
       FROM audit_log a
       LEFT JOIN admin_users ad ON ad.id = a.admin_user_id
      WHERE ($1::text IS NULL OR a.action ILIKE $1 OR ad.username ILIKE $1
             OR COALESCE(a.reason,'') ILIKE $1 OR COALESCE(a.target_type,'') ILIKE $1)
        AND ($2::text IS NULL OR $2 = '' OR a.action = $2)`,
    [like, action || null]);
  res.json({ entries: rows, total: cnt[0].n, limit, offset, q, action });
}));

/// جزئیات کاملِ یک رخداد — شامل metadata.
///
/// جدا از فهرست است تا آن ستون سنگین فقط وقتی منتقل شود که ادمین واقعاً
/// روی یک ردیف زده باشد.
router.get('/admin/audit-log/:id', adminAuth, requireRole(), validateUuid('id'),
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT a.*, ad.username FROM audit_log a
         LEFT JOIN admin_users ad ON ad.id = a.admin_user_id
        WHERE a.id = $1`, [req.params.id]);
    if (!rows[0]) return res.status(404).json({ message: 'رخداد پیدا نشد' });
    res.json(rows[0]);
  }));


  return router;
};
