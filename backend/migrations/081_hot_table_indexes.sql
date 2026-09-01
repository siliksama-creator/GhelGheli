-- ── بند ۶الفِ ممیزیِ مستقلِ دوم: ایندکسِ جدول‌های پرترافیک ────────────────
--
-- گزارش ادعا کرد ۹ جدولِ پرترافیک «نه کلید اصلی دارند نه ایندکس روی
-- ستونِ پرکاربردشان». قبل از ایندکس‌زدنِ کورکورانه، هر ۹ جدول هم در
-- کدِ مایگریشن‌ها هم در **دیتابیسِ زندهٔ سرور** (pg_indexes) وارسی شد.
-- نتیجه: ۸ جدول از ۹ تا از قبل ایندکسِ درست دارند — ادعای گزارش دربارهٔ
-- آن‌ها با واقعیتِ دیتابیس نمی‌خواند:
--
--   point_transactions   → idx_ptx_user_time (user_id, created_at DESC) برای
--                          تاریخچه/جمع‌بندی، idx_ptx_source_time،
--                          idx_ptx_biggest (بزرگ‌ترین‌های تک‌باره)،
--                          idx_ptx_admin، uq_point_game_stake_stage
--   wallet_transactions  → idx_wallet_tx_user_time، idx_wallet_tx_source،
--                          uq_wallet_tx_reference (ضدواریزِ تکراری)
--   game_results         → idx_game_results_user_day (سقف روزانهٔ بازی)
--   payment_orders       → payment_orders_user_idx،
--                          payment_orders_status_idx (جزئی روی pending)،
--                          payment_orders_token_uniq (ضدتقلبِ توکن خرید)
--   analytics_events     → idx_analytics_event_time / user_time / match
--   user_pass_progress   → PRIMARY KEY (user_id, season_id) +
--                          idx_pass_progress_day (سقف روزانهٔ XP)
--   user_group_progress  → PRIMARY KEY (user_id, group_id)
--   mission_definitions  → PRIMARY KEY (key)؛ جدولِ کوچکِ تنظیمات
--
-- تنها جایِ خالیِ واقعی: `wheel_spins` برای «چند چرخش در کلِ پلتفرم
-- امروز زده شد» (آمارِ پنل، server.js) و «یادآورِ گردونه» هیچ ایندکسی
-- که مستقیم روی spun_day بنشیند نداشت — بقیهٔ کوئری‌هایش را
-- idx_wheel_spins_daily (user_id, spun_day) جزئی و
-- idx_wheel_spins_user_time پوشش می‌دهند.

CREATE INDEX IF NOT EXISTS idx_wheel_spins_day
  ON wheel_spins(spun_day);

-- ── بند ۶ب: هرسِ analytics_events ─────────────────────────────────────────
-- کارِ پاک‌سازی (analyticsService.pruneOld) هر شب ردیف‌های کهنه‌تر از
-- ۹۰ روز را دسته‌ای حذف می‌کند؛ ایندکسِ ساده روی created_at همان کوئریِ
-- «کدام‌ها کهنه‌اند» را بدون خواندنِ کل جدول جواب می‌دهد.
CREATE INDEX IF NOT EXISTS idx_analytics_created_at
  ON analytics_events(created_at);

