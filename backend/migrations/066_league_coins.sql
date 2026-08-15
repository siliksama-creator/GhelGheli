-- ═══════════════════════════════════════════════════════════════════════════
-- ارز «سکه» — واحد دومِ رتبه‌بندی لیگ
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── چرا سکه، وقتی امتیاز داریم ──
--
-- امتیاز از ده مسیرِ مختلف به دست می‌آید (کارت، گردونه، استریک، مأموریت،
-- ضربه‌زن، معرفی…) و بیشترشان به مهارتِ بازی ربطی ندارند. یعنی صدرِ جدولِ
-- لیگ عملاً جدولِ «چه کسی بیشتر لاگین کرده» بود، نه «چه کسی بهتر بازی
-- می‌کند».
--
-- سکه فقط و فقط از **بردِ آنلاینِ شرط‌دار مقابل انسانِ واقعی** می‌آید.
-- نه ربات، نه بازی رایگان، نه مساوی، نه باخت. پس یک عددِ خالصِ مهارت است
-- و رتبه‌بندی با آن معنا پیدا می‌کند: `ORDER BY coins DESC, points DESC`.
--
-- ── چرا سه جا ذخیره می‌شود و کدام «حقیقت» است ──
--
--   league_leaderboard_entries.coins  ← منبعِ حقیقت برای رتبه‌بندی (per-season)
--   user_league_history.coins         ← بایگانیِ دائمی بعد از بستنِ لیگ
--   users.coins                       ← شمارندهٔ نمایشی، دقیقاً هم‌خانوادهٔ
--                                        monthly_league_points
--
-- ستونِ users.coins تکرارِ داده است و این را باید صریح گفت، چون تکرارِ داده
-- معمولاً باگ می‌سازد. دلیلِ پذیرفتنش: سکهٔ بازیکن باید در **سه نقطهٔ داغ**
-- خوانده شود — هندشیکِ سوکت، payloadِ هر بازیکن در game:start، و پروفایل
-- عمومی. هر سه قبلاً یک SELECT از users دارند. بدونِ این ستون هر کدام یک
-- JOIN اضافه به league_leaderboard_entries می‌خواستند، آن هم روی مسیری که
-- در هر مسابقه چند بار اجرا می‌شود.
--
-- ناسازگاری کنترل می‌شود چون هر دو ستون **در همان یک تراکنش** نوشته
-- می‌شوند (leagueService.awardCoins) و هیچ مسیر دیگری اجازهٔ نوشتن ندارد.
--
-- ── چرا سهمیهٔ روزانه ──
--
-- بدونِ سقف، دو حسابِ هماهنگ می‌توانستند تمامِ روز به هم ببازند و سکه
-- بسازند. با سقف، بیشترین سکهٔ ممکن در روز ۳۶۰ است (۳۰ بردِ ۱۰۰ + ۱۵ بردِ
-- ۱۰۰۰ در دوئل) و هزینهٔ سوختِ کمیسیونِ این کار از درآمدِ روزانهٔ یک کاربرِ
-- متوسط بیشتر است — یعنی تبانی ضرر می‌دهد.
--
-- سهمیه **مشترک بینِ هر سه بازی** است تا کسی نتواند با سوییچ کردن بینِ
-- پنالتی و جفت‌یاب سقف را سه برابر کند.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────
-- ۱) سکه در جدولِ رتبه‌بندیِ فصل — منبعِ حقیقت
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE league_leaderboard_entries
  ADD COLUMN IF NOT EXISTS coins INTEGER NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'league_entries_coins_check'
  ) THEN
    ALTER TABLE league_leaderboard_entries
      ADD CONSTRAINT league_entries_coins_check CHECK (coins >= 0);
  END IF;
END $$;

-- ایندکسِ رتبه‌بندی باید با ترتیبِ واقعیِ ORDER BY یکی باشد، وگرنه Postgres
-- مجبور به sort می‌شود. ایندکسِ قدیمیِ (season, points DESC) می‌ماند چون
-- کوئری‌های تاریخی هنوز از آن استفاده می‌کنند.
CREATE INDEX IF NOT EXISTS idx_league_entries_coins_rank
  ON league_leaderboard_entries(league_season_id, coins DESC, points DESC);

-- ─────────────────────────────────────────────────────────────────────────
-- ۲) بایگانیِ دائمی: سکه هم مثل رتبه و امتیاز باید بعد از بستنِ لیگ بماند
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE user_league_history
  ADD COLUMN IF NOT EXISTS coins INTEGER NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_league_history_coins_check'
  ) THEN
    ALTER TABLE user_league_history
      ADD CONSTRAINT user_league_history_coins_check CHECK (coins >= 0);
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- ۳) شمارندهٔ نمایشی روی users
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS coins INTEGER NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_coins_check'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT users_coins_check CHECK (coins >= 0);
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- ۴) سهمیهٔ روزانه — یک ردیف به ازای هر کاربر در هر روزِ ایران
-- ─────────────────────────────────────────────────────────────────────────
--
-- ⚠️ `quota_date` روزِ **تقویمِ تهران** است، نه UTC. اگر UTC می‌بود سهمیهٔ
--    کاربر ساعت ۳:۳۰ بامداد ریست می‌شد — وسطِ شبِ بازی. تبدیل در سرویس
--    انجام می‌شود و اینجا فقط DATE ذخیره می‌شود.
--
-- شمارنده‌ها به‌جای «باقی‌مانده»، «مصرف‌شده» را نگه می‌دارند. دلیل: سقف
-- ممکن است بعداً عوض شود و در آن حالت ردیف‌های موجود نباید بی‌معنی شوند.
CREATE TABLE IF NOT EXISTS user_coin_quota (
  user_id     UUID    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  quota_date  DATE    NOT NULL,
  used_100    INTEGER NOT NULL DEFAULT 0 CHECK (used_100  >= 0),
  used_1000   INTEGER NOT NULL DEFAULT 0 CHECK (used_1000 >= 0),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, quota_date)
);

-- برای هرسِ ردیف‌های قدیمی (کرونِ روزانه) — بدونِ این، جدول تا ابد رشد
-- می‌کند: هر کاربرِ فعال روزی یک ردیف.
CREATE INDEX IF NOT EXISTS idx_user_coin_quota_date
  ON user_coin_quota(quota_date);

-- ─────────────────────────────────────────────────────────────────────────
-- ۵) سندِ مسابقه: چه مقدار سکه، و آیا سهمیه سوخت
-- ─────────────────────────────────────────────────────────────────────────
--
-- ── چرا مقدارِ سکه در خودِ ردیفِ مسابقه ذخیره می‌شود ──
--
-- می‌شد موقعِ تسویه از روی (gameId, stake) دوباره حساب کرد. ولی آن‌وقت اگر
-- جدولِ پاداش عوض شود، مسابقه‌ای که دیروز شروع شده امروز مبلغِ دیگری
-- می‌گیرد. سندِ مالی باید شرایطِ لحظهٔ شروع را در خودش داشته باشد — همان
-- دلیلی که net_pot و commission_points هم اینجا ذخیره شده‌اند.
--
-- ── چرا دو boolean جدا برای سهمیه ──
--
-- سهمیهٔ دو بازیکن مستقل است: ممکن است X سهمیه داشته باشد و O نه. اگر
-- بازی ناتمام بماند، فقط سهمیهٔ کسی باید برگردد که واقعاً سوخته است.
-- بدونِ این دو ستون، برگشتِ سهمیه یا کسی را جا می‌انداخت یا به کسی سهمیهٔ
-- اضافه هدیه می‌داد.
-- ── چرا coin_quota_date هم ذخیره می‌شود ──
--
-- می‌شد موقعِ برگشت، روزِ تهران را از `created_at` دوباره حساب کرد. ولی
-- مصرفِ سهمیه در جاوااسکریپت با `Intl` انجام می‌شود و `created_at` با
-- `NOW()` در Postgres — دو ساعتِ متفاوت. در لحظهٔ نیمه‌شب این دو می‌توانند
-- یک روز اختلاف داشته باشند و آن‌وقت برگشت به ردیفِ اشتباه می‌خورد:
-- سهمیهٔ دیروز سوخته می‌ماند و به امروز یک سهمیهٔ رایگان هدیه می‌شود.
-- ذخیرهٔ صریحِ همان تاریخی که واقعاً مصرف شد، این کلاس از باگ را حذف می‌کند.
ALTER TABLE game_stake_matches
  ADD COLUMN IF NOT EXISTS coin_reward     INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS coin_quota_x    BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS coin_quota_o    BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS coin_quota_date DATE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'game_stake_coin_reward_check'
  ) THEN
    ALTER TABLE game_stake_matches
      ADD CONSTRAINT game_stake_coin_reward_check CHECK (coin_reward >= 0);
  END IF;
END $$;

COMMENT ON COLUMN league_leaderboard_entries.coins IS
  'سکهٔ فصل — فقط از بردِ آنلاینِ شرط‌دار مقابل انسان. منبعِ حقیقتِ رتبه‌بندی.';
COMMENT ON COLUMN users.coins IS
  'شمارندهٔ نمایشیِ سکه (هم‌خانوادهٔ monthly_league_points). حقیقت در league_leaderboard_entries است.';
COMMENT ON TABLE user_coin_quota IS
  'سهمیهٔ روزانهٔ سکه به وقت تهران؛ مشترک بین هر سه بازی. مصرف در شروع بازی، برگشت در بازیِ ناتمام.';

COMMIT;
