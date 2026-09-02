/** User administration and immutable point-ledger inspection routes. */
const express = require('express');
const signupGift = require('../services/signupGiftService');
const { parseFaNumber } = require('../lib/faNum');

module.exports = function createAdminUserRoutes(deps) {
  const {
    pool, auth, adminAuth, requireRole, asyncHandler, audit, validateUuid,
    level, safeUser, points, createNotification, bcrypt, isValidPasswordLength,
    grants,
  } = deps;
  const router = express.Router();

// SECURITY (ممیزی دورِ ۲۳): requireRole('support') اضافه شد — فهرستِ
// کاربران PII کامل (موبایل، شهر، حساب بانکی، موجودی) را برمی‌گرداند؛
// نقشِ «ناظر» (observer) فقط باید آمارِ کلیِ داشبورد را ببیند.
router.get('/admin/users', adminAuth, requireRole('support'), asyncHandler(async (req, res) => {
  const rawQ = String(req.query.search || req.query.q || req.query.query || '').trim();
  const search = `%${rawQ}%`;
  const normalizedDigits = rawQ.replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
  const searchDigits = `%${normalizedDigits}%`;

  const rows = (await pool.query(
    // `wallet_balance` برای رابطِ «اصلاح کیف پول» لازم است: مدیر باید
    // موجودیِ فعلی را کنارِ دکمه ببیند، وگرنه کسر کورکورانه انجام می‌دهد
    // و با خطای «موجودی کافی نیست» روبه‌رو می‌شود بدون آنکه بداند چقدر
    // هست.
    `SELECT u.id,u.mobile,u.first_name,u.last_name,u.nickname,u.age,u.city,u.province,u.bank_account,
            u.profile_image_url,u.profile_avatar_key,u.current_points,u.lifetime_points,
            u.monthly_league_points,u.status,u.joined_at,u.game_xp,u.wallet_balance,
            u.coins, u.unlimited_spins,
            plus.expires_at AS plus_expires_at
       FROM users u
       LEFT JOIN LATERAL (
         SELECT expires_at FROM user_subscriptions
          WHERE user_id = u.id AND expires_at > NOW()
          ORDER BY expires_at DESC LIMIT 1
       ) plus ON true
      WHERE u.mobile ILIKE $1 OR u.mobile ILIKE $2 OR u.nickname ILIKE $1 OR u.first_name ILIKE $1 
         OR u.last_name ILIKE $1 OR (u.first_name || ' ' || u.last_name) ILIKE $1
      ORDER BY u.joined_at DESC LIMIT 300`,
    [search, searchDigits]
  )).rows;
  res.json(rows.map((u) => ({
    ...u,
    // پستگرس `numeric` را رشته برمی‌گرداند؛ بدون Number سمتِ کلاینت
    // «۱۰۰۰۰» با «۵۰۰» رشته‌ای مقایسه می‌شد و قالب‌بندی عدد می‌شکست.
    wallet_balance: Number(u.wallet_balance || 0),
    coins: Number(u.coins || 0),
    unlimited_spins: u.unlimited_spins === true,
    plus_expires_at: u.plus_expires_at || null,
    has_plus: Boolean(u.plus_expires_at),
    level: level.levelFromXp(u.game_xp).level,
  })));
}));
// SECURITY (ممیزی دورِ ۲۳): مثل فهرست — پروندهٔ کاملِ کاربر PII دارد.
router.get('/admin/users/:id', adminAuth, validateUuid('id'), requireRole('support'), asyncHandler(async (req, res) => {
  const user = await pool.query('SELECT * FROM users WHERE id=$1', [req.params.id]);
  if (!user.rows[0]) return res.status(404).json({ message: 'کاربر پیدا نشد' });
  const [userGrants, shopItems] = await Promise.all([
    grants.listFor(req.params.id).catch(() => []),
    pool.query(
      `SELECT slug, name, kind FROM shop_items
        WHERE is_active=true ORDER BY display_order ASC, name ASC`),
  ]);
  res.json({
    user: safeUser(user.rows[0]),
    grants: userGrants,
    shopItems: shopItems.rows,
  });
}));
router.patch('/admin/users/:id/status', adminAuth, validateUuid('id'), requireRole('support'), asyncHandler(async (req, res) => { await pool.query('UPDATE users SET status=$1 WHERE id=$2', [req.body.status, req.params.id]); await audit(req.admin.id,'update_user_status','users',req.params.id,req.body.reason,{status:req.body.status}); res.json({message:'ثبت شد'}); }));
// ═══════════════════════════════════════════════════════════════════════════
// تنظیمِ امتیاز توسطِ مدیر — با دفتر و دلیلِ اجباری
// ═══════════════════════════════════════════════════════════════════════════
//
// ── خواستهٔ مالک ──
//
//   «ادمین امتیاز کاربر رو در صورت نیاز بتونه کم کنه و دلیلیشو بگه به
//    کاربر و دلیلش به کاربر بصورت نوتیفیکشن در زنگوله بره»
//
// ── سه چیزی که نسخهٔ قبلی نداشت ──
//
//   ۱. **ردی در دفتر نمی‌گذاشت.** امتیاز عوض می‌شد و هیچ‌جا نوشته
//      نمی‌شد چه کسی، کِی و چرا. حالا `pointService` ثبتش می‌کند.
//
//   ۲. **دلیل اختیاری بود.** پیامِ کاربر می‌شد «امتیاز شما به مقدار
//      -۵۰۰ تغییر کرد. » — با یک فاصلهٔ خالی به‌جای توضیح. کاربری که
//      دلیل نداند مستقیم به پشتیبانی می‌رود. حالا برای **کسر** اجباری
//      است.
//
//   ۳. **پیام گیج‌کننده بود.** «به مقدار -۵۰۰ تغییر کرد» را کاربر
//      فارسی‌زبان باید در ذهنش ترجمه کند. حالا «۵۰۰ امتیاز کسر شد».

// ── هدیهٔ امتیازِ عضویت ──
//
// مدیر یک عدد می‌گذارد و از آن لحظه هر کاربرِ تازه همان را می‌گیرد.
// خواندنش `adminAuth` ساده است (پشتیبانی هم باید بداند چه عددی فعال
// است تا به کاربر جواب بدهد) ولی تغییرش `requireRole()` می‌خواهد،
// چون مستقیماً امتیاز تولید می‌کند.
router.get('/admin/signup-gift', adminAuth, asyncHandler(async (req, res) => {
  res.json(await signupGift.getSignupGift());
}));

router.patch('/admin/signup-gift', adminAuth, requireRole(), asyncHandler(async (req, res) => {
  const saved = await signupGift.saveSignupGift(req.body || {}, req.admin.id);
  await audit(req.admin.id, 'update_signup_gift', 'app_settings', null,
    saved.enabled ? `هدیهٔ عضویت: ${saved.points} امتیاز` : 'هدیهٔ عضویت خاموش شد', saved);
  res.json({ message: 'تنظیمات هدیهٔ عضویت ذخیره شد', settings: saved });
}));

router.post('/admin/users/:id/grant-plus', adminAuth, validateUuid('id'), requireRole('support'), asyncHandler(async (req, res) => {
  const days = Math.max(1, Math.min(365, parseFaNumber(req.body.days) || 30));
  // ── چرا از انتهای اشتراکِ فعلی شروع می‌شود ──
  //
  // نسخهٔ قبلی همیشه از NOW() می‌نوشت. اگر کاربر ۹۰ روز پلاس داشت و
  // مدیر ۳۰ روز «اضافه» می‌کرد، ردیفِ تازه ۳۰ روزه می‌شد و MAX(expires_at)
  // همان ۹۰ روزِ قبلی می‌ماند — یعنی اعطا عملاً هیچ اثری نداشت. مدیر
  // پیام موفقیت می‌دید و کاربر هیچ روزی نمی‌گرفت.
  //
  // همان منطقِ grantService.award(plus_days) و deliverPlus: تمدید از
  // انتهای اشتراکِ زنده، نه بازنشانی.
  const client = await pool.connect();
  let expiresAt;
  let subId;
  try {
    await client.query('BEGIN');
    const u = await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [req.params.id]);
    if (!u.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'کاربر پیدا نشد' });
    }
    const active = await client.query(
      `SELECT MAX(expires_at) AS expires_at
         FROM user_subscriptions
        WHERE user_id=$1 AND plan IN ('plus','plus_annual')
          AND expires_at > NOW()`,
      [req.params.id]);
    const startsAt = active.rows[0]?.expires_at || new Date();
    expiresAt = new Date(new Date(startsAt).getTime() + days * 86400000);
    const r = await client.query(
      `INSERT INTO user_subscriptions(user_id, plan, price_paid, starts_at, expires_at)
       VALUES($1, 'plus', 0, $2, $3)
       RETURNING id, expires_at`,
      [req.params.id, startsAt, expiresAt],
    );
    subId = r.rows[0].id;
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
  await audit(req.admin.id, 'grant_plus', 'user_subscriptions', subId, req.body.reason || 'اعطای دستی اشتراک پلاس', { days });
  await createNotification(req.params.id, 'plus_granted', 'اشتراک قلقلی پلاس فعال شد!', `اشتراک قلقلی پلاس به مدت ${days} روز توسط مدیریت برای شما فعال شد.`);
  res.json({ message: `اشتراک پلاس به مدت ${days} روز برای کاربر با موفقیت فعال شد`, expiresAt });
}));

// ═══════════════════════════════════════════════════════════════════════════
// اعطای صندوق / آیتم شاپ / روز پلاس از پنل — منبعِ 'admin'
// ═══════════════════════════════════════════════════════════════════════════
//
// خواستهٔ مالک: «کلا پنل ادمین باید دسترسی خیلی زیادی رو تغییرات داشته
// باشه» و «اگه صندوق بردن پیام بیاد و کاربرها بتونن بازش کنن».
//
// grantService از قبل source='admin' را می‌شناخت ولی هیچ روتی صدایش
// نمی‌زد. یعنی جدول آماده بود و قابلیت مرده.
router.post('/admin/users/:id/grant-item', adminAuth, validateUuid('id'), requireRole('support'), asyncHandler(async (req, res) => {
  if (!grants) {
    return res.status(500).json({ message: 'سرویس جایزه در دسترس نیست' });
  }
  const kind = String(req.body.kind || '');
  if (!grants.KINDS.includes(kind)) {
    return res.status(400).json({ message: 'نوع جایزه باید صندوق کارت، آیتم فروشگاه یا روز پلاس باشد' });
  }
  const reason = String(req.body.reason || '').trim();
  if (reason.length < 3) {
    return res.status(400).json({ message: 'ثبت دلیل (حداقل ۳ حرف) الزامی است' });
  }
  const value = Math.trunc(parseFaNumber(req.body.value ?? 1));
  if (!Number.isInteger(value) || value < 1) {
    return res.status(400).json({ message: 'مقدار جایزه باید عددی بزرگ‌تر از صفر باشد' });
  }
  if (kind === 'card_box' && value > 5) {
    return res.status(400).json({ message: 'حداکثر ۵ صندوق در هر اعطا' });
  }
  if (kind === 'plus_days' && value > 365) {
    return res.status(400).json({ message: 'حداکثر ۳۶۵ روز پلاس در هر اعطا' });
  }
  const itemSlug = req.body.itemSlug || req.body.item_slug || null;
  if (kind === 'shop_item' && !itemSlug) {
    return res.status(400).json({ message: 'برای آیتم فروشگاه باید slug انتخاب شود' });
  }

  const client = await pool.connect();
  let result;
  try {
    await client.query('BEGIN');
    const u = await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [req.params.id]);
    if (!u.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'کاربر پیدا نشد' });
    }
    if (kind === 'card_box') {
      result = await grants.awardBoxes(client, {
        userId: req.params.id,
        count: value,
        label: req.body.label || 'صندوق کارت از مدیریت',
        source: 'admin',
        sourceRef: null,
      });
    } else {
      result = await grants.award(client, {
        userId: req.params.id,
        kind,
        value,
        itemSlug,
        label: req.body.label || null,
        source: 'admin',
        sourceRef: null,
      });
      result = { grant: result.grant, grants: [result.grant], delivered: result.delivered };
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }

  await audit(req.admin.id, 'grant_item', 'user_item_grants', result.grant?.id || null,
    reason, { kind, value, itemSlug });

  if (kind === 'card_box') {
    const n = (result.grants || []).length || value;
    await createNotification(
      req.params.id, 'reward', 'صندوق کارت بردی',
      n === 1
        ? 'مدیریت یک صندوق کارت برایت ثبت کرد — از کلکسیون بازش کن.'
        : `مدیریت ${n.toLocaleString('fa-IR')} صندوق کارت برایت ثبت کرد — از کلکسیون بازشان کن.`,
    );
  } else if (kind === 'shop_item') {
    await createNotification(
      req.params.id, 'reward', 'آیتم فروشگاه',
      'یک آیتم فروشگاه از طرف مدیریت به حسابت اضافه شد.',
    );
  } else {
    await createNotification(
      req.params.id, 'plus_granted', 'اشتراک قلقلی پلاس فعال شد!',
      `اشتراک قلقلی پلاس به مدت ${value} روز توسط مدیریت برای شما فعال شد.`,
    );
  }

  res.json({
    message: kind === 'card_box'
      ? `${(result.grants || []).length} صندوق برای کاربر ثبت شد — از کلکسیون باز می‌کند`
      : kind === 'shop_item'
        ? 'آیتم فروشگاه به حساب کاربر اضافه شد'
        : `${value} روز پلاس به اشتراک کاربر اضافه شد`,
    grant: result.grant,
    grants: result.grants || [result.grant],
  });
}));

router.post('/admin/users/:id/points', adminAuth, validateUuid('id'), requireRole(), asyncHandler(async (req, res) => {
  const p = Math.trunc(parseFaNumber(req.body.points || 0));
  if (!Number.isFinite(p) || p === 0) {
    return res.status(400).json({ message: 'مقدار امتیاز باید عددی غیر صفر باشد' });
  }
  // سقفِ سلامتِ عقل. یک اشتباهِ تایپی (۵۰۰۰۰۰۰ به‌جای ۵۰۰) نباید
  // بی‌سروصدا کاربری را به صدرِ جدولِ لیگ ببرد.
  if (Math.abs(p) > 1000000) {
    return res.status(400).json({ message: 'مقدار امتیاز خارج از محدودهٔ مجاز است (حداکثر ۱٬۰۰۰٬۰۰۰)' });
  }
  const reason = String(req.body.reason || '').trim();
  // ── چرا دلیل فقط برای کسر اجباری است ──
  //
  // اضافه کردنِ امتیاز خبرِ خوبی است و کاربر سؤالی نمی‌پرسد. کسر کردن
  // شکایت می‌سازد، و شکایتی که پاسخِ آماده نداشته باشد به پشتیبانی
  // می‌رسد. پس دلیل دقیقاً جایی اجباری است که لازم است.
  if (p < 0 && reason.length < 3) {
    return res.status(400).json({
      message: 'برای کسر امتیاز باید دلیل بنویسید — این متن برای کاربر ارسال می‌شود',
    });
  }

  const u = await pool.query('SELECT id, current_points FROM users WHERE id=$1', [req.params.id]);
  if (!u.rows[0]) return res.status(404).json({ message: 'کاربر پیدا نشد' });

  const pointsClient = await pool.connect();
  let outcome;
  try {
    await pointsClient.query('BEGIN');
    // بدون کمیسیون معرف — عمدی.
    //
    // مالک دامنه را محدود کرد: کمیسیون فقط از «ثبت کارت» و «بازی
    // ضربه‌زن». امتیاز دستی مدیر هیچ‌کدام نیست، و منطقی هم هست: یک
    // اصلاح دستی نباید به شخص سومی پول بدهد.
    //
    // `league: false` — تنظیمِ دستی نباید رتبهٔ لیگ را تکان بدهد،
    // وگرنه مدیر ناخواسته نتیجهٔ مسابقه را عوض می‌کند.
    outcome = p > 0
      ? await points.credit(pointsClient, {
        userId: req.params.id, points: p, source: 'admin_adjust',
        description: reason || 'تنظیم امتیاز توسط مدیریت',
        adminId: req.admin.id, league: false,
      })
      : await points.debit(pointsClient, {
        userId: req.params.id, points: -p, source: 'admin_deduct',
        description: reason, adminId: req.admin.id, league: false,
      });
    await pointsClient.query('COMMIT');
  } catch (e) {
    await pointsClient.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    pointsClient.release();
  }

  const applied = outcome?.delta ?? 0;
  await audit(req.admin.id, 'manual_points', 'users', req.params.id, reason,
    { requested: p, applied });

  // ── پیامِ زنگوله ──
  //
  // ⚠️ اگر موجودیِ کاربر کمتر از مقدارِ درخواستی بود، عددی که به او
  //    گفته می‌شود باید **کسرِ واقعی** باشد نه درخواست. گفتن «۵۰۰
  //    امتیاز کسر شد» به کسی که فقط ۱۰۰ داشت، دروغ است و در اولین
  //    نگاه به موجودی لو می‌رود.
  if (applied !== 0) {
    const n = Math.abs(applied).toLocaleString('fa-IR');
    await createNotification(
      req.params.id,
      applied < 0 ? 'points_deducted' : 'points_added',
      applied < 0 ? 'کسر امتیاز' : 'امتیاز جدید',
      applied < 0
        ? `${n} امتیاز از حساب شما کسر شد.\nدلیل: ${reason}`
        : `${n} امتیاز به حساب شما اضافه شد.${reason ? `\n${reason}` : ''}`,
    );
  }
  res.json({
    message: applied === 0
      ? 'کاربر امتیازی برای کسر نداشت'
      : (applied < 0
        ? `${Math.abs(applied)} امتیاز کسر شد و به کاربر اطلاع داده شد`
        : `${applied} امتیاز اضافه شد`),
    requested: p,
    applied,
    balanceAfter: outcome?.balanceAfter ?? u.rows[0].current_points,
  });
}));

// ═══════════════════════════════════════════════════════════════════════════
// ریزِ امتیازات — سه مسیرِ تازه
// ═══════════════════════════════════════════════════════════════════════════

// جست‌وجوی کاربر با شمارهٔ موبایل (یا نام/لقب).
//
// خواستهٔ مالک: «کاربر هارو میتونه از شماره موبایلی که ثبت کردن
// جستجوکنه و ریز امتیازات کاملشون رو ببینه».
// SECURITY (ممیزی دورِ ۲۳): نتیجهٔ جست‌وجو موبایلِ کاربران را برمی‌گرداند.
router.get('/admin/points/search', adminAuth, requireRole('support'), asyncHandler(async (req, res) => {
  const q = String(req.query.q || '');
  if (q.trim().length < 3) {
    return res.json({ users: [], message: 'حداقل ۳ نویسه وارد کنید' });
  }
  res.json({ users: await points.searchUsers(q, { limit: req.query.limit }) });
}));

// ریزِ کاملِ امتیازاتِ یک کاربر + خلاصهٔ منابع.
// SECURITY (ممیزی دورِ ۲۳): مثل جست‌وجو — دفترِ امتیاز با موبایلِ کاربر.
router.get('/admin/points/user/:id', adminAuth, validateUuid('id'), requireRole('support'), asyncHandler(async (req, res) => {
  const u = await pool.query(
    `SELECT id, mobile, nickname, first_name, last_name, status,
            current_points, lifetime_points, monthly_league_points, joined_at
       FROM users WHERE id=$1`, [req.params.id]);
  if (!u.rows[0]) return res.status(404).json({ message: 'کاربر پیدا نشد' });
  const [hist, sum] = await Promise.all([
    points.history(req.params.id, {
      limit: req.query.limit, offset: req.query.offset, source: req.query.source,
    }),
    points.summary(req.params.id),
  ]);
  // ── اختلافِ دفتر با موجودی، صریح گزارش می‌شود ──
  //
  // برای کاربرانِ قبل از مایگریشنِ ۰۴۵ این اختلاف طبیعی است (backfill
  // عمداً انجام نشد). ولی مدیر باید بداند عدد را با احتیاط بخواند،
  // نه اینکه فکر کند دفتر کامل است.
  const ledgerSum = sum.totals.net;
  res.json({
    user: u.rows[0],
    ...hist,
    summary: sum,
    ledgerSum,
    ledgerMatches: ledgerSum === Number(u.rows[0].current_points),
  });
}));

// جدولِ «بیشترین امتیازگیرندگان» با پنجرهٔ زمانی و تفکیکِ منبع.
//
// خواستهٔ مالک: «کاربرایی که بیشترین امتیاز رو از کار در اپلیکیشن و وب
// بدست آوردن قابل دیدنه».
router.get('/admin/points/top', adminAuth, asyncHandler(async (req, res) => {
  const [top, bySource, biggest] = await Promise.all([
    points.topEarners({
      limit: req.query.limit,
      windowDays: req.query.days,
      source: req.query.source,
    }),
    pool.query(
      `SELECT source, count(*)::int AS n, SUM(delta)::int AS total
         FROM point_transactions WHERE delta > 0
         GROUP BY source ORDER BY SUM(delta) DESC`),
    // بزرگ‌ترین دریافت‌های تک‌بارهٔ کلِ پلتفرم — برای پیدا کردنِ
    // ناهنجاری: اگر کسی یک‌باره ۵۰ هزار امتیاز گرفته، اینجا اول
    // فهرست است.
    pool.query(
      `SELECT t.delta, t.source, t.description, t.created_at,
              u.id AS user_id, u.mobile, u.nickname
         FROM point_transactions t JOIN users u ON u.id = t.user_id
        WHERE t.delta > 0 ORDER BY t.delta DESC LIMIT 20`),
  ]);
  res.json({
    top,
    bySource: bySource.rows,
    biggestSingle: biggest.rows,
    drift: await points.drift(),
  });
}));

// ریزِ امتیازاتِ خودِ کاربر — همان دفتر، از دیدِ کاربر.
//
// چرا لازم است: کاربری که می‌بیند امتیازش کم شده باید بتواند خودش
// بفهمد چرا، بدونِ تماس با پشتیبانی. نوتیفیکیشن یک بار دیده می‌شود و
// گم می‌شود؛ این فهرست می‌ماند.
router.get('/points/history', auth, asyncHandler(async (req, res) => {
  const h = await points.history(req.user.id, {
    limit: req.query.limit, offset: req.query.offset,
  });
  res.json({ ...h, summary: await points.summary(req.user.id) });
}));
router.post('/admin/users/:id/notify', adminAuth, validateUuid('id'), requireRole('support'), asyncHandler(async (req, res) => { await createNotification(req.params.id, 'admin_private', req.body.title || 'پیام اختصاصی مدیریت', req.body.body || req.body.message || ''); await audit(req.admin.id,'private_message_user','users',req.params.id,null,{title:req.body.title}); res.json({message:'پیام اختصاصی ارسال شد'}); }));
// SMS OTP is not wired up yet, so the self-service "forgot password" flow
// cannot deliver a reset code to the user. Until a real SMS provider is
// configured, this lets a support/super admin set a temporary password for
// a locked-out user after verifying their identity manually (phone call,
// in-person, etc.). Every use is written to the audit log.
router.post('/admin/users/:id/reset-password', adminAuth, validateUuid('id'), requireRole('support'), asyncHandler(async (req, res) => {
  const newPassword = String(req.body.newPassword || '');
  if (!isValidPasswordLength(newPassword)) return res.status(400).json({ message: 'رمز جدید باید بین ۶ تا ۷۲ کاراکتر باشد' });
  const hash = await bcrypt.hash(newPassword, 12);
  const { rows } = await pool.query('UPDATE users SET password_hash=$1, updated_at=NOW() WHERE id=$2 RETURNING id,mobile', [hash, req.params.id]);
  if (!rows[0]) return res.status(404).json({ message: 'کاربر پیدا نشد' });
  await audit(req.admin.id, 'admin_reset_user_password', 'users', req.params.id, req.body.reason || 'بازیابی رمز توسط پشتیبانی (SMS هنوز فعال نیست)', {});
  res.json({ message: 'رمز عبور کاربر تغییر کرد' });
}));

  return router;
};
