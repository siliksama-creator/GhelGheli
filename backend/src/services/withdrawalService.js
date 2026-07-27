// ============================================================================
//  سرویس درخواست برداشت
// ============================================================================
//
// مدل پول: **بلوکه‌کردن در لحظهٔ درخواست** (hold)، نه «کسر هنگام پرداخت».
//
// چرا؟ اگر مبلغ موقع ثبت درخواست از موجودی کم نشود، کاربری با ۶۰٬۰۰۰ تومان
// می‌تواند دو درخواست ۵۰٬۰۰۰ تومانی ثبت کند و اگر مدیر هر دو را تأیید کند،
// ۱۰۰٬۰۰۰ تومان از سیستمی خارج می‌شود که فقط ۶۰٬۰۰۰ داشت. با بلوکه‌کردن،
// موجودی همان لحظه کم می‌شود و درخواست دوم اصلاً ثبت نمی‌شود.
//
// در صورت رد یا لغو، مبلغ با یک تراکنش `withdrawal_refund` برمی‌گردد — پول
// هرگز بی‌صدا ناپدید نمی‌شود و مسیرش در دفتر کل دیده می‌شود.

const { pool } = require('../config/db');
const wallet = require('./walletService');
const { validateCardInput } = require('./bankCardService');
const { createNotification } = require('./notificationService');

/** ذخیره یا به‌روزرسانی کارت بانکی کاربر. */
async function saveBankCard(userId, body) {
  const v = validateCardInput(body);
  if (!v.ok) throw Object.assign(new Error(v.message), { status: 400 });

  // کارت را نمی‌گذاریم وسط بررسی یک درخواست عوض شود: درخواست‌های در جریان
  // اسنپ‌شات کارت خودشان را دارند، ولی تغییر کارت در این حالت تقریباً همیشه
  // یعنی کاربر فکر می‌کند مقصد واریزِ درخواست فعلی هم عوض می‌شود. جلویش را
  // با یک پیام صریح می‌گیریم.
  const pending = await pool.query(
    "SELECT COUNT(*)::int AS c FROM withdrawal_requests WHERE user_id=$1 AND status IN ('pending','approved')",
    [userId],
  );
  if (pending.rows[0].c > 0) {
    throw Object.assign(
      new Error('تا زمانی که درخواست برداشت در حال بررسی دارید نمی‌توانید کارت بانکی را تغییر دهید'),
      { status: 409 },
    );
  }

  const { rows } = await pool.query(
    `UPDATE users SET bank_card_number=$1, bank_card_holder=$2, bank_card_sheba=$3,
            bank_card_bank=$4, bank_card_saved_at=NOW(), updated_at=NOW()
       WHERE id=$5
     RETURNING bank_card_number, bank_card_holder, bank_card_sheba, bank_card_bank, bank_card_saved_at`,
    [v.card.number, v.card.holder, v.card.sheba, v.card.bank, userId],
  );
  const u = rows[0];
  return {
    maskedNumber: wallet.maskCard(u.bank_card_number),
    holder: u.bank_card_holder,
    bank: u.bank_card_bank,
    sheba: u.bank_card_sheba ? `${u.bank_card_sheba.slice(0, 6)}••••${u.bank_card_sheba.slice(-4)}` : null,
    savedAt: u.bank_card_saved_at,
  };
}

/** حذف کارت بانکی ذخیره‌شده. */
async function deleteBankCard(userId) {
  const pending = await pool.query(
    "SELECT COUNT(*)::int AS c FROM withdrawal_requests WHERE user_id=$1 AND status IN ('pending','approved')",
    [userId],
  );
  if (pending.rows[0].c > 0) {
    throw Object.assign(new Error('تا پایان بررسی درخواست‌های فعلی نمی‌توانید کارت را حذف کنید'), { status: 409 });
  }
  await pool.query(
    `UPDATE users SET bank_card_number=NULL, bank_card_holder=NULL, bank_card_sheba=NULL,
            bank_card_bank=NULL, bank_card_saved_at=NULL, updated_at=NOW() WHERE id=$1`,
    [userId],
  );
  return { message: 'کارت بانکی حذف شد' };
}

/**
 * ثبت درخواست برداشت. کل عملیات در یک تراکنش:
 * قفل کاربر → اعتبارسنجی → کسر (hold) → ثبت درخواست.
 */
async function createRequest(userId, rawAmount) {
  const settings = await wallet.getWalletSettings();
  if (!settings.enabled) {
    throw Object.assign(new Error('برداشت در حال حاضر غیرفعال است'), { status: 403 });
  }

  const amount = Math.floor(Number(rawAmount));
  if (!Number.isFinite(amount) || amount <= 0) {
    throw Object.assign(new Error('مبلغ برداشت معتبر نیست'), { status: 400 });
  }
  if (amount < settings.minWithdrawal) {
    throw Object.assign(
      new Error(`حداقل مبلغ قابل برداشت ${settings.minWithdrawal.toLocaleString('en-US')} تومان است`),
      { status: 400 },
    );
  }
  if (amount > settings.maxWithdrawal) {
    throw Object.assign(
      new Error(`حداکثر مبلغ هر برداشت ${settings.maxWithdrawal.toLocaleString('en-US')} تومان است`),
      { status: 400 },
    );
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // قفل ردیف کاربر پیش از هر بررسی: دو درخواست همزمان از دو دستگاه بدون
    // این قفل هر دو موجودی یکسان را می‌بینند و هر دو تأیید می‌شوند.
    const u = await client.query(
      `SELECT wallet_balance, bank_card_number, bank_card_holder, bank_card_sheba, bank_card_bank
         FROM users WHERE id=$1 FOR UPDATE`,
      [userId],
    );
    const user = u.rows[0];
    if (!user) throw Object.assign(new Error('کاربر پیدا نشد'), { status: 404 });

    if (!user.bank_card_number) {
      throw Object.assign(
        new Error('برای ثبت درخواست برداشت ابتدا باید کارت بانکی خود را ذخیره کنید'),
        { status: 400 },
      );
    }

    const pending = await client.query(
      "SELECT COUNT(*)::int AS c FROM withdrawal_requests WHERE user_id=$1 AND status IN ('pending','approved')",
      [userId],
    );
    if (pending.rows[0].c >= settings.maxPendingRequests) {
      throw Object.assign(
        new Error(`شما ${pending.rows[0].c} درخواست در حال بررسی دارید؛ تا تعیین تکلیف آن‌ها نمی‌توانید درخواست جدید ثبت کنید`),
        { status: 409 },
      );
    }

    if (Number(user.wallet_balance) < amount) {
      throw Object.assign(new Error('موجودی کیف پول شما کافی نیست'), { status: 400 });
    }

    const created = await client.query(
      `INSERT INTO withdrawal_requests
         (user_id, amount, card_number, card_holder, card_sheba, card_bank, status)
       VALUES ($1,$2,$3,$4,$5,$6,'pending') RETURNING *`,
      [userId, amount, user.bank_card_number, user.bank_card_holder, user.bank_card_sheba, user.bank_card_bank],
    );
    const request = created.rows[0];

    // بلوکه‌کردن مبلغ
    await wallet.debit(client, {
      userId,
      amount,
      source: 'withdrawal_hold',
      referenceType: 'withdrawal_requests',
      referenceId: request.id,
      description: `بلوکه شدن مبلغ برای درخواست برداشت`,
    });

    await client.query('COMMIT');
    return publicRequest(request);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

/** لغو درخواست توسط خود کاربر — فقط تا قبل از تأیید مدیر. */
async function cancelRequest(userId, requestId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const q = await client.query(
      'SELECT * FROM withdrawal_requests WHERE id=$1 AND user_id=$2 FOR UPDATE',
      [requestId, userId],
    );
    const req = q.rows[0];
    if (!req) throw Object.assign(new Error('درخواست پیدا نشد'), { status: 404 });
    if (req.status !== 'pending') {
      throw Object.assign(new Error('این درخواست دیگر قابل لغو نیست'), { status: 409 });
    }
    await client.query(
      "UPDATE withdrawal_requests SET status='canceled', updated_at=NOW() WHERE id=$1",
      [requestId],
    );
    await wallet.credit(client, {
      userId,
      amount: Number(req.amount),
      source: 'withdrawal_refund',
      referenceType: 'withdrawal_requests',
      referenceId: req.id,
      description: 'برگشت مبلغ به دلیل لغو درخواست توسط کاربر',
    });
    await client.query('COMMIT');
    return { message: 'درخواست برداشت لغو شد و مبلغ به کیف پول برگشت' };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

/**
 * تغییر وضعیت درخواست توسط مدیر.
 *
 * گذارهای مجاز:
 *   pending  → approved | rejected
 *   approved → paid | rejected
 * هر گذار دیگری (مثلاً paid → pending یا تأیید دوبارهٔ یک درخواست پرداخت‌شده)
 * رد می‌شود. بدون این جدول، دو بار زدن «رد کردن» روی یک درخواست، دو بار مبلغ
 * را برمی‌گرداند و از هیچ، پول می‌سازد.
 */
const ALLOWED_TRANSITIONS = {
  pending: ['approved', 'rejected'],
  approved: ['paid', 'rejected'],
  paid: [],
  rejected: [],
  canceled: [],
};

async function decide(adminId, requestId, { status, adminNote, trackingCode }) {
  if (!Object.keys(ALLOWED_TRANSITIONS).includes(status)) {
    throw Object.assign(new Error('وضعیت نامعتبر است'), { status: 400 });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const q = await client.query('SELECT * FROM withdrawal_requests WHERE id=$1 FOR UPDATE', [requestId]);
    const req = q.rows[0];
    if (!req) throw Object.assign(new Error('درخواست پیدا نشد'), { status: 404 });

    if (!ALLOWED_TRANSITIONS[req.status].includes(status)) {
      throw Object.assign(
        new Error(`تغییر وضعیت از «${faStatus(req.status)}» به «${faStatus(status)}» مجاز نیست`),
        { status: 409 },
      );
    }

    const note = adminNote ? String(adminNote).slice(0, 1000) : null;
    const tracking = trackingCode ? String(trackingCode).trim().slice(0, 80) : null;

    if (status === 'rejected') {
      // رد شد → پول بلوکه‌شده برمی‌گردد
      await wallet.credit(client, {
        userId: req.user_id,
        amount: Number(req.amount),
        source: 'withdrawal_refund',
        referenceType: 'withdrawal_requests',
        referenceId: req.id,
        description: note ? `برگشت مبلغ — رد درخواست: ${note}` : 'برگشت مبلغ به دلیل رد درخواست',
        adminId,
      });
    }

    const updated = await client.query(
      `UPDATE withdrawal_requests
          SET status=$1,
              admin_note=COALESCE($2, admin_note),
              tracking_code=COALESCE($3, tracking_code),
              decided_by_admin_id=$4,
              decided_at=NOW(),
              paid_at=CASE WHEN $1='paid' THEN NOW() ELSE paid_at END,
              updated_at=NOW()
        WHERE id=$5 RETURNING *`,
      [status, note, tracking, adminId, requestId],
    );

    await client.query('COMMIT');

    // اطلاع‌رسانی بعد از COMMIT: اگر ارسال نوتیف شکست بخورد نباید تراکنش پولی
    // را برگرداند.
    const amountFa = Number(req.amount).toLocaleString('en-US');
    const messages = {
      approved: ['درخواست برداشت تأیید شد', `برداشت ${amountFa} تومانی شما تأیید شد و به‌زودی واریز می‌شود.`],
      paid: ['واریز انجام شد 🎉', `مبلغ ${amountFa} تومان به کارت شما واریز شد.${tracking ? ` کد پیگیری: ${tracking}` : ''}`],
      rejected: ['درخواست برداشت رد شد', `درخواست ${amountFa} تومانی شما رد شد و مبلغ به کیف پولتان برگشت.${note ? ` دلیل: ${note}` : ''}`],
    };
    if (messages[status]) {
      createNotification(req.user_id, 'withdrawal', messages[status][0], messages[status][1]).catch(() => {});
    }

    return publicRequest(updated.rows[0]);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

function faStatus(s) {
  return {
    pending: 'در انتظار بررسی',
    approved: 'تأیید شده',
    paid: 'پرداخت شده',
    rejected: 'رد شده',
    canceled: 'لغو شده',
  }[s] || s;
}

/** نسخهٔ قابل ارائه به کاربر — شمارهٔ کارت ماسک‌شده. */
function publicRequest(row) {
  if (!row) return null;
  return {
    id: row.id,
    amount: Number(row.amount),
    status: row.status,
    statusLabel: faStatus(row.status),
    cardMasked: wallet.maskCard(row.card_number),
    cardHolder: row.card_holder,
    cardBank: row.card_bank,
    adminNote: row.admin_note,
    trackingCode: row.tracking_code,
    createdAt: row.created_at,
    decidedAt: row.decided_at,
    paidAt: row.paid_at,
  };
}

async function listForUser(userId) {
  const { rows } = await pool.query(
    'SELECT * FROM withdrawal_requests WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100',
    [userId],
  );
  return rows.map(publicRequest);
}

/**
 * فهرست کامل برای مدیر — اینجا شمارهٔ کارت **کامل** برمی‌گردد، چون مدیر باید
 * بتواند مبلغ را واقعاً واریز کند. این تنها نقطهٔ سیستم است که شمارهٔ کامل
 * کارت از API خارج می‌شود و پشت adminAuth قرار دارد.
 */
async function listForAdmin({ status, search, limit = 200 } = {}) {
  const params = [];
  const where = [];
  if (status && status !== 'all') {
    params.push(status);
    where.push(`w.status=$${params.length}`);
  }
  if (search) {
    params.push(`%${search}%`);
    where.push(`(u.mobile ILIKE $${params.length} OR u.nickname ILIKE $${params.length} OR w.card_holder ILIKE $${params.length} OR w.card_number ILIKE $${params.length})`);
  }
  params.push(Math.min(500, Math.max(1, Number(limit) || 200)));
  const { rows } = await pool.query(
    `SELECT w.*, u.mobile, u.nickname, u.first_name, u.last_name, u.wallet_balance
       FROM withdrawal_requests w
       JOIN users u ON u.id = w.user_id
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY
        CASE w.status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END,
        w.created_at DESC
      LIMIT $${params.length}`,
    params,
  );
  return rows.map((r) => ({
    ...publicRequest(r),
    cardNumber: r.card_number,
    cardSheba: r.card_sheba,
    user: {
      id: r.user_id,
      mobile: r.mobile,
      nickname: r.nickname,
      fullName: [r.first_name, r.last_name].filter(Boolean).join(' '),
      walletBalance: Number(r.wallet_balance),
    },
  }));
}

/** آمار سرصفحهٔ پنل مدیر. */
async function adminStats() {
  const { rows } = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE status='pending')::int  AS pending_count,
      COALESCE(SUM(amount) FILTER (WHERE status='pending'),0)::bigint  AS pending_amount,
      COUNT(*) FILTER (WHERE status='approved')::int AS approved_count,
      COALESCE(SUM(amount) FILTER (WHERE status='approved'),0)::bigint AS approved_amount,
      COUNT(*) FILTER (WHERE status='paid')::int     AS paid_count,
      COALESCE(SUM(amount) FILTER (WHERE status='paid'),0)::bigint     AS paid_amount,
      COALESCE(SUM(amount) FILTER (WHERE status='paid' AND paid_at > NOW() - INTERVAL '30 days'),0)::bigint AS paid_amount_30d
    FROM withdrawal_requests`);
  const wal = await pool.query(
    'SELECT COALESCE(SUM(wallet_balance),0)::bigint AS total FROM users',
  );
  return {
    pendingCount: rows[0].pending_count,
    pendingAmount: Number(rows[0].pending_amount),
    approvedCount: rows[0].approved_count,
    approvedAmount: Number(rows[0].approved_amount),
    paidCount: rows[0].paid_count,
    paidAmount: Number(rows[0].paid_amount),
    paidAmount30d: Number(rows[0].paid_amount_30d),
    totalWalletLiability: Number(wal.rows[0].total),
  };
}

module.exports = {
  saveBankCard,
  deleteBankCard,
  createRequest,
  cancelRequest,
  decide,
  listForUser,
  listForAdmin,
  adminStats,
  publicRequest,
  faStatus,
  ALLOWED_TRANSITIONS,
};
