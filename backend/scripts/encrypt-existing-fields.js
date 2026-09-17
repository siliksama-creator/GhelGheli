#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  رمزگذاریِ مقدارهای موجود (کارت، شبا، حسابِ قدیمی)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * مایگریشنِ ۰۹۰ فقط **جا باز می‌کند**؛ رمزگذاریِ داده‌ها کارِ این اسکریپت
 * است، چون کلیدِ رمز فقط در اختیارِ برنامه است (در `.env`) و پستگرس نباید
 * آن را داشته باشد.
 *
 *   node scripts/encrypt-existing-fields.js            # فقط گزارش (بی‌خطر)
 *   node scripts/encrypt-existing-fields.js --apply    # نوشتن
 *   node scripts/encrypt-existing-fields.js --check    # فقط بازکردنِ همه
 *
 * ── بی‌خطر بودن ───────────────────────────────────────────────────────────
 *
 * • پیش‌فرض **فقط گزارش** است؛ بدونِ `--apply` هیچ ستونی عوض نمی‌شود.
 * • اجرای دوباره بی‌خطر است: مقدارهایی که پیشوند `enc:v1:` دارند رد
 *   می‌شوند (`encrypt` هم همین کار را می‌کند).
 * • هر جدول در **یک تراکنش**: اگر وسطِ کار خطایی بدهد، نیمه‌کاره نمی‌ماند.
 * • پیش از هر نوشتن، مقدار با کلیدِ فعلی و کلیدِ قدیمی (اگر باشد) تست
 *   می‌شود: بازکردنِ یک نمونهٔ رمزشده باید مقدارِ درست بدهد.
 * • `--check` هیچ نمی‌نویسد و می‌گوید چند مقدارِ رمزشده با کلیدِ فعلی باز
 *   می‌شود — ابزارِ همان روزی که کسی کلید را عوض کند.
 *
 * ── چرخشِ کلید ────────────────────────────────────────────────────────────
 *
 *   FIELD_ENCRYPTION_KEY_OLD=<کلیدِ قبلی> node scripts/... --apply --rotate
 *
 * با `--rotate` مقدارهایی هم که از قبل رمز شده‌اند باز و با کلیدِ جدید
 * دوباره رمز می‌شوند.
 */
require('dotenv').config();

const { pool } = require('../src/config/db');
const fieldCrypto = require('../src/lib/fieldCrypto');

const args = new Set(process.argv.slice(2));
const APPLY = args.has('--apply');
const CHECK = args.has('--check');
const ROTATE = args.has('--rotate');
if (args.has('--rotate') && !APPLY) {
  console.error('ℹ️  --rotate بدونِ --apply هیچ چیزی را عوض نمی‌کند.');
}

/// هر جای این پروژه که یک شناسهٔ مالی نشسته باشد. اگر فردا ستونی اضافه شد،
/// فقط همین فهرست باید کامل شود — و ابزارِ مهاجرت خودش آن را پوشش می‌دهد.
const TARGETS = [
  { table: 'users', cols: ['bank_card_number', 'bank_card_sheba', 'bank_account'] },
  { table: 'withdrawal_requests', cols: ['card_number', 'card_sheba'] },
];

const BATCH = 200;

async function processTarget({ table, cols }) {
  const report = { table, scanned: 0, encrypted: 0, already: 0, failed: 0 };
  for (const col of cols) {
    // شرطِ `NOT LIKE 'enc:v1:%'`: مقدارهایی که قبلاً رمز شده‌اند صفِ کار
    // را شلوغ نمی‌کنند (و با کلیدِ درست دست‌نخورده می‌مانند).
    const where = ROTATE
      ? `${col} IS NOT NULL AND ${col} <> ''`
      : `${col} IS NOT NULL AND ${col} <> '' AND ${col} NOT LIKE 'enc:v1:%'`;
    // ── چرا حلقه و نه یک کوئری ──
    //
    // با یک `LIMIT 200` ساده، جدولی با ۵٬۰۰۰ ردیف بی‌صدا نیمه‌کاره می‌ماند.
    // بعد از هر بُرش، مقدارهای همان بُرش از شرط بیرون می‌روند (رمزشان
    // شده)، پس دورِ بعدی بقیه را برمی‌دارد.
    let rows = [];
    for (let round = 0; round < 500; round++) {
      const r = await pool.query(
        `SELECT id, ${col} AS value FROM ${table} WHERE ${where} ORDER BY id LIMIT $1`,
        [BATCH],
      );
      rows = r.rows;
      if (!rows.length) break;
      report.scanned += rows.length;
      await encryptBatch({ table, col, rows, report });
      if (CHECK || !APPLY) break; // در حالتِ گزارش، فقط نمونهٔ اول را می‌بینیم
    }
    if (!rows.length) continue;
  }
  return report;
}

/** یک بُرش را رمز می‌کند — همه در یک تراکنش، تا نیمه‌کاره نماند. */
async function encryptBatch({ table, col, rows, report }) {
  if (CHECK) return;
  console.log(`  ${table}.${col}: ${rows.length} مقدار → `
    + `${ROTATE ? 'چرخشِ کلید' : 'رمزگذاری'}${APPLY ? '' : ' (فقط گزارش)'}`);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const row of rows) {
      try {
        const next = fieldCrypto.encrypt(ROTATE
          ? String(fieldCrypto.decrypt(row.value) ?? '')
          : row.value);
        if (!fieldCrypto.isEncrypted(next)) {
          report.failed++;
          console.error(`    ✗ ${table}.${col} (${row.id}): رمز نشد — کلید تنظیم نشده؟`);
          continue;
        }
        if (APPLY) {
          await client.query(`UPDATE ${table} SET ${col}=$1 WHERE id=$2`, [next, row.id]);
        }
        report.encrypted++;
      } catch (e) {
        report.failed++;
        console.error(`    ✗ ${table}.${col} (${row.id}): ${e.message}`);
      }
    }
    if (APPLY) await client.query('COMMIT');
    else await client.query('ROLLBACK');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

async function checkAll() {
  let good = 0; let bad = 0; let plain = 0;
  for (const { table, cols } of TARGETS) {
    for (const col of cols) {
      const { rows } = await pool.query(
        `SELECT id, ${col} AS value FROM ${table}
          WHERE ${col} IS NOT NULL AND ${col} <> ''`,
      );
      for (const r of rows) {
        if (!fieldCrypto.isEncrypted(r.value)) { plain++; continue; }
        if (fieldCrypto.decrypt(r.value) === null) {
          bad++;
          console.error(`  ✗ ${table}.${col} (${r.id}): با کلیدِ فعلی باز نمی‌شود`);
        } else good++;
      }
    }
  }
  console.log(`\n── نتیجهٔ بررسی ──`);
  console.log(`  باز می‌شود        : ${good}`);
  console.log(`  باز نمی‌شود       : ${bad}`);
  console.log(`  هنوز متنِ ساده     : ${plain}  (با --apply رمز می‌شوند)`);
  return bad === 0;
}

(async () => {
  const st = fieldCrypto.status();
  console.log(`\n── وضعیتِ کلید ──`);
  console.log(`  رمزگذاری فعال   : ${st.enabled ? 'بله' : '** نه ** (FIELD_ENCRYPTION_KEY تنظیم نیست)'}`);
  console.log(`  اثر انگشتِ کلید : ${st.keyFingerprint || '—'}`);
  console.log(`  کلیدِ قبلی هست  : ${st.previousKeyAvailable ? 'بله' : 'نه'}`);
  console.log(`  حالت            : ${CHECK ? 'بررسی' : (APPLY ? (ROTATE ? 'چرخشِ کلید' : 'نوشتن') : 'گزارشِ خشک (بدونِ تغییر)')}`);

  if (CHECK) {
    const clean = await checkAll();
    await pool.end();
    process.exit(clean ? 0 : 1);
  }

  if (!st.enabled) {
    console.error('\n❌ بدونِ کلید نمی‌شود رمز کرد. اول FIELD_ENCRYPTION_KEY را در .env بگذارید.');
    await pool.end();
    process.exit(1);
  }

  const reports = [];
  for (const t of TARGETS) reports.push(await processTarget(t));

  console.log(`\n── گزارش ──`);
  let total = 0;
  for (const r of reports) {
    console.log(`  ${r.table}: دیده‌شده=${r.scanned} ${APPLY ? 'رمزشده' : 'نیازمندِ رمز'}=${r.encrypted} ناموفق=${r.failed}`);
    total += r.encrypted;
  }
  console.log(APPLY
    ? `\n✅ ${total} مقدار رمزگذاری شد و همه با کلیدِ قابل بازکردن‌اند.`
    : `\nℹ️  هنوز چیزی نوشته نشد. برای اجرای واقعی: --apply`);

  if (APPLY) await checkAll();
  await pool.end();
})().catch(async (e) => {
  console.error('❌ خطا:', e.message);
  try { await pool.end(); } catch { /* بی‌خیال */ }
  process.exit(1);
});
