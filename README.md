# GhelGheli — پلتفرم وفاداری کارت‌های فوتبالی

Monorepo فارسی برای سه بخش اصلی:

- `backend/` — Node.js + Express.js + PostgreSQL + Socket.io + JWT + FCM
- `admin/` — پنل مدیریت React.js فارسی و RTL
- `mobile/` — اپلیکیشن Flutter اندروید فارسی و RTL
- `docs/` — مستندات، دیاگرام ER و راهنمای استقرار

## چرا Monorepo؟
برای این پروژه API، پنل و اپ باید هم‌زمان تغییر کنند. Monorepo باعث می‌شود migrationها، مستندات API، Workflow ساخت APK و تغییرات هماهنگ در یک history قابل ردیابی باشند. همچنین GitHub Actions می‌تواند APK اندروید را مستقیم از پوشه `mobile/` بسازد و به‌صورت Artifact تحویل دهد.

## دریافت APK از GitHub
Workflow زیر با هر push یا اجرای دستی، APK دیباگ قابل نصب می‌سازد:

`.github/workflows/android-apk.yml`

در GitHub به بخش **Actions → Build Android APK → Artifacts** بروید و فایل `ghelgheli-debug-apk` را دانلود کنید.

> برای نسخه Release امضاشده باید keystore و secrets مربوطه در GitHub Actions اضافه شود.

## اجرای سریع توسعه

```bash
# backend
cd backend
cp .env.example .env
npm install
npm run migrate
npm run seed:admin
npm run dev

# admin
cd ../admin
npm install
npm run dev

# mobile
cd ../mobile
flutter pub get
flutter create --platforms=android .
flutter run
```
