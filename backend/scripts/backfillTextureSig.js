/**
 * پر کردنِ امضای بافت برای طرح‌هایی که پیش از مایگریشن ۰۳۷ ثبت شده‌اند.
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
      WHERE tex_sig IS NULL OR luma_sig IS NULL ORDER BY created_at`,
  );
  if (!rows.length) {
    console.log('✓ همهٔ طرح‌ها امضای بافت دارند');
    process.exit(0);
  }
  console.log(`${rows.length} طرح بدون امضای بافت`);

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
        'UPDATE photo_card_designs SET tex_sig=$1, luma_sig=$2, updated_at=NOW() WHERE id=$3',
        [fp.texSig, fp.lumaSig, r.id],
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
