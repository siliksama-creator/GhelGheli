-- ═══════════════════════════════════════════════════════════════════════════
-- ثبت کارت از طریق عکس
-- ═══════════════════════════════════════════════════════════════════════════
--
-- چرا این قابلیت وجود دارد
-- ─────────────────────────
-- در سیستم فعلی («ثبت کد کارت») کد به‌تنهایی کافی است. یعنی هر کس کد را
-- بداند — از روی شانهٔ کسی، از یک عکس در شبکهٔ اجتماعی، یا با حدس — امتیاز
-- می‌گیرد بدون اینکه کارت فیزیکی داشته باشد. مشخص هم نبود هر کد مربوط به
-- کدام طرح است، پس حتی قابل ردیابی نبود.
--
-- این قابلیت **کنارِ** سیستم فعلی می‌نشیند و آن را دست نمی‌زند: کاربر باید
-- هم عکس کارت فیزیکی را بگیرد و هم کد را وارد کند. عکس ثابت می‌کند کارت را
-- در دست دارد، کد ثابت می‌کند آن نسخه هنوز خرج نشده است.
--
-- ⚠️ هیچ جدول یا ستونِ موجودی در این مایگریشن تغییر نمی‌کند. فقط سه جدول
--    جدید اضافه می‌شود. `card_codes` و `/api/cards/redeem` دست‌نخورده‌اند.

-- ───────────────────────────────────────────────────────────────────────────
-- ۱. طرح‌ها — «عکس خام» که مدیر آپلود می‌کند
-- ───────────────────────────────────────────────────────────────────────────
--
-- چرا به `card_types` وصل می‌شود و جدا نیست:
-- اینونتوری کاربر، جوایز پلکانی، آمار مدیریت و صفحهٔ «کارت‌های من» همگی روی
-- `card_types` بنا شده‌اند. اگر طرح‌ها دنیای جدا داشتند، باید همهٔ آن‌ها دو
-- بار نوشته می‌شدند و برای همیشه با هم هماهنگ می‌ماندند. با این لینک، کارتی
-- که از راه عکس ثبت می‌شود دقیقاً مثل کارت عادی در اینونتوری می‌نشیند.
CREATE TABLE IF NOT EXISTS photo_card_designs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- نوعِ کارت در کاتالوگ موجود. امتیاز و جایزهٔ نقدی از همین‌جا خوانده
  -- می‌شود، پس «امتیازی که مدیر هنگام آپلود تعیین می‌کند» در واقع
  -- card_types.point_value است و هیچ مفهوم موازی‌ای ساخته نمی‌شود.
  card_type_id  UUID NOT NULL REFERENCES card_types(id) ON DELETE CASCADE,

  -- عکس باکیفیتِ مدیر. همین در اینونتوری ثبت می‌شود، نه عکس کاربر.
  image_url     TEXT NOT NULL,

  -- ── اثر انگشت تصویر ──
  --
  -- سه سیگنالِ مکمل، چون هرکدام یک نقطهٔ کور دارد:
  --   • dhash  — گرادیان افقی؛ در برابر تغییر نور مصون، با تاری شدید ضعیف
  --   • phash  — DCT فرکانس پایین؛ در برابر تاری مقاوم، با برشِ نامتقارن ضعیف
  --   • رنگ    — هیستوگرام hue در شبکهٔ ۴×۴؛ دو کارتِ هم‌پالت را اشتباه می‌گیرد
  -- با هم نقطهٔ کورِ مشترک ندارند. اندازه‌گیری روی ۱۵۱ طرح: ۱۰۰٪ رتبهٔ ۱ درست.
  dhash         BYTEA NOT NULL,   -- ۳۲ بایت = ۲۵۶ بیت
  phash         BYTEA NOT NULL,   -- ۸ بایت  = ۶۳ بیت + پدینگ
  color_sig     REAL[] NOT NULL,  -- ۱۹۲ عدد (۴×۴ خانه × ۱۲ سطل hue)، نرمال‌شده

  -- ابعاد اصلی؛ برای تشخیص جهت (افقی/عمودی) هنگام تطبیق.
  width         INTEGER NOT NULL,
  height        INTEGER NOT NULL,

  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_by    UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- تطبیق همهٔ طرح‌های فعال را می‌خواند؛ این ایندکس آن مسیر داغ را می‌پوشاند.
CREATE INDEX IF NOT EXISTS idx_photo_designs_active
  ON photo_card_designs(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_photo_designs_type
  ON photo_card_designs(card_type_id);

-- ───────────────────────────────────────────────────────────────────────────
-- ۲. بانک کد — مشترک بین همهٔ طرح‌ها
-- ───────────────────────────────────────────────────────────────────────────
--
-- خواستهٔ صریح مالک: «بانک کدها مشترک بین همه‌ی عکس‌هاست، نه اینکه هر عکس
-- کد جداگانه داشته باشد.» پس اینجا — برخلاف `card_codes` — ستونِ
-- `card_type_id` عمداً وجود ندارد.
--
-- کد در لحظهٔ ثبت به طرحی که عکس با آن تطبیق خورده **بسته** می‌شود
-- (`bound_design_id`). این همان چیزی است که قبلاً نبود و باعث می‌شد معلوم
-- نباشد کدام کد مالِ کدام کارت است.
CREATE TABLE IF NOT EXISTS photo_card_codes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- citext مثل card_codes: کاربر ممکن است با حروف کوچک تایپ کند.
  code            CITEXT NOT NULL UNIQUE,

  -- unused → reserved (در صف بررسی) → used | voided
  --
  -- «reserved» حیاتی است: وقتی تطبیق مطمئن نیست و پرونده به صف بررسی مدیر
  -- می‌رود، کد نه آزاد است (وگرنه نفر دوم همان را خرج می‌کند) و نه مصرف‌شده
  -- (وگرنه اگر مدیر رد کند، کد بی‌دلیل سوخته است).
  status          VARCHAR(16) NOT NULL DEFAULT 'unused'
                  CHECK (status IN ('unused', 'reserved', 'used', 'voided')),

  bound_design_id UUID REFERENCES photo_card_designs(id) ON DELETE SET NULL,
  used_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  used_at         TIMESTAMPTZ,

  -- برچسب دسته، تا مدیر بتواند «۱۵ هزارتای چاپ مهر ۱۴۰۵» را جدا ببیند.
  batch_label     VARCHAR(80),

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- جست‌وجوی کد در لحظهٔ ثبت. UNIQUE بالا خودش ایندکس می‌سازد، ولی این
-- ایندکس جزئی شمارشِ «چند کد باقی مانده» را هم ارزان می‌کند.
CREATE INDEX IF NOT EXISTS idx_photo_codes_unused
  ON photo_card_codes(status) WHERE status = 'unused';
CREATE INDEX IF NOT EXISTS idx_photo_codes_user
  ON photo_card_codes(used_by_user_id) WHERE used_by_user_id IS NOT NULL;

-- ───────────────────────────────────────────────────────────────────────────
-- ۳. صف بررسی — وقتی تطبیق «شاید» است
-- ───────────────────────────────────────────────────────────────────────────
--
-- چرا سه‌حالته و نه دوحالته:
-- اندازه‌گیری روی ۸۰ عکسِ خراب‌شده نشان داد با آستانهٔ ۰.۶۸ هیچ کارتِ غلطی
-- قبول نمی‌شود ولی ۶.۲٪ کاربرانِ درستکار رد می‌شوند. رد کردن کاربری که
-- واقعاً کارت را دارد بدترین نتیجهٔ ممکن است. پس بازهٔ میانی به مدیر
-- می‌رود به‌جای اینکه به کاربر «نه» گفته شود.
CREATE TABLE IF NOT EXISTS photo_card_submissions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_id        UUID REFERENCES photo_card_codes(id) ON DELETE SET NULL,

  -- بهترین حدسِ موتور تطبیق، و اینکه چقدر مطمئن بوده.
  matched_design_id UUID REFERENCES photo_card_designs(id) ON DELETE SET NULL,
  match_score    REAL,
  match_margin   REAL,   -- فاصله تا رتبهٔ دوم؛ حاشیهٔ کم یعنی دو طرحِ شبیه

  -- عکسِ کاربر **فقط** تا زمان تعیین تکلیف نگه داشته می‌شود.
  -- خواستهٔ مالک: «عکس خود کاربر ذخیره نشود». بعد از تأیید یا رد، این
  -- فایل پاک می‌شود و مقدار NULL می‌گیرد. در مسیر تأییدِ خودکار اصلاً
  -- روی دیسک نمی‌ماند.
  user_image_path TEXT,

  status         VARCHAR(16) NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'approved', 'rejected')),
  reject_reason  TEXT,
  reviewed_by    UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  reviewed_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_photo_sub_pending
  ON photo_card_submissions(created_at DESC) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_photo_sub_user
  ON photo_card_submissions(user_id, created_at DESC);
