// Reward groups.
//
// MODEL — one spendable wallet of points.
//
//     current_points         spendable. Every group's bar measures THIS.
//                            Claiming subtracts from it, so all bars move
//                            back together.
//     lifetime_points        permanent history, never decreases.
//     monthly_league_points  this month's ranking. Reset at season close,
//                            NEVER touched by a reward claim.
//
// An earlier version gave each group its own `baseline` against
// lifetime_points. That was wrong: spending in group A only advanced A's
// baseline, so group B still saw the full lifetime total. Reproduced against
// production — a user with 110 points claimed a 100-point reward and then
// immediately claimed a second 100-point reward in another group with 10
// points to their name. With N groups you got N prizes for the price of one.
//
// One balance makes that impossible by construction.
//
// A tier may additionally require specific CARDS. Those are checked against
// the user's un-consumed inventory and consumed on claim.
const { pool } = require('../config/db');
const walletService = require('./walletService');

const GROUP_TYPES = ['cash', 'physical', 'mixed'];
const REWARD_TYPES = ['cash', 'physical'];

/** All active groups with their tiers and each tier's card requirements. */
async function listGroups({ includeInactive = false } = {}) {
  const { rows: groups } = await pool.query(
    `SELECT * FROM reward_groups
      ${includeInactive ? '' : 'WHERE is_active = true'}
      ORDER BY display_order, created_at`
  );

  const { rows: tiers } = await pool.query(
    `SELECT t.*,
            COALESCE(
              json_agg(
                json_build_object(
                  'cardTypeId', c.card_type_id,
                  'quantity',   c.quantity,
                  'name',       ct.name,
                  'imageUrl',   ct.image_url
                ) ORDER BY ct.name
              ) FILTER (WHERE c.card_type_id IS NOT NULL),
              '[]'
            ) AS required_cards
       FROM reward_tiers t
       LEFT JOIN reward_tier_cards c ON c.reward_tier_id = t.id
       LEFT JOIN card_types ct       ON ct.id = c.card_type_id
      ${includeInactive ? '' : 'WHERE t.is_active = true'}
      GROUP BY t.id
      ORDER BY t.display_order, t.required_points`
  );

  const byGroup = new Map(groups.map(g => [g.id, { ...g, tiers: [] }]));
  const ungrouped = [];
  for (const t of tiers) {
    const bucket = t.group_id && byGroup.get(t.group_id);
    if (bucket) bucket.tiers.push(t);
    else ungrouped.push(t);
  }

  const result = [...byGroup.values()];
  // Tiers an admin has not filed yet must stay visible rather than vanish
  // from the catalogue the moment groups are introduced.
  if (ungrouped.length) {
    result.push({
      id: null,
      name: 'بدون گروه',
      description: 'جوایزی که هنوز در گروهی قرار نگرفته‌اند',
      group_type: 'mixed',
      accent: 'slate',
      display_order: 9999,
      is_active: true,
      tiers: ungrouped,
    });
  }
  return result;
}

/**
 * The user-facing view: every group with its progress, the next tier to aim
 * for, and which of that tier's cards the user already holds.
 */
async function userView(userId) {
  const groups = await listGroups();

  const [{ rows: userRows }, { rows: baselines }, { rows: inventory }] =
    await Promise.all([
      pool.query(
        'SELECT lifetime_points, current_points, monthly_league_points FROM users WHERE id=$1',
        [userId]),
      pool.query(
        'SELECT group_id, claims_count FROM user_group_progress WHERE user_id=$1',
        [userId]),
      pool.query(
        `SELECT card_type_id, SUM(quantity)::int AS qty
           FROM user_card_inventory
          WHERE user_id=$1 AND consumed_in_reward=false
          GROUP BY card_type_id`,
        [userId]),
    ]);

  // How many times this user has already taken each tier, for the per-tier
  // limit an admin can set.
  const { rows: claimCounts } = await pool.query(
    'SELECT reward_tier_id, COUNT(*)::int AS n FROM user_reward_claims WHERE user_id=$1 GROUP BY reward_tier_id',
    [userId]);
  const claimed = new Map(claimCounts.map(c => [c.reward_tier_id, c.n]));

  const lifetime = Number(userRows[0]?.lifetime_points || 0);
  // The spendable balance. Every bar measures this, so spending anywhere
  // moves every bar.
  const current = Number(userRows[0]?.current_points || 0);
  const leaguePoints = Number(userRows[0]?.monthly_league_points || 0);
  const history = new Map(baselines.map(b => [b.group_id, b]));
  const held = new Map(inventory.map(i => [i.card_type_id, i.qty]));

  return {
    currentPoints: current,
    lifetimePoints: lifetime,
    leaguePoints,
    groups: groups.map(g => {
      const b = g.id ? history.get(g.id) : null;
      // Every group measures the same spendable balance.
      const earned = current;

      const tiers = g.tiers.map(t => {
        const cards = (t.required_cards || []).map(c => ({
          ...c,
          have: held.get(c.cardTypeId) || 0,
          met: (held.get(c.cardTypeId) || 0) >= c.quantity,
        }));
        const pointsMet = earned >= t.required_points;
        const cardsMet = cards.every(c => c.met);
        const limit = Number(t.max_claims_per_user || 0);
        const taken = claimed.get(t.id) || 0;
        // 0 means unlimited — the default, so existing tiers are unchanged.
        const limitReached = limit > 0 && taken >= limit;
        return {
          id: t.id,
          name: t.name,
          description: t.description,
          imageUrl: t.image_url,
          requiredPoints: t.required_points,
          rewardType: t.reward_type,
          rewardValue: t.reward_value,
          cashAmount: Number(t.cash_amount || 0),
          requiredCards: cards,
          progress: t.required_points > 0
            ? Math.min(1, earned / t.required_points) : 1,
          pointsMet,
          cardsMet,
          maxClaims: limit,
          timesClaimed: taken,
          limitReached,
          eligible: pointsMet && cardsMet && !limitReached,
        };
      });

      // The bar tracks the cheapest tier the user has not yet reached; once
      // everything is affordable it tracks the most expensive one so the bar
      // reads "full" rather than snapping back to empty.
      const next = tiers.find(t => !t.pointsMet) || tiers[tiers.length - 1];

      // CARD-GATED GROUPS.
      //
      // Points keep accruing globally — a card-gated group must never stop a
      // user earning. But its BAR holds at full instead of reading "ready",
      // because the prize genuinely is not claimable until the cards are in
      // hand. Showing a finished bar next to a dead button would look broken.
      const blockedByCards = !!next && next.pointsMet && !next.cardsMet;

      return {
        id: g.id,
        name: g.name,
        description: g.description,
        imageUrl: g.image_url,
        groupType: g.group_type,
        accent: g.accent,
        earnedPoints: earned,
        claimsCount: Number(b?.claims_count || 0),
        nextTier: next || null,
        progress: next && next.requiredPoints > 0
          ? Math.min(1, earned / next.requiredPoints) : 0,
        // The UI uses this to say "کارت‌های لازم را جمع کن" rather than
        // "آمادهٔ دریافت" on a tier the user cannot actually take.
        blockedByCards,
        missingCards: blockedByCards
          ? next.requiredCards.filter(c => !c.met)
          : [],
        tiers,
      };
    }),
  };
}

/**
 * Claims a tier.
 *
 * Everything happens in ONE transaction: points spent, cards consumed, cash
 * credited, group baseline advanced. A partial success here would either eat
 * the user's points without paying, or pay without charging.
 */
async function claim(userId, tierId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: tierRows } = await client.query(
      'SELECT * FROM reward_tiers WHERE id=$1 AND is_active=true', [tierId]);
    const tier = tierRows[0];
    if (!tier) {
      throw Object.assign(new Error('جایزه یافت نشد'), { status: 404 });
    }

    // Lock the user row: two devices claiming at once must not both pass the
    // affordability check against the same balance.
    const { rows: userRows } = await client.query(
      `SELECT lifetime_points, current_points, monthly_league_points
         FROM users WHERE id=$1 FOR UPDATE`,
      [userId]);
    if (!userRows[0]) {
      throw Object.assign(new Error('کاربر پیدا نشد'), { status: 404 });
    }

    // ONE spendable balance, checked and spent here. Reading a per-group
    // baseline instead is what let a user claim in every group after paying
    // only once.
    const spendable = Number(userRows[0].current_points);
    const groupId = tier.group_id;

    if (spendable < tier.required_points) {
      throw Object.assign(
        new Error(
          `امتیاز کافی نداری — ${tier.required_points} امتیاز لازم است و ` +
          `${spendable} امتیاز داری`),
        { status: 400 });
    }

    if (groupId) {
      await client.query(
        `INSERT INTO user_group_progress(user_id, group_id) VALUES($1,$2)
         ON CONFLICT (user_id, group_id) DO UPDATE SET updated_at = NOW()`,
        [userId, groupId]);
    }
    const earned = spendable;

    // Per-tier limit. Without this a user with banked points could take the
    // same prize over and over in one sitting — each claim individually valid
    // but collectively absurd. 0 = unlimited.
    const limit = Number(tier.max_claims_per_user || 0);
    if (limit > 0) {
      const { rows: cnt } = await client.query(
        'SELECT COUNT(*)::int AS n FROM user_reward_claims WHERE user_id=$1 AND reward_tier_id=$2',
        [userId, tierId]);
      if (Number(cnt[0].n) >= limit) {
        throw Object.assign(
          new Error(`این جایزه حداکثر ${limit} بار قابل دریافت است`),
          { status: 400 });
      }
    }

    // Card requirements, checked against un-consumed inventory.
    const { rows: required } = await client.query(
      'SELECT card_type_id, quantity FROM reward_tier_cards WHERE reward_tier_id=$1',
      [tierId]);
    for (const rq of required) {
      const { rows: have } = await client.query(
        `SELECT COALESCE(SUM(quantity),0)::int AS qty
           FROM user_card_inventory
          WHERE user_id=$1 AND card_type_id=$2 AND consumed_in_reward=false`,
        [userId, rq.card_type_id]);
      if (Number(have[0].qty) < rq.quantity) {
        const { rows: ct } = await client.query(
          'SELECT name FROM card_types WHERE id=$1', [rq.card_type_id]);
        throw Object.assign(
          new Error(`کارت «${ct[0]?.name || '؟'}» به تعداد کافی نداری`),
          { status: 400 });
      }
    }

    const cashAmount = Number(tier.cash_amount || 0);
    const isCash = tier.reward_type === 'cash' && cashAmount > 0;

    const { rows: claimRows } = await client.query(
      `INSERT INTO user_reward_claims
         (user_id, reward_tier_id, group_id, points_at_claim, status,
          reward_name, reward_image, reward_type, cash_amount)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [
        userId, tierId, groupId, earned,
        // Cash is credited immediately and needs no human step. A physical
        // prize still needs an admin to post it, so it stays pending.
        isCash ? 'paid' : 'pending',
        tier.name, tier.image_url, tier.reward_type, cashAmount,
      ]);
    const claimRow = claimRows[0];

    if (isCash) {
      await walletService.credit(client, {
        userId,
        amount: cashAmount,
        source: 'reward',
        referenceType: 'reward_claim',
        // Idempotency key: a retried request cannot double-credit.
        referenceId: claimRow.id,
        description: `جایزهٔ نقدی: ${tier.name}`,
      });
      await client.query(
        'UPDATE user_reward_claims SET paid_at=NOW() WHERE id=$1',
        [claimRow.id]);
    }

    // Consume exactly the cards the tier asked for. Tiers with no card
    // requirement must NOT wipe the whole inventory — the old code did
    // exactly that.
    for (const rq of required) {
      let remaining = rq.quantity;
      const { rows: lots } = await client.query(
        `SELECT id, quantity FROM user_card_inventory
          WHERE user_id=$1 AND card_type_id=$2 AND consumed_in_reward=false
          ORDER BY updated_at ASC FOR UPDATE`,
        [userId, rq.card_type_id]);
      for (const lot of lots) {
        if (remaining <= 0) break;
        const take = Math.min(remaining, lot.quantity);
        if (take === lot.quantity) {
          await client.query(
            'UPDATE user_card_inventory SET consumed_in_reward=true, updated_at=NOW() WHERE id=$1',
            [lot.id]);
        } else {
          await client.query(
            'UPDATE user_card_inventory SET quantity=quantity-$2, updated_at=NOW() WHERE id=$1',
            [lot.id, take]);
        }
        remaining -= take;
      }
    }

    // SPEND. This is the only place points leave the wallet.
    //
    // Deliberately touches ONLY current_points:
    //   * lifetime_points is permanent history — a user who has earned
    //     1,000,000 points over a year should still show that after
    //     spending them.
    //   * monthly_league_points decides this month's ranking. Spending a
    //     reward must not cost the user their league position, or claiming
    //     anything mid-month would be a self-inflicted penalty.
    await client.query(
      `UPDATE users
          SET current_points = GREATEST(0, current_points - $2),
              updated_at = NOW()
        WHERE id = $1`,
      [userId, tier.required_points]);

    if (groupId) {
      // History only — the bar itself now reads current_points.
      await client.query(
        `UPDATE user_group_progress
            SET claims_count = claims_count + 1,
                last_claim_at = NOW(),
                updated_at = NOW()
          WHERE user_id=$1 AND group_id=$2`,
        [userId, groupId]);
    }

    await client.query('COMMIT');
    return {
      message: isCash
        ? `جایزهٔ نقدی به کیف پولت اضافه شد`
        : 'درخواست جایزه ثبت شد و پس از تایید ارسال می‌شود',
      claim: claimRow,
      credited: isCash ? cashAmount : 0,
    };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

/** Physical prizes a user has won — the trophy shelf on their profile. */
async function trophies(userId) {
  const { rows } = await pool.query(
    `SELECT id, reward_name AS name, reward_image AS image_url,
            status, claimed_at, cash_amount, reward_type
       FROM user_reward_claims
      WHERE user_id=$1 AND reward_type='physical'
      ORDER BY claimed_at DESC`,
    [userId]);
  return rows;
}

module.exports = {
  listGroups,
  userView,
  claim,
  trophies,
  GROUP_TYPES,
  REWARD_TYPES,
};
