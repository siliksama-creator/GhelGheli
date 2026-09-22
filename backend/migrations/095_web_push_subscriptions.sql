-- Web Push: اشتراکِ مرورگرِ کاربرهای وب — خواستهٔ مالک ۲۰۲۶-۰۹-۲۲
-- («از کاربران وب هم هنگامِ اولین ورود اجازهٔ نوتیفیکیشن بگیر و بعد
--   نوتیفیکیشن‌های مخصوص مثل موبایل برایشان برود»).
-- جدولِ جدا از users.fcm_token چون یک کاربر می‌تواند چند مرورگر/دستگاه
-- داشته باشد و endpointها بلند و یگانه‌اند (unique تا ثبتِ تکراریِ یک
-- مرورگر upsert شود، نه ردیفِ دوم).
CREATE TABLE IF NOT EXISTS web_push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- ارسال همیشه per-user یا per-segment (JOIN با users) است؛ این ایندکس
-- هر دو مسیر را می‌پوشاند.
CREATE INDEX IF NOT EXISTS web_push_subscriptions_user_idx ON web_push_subscriptions (user_id);
