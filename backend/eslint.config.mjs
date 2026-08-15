/**
 * پیکربندی ESLint — عمداً کوچک.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * چرا این فایل اضافه شد
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * یک باگِ واقعی روی سرورِ زنده: در مسیرِ «آپلود طرح توسط مدیر» خطی
 * `await releaseGuard()` بود که از مسیرِ «ثبت کارت توسط کاربر» کپی شده
 * بود. آن تابع فقط داخلِ مسیرِ کاربر تعریف می‌شود، پس در اینجا اصلاً
 * وجود نداشت.
 *
 * جاوااسکریپت این را در زمانِ بارگذاری نمی‌گیرد — فقط لحظه‌ای که آن خط
 * **اجرا** شود ReferenceError می‌دهد. و آن خط فقط در یک شاخهٔ نادر اجرا
 * می‌شد: وقتی مدیر تصویری آپلود کند که با طرحِ موجود تقریباً یکسان است.
 *
 * نتیجه: محافظی که دقیقاً برای «هشدار دادن به مدیر» نوشته شده بود، خودش
 * به‌جای هشدار، خطای ۵۰۰ با متنِ انگلیسی می‌داد. ماه‌ها می‌توانست بماند.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * چرا فقط no-undef و نه یک پیکربندی کامل
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * این پروژه ~۳۰۰۰ خط کدِ کارکردهٔ تولیدی دارد که با سبک خودش نوشته شده.
 * روشن کردنِ صدها قاعدهٔ سبکی یعنی هزاران هشدار — و هزاران هشدار یعنی
 * هیچ‌کس دیگر به خروجی نگاه نمی‌کند و ابزار عملاً خاموش است.
 *
 * `no-undef` تنها قاعده‌ای است که کلاسِ باگِ بالا را می‌گیرد و هیچ
 * نظری دربارهٔ سبک ندارد: یا متغیر وجود دارد یا ندارد. صفر بحث،
 * صفر هشدارِ سلیقه‌ای.
 *
 * اگر روزی خواستید سخت‌گیرتر شود، قاعده‌ها را یکی‌یکی اضافه کنید و هر
 * بار کد را تمیز کنید — نه همه را با هم.
 */
export default [
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'commonjs',
      globals: {
        require: 'readonly',
        module: 'writable',
        exports: 'writable',
        process: 'readonly',
        console: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        Buffer: 'readonly',
        global: 'readonly',
        setTimeout: 'readonly',
        setInterval: 'readonly',
        setImmediate: 'readonly',
        clearTimeout: 'readonly',
        clearInterval: 'readonly',
        queueMicrotask: 'readonly',
        structuredClone: 'readonly',
        performance: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        TextEncoder: 'readonly',
        TextDecoder: 'readonly',
        AbortController: 'readonly',
        // AbortSignal.timeout() برای مهلت‌گذاری روی درخواست به API کافه‌بازار
        AbortSignal: 'readonly',
        fetch: 'readonly',
      },
    },
    // ⚠️ `reportUnusedDisableDirectives` خاموش است چون کد چند
    // `eslint-disable` برای قاعده‌هایی دارد که ما روشن نکرده‌ایم.
    // آن‌ها بی‌ضررند و پاک کردنشان یعنی دست زدن به کدِ سالم.
    linterOptions: { reportUnusedDisableDirectives: 'off' },
    rules: { 'no-undef': 'error' },
  },
];
