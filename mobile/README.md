# Mobile Flutter App

```bash
flutter pub get
flutter create --platforms=android .
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:4000
```

## APK از GitHub
Workflow `Build Android APK` بعد از push اجرا می‌شود و APK دیباگ نصب‌شدنی را در بخش Artifacts قرار می‌دهد.

## Firebase / FCM
برای Push Notification واقعی، فایل `android/app/google-services.json` و تنظیمات FlutterFire پروژه Firebase باید قبل از build production اضافه شود. در debug بدون این فایل، اپ با try/catch اجرا می‌شود ولی دریافت push فعال نیست.

## ورود تست بدون پیامک

بعد از اجرای `npm run seed:admin` در backend، در اپ از دکمه «ورود تست با Admin / admin» استفاده کنید.

## حالت مدیریت داخل اپ

اپ Flutter حالا دو نوع ورود دارد:

- ورود کاربر عادی با موبایل/رمز عبور → بخش عادی اپ
- ورود مدیر با username/password از مسیر امن `/api/admin/auth/login` → بخش مدیریت داخل اپ

اطلاعات نقش مدیر داخل APK تصمیم‌گیری نمی‌شود؛ backend توکن JWT ادمین با `type=admin` صادر می‌کند و همه endpointهای مدیریتی همچنان با `adminAuth` و role کنترل می‌شوند.

بخش مدیریت داخل اپ شامل داشبورد، مدیریت کارت و کد، آپلود عکس کارت از گالری، ثبت تکی/دسته‌جمعی کد، جوایز، لیگ، کاربران، چت، پشتیبانی، اطلاعیه‌ها، ادمین‌ها و audit log است.
