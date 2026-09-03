-- 082: تاریخچهٔ محتوا و اعداد زنده (نقشه‌راه یکپارچه‌سازی لایو — فاز ۱)
--
-- چرا این جدول لازم است:
--
-- کلیدهای تازهٔ `live_copy` و `live_rules` در app_settings، متن‌ها و
-- اعدادِ کلِ محصول را جای می‌دهند. ادمینِ غیرفنی باید مثل «ویرایشِ متنِ
-- یک پست» روی‌شان کار کند — پس یک اشتباه نباید بی‌بازگشت باشد. هر
-- ذخیره، نسخهٔ **قبلی** را اینجا نگه می‌دارد و دکمهٔ «بازگردانیِ آخرین
-- تغییر» در پنل از همین جدول می‌خواند.
--
-- طراحی:
--   • فقط ۲۰ نسخهٔ آخر هر کلید نگه می‌ماند (حلقهٔ پاکسازی در
--     liveContent بعد از هر ثبت) — دیتابیس با دایرهٔ تغییرات
--     رشد نمی‌کند.
--   • admin_id بدون قید بیرونیِ سخت نیست: می‌خواهیم اگر روزی اکانتِ
--     ادمین حذف شود، تاریخچهٔ تغییراتش باقی بماند (audit).
CREATE TABLE IF NOT EXISTS live_content_history (
  id BIGSERIAL PRIMARY KEY,
  key VARCHAR(50) NOT NULL,
  value JSONB NOT NULL,
  admin_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- «آخرین ۲۰ تغییرِ این کلید، جدیدترین اول» — رایج‌ترین کوئریِ صفحهٔ تاریخچه.
CREATE INDEX IF NOT EXISTS live_content_history_key_id_idx
  ON live_content_history (key, id DESC);
