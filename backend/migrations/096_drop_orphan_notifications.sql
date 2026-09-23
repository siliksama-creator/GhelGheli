-- اعلان‌هایی که user_id تهی دارند گیرنده‌ای ندارند.
-- ستون nullable است (اعلان مهمان/حذف کاربر با CASCADE ناقص مانده).
-- ۶ ردیف زندهٔ wallet با user_id تهی صندوق را شلوغ می‌کردند.
DELETE FROM notifications WHERE user_id IS NULL;
