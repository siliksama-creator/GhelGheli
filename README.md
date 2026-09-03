# GhelGheli — پلتفرم وفاداری کارت‌های فوتبالی

Monorepo فارسی برای سه بخش اصلی:

- `backend/` — Node.js + Express.js + PostgreSQL + Socket.io + JWT + FCM
- `admin/` — پنل مدیریت React.js فارسی و RTL
- `mobile/` — اپلیکیشن Flutter اندروید فارسی و RTL
- `docs/` — مستندات، دیاگرام ER و راهنمای استقرار

## چرا Monorepo؟
برای این پروژه API، پنل و اپ باید هم‌زمان تغییر کنند. Monorepo باعث می‌شود migrationها، مستندات API، Workflow ساخت APK و تغییرات هماهنگ در یک history قابل ردیابی باشند. همچنین GitHub Actions می‌تواند APK اندروید را مستقیم از پوشه `mobile/` بسازد و به‌صورت Artifact تحویل دهد.

## دریافت APK از GitHub
ساخت APK **فقط دستی** است، نه با هر push. صحتِ کامپایل در هر تغییر توسط
workflow «Flutter Check» (analyze + test، بدون بسته‌بندی) بررسی می‌شود.

`.github/workflows/build-apk.yml`

در GitHub به بخش **Actions → Build APK → Run workflow** بروید و پس از پایان،
آرتیفکتِ `app-release-apks` را دانلود کنید. خروجی، APKهای **ریلیزِ امضاشده** به
تفکیکِ معماریِ CPU است (نصبِ سبک‌تر روی دستگاه کاربر).

> امضا با keystore واقعی انجام می‌شود و workflow اگر خروجی با کلیدِ دیباگ امضا
> شده باشد عمداً شکست می‌خورد — چون اندروید اپ را با امضایش می‌شناسد و نصبِ
> دیباگ‌ساین نه قابل به‌روزرسانی است و نه کافه‌بازار می‌پذیردش.

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

## حساب‌های تست فعال

بعد از اجرای migration و seed:

```bash
cd backend
npm run migrate
npm run seed:admin
```

- پنل مدیریت و حالت مدیر اندروید: نام کاربری همان است که با `npm run seed:admin` ساخته می‌شود؛ رمز فقط نزد مالک است و در مخزن نیست (هرگز رمز پیش‌فرض روی production نگذارید).
- اپلیکیشن اندروید برای تست بدون پیامک: از «ورود مدیر» با همان حساب seed استفاده کنید.

در اپ Flutter یک حالت «ورود مدیر» وجود دارد که با حساب ادمینِ backend وارد می‌شود (رمز باید تایپ شود؛ داخل اپ hardcode نشده است).

## Admin Mode داخل اپ Flutter

علاوه بر پنل وب React، اپ Flutter دارای حالت مدیریت است. ورود مدیر از endpoint ادمین backend انجام می‌شود، نه با منطق hardcode شده داخل اپ. اگر token ادمین معتبر باشد، اپ به `AdminShell` می‌رود و امکانات مدیریتی اصلی را در موبایل ارائه می‌دهد.

حساب مدیر اصلی تست بعد از `npm run seed:admin`:

```text
Username: GhelGheli
Password: مقدار خصوصی MAIN_ADMIN_PASSWORD در backend/.env
```

برای production حتماً رمز را بعد از اولین ورود تغییر دهید یا seed تست را غیرفعال کنید.

## به‌روزرسانی جوایز و ورود تست

- مدیر می‌تواند تا ۵۰۰ جایزه تعریف کند.
- هر جایزه نام، عکس، امتیاز مورد نیاز، نوع و توضیح دارد.
- نوار پیشرفت اپ کاربر براساس جایزه بعدی محاسبه می‌شود.
- ورود مدیر داخل اپ: همان حساب ادمینِ پنل (نام کاربری از seed؛ رمز فقط نزد مالک). رمز داخل دکمهٔ اپ hardcode نشده و باید تایپ شود.
