// Deterministic cosmetics shop + monthly/annual GhelGheli Plus.
// Prices and grants are authoritative here/the database; clients only render.
const { pool } = require('../config/db');
const wallet = require('./walletService');
const referrals = require('./referralService');

// Kept as named constants for economy audits and backwards-compatible tests.
const PLUS_PRICE = 59000;
const ANNUAL_PLUS_PRICE = 499000;

const PLUS_PLANS = Object.freeze({
  monthly: {
    key: 'monthly', plan: 'plus', price: PLUS_PRICE, days: 30,
    label: 'پلاس ماهانه', savingPercent: 0,
  },
  annual: {
    key: 'annual', plan: 'plus_annual', price: ANNUAL_PLUS_PRICE, days: 365,
    label: 'پلاس سالانه', savingPercent: 30,
  },
});

const PLUS_BENEFITS = Object.freeze([
  'دسترسی به قاب‌ها و افکت‌های نام متحرک در مدت اشتراک',
  'ستاره پلاس در پروفایل، چت، لیگ و بازی',
  'عضویت دائمی در یک باشگاه منتخب',
  'مسیر ویژه گذر نبرد (Premium Pass)',
  'حذف تبلیغات عادی',
]);

const ANNUAL_BENEFITS = Object.freeze([
  'قاب سلطنتی سالانه؛ هدیه دائمی و انحصاری',
  'عنوان دائمی «ستاره سالانه» روی پروفایل',
  'قالب دائمی نتیجه سلطنتی برای اشتراک‌گذاری',
  'یک فرصت تغییر باشگاه منتخب در هر دوره سالانه',
]);

const SLOT_FOR_KIND = Object.freeze({
  club_badge: 'equipped_club',
  card_frame: 'equipped_frame',
  name_color: 'equipped_color',
  profile_background: 'equipped_profile_background',
  result_template: 'equipped_result_template',
  match_effect: 'equipped_match_effect',
  emote_pack: 'equipped_emote_pack',
  profile_badge: 'equipped_profile_badge',
});
const PLUS_UNLOCK_KINDS = new Set(['club_badge', 'card_frame', 'name_color']);

function fail(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

function styleKey(item) {
  return item?.payload || item?.slug || null;
}

function selectedValue(user, kind) {
  return user?.[SLOT_FOR_KIND[kind]] || null;
}

function planView(plan) {
  return {
    billingCycle: plan.key,
    plan: plan.plan,
    label: plan.label,
    price: plan.price,
    days: plan.days,
    savingPercent: plan.savingPercent,
    benefits: plan.key === 'annual'
      ? [...PLUS_BENEFITS, ...ANNUAL_BENEFITS]
      : [...PLUS_BENEFITS],
  };
}

async function plusStatus(userId, client = pool) {
  const [subscriptions, user] = await Promise.all([
    client.query(
      `SELECT plan, starts_at, expires_at
         FROM user_subscriptions
        WHERE user_id=$1 AND plan IN ('plus','plus_annual')
          AND expires_at > NOW()
        ORDER BY expires_at DESC`,
      [userId],
    ),
    client.query(
      `SELECT annual_club_switches FROM users WHERE id=$1`, [userId]),
  ]);
  const activeRows = subscriptions.rows;
  const annual = activeRows.find((r) => r.plan === 'plus_annual');
  const latest = activeRows[0];
  const active = activeRows.length > 0;
  return {
    active,
    tier: annual ? 'annual' : active ? 'monthly' : null,
    plan: annual?.plan || latest?.plan || null,
    startedAt: annual?.starts_at || latest?.starts_at || null,
    expiresAt: latest?.expires_at || null,
    adFree: active,
    premiumPass: active,
    clubSwitchesRemaining: Number(user.rows[0]?.annual_club_switches || 0),
  };
}

async function catalogue(userId) {
  const [items, owned, userRow, balance, plus, clubs, history] = await Promise.all([
    pool.query(
      `SELECT id, slug, kind, name, description, image_url, payload, price,
              display_order, access_tier, is_purchasable, metadata
         FROM shop_items WHERE is_active=true
        ORDER BY kind, display_order, price, name`,
    ),
    pool.query(
      `SELECT item_id, price_paid, bought_at
         FROM user_shop_items WHERE user_id=$1`, [userId]),
    pool.query(
      `SELECT equipped_club, equipped_frame, equipped_color,
              equipped_profile_background, equipped_result_template,
              equipped_match_effect, equipped_emote_pack,
              equipped_profile_badge, profile_title, annual_club_switches
         FROM users WHERE id=$1`, [userId]),
    pool.query('SELECT wallet_balance FROM users WHERE id=$1', [userId]),
    plusStatus(userId),
    pool.query(
      `SELECT m.club_slug AS slug, COALESCE(i.name,m.club_slug) AS name,
              (m.source='purchase') AS permanent, m.joined_at
         FROM effective_club_memberships m
         LEFT JOIN shop_items i ON i.kind='club_badge'
          AND COALESCE(i.payload,i.slug)=m.club_slug
        WHERE m.user_id=$1 ORDER BY m.joined_at DESC`,
      [userId],
    ),
    purchaseHistory(userId, { limit: 24, offset: 0 }),
  ]);
  const user = userRow.rows[0] || {};
  const ownedById = new Map(owned.rows.map((r) => [r.item_id, r]));
  const memberClubs = new Set(clubs.rows.map((club) => club.slug));

  const decorated = items.rows.map((item) => {
    const purchase = ownedById.get(item.id);
    const unlockedByPlus = plus.active
      && item.access_tier !== 'annual'
      && PLUS_UNLOCK_KINDS.has(item.kind);
    const value = item.kind === 'club_badge' ? styleKey(item) : styleKey(item);
    return {
      ...item,
      price: Number(item.price),
      owned: Boolean(purchase),
      boughtAt: purchase?.bought_at || null,
      member: item.kind === 'club_badge' && memberClubs.has(value),
      unlockedByPlus,
      usable: Boolean(purchase || unlockedByPlus
        || (item.kind === 'club_badge' && memberClubs.has(value))),
      equipped: selectedValue(user, item.kind) === value,
    };
  });

  const groups = {};
  for (const item of decorated) (groups[item.kind] ||= []).push(item);
  const walletBalance = Number(balance.rows[0]?.wallet_balance || 0);
  return {
    walletBalance,
    // Compatibility with APKs released before the compact Shop redesign.
    balance: walletBalance,
    plus: {
      ...plus,
      price: PLUS_PLANS.monthly.price,
      days: PLUS_PLANS.monthly.days,
      daysLeft: plus.expiresAt
        ? Math.max(0, Math.ceil((new Date(plus.expiresAt) - Date.now()) / 86400000))
        : 0,
      benefits: [...PLUS_BENEFITS],
      perks: [...PLUS_BENEFITS],
      annualBenefits: [...ANNUAL_BENEFITS],
      expiryNote: 'خرید مستقیم دائمی است؛ دسترسی اشتراکی با پایان دوره متوقف می‌شود و باشگاه منتخبت می‌ماند.',
    },
    plans: [planView(PLUS_PLANS.monthly), planView(PLUS_PLANS.annual)],
    groups,
    items: decorated,
    clubs: clubs.rows,
    purchaseHistory: history.map((row) => ({
      ...row,
      pricePaid: Number(row.price_paid || 0),
      purchasedAt: row.purchased_at,
      expiresAt: row.expires_at || null,
    })),
    equipped: {
      club: user.equipped_club || null,
      color: user.equipped_color || null,
      clubBadge: user.equipped_club || null,
      frame: user.equipped_frame || null,
      nameColor: user.equipped_color || null,
      profileBackground: user.equipped_profile_background || null,
      resultTemplate: user.equipped_result_template || null,
      matchEffect: user.equipped_match_effect || null,
      emotePack: user.equipped_emote_pack || null,
      profileBadge: user.equipped_profile_badge || null,
      title: user.profile_title || null,
    },
  };
}

async function buyItem(userId, itemId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const itemRes = await client.query(
      `SELECT * FROM shop_items WHERE id=$1 AND is_active=true FOR UPDATE`,
      [itemId],
    );
    const item = itemRes.rows[0];
    if (!item) throw fail('کالا پیدا نشد', 404);
    if (!item.is_purchasable || item.access_tier === 'annual') {
      throw fail('این هدیه فقط همراه پلاس سالانه فعال می‌شود', 409);
    }
    const previous = await client.query(
      `SELECT purchase_id FROM user_shop_items WHERE user_id=$1 AND item_id=$2`,
      [userId, itemId],
    );
    if (previous.rows[0]) throw fail('این کالا را قبلاً خریده‌اید', 409);

    const purchase = await client.query(
      `INSERT INTO user_shop_items(user_id,item_id,price_paid)
       VALUES($1,$2,$3) RETURNING purchase_id, bought_at`,
      [userId, itemId, item.price],
    );
    const purchaseId = purchase.rows[0].purchase_id;
    const payment = await wallet.debit(client, {
      userId,
      amount: Number(item.price),
      source: 'shop',
      referenceType: 'shop_item',
      referenceId: purchaseId,
      description: `خرید ${item.name}`,
    });

    // Buying a badge is permanent membership, independently of Plus.
    if (item.kind === 'club_badge') {
      const clubSlug = styleKey(item);
      await client.query(
        `INSERT INTO user_clubs(user_id,club_slug,source,joined_at)
         VALUES($1,$2,'purchase',NOW())
         ON CONFLICT(user_id,club_slug)
         DO UPDATE SET source='purchase', joined_at=EXCLUDED.joined_at`,
        [userId, clubSlug],
      );
    }

    const commission = await referrals.payPurchaseCommission(client, {
      buyerId: userId,
      purchaseType: 'shop_item',
      purchaseReferenceId: purchaseId,
      purchaseAmount: Number(item.price),
    });
    await client.query('COMMIT');
    return {
      item: { ...item, price: Number(item.price), owned: true },
      walletBalance: payment.balance,
      boughtAt: purchase.rows[0].bought_at,
      joinedClub: item.kind === 'club_badge' ? styleKey(item) : null,
      referralCommissionCreated: Boolean(commission && !commission.duplicate),
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

function normalizeBillingCycle(value) {
  const clean = String(value || 'monthly').toLowerCase();
  if (['annual', 'yearly', 'year'].includes(clean)) return 'annual';
  if (['monthly', 'month'].includes(clean)) return 'monthly';
  throw fail('دوره اشتراک باید ماهانه یا سالانه باشد');
}

async function buyPlus(userId, billingCycle = 'monthly') {
  const cycle = normalizeBillingCycle(billingCycle);
  const chosen = PLUS_PLANS[cycle];
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const locked = await client.query(
      `SELECT wallet_balance FROM users WHERE id=$1 FOR UPDATE`, [userId]);
    if (!locked.rows[0]) throw fail('کاربر پیدا نشد', 404);

    const active = await client.query(
      `SELECT MAX(expires_at) AS expires_at
         FROM user_subscriptions
        WHERE user_id=$1 AND plan IN ('plus','plus_annual')
          AND expires_at > NOW()`,
      [userId],
    );
    const startsAt = active.rows[0]?.expires_at || new Date();
    const expiresAt = new Date(new Date(startsAt).getTime() + chosen.days * 86400000);
    const subscription = await client.query(
      `INSERT INTO user_subscriptions(user_id,plan,price_paid,starts_at,expires_at)
       VALUES($1,$2,$3,$4,$5)
       RETURNING id, plan, price_paid, starts_at, expires_at`,
      [userId, chosen.plan, chosen.price, startsAt, expiresAt],
    );
    const subscriptionId = subscription.rows[0].id;
    const payment = await wallet.debit(client, {
      userId,
      amount: chosen.price,
      source: 'subscription',
      referenceType: chosen.plan,
      referenceId: subscriptionId,
      description: `خرید ${chosen.label}`,
    });

    if (cycle === 'annual') {
      await client.query(
        `INSERT INTO user_shop_items(user_id,item_id,price_paid)
         SELECT $1, i.id, 0 FROM shop_items i
          WHERE i.slug IN ('annual_royal_frame','annual_royal_result')
         ON CONFLICT(user_id,item_id) DO NOTHING`,
        [userId],
      );
      await client.query(
        `INSERT INTO user_entitlements
           (user_id, entitlement_key, metadata, granted_by_subscription_id)
         VALUES
           ($1,'annual_profile_title','{"title":"ستاره سالانه"}'::jsonb,$2),
           ($1,'annual_club_switch','{"switches":1}'::jsonb,$2)
         ON CONFLICT(user_id,entitlement_key) DO UPDATE SET
           metadata=EXCLUDED.metadata,
           granted_by_subscription_id=EXCLUDED.granted_by_subscription_id,
           granted_at=NOW()`,
        [userId, subscriptionId],
      );
      await client.query(
        `UPDATE users SET
           profile_title=COALESCE(profile_title,'ستاره سالانه'),
           equipped_frame=COALESCE(equipped_frame,'annual_royal_frame'),
           equipped_result_template=COALESCE(equipped_result_template,'annual_royal_result'),
           annual_club_switches=GREATEST(annual_club_switches,1),
           updated_at=NOW()
         WHERE id=$1`,
        [userId],
      );
    }

    const commission = await referrals.payPurchaseCommission(client, {
      buyerId: userId,
      purchaseType: cycle === 'annual' ? 'plus_annual' : 'plus_monthly',
      purchaseReferenceId: subscriptionId,
      purchaseAmount: chosen.price,
    });
    await client.query('COMMIT');
    return {
      subscription: subscription.rows[0],
      billingCycle: cycle,
      walletBalance: payment.balance,
      plus: await plusStatus(userId),
      annualGiftsGranted: cycle === 'annual',
      referralCommissionCreated: Boolean(commission && !commission.duplicate),
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function assertUsable(client, userId, item) {
  const owned = await client.query(
    `SELECT 1 FROM user_shop_items WHERE user_id=$1 AND item_id=$2`,
    [userId, item.id],
  );
  if (owned.rows[0]) return { owned: true, plus: await plusStatus(userId, client) };
  const plus = await plusStatus(userId, client);
  if (plus.active && item.access_tier !== 'annual' && PLUS_UNLOCK_KINDS.has(item.kind)) {
    return { owned: false, plus };
  }
  throw fail('برای استفاده، ابتدا این مورد را بخرید یا اشتراک لازم را فعال کنید', 403);
}

async function equipClub(client, userId, item, access) {
  const clubSlug = styleKey(item);
  const membership = await client.query(
    `SELECT source FROM user_clubs WHERE user_id=$1 AND club_slug=$2`,
    [userId, clubSlug],
  );
  if (membership.rows[0]?.source === 'purchase' || access.owned) {
    await client.query(
      `INSERT INTO user_clubs(user_id,club_slug,source,joined_at)
       VALUES($1,$2,'purchase',NOW())
       ON CONFLICT(user_id,club_slug) DO UPDATE SET source='purchase'`,
      [userId, clubSlug],
    );
    return { value: clubSlug, switched: false };
  }

  if (!access.plus.active) throw fail('این باشگاه در دسترس نیست', 403);
  const current = await client.query(
    `SELECT club_slug FROM user_clubs
      WHERE user_id=$1 AND source='plus'
      ORDER BY joined_at DESC LIMIT 1 FOR UPDATE`,
    [userId],
  );
  const previous = current.rows[0]?.club_slug;
  if (previous && previous !== clubSlug) {
    // Serialize two devices trying to spend the same annual switch.
    const allowance = await client.query(
      `SELECT annual_club_switches FROM users WHERE id=$1 FOR UPDATE`, [userId]);
    if (access.plus.tier !== 'annual'
        || Number(allowance.rows[0]?.annual_club_switches || 0) <= 0) {
      throw fail('باشگاه منتخب پلاس ثابت است؛ پلاس سالانه هر دوره یک تغییر می‌دهد', 409);
    }
    const consumed = await client.query(
      `UPDATE users SET annual_club_switches=annual_club_switches-1,
              profile_avatar_key=CASE WHEN profile_avatar_key=$2
                THEN 'avatar_1_football.png' ELSE profile_avatar_key END,
              updated_at=NOW()
        WHERE id=$1 AND annual_club_switches > 0
        RETURNING annual_club_switches`,
      [userId, `club:${previous}`],
    );
    if (!consumed.rows[0]) throw fail('فرصت تغییر باشگاه این دوره مصرف شده است', 409);
    await client.query(
      `DELETE FROM user_clubs WHERE user_id=$1 AND source='plus'`, [userId]);
  }
  await client.query(
    `INSERT INTO user_clubs(user_id,club_slug,source,joined_at)
     VALUES($1,$2,'plus',NOW())
     ON CONFLICT(user_id,club_slug)
     DO UPDATE SET joined_at=EXCLUDED.joined_at`,
    [userId, clubSlug],
  );
  return { value: clubSlug, switched: Boolean(previous && previous !== clubSlug) };
}

async function equip(userId, slug, requestedKind = null) {
  if (!slug) {
    const column = SLOT_FOR_KIND[requestedKind];
    if (!column) throw fail('نوع آیتم برای برداشتن انتخاب مشخص نیست');
    await pool.query(`UPDATE users SET ${column}=NULL, updated_at=NOW() WHERE id=$1`, [userId]);
    return { equipped: null, kind: requestedKind };
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const itemRes = await client.query(
      `SELECT * FROM shop_items WHERE slug=$1 AND is_active=true`, [slug]);
    const item = itemRes.rows[0];
    if (!item) throw fail('آیتم پیدا نشد', 404);
    if (requestedKind && requestedKind !== item.kind) throw fail('نوع آیتم اشتباه است');
    const column = SLOT_FOR_KIND[item.kind];
    if (!column) throw fail('این نوع آیتم قابل انتخاب نیست');
    const access = await assertUsable(client, userId, item);
    const clubChoice = item.kind === 'club_badge'
      ? await equipClub(client, userId, item, access)
      : null;
    const value = clubChoice ? clubChoice.value : styleKey(item);
    await client.query(
      `UPDATE users SET ${column}=$2, updated_at=NOW() WHERE id=$1`,
      [userId, value],
    );
    await client.query('COMMIT');
    return {
      equipped: value,
      kind: item.kind,
      clubSwitchesRemaining: Math.max(
        0,
        access.plus.clubSwitchesRemaining - (clubChoice?.switched ? 1 : 0),
      ),
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function useClubAvatar(userId, clubSlug) {
  const clean = String(clubSlug || '').trim().toLowerCase();
  if (!/^[a-z0-9_]{1,40}$/.test(clean)) throw fail('باشگاه معتبر نیست');
  const member = await pool.query(
    `SELECT 1 FROM effective_club_memberships
      WHERE user_id=$1 AND club_slug=$2`, [userId, clean]);
  if (!member.rows[0]) throw fail('ابتدا عضو این باشگاه شوید', 403);
  const key = `club:${clean}`;
  await pool.query(
    `UPDATE users SET profile_avatar_key=$2, updated_at=NOW() WHERE id=$1`,
    [userId, key],
  );
  return { profileAvatarKey: key, clubSlug: clean };
}

async function purchaseHistory(userId, { limit = 50, offset = 0 } = {}) {
  const n = Math.max(1, Math.min(100, Number(limit) || 50));
  const o = Math.max(0, Number(offset) || 0);
  const [items, subscriptions] = await Promise.all([
    pool.query(
      `SELECT usi.purchase_id AS id, 'item' AS type, i.slug, i.kind, i.name,
              usi.price_paid, usi.bought_at AS purchased_at
         FROM user_shop_items usi JOIN shop_items i ON i.id=usi.item_id
        WHERE usi.user_id=$1 ORDER BY usi.bought_at DESC LIMIT $2 OFFSET $3`,
      [userId, n, o],
    ),
    pool.query(
      `SELECT id, 'subscription' AS type, plan AS slug,
              CASE WHEN plan='plus_annual' THEN 'پلاس سالانه' ELSE 'پلاس ماهانه' END AS name,
              price_paid, starts_at, expires_at, created_at AS purchased_at
         FROM user_subscriptions
        WHERE user_id=$1 AND plan IN ('plus','plus_annual')
        ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [userId, n, o],
    ),
  ]);
  return [...items.rows, ...subscriptions.rows]
    .sort((a, b) => new Date(b.purchased_at) - new Date(a.purchased_at))
    .slice(0, n);
}

// Batch projection used by chat, league, profiles and multiplayer payloads.
async function cosmeticsFor(userIds) {
  const ids = [...new Set((userIds || []).filter(Boolean))];
  if (!ids.length) return new Map();
  const { rows } = await pool.query(
    `SELECT u.id, u.equipped_club, u.equipped_frame, u.equipped_color,
            u.equipped_profile_background, u.equipped_result_template,
            u.equipped_match_effect, u.equipped_emote_pack,
            u.equipped_profile_badge, u.profile_title,
            EXISTS(SELECT 1 FROM user_subscriptions s
                    WHERE s.user_id=u.id AND s.plan IN ('plus','plus_annual')
                      AND s.expires_at>NOW()) AS plus,
            EXISTS(SELECT 1 FROM user_subscriptions s
                    WHERE s.user_id=u.id AND s.plan='plus_annual'
                      AND s.expires_at>NOW()) AS annual
       FROM users u WHERE u.id=ANY($1::uuid[])`,
    [ids],
  );
  const owned = await pool.query(
    `SELECT usi.user_id, i.kind, COALESCE(i.payload,i.slug) AS value
       FROM user_shop_items usi JOIN shop_items i ON i.id=usi.item_id
      WHERE usi.user_id=ANY($1::uuid[])`,
    [ids],
  );
  const membership = await pool.query(
    `SELECT user_id, club_slug FROM effective_club_memberships
      WHERE user_id=ANY($1::uuid[])`, [ids]);
  const ownedSet = new Set(owned.rows.map((r) => `${r.user_id}:${r.kind}:${r.value}`));
  const memberSet = new Set(membership.rows.map((r) => `${r.user_id}:${r.club_slug}`));
  const out = new Map();
  for (const row of rows) {
    const can = (kind, value) => {
      if (!value) return null;
      if (ownedSet.has(`${row.id}:${kind}:${value}`)) return value;
      if (row.plus && PLUS_UNLOCK_KINDS.has(kind)) return value;
      return null;
    };
    const club = row.equipped_club && memberSet.has(`${row.id}:${row.equipped_club}`)
      ? row.equipped_club : null;
    const frame = can('card_frame', row.equipped_frame);
    const color = can('name_color', row.equipped_color);
    out.set(row.id, {
      plus: Boolean(row.plus),
      annual: Boolean(row.annual),
      // Legacy aliases stay stable for already-released Android/Web clients.
      club,
      color,
      frame,
      clubBadge: club,
      nameColor: color,
      profileBackground: can('profile_background', row.equipped_profile_background),
      resultTemplate: can('result_template', row.equipped_result_template),
      matchEffect: can('match_effect', row.equipped_match_effect),
      emotePack: can('emote_pack', row.equipped_emote_pack),
      profileBadge: can('profile_badge', row.equipped_profile_badge),
      title: row.profile_title || null,
    });
  }
  return out;
}

async function emotePacksFor(userId) {
  const { rows } = await pool.query(
    `SELECT i.slug, i.name, i.metadata
       FROM user_shop_items usi JOIN shop_items i ON i.id=usi.item_id
      WHERE usi.user_id=$1 AND i.kind='emote_pack' AND i.is_active=true
      ORDER BY i.display_order`,
    [userId],
  );
  return rows.map((r) => ({
    slug: r.slug,
    name: r.name,
    icon: r.metadata?.icon || '✨',
    messages: Array.isArray(r.metadata?.messages) ? r.metadata.messages : [],
  }));
}

async function isEmoteAllowed(userId, text) {
  const packs = await emotePacksFor(userId);
  return packs.some((pack) => pack.messages.includes(String(text || '').trim()));
}

module.exports = {
  catalogue,
  buyItem,
  buyPlus,
  equip,
  plusStatus,
  purchaseHistory,
  cosmeticsFor,
  useClubAvatar,
  emotePacksFor,
  isEmoteAllowed,
  PLUS_PLANS,
  PLUS_BENEFITS,
  ANNUAL_BENEFITS,
  SLOT_FOR_KIND,
};
