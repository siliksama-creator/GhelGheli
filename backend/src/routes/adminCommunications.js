/** Chat moderation, support inbox, and outbound notification routes. */
const express = require('express');

module.exports = function createAdminCommunicationRoutes(deps) {
  const {
    pool, adminAuth, requireRole, asyncHandler, audit, validateUuid,
    sanitizeAttachments, createNotification, rateLimit,
    sendSegmented, isFirebaseConfigured,
  } = deps;
  const router = express.Router();

router.get('/admin/chat/messages', adminAuth, asyncHandler(async (req, res) => res.json((await pool.query('SELECT m.*, u.mobile,u.nickname FROM chat_messages m JOIN users u ON u.id=m.user_id ORDER BY m.sent_at DESC LIMIT 300')).rows)));
router.patch('/admin/chat/messages/:id/delete', adminAuth, validateUuid('id'), requireRole('support'), asyncHandler(async (req, res) => { await pool.query('UPDATE chat_messages SET is_deleted=true WHERE id=$1', [req.params.id]); await audit(req.admin.id,'delete_chat_message','chat_messages',req.params.id,req.body.reason); res.json({message:'حذف شد'}); }));
router.patch('/admin/chat/users/:id/ban', adminAuth, validateUuid('id'), requireRole('support'), asyncHandler(async (req, res) => { await pool.query("UPDATE users SET chat_banned_until=NOW()+($1::text||' minutes')::interval WHERE id=$2", [req.body.minutes||1440, req.params.id]); await audit(req.admin.id,'ban_chat_user','users',req.params.id,req.body.reason,{minutes:req.body.minutes}); await createNotification(req.params.id,'chat_penalty','محدودیت چت',`شما به مدت ${req.body.minutes||1440} دقیقه از چت محروم شدید. ${req.body.reason||''}`); res.json({message:'کاربر از چت محروم شد'}); }));

router.get('/admin/support/tickets', adminAuth, requireRole('support','observer'), asyncHandler(async (req, res) => res.json((await pool.query('SELECT t.*, u.mobile FROM support_tickets t JOIN users u ON u.id=t.user_id ORDER BY t.updated_at DESC')).rows)));
router.get('/admin/support/tickets/:id/messages', adminAuth, validateUuid('id'), requireRole('support','observer'), asyncHandler(async (req, res) => res.json((await pool.query('SELECT * FROM support_ticket_messages WHERE ticket_id=$1 ORDER BY created_at', [req.params.id])).rows)));
router.post('/admin/support/tickets/:id/messages', adminAuth, validateUuid('id'), requireRole('support'), asyncHandler(async (req, res) => {
  const attachments = sanitizeAttachments(req.body.attachments);
  const text = String(req.body.message || '').trim();
  if (!text && !attachments.length) return res.status(400).json({ message: 'متن پاسخ یا حداقل یک عکس لازم است' });
  const cur = await pool.query('SELECT status FROM support_tickets WHERE id=$1', [req.params.id]);
  if (!cur.rows[0]) return res.status(404).json({ message: 'تیکت پیدا نشد' });
  if (cur.rows[0].status === 'closed') return res.status(409).json({ message: 'این تیکت بسته شده است' });
  await pool.query("INSERT INTO support_ticket_messages(ticket_id,sender_type,sender_admin_id,message_text,attachments) VALUES($1,'admin',$2,$3,$4)", [req.params.id, req.admin.id, text, JSON.stringify(attachments)]);
  const ticket = await pool.query("UPDATE support_tickets SET status='answered', updated_at=NOW() WHERE id=$1 RETURNING user_id", [req.params.id]);
  if (ticket.rows[0]) await createNotification(ticket.rows[0].user_id, 'support_answer', 'پاسخ پشتیبانی', 'تیکت شما پاسخ داده شد. می‌توانید در همان تیکت پاسخ دهید.');
  res.json({ message: 'پاسخ ارسال شد' });
}));

// Closing is the ONLY way a user becomes eligible to open a new ticket, so
// it is an explicit admin action rather than a side effect of replying.
router.patch('/admin/support/tickets/:id/close', adminAuth, validateUuid('id'), requireRole('support'), asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    "UPDATE support_tickets SET status='closed', closed_at=NOW(), closed_by_admin_id=$2, updated_at=NOW() WHERE id=$1 AND status <> 'closed' RETURNING user_id, subject",
    [req.params.id, req.admin.id]
  );
  if (!rows[0]) return res.status(400).json({ message: 'این تیکت از قبل بسته شده است' });
  await audit(req.admin.id, 'close_support_ticket', 'support_tickets', req.params.id, req.body.reason || null, {});
  await createNotification(rows[0].user_id, 'support_closed', 'تیکت بسته شد', `تیکت «${rows[0].subject}» توسط پشتیبانی بسته شد.`);
  res.json({ message: 'تیکت بسته شد' });
}));

router.patch('/admin/support/tickets/:id/reopen', adminAuth, validateUuid('id'), requireRole('support'), asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    "UPDATE support_tickets SET status='open', closed_at=NULL, closed_by_admin_id=NULL, updated_at=NOW() WHERE id=$1 AND status='closed' RETURNING user_id",
    [req.params.id]
  );
  if (!rows[0]) return res.status(400).json({ message: 'این تیکت باز است' });
  await audit(req.admin.id, 'reopen_support_ticket', 'support_tickets', req.params.id, null, {});
  res.json({ message: 'تیکت دوباره باز شد' });
}));

const adminNotificationLimiter = rateLimit({
  windowMs: 60_000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: req => req.admin?.id || req.ip,
  message: { message: 'تعداد ارسال اعلان زیاد است؛ کمی صبر کنید' },
});

router.get('/admin/notifications/status', adminAuth, requireRole('support'),
  asyncHandler(async (req, res) => {
    res.json({ fcmConfigured: isFirebaseConfigured(), timezone: 'Asia/Tehran' });
  }));

router.post('/admin/notifications/send-segmented', adminAuth, requireRole('support'),
  adminNotificationLimiter, asyncHandler(async (req, res) => {
    const segment = String(req.body.segment || 'all');
    const force = req.body.force === true;
    const hour = Number(new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Tehran', hour: 'numeric', hour12: false,
    }).format(new Date())) % 24;
    const daytime = hour >= 10 && hour < 22;
    if (!daytime && !force) {
      return res.status(409).json({
        message: 'برای جلوگیری از مزاحمت، ارسال هدفمند بین ساعت ۲۲ تا ۱۰ تهران متوقف است',
        tehranHour: hour,
      });
    }
    if (force && req.admin.role !== 'super_admin') {
      return res.status(403).json({ message: 'ارسال اجباری شبانه فقط برای مدیر اصلی مجاز است' });
    }
    const result = await sendSegmented({
      segment,
      title: req.body.title,
      body: req.body.body,
    });
    await audit(req.admin.id, 'segmented_notification', 'notifications', null,
      req.body.reason || null, { ...result, force, tehranHour: hour });
    res.json({
      ...result,
      message: result.fcmConfigured
        ? `اعلان برای ${result.targetCount} کاربر ثبت شد؛ ${result.pushSent} پوش ارسال شد`
        : `اعلان درون‌برنامه‌ای برای ${result.targetCount} کاربر ثبت شد؛ Firebase هنوز پیکربندی نشده است`,
    });
  }));

router.post('/admin/notifications/broadcast', adminAuth, requireRole('support'),
  adminNotificationLimiter, asyncHandler(async (req, res) => {
    const { title, body } = req.body;
    await createNotification(null, 'broadcast', title, body);
    await audit(req.admin.id,'broadcast_notification','notifications',null,null,{title});
    res.json({ message: 'اطلاعیه همگانی ثبت شد' });
  }));
  return router;
};
