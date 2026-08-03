-- Remove the five Iranian clubs from the platform entirely.
--
-- WHY: the owner asked for them to go. The eleven world clubs stay.
--
-- WHAT "ENTIRELY" HAS TO MEAN, or the app breaks in five separate places:
--
--   1. shop_items       — the row must go, or the shop still lists it.
--   2. user_shop_items  — cascades from (1) via the item_id FK. Ownership of
--                         a deleted product is meaningless and would strand
--                         `equip()`.
--   3. user_clubs       — memberships. NOT cascaded: the table stores a slug
--                         STRING, not an item id, so nothing links it to
--                         shop_items. Left behind, the league roster keeps
--                         showing the club and effective_club_memberships
--                         keeps returning rows whose shop_items JOIN is NULL
--                         (myClubs() then falls back to showing the raw slug
--                         "esteghlal" as the club's name).
--   4. users.equipped_club       — a dangling slug renders a broken crest
--                         beside every chat message that user writes.
--   5. users.profile_avatar_key  — 'club:<slug>' points at an asset file that
--                         is being deleted from the bundle, so it renders as
--                         a missing image everywhere this user appears.
--
-- ORDER MATTERS. (4) and (5) are cleared BEFORE the memberships, because the
-- nightly clearOrphanedCosmetics() decides what is orphaned by consulting
-- effective_club_memberships — once user_clubs is emptied it would eventually
-- fix these rows anyway, but only after up to 24 hours of showing a broken
-- crest. Doing it here makes the deploy atomic.
--
-- NO REFUND, per the owner's explicit instruction. The seven affected
-- memberships were paid for with in-app wallet balance that itself came from
-- rewards — there is no payment gateway yet, so no real money is involved.
--
-- NOTE ON TRANSACTIONS: scripts/migrate.js already wraps each file in
-- BEGIN/COMMIT, so this file must not open its own or the COMMIT would close
-- the runner's transaction early and the bookkeeping INSERT would land
-- outside it.

-- ── 4. equipped badge ─────────────────────────────────────────────────────
UPDATE users
   SET equipped_club = NULL, updated_at = NOW()
 WHERE equipped_club IN
       ('esteghlal', 'persepolis', 'sepahan', 'tractor', 'malavan');

-- ── 5. crest used as the profile picture ──────────────────────────────────
-- Fall back to the default illustration rather than NULL. avatarAsset()
-- treats NULL as "use avatarFiles.first" anyway, but writing the value
-- explicitly means the database matches what is rendered, which is what the
-- admin panel reads.
UPDATE users
   SET profile_avatar_key = 'avatar_1_football.png', updated_at = NOW()
 WHERE profile_avatar_key IN
       ('club:esteghlal', 'club:persepolis', 'club:sepahan',
        'club:tractor', 'club:malavan');

-- ── 3. memberships ────────────────────────────────────────────────────────
-- This can leave a Plus-sourced user with zero clubs where they previously
-- had one. That is correct: the "you always keep your newest club" promise
-- covers a LAPSING subscription, not a club that no longer exists. Such a
-- user ends up in the same state as someone who never bought a crest.
DELETE FROM user_clubs
 WHERE club_slug IN
       ('esteghlal', 'persepolis', 'sepahan', 'tractor', 'malavan');

-- ── 1 + 2. the shop rows (user_shop_items cascades) ───────────────────────
-- A hard DELETE rather than is_active = false. Deactivating leaves the rows
-- joinable, which is exactly how half-removed data survives: the shop list
-- filters on is_active, but `equip()` looks an item up by slug WITHOUT that
-- filter, so an old client could still re-equip a retired crest.
DELETE FROM shop_items
 WHERE kind = 'club_badge'
   AND payload IN
       ('esteghlal', 'persepolis', 'sepahan', 'tractor', 'malavan');

-- ── display order ─────────────────────────────────────────────────────────
-- The world clubs were seeded at 6..16 because the Iranian five held 1..5.
-- Close the gap so the grid's ordering no longer depends on deleted rows.
WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY display_order, name) AS n
    FROM shop_items
   WHERE kind = 'club_badge'
)
UPDATE shop_items s
   SET display_order = o.n
  FROM ordered o
 WHERE s.id = o.id;
