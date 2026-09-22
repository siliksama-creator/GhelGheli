// ─────────────────────────────────────────────────────────────────────
// پشتیبانی: آپلودِ تصویر، سهمیه، تیکت‌ها و پیام‌های تیکت —
// بیرون آمده از server.js (بندِ ۱ نقشهٔ راه). بدنه‌ها مو به مو منتقل شده‌اند.
// ─────────────────────────────────────────────────────────────────────
const express = require('express');
const url = require('url');

module.exports = ({
  pool, logger, auth, asyncHandler,
  validateUuid, kb, imageUpload, optimizeUpload,
  uploadLimiter, verifyUpload, ticketMaxAttachments, ticketQuota,
  sanitizeAttachments,
}) => {
  const router = express.Router();

router.post('/support/uploads/image', auth, uploadLimiter, imageUpload.single('image'), asyncHandler(async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'فقط فایل تصویری (PNG/JPG/WEBP/GIF) مجاز است' });
  // محتوای واقعیِ فایل راستی‌آزمایی شود، نه فقط اعلامِ فرستنده — چراییِ کامل
  // روی خودِ verifyUpload در imageService نوشته شده است. خطایش status:400
  // دارد و از همان error handlerِ عمومی پاسِ درست می‌گیرد.
  await verifyUpload(req.file);
  // Phone photos are multi-megabyte; shrink before anyone has to download it.
  const r = await optimizeUpload(req.file);
  logger.info(`[upload] support ${kb(r.bytesBefore)} -> ${kb(r.bytesAfter)}`);
  res.json({ url: `/uploads/images/${r.filename}`, bytes: r.bytesAfter });
}));

router.get('/support/quota', auth, asyncHandler(async (req, res) => {
  res.json({ ...(await ticketQuota(req.user.id)), maxAttachments: ticketMaxAttachments() });
}));

router.post('/support/tickets', auth, asyncHandler(async (req, res) => {
  const { subject, message } = req.body;
  const attachments = sanitizeAttachments(req.body.attachments);
  if (!String(subject || '').trim()) return res.status(400).json({ message: 'موضوع تیکت را وارد کنید' });
  if (!String(message || '').trim() && !attachments.length) {
    return res.status(400).json({ message: 'متن پیام یا حداقل یک عکس لازم است' });
  }
  const quota = await ticketQuota(req.user.id);
  if (!quota.canCreate) return res.status(429).json({ ...quota });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const ticket = await client.query('INSERT INTO support_tickets(user_id,subject) VALUES($1,$2) RETURNING *', [req.user.id, String(subject).trim().slice(0, 180)]);
    await client.query(
      "INSERT INTO support_ticket_messages(ticket_id,sender_type,sender_user_id,message_text,attachments) VALUES($1,'user',$2,$3,$4)",
      [ticket.rows[0].id, req.user.id, String(message || '').trim(), JSON.stringify(attachments)]
    );
    await client.query('COMMIT');
    res.json(ticket.rows[0]);
  } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
}));

router.get('/support/tickets', auth, asyncHandler(async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM support_tickets WHERE user_id=$1 ORDER BY updated_at DESC', [req.user.id]);
  res.json(rows);
}));

router.get('/support/tickets/:id/messages', auth, validateUuid('id'), asyncHandler(async (req, res) => {
  const { rows } = await pool.query('SELECT m.* FROM support_ticket_messages m JOIN support_tickets t ON t.id=m.ticket_id WHERE t.id=$1 AND t.user_id=$2 ORDER BY m.created_at', [req.params.id, req.user.id]);
  res.json(rows);
}));

router.post('/support/tickets/:id/messages', auth, validateUuid('id'), asyncHandler(async (req, res) => {
  const attachments = sanitizeAttachments(req.body.attachments);
  const text = String(req.body.message || '').trim();
  if (!text && !attachments.length) return res.status(400).json({ message: 'متن پیام یا حداقل یک عکس لازم است' });

  // A closed ticket is final: replying would silently reopen a conversation
  // support considers finished (and would bypass the one-ticket-a-day rule).
  const t = await pool.query('SELECT status FROM support_tickets WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
  if (!t.rows[0]) return res.status(404).json({ message: 'تیکت پیدا نشد' });
  if (t.rows[0].status === 'closed') {
    return res.status(409).json({ message: 'این تیکت بسته شده است. در صورت نیاز تیکت جدیدی ثبت کنید.' });
  }

  await pool.query(
    "INSERT INTO support_ticket_messages(ticket_id,sender_type,sender_user_id,message_text,attachments) VALUES($1,'user',$2,$3,$4)",
    [req.params.id, req.user.id, text, JSON.stringify(attachments)]
  );
  await pool.query("UPDATE support_tickets SET status='open', updated_at=NOW() WHERE id=$1 AND user_id=$2", [req.params.id, req.user.id]);
  res.json({ message: 'پیام ارسال شد' });
}));

  return router;
};
