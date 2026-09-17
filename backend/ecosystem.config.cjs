// PM2 process definition.
//
const path = require('path');
const capacity = require('./src/lib/capacity');
//
// ═══════════════════════════════════════════════════════════════════════════
// تعدادِ پروسه‌ها دیگر سخت‌کد نیست — از سخت‌افزارِ واقعی می‌آید
// ═══════════════════════════════════════════════════════════════════════════
//
// قبلاً این فایل فهرستِ ثابتی از سه اپ داشت. یعنی اگر سرور ارتقا پیدا
// می‌کرد، **هیچ اتفاقی نمی‌افتاد** تا کسی دستی این فایل را عوض کند و
// ری‌استارت بزند. حالا `src/lib/capacity.js` هسته/رم را می‌خواند و این
// فایل همان لحظهٔ بالا آمدن، تعدادِ گره‌ها و سقف‌های هر پروسه را از آن
// می‌سازد:
//
//   هسته=۲ → ۱ گره بازی + ۲ گره HTTP (دقیقاً امروز، بدون تغییر)
//   هسته=۴ → ۱ گره بازی + ۴ گره HTTP
//   هسته=۸ → ۱ گره بازی + ۶ گره HTTP (سقف ۶)
//
// و برای اینکه این کار بعد از ارتقای سرور **خودکار** هم بشود، اسکریپتِ
// `/usr/local/bin/ghelgheli-capacity-apply.sh` (تایمرِ روزانه + هنگام بوت)
// پروفایل را با سخت‌افزار مقایسه می‌کند؛ اگر عوض شده باشد، PM2 و
// upstreamِ nginx را بازچینی می‌کند و به تلگرام خبر می‌دهد.
//
// شرحِ کاملِ منطق در `src/lib/capacity.js` است.
const cap = capacity.detect();
//
// ── مقیاسِ چندپروسه‌ای بدون شکستنِ بازیِ زنده ────────────────────────
//
// موتور بازی (src/games/) اتاق‌ها، صفِ حریف‌جویی و تایمرهای زنده را در
// Mapهای درون‌پروسه نگه می‌دارد و مستقیماً به شیءِ زندهٔ سوکتِ هر بازیکن
// emit می‌کند (تا دستِ حریف لو نرود). این state قابلِ serialize به Redis
// نیست؛ پس اگر دو پروسه سوکت بپذیرند، دو بازیکنِ روی دو پروسه همدیگر را
// نمی‌بینند و بازی می‌شکند.
//
// راهکارِ امن (مطابق تحلیلِ معماری در docs): تفکیکِ نقش:
//   • ghelgheli-api      → «گره بازی». همهٔ اتصال‌های Socket.IO (به‌واسطهٔ
//     مسیریابیِ nginx که درخواست‌های Upgrade را فقط به این گره می‌فرستد)
//     و سهمِ خودش از HTTP به اینجا می‌آید. اتاق‌ها منسجم می‌مانند.
//   • ghelgheli-api-http…→ «گره HTTP». فقط ترافیکِ REST (که stateless است)
//     و Redis pub/sub را دارد؛ بارِ CPUِ سنگین را بین گره‌ها پخش می‌کند.
//
// همهٔ گره‌ها آداپتور Redis را وصل می‌کنند، پس پخشِ چت/حضور/اعلان بین‌شان
// درست کار می‌کند. شمارنده‌های rate-limit هم از Redis خوانده می‌شوند
// (lib/rateLimitStore.js) تا سقف بین گره‌ها جمع بسته نشود.
//
// نکته: nginx باید درخواست‌های Upgrade را فقط به گره بازی بفرستد
// (upstream جدا برای ws). بقیهٔ ترافیک روی همهٔ گره‌ها بالانس شود.
// upstreamِ nginx از همین پروفایل ساخته می‌شود:
// /etc/nginx/snippets/ghelgheli-upstream.conf
// تک‌گره (بدون Redis/بدون nginx) هم کار می‌کند.
function app(name, port, role) {
  return {
    name,
    script: 'src/server.js',
    cwd: __dirname,
    instances: 1,
    exec_mode: 'fork',
    // stdout (لاگِ عادی، شاملِ پیام‌های ۴xx/کسب‌وکار) و stderr (فقط خطای
    // واقعی/۵xx/کرش) را در دو فایلِ جدا نگه داریم. با `merge_logs: true`
    // (پیش‌فرضِ PM2 در fork) هر دو به فایلِ error می‌رفتند و مانیتورینگ
    // هشدارِ کتابخانه و پیامِ «سهمیهٔ روزانه تمام شد» را «خطا» نشان می‌داد.
    // `merge_logs: false` + مسیرهای صریح، stdout را به `out` و stderr را به
    // `error` می‌فرستد تا فایلِ error فقط دنبالِ خرابیِ واقعی بماند.
    merge_logs: false,
    out_file: path.join(__dirname, 'logs', `${role}-${name}-out.log`),
    error_file: path.join(__dirname, 'logs', `${role}-${name}-error.log`),
    // نشت حافظه یا پردازشِ آپلودیِ رهاکرده باید پروسه را recycle کند،
    // نه اینکه kernel با OOM همه چیز (حتی Postgres) را بکشد.
    //
    // عدد از capacity می‌آید: سهمِ رمِ این پروسه از رمِ در دسترسِ اپ، با
    // کفِ ۷۰۰ مگ. کف لازم است چون پردازشِ آپلود در اوجِ شلوغی می‌تواند
    // موقتاً ۲۵۰-۳۰۰ مگ به RSS اضافه کند و ری‌استارتِ وسطِ موج، مسابقهٔ
    // در جریان را می‌کشد.
    max_memory_restart: `${cap.memRestartMB}M`,
    // ⚠️ `node_args` تنها **کافی نیست**: روی سرورِ تولید دیدیم پنلِ PM2 مقدار
    // `node_args=['--max-old-space-size=923']` را نشان می‌داد ولی پروسهٔ واقعی
    // بدونِ آن فلگ بالا آمده بود (`/proc/<pid>/cmdline` فقط `node src/server.js`
    // بود) — یعنی V8 با سقفِ پیش‌فرضِ خودش اجرا می‌شد و به‌جای GCِ به‌موقع،
    // اول به سقفِ ری‌استارتِ PM2 می‌خورد و وسطِ کار ری‌استارت می‌شد.
    // `NODE_OPTIONS` را Node خودش همیشه می‌خواند و PM2 هم در fork/cluster
    // پاسش می‌دهد؛ هر دو را می‌فرستیم تا روی هر نسخهٔ PM2 درست بماند.
    node_args: `--max-old-space-size=${cap.heapMB}`,
    env: {
      NODE_OPTIONS: `--max-old-space-size=${cap.heapMB}`,
      NODE_ENV: 'production',
      PORT: String(port),
      PROCESS_ROLE: role,
      // پیش‌فرضِ Node عددِ ۴ است؛ با هسته‌های بیشتر گلوگاهِ پنهان می‌شود.
      UV_THREADPOOL_SIZE: String(cap.uv),
      // سقفِ همزمانیِ پردازش عکس/مدل — یک هسته همیشه برای بازی آزاد می‌ماند.
      VISION_CONCURRENCY: String(cap.vision),
      // جمعِ استخرهای همهٔ پروسه‌ها زیر max_connections=100 بماند.
      PG_POOL_MAX: String(cap.poolMax),
    },
    exp_backoff_restart_delay: 200,
    max_restarts: 15,
  };
}

const apps = [app('ghelgheli-api', 4000, 'game')]; // گره بازی/سوکت — اسمِ اصلی برای سازگاری با deploy.sh
for (let i = 0; i < cap.httpProcs; i++) {
  // نام‌های تاریخی حفظ شده‌اند: ghelgheli-api-http، ghelgheli-api-http2، …
  const name = i === 0 ? 'ghelgheli-api-http' : `ghelgheli-api-http${i + 1}`;
  apps.push(app(name, 4001 + i, 'http'));
}

module.exports = {
  apps,
  // برای اسکریپتِ capacity-apply.sh و لاگ‌ها
  __capacity: cap,
};
