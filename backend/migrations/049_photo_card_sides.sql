-- Front and back are separate recognition samples of ONE card type.
--
-- photo_card_designs must stay one row per image because each side has an
-- independent fingerprint. The side marker is presentation/administration
-- metadata only: grouping and inventory identity remain card_type_id.

BEGIN;

ALTER TABLE photo_card_designs
  ADD COLUMN IF NOT EXISTS side TEXT;

-- Preserve existing data deterministically. The oldest image is treated as
-- the front, the second as the back, and any historical extra samples remain
-- alternate recognition views of the same card.
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY card_type_id
           ORDER BY created_at, id
         ) AS position
    FROM photo_card_designs
   WHERE side IS NULL
)
UPDATE photo_card_designs AS design
   SET side = CASE ranked.position
                WHEN 1 THEN 'front'
                WHEN 2 THEN 'back'
                ELSE 'alternate'
              END
  FROM ranked
 WHERE design.id = ranked.id;

ALTER TABLE photo_card_designs
  ALTER COLUMN side SET DEFAULT 'front',
  ALTER COLUMN side SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'photo_card_designs_side_check'
  ) THEN
    ALTER TABLE photo_card_designs
      ADD CONSTRAINT photo_card_designs_side_check
      CHECK (side IN ('front', 'back', 'alternate'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_photo_designs_card_side
  ON photo_card_designs(card_type_id, side, created_at);

COMMENT ON COLUMN photo_card_designs.side IS
  'Recognition sample side. Front/back/alternate images remain independent fingerprints of one card_type_id.';

COMMIT;
