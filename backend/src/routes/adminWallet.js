/** Administrative wallet and withdrawal routes. */
const express = require('express');

module.exports = function createAdminWalletRoutes(deps) {
  const {
    pool, adminAuth, requireRole, asyncHandler, audit, validateUuid,
    withdrawalService, walletService, createNotification,
  } = deps;
  const router = express.Router();

// ===========================================================================
//  کیف پول — مسیرهای مدیر
// ===========================================================================

// آمار سرصفحه: چند درخواست در انتظار، چه مبلغی، و کل بدهی کیف پول‌ها
router.get('/admin/wallet/stats', adminAuth, asyncHandler(async (req, res) => {
  res.json(await withdrawalService.adminStats());
}));

// فهرست درخواست‌های برداشت. تنها نقطه‌ای که شمارهٔ کامل کارت برمی‌گردد،
// چون مدیر باید واریز را واقعاً انجام دهد.
router.get('/admin/wallet/withdrawals', adminAuth, asyncHandler(async (req, res) => {
  res.json(await withdrawalService.listForAdmin({
    status: req.query.status,
    search: req.query.search,
    limit: req.query.limit,
  }));
}));

// تأیید / پرداخت / رد یک درخواست
router.patch('/admin/wallet/withdrawals/:id', adminAuth, validateUuid('id'), requireRole('support'), asyncHandler(async (req, res) => {
  const request = await withdrawalService.decide(req.admin.id, req.params.id, {
    status: req.body?.status,
    adminNote: req.body?.adminNote,
    trackingCode: req.body?.trackingCode,
  });
  await audit(req.admin.id, `withdrawal_${req.body?.status}`, 'withdrawal_requests', req.params.id, req.body?.adminNote, {
    status: req.body?.status,
    amount: request.amount,
    trackingCode: request.trackingCode,
  });

  // ═══════════════════════════════════════════════════════════════════════
  // خبر دادن به کاربر — این مرحله وجود نداشت
  // ═══════════════════════════════════════════════════════════════════════
  //
  // درخواست مالک: «اگر ... برداشت کسی انجام بشه ... زنگوله نوتیفیکیشن
  // قرمز بشه».
  //
  // برداشتِ پول مهم‌ترین رخدادِ مالیِ کاربر است و تا امروز **بی‌صدا**
  // انجام می‌شد: مدیر تأیید می‌کرد، پول می‌رفت، و کاربر باید خودش
  // حدس می‌زد که کِی. رد شدن هم همین‌طور — کاربر فقط می‌دید پولش
  // برگشته بدون اینکه بداند چرا.
  //
  // متن‌ها عمداً کدِ پیگیری و دلیلِ رد را در خودشان دارند: کاربر
  // نباید برای دیدنِ آن‌ها جای دیگری برود.
  {
    const amount = Number(request.amount || 0).toLocaleString('en-US');
    const st = String(req.body?.status || '');
    if (st === 'paid') {
      const code = request.trackingCode
        ? ` کد پیگیری: ${request.trackingCode}`
        : '';
      createNotification(request.userId || request.user_id, 'wallet',
        '✅ برداشت شما پرداخت شد',
        `مبلغ ${amount} تومان به حساب شما واریز شد.${code}`,
      ).catch(() => {});
    } else if (st === 'rejected') {
      const why = req.body?.adminNote ? ` دلیل: ${req.body.adminNote}` : '';
      createNotification(request.userId || request.user_id, 'wallet',
        'درخواست برداشت رد شد',
        `مبلغ ${amount} تومان به کیف پول شما برگشت.${why}`,
      ).catch(() => {});
    } else if (st === 'approved') {
      createNotification(request.userId || request.user_id, 'wallet',
        'درخواست برداشت تأیید شد',
        `درخواست ${amount} تومانی شما تأیید شد و به‌زودی پرداخت می‌شود.`,
      ).catch(() => {});
    }
  }

  res.json({ message: 'وضعیت درخواست به‌روزرسانی شد', request });
}));

// دفتر تراکنش‌های یک کاربر خاص (برای بررسی اختلاف حساب)
router.get('/admin/wallet/users/:id/transactions', adminAuth, validateUuid('id'), asyncHandler(async (req, res) => {
  res.json(await walletService.transactions(req.params.id, { limit: req.query.limit || 100 }));
}));

// واریز/کسر دستی توسط مدیر ارشد. عمداً محدود به super_admin است: این
// endpoint عملاً «چاپ پول» می‌کند و نباید در اختیار نقش پشتیبانی باشد.
router.post('/admin/wallet/users/:id/adjust', adminAuth, validateUuid('id'), requireRole(), asyncHandler(async (req, res) => {
  const amount = Math.floor(Number(req.body?.amount || 0));
  const reason = String(req.body?.reason || '').trim();
  if (!Number.isFinite(amount) || amount === 0) {
    return res.status(400).json({ message: 'مبلغ باید عددی مخالف صفر باشد' });
  }
  // دلیل اجباری است: بدون آن، دفتر کل پر از تراکنش‌های بی‌توضیح می‌شود و
  // ممیزی مالی بعدی غیرممکن است.
  if (reason.length < 3) {
    return res.status(400).json({ message: 'ثبت دلیل برای تغییر دستی موجودی الزامی است' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const fn = amount > 0 ? walletService.credit : walletService.debit;
    const result = await fn(client, {
      userId: req.params.id,
      amount: Math.abs(amount),
      source: amount > 0 ? 'admin_credit' : 'admin_debit',
      referenceType: 'admin_adjustment',
      description: reason,
      adminId: req.admin.id,
    });
    await client.query('COMMIT');
    await audit(req.admin.id, 'wallet_adjust', 'users', req.params.id, reason, { amount });
    createNotification(
      req.params.id,
      'wallet',
      amount > 0 ? 'افزایش موجودی کیف پول' : 'کسر از کیف پول',
      `${Math.abs(amount).toLocaleString('en-US')} تومان ${amount > 0 ? 'به' : 'از'} کیف پول شما ${amount > 0 ? 'اضافه شد' : 'کسر شد'}. ${reason}`,
    ).catch(() => {});
    res.json({ message: 'موجودی کیف پول تغییر کرد', balance: result.balance });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(e.status || 500).json({ message: e.message || 'خطا در تغییر موجودی' });
  } finally { client.release(); }
}));

router.get('/admin/wallet/settings', adminAuth, asyncHandler(async (req, res) => {
  res.json(await walletService.getWalletSettings());
}));
router.patch('/admin/wallet/settings', adminAuth, requireRole(), asyncHandler(async (req, res) => {
  const saved = await walletService.saveWalletSettings(req.body || {}, req.admin.id);
  await audit(req.admin.id, 'update_wallet_settings', 'app_settings', null, null, saved);
  res.json({ message: 'تنظیمات کیف پول ذخیره شد', settings: saved });
}));

  return router;
};
