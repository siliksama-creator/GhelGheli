#!/usr/bin/env node
/**
 * تستِ رگرسیونِ گیتِ کیفیت عکس.
 *
 * مهر ۱۴۰۵، دو باگ پشت سر هم:
 *   ۱. آستانهٔ تاری روی ۶۰ بود ولی سنجهٔ واریانسِ لاپلاسین برای کارتِ گرافیکیِ
 *      نرم ذاتاً ~۱۴–۴۰ می‌دهد؛ پس ۱۲۵ از ۱۳۱ تصویرِ کاملاً واضح رد می‌شدند
 *      («هر عکسی تار است»).
 *   ۲. بعد از پایین‌آوردن به ۸، عکسِ واقعیِ دوربینِ دستی (نرم‌تر از طرحِ
 *      مرجع) باز هم گاهی زیر ۸ می‌افتاد.
 *
 * تصمیم نهاییِ طراحی: «تار» سخت رد نمی‌شود — عکسِ تار یا خودکار درست تطبیق
 * می‌خورد یا به صفِ مدیر می‌رود (هرگز تأییدِ غلط ندارد؛ شبیه‌سازیِ ۵۶ کارت با
 * تاریِ شدید صفر تأییدِ غلط داشت). فقط عکسِ خوانانشدنِ واقعی (تاریک/سوخته/تخت)
 * سخت ۴۲۲ می‌گیرد.
 *
 * این تست بدون sharp/DB کار می‌کند و قراردادِ مهم را در سورس می‌آزماید:
 *   • آستانهٔ تاری در محدودهٔ واقعیِ کارت مانده (نه ۶۰).
 *   • مسیرِ ثبت، دلیلِ 'blur' را از فهرستِ ردِ سخت کنار می‌گذارد.
 */
const fs = require('fs');
const path = require('path');
let passed = 0, failed = 0;
function ok(cond, name) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}`); }
}

const serviceSrc = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'services', 'imageQuality.js'), 'utf8');
const routeSrc = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'routes', 'photoCards.js'), 'utf8');

const m = serviceSrc.match(/const BLUR_MIN\s*=\s*(\d+)/);
ok(m, 'BLUR_MIN در سورس تعریف شده');
const BLUR_MIN = m ? Number(m[1]) : NaN;
ok(BLUR_MIN < 30, `آستانهٔ تاری در محدودهٔ واقعیِ کارت است نه سند (BLUR_MIN=${BLUR_MIN})`);
ok(BLUR_MIN >= 4, `آستانه هنوز فاجعهٔ مطلق (~۰) را جدا می‌کند (BLUR_MIN=${BLUR_MIN})`);

// قرارداد کلیدی: دلیلِ 'blur' نباید به‌تنهایی باعث ۴۲۲ شود؛ فقط dark/blown/flat.
ok(/hardReasons\s*=\s*quality\.reasons\.filter\(\s*r\s*=>\s*r\s*!==\s*['"]blur['"]/.test(routeSrc),
  'مسیر ثبت، دلیل «تار» را از ردِ سخت کنار می‌گذارد (تار → صف مدیر، نه بلاک)');
ok(/status:\s*['"]poor_quality['"]/.test(routeSrc),
  'عکسِ خوانانشدن (تاریک/سوخته/تخت) همچنان ۴۲۲ poor_quality می‌گیرد');
ok(/quality\s*blur=/.test(routeSrc) || /quality blur=/.test(routeSrc),
  'سنجه‌های کیفیت برای کالیبراسیونِ آینده لاگ می‌شوند');

console.log(`\n  ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
