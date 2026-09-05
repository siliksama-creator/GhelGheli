-- ۰۸۶: ارتقای صندوق خطا — پلتفرم «ادمین» + متادیتای دیباگ
--
-- چرا این مایگریشن:
--   ۱. پنل ادمین وب تاکنون خطاهای خودش را به صندوق کرش نمی‌فرستاد
--      (فقط وب‌کاربر، اندروید و خود بک‌اند گزارش می‌دادند). CHECK روی
--      ستون platform مقدار 'admin' را رد می‌کرد.
--   ۲. ستون‌های سبکِ «نسخهٔ اپ/آدرس صفحه/دستگاه» نداشتیم؛ در context بود
--      ولی فیلد صریح release/source برای فیلتر و گروه‌بندی سریع کافی است —
--      release و source از قبل هستند؛ اینجا فقط platform را باز می‌کنیم و
--      یک شاخصِ سبک روی پلتفرم برای خلاصه اضافه می‌کنیم.
--
-- سازگاری: فقط CHECK را گسترش می‌دهد و یک ایندکس اضافه می‌کند؛ دادهٔ
-- موجود دست‌نخورده می‌ماند و برگشت‌پذیر است.

BEGIN;

ALTER TABLE app_crash_reports DROP CONSTRAINT IF EXISTS app_crash_reports_platform_check;
ALTER TABLE app_crash_reports
  ADD CONSTRAINT app_crash_reports_platform_check
  CHECK (platform IN ('backend','web','admin','android','ios','unknown'));

-- شاخصِ خلاصهٔ پنل: گروه‌بندی «خطاهای باز به تفکیک پلتفرم» رایج‌ترین
-- نگاهِ صفحهٔ تحلیل‌هاست.
CREATE INDEX IF NOT EXISTS idx_crashes_open_platform
  ON app_crash_reports(platform, created_at DESC)
  WHERE status = 'open';

COMMENT ON CONSTRAINT app_crash_reports_platform_check ON app_crash_reports IS
  'platform = admin یعنی خطای خودِ پنل مدیریت وب (نه وب‌کاربر).';

COMMIT;
