/**
 * بک‌فیلِ بردارِ **چهرهٔ** مرجع برای طرح‌های «رو» (فاز ۳ — یک‌بار در عمرِ مدل).
 *
 * بردار چهره (۱۲۸تایی SFace) از قبل روی کلاینت/خارج ساخته و در یک فایل JSON به
 * شکل { "<design_id>": [128 float] } آمده است. این اسکریپت آن را با همان
 * sanitizer مسیر زنده پالوده/نرمال می‌کند و در
 * `photo_card_designs.face_embedding` می‌نشاند. طرح‌های «پشت» چهره ندارند و
 * نادیده گرفته می‌شوند.
 *
 * اجرا (روی سرور، با env دیتابیس):
 *   node scripts/backfillDesignFaceEmbeddings.js /path/to/face.json [--apply]
 */
const fs = require('fs');
const { sanitizeFaceEmbedding, FACE_VERSION } = require('../src/services/cardFace');

async function main() {
  const file = process.argv[2];
  const apply = process.argv.includes('--apply');
  if (!file) {
    console.error('usage: node backfillDesignFaceEmbeddings.js <face.json> [--apply]');
    process.exit(1);
  }
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  // فقط طرح‌های فعال و «رو» (پشت کارت چهره ندارد).
  const { rows } = await pool.query(
    `SELECT id FROM photo_card_designs WHERE is_active = true AND side = 'front'`);
  const frontIds = new Set(rows.map(r => r.id));

  let ok = 0, skipped = 0;
  for (const [designId, vec] of Object.entries(data)) {
    if (!frontIds.has(designId)) { skipped++; continue; }
    const clean = sanitizeFaceEmbedding(vec);
    if (!clean) { skipped++; continue; }
    if (apply) {
      await pool.query(
        `UPDATE photo_card_designs
            SET face_embedding=$1, face_embedding_version=$2, updated_at=NOW()
          WHERE id=$3`,
        [JSON.stringify(clean.v), clean.version, designId]);
    }
    ok++;
  }
  console.log(
    `${apply ? 'APPLY' : 'DRY-RUN'}: ${ok} طرحِ «رو» بردار چهره گرفتند`
    + `، ${skipped} رد شد. نسخه=${FACE_VERSION}`);
  if (!apply) console.log('برای نوشتن واقعی: --apply را اضافه کن.');
  await pool.end();
}
main().catch(e => { console.error(e); process.exit(1); });
