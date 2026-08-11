// Club membership.
//
// Buying a club badge does three things at once:
//   1. you own the badge permanently,
//   2. you become a MEMBER of that club and appear in its roster,
//   3. you may set the crest as your profile picture.
//
// Plus lets you join as many clubs as you like. When Plus lapses you keep
// every club you paid for outright plus the single most recently joined one —
// so a lapsed subscriber always has exactly one club, never zero.
//
// That "who is still a member" rule lives in the SQL view
// effective_club_memberships (023_clubs.sql) rather than here, because the
// roster, the badge renderer and the profile picture all need the same answer
// at the same instant. A nightly cleanup job would leave windows where the
// three disagreed.
const { pool } = require('../config/db');

/** The catalogue of clubs, derived from the shop so there is one source. */
async function clubCatalogue(client = pool) {
  const { rows } = await client.query(
    `SELECT payload AS slug, name, image_url
       FROM shop_items
      WHERE kind = 'club_badge' AND is_active = true
      ORDER BY display_order, name`);
  return rows.map(r => ({ slug: r.slug, name: r.name, imageUrl: r.image_url }));
}

/**
 * Joins a club. Called from the shop when a badge is bought, and directly
 * when a Plus member picks an extra club.
 *
 * `source` decides what survives a lapse: 'purchase' always does.
 */
async function join(client, userId, clubSlug, source) {
  await client.query(
    `INSERT INTO user_clubs(user_id, club_slug, source)
     VALUES ($1,$2,$3)
     ON CONFLICT (user_id, club_slug) DO UPDATE
       -- Re-joining a club you already hold on Plus by BUYING it upgrades the
       -- row, so it stops being revocable. Never downgrade the other way.
       SET source = CASE WHEN user_clubs.source = 'purchase'
                         THEN 'purchase' ELSE EXCLUDED.source END,
           joined_at = NOW()`,
    [userId, clubSlug, source]);
}

/** Every club this user is currently a member of. */
async function myClubs(userId, client = pool) {
  const { rows } = await client.query(
    `SELECT m.club_slug, m.source, m.joined_at,
            i.name, i.image_url
       FROM effective_club_memberships m
       LEFT JOIN shop_items i
              ON i.payload = m.club_slug AND i.kind = 'club_badge'
      WHERE m.user_id = $1
      ORDER BY m.joined_at DESC`,
    [userId]);
  return rows.map(r => ({
    slug: r.club_slug,
    name: r.name || r.club_slug,
    imageUrl: r.image_url,
    // 'purchase' is permanent; 'plus' is only kept while the subscription
    // lives, except for the newest one. The UI uses this to warn honestly.
    permanent: r.source === 'purchase',
    joinedAt: r.joined_at,
  }));
}

/** True if the user may render this crest (badge / profile picture). */
async function isMember(userId, clubSlug, client = pool) {
  if (!clubSlug) return false;
  const { rows } = await client.query(
    'SELECT 1 FROM effective_club_memberships WHERE user_id=$1 AND club_slug=$2',
    [userId, clubSlug]);
  return !!rows[0];
}

/**
 * Every club with its member count, for the league page's club tab.
 *
 * Clubs with no members are still listed: an empty roster is information, and
 * hiding them would make the tab look broken right after launch.
 */
async function rosterSummary() {
  const { rows } = await pool.query(
    `SELECT i.payload AS slug, i.name, i.image_url, i.display_order,
            COUNT(m.user_id)::int AS member_count
       FROM shop_items i
       LEFT JOIN effective_club_memberships m ON m.club_slug = i.payload
      WHERE i.kind = 'club_badge' AND i.is_active = true
      GROUP BY i.payload, i.name, i.image_url, i.display_order
      ORDER BY COUNT(m.user_id) DESC, i.display_order`);
  return rows.map(r => ({
    slug: r.slug, name: r.name, imageUrl: r.image_url,
    memberCount: r.member_count,
  }));
}

/**
 * The members of one club, ranked by this month's league points so the tab
 * doubles as a per-club leaderboard.
 */
async function members(clubSlug, limit = 200) {
  const { rows } = await pool.query(
    `SELECT u.id, u.nickname, u.first_name,
            u.profile_image_url, u.profile_avatar_key,
            u.monthly_league_points, u.lifetime_points,
            m.joined_at
       FROM effective_club_memberships m
       JOIN users u ON u.id = m.user_id
      WHERE m.club_slug = $1 AND u.status = 'active'
      ORDER BY u.monthly_league_points DESC, u.lifetime_points DESC
      LIMIT $2`,
    [clubSlug, Math.min(Number(limit) || 200, 500)]);

  // ستارهٔ پلاس و بقیهٔ ظاهرها.
  //
  // فهرست اعضای باشگاه تنها جای پرمخاطبی بود که نامِ کاربر را **خام**
  // چاپ می‌کرد: چت و جدول لیگ هر دو cosmetics می‌فرستادند و ستاره را
  // نشان می‌دادند، ولی اینجا نه. یعنی کسی که بابت پلاس پول داده بود، در
  // باشگاه خودش هیچ نشانی نداشت — و دقیقاً همان‌جاست که هم‌تیمی‌هایش
  // او را می‌بینند. ستاره‌ای که دیده نشود، دلیلی برای خرید نیست.
  //
  // require داخل تابع: shopService خودش clubService را لازم دارد و
  // import بالادستی حلقهٔ وابستگی می‌سازد.
  const shop = require('./shopService');
  let cos = new Map();
  try {
    cos = await shop.cosmeticsFor(rows.map(r => r.id));
  } catch (e) {
    // ظاهر یک زینت است؛ نبودنش نباید فهرست اعضا را خالی کند.
    console.error('[clubs] cosmetics failed:', e.message);
  }

  return rows.map((r, i) => ({
    userId: r.id,
    rank: i + 1,
    nickname: r.nickname || r.first_name || 'کاربر',
    profileImageUrl: r.profile_image_url,
    profileAvatarKey: r.profile_avatar_key,
    monthlyPoints: Number(r.monthly_league_points || 0),
    lifetimePoints: Number(r.lifetime_points || 0),
    joinedAt: r.joined_at,
    cosmetics: cos.get(r.id) || null,
  }));
}

/**
 * Drops memberships a lapsed subscriber is no longer entitled to.
 *
 * Purely housekeeping — effective_club_memberships already hides these rows,
 * so behaviour does not depend on this running. It exists so the table does
 * not grow a tail of dead rows, and so the "keep the newest" grace club
 * becomes a real, permanent-looking row instead of a view artefact.
 */
async function reconcileLapsed() {
  const { rows } = await pool.query(
    `WITH lapsed AS (
       SELECT DISTINCT uc.user_id
         FROM user_clubs uc
        WHERE uc.source = 'plus'
          AND NOT EXISTS (SELECT 1 FROM user_subscriptions s
                           WHERE s.user_id = uc.user_id
                             AND s.plan IN ('plus','plus_annual') AND s.expires_at > NOW())
     ),
     keep AS (
       SELECT DISTINCT ON (uc.user_id) uc.id
         FROM user_clubs uc JOIN lapsed l ON l.user_id = uc.user_id
        ORDER BY uc.user_id, uc.joined_at DESC, uc.id
     )
     DELETE FROM user_clubs uc
      USING lapsed l
      WHERE uc.user_id = l.user_id
        AND uc.source = 'plus'
        AND uc.id NOT IN (SELECT id FROM keep)
      RETURNING uc.user_id, uc.club_slug`);

  // The surviving grace club becomes the user's permanent one in spirit but
  // NOT in source: marking it 'purchase' would mean a future Plus month could
  // never revoke it, and would silently gift an item they never bought.
  // Leaving it as 'plus' is correct — the view keeps it because it is newest.
  return rows.length;
}

/**
 * Clears an equipped badge / club profile picture the user has lost.
 *
 * Called after reconciliation and on login. Without it a lapsed subscriber
 * would keep seeing their old crest locally while everyone else saw it
 * disappear, which reads as a bug.
 */
async function clearOrphanedCosmetics() {
  const { rowCount } = await pool.query(
    `UPDATE users u SET equipped_club = NULL, updated_at = NOW()
      WHERE u.equipped_club IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM effective_club_memberships m
                         WHERE m.user_id = u.id
                           AND m.club_slug = u.equipped_club)`);

  // Same for a club crest used as the profile picture: fall back to the
  // avatar they had before rather than a broken image.
  const { rowCount: pics } = await pool.query(
    `UPDATE users u
        SET profile_avatar_key = 'avatar_1_football.png', updated_at = NOW()
      WHERE u.profile_avatar_key LIKE 'club:%'
        AND NOT EXISTS (SELECT 1 FROM effective_club_memberships m
                         WHERE m.user_id = u.id
                           AND 'club:' || m.club_slug = u.profile_avatar_key)`);

  return rowCount + pics;
}

module.exports = {
  clubCatalogue, join, myClubs, isMember,
  rosterSummary, members, reconcileLapsed, clearOrphanedCosmetics,
};
