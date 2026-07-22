-- Make card codes case-insensitive and normalize stored values.
-- If old data contains duplicates that differ only by letter case, migration stops so admin can resolve them safely.
CREATE EXTENSION IF NOT EXISTS citext;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT lower(trim(code::text)) AS normalized_code, count(*) AS cnt
      FROM card_codes
      GROUP BY lower(trim(code::text))
      HAVING count(*) > 1
    ) dup
  ) THEN
    RAISE EXCEPTION 'Cannot normalize card_codes: duplicate codes exist when ignoring letter case';
  END IF;
END $$;

UPDATE card_codes SET code = upper(trim(code::text));
ALTER TABLE card_codes ALTER COLUMN code TYPE CITEXT USING upper(trim(code::text))::CITEXT;
