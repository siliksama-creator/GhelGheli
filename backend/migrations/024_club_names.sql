-- Club names must be club names, not item names.
--
-- The five Iranian clubs were seeded as "نشان استقلال" ("Esteghlal badge")
-- back when the shop sold decoration. Now that a badge means membership, the
-- same string is also the club's name everywhere: the roster header, the
-- club grid, the "you joined X" message and the profile-picture prompt. The
-- eleven world clubs were seeded with plain names, so the league tab listed
-- "نشان پرسپولیس" next to "رئال مادرید" — one reading as a product, the
-- other as a team.
--
-- Strip the prefix. The word "نشان" still appears in the section heading and
-- the item description, where it is describing the thing being sold.
UPDATE shop_items
   SET name = regexp_replace(name, '^نشان ', '')
 WHERE kind = 'club_badge' AND name LIKE 'نشان %';
