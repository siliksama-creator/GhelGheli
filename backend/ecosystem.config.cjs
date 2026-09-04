// PM2 process definition.
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
//   • ghelgheli-api-1  → «گره بازی». همهٔ اتصال‌های Socket.IO (به‌واسطهٔ
//     مسیریابیِ nginx که درخواست‌های Upgrade را فقط به این گره می‌فرستد)
//     و سهمِ خودش از HTTP به اینجا می‌آید. اتاق‌ها منسجم می‌مانند.
//   • ghelgheli-api-2  → «گره HTTP». فقط ترافیکِ REST (که stateless است)
//     و Redis pub/sub را دارد؛ بارِ CPUِ سنگین (لیگ، کیف‌پول، تصاویر…)
//     را با گره اول نصف می‌کند.
//
// هر دو گره آداپتور Redis را وصل می‌کنند، پس پخشِ چت/حضور/اعلان بینشان
// درست کار می‌کند. شمارنده‌های rate-limit هم از Redis خوانده می‌شوند
// (lib/rateLimitStore.js) تا سقف بین دو گره جمع بسته نشود.
//
// نکته: nginx باید درخواست‌های Upgrade را فقط به ghelgheli-api-1 بفرستد
// (upstream جدا برای ws). بقیهٔ ترافیک روی هر دو upstream بالانس شود.
// تک‌گره (بدون Redis/بدون nginx) هم کار می‌کند: api-2 وقتی PORT دوم
// توسط nginx هدف گرفته نشود، صرفاً یک standby سالم است.
function app(name, port, role) {
  return {
    name,
    script: 'src/server.js',
    cwd: __dirname,
    instances: 1,
    exec_mode: 'fork',
    // نشت حافظه یا پردازشِ آپلودیِ رهاکرده باید پروسه را recycle کند،
    // نه اینکه kernel با OOM همه چیز (حتی Postgres) را بکشد.
    max_memory_restart: '850M',
    node_args: '--max-old-space-size=1024',
    env: { NODE_ENV: 'production', PORT: String(port), PROCESS_ROLE: role },
    exp_backoff_restart_delay: 200,
    max_restarts: 15,
  };
}

module.exports = {
  apps: [
    app('ghelgheli-api', 4000, 'game'),   // گره بازی/سوکت — اسمِ اصلی برای سازگاری با deploy.sh
    app('ghelgheli-api-http', 4001, 'http'), // گره کمکیِ HTTP/REST
  ],
};
