-- ═══════════════════════════════════════════════════════════════════════
-- ۱۰۳ — پرچمِ «آموزشِ صوتیِ قلقلی دیده شد»  (۴ مهر ۱۴۰۵)
--
-- چرا جدولِ جدا و نه ستون در `users`:
--   • تور نسخه دارد (`tour_version`): با هر تغییرِ محتوایی، نسخه بالا
--     می‌رود و کاربری که نسخهٔ قبلی را دیده، تورِ تازه را می‌بیند. ستونِ
--     ساده این حالت را نمی‌توانست بیان کند.
--   • «رد کردن» از «دیدن تا آخر» جداست (`skipped`) — برای آمارِ محصول
--     مهم است که بدانیم چند نفر تور را وسط راه بستند.
--
-- چرا سرور و نه localStorage (خواستهٔ مالک): کاربری که گوشی عوض می‌کند
-- نباید آموزش را از اول ببیند؛ و آمارِ «چند نفر تور را دیدند» باید یک‌جا
-- باشد، نه در مرورگرِ هر کس.
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS user_onboarding_tour (
  user_id      uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  -- آخرین نسخه‌ای که کاربر دیده؛ ۰ یعنی هنوز هیچ نسخه‌ای را کامل ندیده.
  tour_version integer     NOT NULL DEFAULT 0 CHECK (tour_version >= 0),
  -- تور را وسط راه بست (و در پروفایل می‌تواند دوباره بازش کند).
  skipped      boolean     NOT NULL DEFAULT FALSE,
  seen_at      timestamptz,
  created_at   timestamptz NOT NULL DEFAULT NOW(),
  updated_at   timestamptz NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  user_onboarding_tour IS 'آموزشِ صوتیِ قلقلی — پرچمِ دیده‌شد به‌ازای هر کاربر (نسخه‌دار)';
COMMENT ON COLUMN user_onboarding_tour.tour_version IS 'آخرین نسخهٔ دیده‌شده؛ ۰ = ندیده';
