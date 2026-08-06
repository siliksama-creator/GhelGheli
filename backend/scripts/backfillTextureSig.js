/**
 * پر کردنِ امضاهای تصویری برای طرح‌هایی که پیش از افزودنشان ثبت شده‌اند.
 *
 * ⚠️ نامِ فایل تاریخی است (روزی فقط `tex_sig` را پر می‌کرد). حالا هر
 *    سیگنالی که خالی باشد دوباره ساخته می‌شود — `luma_sig` و از نسخهٔ ۴
 *    `rgb_sig` هم.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * چرا لازم است
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `similarity` وقتی یک طرف `texSig` ندارد به فرمولِ سه‌سیگناله برمی‌گردد.
 * این جلوی خطا را می‌گیرد ولی یعنی طرح‌های قدیمی با فرمولِ متفاوتی
 * سنجیده می‌شوند — و آستانه‌ها روی فرمولِ چهارسیگناله کالیبره شده‌اند.
 *
 * نتیجه در عمل: دو کارت با کیفیتِ عکسِ یکسان، یکی تأیید خودکار می‌گیرد و
 * دیگری به صف بررسی می‌رود. برای مدیر بی‌معنی و برای کاربر ناعادلانه.
 *
 * اجرا:  node scripts/backfillTextureSig.js
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');

const { pool } = require('../src/config/db');
const fpEngine = require('../src/services/imageFingerprint');

const uploadRoot = path.join(__dirname, '..', 'uploads');

(async () => {
  const { rows } = await pool.query(
    `SELECT id, image_url FROM photo_card_designs
      WHERE tex_sig IS NULL OR luma_sig IS NULL OR rgb_sig IS NULL
         OR text_tokens IS NULL
      ORDER BY created_at`,
  );
  if (!rows.length) {
    console.log('✓ همهٔ طرح‌ها امضای کامل دارند');
    process.exit(0);
  }
  console.log(`${rows.length} طرح با امضای ناقص`);

  let done = 0;
  let failed = 0;
  for (const r of rows) {
    // `image_url` به شکل `/uploads/images/xxx.webp` است.
    const rel = String(r.image_url || '').replace(/^\/uploads\//, '');
    const file = path.join(uploadRoot, rel);
    try {
      const buf = await fs.promises.readFile(file);
      const fp = await fpEngine.fingerprint(buf);
      await pool.query(
        `UPDATE photo_card_designs
            SET tex_sig=$1, luma_sig=$2, rgb_sig=$3, text_tokens=$4,
                updated_at=NOW()
          WHERE id=$5`,
        [fp.texSig, fp.lumaSig, fp.rgbSig, fp.textTokens || [], r.id],
      );
      done++;
    } catch (e) {
      // فایلِ گم‌شده نباید کلِ اجرا را متوقف کند؛ بقیه باید پر شوند.
      failed++;
      console.log(`  ✗ ${r.id}: ${e.message}`);
    }
  }
  console.log(`✓ ${done} طرح به‌روز شد${failed ? `، ${failed} ناموفق` : ''}`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
