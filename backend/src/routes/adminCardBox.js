/**
 * شانس و قیمت صندوق کارت — پنل ادمین (وب و اندروید).
 *
 * خواستهٔ مالک: «شانس درصد های صندوق هم در پنل های ادمین مشخص بشه».
 *
 * شانس از روز اول در جدول `card_box_odds` بود و کلاینت‌های کاربر از
 * `GET /api/card-box/overview` می‌خواندند. چیزی که جا مانده بود **فرم
 * ذخیره** بود: مدیر برای عوض کردن ۱٪ لجند باید SQL می‌زد. بدون فرم،
 * «قابل تنظیم بودن» دروغ بود.
 *
 * جمع وزن باید دقیقاً ۱۰۰۰ (۱۰۰٪) باشد. سرویس اگر نخواند ذخیره را رد
 * می‌کند — نرمال‌سازیِ بی‌صدا عمداً نیست. توضیح در cardBoxService.
 */
const express = require('express');

module.exports = function createAdminCardBoxRoutes(deps) {
  const { pool, adminAuth, requireRole, asyncHandler, audit, cardBox } = deps;
  const router = express.Router();

  router.get('/admin/card-box', adminAuth, asyncHandler(async (req, res) => {
    res.json(await cardBox.adminView());
  }));

  // خریدهای اخیرِ صندوق — کاربر، مبلغ و خلاصهٔ کارت‌ها؛ برای بخشِ
  // «تاریخچه» پنلِ ادمین (وب و اندروید).
  router.get('/admin/card-box/purchases', adminAuth,
    asyncHandler(async (req, res) => {
      res.json({ purchases: await cardBox.adminPurchases(req.query.limit) });
    }));

  router.put('/admin/card-box', adminAuth, requireRole(),
    asyncHandler(async (req, res) => {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const odds = await cardBox.saveOdds(body.odds ?? body, client);
        let price;
        if (body.price !== undefined && body.price !== null && body.price !== '') {
          price = await cardBox.savePrice(body.price, req.admin.id, client);
        } else {
          price = await cardBox.price(client);
        }
        // سوییچ فروش: فقط وقتی خودِ کلید در بدنه آمده باشد ذخیره می‌شود —
        // PUT بدون enabled به معنای «وضعیت فعلی را دست نزن».
        let boxEnabled;
        if (body.enabled !== undefined && body.enabled !== null) {
          boxEnabled = await cardBox.saveEnabled(body.enabled, req.admin.id, client);
        } else {
          boxEnabled = await cardBox.enabled(client);
        }
        await client.query('COMMIT');
        await audit(req.admin.id, 'update_card_box', 'card_box_odds', null,
          body.reason || null,
          { odds, price, enabled: boxEnabled });
        const view = await cardBox.adminView();
        res.json({
          message: 'شانس، قیمت و وضعیت فروش صندوق ذخیره شد — فروشگاه همین حالا عدد تازه را نشان می‌دهد',
          ...view,
        });
      } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        throw e;
      } finally {
        client.release();
      }
    }));

  return router;
};
