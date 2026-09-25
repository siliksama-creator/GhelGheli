#!/usr/bin/env node
/**
 * انتشارِ APK از خطِ فرمان (همان کاری که صفحهٔ «انتشار اپ» در پنل می‌کند).
 *
 * ── چرا هم پنل هم CLI ────────────────────────────────────────────────────
 *
 * پنل برای کارِ روزمره است: فایل را از گیت‌هاب بردار و بگذار. اما روی خودِ
 * سرور، APK گاهی همین‌جا کنارِ دست است (آرتیفکتِ رانر، یا فایلِ کش‌شده در
 * /root) و آپلودِ ۶۰ مگابایت از اینترنتِ ادمین به سرورِ خودش بی‌معنی است.
 * این اسکریپت همان endpointِ پنل را صدا می‌زند — یعنی یک مسیرِ کد، دو
 * ورودی، و هیچ منطقِ تکراری که فردا از هم جدا بیفتد.
 *
 * مصرف (روی سرور، از پوشهٔ backend):
 *
 *   npm run apk:publish -- /root/app-arm64-v8a-release.apk 1.1.20
 *   npm run apk:publish -- ./app.apk 1.1.20 --notes "رفع باگ ورود" --force
 *   npm run apk:publish -- ./app.apk 1.1.20 --no-url            # فقط آرشیو
 *   npm run apk:publish -- ./app.apk 1.1.20 --min               # به‌روزرسانیِ واجب
 *
 * اختیارها:
 *   --notes "متن"   یادداشتِ نسخه
 *   --code 22       کدِ نسخه (versionCode)
 *   --force         به‌روزرسانی اجباری (کاربر تا آپدیت نکردن استفاده نکند)
 *   --no-url        لینکِ به‌روزرسانی را عوض نکن
 *   --min           حداقلِ نسخه را بالا ببر (کاربرانِ قدیمی‌تر وادار می‌شوند)
 *                   پیش‌فرض **بالا نمی‌رود**: انتشار عادی جلوی استفاده را
 *                   نمی‌گیرد. `--no-min` هم برای سازگاری با اسکریپت‌های قدیمی
 *                   پذیرفته می‌شود (بی‌اثر، چون حالا همین رفتار پیش‌فرض است).
 *
 * چرا curl و نه fetch: فایلِ ۶۰ مگابایتی با curl **استریم** می‌شود و کلِ
 * فایل در حافظهٔ پروسه نمی‌نشیند؛ روی سروری که هم‌زمان به کاربر سرویس
 * می‌دهد، همین تفاوت مهم است.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const argv = process.argv.slice(2);
const positional = argv.filter((a) => !a.startsWith('--'));
const has = (flag) => argv.includes(flag);
const valueOf = (flag) => {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : undefined;
};

const file = positional[0];
const version = positional[1] || '';
if (!file) {
  console.error('استفاده: npm run apk:publish -- <مسیر فایل APK> [نسخه] [--notes "..."]');
  process.exit(1);
}
const abs = path.resolve(file);
if (!fs.existsSync(abs)) {
  console.error(`فایل پیدا نشد: ${abs}`);
  process.exit(1);
}

const port = process.env.PORT || 4000;
const base = process.env.PUBLIC_API_URL_LOCAL || `http://127.0.0.1:${port}`;
const username = process.env.MAIN_ADMIN_USERNAME;
const password = process.env.MAIN_ADMIN_PASSWORD;
if (!username || !password) {
  console.error('MAIN_ADMIN_USERNAME/MAIN_ADMIN_PASSWORD در .env نیست');
  process.exit(1);
}

function curl(args) {
  return execFileSync('curl', ['-sS', '--max-time', '900', ...args], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
}

// ۱) ورودِ مدیر — همان endpointی که پنل استفاده می‌کند.
const loginRaw = curl([
  '-X', 'POST', `${base}/api/admin/auth/login`,
  '-H', 'content-type: application/json',
  '-d', JSON.stringify({ username, password }),
]);
let token = '';
try { token = JSON.parse(loginRaw).token || ''; } catch { /* پایین گزارش می‌شود */ }
if (!token) {
  console.error('ورودِ مدیر ناموفق بود:', loginRaw.slice(0, 200));
  process.exit(1);
}

// ۲) آپلود با همان پارامترهایی که فرمِ پنل می‌فرستد.
const form = [
  '-F', `file=@${abs}`,
  '-F', `version=${version}`,
  '-F', `versionCode=${valueOf('--code') || ''}`,
  '-F', `notes=${valueOf('--notes') || ''}`,
  '-F', `setUpdateUrl=${has('--no-url') ? 'false' : 'true'}`,
  // ⚠️ پیش‌فرض «نه»: انتشارِ تازه به‌خودی‌خود «حداقلِ نسخه» را بالا نمی‌برد
  //    و کاربران را وادار به به‌روزرسانی نمی‌کند (دستورِ مالک، ۴ مهر ۱۴۰۵:
  //    «لطفا apk رو موقع انتشار فورس اپدیت نکن»). کاربر نسخهٔ تازه را
  //    می‌بیند، ولی می‌تواند بعداً نصب کند. بالا بردنِ حداقلِ نسخه فقط با
  //    `--min` صریح (برای رفعِ امنیتیِ واجب) انجام می‌شود.
  '-F', `promoteMinVersion=${has('--min') && !has('--no-min') ? 'true' : 'false'}`,
  '-F', `forceUpdate=${has('--force') ? 'true' : 'false'}`,
];

const out = curl([
  '-X', 'POST', `${base}/api/admin/apk/upload`,
  '-H', `Authorization: Bearer ${token}`,
  ...form,
]);

let body = {};
try { body = JSON.parse(out); } catch { /* خام چاپ می‌شود */ }
if (body.ok) {
  const r = body.release;
  console.log('✅ منتشر شد');
  console.log(`   نسخه: ${r.version}${r.versionCode ? ` (+${r.versionCode})` : ''}`);
  console.log(`   فایل: ${r.filename}  (${(r.sizeBytes / 1048576).toFixed(1)} مگابایت)`);
  console.log(`   لینکِ اپ:  ${r.url}`);
  console.log(`   لینکِ وب:  ${r.webUrl}`);
  console.log(`   SHA-256:  ${r.sha256}`);
  if (body.applied?.minVersion) {
    console.log(`   حداقلِ نسخه: ${body.applied.minVersion}${body.applied.forceUpdate ? ' (اجباری)' : ''}`);
  }
  if (body.pruned?.length) console.log(`   پاک‌شدهٔ قدیمی: ${body.pruned.join(', ')}`);
} else {
  console.error('❌ انتشار ناموفق:', body.message || out.slice(0, 300));
  process.exit(1);
}
