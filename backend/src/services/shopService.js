// Cosmetic shop + GhelGheli Plus.
//
// WHAT IS SOLD: appearance only — club badges, card frames, name colours.
// Nothing here grants points, prizes or league advantage. Selling those with
// cash rewards attached would make the app pay-to-win and, legally, a game of
// chance.
//
// TWO PATHS TO AN ITEM
//   * Buy it: permanent, a row in user_shop_items.
//   * Plus:   an active subscription unlocks EVERY item for its duration.
//             When Plus lapses the user keeps only what they bought outright.
//
// Everything is paid from the in-app wallet, so the whole thing is one
// transaction with the existing ledger and cannot half-succeed.
const { pool } = require('../config/db');
const walletService = require('./walletService');

const PLUS_PRICE = 99000;
const PLUS_DAYS = 30;

/** Is this user's Plus currently active? */
async function plusStatus(userId, client = pool) {
  const { rows } = await client.query(
    `SELECT expires_at FROM user_subscriptions
      WHERE user_id=$1 AND plan='plus' AND expires_at > NOW()
      ORDER BY expires_at DESC LIMIT 1`,
    [userId]);
  if (!rows[0]) return { active: false, expiresAt: null, daysLeft: 0 };
  const expiresAt = rows[0].expires_at;
  const daysLeft = Math.max(0,
    Math.ceil((new Date(expiresAt) - Date.now()) / 86400000));
  return { active: true, expiresAt, daysLeft };
}

/**
 * The whole shop from one user's point of view: every item, whether they own
 * it, whether Plus is unlocking it, and what they currently have equipped.
 */
async function catalogue(userId) {
  const [{ rows: items }, { rows: owned }, { rows: userRows }, plus] =
    await Promise.all([
      pool.query(
        `SELECT id, slug, kind, name, description, image_url, payload, price
           FROM shop_items WHERE is_active = true
          ORDER BY display_order, name`),
      pool.query('SELECT item_id FROM user_shop_items WHERE user_id=$1', [userId]),
      pool.query(
        `SELECT wallet_balance, equipped_club, equipped_frame, equipped_color
           FROM users WHERE id=$1`, [userId]),
      plusStatus(userId),
    ]);

  const ownedIds = new Set(owned.map(o => o.item_id));
  const u = userRows[0] || {};

  return {
    balance: Number(u.wallet_balance || 0),
    plus: { ...plus, price: PLUS_PRICE, days: PLUS_DAYS },
    equipped: {
      club: u.equipped_club || null,
      frame: u.equipped_frame || null,
      color: u.equipped_color || null,
    },
    items: items.map(i => ({
      id: i.id,
      slug: i.slug,
      kind: i.kind,
      name: i.name,
      description: i.description,
      imageUrl: i.image_url,
      payload: i.payload,
      price: i.price,
      owned: ownedIds.has(i.id),
      // Plus unlocks everything while it lasts, so the UI can show "included
      // with Plus" rather than a price the user does not need to pay.
      unlockedByPlus: !ownedIds.has(i.id) && plus.active,
      usable: ownedIds.has(i.id) || plus.active,
    })),
  };
}

/** Buys one item, permanently, from the wallet. */
async function buyItem(userId, itemId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: itemRows } = await client.query(
      'SELECT * FROM shop_items WHERE id=$1 AND is_active=true', [itemId]);
    const item = itemRows[0];
    if (!item) {
      throw Object.assign(new Error('این آیتم موجود نیست'), { status: 404 });
    }

    // Lock the user row before reading the balance, or two taps could both
    // pass the affordability check.
    await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [userId]);

    const { rows: already } = await client.query(
      'SELECT 1 FROM user_shop_items WHERE user_id=$1 AND item_id=$2',
      [userId, itemId]);
    if (already[0]) {
      throw Object.assign(new Error('این آیتم را قبلاً خریده‌ای'), { status: 409 });
    }

    // Record the purchase first so ITS id can be the payment's idempotency
    // key. Using the item id here was a real bug: uq_wallet_tx_reference is
    // UNIQUE (source, reference_id) with no user column, so keying on the
    // product meant only the first buyer of each item could ever pay — every
    // subsequent purchase failed with a duplicate-key 500.
    const { rows: purchase } = await client.query(
      `INSERT INTO user_shop_items(user_id, item_id, price_paid)
       VALUES($1,$2,$3) RETURNING purchase_id`,
      [userId, itemId, item.price]);

    if (item.price > 0) {
      await walletService.debit(client, {
        userId,
        amount: item.price,
        source: 'shop',
        referenceType: 'shop_item',
        referenceId: purchase[0].purchase_id,
        description: `خرید آیتم: ${item.name}`,
      });
    }

    await client.query('COMMIT');
    return { message: `«${item.name}» خریداری شد`, item: item.slug };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

/** Buys or extends Plus for 30 days. */
async function buyPlus(userId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [userId]);

    // Extend from the current expiry, not from now — a user who renews early
    // must not lose the days they already paid for.
    const { rows: cur } = await client.query(
      `SELECT expires_at FROM user_subscriptions
        WHERE user_id=$1 AND plan='plus' AND expires_at > NOW()
        ORDER BY expires_at DESC LIMIT 1`,
      [userId]);
    const from = cur[0] ? new Date(cur[0].expires_at) : new Date();
    const until = new Date(from.getTime() + PLUS_DAYS * 86400000);

    const { rows: sub } = await client.query(
      `INSERT INTO user_subscriptions(user_id, plan, price_paid, starts_at, expires_at)
       VALUES($1,'plus',$2,NOW(),$3) RETURNING id, expires_at`,
      [userId, PLUS_PRICE, until]);

    await walletService.debit(client, {
      userId,
      amount: PLUS_PRICE,
      source: 'subscription',
      referenceType: 'subscription',
      referenceId: sub[0].id,
      description: 'اشتراک قلقلی پلاس (۳۰ روز)',
    });

    await client.query('COMMIT');
    return {
      message: 'اشتراک قلقلی پلاس فعال شد',
      expiresAt: sub[0].expires_at,
    };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

const SLOTS = {
  club_badge: 'equipped_club',
  card_frame: 'equipped_frame',
  name_color: 'equipped_color',
};

/**
 * Equips (or clears) an item.
 *
 * Allowed if the user owns it OR Plus is active — that is the whole point of
 * the subscription: change your look daily for a month.
 */
async function equip(userId, slug) {
  if (!slug) {
    // Clearing is always allowed, whatever the subscription state.
    await pool.query(
      `UPDATE users SET equipped_club=NULL, equipped_frame=NULL,
                        equipped_color=NULL, updated_at=NOW() WHERE id=$1`,
      [userId]);
    return { message: 'همهٔ آیتم‌ها برداشته شد' };
  }

  const { rows } = await pool.query(
    'SELECT * FROM shop_items WHERE slug=$1 AND is_active=true', [slug]);
  const item = rows[0];
  if (!item) {
    throw Object.assign(new Error('آیتم پیدا نشد'), { status: 404 });
  }

  const { rows: owned } = await pool.query(
    'SELECT 1 FROM user_shop_items WHERE user_id=$1 AND item_id=$2',
    [userId, item.id]);
  const plus = await plusStatus(userId);

  if (!owned[0] && !plus.active) {
    throw Object.assign(
      new Error('اول باید این آیتم را بخری یا اشتراک پلاس بگیری'),
      { status: 403 });
  }

  const column = SLOTS[item.kind];
  if (!column) {
    throw Object.assign(new Error('این آیتم قابل انتخاب نیست'), { status: 400 });
  }

  await pool.query(
    `UPDATE users SET ${column}=$2, updated_at=NOW() WHERE id=$1`,
    [userId, item.payload || item.slug]);
  return { message: `«${item.name}» انتخاب شد` };
}

/**
 * Cosmetics for a set of users, for the chat/league/profile views.
 *
 * An equipped item stops rendering the moment Plus lapses unless the user
 * bought it, so this resolves ownership rather than trusting the column.
 */
async function cosmeticsFor(userIds) {
  if (!userIds?.length) return new Map();
  const { rows } = await pool.query(
    `SELECT u.id,
            u.equipped_club, u.equipped_frame, u.equipped_color,
            EXISTS (SELECT 1 FROM user_subscriptions s
                     WHERE s.user_id = u.id AND s.plan='plus'
                       AND s.expires_at > NOW()) AS has_plus,
            ARRAY(SELECT i.payload FROM user_shop_items usi
                    JOIN shop_items i ON i.id = usi.item_id
                   WHERE usi.user_id = u.id) AS owned_payloads
       FROM users u WHERE u.id = ANY($1)`,
    [userIds]);

  const out = new Map();
  for (const r of rows) {
    const owned = new Set(r.owned_payloads || []);
    const can = v => !!v && (r.has_plus || owned.has(v));
    out.set(r.id, {
      club: can(r.equipped_club) ? r.equipped_club : null,
      frame: can(r.equipped_frame) ? r.equipped_frame : null,
      color: can(r.equipped_color) ? r.equipped_color : null,
      plus: r.has_plus,
    });
  }
  return out;
}

module.exports = {
  catalogue, buyItem, buyPlus, equip, plusStatus, cosmeticsFor,
  PLUS_PRICE, PLUS_DAYS,
};
