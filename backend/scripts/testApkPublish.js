/**
 * انتشارِ APK — هشِ کنارِ هر فایل باید با خودِ فایل بخواند.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * چرا این تست وجود دارد
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * هنگامِ انتشارِ ۱.۱.۳۱ (مهر ۱۴۰۵) روی سرورِ زنده دیده شد که
 * `ghelgheli-latest.apk.sha256` هنوز هشِ **۱.۱.۳۰** را نشان می‌دهد، در حالی
 * که `ghelgheli-latest.apk` همان لحظه با نسخه‌ی تازه جایگزین شده بود.
 *
 * علت: مسیرِ انتشار فقط sidecarِ فایلِ **نسخه‌دار** را می‌نوشت
 * (`ghelgheli-1.1.31.apk.sha256`) و هرگز sidecarِ «آخرین نسخه» را به‌روز
 * نمی‌کرد. nginx هر دو را از یک پوشه سرو می‌کند
 * (`deploy/ghelgheli-apk.conf`) و توضیحاتِ خودِ route قول می‌دهد هش در کنارِ
 * هر فایل است — پس هر ابزار یا بررسی‌ای که `ghelgheli-latest.apk` را با
 * sidecarِ خودش بسنجد، ناهماهنگی می‌گیرد.
 *
 * چرا کسی نفهمید: خودِ اپ هش را از **رکوردِ** `/app/latest` می‌گیرد
 * (`app_updater.dart`) نه از این فایل، و آن رکورد درست بود. یعنی چیزی که
 * خراب بود دقیقاً همان چیزی بود که هیچ‌کس چک نمی‌کرد.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * چه چیزی سنجیده می‌شود
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ۱. مسیرِ انتشار، sidecarِ «آخرین نسخه» را هم می‌نویسد؛
 * ۲. آن را **داخل** شاخهٔ `!archiveOnly` می‌نویسد — یعنی در انتشارِ آرشیوی،
 *    که فایلِ latest دست‌نخورده می‌ماند، هشِ آن هم عوض نمی‌شود؛
 * ۳. sidecarِ فایلِ نسخه‌دار هنوز نوشته می‌شود؛
 * ۴. پاک‌سازیِ نسخه‌های قدیمی، sidecarِ latest را پاک نمی‌کند؛
 * ۵. اگر پوشهٔ APK روی همین دستگاه وجود داشته باشد (مثلِ خودِ سرور)، هشِ
 *    هر فایلِ منتشرشده روی دیسک واقعاً با sidecarِ کنارش یکی است.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..', '..');
const ROUTE = path.join(ROOT, 'backend/src/routes/adminApk.js');
const APK_DIR = process.env.APK_DIR || '/var/www/ghelgheli-apk';

let pass = 0, fail = 0;
const ok = (cond, msg) => {
  if (cond) { pass++; console.log(`  ✓ ${msg}`); }
  else { fail++; console.error(`  ✗ ${msg}`); }
};

const src = fs.readFileSync(ROUTE, 'utf8');

// متنِ شاخه‌ای که فایلِ «آخرین نسخه» را می‌سازد.
const latestBlock = (() => {
  const start = src.indexOf('if (!archiveOnly) {');
  if (start < 0) return '';
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  return '';
})();

console.log('\n== هشِ کنارِ هر فایل ==');
ok(latestBlock.length > 0, 'شاخه‌ی «به‌روزرسانیِ آخرین نسخه» در مسیرِ انتشار پیدا شد');
ok(/\$\{latestPath\}\.sha256/.test(latestBlock),
  'sidecarِ «آخرین نسخه» همراهِ خودِ فایل نوشته می‌شود');
ok(!/\$\{latestPath\}\.sha256/.test(src.replace(latestBlock, '')),
  'و بیرونِ آن شاخه نوشته نمی‌شود — یعنی در انتشارِ آرشیوی دست‌نخورده می‌ماند');
ok(/\$\{finalPath\}\.sha256/.test(src), 'sidecarِ فایلِ نسخه‌دار هم نوشته می‌شود');
ok(/LATEST_NAME/.test(latestBlock),
  'درونِ sidecarِ آخرین نسخه، نامِ همان فایل می‌آید (نه نامِ نسخه‌دار)');

console.log('\n== پاک‌سازی، sidecarِ زنده را پاک نمی‌کند ==');
{
  const pruneStart = src.indexOf('async function pruneOldVersions');
  const prune = pruneStart < 0 ? '' : src.slice(pruneStart, pruneStart + 900);
  ok(prune.includes('isVersioned'),
    'پاک‌سازی فقط روی فایل‌های نسخه‌دار اجرا می‌شود، نه روی latest');
  ok(prune.includes(`${'${f.name}'}.sha256`) || prune.includes('${f.name}.sha256'),
    'sidecarِ هر فایلِ حذف‌شده هم پاک می‌شود');
}

console.log('\n== بررسیِ زنده (اگر پوشه‌ی APK همین‌جاست) ==');
if (!fs.existsSync(APK_DIR)) {
  console.log(`  ℹ️ پوشه‌ی APK در این محیط نیست (${APK_DIR}) — بررسیِ دیسک رد شد`);
} else {
  const names = fs.readdirSync(APK_DIR).filter((n) => n.endsWith('.apk'));
  let checked = 0, mismatched = [];
  for (const name of names) {
    const side = path.join(APK_DIR, `${name}.sha256`);
    if (!fs.existsSync(side)) { mismatched.push(`${name} (sidecar ندارد)`); continue; }
    const digest = crypto.createHash('sha256')
      .update(fs.readFileSync(path.join(APK_DIR, name)))
      .digest('hex');
    const declared = fs.readFileSync(side, 'utf8').trim().split(/\s+/)[0];
    checked++;
    if (declared !== digest) {
      mismatched.push(`${name}: sidecar می‌گوید ${declared.slice(0, 12)}… واقعی ${digest.slice(0, 12)}…`);
    }
  }
  ok(checked > 0, `دست‌کم یک APK با sidecar بررسی شد (${checked} فایل)`);
  ok(mismatched.length === 0,
    mismatched.length ? `هشِ کهنه: ${mismatched.join(' | ')}` : 'هشِ همه‌ی فایل‌ها با sidecarِ کنارشان یکی است');
}

console.log(`\n✓ ${pass} تست موفق، ${fail} ناموفق`);
if (fail > 0) process.exit(1);
