-- ═══════════════════════════════════════════════════════════════════════
-- ۱۰۴ — آمارِ واقعیِ ۲۰ کارتِ ثبت‌شده در ۵ مهر ۱۴۰۵
--
-- مالک همین کارت‌ها را در «ثبت کارت» ساخت (۴۰ عکسِ رو و پشت). فرم،
-- استاتِ پیش‌فرضِ ۵۰ و انرژیِ ۱۰۰ و افکتِ none گذاشته بود.
--
-- خواسته:
--   • بازیکنِ بازنشسته: آمارِ دورانِ فعال، نه فصلِ خداحافظی
--   • بازیکنِ فعال: آمارِ فعلی، نه کارتِ نوستالژی
--   • انرژیِ واقعی، و افکت فقط اگر ویژگیِ خاص دارد
--   • امتیاز (point_value) بالا نرود — کلاس از همان ۱۰۰۰ می‌ماند (uncommon)
--
-- منبعِ سطح: ردهٔ EA FC 26/27 برای فعال‌ها، نقش و ویژگیِ چاپ‌شده روی
-- خودِ کارت، و برای پپه اوجِ رئال/یورو ۲۰۱۶ (بازنشستگی: ۱۸ مرداد ۱۴۰۳).
-- سقفِ ۱۰۰ برای لجندهایِ کاتالوگ (پله، مارادونا، امباپه) دست نخورده است؛
-- این کارت‌ها از آن سقف رد نمی‌شوند.
-- ═══════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  n int;
BEGIN
  WITH curated(
    old_name, new_name, description,
    attack, defense, speed, technique, goal_chance, energy, effect
  ) AS (
    VALUES
      -- دروازه‌بانِ ذخیره‌ایِ فعلی، نه فصلِ استارتِ ۲۰۲۴/۲۵ که روی کارت سن ۳۴ خورده.
      ('Szczęsny', 'Wojciech Szczęsny',
       'دروازه‌بان باتجربه؛ واکنش خوب، نه دروازه‌بانِ اولِ فعلی',
       22, 86, 52, 74, 7, 78, 'wall'),
      -- فعال، بارسلونا. بالاتر از نسخهٔ معمولیِ ۵۰۰ امتیازیِ همین نام.
      ('Raphinha', 'Raphinha',
       'وینگر گلزن با شتاب، حرکت بدون توپ و ضربهٔ چپ',
       90, 52, 93, 88, 89, 92, 'speedster'),
      -- فعال در اینتر میامی، ۳۹ ساله. سرعتِ کارتِ چاپی (۷۵) برای این سن واقعی نیست.
      ('Luis Suárez', 'Luis Suárez',
       'مهاجم کهنه‌کار؛ تمام‌کنندگی مانده، سرعتِ اوجِ بارسلونا نه',
       82, 44, 62, 84, 88, 70, 'finisher'),
      ('Khvicha Kvaratskhelia', 'Khvicha Kvaratskhelia',
       'وینگر چپِ یک‌به‌یک؛ دریبل، برش به داخل و شوت',
       88, 42, 92, 94, 84, 88, 'speedster'),
      -- کارت ۸۸ چاپ کرده؛ سطحِ واقعی نزدیک ۸۳ است. رابط است، فینیشر خالص نه.
      ('Kai Havertz', 'Kai Havertz',
       'مهاجمِ رابط با حرکت و بازی‌سازی؛ فینیشر خالص نیست',
       78, 58, 78, 82, 74, 80, 'playmaker'),
      -- برگشته از شکستگیِ پا (دی ۱۴۰۴) و در جامِ ۲۰۲۶ بوده. تکنیک مانده، انرژی نه در اوج.
      ('jamal musiala', 'Jamal Musiala',
       'بازی‌ساز دریبل‌زن؛ بعد از بازگشت از مصدومیت، تکنیک هنوز سطح بالا',
       84, 55, 86, 95, 82, 82, 'playmaker'),
      ('Donnarumma', 'Gianluigi Donnarumma',
       'دروازه‌بان بلندقد با واکنش، پوششِ دروازه و خروج',
       24, 95, 60, 78, 8, 90, 'wall'),
      -- فعال در اینتر میامی، ۳۴ ساله. نه هافبکِ ۲۰۱۷ رئال.
      ('Casimiro', 'Casemiro',
       'هافبک دفاعی کهنه‌کار؛ قطع توپ مانده، پاهای اوجِ مادرید نه',
       68, 86, 60, 74, 56, 82, 'wall'),
      ('Bruno Fernandes', 'Bruno Fernandes',
       'هافبکِ طراح با پاس کلیدی، ضربهٔ ایستگاهی و انرژی بالا',
       84, 66, 76, 90, 86, 94, 'playmaker'),
      ('Bernardo Silva', 'Bernardo Silva',
       'هافبک کنترل‌کننده با پرس، حفظ توپ و تصمیم‌گیری',
       78, 70, 80, 92, 74, 93, 'playmaker'),
      ('William Saliba', 'William Saliba',
       'مدافع میانی کامل؛ دوئل، پوشش و بازی با پا',
       60, 93, 84, 82, 46, 90, 'wall'),
      -- فعال، ۳۵ ساله. جای‌گیری مانده، سرعتِ ۲۰۱۹ نه.
      ('Virgil van Dijk', 'Virgil van Dijk',
       'مدافع مسلطِ هوایی؛ جای‌گیری نخبه است، سرعتِ ۲۰۱۹ نه',
       62, 94, 70, 78, 56, 80, 'wall'),
      ('Rúben Dias', 'Rúben Dias',
       'مدافع سازمان‌دهنده با تکل، رهبری و دفاعِ موقعیت',
       56, 91, 66, 76, 40, 88, 'wall'),
      ('romero', 'Cristian Romero',
       'مدافع جنگنده با دوئل، شدت و قطع توپ',
       64, 87, 78, 72, 42, 92, 'wall'),
      -- بازنشسته (۱۸ مرداد ۱۴۰۳). اوجِ رئال و یورو ۲۰۱۶، نه کارتِ ۴۱ سالگی.
      ('pepe', 'Pepe',
       'لجندِ مدافع؛ اوجِ رئال و یورو ۲۰۱۶، نه فصلِ خداحافظی',
       64, 92, 76, 70, 48, 91, 'wall'),
      ('Pedri', 'Pedri',
       'هافبک کنترل‌کننده با پاس، حفظ توپ و مدیریت ریتم',
       80, 66, 78, 95, 76, 90, 'playmaker'),
      -- فعال، دقایقِ چرخشی ولی خلق موقعیت بالا. هنوز پدری نیست.
      ('Arda Güler', 'Arda Güler',
       'بازی‌ساز جوان با پای چپ، تکنیک و شوت از راه دور',
       76, 40, 80, 87, 74, 80, 'playmaker'),
      ('Alisson Becker', 'Alisson Becker',
       'دروازه‌بان سوئیپر با جای‌گیری، واکنش و بازی با پا',
       22, 94, 56, 86, 7, 88, 'wall'),
      ('Alessandro Bastoni', 'Alessandro Bastoni',
       'مدافع چپ‌پا با پاس عمقی و آرامش زیر فشار',
       66, 89, 78, 86, 48, 88, 'wall'),
      -- بدونِ ویژگیِ خاص. مدافعِ جوان، نه دیوارِ نخبه.
      ('Abdukodir Khusanov', 'Abdukodir Khusanov',
       'مدافع جوانِ در حال رشد؛ سرعت خوب، هنوز نه در سطحِ نخبه',
       52, 78, 83, 68, 36, 82, 'none')
  ),
  updated AS (
    UPDATE card_types c
       SET name = curated.new_name,
           description = curated.description,
           duel_attack = curated.attack,
           duel_defense = curated.defense,
           duel_speed = curated.speed,
           duel_technique = curated.technique,
           duel_goal_chance = curated.goal_chance,
           duel_energy = curated.energy,
           duel_effect = curated.effect,
           -- کلاس از امتیاز ساخته می‌شود. امتیاز را عوض نمی‌کنیم؛
           -- uncommon همان کلاسِ ۱۰۰۰ است و فقط اگر فرم چیزی دیگر گذاشته باشد جابه‌جا می‌شود.
           duel_rarity = 'uncommon',
           updated_at = NOW()
      FROM curated
     WHERE c.name IN (curated.old_name, curated.new_name)
       AND c.created_at >= TIMESTAMPTZ '2026-09-26 22:40:00+03:30'
       AND c.created_at <  TIMESTAMPTZ '2026-09-26 23:30:00+03:30'
    RETURNING c.id, c.point_value, c.duel_attack, c.duel_effect
  )
  SELECT COUNT(*) INTO n FROM updated;

  -- دیتابیسِ خالیِ CI این ۲۰ نام را ندارد: ۰ درست است.
  -- تولید باید دقیقاً ۲۰ تا باشد. عددِ دیگر یعنی نام عوض شده یا یکی جا مانده.
  IF n <> 0 AND n <> 20 THEN
    RAISE EXCEPTION 'curated card stats matched % rows; expected 0 or 20', n;
  END IF;

  -- حملهٔ ۵۰ به‌تنهایی پیش‌فرض نیست: خوسانوف مهاجم نیست و حملهٔ پایین واقعی است.
  -- پیش‌فرضِ فرم یعنی هر پنج استات ۵۰ و انرژی ۱۰۰، با توضیحِ خالی.
  IF n = 20 AND EXISTS (
    SELECT 1 FROM card_types
     WHERE created_at >= TIMESTAMPTZ '2026-09-26 22:40:00+03:30'
       AND created_at <  TIMESTAMPTZ '2026-09-26 23:30:00+03:30'
       AND (
         point_value <> 1000
         OR description IS NULL
         OR btrim(description) = ''
         OR (duel_attack = 50 AND duel_defense = 50 AND duel_speed = 50
             AND duel_technique = 50 AND duel_goal_chance = 50 AND duel_energy = 100)
       )
  ) THEN
    RAISE EXCEPTION 'a newly registered card kept default stats or its points changed';
  END IF;
END $$;
