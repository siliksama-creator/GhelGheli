/** Reward catalogue, groups, and claim administration routes. */
const express = require('express');

module.exports = function createAdminRewardRoutes(deps) {
  const {
    pool, adminAuth, requireRole, asyncHandler, audit, validateUuid,
    rewardGroups, safeImageUrl, cashAmountInput, keepImage, createNotification,
    walletService,
  } = deps;
  const router = express.Router();

router.get('/admin/rewards', adminAuth, asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT tier.*,
            COALESCE(
              json_agg(json_build_object(
                'cardTypeId', requirement.card_type_id,
                'cardTypeName', card.name,
                'quantity', requirement.quantity
              ) ORDER BY card.name)
              FILTER (WHERE requirement.card_type_id IS NOT NULL),
              '[]'::json
            ) AS required_cards
       FROM reward_tiers tier
       LEFT JOIN reward_tier_cards requirement ON requirement.reward_tier_id=tier.id
       LEFT JOIN card_types card ON card.id=requirement.card_type_id
      GROUP BY tier.id
      ORDER BY tier.display_order, tier.required_points`,
  );
  res.json(rows);
}));
// ── Admin: reward groups ───────────────────────────────────────────────────
// Both the web panel and the Flutter admin app drive these, so the two stay
// in lockstep by construction rather than by discipline.

router.get('/admin/reward-groups', adminAuth, asyncHandler(async (req, res) => {
  res.json({ groups: await rewardGroups.listGroups({ includeInactive: true }) });
}));

router.post('/admin/reward-groups', adminAuth, requireRole('support'), asyncHandler(async (req, res) => {
  const b = req.body || {};
  if (!b.name || !String(b.name).trim()) {
    return res.status(400).json({ message: 'نام گروه الزامی است' });
  }
  const type = rewardGroups.GROUP_TYPES.includes(b.groupType) ? b.groupType : 'mixed';
  const { rows } = await pool.query(
    `INSERT INTO reward_groups(name, description, image_url, group_type, accent, display_order, is_active)
     VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [String(b.name).trim(), b.description || null, safeImageUrl(b.imageUrl),
     type, b.accent || 'emerald', Number(b.displayOrder) || 0, b.isActive !== false]);
  await audit(req.admin.id, 'create_reward_group', 'reward_groups', rows[0].id, null, b);
  res.json(rows[0]);
}));

router.patch('/admin/reward-groups/:id', adminAuth, validateUuid('id'), requireRole('support'), asyncHandler(async (req, res) => {
  const b = req.body || {};
  const before = await pool.query('SELECT * FROM reward_groups WHERE id=$1', [req.params.id]);
  if (!before.rows[0]) return res.status(404).json({ message: 'گروه پیدا نشد' });
  const type = rewardGroups.GROUP_TYPES.includes(b.groupType)
    ? b.groupType : before.rows[0].group_type;
  const { rows } = await pool.query(
    `UPDATE reward_groups SET
       name=COALESCE($2,name), description=COALESCE($3,description),
       image_url=COALESCE($4,image_url), group_type=$5,
       accent=COALESCE($6,accent), display_order=COALESCE($7,display_order),
       is_active=COALESCE($8,is_active), updated_at=NOW()
     WHERE id=$1 RETURNING *`,
    [req.params.id, b.name ?? null, b.description ?? null,
     b.imageUrl !== undefined ? safeImageUrl(b.imageUrl) : null, type,
     b.accent ?? null,
     b.displayOrder !== undefined ? Number(b.displayOrder) : null,
     b.isActive !== undefined ? !!b.isActive : null]);
  await audit(req.admin.id, 'update_reward_group', 'reward_groups', req.params.id, before.rows[0], b);
  res.json(rows[0]);
}));

router.delete('/admin/reward-groups/:id', adminAuth, validateUuid('id'), requireRole('super_admin'), asyncHandler(async (req, res) => {
  // Tiers keep existing and fall back to the "بدون گروه" bucket (the FK is
  // ON DELETE SET NULL) — deleting a group must never delete prizes.
  const before = await pool.query('SELECT * FROM reward_groups WHERE id=$1', [req.params.id]);
  if (!before.rows[0]) return res.status(404).json({ message: 'گروه پیدا نشد' });
  await pool.query('DELETE FROM reward_groups WHERE id=$1', [req.params.id]);
  await audit(req.admin.id, 'delete_reward_group', 'reward_groups', req.params.id, before.rows[0], null);
  res.json({ message: 'گروه حذف شد؛ جوایزش بدون گروه ماندند' });
}));

// Card requirements for a tier.
router.put('/admin/rewards/:id/cards', adminAuth, validateUuid('id'), requireRole('support'), asyncHandler(async (req, res) => {
  const list = Array.isArray(req.body?.cards) ? req.body.cards : [];
  if (list.length > 20) {
    return res.status(400).json({ message: 'حداکثر ۲۰ نوع کارت برای هر جایزه' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM reward_tier_cards WHERE reward_tier_id=$1', [req.params.id]);
    for (const c of list) {
      const qty = Number(c?.quantity);
      if (!c?.cardTypeId || !Number.isInteger(qty) || qty < 1 || qty > 999) {
        throw Object.assign(new Error('تعداد کارت باید عددی بین ۱ تا ۹۹۹ باشد'), { status: 400 });
      }
      await client.query(
        'INSERT INTO reward_tier_cards(reward_tier_id, card_type_id, quantity) VALUES($1,$2,$3)',
        [req.params.id, c.cardTypeId, qty]);
    }
    await client.query('COMMIT');
    await audit(req.admin.id, 'set_reward_cards', 'reward_tiers', req.params.id, null, { cards: list });
    res.json({ message: 'کارت‌های موردنیاز ذخیره شد' });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(e.status || 500).json({ message: e.message });
  } finally { client.release(); }
}));

router.post('/admin/rewards', adminAuth, requireRole('support'), asyncHandler(async (req, res) => {
  const r = req.body;
  const count = await pool.query('SELECT count(*)::int AS count FROM reward_tiers WHERE is_active = true');
  if (count.rows[0].count >= 500) {
    return res.status(400).json({ message: 'تعداد جوایز فعال بیش از حد است (۵۰۰)؛ چند مورد را غیرفعال کنید' });
  }
  const requiredPoints = Number(r.requiredPoints);
  if (!r.name || !Number.isFinite(requiredPoints) || requiredPoints <= 0) {
    return res.status(400).json({ message: 'نام جایزه و امتیاز معتبر الزامی است' });
  }
  const rewardType = r.rewardType === 'physical' ? 'physical' : 'cash';
  const cashAmount = cashAmountInput(r.cashAmount) ?? (rewardType === 'cash' ? 10000 : 0);
  let rewardValue = String(r.rewardValue || '').trim();
  if (!rewardValue) {
    rewardValue = rewardType === 'cash' ? `${cashAmount.toLocaleString('en-US')} تومان` : String(r.name).trim();
  }
  let maxClaims = Math.max(0, Number(r.maxClaimsPerUser) || 0);
  if (rewardType === 'cash' && maxClaims <= 0) {
    maxClaims = 1;
  }
  const { rows } = await pool.query(
    'INSERT INTO reward_tiers(name,description,image_url,required_points,reward_type,reward_value,cash_amount,display_order,is_active,group_id,max_claims_per_user) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *',
    [r.name, r.description || null, safeImageUrl(r.imageUrl), requiredPoints, rewardType, rewardValue, cashAmount, r.displayOrder || 0, r.isActive !== false, r.groupId || null, maxClaims]
  );
  await audit(req.admin.id, 'create_reward', 'reward_tiers', rows[0].id, null, r);
  res.json(rows[0]);
}));
router.patch('/admin/rewards/:id', adminAuth, validateUuid('id'), requireRole('support'), asyncHandler(async (req, res) => {
  const r = req.body;
  const cashAmount = cashAmountInput(r.cashAmount);
  // حالت قبلی را نگه می‌داریم تا اگر محافظِ پایین رد کرد، دقیقاً به همین
  // حالت برگردانده شود.
  const prev = await pool.query('SELECT * FROM reward_tiers WHERE id=$1', [req.params.id]);
  if (!prev.rows[0]) return res.status(404).json({ message: 'جایزه پیدا نشد' });
  const before0 = prev.rows[0];
  // groupId is deliberately settable to NULL (move a tier out of a group), so
  // it uses an explicit sentinel rather than COALESCE.
  const moveGroup = r.groupId !== undefined;
  const { rows } = await pool.query(
    `UPDATE reward_tiers SET
       name=COALESCE($1,name), description=COALESCE($2,description),
       image_url=COALESCE($3,image_url), required_points=COALESCE($4,required_points),
       reward_type=COALESCE($5,reward_type), reward_value=COALESCE($6,reward_value),
       cash_amount=COALESCE($7,cash_amount), display_order=COALESCE($8,display_order),
       is_active=COALESCE($9,is_active),
       group_id = CASE WHEN $11::boolean THEN $12::uuid ELSE group_id END,
       max_claims_per_user = COALESCE($13, max_claims_per_user),
       updated_at=NOW()
     WHERE id=$10 RETURNING *`,
    [r.name,r.description,keepImage(r.imageUrl),r.requiredPoints,r.rewardType,
     r.rewardValue,cashAmount,r.displayOrder,r.isActive,req.params.id,
     moveGroup, moveGroup ? (r.groupId || null) : null,
     r.maxClaimsPerUser !== undefined
       ? Math.max(0, Number(r.maxClaimsPerUser) || 0) : null]);
  if (!rows[0]) return res.status(404).json({ message: 'جایزه پیدا نشد' });
  // همان محافظِ ساخت، ولی روی نتیجهٔ نهایی.
  //
  // اینجا COALESCE است، پس نمی‌شود فقط ورودی را چک کرد: ادمین می‌تواند
  // تیرِ نقدیِ غیرفعالی که سقفش صفر است را با یک PATCHِ
  // `{isActive:true}` دوباره زنده کند و هیچ فیلدِ خطرناکی هم نفرستد.
  // پس ردیفِ بعد از به‌روزرسانی سنجیده می‌شود و در صورت خطا تراکنش
  // برگردانده می‌شود. (جزئیات در محافظِ POST بالا.)
  const after = rows[0];
  if (after.is_active && after.reward_type === 'cash'
      && Number(after.max_claims_per_user || 0) <= 0) {
    await pool.query(
      'UPDATE reward_tiers SET max_claims_per_user=$2, is_active=$3 WHERE id=$1',
      [req.params.id, before0.max_claims_per_user, before0.is_active]);
    return res.status(400).json({
      message: 'برای جایزهٔ نقدی فعال، سقف دریافت هر کاربر باید بیشتر از صفر باشد',
    });
  }
  await audit(req.admin.id,'update_reward','reward_tiers',req.params.id,null,r); res.json(rows[0]);
}));
router.delete('/admin/rewards/:id', adminAuth, validateUuid('id'), requireRole('super_admin'), asyncHandler(async (req, res) => {
  // Full control for the admin. Past claims survive because each one stores
  // its own snapshot of the prize (name/image/type/amount) — see migration
  // 021, which also relaxed the FK from RESTRICT to SET NULL.
  const before = await pool.query('SELECT * FROM reward_tiers WHERE id=$1', [req.params.id]);
  if (!before.rows[0]) return res.status(404).json({ message: 'جایزه پیدا نشد' });
  await pool.query('DELETE FROM reward_tiers WHERE id=$1', [req.params.id]);
  await audit(req.admin.id, 'delete_reward', 'reward_tiers', req.params.id, before.rows[0], null);
  res.json({ message: 'جایزه حذف شد؛ سابقهٔ دریافت‌های قبلی حفظ شد' });
}));
router.get('/admin/reward-claims', adminAuth, asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT c.*, u.mobile, COALESCE(c.reward_name, r.name) AS reward_name
       FROM user_reward_claims c
       JOIN users u ON u.id=c.user_id
       LEFT JOIN reward_tiers r ON r.id=c.reward_tier_id
      ORDER BY c.claimed_at DESC`,
  );
  res.json(rows);
}));
router.patch('/admin/reward-claims/:id', adminAuth, validateUuid('id'), requireRole('support'), asyncHandler(async (req, res) => {
  const { status, adminNote } = req.body;
  if (!['pending', 'approved', 'rejected', 'paid'].includes(status)) {
    return res.status(400).json({ message: 'وضعیت نامعتبر است' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const q = await client.query(
      `SELECT c.*, r.cash_amount, r.reward_type, r.name AS reward_name,
              r.required_points
         FROM user_reward_claims c JOIN reward_tiers r ON r.id=c.reward_tier_id
        WHERE c.id=$1 FOR UPDATE OF c`,
      [req.params.id],
    );
    const claim = q.rows[0];
    if (!claim) throw Object.assign(new Error('درخواست جایزه پیدا نشد'), { status: 404 });

    await client.query(
      'UPDATE user_reward_claims SET status=$1, admin_note=$2, updated_at=NOW() WHERE id=$3',
      [status, adminNote, req.params.id],
    );

    // جایزهٔ نقدی وقتی «پرداخت شده» علامت می‌خورد به کیف پول واریز می‌شود،
    // نه هنگام تأیید — تا مدیر بتواند اول تأیید کند و بعد در زمان مناسب
    // پول را آزاد کند. مرجع = شناسهٔ claim، پس کلیک دوباره روی «پرداخت شد»
    // مبلغ را دو بار واریز نمی‌کند (ایندکس یکتای دفتر کل).
    const cash = Number(claim.cash_amount || 0);
    let credited = 0;
    if (status === 'paid' && claim.reward_type === 'cash' && cash > 0) {
      const r = await walletService.credit(client, {
        userId: claim.user_id,
        amount: cash,
        source: 'reward',
        referenceType: 'user_reward_claims',
        referenceId: claim.id,
        description: `جایزهٔ نقدی «${claim.reward_name}»`,
        adminId: req.admin.id,
      });
      if (!r.duplicate) credited = cash;
    }
    // REFUND ON REJECTION.
    //
    // Points are spent the moment a user claims, but a physical prize stays
    // pending until an admin posts it. If the admin then REJECTS it, the user
    // had paid for nothing and had no way to get those points back.
    //
    // The refund goes to current_points (the spendable balance) only:
    // lifetime_points was never reduced by the claim, and monthly league
    // points were never touched, so restoring either would invent points the
    // user did not earn.
    let refunded = 0;
    if (status === 'rejected' && !claim.refunded_at) {
      const { rows: tierRows } = await client.query(
        'SELECT required_points FROM reward_tiers WHERE id=$1',
        [claim.reward_tier_id]);
      const cost = Number(tierRows[0]?.required_points || 0);
      if (cost > 0) {
        // ── چرا `league:false` و چرا `lifetime` دست نمی‌خورد ──
        //
        // این برگشتِ امتیازِ خرج‌شده است، نه کسبِ تازه. `credit` خودش
        // `lifetime_points` را زیاد می‌کند که اینجا **غلط** است: کاربر
        // این امتیاز را قبلاً یک بار کسب کرده و در lifetime هست.
        // پس مستقیم می‌نویسیم و فقط ردیفِ دفتر را از سرویس می‌گیریم.
        const { rows: back } = await client.query(
          `UPDATE users SET current_points = current_points + $2, updated_at=NOW()
            WHERE id=$1 RETURNING current_points`,
          [claim.user_id, cost]);
        await client.query(
          `INSERT INTO point_transactions
             (user_id, delta, balance_after, source, reference_type,
              reference_id, description)
           VALUES ($1,$2,$3,'reward_claim','user_reward_claims',$4,$5)`,
          [claim.user_id, cost, back[0].current_points, claim.id,
            'برگشت امتیاز — درخواست جایزه رد شد']);
        // Stamped so a second rejection (or a re-save) cannot refund twice.
        await client.query(
          'UPDATE user_reward_claims SET refunded_at=NOW() WHERE id=$1',
          [claim.id]);
        refunded = cost;
      }
    }

    await client.query('COMMIT');

    if (refunded > 0) {
      createNotification(
        claim.user_id,
        'reward',
        'درخواست جایزه رد شد — امتیازت برگشت',
        `درخواست «${claim.reward_name}» تایید نشد و ${refunded} امتیاز به حسابت برگردانده شد.`,
      ).catch(() => {});
    }

    if (credited > 0) {
      createNotification(
        claim.user_id,
        'wallet',
        'جایزهٔ نقدی به کیف پول اضافه شد 🎁',
        `${credited.toLocaleString('en-US')} تومان بابت جایزهٔ «${claim.reward_name}» به کیف پول شما واریز شد.`,
      ).catch(() => {});
    }
    await audit(req.admin.id, 'update_reward_claim', 'user_reward_claims', req.params.id, adminNote, { status, credited });
    res.json({
      message: credited > 0
        ? `به‌روزرسانی شد و ${credited.toLocaleString('en-US')} تومان به کیف پول کاربر واریز شد`
        : refunded > 0
          ? `درخواست رد شد و ${refunded} امتیاز به کاربر برگشت`
          : 'به‌روزرسانی شد',
      refunded,
    });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(e.status || 500).json({ message: e.message || 'خطا در به‌روزرسانی' });
  } finally { client.release(); }
}));

  return router;
};
