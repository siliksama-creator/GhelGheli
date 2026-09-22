// ─────────────────────────────────────────────────────────────────────
// پیکربندیِ پشتیبانی: سقف پیوست‌ها، سهمیهٔ تیکت و پاک‌سازیِ پیوست‌ها —
// بیرون آمده از server.js (گامِ پایانیِ ماژولار شدن، مهر ۱۴۰۵). بدنهٔ تعریف‌ها
// مو به مو همان است؛ وابستگی‌ها تزریق می‌شوند و server.js همان نام‌ها را
// در همان جای قبلی destruct می‌کند تا هیچ ارجاعِ پایین‌دستی تغییر نکند.
// ─────────────────────────────────────────────────────────────────────
module.exports = ({
  liveContent, pool,
}) => {
// ── Support tickets ───────────────────────────────────────────────────────
// Rules:
//   * one OPEN ticket at a time, and at most one NEW ticket per calendar day
//   * while a ticket is open the user replies inside that thread instead
//   * only an admin can close it, which frees the user to open a new one
//   * every message may carry 1..5 image attachments
// سقفِ ضمیمهٔ هر تیکت و سهمیهٔ تیکتِ روزانه حالا **زنده**اند
// (live_rules.maxTicketAttachments / ticketsPerDay). تابع برمی‌گردانیم نه
// ثابت، تا اگر ادمین از پنل سقف را عوض کند، همان درخواستِ بعدی سقفِ
// تازه را ببیند.
const ticketMaxAttachments = () => liveContent.rules().maxTicketAttachments;

const ticketsPerDay = () => liveContent.rules().ticketsPerDay;

// Accepts an array of upload URLs previously returned by the upload route.
// Anything that isn't one of our own /uploads/ paths is rejected so a caller
// can't smuggle in an arbitrary external URL.
function sanitizeAttachments(input) {
  if (!Array.isArray(input)) return [];
  const out = [];
  for (const raw of input) {
    const v = String(raw || '').trim();
    if (!v) continue;
    // SECURITY (ممیزی دورِ ۲۳): پسوندِ فایل هم باید تصویری باشد. قبلاً هر
    // مسیری زیر /uploads/images/ با هر پسوندی پذیرفته می‌شد — از جمله
    // .html/.svg که (قبل از سخت‌گیریِ فیلترِ آپلود) می‌شد فایلِ حمله را
    // به‌عنوان پیوستِ تیکت به کاربر/ادمین نشان داد. حالا فقط همان
    // پسوندهایی که فیلترِ multer می‌پذیرد.
    if (!/^\/uploads\/images\/[A-Za-z0-9._-]+\.(png|jpe?g|webp|gif)$/i.test(v)) {
      const err = new Error('یکی از پیوست‌ها معتبر نیست');
      err.status = 400;
      throw err;
    }
    out.push(v);
    const maxAtt = ticketMaxAttachments();
    if (out.length > maxAtt) {
      const err = new Error(`حداکثر ${maxAtt} عکس می‌توانید ارسال کنید`);
      err.status = 400;
      throw err;
    }
  }
  return out;
}

// Tells the client whether the "new ticket" form should be enabled, and why
// not — so the app can explain the rule instead of just failing on submit.
async function ticketQuota(userId) {
  const open = await pool.query(
    "SELECT id, subject, status FROM support_tickets WHERE user_id=$1 AND status <> 'closed' ORDER BY created_at DESC LIMIT 1",
    [userId]
  );
  if (open.rows[0]) {
    return {
      canCreate: false,
      reason: 'open_ticket',
      message: 'یک تیکت باز دارید؛ تا بسته شدن آن، پاسخ خود را در همان تیکت بفرستید.',
      openTicket: open.rows[0],
    };
  }
  const today = await pool.query(
    "SELECT count(*)::int AS c FROM support_tickets WHERE user_id=$1 AND created_at >= date_trunc('day', NOW())",
    [userId]
  );
  // سهمیهٔ روزانه از اعدادِ زنده — متنِ راهنما هم از همان قالبِ زنده
  // (live_copy.support.ticketRule) می‌آید تا عددِ متن با عددِ منطقِ
  // سرور هرگز در دو رقم نباشد.
  const limit = ticketsPerDay();
  if (today.rows[0].c >= limit) {
    return {
      canCreate: false,
      reason: 'daily_limit',
      message: liveContent.fillTemplate(
        liveContent.copy().support.ticketRule,
        { ticketsPerDay: limit },
      ),
      openTicket: null,
    };
  }
  return { canCreate: true, reason: null, message: null, openTicket: null };
}

  return {
  ticketMaxAttachments, ticketsPerDay, sanitizeAttachments, ticketQuota,
  };
};
