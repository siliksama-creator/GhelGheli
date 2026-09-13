-- pagination + جست‌وجوی سریع کاربران (۵۰/صفحه => ۲۰k کاربر بدون فشار)
-- قبل: ORDER BY joined_at DESC LIMIT 300 (کل جدول اسکن می‌شد)
-- حالا: ایندکس‌ها برای WHERE ILIKE + ORDER BY
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_users_mobile_trgm ON users USING gin (mobile gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_users_nickname_trgm ON users USING gin (nickname gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_users_joined_at ON users (joined_at DESC);
