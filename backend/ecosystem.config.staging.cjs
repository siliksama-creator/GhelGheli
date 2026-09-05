// PM2 definition for the PERMANENT staging environment.
//
// ── چرا جدا است ──────────────────────────────────────────────────────
// استیجینگ روی همان VPS ولی با مرزِ کاملاً جدا از تولید است:
//   • دیتابیسِ جدا  : ghelgheli_staging (روی همان Postgres، اسکیمای مستقل)
//   • پورتِ جدا      : 4100 (تولید ۴۰۰۰/۴۰۰۱ است)
//   • فایل env جدا  : .env.staging (JWT_SECRET و رمزهای متفاوت)
//   • فقط لوکال     : nginx به بیرون سروش نمی‌کند (نه دامنه، نه TLS) — با
//     SSH یا curl روی خود سرور به آن می‌رسیم.
//
// هیچ data مشترکی با تولید ندارد، پس هر خاکریزی روی آن بی‌خطر است (تست
// بار، E2E، مایگریشن‌های آزمایشی). این فایل به‌عمد `ecosystem.config.cjs`
// (تولید) نیست تا `deploy.sh` آن را دست نزند؛ استیجینگ با اسکریپتِ
// جدا (scripts/setup_staging.sh و deploy_staging.sh) مدیریت می‌شود.
module.exports = {
  apps: [{
    name: 'ghelgheli-staging',
    script: 'src/server.js',
    cwd: __dirname,
    instances: 1,
    exec_mode: 'fork',
    // سبک نگهش می‌داریم؛ استیجینگ ترافیک واقعی ندارد.
    max_memory_restart: '600M',
    node_args: '--max-old-space-size=768',
    env: {
      NODE_ENV: 'staging',
      PORT: '4100',
      PROCESS_ROLE: 'game',
    },
    exp_backoff_restart_delay: 200,
    max_restarts: 15,
  }],
};
