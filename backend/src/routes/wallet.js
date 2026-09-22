// ─────────────────────────────────────────────────────────────────────
// کیفِ پولِ کاربر (موجودی، تراکنش‌ها، برداشت و…) —
// بیرون آمده از server.js (بندِ ۱ نقشهٔ راه). بدنه‌ها مو به مو منتقل شده‌اند.
// ─────────────────────────────────────────────────────────────────────
const express = require('express');

module.exports = ({
  auth, asyncHandler, validateUuid, walletService,
  bankCardLimiter, withdrawalService, withdrawalLimiter,
}) => {
  const router = express.Router();

// خلاصهٔ کیف پول: موجودی، آمار، کارت ماسک‌شده، قوانین و دلیل مسدودی برداشت
router.get('/wallet', auth, asyncHandler(async (req, res) => {
  res.json(await walletService.summary(req.user.id));
}));

// دفتر تراکنش‌ها با صفحه‌بندی
router.get('/wallet/transactions', auth, asyncHandler(async (req, res) => {
  res.json(await walletService.transactions(req.user.id, {
    limit: req.query.limit,
    offset: req.query.offset,
  }));
}));

// ذخیره/به‌روزرسانی کارت بانکی (اعتبارسنجی Luhn + شبا + تشخیص بانک)
router.post('/wallet/bank-card', auth, bankCardLimiter, asyncHandler(async (req, res) => {
  const card = await withdrawalService.saveBankCard(req.user.id, req.body || {});
  res.json({ message: 'کارت بانکی ذخیره شد', card });
}));

router.delete('/wallet/bank-card', auth, asyncHandler(async (req, res) => {
  res.json(await withdrawalService.deleteBankCard(req.user.id));
}));

// ثبت درخواست برداشت (مبلغ همان لحظه بلوکه می‌شود)
router.post('/wallet/withdrawals', auth, withdrawalLimiter.mw, asyncHandler(async (req, res) => {
  const request = await withdrawalService.createRequest(req.user.id, req.body?.amount);
  res.json({ message: 'درخواست برداشت ثبت شد و در انتظار بررسی مدیریت است', request });
}));

router.get('/wallet/withdrawals', auth, asyncHandler(async (req, res) => {
  res.json(await withdrawalService.listForUser(req.user.id));
}));

// لغو توسط کاربر — فقط تا قبل از تأیید مدیر
router.post('/wallet/withdrawals/:id/cancel', auth, validateUuid('id'), withdrawalLimiter.mw, asyncHandler(async (req, res) => {
  res.json(await withdrawalService.cancelRequest(req.user.id, req.params.id));
}));

  return router;
};
