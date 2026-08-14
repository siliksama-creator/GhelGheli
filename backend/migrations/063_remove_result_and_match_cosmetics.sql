-- Remove card-game entry/finish effects and share-result templates.
--
-- These catalogue categories did not change play or clarify decisions. They
-- added visual noise exactly where the duel needs an unambiguous intro and
-- result. Remove ownership before items (FK), clear legacy equip slots, and
-- close the authoritative kind constraint. The two nullable legacy columns
-- stay physically present for zero-downtime rollback compatibility, but no
-- current runtime reads or writes them.
BEGIN;

UPDATE users
   SET equipped_result_template = NULL,
       equipped_match_effect = NULL
 WHERE equipped_result_template IS NOT NULL
    OR equipped_match_effect IS NOT NULL;

DELETE FROM user_shop_items ownership
 USING shop_items item
 WHERE ownership.item_id = item.id
   AND item.kind IN ('result_template', 'match_effect');

DELETE FROM shop_items
 WHERE kind IN ('result_template', 'match_effect');

ALTER TABLE shop_items
  DROP CONSTRAINT IF EXISTS shop_items_kind_check;
ALTER TABLE shop_items
  ADD CONSTRAINT shop_items_kind_check CHECK (kind IN (
    'club_badge', 'card_frame', 'name_color', 'profile_background',
    'emote_pack', 'profile_badge'
  ));

COMMIT;
