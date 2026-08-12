-- Post-deploy per-card verification found one additional front-only design
-- whose OCR array was empty. The source image visibly contains EMIRATES,
-- FLY BETTER, PREMIUM CARD and the 500 point value. Store only those printed
-- tokens; the player's name is not printed, so BELLINGHAM is deliberately not
-- invented. Never overwrite a future successful analyzer result.
UPDATE photo_card_designs
   SET text_tokens=ARRAY['EMIRATES','BETTER','PREMIUM','CARD','#500']::text[]
 WHERE image_url='/uploads/images/1786522757805-omfloa4o66.webp'
   AND cardinality(COALESCE(text_tokens,'{}'::text[]))=0;
