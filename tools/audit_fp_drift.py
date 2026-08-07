# -*- coding: utf-8 -*-
"""ممیزیِ «رانشِ اثرانگشت» — آیا داده‌های ذخیره‌شده با فایلِ روی دیسک می‌خوانند؟

═══════════════════════════════════════════════════════════════════════════
باگی که این ابزار برای گرفتنش ساخته شد
═══════════════════════════════════════════════════════════════════════════

کاربر عکسِ کارتِ Hakimi فرستاد و سیستم «Erling Haaland» حدس زد. OCR روی
عکسِ کاربر **درست** خوانده بود (`HAKIA, MOROCCO`) ولی رتبه‌بندی غلط شد.

علت: اثرانگشتِ طرح از تصویرِ **خام** گرفته می‌شد، ولی فایلی که ذخیره و
بعداً مقایسه می‌شود نسخهٔ **بهینه‌شده** است (کوچک‌تر، webp).

دو تصویرِ متفاوت یعنی دو مجموعه توکنِ متفاوت:

    پشتِ Haaland — ذخیره‌شده : ["ANKZ","#2","#7","#4","#3","#0"]
    پشتِ Haaland — از فایل    : []

آن شش توکنِ نویزی در دیتابیس ماندند و در هر مقایسه شرکت می‌کردند. عکسِ
Hakimi با `#2` و `#4` به آن‌ها می‌خورد و Haaland را بالا می‌کشید.

⚠️ چرا تستِ سرتاسری این را نگرفت: آن تست‌ها اثرانگشت را از همان بافرِ
   خودشان می‌سازند، پس هر دو طرف یکسان‌اند و ناسازگاری دیده نمی‌شود.
   فقط مقایسهٔ **دادهٔ واقعیِ دیتابیس** با **فایلِ واقعیِ دیسک** آن را
   نشان می‌دهد — و این ابزار دقیقاً همان کار را می‌کند.

اجرا:
    python3 tools/audit_fp_drift.py            # گزارش
    python3 tools/audit_fp_drift.py --fix      # اثرانگشت‌ها را بازسازی می‌کند
"""
import subprocess
import sys

RX = '/home/user/tools/rx.py'

PROBE = r'''
const fs = require('fs');
const fp = require('/var/www/GhelGheli/backend/src/services/imageFingerprint');
const cardCrop = require('/var/www/GhelGheli/backend/src/services/cardCrop');
const { Pool } = require('/var/www/GhelGheli/backend/node_modules/pg');
require('/var/www/GhelGheli/backend/node_modules/dotenv')
  .config({ path: '/var/www/GhelGheli/backend/.env' });

const DIR = '/var/www/GhelGheli/backend/uploads/images/';
const toF = v => (Array.isArray(v) ? v.map(Number) : []);
const FIX = process.argv.includes('--fix');

// ⚠️ همان پیش‌پردازشی که مسیرِ ثبت انجام می‌دهد: برش، بعد اثرانگشت.
// اگر اینجا فرق کند، ممیزی خودش هشدارِ دروغین می‌سازد.
async function rebuild(file) {
  const raw = fs.readFileSync(file);
  let b = raw;
  try {
    const c = await cardCrop.cropCard(raw);
    if (c.cropped) b = c.buffer;
  } catch { /* در تردید، خام */ }
  return fp.fingerprint(b);
}

(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const { rows } = await pool.query(
    `SELECT d.id, d.image_url, d.text_tokens, d.dhash, d.rgb_sig, t.name
       FROM photo_card_designs d JOIN card_types t ON t.id = d.card_type_id
      WHERE d.is_active = true ORDER BY t.name`);

  let drift = 0;
  for (const r of rows) {
    const file = DIR + String(r.image_url).split('/').pop();
    if (!fs.existsSync(file)) {
      console.log(`✗ ${r.name}: فایل روی دیسک نیست — ${file}`);
      drift++;
      continue;
    }
    const live = await rebuild(file);
    const dbTok = Array.isArray(r.text_tokens) ? r.text_tokens : [];
    const liveTok = live.textTokens || [];

    const sameText = JSON.stringify([...dbTok].sort())
      === JSON.stringify([...liveTok].sort());
    // dHash بایت‌به‌بایت مقایسه می‌شود: اگر تصویر همان باشد باید یکی باشند.
    const sameHash = Buffer.compare(
      Buffer.from(r.dhash || []), Buffer.from(live.dhash)) === 0;

    if (sameText && sameHash) {
      console.log(`✓ ${r.name}  (${dbTok.length} توکن)`);
      continue;
    }
    drift++;
    console.log(`✗ ${r.name}`);
    if (!sameHash) console.log('    dHash فرق دارد → اثرانگشت از فایلِ دیگری است');
    if (!sameText) {
      console.log(`    متنِ DB   (${dbTok.length}): ${JSON.stringify(dbTok).slice(0, 90)}`);
      console.log(`    متنِ فایل (${liveTok.length}): ${JSON.stringify(liveTok).slice(0, 90)}`);
    }
    if (FIX) {
      await pool.query(
        `UPDATE photo_card_designs
            SET dhash=$1, phash=$2, color_sig=$3, tex_sig=$4, luma_sig=$5,
                rgb_sig=$6, text_tokens=$7, width=$8, height=$9, updated_at=NOW()
          WHERE id=$10`,
        [live.dhash, live.phash, live.colorSig, live.texSig, live.lumaSig,
          live.rgbSig, liveTok, live.width, live.height, r.id]);
      console.log('    ↻ بازسازی شد');
    }
  }
  console.log(`\n${drift ? '✗' : '✓'} ${rows.length - drift}/${rows.length} طرح هم‌خوان`
    + (drift && !FIX ? '  — برای رفع: --fix' : ''));
  await pool.end();
  process.exit(drift && !FIX ? 1 : 0);
})();
'''


def main():
    fix = '--fix' in sys.argv
    script = (
        "cat > /tmp/_fpdrift.js <<'XEOF'\n" + PROBE + "\nXEOF\n"
        "cd /var/www/GhelGheli/backend && node /tmp/_fpdrift.js"
        + (' --fix' if fix else '')
        + "; rm -f /tmp/_fpdrift.js")
    out = subprocess.run(['python3', RX, script],
                         capture_output=True, text=True, timeout=900)
    print(out.stdout.strip())
    if out.stderr.strip():
        print('STDERR:', out.stderr.strip()[:600])
    return 0


if __name__ == '__main__':
    sys.exit(main())
