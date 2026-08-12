-- دوئل پنج‌کارتی و تاریخچهٔ سبک
--
-- بازسازی قبلی DECK_SIZE را در Node به ۵ برد، ولی قید چکِ پستگرس
-- روی card_duel_decks / card_duel_battles هنوز array_length = 3 بود.
-- نتیجه روی گوشی واقعی: ذخیرهٔ ترکیب پنج‌کارتی با خطای خام انگلیسی
--   card_duel_decks_card_type_ids_check
-- می‌ترکید و کاربر اصلاً وارد آرنا نمی‌شد.
--
-- ترکیب‌های سه‌کارتی دیگر معتبر نیستند؛ کاربر باید پنج کارت بچیند.
-- تاریخچهٔ سه‌کارتی قدیمی برای خواندن می‌ماند (۳ یا ۵)، ولی ردیف‌های
-- تمرین با ربات پاک می‌شوند چون لاگ نمی‌خواهند و جدول را باد می‌کنند.

DELETE FROM card_duel_decks
 WHERE COALESCE(array_length(card_type_ids, 1), 0) <> 5;

DELETE FROM card_duel_battles
 WHERE mode = 'bot';

ALTER TABLE card_duel_decks
  DROP CONSTRAINT IF EXISTS card_duel_decks_card_type_ids_check;
ALTER TABLE card_duel_decks
  ADD CONSTRAINT card_duel_decks_card_type_ids_check
  CHECK (array_length(card_type_ids, 1) = 5);

ALTER TABLE card_duel_battles
  DROP CONSTRAINT IF EXISTS card_duel_battles_user_card_type_ids_check;
ALTER TABLE card_duel_battles
  ADD CONSTRAINT card_duel_battles_user_card_type_ids_check
  CHECK (array_length(user_card_type_ids, 1) BETWEEN 3 AND 5);

ALTER TABLE card_duel_battles
  DROP CONSTRAINT IF EXISTS card_duel_battles_opponent_card_type_ids_check;
ALTER TABLE card_duel_battles
  ADD CONSTRAINT card_duel_battles_opponent_card_type_ids_check
  CHECK (
    opponent_card_type_ids IS NULL
    OR array_length(opponent_card_type_ids, 1) BETWEEN 3 AND 5
  );

COMMENT ON TABLE card_duel_decks IS
  'ترکیب پنج‌کارتی معتبر برای دوئل زنده (ربات، آنلاین، لابی).';
COMMENT ON TABLE card_duel_battles IS
  'تاریخچهٔ کوتاه نبرد امتیازی. تمرین با ربات ثبت نمی‌شود و ردیف‌های قدیمی پاک می‌شوند.';
