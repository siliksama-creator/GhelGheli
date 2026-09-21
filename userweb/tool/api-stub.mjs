/**
 * استابِ قطعیِ APIِ تولیدی برای تست‌های مرورگری روی پیش‌نمایشِ لوکال.
 *
 * ── چرا این فایل لازم شد ──
 * اپِ وب آدرسِ API را از `VITE_API_BASE` می‌خواند و پیش‌فرضش دامنهٔ تولید است؛
 * پس همان صفحهٔ ورود در `vite preview` هم `https://api.ghelghelishop.ir/api/config`
 * را صدا می‌زند. روی رانرِ CI این درخواست به مقصد نمی‌رسد (CORS مرورگر از مبدأ
 * localhost ردش می‌کند و رانر هم دسترسیِ بیرونیِ تضمین‌شده ندارد). نتیجه در کامیت
 * `e98839f`: پنجرهٔ ۳۰ ثانیه‌ای `networkidle` تا آخر منتظر می‌ماند و دو خطای
 * کنسول (`CORS` و `net::ERR_FAILED`) گاردِ تایپوگرافی/اسموک را قرمز می‌کرد —
 * قرمزی‌ای که هیچ ربطی به ظاهرِ دسکتاپ نداشت.
 *
 * ── چرا استاب، و نه نادیده‌گرفتنِ خطا ──
 * راهِ دمی که یک‌بار رفتیم («هر پیامِ ERR_FAILED / Failed to load resource را
 * نادیده بگیر») دو عیبِ جدی داشت:
 *   ۱. خطای واقعیِ شبکه در اپِ **خودمان** هم بی‌صدا رد می‌شد؛ گارد کور می‌شد.
 *   ۲. وابستگیِ شبکه‌ای سرِ جایش می‌ماند: روی رانرِ کند همان انتظارِ طولانی
 *      برمی‌گشت و تست دوباره flaky می‌شد.
 * حالا درخواستِ بیرونی هرگز به شبکه نمی‌رود: همان‌جا در خودِ مرورگر با یک
 * بدنهٔ JSONِ کوچک پاسخ داده می‌شود. پس `networkidle` فوری حاصل می‌شود و
 * هیچ خطایی تولید نمی‌شود که بخواهیم نادیده بگیریم.
 *
 * ── مرزِ پوشش ──
 * روی دامنهٔ زنده (چک‌لیستِ بعد از هر دیپلوی: `node tool/smoke.mjs https://user... "$JWT"`)
 * هیچ مسیری نصب نمی‌شود و تست واقعاً با APIِ تولید حرف می‌زند. این استاب فقط
 * وقتی نصب می‌شود که BASE روی localhost باشد — یعنی همان‌جایی که اپ به‌هرحال
 * نمی‌تواند به تولید وصل شود.
 *
 * برای اینکه لوکال هم عمداً با APIِ واقعی تست شود:
 *   GG_LIVE_API=1 node tool/smoke.mjs http://localhost:4173 "$JWT"
 */

// هر دو دامنهٔ تولید (قدیم و نو) استاب می‌شوند؛ اپ/وب ممکن است به هر کدام
// اشاره کند و تستِ لوکال نباید به خاطر CORS به API زنده برود.
export const API_HOSTS = [
  'https://api.ghelghelishop.ir',
  'https://api.ghelghelishop.com',
];
export const API_HOST = API_HOSTS[0];

// از اصلاحِ «APIِ هم‌مبدأ» به بعد، بیلدِ تولید با BASEِ تهی ساخته می‌شود و
// صفحهٔ پیش‌نمایشِ لوکال درخواست‌های **نسبی** می‌فرستد
// (`http://localhost:4173/api/...`). الگوهای نسبیِ `installApiStub` هر دو
// دنیا (مطلقِ قدیم و نسبیِ نو) را پوشش می‌دهند.

/** BASE روی پیش‌نمایشِ لوکال است؟ (نه دامنهٔ زنده) */
export const isLocalBase = base =>
  /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/)/.test(base);

export async function installApiStub(page) {
  const live = process.env.GG_LIVE_API === '1';
  const handler = async route => {
    if (live) {
      try {
        // درخواستِ هم‌مبدأِ پیش‌نمایشِ لوکال به خودِ localhost می‌خورد و آنجا
        // بک‌اندی نیست؛ برای GG_LIVE_API=1 مقصد را به دامنهٔ تولید بازنویسی
        // می‌کنیم تا «تستِ زنده» معنایش را حفظ کند.
        const u = new URL(route.request().url());
        if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') {
          u.protocol = 'https:';
          u.host = new URL(API_HOSTS[1]).host;
        }
        await route.fulfill({ response: await route.fetch({ url: u.toString(), timeout: 10000 }) });
        return;
      } catch {
        // آفلاین — می‌افتیم روی همان استاب تا آفلاین‌بودن، تست را قرمز نکند.
      }
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '{}',
    });
  };
  for (const host of API_HOSTS) await page.route(`${host}/**`, handler);
  // بیلدِ هم‌مبدأ: `/api/...` و `/socket.io/...` روی originِ خودِ صفحه.
  await page.route('**/api/**', handler);
  await page.route('**/socket.io/**', handler);
}
