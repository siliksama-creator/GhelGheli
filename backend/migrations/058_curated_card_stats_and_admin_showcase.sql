-- Curate the 29 production football cards. Image analysis correctly created
-- visual fingerprints, but player stats were still upload-form defaults (50)
-- and descriptions were empty. These values are game-design ratings based on
-- the named player's role and the physical card edition/rarity.
WITH curated(old_name,new_name,description,attack,defense,speed,technique,goal_chance,energy,rarity,effect) AS (
  VALUES
  ('Achraf Hakimi','Achraf Hakimi','مدافع کناری سرعتی؛ مناسب ضدحمله و بازگشت سریع',84,82,96,88,72,95,'premium','speedster'),
  ('Ousmane Dembélé','Ousmane Dembélé','وینگر دوپا با دریبل و شتاب انفجاری',91,42,97,95,88,90,'premium','speedster'),
  ('Erling Haaland','Erling Haaland','مهاجم قدرتی و تمام‌کننده مرگبار داخل محوطه',98,50,92,85,100,95,'premium','finisher'),
  ('Harry Kane','Harry Kane','مهاجم کامل با تمام‌کنندگی، پاس و تصمیم‌گیری ممتاز',96,58,78,93,98,92,'premium','finisher'),
  ('Kevin De Bruyne','Kevin De Bruyne','بازی‌ساز نخبه با پاس عمقی و شوت از راه دور',89,65,77,99,86,89,'premium','playmaker'),
  ('Lautaro Martínez','Lautaro Martínez','مهاجم جنگنده با پرس، تحرک و ضربه نهایی دقیق',93,70,87,89,95,96,'premium','finisher'),
  ('Mohamed Salah','Mohamed Salah','وینگر گلزن با شتاب، حرکت بدون توپ و ضربه چپ',95,54,94,92,96,93,'premium','speedster'),
  ('Emiliano Martínez','Emiliano Martínez','دروازه‌بان واکنشی و متخصص مهار موقعیت‌های حساس',30,98,58,79,10,94,'premium','wall'),
  ('Kylian Mbappé','Kylian Mbappé','مهاجم فوق‌سریع با نفوذ و تمام‌کنندگی سطح بالا',98,44,100,96,99,95,'premium','speedster'),
  ('Michael Olise','Michael Olise','وینگر خلاق با کنترل توپ و پاس نهایی دقیق',86,49,91,93,84,89,'premium','playmaker'),
  ('Rayan Cherki','Rayan Cherki','بازیکن تکنیکی و خلاق برای شکستن خطوط دفاعی',84,43,87,97,80,86,'premium','playmaker'),
  ('Rodrigo Hernández','Rodrigo Hernández','هافبک کنترل‌کننده با دفاع، حفظ توپ و مدیریت ریتم',80,99,70,97,75,96,'premium','wall'),
  ('Vinícius Júnior','Vinícius Júnior','وینگر برق‌آسا با دریبل یک‌به‌یک و نفوذ خطرناک',94,42,100,97,90,94,'premium','speedster'),
  ('Lamine Yamal','Lamine Yamal','وینگر خلاق با تکنیک، دید بازی و تصمیم‌گیری کم‌نظیر',92,44,96,98,88,92,'premium','playmaker'),
  ('Jude Bellingham N','Jude Bellingham · معمولی','نسخه معمولی هافبک همه‌کاره با تعادل در حمله و دفاع',68,65,67,72,65,78,'normal','playmaker'),
  ('Jude Bellingham','Jude Bellingham','نسخه پرمیوم هافبک کامل با نفوذ و رهبری بازی',92,89,88,95,90,97,'premium','playmaker'),
  ('Harry Kane s','Harry Kane · نقره‌ای','نسخه نقره‌ای مهاجم هدف و تمام‌کننده مطمئن',80,50,69,79,86,84,'silver','finisher'),
  ('Diego Maradona','Diego Maradona','لجند بازی‌ساز؛ تکنیک، خلاقیت و تمام‌کنندگی تاریخی',99,48,96,100,98,97,'legend','playmaker'),
  ('Manuel Neuer','Manuel Neuer','دروازه‌بان سوییپر با خروج، واکنش و بازی با پا',28,92,58,80,8,91,'silver','wall'),
  ('Ronaldinho','Ronaldinho','لجند تکنیکی با دریبل، خلاقیت و بازی‌سازی نمایشی',97,45,94,100,94,95,'legend','playmaker'),
  ('Pelé','Pelé','لجند کامل فوتبال با گلزنی، سرعت و تکنیک استثنایی',100,60,98,99,100,100,'legend','finisher'),
  ('Courtois','Thibaut Courtois · معمولی','نسخه معمولی دروازه‌بان بلندقد با پوشش عالی دروازه',25,78,45,62,7,80,'normal','wall'),
  ('Neymar Júnior','Neymar Júnior','کارت طلایی بازی‌ساز با دریبل، ظرافت و خلق موقعیت',93,44,93,99,89,91,'gold','playmaker'),
  ('Kylian Mbappé N','Kylian Mbappé · نقره‌ای','نسخه نقره‌ای مهاجم سرعتی و خطرناک در فضای باز',86,40,93,86,89,87,'silver','speedster'),
  ('Erling Haaland s','Erling Haaland · نقره‌ای','نسخه نقره‌ای مهاجم قدرتی با شانس گل بالا',87,45,81,76,93,89,'silver','finisher'),
  ('Daniel Carvajal','Dani Carvajal · نقره‌ای','مدافع راست پرتلاش با دفاع، تجربه و انرژی بالا',72,84,81,78,58,92,'silver','wall'),
  ('Raphinha','Raphinha · معمولی','نسخه معمولی وینگر سرعتی با حرکت و شوت مناسب',74,45,80,75,70,81,'normal','speedster'),
  ('Federico Valverde','Federico Valverde · معمولی','نسخه معمولی هافبک دونده و متعادل با انرژی زیاد',72,74,82,77,69,88,'normal','playmaker'),
  ('Mohamed Salah s','Mohamed Salah · نقره‌ای','نسخه نقره‌ای وینگر گلزن با سرعت و ضربه چپ',84,46,88,82,87,86,'silver','speedster')
)
UPDATE card_types c SET
  name=curated.new_name,
  description=curated.description,
  duel_attack=curated.attack,
  duel_defense=curated.defense,
  duel_speed=curated.speed,
  duel_technique=curated.technique,
  duel_goal_chance=curated.goal_chance,
  duel_energy=curated.energy,
  duel_rarity=curated.rarity,
  duel_effect=curated.effect,
  updated_at=NOW()
FROM curated WHERE c.name=curated.old_name;

-- Tesseract was re-run against every zero-token production design with the
-- same three-region pipeline and still returned []. Four fronts nevertheless
-- contain clearly legible Latin player names. Preserve a conservative manual
-- transcription of only text visibly printed on those genuine images; do not
-- invent a MARADONA token for the stylised D10S design, and never overwrite a
-- later successful analyzer run.
WITH verified_text(image_url,tokens) AS (
  VALUES
  ('/uploads/images/1786523822936-5cqsdrq8mgg.webp', ARRAY['ETERNO','PELE','PREMIUM','CARD','#2000']::text[]),
  ('/uploads/images/1786524334281-i7eubpznnmi.webp', ARRAY['HAALAND','PREMIUM','CARD','ETIHAD','#1000']::text[]),
  ('/uploads/images/1786524736317-5vbg5xlpc2y.webp', ARRAY['RAPHINHA','PREMIUM','CARD','#500']::text[]),
  ('/uploads/images/1786525003568-zsrsoztpim.webp', ARRAY['SALAH','PREMIUM','CARD','#1000']::text[])
)
UPDATE photo_card_designs d
   SET text_tokens=verified_text.tokens
  FROM verified_text
 WHERE d.image_url=verified_text.image_url
   AND cardinality(COALESCE(d.text_tokens,'{}'::text[]))=0;

-- Give the owner/demo user exactly one visible copy of every active card so
-- the redesigned inventory can be reviewed immediately. Prefer the front
-- recognition image; fall back to any active side for one-sided cards.
WITH target_user AS (
  SELECT id FROM users
   WHERE lower(COALESCE(mobile,''))='admin' OR lower(COALESCE(nickname,''))='hotcat'
   ORDER BY CASE WHEN lower(COALESCE(mobile,''))='admin' THEN 0 ELSE 1 END
   LIMIT 1
), preferred_design AS (
  SELECT c.id AS card_type_id,
         COALESCE(
           (SELECT d.id FROM photo_card_designs d WHERE d.card_type_id=c.id AND d.is_active AND d.side='front' ORDER BY d.created_at LIMIT 1),
           (SELECT d.id FROM photo_card_designs d WHERE d.card_type_id=c.id AND d.is_active ORDER BY d.created_at LIMIT 1)
         ) AS design_id
    FROM card_types c WHERE c.is_active
)
INSERT INTO user_card_inventory(user_id,card_type_id,quantity,consumed_in_reward,display_design_id)
SELECT u.id,p.card_type_id,1,false,p.design_id FROM target_user u CROSS JOIN preferred_design p
ON CONFLICT(user_id,card_type_id) WHERE consumed_in_reward=false
DO UPDATE SET quantity=GREATEST(user_card_inventory.quantity,1),
              display_design_id=COALESCE(user_card_inventory.display_design_id,EXCLUDED.display_design_id),
              updated_at=NOW();
