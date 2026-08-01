-- Club membership: the badge you buy is also the club you join.
--
-- WHAT CHANGED AND WHY
--
-- 1. The five fabricated crests were replaced with the real artwork the owner
--    supplied, and eleven world clubs were added. Slugs for the Iranian five
--    are unchanged so the three users who already own a badge keep it.
--
-- 2. Buying a badge now MEANS something: you become a member of that club and
--    appear in the club roster on the league page. Previously it was a
--    decoration with no consequence.
--
-- 3. Plus lets you join as many clubs as you like. When Plus lapses you keep
--    every club you PAID for outright, plus the single most recent one you
--    joined on the subscription — the owner's rule, so a lapsed subscriber is
--    never left with nothing.
--
-- 4. Prices went up because a one-off purchase is permanent. See the note on
--    the price block below.

-- ── membership ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_clubs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  club_slug  VARCHAR(64) NOT NULL,
  -- 'purchase' survives a lapse forever. 'plus' survives only if it is the
  -- newest row for that user.
  source     VARCHAR(16) NOT NULL CHECK (source IN ('purchase', 'plus')),
  joined_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, club_slug)
);

CREATE INDEX IF NOT EXISTS idx_user_clubs_slug ON user_clubs(club_slug);
CREATE INDEX IF NOT EXISTS idx_user_clubs_user ON user_clubs(user_id, joined_at DESC);

-- Effective membership: what is true RIGHT NOW, without waiting for a nightly
-- job. The cleanup cron deletes the dead rows later; this view means the
-- roster, the badge and the profile picture are never wrong in between.
--
-- A row counts if:
--   * it was bought outright, or
--   * the user's Plus is still active, or
--   * it is the single most recently joined row for that user (the grace
--     club a lapsed subscriber keeps).
CREATE OR REPLACE VIEW effective_club_memberships AS
SELECT uc.id, uc.user_id, uc.club_slug, uc.source, uc.joined_at
  FROM user_clubs uc
 WHERE uc.source = 'purchase'
    OR EXISTS (SELECT 1 FROM user_subscriptions s
                WHERE s.user_id = uc.user_id
                  AND s.plan = 'plus'
                  AND s.expires_at > NOW())
    OR uc.id = (SELECT x.id FROM user_clubs x
                 WHERE x.user_id = uc.user_id
                 ORDER BY x.joined_at DESC, x.id LIMIT 1);

-- ── backfill: today's equipped badges become memberships ──────────────────
-- Five users already equipped a badge before clubs existed. They paid for it,
-- so they join as owners rather than losing anything.
INSERT INTO user_clubs (user_id, club_slug, source, joined_at)
SELECT u.id, u.equipped_club,
       CASE WHEN EXISTS (
              SELECT 1 FROM user_shop_items usi
                JOIN shop_items i ON i.id = usi.item_id
               WHERE usi.user_id = u.id AND i.payload = u.equipped_club)
            THEN 'purchase' ELSE 'plus' END,
       COALESCE(u.updated_at, NOW())
  FROM users u
 WHERE u.equipped_club IS NOT NULL
ON CONFLICT (user_id, club_slug) DO NOTHING;

-- ── catalogue ─────────────────────────────────────────────────────────────
-- PRICING. Plus is 99,000 for 30 days and unlocks everything. A single item
-- is permanent, so it has to cost enough that Plus still looks like the
-- better deal for someone who wants variety, while staying reachable for
-- someone who only ever wants their own club. Half a month of Plus for a
-- badge you keep forever is that balance:
--
--   badge  49,000  = permanent + club membership + usable as profile picture
--   frame  39,000  (holo 59,000 — animated, costs more to justify)
--   colour 29,000  (rainbow 49,000)
--
-- The old prices (29/19/9k) were set when items were pure decoration and
-- before badges carried membership. They also undercut Plus so badly that
-- buying three items outright cost less than one month of Plus, which made
-- the subscription pointless.
UPDATE shop_items SET price = 49000 WHERE kind = 'club_badge';
UPDATE shop_items SET price = 39000 WHERE kind = 'card_frame' AND payload <> 'holo';
UPDATE shop_items SET price = 59000 WHERE kind = 'card_frame' AND payload = 'holo';
UPDATE shop_items SET price = 29000 WHERE kind = 'name_color' AND payload <> 'rainbow';
UPDATE shop_items SET price = 49000 WHERE kind = 'name_color' AND payload = 'rainbow';

-- Refresh the descriptions: a badge is no longer just a picture.
UPDATE shop_items
   SET description = 'عضویت دائمی در باشگاه + نشان کنار اسم + قابل استفاده به‌عنوان عکس پروفایل'
 WHERE kind = 'club_badge';

-- The eleven new clubs. display_order keeps the Iranian clubs first.
INSERT INTO shop_items (slug, kind, name, description, image_url, payload, price, display_order) VALUES
  ('club_real_madrid', 'club_badge', 'رئال مادرید',    'عضویت دائمی در باشگاه + نشان کنار اسم + قابل استفاده به‌عنوان عکس پروفایل', '/shop/club_real_madrid.webp', 'real_madrid', 49000, 6),
  ('club_barcelona',   'club_badge', 'بارسلونا',       'عضویت دائمی در باشگاه + نشان کنار اسم + قابل استفاده به‌عنوان عکس پروفایل', '/shop/club_barcelona.webp',   'barcelona',   49000, 7),
  ('club_man_united',  'club_badge', 'منچستر یونایتد', 'عضویت دائمی در باشگاه + نشان کنار اسم + قابل استفاده به‌عنوان عکس پروفایل', '/shop/club_man_united.webp',  'man_united',  49000, 8),
  ('club_man_city',    'club_badge', 'منچستر سیتی',    'عضویت دائمی در باشگاه + نشان کنار اسم + قابل استفاده به‌عنوان عکس پروفایل', '/shop/club_man_city.webp',    'man_city',    49000, 9),
  ('club_liverpool',   'club_badge', 'لیورپول',        'عضویت دائمی در باشگاه + نشان کنار اسم + قابل استفاده به‌عنوان عکس پروفایل', '/shop/club_liverpool.webp',   'liverpool',   49000, 10),
  ('club_arsenal',     'club_badge', 'آرسنال',         'عضویت دائمی در باشگاه + نشان کنار اسم + قابل استفاده به‌عنوان عکس پروفایل', '/shop/club_arsenal.webp',     'arsenal',     49000, 11),
  ('club_bayern',      'club_badge', 'بایرن مونیخ',    'عضویت دائمی در باشگاه + نشان کنار اسم + قابل استفاده به‌عنوان عکس پروفایل', '/shop/club_bayern.webp',      'bayern',      49000, 12),
  ('club_juventus',    'club_badge', 'یوونتوس',        'عضویت دائمی در باشگاه + نشان کنار اسم + قابل استفاده به‌عنوان عکس پروفایل', '/shop/club_juventus.webp',    'juventus',    49000, 13),
  ('club_psg',         'club_badge', 'پاری سن‌ژرمن',   'عضویت دائمی در باشگاه + نشان کنار اسم + قابل استفاده به‌عنوان عکس پروفایل', '/shop/club_psg.webp',         'psg',         49000, 14),
  ('club_inter_miami', 'club_badge', 'اینتر میامی',    'عضویت دائمی در باشگاه + نشان کنار اسم + قابل استفاده به‌عنوان عکس پروفایل', '/shop/club_inter_miami.webp', 'inter_miami', 49000, 15),
  ('club_alnasr',      'club_badge', 'النصر',          'عضویت دائمی در باشگاه + نشان کنار اسم + قابل استفاده به‌عنوان عکس پروفایل', '/shop/club_alnasr.webp',      'alnasr',      49000, 16)
ON CONFLICT (slug) DO NOTHING;

-- The Iranian five kept their slugs but the artwork was redrawn, so point
-- image_url at the new files (identical paths, but be explicit in case an
-- earlier deploy stored something else).
UPDATE shop_items SET image_url = '/shop/' || slug || '.webp' WHERE kind = 'club_badge';
