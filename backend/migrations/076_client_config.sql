-- پیکربندی اجرای کلاینت (نسخهٔ حداقل اپ + بنر اطلاعیه).
-- از پنل ادمین (PATCH /api/admin/settings/client-config) ویرایش می‌شود
-- و کلاینت‌ها در هر اجرا از GET /api/config می‌خوانند — بدون آپدیت اجباری.

INSERT INTO app_settings(key, value, updated_at)
VALUES (
  'client_config',
  '{"app":{"minVersion":{"android":"1.1.17","ios":"1.1.17"},"forceUpdate":{"android":false,"ios":false},"updateUrl":{"android":"","ios":""}},"announcement":{"active":false,"text":"","link":null,"accent":"gold"}}',
  NOW()
)
ON CONFLICT (key) DO NOTHING;
