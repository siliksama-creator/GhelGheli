'use strict';
/**
 * تشخیصِ ظرفیت سرور — «تنها منبعِ حقیقت» برای اینکه چند پروسه، چند کارگر و
 * چند ترد لازم است.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * چرا وجود دارد
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * قبلاً این عددها در جاهای مختلف سخت‌کد شده بودند:
 *   • تعداد پروسه‌ها → `instances`/لیستِ ثابت در ecosystem.config.cjs
 *   • اندازهٔ تردپولِ Node → پیش‌فرضِ ۴ (هیچ‌جا ست نشده بود)
 *   • همزمانیِ پردازش تصویر/مدل → هیچ سقفی نداشت (بی‌کران)
 * نتیجه: **ارتقای سرور هیچ اثری نداشت** تا کسی دستی سه جا را عوض کند.
 *
 * این ماژول از سخت‌افزارِ واقعی می‌خواند و یک پروفایل می‌دهد. سه مصرف‌کننده:
 *   ۱. `ecosystem.config.cjs` → تعداد پروسه، UV_THREADPOOL_SIZE، PG_POOL_MAX،
 *      سقفِ حافظهٔ هر پروسه
 *   ۲. `src/lib/heavy.js` → همزمانیِ کارهای سنگین (پردازش عکس + استنتاج مدل)
 *   ۳. `scripts/capacity-apply.sh` (روی سرور) → وقتی سخت‌افزار عوض شد، خودش
 *      PM2 و upstreamِ nginx را بازچینی می‌کند و به تلگرام خبر می‌دهد
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * چرا «یک هسته ذخیره» و نه «همهٔ هسته‌ها»
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * موتورِ بازیِ زنده (اتاق‌ها، صفِ حریف‌جویی، تایمرها) در **یک** پروسه و روی
 * عملاً **یک** هسته اجرا می‌شود؛ این عمدی است (state قابلِ انتقال بین
 * پروسه‌ها نیست). اگر پردازشِ تصویر همهٔ هسته‌ها را بگیرد، دوئل/لیگ دقیقاً
 * در لحظهٔ شلوغیِ آپلود لگ می‌زند — همان چیزی که اندازه‌گیری شد: با سقفِ
 * هم‌زمانی، تأخیرِ API از ۲۹۱ms به ~۸ms برمی‌گشت.
 *
 * پس همیشه یک هسته برای بازی/دیتابیس کنار گذاشته می‌شود و بقیه به کارِ
 * سنگین می‌رسد.
 *
 * تنظیمِ دستی (اختیاری، برای شرایط خاص):
 *   CAPACITY_HTTP=6          → تعداد گره‌های HTTP
 *   VISION_CONCURRENCY=2     → همزمانیِ کارهای سنگین
 *   CAPACITY_UV=8            → UV_THREADPOOL_SIZE
 *   CAPACITY_RESERVE_MB=2600 → رمِ کنارگذاشته برای استک‌های دیگر (Invoicle…)
 *   CAPACITY_FORCE_CORES=4   → فقط برای تستِ مسیرِ «سرور ارتقا یافت»
 */

const os = require('os');

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const int = (v, fallback) => (Number.isFinite(Number(v)) && v !== '' && v != null ? Math.trunc(Number(v)) : fallback);

/**
 * رمِ کنارگذاشته برای چیزهایی که اپِ ما نیستند (Invoicle، دیتابیس، سیستم).
 *
 * این عدد از اندازه‌گیریِ واقعیِ سرور آمده، نه از حدس:
 *
 *   MemTotal ................................ ۳۹۱۶ مگابایت
 *   Invoicle — سقفِ سختِ جدید (invoicle.slice) ۹۰۰
 *   PostgreSQL ................................ ~۴۰
 *   سیستم/nginx/sshd/systemd ................. ~۲۰۰
 *   فضای اطمینان .............................. ~۲۶۰
 *   ───────────────────────────────────────────────
 *   کنارگذاشته ................................ ۱۴۰۰
 *
 * پیش از این ۱۸۰۰ بود؛ چون Invoicle **بدونِ سقف** اجرا می‌شد و تا ~۱ گیگ
 * هم می‌رسید. حالا با `invoicle.slice` سقفش ۹۰۰ مگابایت است (MemoryHigh=600،
 * MemoryMax=900)، پس این عدد واقع‌بینانه‌تر شد و رمِ آزادشده به خودِ قلقلی
 * می‌رسد (heapِ هر گره روی این سرور از ۷۷۶ به ۹۲۲ مگابایت می‌رود).
 *
 * ⚠️ اگر سقفِ Invoicle را دستی عوض کردی (مثلاً MemoryMax=1200M)، این عدد را
 * هم با متغیرِ محیطی CAPACITY_RESERVE_MB بالا ببر؛ وگرنه برای قلقلی بیش از
 * حد جا باز می‌کنیم.
 */
const DEFAULT_RESERVE_MB = 1400;

function detect() {
  const forcing = int(process.env.CAPACITY_FORCE_CORES, 0); // فقط برای تست
  const cores = forcing > 0 ? forcing : (os.cpus()?.length || 1);
  const memTotalMB = Math.round(os.totalmem() / 1048576);

  const reserveMB = clamp(int(process.env.CAPACITY_RESERVE_MB, DEFAULT_RESERVE_MB), 512, memTotalMB - 512);
  // رمِ قابلِ استفاده برای اپِ ما (بعد از کنارگذاشتنِ سهمِ بقیه).
  const memForAppMB = clamp(memTotalMB - reserveMB, 1024, 64 * 1024);

  // ── گره‌های وب ──
  // گرهِ بازی همیشه یک پروسه است (state زنده در حافظهٔ خودش). گره‌های HTTP
  // stateless‌اند و تعدادشان آزاد است. روی ۲ هسته همان ۲ گرهِ امروز می‌ماند
  // (بدون رگرسیون)، و روی هسته‌های بیشتر بزرگ می‌شود.
  const httpProcs = clamp(int(process.env.CAPACITY_HTTP, cores), 2, 6);
  const procs = 1 + httpProcs;

  // ── کارگرِ کارِ سنگین (پردازش عکس + استنتاج مدل) ──
  //
  // عدد از **اندازه‌گیری** آمده، نه از قاعدهٔ سرانگشتی. روی همین سرور با
  // ۱۲ عکسِ یکسان:
  //     سقف=۱ → دیوار ۱۱۵۸ms، تأخیرِ API ۵ms
  //     سقف=۲ → دیوار  ۸۵۱ms، تأخیرِ API ۳ms   ← بهترین تعادل
  //     سقف=۳ → دیوار  ۷۶۲ms، تأخیرِ API ۵ms
  //     سقف=۴ → دیوار  ۷۴۲ms، تأخیرِ API ۱۴ms  (p95: ۶۱ms) ← افتِ محسوسِ بقیه
  // پس روی ۲ هسته همان ۲ می‌مانیم (۲۶٪ سریع‌تر از ۱ و بدون هزینهٔ تأخیر) و
  // روی سرورهای بزرگ‌تر سقف را ۳ نگه می‌داریم تا بازی حتماً یک هستهٔ آزاد
  // داشته باشد؛ بیشتر از آن سودش ناچیز و هزینه‌اش برای بقیهٔ کاربران زیاد است.
  const vision = clamp(int(process.env.VISION_CONCURRENCY, cores <= 2 ? 2 : Math.min(3, cores - 1)), 1, 4);

  // ── تردپولِ Node (fs/crypto/dns) ──
  // پیش‌فرضِ Node عددِ ۴ است. با هسته‌های بیشتر، این گلوگاهِ پنهان می‌شود؛
  // پس متناسب بالا می‌رود. (فقط لحظهٔ بوتِ پروسه خوانده می‌شود، پس باید در
  // env پاس داده شود — کارِ ecosystem.config.cjs.)
  const uv = clamp(int(process.env.CAPACITY_UV, cores * 2), 4, 12);

  // ── استخرِ اتصالِ دیتابیس ──
  // جمعِ استخرِ همهٔ پروسه‌ها باید زیر max_connections=100 بماند.
  const poolMax = clamp(Math.floor(90 / procs), 6, 24);

  // ── سقفِ حافظهٔ هر پروسه ──
  // heap بالاتر از سقفِ ری‌استارت است (مثل تنظیمِ امروز: ۱۰۲۴/۸۵۰) چون RSS
  // همیشه از heap بزرگ‌تر است؛ این‌طور ری‌استارتِ PM2 اول اتفاق می‌افتد و
  // درخواستِ در جریان نمی‌میرد.
  const heapMB = clamp(Math.round((memForAppMB / procs) * 1.1), 768, 1536);
  const memRestartMB = clamp(Math.round((memForAppMB / procs) * 0.55), 700, 1200);

  return {
    cores,
    memTotalMB,
    reserveMB,
    memForAppMB,
    httpProcs,
    procs,
    vision,
    uv,
    poolMax,
    heapMB,
    memRestartMB,
    forced: forcing > 0,
    detectedAt: new Date().toISOString(),
  };
}

/** خطِ خوانا برای لاگ — همان چیزی که دنبالش هستید. */
function summary(p = detect()) {
  return `[capacity] هسته=${p.cores} رم=${p.memTotalMB}MB → گره‌های وب=${p.httpProcs}`
    + ` (جمعِ پروسه=${p.procs})، کارگرِ سنگین=${p.vision}، uv=${p.uv}،`
    + ` استخرِ DB=${p.poolMax}، سقفِ حافظه=${p.memRestartMB}M`
    + (p.forced ? ' (اجباری با CAPACITY_FORCE_CORES)' : '');
}

/** پورت‌های فعال — منبعِ واحد برای ecosystem و upstreamِ nginx. */
function ports(p = detect()) {
  const list = [4000]; // گرهِ بازی (HTTP هم سرو می‌کند)
  for (let i = 0; i < p.httpProcs; i++) list.push(4001 + i);
  return list;
}

/** نامِ پروسه‌ها — با نام‌های تاریخی یکسان تا روی سرورِ فعلی هیچ churn نباشد. */
function processNames(p = detect()) {
  const names = ['ghelgheli-api'];
  for (let i = 0; i < p.httpProcs; i++) names.push(i === 0 ? 'ghelgheli-api-http' : `ghelgheli-api-http${i + 1}`);
  return names;
}

module.exports = { detect, summary, ports, processNames, clamp };

// ── اجرای مستقیم: برای اسکریپتِ shell روی سرور ──
// `node src/lib/capacity.js --json`  → پروفایل به‌صورت JSON
if (require.main === module) {
  const p = detect();
  if (process.argv.includes('--json')) {
    process.stdout.write(JSON.stringify({ ...p, ports: ports(p), names: processNames(p) }) + '\n');
  } else {
    console.log(summary(p));
    console.log(`[capacity] پورت‌ها: ${ports(p).join(', ')}`);
    console.log(`[capacity] نام‌ها:  ${processNames(p).join(', ')}`);
  }
}
