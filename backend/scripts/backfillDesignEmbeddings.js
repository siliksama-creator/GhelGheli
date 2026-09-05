/**
 * بک‌فیلِ بردارِ عصبیِ طرح‌های مرجع (فاز ۲ — یک‌بار در عمرِ مدل).
 *
 * بردارها از قبل روی کلاینت/خارج (با همان مدلِ ONNX که به گوشی منتقل می‌شود)
 * ساخته شده‌اند و در یک فایل JSON به شکل { "<design_id>": [1280 float] }
 * در دسترس‌اند. این اسکریپت آن‌ها را با همان `sanitizeEmbedding` مسیر زنده
 * پالوده/نرمال می‌کند و در `photo_card_designs.embedding` می‌نشاند.
 *
 * اجرا (روی سرور، با env دیتابیس):
 *   node scripts/backfillDesignEmbeddings.js /path/to/embeddings.json [--apply]
 *
 * بدون `--apply` فقط گزارش می‌دهد (dry-run). هیچ ربطی به تصمیمِ زنده ندارد؛
 * پرشدنِ بردار صرفاً لایهٔ فیوژن را فعال می‌کند که فعلاً در حالت سایه است.
 */
const fs = require('fs');
const { sanitizeEmbedding, EMBEDDING_VERSION } = require('../src/services/cardEmbedding');

async function main() {
  const file = process.argv[2];
  const apply = process.argv.includes('--apply');
  if (!file) {
    console.error('usage: node backfillDesignEmbeddings.js <embeddings.json> [--apply]');
    process.exit(1);
  }
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  const { rows } = await pool.query(
    `SELECT id FROM photo_card_designs WHERE is_active = true`);
  const activeIds = new Set(rows.map(r => r.id));

  let ok = 0, skipped = 0, missing = 0;
  for (const [designId, vec] of Object.entries(data)) {
    if (!activeIds.has(designId)) { skipped++; continue; }
    const clean = sanitizeEmbedding(vec);
    if (!clean) { skipped++; continue; }
    if (apply) {
      await pool.query(
        `UPDATE photo_card_designs
            SET embedding=$1, embedding_version=$2, updated_at=NOW()
          WHERE id=$3`,
        [JSON.stringify(clean.v), clean.version, designId]);
    }
    ok++;
  }
  missing = activeIds.size - ok;
  console.log(
    `${apply ? 'APPLY' : 'DRY-RUN'}: ${ok} طرح بردار گرفتند`
    + `، ${skipped} رد شد، ${Math.max(0, missing)} طرح فعال بدون بردار ماند.`
    + ` نسخه=${EMBEDDING_VERSION}`);
  if (!apply) console.log('برای نوشتن واقعی: --apply را اضافه کن.');
  await pool.end();
}
main().catch(e => { console.error(e); process.exit(1); });
