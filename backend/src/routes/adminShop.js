/**
 * مدیریت کامل فروشگاه — پنل ادمین (وب و اندروید).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * چرا این فایل تا امروز وجود نداشت
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * کاتالوگ فروشگاه (۵۴ آیتم + کلاب‌ها + صندوق) فقط با `INSERT` داخل
 * مایگریشن‌های SQL ساخته می‌شد. یعنی «آیتم جدید»، «تغییر قیمت» یا
 * «غیرفعال‌کردن یک آیتم» مستلزم کامیت + دیپلوی بک‌اند بود — دقیقاً
 * چیزی که مالک دیگر نمی‌خواهد. از این پس:
 *
 *   - آیتم جدید/ویرایش/حذف از پنل (بدون دپلوی)،
 *   - قیمت و چرخهٔ پلاس از تنظیمات (shop_plus_plans)،
 *   - کلاب‌ها خودکار از `kind='club_badge'` مشتق می‌شوند پس با همین
 *     فرم مدیریت می‌شوند،
 *   - آمار فروش (خرید، درآمد برآوردی) برای تصمیم‌گیری.
 */
const express = require('express');

const KINDS = Object.freeze([
  'club_badge', 'card_frame', 'name_color', 'profile_background',
  'emote_pack', 'profile_badge', 'card_box',
]);

module.exports = function createAdminShopRoutes(deps) {
  const { pool, adminAuth, requireRole, asyncHandler, audit, validateUuid, shop, opsConfig } = deps;
  const router = express.Router();

  const bool = (x, fallback) => (typeof x === 'boolean' ? x : fallback);
  const str = (x, fallback, max = 500) => {
    const s = String(x ?? '').trim();
    return s ? s.slice(0, max) : fallback;
  };
  const price = (x, fallback) => {
    const n = Number(x);
    return Number.isFinite(n) && n >= 0 && n <= 1e9 ? Math.round(n) : fallback;
  };

  async function listItems(client = pool) {
    const { rows } = await client.query(
      `SELECT i.*, COALESCE(s.sold,0)::int AS sold_count
         FROM shop_items i
         LEFT JOIN (SELECT item_id, count(*) AS sold
                      FROM user_shop_items GROUP BY item_id) s
           ON s.item_id = i.id
        ORDER BY i.display_order, i.created_at`);
    return rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      kind: r.kind,
      name: r.name,
      description: r.description,
      imageUrl: r.image_url,
      payload: r.payload,
      price: Number(r.price),
      displayOrder: Number(r.display_order),
      isActive: Boolean(r.is_active),
      accessTier: r.access_tier,
      isPurchasable: Boolean(r.is_purchasable),
      metadata: r.metadata || {},
      soldCount: Number(r.sold_count || 0),
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  }

  // ── نمای کلی (همهٔ آیتم‌ها + پلن‌های پلاس + آمار) ───────────────────────
  router.get('/admin/shop', adminAuth, asyncHandler(async (req, res) => {
    const [items, sales] = await Promise.all([
      listItems(),
      pool.query(
        `SELECT i.kind, i.name, count(*)::int AS sold, COALESCE(sum(us.price_paid),0)::bigint AS revenue
           FROM user_shop_items us
           JOIN shop_items i ON i.id = us.item_id
          GROUP BY i.kind, i.name
          ORDER BY revenue DESC LIMIT 40`),
    ]);
    res.json({ items, sales: sales.rows, kinds: KINDS });
  }));

  // ── ساخت آیتم ──────────────────────────────────────────────────────────
  router.post('/admin/shop', adminAuth, requireRole(),
    asyncHandler(async (req, res) => {
      const b = req.body && typeof req.body === 'object' ? req.body : {};
      const kind = str(b.kind, '');
      const slug = str(b.slug, '').toLowerCase().replace(/\s+/g, '-');
      const name = str(b.name, '');
      if (!KINDS.includes(kind)) {
        return res.status(400).json({ message: 'نوع آیتم معتبر نیست' });
      }
      if (!/^[a-z0-9_-]{2,40}$/.test(slug)) {
        return res.status(400).json({ message: 'شناسهٔ یکتا باید ۲ تا ۴۰ حرف انگلیسی/عدد/خط تیره باشد' });
      }
      if (!name) return res.status(400).json({ message: 'نام آیتم الزامی است' });
      const p = price(b.price, null);
      if (p === null) return res.status(400).json({ message: 'قیمت معتبر نیست' });

      const { rows } = await pool.query(
        `INSERT INTO shop_items
           (slug, kind, name, description, image_url, payload, price,
            display_order, is_active, access_tier, is_purchasable, metadata)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         RETURNING *`,
        [slug, kind, name, str(b.description, ''), str(b.imageUrl, null),
          str(b.payload, slug, 64), p,
          Math.max(0, Math.round(Number(b.displayOrder) || 0)),
          bool(b.isActive, true),
          ['public', 'plus', 'annual'].includes(b.accessTier) ? b.accessTier : 'public',
          bool(b.isPurchasable, true),
          JSON.stringify(b.metadata && typeof b.metadata === 'object' ? b.metadata : {})]);
      await audit(req.admin.id, 'create_shop_item', 'shop_items', rows[0].id, null,
        { slug, kind, name, price: p });
      res.json({ message: `«${name}» به فروشگاه اضافه شد — همین حالا در اپ و وب دیده می‌شود`, item: rows[0] });
    }));

  // ── ویرایش آیتم ────────────────────────────────────────────────────────
  router.patch('/admin/shop/:id', adminAuth, validateUuid('id'), requireRole(),
    asyncHandler(async (req, res) => {
      const b = req.body && typeof req.body === 'object' ? req.body : {};
      const { rows: curRows } = await pool.query(
        'SELECT * FROM shop_items WHERE id=$1', [req.params.id]);
      const cur = curRows[0];
      if (!cur) return res.status(404).json({ message: 'آیتم پیدا نشد' });

      const kind = b.kind !== undefined ? str(b.kind, cur.kind) : cur.kind;
      if (!KINDS.includes(kind)) return res.status(400).json({ message: 'نوع آیتم معتبر نیست' });
      const slug = b.slug !== undefined ? str(b.slug, '').toLowerCase().replace(/\s+/g, '-') : cur.slug;
      if (!/^[a-z0-9_-]{2,40}$/.test(slug)) {
        return res.status(400).json({ message: 'شناسهٔ یکتا باید ۲ تا ۴۰ حرف انگلیسی/عدد/خط تیره باشد' });
      }
      const p = b.price !== undefined ? price(b.price, Number(cur.price)) : Number(cur.price);

      const { rows } = await pool.query(
        `UPDATE shop_items SET
           slug=$2, kind=$3, name=$4, description=$5, image_url=$6, payload=$7,
           price=$8, display_order=$9, is_active=$10, access_tier=$11,
           is_purchasable=$12, metadata=$13, updated_at=NOW()
         WHERE id=$1 RETURNING *`,
        [req.params.id, slug, kind,
          str(b.name, cur.name, 120), str(b.description, cur.description),
          b.imageUrl !== undefined ? str(b.imageUrl, null) : cur.image_url,
          b.payload !== undefined ? str(b.payload, slug, 64) : cur.payload,
          p,
          b.displayOrder !== undefined ? Math.max(0, Math.round(Number(b.displayOrder) || 0)) : cur.display_order,
          bool(b.isActive, cur.is_active),
          ['public', 'plus', 'annual'].includes(b.accessTier) ? b.accessTier : cur.access_tier,
          bool(b.isPurchasable, cur.is_purchasable),
          JSON.stringify(b.metadata && typeof b.metadata === 'object' ? b.metadata : (cur.metadata || {}))]);
      await audit(req.admin.id, 'update_shop_item', 'shop_items', req.params.id, b.reason || null,
        { slug, kind, price: p, isActive: bool(b.isActive, cur.is_active) });
      res.json({ message: 'آیتم فروشگاه ذخیره شد', item: rows[0] });
    }));

  // ── حذف: اگر هرگز خریده نشده واقعاً حذف، وگرنه فقط غیرفعال ─────────────
  router.delete('/admin/shop/:id', adminAuth, validateUuid('id'), requireRole(),
    asyncHandler(async (req, res) => {
      const { rows: curRows } = await pool.query(
        'SELECT * FROM shop_items WHERE id=$1', [req.params.id]);
      const cur = curRows[0];
      if (!cur) return res.status(404).json({ message: 'آیتم پیدا نشد' });

      const { rows: sold } = await pool.query(
        'SELECT count(*)::int AS n FROM user_shop_items WHERE item_id=$1', [req.params.id]);
      if (Number(sold[0].n) > 0) {
        await pool.query(
          'UPDATE shop_items SET is_active=false, updated_at=NOW() WHERE id=$1', [req.params.id]);
        await audit(req.admin.id, 'deactivate_shop_item', 'shop_items', req.params.id,
          `توسط کاربران خریداری شده (${sold[0].n} خرید) — حذف نشد و فقط غیرفعال شد`);
        return res.json({ message: `«${cur.name}» قبلاً خریده شده؛ برای حفظ سوابق، غیرفعال شد (نه حذف)` });
      }
      await pool.query('DELETE FROM shop_items WHERE id=$1', [req.params.id]);
      await audit(req.admin.id, 'delete_shop_item', 'shop_items', req.params.id, null, { slug: cur.slug, name: cur.name });
      res.json({ message: `«${cur.name}» از فروشگاه حذف شد` });
    }));

  // ── ترتیب نمایش دسته‌ای ───────────────────────────────────────────────
  router.patch('/admin/shop/reorder', adminAuth, requireRole(),
    asyncHandler(async (req, res) => {
      const list = Array.isArray(req.body?.items) ? req.body.items : [];
      if (!list.length) return res.status(400).json({ message: 'فهرست ترتیب ارسال نشده' });
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        for (const item of list) {
          if (!item || typeof item.id !== 'string') continue;
          await client.query(
            'UPDATE shop_items SET display_order=$2, updated_at=NOW() WHERE id=$1',
            [item.id, Math.max(0, Math.round(Number(item.displayOrder) || 0))]);
        }
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        throw e;
      } finally {
        client.release();
      }
      await audit(req.admin.id, 'reorder_shop_items', 'shop_items', null, null, { count: list.length });
      res.json({ message: 'ترتیب فروشگاه ذخیره شد', items: await listItems() });
    }));

  // ── پلن‌های پلاس (قیمت/روز/مزایا) ──────────────────────────────────────
  router.get('/admin/shop/plus', adminAuth, asyncHandler(async (req, res) => {
    res.json(shop.plusPlansConfig());
  }));

  router.patch('/admin/shop/plus', adminAuth, requireRole(),
    asyncHandler(async (req, res) => {
      const b = req.body && typeof req.body === 'object' ? req.body : {};
      const cur = shop.plusPlansConfig();
      const list = (x, fallback) => (Array.isArray(x)
        ? x.map(String).filter((t) => t.trim()).slice(0, 30)
        : fallback);
      const next = {
        monthly: {
          price: price(b.monthly?.price, cur.monthly.price),
          days: Math.max(1, Math.round(Number(b.monthly?.days) || cur.monthly.days)),
          label: str(b.monthly?.label, cur.monthly.label, 60),
          savingPercent: Math.min(99, Math.max(0, Number(b.monthly?.savingPercent) || 0)),
        },
        annual: {
          price: price(b.annual?.price, cur.annual.price),
          days: Math.max(1, Math.round(Number(b.annual?.days) || cur.annual.days)),
          label: str(b.annual?.label, cur.annual.label, 60),
          savingPercent: Math.min(99, Math.max(0, Number(b.annual?.savingPercent) || 0)),
        },
        benefits: list(b.benefits, cur.benefits),
        annualBenefits: list(b.annualBenefits, cur.annualBenefits),
      };
      await opsConfig.set('shop_plus_plans', next, req.admin.id);
      await audit(req.admin.id, 'update_plus_plans', 'app_settings', null, b.reason || null,
        { monthly: next.monthly.price, annual: next.annual.price });
      res.json({ message: 'پلن‌های پلاس ذخیره شد — قیمت جدید از همین لحظه روی سفارش‌ها اعمال می‌شود', ...next });
    }));

  return router;
};
