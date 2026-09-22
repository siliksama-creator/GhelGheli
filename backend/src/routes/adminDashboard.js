// ─────────────────────────────────────────────────────────────────────
// داشبورد، سنجه‌ها، موجودی دوئل، کمیسیون‌ها، آمار گردونه،
// اسپینِ نامحدود، آپلودِ تصویر و نتایجِ بازی‌ها — بیرون آمده از server.js (بندِ ۱ ممیزی).
//
// خوشهٔ کشِ سنجه‌ها (readRedisMemory/readPm2Logs) هم فقط اینجا مصرف دارد و
// همراهِ مسیر آمده تا server.js سبک‌تر بماند.
// ─────────────────────────────────────────────────────────────────────
const express = require('express');
const fs = require('fs');

module.exports = ({
  pool, adminAuth, requireRole, asyncHandler,
  validateUuid, audit, io, logger,
  imageUpload, optimizeUpload, verifyUpload, cardDuel,
  referrals, wheel, getLeaderboard, presence,
  kb,
}) => {
  const router = express.Router();

// ── حافظهٔ کشِ مانیتورینگ سرور ───────────────────────────────────────────
// صفحهٔ «مانیتورینگ سرور» هر ۴ ثانیه این اندپوینت را صدا می‌زند. قبلاً هر
// فراخوانی سه پروسهٔ زیرسیستمی را **هم‌زمان** (`execSync`) اجرا می‌کرد:
// `redis-cli`، `pm2 jlist` و `tail`. در Node تک‌رشته‌ای هر `execSync` کلِ
// حلقهٔ رویداد را می‌بندد؛ یعنی وقتی یک مدیر صفحهٔ مانیتورینگ را باز
// می‌گذاشت، هر ۴ ثانیه حلقهٔ رویداد صدها میلی‌ثانیه قفل می‌شد و بازی‌های
// زنده و درخواست‌های بقیهٔ کاربران تأخیر می‌گرفتند.
//
// دو اصلاح:
//   1. `execSync` → `exec` (غیرهم‌زمان، پشتِ Promise) تا انسدادِ حلقهٔ
//      رویداد از بین برود.
//   2. نتیجه هر دو فراخوانیِ گران (redis + pm2 log) **کش** می‌شود و هر
//      ~۱۰ ثانیه یک‌بار تازه می‌شود. داده‌های پرتابی (تعداد سوکت، اتاق،
//      کانکشنِ پستگرس) همیشه تازه‌اند؛ فقط آن‌چه واقعاً هر ۴ ثانیه لازم
//      نیست، کش می‌گیرد. (۱۰ ثانیه برای نوارِ مانیتورینگ بیش از اندازه
//      کافی است.)
const { exec } = require('child_process');
const { promisify } = require('util');
const execP = promisify(exec);
let _metricsCache = null;
let _metricsCachedAt = 0;
const METRICS_CACHE_TTL_MS = 10_000;

async function readRedisMemory() {
  try {
    const { stdout } = await execP('redis-cli info memory', { timeout: 3000 });
    const match = stdout.match(/used_memory_human:([^\r\n]+)/);
    const matchRss = stdout.match(/used_memory_rss_human:([^\r\n]+)/);
    if (match) return `${match[1]} (RSS: ${matchRss ? matchRss[1] : '—'})`;
    return '—';
  } catch (_) {
    return 'در دسترس نیست';
  }
}

async function readPm2Logs() {
  try {
    // همهٔ گره‌های تولید (game + http) را از PM2 می‌خوانیم؛ قبلاً فقط
    // ghelgheli-api خوانده می‌شد و خطای گرهٔ http هیچ‌وقت در پنل دیده نمی‌شد.
    let apps = [];
    try {
      const { stdout } = await execP('pm2 jlist', { timeout: 3000 });
      apps = JSON.parse(stdout)
        .filter(x => x.name === 'ghelgheli-api' || x.name === 'ghelgheli-api-http');
    } catch (_) { /* مسیر پیش‌فرض پایین */ }

    const chunks = [];
    for (const app of apps) {
      const logPath = app?.pm2_env?.pm_err_log_path;
      if (!logPath) continue;
      const label = app.name === 'ghelgheli-api' ? 'گره بازی (game)'
        : app.name === 'ghelgheli-api-http' ? 'گره HTTP'
        : app.name;
      let body = '';
      try {
        if (fs.existsSync(logPath)) {
          const { stdout } = await execP(`tail -n 100 ${logPath}`, { timeout: 3000 });
          body = stdout;
        }
      } catch (_) { /* ناتوان در خواندن این گره */ }
      // فایل جاری خالی است (از آخرین بوت هیچ خطایی نبوده)؛ آخرین آرشیو چرخش‌یافته
      // را بخوان تا اگر خطای اخیری قبل از بوت فعلی بوده خاموش نماند.
      if (!body.trim()) {
        try {
          const { stdout } = await execP(
            `ls -1t ${logPath}.* 2>/dev/null | head -1`, { timeout: 2000 });
          const rotated = stdout.trim();
          if (rotated) {
            const f = rotated.endsWith('.gz')
              ? `gzip -dc ${rotated}` : `tail -n 40 ${rotated}`;
            const { stdout: old } = await execP(`${f}`, { timeout: 3000 });
            body = `(از آرشیو چرخش‌یافتهٔ ${rotated.split('/').pop()})\n${old}`;
          }
        } catch (_) { /* آرشیویی نیست */ }
      }
      chunks.push(
        body.trim()
          ? `# ───── ${label} · ${app.name} ─────\n${body.trim()}`
          : `# ───── ${label} · ${app.name} ─────\n(هیچ خطایی در لاگ نیست — گره سالم)`,
      );
    }

    if (!chunks.length) {
      const fallback = '/home/ghelgheli/.pm2/logs/ghelgheli-api-error-0.log';
      if (fs.existsSync(fallback)) {
        const { stdout } = await execP(`tail -n 100 ${fallback}`, { timeout: 3000 });
        return stdout.trim() || 'در فایل لاگ هیچ خطایی ثبت نشده — سرور سالم است.';
      }
      return 'فایل لاگ پیدا نشد';
    }
    return chunks.join('\n\n');
  } catch (e) {
    return `خطا در خواندن لاگ: ${e.message}`;
  }
}

// Snapshot for balancing: which focus, rarity and effect actually win in the
// last real matches. Admin-only because it is a product-tuning view, not
// player-facing data.
router.get('/admin/card-duel/balance', adminAuth, requireRole('support'), asyncHandler(async (req, res) => {
  res.json(await cardDuel.balanceSnapshot(req.query.limit));
}));

router.get('/admin/referrals/purchase-commissions', adminAuth,
  requireRole('support'), asyncHandler(async (req, res) => {
    res.json(await referrals.purchaseCommissionAudit({
      limit: req.query.limit,
      offset: req.query.offset,
    }));
  }));

// آمار گردونه برای مدیر — بدون این هیچ راهی نیست بفهمیم نرخ واقعی جوایز با
// نرخ طراحی‌شده می‌خواند یا نه.
router.get('/admin/wheel/stats', adminAuth, requireRole('support'),
  asyncHandler(async (req, res) => {
    res.json(await wheel.stats());
  }));

// چرخش نامحدود برای یک حساب — ابزار تست مالک.
//
// requireRole() بدون آرگومان یعنی فقط سوپرادمین: این پرچم عملاً جوایز
// نامحدود می‌دهد، پس نباید در دسترس نقش پشتیبانی باشد.
router.post('/admin/users/:id/unlimited-spins', adminAuth, validateUuid('id'),
  requireRole(), asyncHandler(async (req, res) => {
    const on = req.body.enabled !== false;
    const { rowCount } = await pool.query(
      'UPDATE users SET unlimited_spins = $2, updated_at = NOW() WHERE id = $1',
      [req.params.id, on]);
    if (!rowCount) return res.status(404).json({ message: 'کاربر پیدا نشد' });
    await audit(req.admin.id, 'unlimited_spins', 'users', req.params.id,
      req.body.reason, { enabled: on });
    res.json({
      message: on ? 'چرخش نامحدود فعال شد' : 'چرخش نامحدود غیرفعال شد',
      unlimitedSpins: on,
    });
  }));

router.get('/admin/dashboard', adminAuth, asyncHandler(async (req, res) => {
  const q = await Promise.all([
    pool.query('SELECT count(*)::int AS count FROM users'),
    // ═══════════════════════════════════════════════════════════════════
    // کارت‌های ثبت‌شده = photo_card_codes (مسیرِ فعلیِ عکس+کد)
    // ═══════════════════════════════════════════════════════════════════
    //
    // قبلاً این دو کاشی مجموعِ دو نسلِ جدول کد را می‌شمردند (card_codes
    // قدیمی + photo_card_codes). سیستمِ قدیمی با مایگریشن ۰۸۰ حذف شد و
    // فقط جدولِ فعلی مانده — هر ثبتِ واقعی از مسیرِ «کارت با عکس» در
    // photo_card_codes می‌نویسد.
    //
    // ⚠️ عمداً از `user_card_inventory` شمرده نمی‌شود: آن جدول کارتِ
    // صندوق و اعطای دستی را هم نگه می‌دارد، و ردیفش با `quantity` جمع
    // می‌شود نه یک ردیف به‌ازای هر ثبت — یعنی عددی می‌داد که «کارتِ
    // ثبت‌شده» نیست.
    pool.query(`SELECT count(*)::int AS count FROM photo_card_codes
                 WHERE status='used' AND used_at::date=CURRENT_DATE`),
    pool.query(`SELECT count(*)::int AS count FROM photo_card_codes
                 WHERE status='used' AND used_at >= date_trunc('month', NOW())`),
    pool.query("SELECT count(*)::int AS count FROM user_reward_claims WHERE status='pending'"),
    getLeaderboard(10),
    // صف‌های عملیاتی — داشبورد قبلی فقط چهار عدد کلی داشت و مدیر برای
    // «کار امروز» باید چهار صفحه را جدا باز می‌کرد. این‌ها COUNT ارزان‌اند.
    pool.query("SELECT count(*)::int AS count FROM support_tickets WHERE status <> 'closed'"),
    pool.query("SELECT count(*)::int AS count, COALESCE(SUM(amount),0)::bigint AS amount FROM withdrawal_requests WHERE status='pending'"),
    pool.query("SELECT count(*)::int AS count FROM photo_card_submissions WHERE status='pending'"),
    pool.query("SELECT count(DISTINCT user_id)::int AS count FROM user_subscriptions WHERE expires_at > NOW()"),
    pool.query('SELECT COALESCE(SUM(coins),0)::bigint AS total FROM users'),
    pool.query("SELECT count(*)::int AS count FROM app_crash_reports WHERE status='open'"),
    pool.query("SELECT count(*)::int AS count FROM users WHERE joined_at::date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tehran')::date"),
    pool.query("SELECT count(*)::int AS count FROM wheel_spins WHERE spun_day = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tehran')::date"),
  ]);
  res.json({
    users: q[0].rows[0].count,
    usedCodesToday: q[1].rows[0].count,
    usedCodesThisMonth: q[2].rows[0].count,
    pendingClaims: q[3].rows[0].count,
    league: q[4],
    pendingTickets: q[5].rows[0].count,
    pendingWithdrawals: q[6].rows[0].count,
    pendingWithdrawalAmount: Number(q[6].rows[0].amount || 0),
    pendingPhotoReviews: q[7].rows[0].count,
    plusActive: q[8].rows[0].count,
    coinsInCirculation: Number(q[9].rows[0].total || 0),
    openCrashes: q[10].rows[0].count,
    usersJoinedToday: q[11].rows[0].count,
    wheelSpinsToday: q[12].rows[0].count,
  });
}));

router.get('/admin/metrics', adminAuth, asyncHandler(async (req, res) => {
  const attachGames = require('../games/engine');

  // TTL check — skip the expensive subprocess reads when recently cached.
  let redisMemory;
  let pm2Logs;
  if (_metricsCache && Date.now() - _metricsCachedAt < METRICS_CACHE_TTL_MS) {
    ({ redisMemory, pm2Logs } = _metricsCache);
  } else {
    [redisMemory, pm2Logs] = await Promise.all([readRedisMemory(), readPm2Logs()]);
    _metricsCache = { redisMemory, pm2Logs };
    _metricsCachedAt = Date.now();
  }

  res.json({
    socketCount: io.engine.clientsCount || 0,
    // onlineUsers ناهمگام است چون در حالت خوشه‌ای باید از ردیس بخواند.
    // بدون await یک Promise به JSON می‌رفت و در پنل «{}» دیده می‌شد.
    onlineUsers: await presence.onlineUsers(),
    activeRooms: attachGames.rooms ? attachGames.rooms.size : 0,
    postgresConnections: {
      total: pool.totalCount,
      idle: pool.idleCount,
      waiting: pool.waitingCount
    },
    redisMemory,
    pm2Logs
  });
}));

router.post('/admin/uploads/image', adminAuth, requireRole('support'), imageUpload.single('image'), asyncHandler(async (req, res) => {
  // fileFilter drops anything that isn't png/jpg/webp/gif without raising,
  // so a missing req.file here means "wrong type" rather than "no file".
  if (!req.file) return res.status(400).json({ message: 'فقط فایل تصویری (PNG/JPG/WEBP/GIF) مجاز است' });
  // همانِ مسیر کاربر: محتوای واقعی با sharp راستی‌آزمایی می‌شود — mimetype
  // و پسوندِ اعلامیِ فرستنده هر دو جعل‌شدنی‌اند (توضیح کامل در imageService).
  await verifyUpload(req.file);
  const r = await optimizeUpload(req.file);
  logger.info(`[upload] admin ${kb(r.bytesBefore)} -> ${kb(r.bytesAfter)}`);
  res.json({ url: `/uploads/images/${r.filename}`, bytes: r.bytesAfter });
}));

// Recent scoring history, so support can answer "why did my points change?".
router.get('/admin/games/results', adminAuth, asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT r.*, u.nickname, u.mobile, o.nickname AS opponent_nickname
     FROM game_results r
     JOIN users u ON u.id = r.user_id
     LEFT JOIN users o ON o.id = r.opponent_user_id
     ORDER BY r.created_at DESC LIMIT 100`,
  );
  res.json(rows);
}));

  return router;
};
