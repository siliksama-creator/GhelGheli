/**
 * بازخوانیِ یک‌بارهٔ توکن‌های متنی (OCR) برای طرح‌های موجود.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * چرا این اسکریپت لازم شد
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * با فعال‌شدنِ توکن‌های فارسی در `readText` (FP_VERSION ۵)، خروجیِ OCR
 * برای طرح‌هایی که متنِ فارسی دارند تغییر می‌کند. اما `text_tokens`ِ
 * طرح‌های قدیمی **همان لحظهٔ آپلود** با کدِ قبل از این تغییر محاسبه
 * شده و در دیتابیس ذخیره است.
 *
 * تطبیق، توکن‌های مرجع را از ستونِ ذخیره‌شده می‌خواند (نه از تصویر
 * مرجع). اگر مرجع فقط توکنِ لاتین داشته باشد و عکسِ کاربر توکنِ
 * فارسی هم بخواند، سیگنال **نامتقارن** می‌شود و موتور برای همهٔ آن
 * جفت‌ها نیمِ جریمهٔ «متن نداریم» (TEXT_PENALTY × ۰٫۵) اعمال می‌کند —
 * یعنی حاشیهٔ همهٔ کارت‌های دارای متنِ فارسی بی‌دلیل می‌افتد.
 *
 * این اسکریپت توکن‌های هر طرح را با کدِ تازه روی همان تصویر مرجع
 * باز می‌سازد. idempotent است: دوباره اجرا شود، همان خروجی را می‌دهد.
 *
 * ⚠️ فقط `photo_card_designs` هدف است؛ `photo_card_submissions` موقت
 * است (ردیف‌های کاربرِ ثبت‌شده که یا تأیید می‌شوند یا رد) و نباید
 * دست بخورد.
 *
 * اجرا:
 *   cd backend && npm run backfill:text-tokens
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const { readText } = require('../src/services/imageFingerprintText');

(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const imageRoot = path.resolve(__dirname, '..', 'uploads');
  const rows = await pool.query(
    'SELECT id, image_url FROM photo_card_designs WHERE image_url IS NOT NULL ORDER BY id');

  let updated = 0;
  let missing = 0;
  let failed = 0;
  for (const r of rows.rows) {
    const url = String(r.image_url);
    // شکلِ ذخیره: /uploads/images/<نام> — ریشهٔ uploads در کنارِ بک‌اند است.
    const rel = url.replace(/^\/?uploads\//, '');
    const file = path.join(imageRoot, rel);
    if (!fs.existsSync(file)) {
      missing += 1;
      console.warn(`skip ${r.id}: فایل پیدا نشد (${url})`);
      continue;
    }
    try {
      const tokens = await readText(fs.readFileSync(file));
      await pool.query(
        'UPDATE photo_card_designs SET text_tokens=$1 WHERE id=$2',
        [tokens, r.id]);
      updated += 1;
      console.log(`${r.id}: ${tokens.length} توکن`);
    } catch (e) {
      failed += 1;
      console.error(`fail ${r.id}: ${e.message}`);
    }
  }
  console.log(`\nbackfill: ${updated} به‌روز شد، ${missing} فایلِ گم‌شده، ${failed} خطا`);
  await pool.end();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
