// ============================================================================
//  سرویس کیف پول تومانی
// ============================================================================
//
// تنها راه مجاز برای جابه‌جایی پول در کل سیستم. هیچ‌جای دیگری نباید مستقیماً
// `UPDATE users SET wallet_balance = ...` بزند؛ همه چیز از credit()/debit()
// عبور می‌کند تا:
//   ۱. دفتر کل همیشه با موجودی هم‌خوان بماند،
//   ۲. هر ریال یک ردیف با منبع و مرجع مشخص داشته باشد،
//   ۳. قفل ردیف کاربر مانع مسابقهٔ همزمانی (race) شود.

const { pool } = require('../config/db');

const DEFAULTS = {
  enabled: true,
  minWithdrawal: 50000,
  maxWithdrawal: 50000000,
  maxPendingRequests: 2,
  note: 'برداشت‌ها طی ۲۴ تا ۷۲ ساعت کاری بررسی و واریز می‌شوند.',
};

async function getWalletSettings(client = pool) {
  const { rows } = await client.query(
    "SELECT value FROM app_settings WHERE key='wallet_settings' LIMIT 1",
  );
  const v = rows[0]?.value;
  if (!v || typeof v !== 'object') return { ...DEFAULTS };
  const num = (x, fallback, min = 0) => {
    const n = Number(x);
    return Number.isFinite(n) && n >= min ? Math.floor(n) : fallback;
  };
  const min = num(v.minWithdrawal, DEFAULTS.minWithdrawal, 1000);
  // سقف هرگز نباید زیر کف بیفتد، وگرنه هیچ مبلغی قابل برداشت نیست و کاربر
  // پیغام متناقض «حداقل ۵۰٬۰۰۰ / حداکثر ۱۰٬۰۰۰» می‌گیرد.
  const max = Math.max(min, num(v.maxWithdrawal, DEFAULTS.maxWithdrawal, 1000));
  return {
    enabled: v.enabled === undefined ? true : Boolean(v.enabled),
    minWithdrawal: min,
    maxWithdrawal: max,
    maxPendingRequests: Math.min(10, Math.max(1, num(v.maxPendingRequests, DEFAULTS.maxPendingRequests, 1))),
    note: typeof v.note === 'string' ? v.note.slice(0, 500) : DEFAULTS.note,
  };
}

async function saveWalletSettings(body, adminId) {
  const current = await getWalletSettings();
  const merged = { ...current };
  if (body.enabled !== undefined) merged.enabled = Boolean(body.enabled);
  if (body.minWithdrawal !== undefined) merged.minWithdrawal = Math.max(1000, Math.floor(Number(body.minWithdrawal) || 0));
  if (body.maxWithdrawal !== undefined) merged.maxWithdrawal = Math.max(1000, Math.floor(Number(body.maxWithdrawal) || 0));
  if (body.maxPendingRequests !== undefined) merged.maxPendingRequests = Math.min(10, Math.max(1, Math.floor(Number(body.maxPendingRequests) || 1)));
  if (body.note !== undefined) merged.note = String(body.note || '').slice(0, 500);
  if (merged.maxWithdrawal < merged.minWithdrawal) merged.maxWithdrawal = merged.minWithdrawal;
  await pool.query(
    `INSERT INTO app_settings(key,value,updated_by_admin_id,updated_at)
     VALUES('wallet_settings',$1,$2,NOW())
     ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,
       updated_by_admin_id=EXCLUDED.updated_by_admin_id, updated_at=NOW()`,
    [JSON.stringify(merged), adminId || null],
  );
  return merged;
}

// ---------------------------------------------------------------------------
// حرکت پول
// ---------------------------------------------------------------------------

// ── منابعِ مجاز برای تراکنشِ **جدید** ──────────────────────────────────
//
// کیف پول از دور ۱۸ فقط پولِ خودِ کاربر است:
//
//     ورودی : کارت نقدی · گردونه · جایزهٔ لیگ · گذر نبرد · کمیسیون ۵٪
//             · واریز دستی ادمین
//     خروجی : فقط درخواست برداشت (hold/refund)
//
// خریدِ آیتم شاپ و پلاس ۱۰۰٪ از کافه‌بازار انجام می‌شود و **هرگز** از
// این موجودی کم نمی‌کند.
//
// ⚠️ این فهرست باید زیرمجموعهٔ CHECK جدول `wallet_transactions` بماند.
// اگر منبعی اینجا باشد و در CHECK نباشد، خطا در «زمان اجرا» ظاهر می‌شود
// نه در تست: پایگاه‌داده تراکنش را برمی‌گرداند و عملیات بی‌صدا شکست
// می‌خورد. تستِ `testPayments.js` این همگامی را می‌سنجد.
const VALID_SOURCES = new Set([
  'card_cash', 'wheel', 'reward', 'league',
  'admin_credit', 'admin_debit', 'withdrawal_hold', 'withdrawal_refund',
  // ۵٪ خرید دوست مستقیماً و به‌صورت قابل برداشت وارد کیف پول معرف می‌شود.
  // این منبع فقط از referralService و داخل همان تراکنش خرید صادر می‌شود.
  // تنها راهی است که یک خرید به کیف پول پول **اضافه** می‌کند.
  'purchase_referral',
  // جوایز نقدیِ گذر نبرد. منبع جدا لازم است چون UNIQUE (source,
  // reference_id) مشترک است: بدون آن، شناسهٔ یک پله می‌توانست با شناسهٔ
  // یک تراکنش دیگر برخورد کند و واریز بی‌صدا «تکراری» تشخیص داده شود.
  'pass',
  // خریدِ شاپ با موجودیِ کیف پول (دورِ ۲۲). کاربری که از لیگ یا جایزهٔ
  // نقدی پول گرفته، می‌تواند همان را در شاپ خرج کند. در CHECK دیتابیس
  // از قبل مجاز بود و فقط اینجا غایب بود.
  //
  // ⛔ خریدی که از این منبع پرداخت می‌شود کمیسیونِ معرف **نمی‌دهد** —
  // خواستهٔ صریحِ مالک. اجرایش در `shopService.deliverItem` است.
  'shop',
]);

// منابعی که **دیگر تولید نمی‌شوند** ولی در ردیف‌های تاریخی وجود دارند.
//
// اینها از VALID_SOURCES بیرون‌اند تا کدِ جدید نتواند بسازدشان، ولی از
// CHECK دیتابیس حذف **نشده‌اند** چون ردیف‌های قدیمی باید معتبر بمانند.
// فقط برای خوانایی گزارش‌ها و فیلترِ پنل ادمین صادر می‌شود.
const LEGACY_SOURCES = Object.freeze([
  // خرید شاپ و پلاس از موجودی کیف پول — جایگزین شد با خرید مستقیم بازار.
  'shop', 'subscription',
  // شارژ کیف پول از بازار — مالک این مدل را رد کرد.
  'topup', 'topup_refund',
]);

function normalizeAmount(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
    throw Object.assign(new Error('مبلغ باید عددی صحیح و بزرگ‌تر از صفر باشد'), { status: 400 });
  }
  // سقف منطقی برای یک تراکنش واحد: جلوی خطای تایپی مدیر (اضافه کردن سه صفر)
  // و جلوی سرریز BIGINT در جمع‌های بعدی را می‌گیرد.
  if (n > 100_000_000_000) {
    throw Object.assign(new Error('مبلغ تراکنش خارج از محدودهٔ مجاز است'), { status: 400 });
  }
  return n;
}

/**
 * واریز به کیف پول کاربر.
 *
 * حتماً باید داخل یک تراکنش دیتابیس (client در حالت BEGIN) صدا زده شود تا
 * واریز و رویدادی که باعثش شده (مصرف کد کارت، تأیید جایزه و ...) اتمیک باشند.
 *
 * @param {object} client  کلاینت pg داخل تراکنش
 * @param {object} opts
 * @param {string} opts.userId
 * @param {number} opts.amount        مبلغ به تومان
 * @param {string} opts.source        یکی از VALID_SOURCES
 * @param {string} [opts.referenceType]
 * @param {string} [opts.referenceId] برای جلوگیری از واریز تکراری
 * @param {string} [opts.description]
 * @param {string} [opts.adminId]
 * @returns {Promise<{transaction: object, balance: number, duplicate: boolean}>}
 */
async function credit(client, opts) {
  const { userId, source, referenceType = null, referenceId = null, description = null, adminId = null } = opts;
  const amount = normalizeAmount(opts.amount);
  if (!VALID_SOURCES.has(source)) throw new Error(`منبع تراکنش نامعتبر: ${source}`);

  // قفل ردیف کاربر: دو واریز همزمان (مثلاً ثبت هم‌زمان دو کد کارت از دو
  // دستگاه) بدون این قفل هر دو موجودی قدیمی را می‌خوانند و یکی از واریزها
  // بی‌صدا گم می‌شود — کلاسیک lost update.
  const locked = await client.query(
    'SELECT wallet_balance FROM users WHERE id=$1 FOR UPDATE',
    [userId],
  );
  if (!locked.rows[0]) throw Object.assign(new Error('کاربر پیدا نشد'), { status: 404 });

  // ضدتکرار: اگر همین مرجع قبلاً واریز شده، دوباره واریز نکن.
  if (referenceId) {
    const dup = await client.query(
      'SELECT * FROM wallet_transactions WHERE source=$1 AND reference_id=$2 LIMIT 1',
      [source, referenceId],
    );
    if (dup.rows[0]) {
      return { transaction: dup.rows[0], balance: Number(locked.rows[0].wallet_balance), duplicate: true };
    }
  }

  const balanceAfter = Number(locked.rows[0].wallet_balance) + amount;
  await client.query(
    'UPDATE users SET wallet_balance=$1, updated_at=NOW() WHERE id=$2',
    [balanceAfter, userId],
  );
  const tx = await client.query(
    `INSERT INTO wallet_transactions
       (user_id, direction, amount, source, reference_type, reference_id,
        balance_after, description, admin_user_id)
     VALUES ($1,'credit',$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [userId, amount, source, referenceType, referenceId, balanceAfter, description, adminId],
  );
  return { transaction: tx.rows[0], balance: balanceAfter, duplicate: false };
}

/**
 * برداشت از کیف پول کاربر. اگر موجودی کافی نباشد خطای ۴۰۰ می‌دهد
 * (نه ۵۰۰ ناشی از نقض CHECK constraint).
 */
async function debit(client, opts) {
  const { userId, source, referenceType = null, referenceId = null, description = null, adminId = null } = opts;
  const amount = normalizeAmount(opts.amount);
  if (!VALID_SOURCES.has(source)) throw new Error(`منبع تراکنش نامعتبر: ${source}`);

  const locked = await client.query(
    'SELECT wallet_balance FROM users WHERE id=$1 FOR UPDATE',
    [userId],
  );
  if (!locked.rows[0]) throw Object.assign(new Error('کاربر پیدا نشد'), { status: 404 });

  const balance = Number(locked.rows[0].wallet_balance);
  if (balance < amount) {
    throw Object.assign(new Error('موجودی کیف پول کافی نیست'), { status: 400 });
  }
  const balanceAfter = balance - amount;
  await client.query(
    'UPDATE users SET wallet_balance=$1, updated_at=NOW() WHERE id=$2',
    [balanceAfter, userId],
  );
  const tx = await client.query(
    `INSERT INTO wallet_transactions
       (user_id, direction, amount, source, reference_type, reference_id,
        balance_after, description, admin_user_id)
     VALUES ($1,'debit',$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [userId, amount, source, referenceType, referenceId, balanceAfter, description, adminId],
  );
  return { transaction: tx.rows[0], balance: balanceAfter, duplicate: false };
}

/**
 * واریز مستقل (تراکنش خودش را باز می‌کند). برای مسیرهایی مثل گردونهٔ شانس که
 * رویداد دیگری برای اتمیک‌شدن با آن وجود ندارد.
 */
async function creditStandalone(opts) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await credit(client, opts);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// خواندن
// ---------------------------------------------------------------------------

/** خلاصهٔ کیف پول برای صفحهٔ کاربر: موجودی + آمار + وضعیت کارت + قوانین. */
async function summary(userId) {
  const settings = await getWalletSettings();
  const u = await pool.query(
    `SELECT wallet_balance, bank_card_number, bank_card_holder, bank_card_sheba,
            bank_card_bank, bank_card_saved_at
       FROM users WHERE id=$1`,
    [userId],
  );
  const user = u.rows[0] || {};
  const agg = await pool.query(
    `SELECT
       COALESCE(SUM(amount) FILTER (WHERE direction='credit'),0)::bigint AS total_in,
       COALESCE(SUM(amount) FILTER (WHERE direction='debit'),0)::bigint  AS total_out,
       COUNT(*)::int AS tx_count
     FROM wallet_transactions WHERE user_id=$1`,
    [userId],
  );
  const pending = await pool.query(
    `SELECT COUNT(*)::int AS c, COALESCE(SUM(amount),0)::bigint AS amount
       FROM withdrawal_requests
      WHERE user_id=$1 AND status IN ('pending','approved')`,
    [userId],
  );
  const balance = Number(user.wallet_balance || 0);
  const hasCard = Boolean(user.bank_card_number);
  const pendingCount = pending.rows[0].c;

  // دلیل دقیق «چرا نمی‌توانم برداشت کنم» را همین‌جا حساب می‌کنیم تا کلاینت
  // مجبور نباشد همین منطق را تکرار کند (و با سرور ناهماهنگ شود).
  let blockReason = null;
  if (!settings.enabled) blockReason = 'برداشت موقتاً غیرفعال است';
  else if (!hasCard) blockReason = 'برای برداشت باید ابتدا کارت بانکی خود را ثبت کنید';
  else if (pendingCount >= settings.maxPendingRequests) blockReason = 'شما درخواست برداشت در حال بررسی دارید';
  else if (balance < settings.minWithdrawal) blockReason = `حداقل مبلغ قابل برداشت ${settings.minWithdrawal.toLocaleString('en-US')} تومان است`;

  return {
    balance,
    totalIn: Number(agg.rows[0].total_in),
    totalOut: Number(agg.rows[0].total_out),
    transactionCount: agg.rows[0].tx_count,
    pendingWithdrawals: pendingCount,
    pendingAmount: Number(pending.rows[0].amount),
    card: hasCard ? {
      // فقط ۴ رقم اول و آخر برمی‌گردد. شمارهٔ کامل کارت هرگز به کلاینت
      // برنمی‌گردد؛ اگر لاگ یا اسکرین‌شاتی نشت کند، کارت لو نمی‌رود.
      maskedNumber: maskCard(user.bank_card_number),
      holder: user.bank_card_holder,
      bank: user.bank_card_bank,
      sheba: user.bank_card_sheba ? `${user.bank_card_sheba.slice(0, 6)}••••${user.bank_card_sheba.slice(-4)}` : null,
      savedAt: user.bank_card_saved_at,
    } : null,
    canWithdraw: blockReason === null,
    blockReason,
    settings,
  };
}

function maskCard(n) {
  const s = String(n || '');
  if (s.length !== 16) return '';
  return `${s.slice(0, 4)}-••••-••••-${s.slice(-4)}`;
}

async function transactions(userId, { limit = 50, offset = 0 } = {}) {
  const lim = Math.min(200, Math.max(1, Number(limit) || 50));
  const off = Math.max(0, Number(offset) || 0);
  const { rows } = await pool.query(
    `SELECT id, direction, amount, source, reference_type, balance_after,
            description, created_at
       FROM wallet_transactions
      WHERE user_id=$1
      ORDER BY created_at DESC, id DESC
      LIMIT $2 OFFSET $3`,
    [userId, lim, off],
  );
  return rows;
}

module.exports = {
  LEGACY_SOURCES,
  DEFAULTS,
  getWalletSettings,
  saveWalletSettings,
  credit,
  debit,
  creditStandalone,
  summary,
  transactions,
  maskCard,
};
