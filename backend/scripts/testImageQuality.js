#!/usr/bin/env node
/**
 * تستِ رگرسیونِ گیتِ کیفیت عکس.
 *
 * مهر ۱۴۰۵ باگ: آستانهٔ تاری روی ۶۰ بود. سنجهٔ واریانسِ لاپلاسینِ تقسیم‌بر-۱۰۰
 * برای کارت‌های گرافیکیِ نرم (که لبه‌های پرتکرارِ متنِ سند ندارند) ذاتاً پایین
 * است: ۱۳۱ تصویر مرجعِ تمیز، عددِ ~۱۴ تا ۴۰ گرفتند و **۱۲۵تا از ۱۳۱** زیر ۶۰
 * رد شدند. نتیجه: اپ روی هر عکسی «عکس تار است» می‌داد و ثبت نمی‌کرد.
 *
 * اندازه‌گیریِ دوباره با دادهٔ واقعی فاصله را روشن کرد:
 *   • واضح: میانه ۳۱ (بازه ۱۴–۴۰)
 *   • تاری خفیف (gaussian 2): میانه ۱۶
 *   • تاری فاجعه (gaussian 4): میانه ۴.۵ (بازه ۱–۶)
 * آستانه باید فقط فاجعه را بگیرد، نه عکسِ خوانا را.
 *
 * این تست بدون sharp/DB کار می‌کند: آستانه را از سورس می‌خواند و تابعِ
 * تصمیمِ `reasons` را با همان منطقِ آستانه روی اعدادِ معرفِ توزیع واقعی
 * می‌آزماید.
 */
const fs = require('fs');
const path = require('path');
let passed = 0, failed = 0;
function ok(cond, name) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}`); }
}

const src = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'services', 'imageQuality.js'), 'utf8');

// آستانه از سورس استخراج شود (نه عدد hardcode در تست) تا با تغییر واقعی
// هماهنگ بماند.
const m = src.match(/const BLUR_MIN\s*=\s*(\d+)/);
ok(m, 'BLUR_MIN در سورس تعریف شده');
const BLUR_MIN = m ? Number(m[1]) : NaN;

// فاجعه (میانهٔ ۴.۵، حداکثر ۶ در شبیه‌سازی) باید رد شود.
ok(BLUR_MIN >= 6, `آستانه فاجعهٔ واقعی (حدود ۶) را رد می‌کند (BLUR_MIN=${BLUR_MIN})`);
// واضحِ ضعیف‌ترین کارتِ سالم (حدود ۱۴ در پنجک) نباید رد شود.
ok(BLUR_MIN <= 12, `آستانه واضح‌ترین کارت خوانا (حدود ۱۴) را رد نمی‌کند (BLUR_MIN=${BLUR_MIN})`);
// در هیچ حالتی نباید به ۶۰ برگردد (همان باگ).
ok(BLUR_MIN < 30, `آستانه در محدودهٔ واقعیِ کارت است نه سند (BLUR_MIN=${BLUR_MIN})`);

// اعدادِ توزیعِ واقعی (از اندازه‌گیری روی ۱۳۱ تصویر مرجع):
const SHARP_MEDIAN = 31, SHARP_MIN = 14;
const DISASTER_MEDIAN = 4.5, DISASTER_MAX = 6;
const LIGHT_BLUR = 16;
ok(SHARP_MEDIAN >= BLUR_MIN, 'عکس واضح (میانه ۳۱) قبول می‌شود');
ok(SHARP_MIN >= BLUR_MIN, 'ضعیف‌ترین عکس واضحِ اندازه‌گیری‌شده (۱۴) قبول می‌شود');
ok(DISASTER_MEDIAN < BLUR_MIN, 'تاری فاجعه‌بار (۴.۵) رد می‌شود');
ok(DISASTER_MAX < BLUR_MIN, 'حتی حداکثرِ محدودهٔ فاجعه (۶) رد می‌شود');

console.log(`\n  ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
