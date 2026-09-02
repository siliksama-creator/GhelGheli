# باقی‌مانده‌ها (به‌روز)

## رفع‌شده در این پاس
- **جدول ادمین وب خالی/پر از `-`**: `Table` فرمت `{key,title,render}` فروشگاه/ماموریت/گذر نبرد را نمی‌فهمید → headers/cells همه `-`. الان سه شکل (string / tuple / object) پشتیبانی می‌شود.
- **نوار مقیاس گذر نبرد**: `POST /api/admin/pass/seasons/:id/scale-points` + UI وب و اندروید (ضریب ۰…۳، مسیر free/plus/both، پیش‌نمایش جمع).
- **هاردکد ۵۹۰۰۰** قیمت پلاس از shop موبایل/وب حذف شد (fallback ۰ / «از سرور»).

## هنوز باز (کم‌خطر)
- defaultهای tap (`levelsPerDay=2`, سکه ۵) — سرور override می‌کند
- `APP_RELEASE` / نسخهٔ بیلد برای minVersion
- `TAP_CONFIG` کپی کلاینت برای UX آفلاین
- ScrollHint برای باکس‌های overflow داخلی (چت) اختیاری

## کاهش آپدیت اپ
اقتصاد، بنر، tabOrder، forceUpdate، فروشگاه، ماموریت، پاس (از جمله مقیاس امتیاز)، گردونه، لیگ — همه سرور-درایو.
