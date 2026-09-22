// ─────────────────────────────────────────────────────────────────────
// فروشگاه، جعبهٔ کارت، گرنت‌ها، راستی‌آزماییِ خرید و باشگاه‌ها —
// بیرون آمده از server.js (بندِ ۱ نقشهٔ راه). بدنه‌ها مو به مو منتقل شده‌اند.
// ─────────────────────────────────────────────────────────────────────
const express = require('express');

module.exports = ({
  auth, asyncHandler, validateUuid, shop,
  shopLimiter, cardBox, grants, clubs,
}) => {
  const router = express.Router();

// ── Shop: cosmetics + GhelGheli Plus ───────────────────────────────────────
router.get('/shop', auth, asyncHandler(async (req, res) => {
  // `shape=groups|items` نصفِ پاسخ را حذف می‌کند؛ توضیح در shopService.
  // بدونِ پارامتر هر دو می‌آید تا APKهای منتشرشده نشکنند.
  res.json(await shop.catalogue(req.user.id, req.query.shape));
}));

router.get('/shop/history', auth, asyncHandler(async (req, res) => {
  res.json(await shop.purchaseHistory(req.user.id, {
    limit: req.query.limit,
    offset: req.query.offset,
  }));
}));

router.post('/shop/items/:id/buy', auth, validateUuid('id'), shopLimiter, asyncHandler(async (req, res) => {
  try {
    res.json(await shop.buyShopItem(req.user.id, req.params.id, {
      useWallet: req.body?.useWallet === true,
    }));
  } catch (e) {
    res.status(e.status || 500).json({ message: e.message || 'خطا در خرید' });
  }
}));

router.post('/shop/plus', auth, shopLimiter, asyncHandler(async (req, res) => {
  try {
    res.json(await shop.buyPlusSubscription(
      req.user.id,
      req.body?.billingCycle || req.body?.cycle || 'monthly',
    ));
  } catch (e) {
    res.status(e.status || 500).json({ message: e.message || 'خطا در خرید اشتراک' });
  }
}));

// ── صندوق کارت ─────────────────────────────────────────────────────────
//
// مسیرِ ورودِ کاربری که کارتِ فیزیکی ندارد. بدونِ کارت، دوئلِ کارت اصلاً
// باز نمی‌شود — نه نسخهٔ ضعیف‌تری از بازی، بلکه هیچ. صندوق همان در است.
//
// ⚠️ اینجا هیچ کارتی تحویل داده نمی‌شود. `buy` فقط سفارشِ pending
//    می‌سازد؛ قرعه‌کشی و تحویل داخلِ تراکنشِ `/api/purchase/verify`
//    انجام می‌شود، بعد از آنکه درگاه (زرین‌پال) پرداخت را تأیید کرد.
router.get('/card-box/overview', auth, asyncHandler(async (req, res) => {
  res.json(await cardBox.overview(req.user.id));
}));

router.post('/card-box/buy', auth, shopLimiter, asyncHandler(async (req, res) => {
  try {
    res.json(await shop.buyCardBox(req.user.id, {
      useWallet: req.body?.useWallet === true,
    }));
  } catch (e) {
    res.status(e.status || 500)
      .json({ message: e.message || 'خطا در ساخت سفارش صندوق' });
  }
}));

router.get('/card-box/history', auth, asyncHandler(async (req, res) => {
  res.json(await cardBox.history(req.user.id, req.query.limit));
}));

// ── جایزه‌های بازنشده (صندوقِ گردونه/لیگ) ──────────────────────────────
router.get('/grants', auth, asyncHandler(async (req, res) => {
  res.json({ grants: await grants.pendingFor(req.user.id) });
}));

router.post('/grants/:id/open', auth, validateUuid('id'), shopLimiter,
  asyncHandler(async (req, res) => {
    try {
      const result = await grants.open(req.user.id, req.params.id);
      res.json({
        message: result.alreadyOpened ? 'این صندوق قبلاً باز شده' : 'صندوق باز شد',
        ...result,
      });
    } catch (e) {
      res.status(e.status || 500).json({ message: e.message || 'باز کردن صندوق ناموفق بود' });
    }
  }));

// ── خرید: مرحلهٔ ۳ (راستی‌آزمایی و تحویل) ─────────────────────────────
//
// یک روتِ واحد برای هر دو نوع خرید. نوعِ سفارش از دیتابیس خوانده می‌شود
// نه از بدنهٔ درخواست — کلاینت نمی‌تواند با فرستادن kind دلخواه، سفارشِ
// ۹٬۰۰۰ تومانی را به پلاس سالانه تبدیل کند.
router.post('/purchase/verify', auth, shopLimiter, asyncHandler(async (req, res) => {
  try {
    const result = await shop.verifyPurchase(
      req.user.id,
      String(req.body?.orderId || ''),
      String(req.body?.purchaseToken || ''),
    );
    res.json({
      ok: true,
      ...result,
      message: result.alreadyProcessed
        ? 'این خرید قبلاً ثبت شده بود'
        : 'خرید با موفقیت انجام شد',
    });
  } catch (e) {
    res.status(e.status || 500).json({ message: e.message || 'خطا در تأیید خرید' });
  }
}));

router.post('/shop/equip', auth, asyncHandler(async (req, res) => {
  try {
    // `kind` scopes an unequip to one slot. Without it "برداشتن" under the
    // badges also wiped the user's frame and name colour.
    res.json(await shop.equip(
      req.user.id, req.body?.slug || null, req.body?.kind || null));
  } catch (e) {
    res.status(e.status || 500).json({ message: e.message || 'خطا در انتخاب' });
  }
}));

// Use a club crest as the profile picture. Membership is checked server-side.
router.post('/shop/club-avatar', auth, asyncHandler(async (req, res) => {
  try {
    res.json(await shop.useClubAvatar(
      req.user.id, String(req.body?.club || '').slice(0, 64)));
  } catch (e) {
    res.status(e.status || 500).json({ message: e.message || 'خطا در تغییر عکس' });
  }
}));

// ── Clubs ──────────────────────────────────────────────────────────────────
// The league page's club tab: who belongs where. (clubService is required at
// the top, next to the other services.)
router.get('/clubs', auth, asyncHandler(async (req, res) => {
  res.json({
    clubs: await clubs.rosterSummary(),
    mine: await clubs.myClubs(req.user.id),
  });
}));

router.get('/clubs/:slug/members', auth, asyncHandler(async (req, res) => {
  const slug = String(req.params.slug || '').slice(0, 64);
  // Reject anything that is not a real club rather than returning an empty
  // roster, so a typo in the client shows up instead of looking like a club
  // nobody joined.
  const known = await clubs.clubCatalogue();
  const club = known.find(c => c.slug === slug);
  if (!club) return res.status(404).json({ message: 'باشگاه پیدا نشد' });
  res.json({ club, members: await clubs.members(slug, req.query.limit) });
}));

  return router;
};
