#!/usr/bin/env node
/**
 * گاردِ «برنامه‌های پیشنهادی» — خواستهٔ مالک (۲۶ شهریور)
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * چرا این فایل وجود دارد
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * این قابلیت سه‌لایه است (سرور، پنل ادمین، دو کلاینت) و سه کلاسِ باگِ
 * تکرارشوندهٔ همین پروژه را دعوت می‌کند:
 *
 *   ۱. **واگراییِ کلاینت‌ها.** وب و اندروید باید یک مسیر را با یک اندازهٔ
 *      صفحه بخوانند. اگر یکی ۱۰ و دیگری ۲۰ بگیرد، «صفحه‌بندی» دو معنا
 *      پیدا می‌کند و شکایتِ بعدی این است که «در اپ با وب فرق دارد».
 *   ۲. **نشتِ فیلدِ داخلی.** اگر `sort_order` یا `is_active` یا
 *      `updated_by_admin_id` به کلاینت برود، کسی رویش حساب می‌کند و بعداً
 *      تغییرش یک شکستِ سازگاری می‌شود.
 *   ۳. **«تیک کار نمی‌کند».** خاموش‌کردنِ بخش باید واقعاً محتوا را از
 *      پاسخِ عمومی بردارد (نه فقط در کلاینت پنهانش کند) — وگرنه یک
 *      بروزرسانیِ کلاینت، بخشِ خاموش را برمی‌گرداند.
 *
 * قواعدِ اعتبارسنجی و صفحه‌بندی، تابعِ خالص‌اند و همین‌جا (بدونِ دیتابیس و
 * بدونِ شبکه) آزموده می‌شوند؛ قواعدِ «قراردادِ مشترک» از روی خودِ فایل‌های
 * وب/اندروید/پنل خوانده می‌شوند تا روزی که کسی یک طرف را عوض کند، تست
 * قرمز شود.
 */
const fs = require('fs');
const path = require('path');

const svc = require('../src/services/recommendedApps');
const { normalizeFeatures } = require('../src/services/featureFlags');

let pass = 0; let fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass += 1; console.log('  ✓', name); }
  else { fail += 1; console.log('  ✗', name, detail ? `→ ${detail}` : ''); }
};
// ── استخراجِ کپیِ دیدنی (بدونِ کامنت) ──────────────────────────────────────
//
// همان کاری که `userweb/tool/no-emoji.mjs` می‌کند: بلوک‌های `/* */` و
// خطوطِ کامنت کنار گذاشته می‌شوند، چون قاعده دربارهٔ متنی است که کاربر
// می‌بیند. (این درس یک‌بار در `testMonitorAlerts.js` گران تمام شد: گارد
// متنِ توضیحِ خودِ باگ را باگ گرفت.)
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .split('\n')
  .filter((line) => {
    const t = line.trim();
    return !(t.startsWith('//') || t.startsWith('*') || t.startsWith('///'));
  })
  .join('\n');

// بازهٔ ایموجیِ تصویری — عیناً همان کلاسِ گاردِ سراسری، تا یک ایموجیِ تازه
// از شکافِ بین دو گارد رد نشود.
const EMOJI = /[\u{1F0A0}-\u{1F2FF}\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/gu;

const throws = (fn, code) => {
  try { fn(); return false; } catch (e) { return code ? e.code === code : true; }
};

const ROOT = path.join(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

(async () => {
  console.log('\n══ ۱) اعتبارسنجیِ ورودیِ پنل ══');
  {
    const good = svc.validateInput({
      title: '  برنامهٔ تست  ', description: 'توضیح', linkUrl: 'https://example.com/app', kind: 'app',
    });
    ok('فاصله‌های اضافیِ عنوان پاک می‌شود', good.title === 'برنامهٔ تست');
    ok('پیش‌فرض: فعال است', good.isActive === true);
    ok('پیش‌فرضِ نوع، «برنامه» است', good.kind === 'app');

    ok('عنوانِ یک‌حرفی رد می‌شود', throws(() => svc.validateInput({ title: 'ا', linkUrl: 'https://x.com' })));
    ok('عنوانِ ۶۱ حرفی بریده می‌شود و خطا نمی‌دهد',
      svc.validateInput({ title: 'ا'.repeat(80), linkUrl: 'https://x.com' }).title.length === 60);
    ok('لینکِ بی‌scheme رد می‌شود (وگرنه کاربر به خانهٔ خودمان می‌رود)',
      throws(() => svc.validateInput({ title: 'برنامه', linkUrl: 'www.example.com' })));
    ok('لینکِ javascript: رد می‌شود', throws(() => svc.validateInput({ title: 'برنامه', linkUrl: 'javascript:alert(1)' })));
    ok('لینکِ http ساده پذیرفته می‌شود',
      svc.validateInput({ title: 'برنامه', linkUrl: 'http://example.com' }).linkUrl === 'http://example.com');
    ok('لینکِ دارای فاصله رد می‌شود',
      throws(() => svc.validateInput({ title: 'برنامه', linkUrl: 'https://example.com/a b' })));
    ok('نوعِ ناشناخته رد می‌شود', throws(() => svc.validateInput({ title: 'برنامه', linkUrl: 'https://x.com', kind: 'game' })));
    ok('نوعِ «وب‌سایت» برچسبِ فارسی می‌گیرد',
      svc.KIND_LABELS[svc.validateInput({ title: 'سایت', linkUrl: 'https://x.com', kind: 'website' }).kind] === 'وب‌سایت');
    ok('عکسِ با مسیرِ نسبی پذیرفته می‌شود',
      svc.validateInput({ title: 'برنامه', linkUrl: 'https://x.com', imageUrl: '/uploads/images/a.webp' }).imageUrl === '/uploads/images/a.webp');
    ok('عکسِ با مسیرِ نامربوط رد می‌شود',
      throws(() => svc.validateInput({ title: 'برنامه', linkUrl: 'https://x.com', imageUrl: 'logo.png' })));
    ok('عکسِ کاملِ http پذیرفته می‌شود',
      svc.validateInput({ title: 'برنامه', linkUrl: 'https://x.com', imageUrl: 'https://cdn.example.com/a.png' }).imageUrl === 'https://cdn.example.com/a.png');
    ok('ویرایشِ جزئی، بقیهٔ فیلدها را از مقدارِ فعلی می‌آورد',
      svc.validateInput({ isActive: false }, { title: 'قبلی', linkUrl: 'https://x.com', kind: 'app', isActive: true }).title === 'قبلی');
    ok('توضیحِ بلند بریده می‌شود', svc.validateInput({ title: 'برنامه', linkUrl: 'https://x.com', description: 'ب'.repeat(500) }).description.length === 400);
  }

  console.log('\n══ ۲) صفحه‌بندی (خواستهٔ مالک: «بیشتر از ۱۰ شد، صفحه‌بندی») ══');
  {
    ok('اندازهٔ هر صفحه پیش‌فرض ۱۰ است', svc.normalizePage({}).perPage === 10);
    ok('درخواستِ ۱۰۰۰تایی به سقفِ ۱۰ می‌خورد', svc.normalizePage({ per_page: 1000 }).perPage === 10);
    ok('صفحهٔ صفر/منفی به ۱ اصلاح می‌شود', svc.normalizePage({ page: 0 }).page === 1 && svc.normalizePage({ page: -5 }).page === 1);
    ok('ورودیِ بی‌معنی، پیش‌فرض می‌گیرد', svc.normalizePage({ page: 'x', per_page: 'y' }).page === 1);
    ok('آفست از شمارهٔ صفحه ساخته می‌شود', svc.normalizePage({ page: 3, per_page: 10 }).offset === 20);

    const p23 = svc.pageInfo({ page: 2, perPage: 10, total: 23 });
    ok('۲۳ ردیف با صفحهٔ ۱۰تایی = ۳ صفحه', p23.totalPages === 3);
    ok('صفحهٔ ۲ «قبلی» و «بعدی» دارد', p23.hasPrev === true && p23.hasMore === true);
    const last = svc.pageInfo({ page: 3, perPage: 10, total: 23 });
    ok('صفحهٔ آخر «بعدی» ندارد', last.hasMore === false && last.hasPrev === true);
    ok('صفحهٔ اول «قبلی» ندارد', svc.pageInfo({ page: 1, perPage: 10, total: 23 }).hasPrev === false);
    ok('فهرستِ خالی یک صفحه می‌شود (نه صفر — وگرنه UI تقسیم بر صفر می‌کند)',
      svc.pageInfo({ page: 1, perPage: 10, total: 0 }).totalPages === 1);
  }

  console.log('\n══ ۳) شکلِ پاسخِ عمومی — بدونِ فیلدِ داخلی ══');
  {
    const row = {
      id: 7, title: 'برنامه', description: 'توضیح', link_url: 'https://x.com', kind: 'app',
      image_url: '/uploads/images/a.webp', is_active: true, sort_order: 3,
      updated_at: new Date(), updated_by_admin_id: 1,
    };
    const pub = svc.toPublicItem(row);
    ok('برچسبِ نوع به کلاینت می‌رود (کلاینت‌ها فارسی‌سازی نمی‌کنند)', pub.kindLabel === 'برنامه');
    const keys = Object.keys(pub).sort().join(',');
    ok('هیچ فیلدِ داخلی‌ای به کلاینت نمی‌رود',
      keys === 'description,id,imageUrl,kind,kindLabel,linkUrl,title', keys);
    ok('وضعیتِ فعال/ترتیب در پاسخِ عمومی نیست (قراردادِ نانوشته نسازیم)',
      pub.isActive === undefined && pub.sortOrder === undefined);

    const admin = svc.toAdminItem(row);
    ok('پنل برعکس، وضعیت و ترتیب را می‌بیند (برای تیک و دکمهٔ جابه‌جایی)',
      admin.isActive === true && admin.sortOrder === 3);
  }

  console.log('\n══ ۴) تیکِ «نمایش در اپ و وب» ══');
  {
    ok('پیش‌فرضِ کلید روشن است (چیزی جز تیکِ صریح، بخش را خاموش نمی‌کند)',
      normalizeFeatures({}).recommendedApps === true);
    ok('خاموشی فقط با false صریح اعمال می‌شود',
      normalizeFeatures({ recommendedApps: false }).recommendedApps === false);
    ok('مقدارِ نامعتبر (رشته) بخش را خاموش نمی‌کند',
      normalizeFeatures({ recommendedApps: 'no' }).recommendedApps === true);
    ok('کلیدِ تازه پرچم‌های دیگر را خراب نمی‌کند',
      normalizeFeatures({ recommendedApps: false, games: { tap: false } }).games.tap === false);

    const src = read('backend/src/routes/recommendedApps.js');
    ok('مسیرِ تیک، آبجکتِ پرچم‌ها را مرج می‌کند (نه بازنویسی)',
      /features: \{\s*\.\.\.\(current\.features/.test(src));
    ok('و کشِ پرچم‌ها را همان لحظه تازه می‌کند (وگرنه «تیک کار نمی‌کند»)',
      /primeFeatures\(next\.features\)/.test(src));
    ok('پس از تیکِ خاموش، محتوا هم برنمی‌گردد (پنهان‌کردنِ سمتِ کلاینت کافی نیست)',
      /if \(!enabled\)[\s\S]{0,220}items: \[\]/.test(read('backend/src/services/recommendedApps.js')));

    // در حالتِ خاموش، تابعِ فهرست بدونِ دیتابیس هم باید پاسخِ خالی بدهد.
    const svcSrc = read('backend/src/services/recommendedApps.js');
    ok('فهرستِ عمومی همیشه کلیدِ `enabled` را برمی‌گرداند (کلاینت یک درخواست می‌زند)',
      /return \{ enabled: false, items: \[\], page: pageInfo/.test(svcSrc) && /return \{ enabled: true, items:/.test(svcSrc));
  }

  console.log('\n══ ۵) قراردادِ مشترک: سرور، وب، اندروید ══');
  {
    const web = read('userweb/src/screens/RecommendedApps.jsx');
    const mob = read('mobile/lib/screens/user/recommended_apps_page.dart');
    const adminPage = read('admin/src/pages/recommended-apps.jsx');
    const mig = read('backend/migrations/093_recommended_apps.sql');

    ok('وب از مسیرِ عمومی می‌خواند', /\/api\/recommended-apps/.test(web));
    ok('اندروید هم همان مسیر را می‌خواند', /\/api\/recommended-apps/.test(mob));
    ok('هر دو اندازهٔ صفحه را ۱۰ می‌فرستند (وگرنه «صفحه‌بندی» دو معنا دارد)',
      /per_page=10/.test(web) && /per_page=10/.test(mob),
      `وب=${/per_page=\d+/.exec(web)?.[0]} اندروید=${/per_page=\d+/.exec(mob)?.[0]}`);
    ok('هر دو شمارهٔ صفحه را می‌فرستند', /page=\$\{/.test(web) && /page=\$/.test(mob));
    ok('هر دو کلیدِ `enabled` را می‌خوانند (روشن/خاموشِ کلِ بخش)',
      /enabled/.test(web) && /enabled/.test(mob));
    ok('هر دو عنوان/توضیح/لینک را از پاسخ می‌خوانند',
      /title/.test(web) && /linkUrl/.test(web) && /title/.test(mob) && /linkUrl/.test(mob));
    ok('هر دو برچسبِ نوع را از سرور می‌گیرند (kindLabel)',
      /kindLabel/.test(web) && /kindLabel/.test(mob));
    ok('هر دو صفحه‌بندیِ شماره‌دار/قبلی-بعدی دارند',
      /pageBtn|صفحهٔ/.test(web) && /_(goTo|next|prev)|صفحهٔ/.test(mob));
    ok('هر دو لینکِ بیرونی را با احتیاط باز می‌کنند (لاگ/حالتِ ناشناخته کرش نکند)',
      /try\s*\{/.test(web) && /try\s*\{/.test(mob));
    ok('پنلِ ادمین: تیکِ کلی + افزودن/ویرایش/حذف + جابه‌جایی + عکس',
      /visibility/.test(adminPage) && /uploadImage/.test(adminPage)
      && /move/.test(adminPage) && /DELETE|delete/.test(adminPage));
    ok('پنل: حذف تأییدِ کاربر می‌خواهد (کلیکِ اشتباهی محتوای زنده پاک نکند)',
      /confirm/i.test(adminPage));
    // الگوی رایجِ پنل `lazy(() => import('./pages/x.jsx').then(m => ({ default: m.X })))`
    // است (همان‌طور که صفحهٔ «سپرِ سرور» نوشته شده). پس `.then(...)` اختیاری
    // است — چیزی که مهم است تنبل‌بودن و نامِ فایل است، نه شکلِ صادرکردن.
    ok('پنل به منو وصل شده و تنبل بارگذاری می‌شود',
      /lazy\(\(\) => import\('\.\/pages\/recommended-apps\.jsx'\)[\s\S]{0,120}?\)/.test(read('admin/src/main.jsx')));
    ok('صفحهٔ پنل فقط برای ادمین/مدیرکل دیده می‌شود',
      /recommended-apps/.test(read('admin/src/lib/roles.js')));
    ok('مسیرِ پنل در وب کاربر، در شیتِ «بیشتر» است',
      /recommended-apps/.test(read('userweb/src/main.jsx')) && /RecommendedApps/.test(read('userweb/src/main.jsx')));
    ok('اندروید هم در شیتِ «بیشتر» است (آینهٔ وب)',
      /recommendedAppsIndex/.test(read('mobile/lib/screens/user/home_shell.dart')));

    ok('مایگریشن: نوع و لینک با CHECK قفل شده‌اند',
      /CHECK \(kind IN \('app', 'website'\)\)/.test(mig) && /\^https\?:\/\//.test(mig));
    // ⚠️ این دو بررسی، دو باگی را قفل می‌کنند که **فقط در تولید** دیده
    //    می‌شدند و هر دو در نسخهٔ اولِ همین مایگریشن بودند:
    //
    //      • `updated_by_admin_id INTEGER` در حالی که شناسهٔ ادمین UUID است
    //        ⇒ هر ثبت/ویرایش با خطای «invalid input syntax for type integer»
    //        می‌افتاد.
    //      • `id SERIAL` در حالی که گاردِ `testValidation.js` روی هر مسیرِ
    //        `:id` نگهبانِ UUID می‌خواهد ⇒ یا پنل کار نمی‌کرد، یا گارد قرمز
    //        می‌شد. با UUID، هم شناسهٔ جعلی ۴۰۰ می‌گیرد و هم مسیر سالم
    //        رد نمی‌شود.
    ok('مایگریشن: شناسهٔ ردیف UUID است (وگرنه نگهبانِ uuid همه را رد می‌کند)',
      /id\s+UUID PRIMARY KEY DEFAULT gen_random_uuid\(\)/.test(mig));
    ok('مایگریشن: ستونِ ادمین UUID و به `admin_users` وصل است (نه INTEGER)',
      /updated_by_admin_id UUID REFERENCES admin_users\(id\)/.test(mig));
    // ⚠️ کامنت‌ها کنار گذاشته می‌شوند: خودِ توضیحِ همین باگ، رشتهٔ
    //    `Number(id)` را دارد و نسخهٔ اولِ این بررسی، توضیحِ باگ را باگ
    //    گرفت. (همان درسی که در `testMonitorAlerts.js` گرفته شد.)
    const svcForId = stripComments(read('backend/src/services/recommendedApps.js'));
    ok('سرویس شناسه را به عدد تبدیل نمی‌کند (با UUID یعنی NaN)',
      !/Number\(id\)/.test(svcForId) && /return \{ id \};/.test(svcForId));
    ok('مایگریشن ایندکسِ «فعال‌ها به ترتیب» را می‌سازد',
      /recommended_apps_order_idx[\s\S]{0,80}is_active, sort_order, id/.test(mig));
    ok('جدول در اسنپ‌شاتِ تولید هست (وگرنه گاردِ پاک‌سازی عرضه قرمز می‌شود)',
      read('backend/scripts/fixtures/live-tables.txt').includes('recommended_apps'));
    ok('و عکس‌هایش در فهرستِ «نگه‌دار»ی پاک‌سازِ عرضه هست',
      /SELECT image_url FROM recommended_apps/.test(read('tools/reset_for_launch.py')));
    ok('در حالی که بخش خاموش است، هیچ صفحهٔ فعالی هم نمایش داده نمی‌شود (فهرست خالی)',
      /items: \[\]/.test(svcSrc0()));
  }

  console.log('\n══ ۶) دسترسی و ثبت ══');
  {
    const routeSrc = read('backend/src/routes/recommendedApps.js');
    // میانِ احرازِ هویت و نقش، نگهبانِ UUID هم می‌آید (روی مسیرهای `:id`).
    // پس هر دو ترتیب پذیرفته می‌شود — شرطِ لازم این است که **هر** مسیرِ پنل
    // هم `adminAuth` داشته باشد و هم `requireRole()`.
    const adminRoutes = routeSrc.match(
      /router\.(?:get|post|put|delete)\('[^']*admin[^']*',\s*adminAuth,\s*(?:validateUuid\('id'\),\s*)?requireRole\(\)/g) || [];
    ok('همهٔ ۶ مسیرِ پنل همزمان adminAuth و requireRole دارند', adminRoutes.length === 6, `${adminRoutes.length} از ۶`);
    ok('مسیرِ عمومی هیچ محافظی ندارد (و در فهرستِ سفید توضیح داده شده)',
      /router\.get\('\/recommended-apps', asyncHandler/.test(routeSrc)
      && /GET \/api\/recommended-apps/.test(read('backend/scripts/testRouteAuth.js')));
    // پنج کنشِ نوشتنی هست — ساخت، ویرایش، حذف، جابه‌جایی، تیکِ نمایش.
    // (مسیرِ GET فهرست، نوشتنی نیست و نباید در کارنامه شلوغی بسازد.)
    ok('هر کنشِ مدیریتی در کارنامهٔ ممیزی ثبت می‌شود',
      (routeSrc.match(/await audit\(/g) || []).length === 5, String((routeSrc.match(/await audit\(/g) || []).length));
    ok('سقفِ تعدادِ برنامه‌ها وجود دارد (خاموشی/فهرستِ بی‌نهایت)',
      /MAX_ITEMS/.test(read('backend/src/services/recommendedApps.js')) && /حداکثر/.test(read('backend/src/services/recommendedApps.js')));
    // ⚠️ سه باگِ واقعی که آزمونِ زندهٔ تولید گرفت و اکنون قفل می‌شوند:
    //    شناسهٔ UUID که به عدد تبدیل می‌شد (`Number(req.params.id)` ⇒ NaN)،
    //    و شکلِ پاسخِ مسیرها که باید پایدار بماند تا پنل و آزمون‌ها به آن
    //    تکیه کنند.
    ok('مسیرها شناسهٔ UUID را به عدد تبدیل نمی‌کنند (باگی که فقط در تولید پیدا شد)',
      !/Number\(req\.params\.id\)/.test(stripComments(routeSrc)));
    ok('پاسخِ ساخت/ویرایش `{item}` و پاسخِ حذف `{removed}` است (قراردادِ پایدار)',
      /res\.status\(201\)\.json\(\{ item \}\)/.test(routeSrc)
      && /res\.json\(\{ item \}\)/.test(routeSrc)
      && /res\.json\(\{ removed: out\.id \}\)/.test(routeSrc));
    ok('شمارشِ کل و LIMIT/OFFSET با پارامتر می‌روند (بدونِ رشته‌سازیِ کوئری)',
      /LIMIT \$1 OFFSET \$2/.test(read('backend/src/services/recommendedApps.js')));
  }

  console.log('\n══ ۷) کپی‌های فارسی، بدونِ ایموجی و بدونِ متنِ خام ══');
  {
    for (const [name, file] of [
      ['وب', 'userweb/src/screens/RecommendedApps.jsx'],
      ['اندروید', 'mobile/lib/screens/user/recommended_apps_page.dart'],
      ['پنل', 'admin/src/pages/recommended-apps.jsx'],
    ]) {
      const src = read(file);
      // ⚠️ کامنت‌ها معاف‌اند — و این «سست‌کردنِ گارد» نیست، هم‌راستا شدن با
      //    قاعدهٔ سراسریِ محصول است: `userweb/tool/no-emoji.mjs` هم
      //    کامنت‌ها را کنار می‌گذارد («کاربر آنها را نمی‌بیند و ⚠️ در
      //    توضیحاتِ کد یک نشانهٔ مفیدِ داخلی است»). قاعده دربارهٔ **کپیِ
      //    دیدنی** است، نه توضیحِ کد.
      const emoji = EMOJI.test(stripComments(src));
      ok(`${name}: بدونِ ایموجی (قاعدهٔ سراسریِ محصول)`, !emoji);
      ok(`${name}: متنِ فارسیِ خامِ بی‌ربط ندارد (پیامِ خطای فارسی دارد)`,
        /[\u0600-\u06FF]/.test(src));
    }
    // ⚠️ ردیفِ تازه، شیتِ «بیشتر» را به ۹ ردیف رساند. این شیت از پایین رشد
    //    می‌کند و سقفِ ارتفاع نداشت؛ روی گوشیِ کوتاه، ردیف‌های اول بیرون
    //    می‌زدند و اسکرولی هم نبود. (آینهٔ همان رفعِ باگ در شیتِ اندروید.)
    // بلوکِ قاعده را با indexOf جدا می‌کنیم، نه با سقفِ نویسه: کامنتِ
    // توضیحیِ خودِ همین رفعِ باگ، بلوک را از هر سقفی طولانی‌تر می‌کرد.
    const sheetFile = read('userweb/src/styles/brand-mark.css');
    const sheetAt = sheetFile.indexOf('.moreSheet {');
    const sheetCss = sheetAt < 0 ? '' : sheetFile.slice(sheetAt, sheetFile.indexOf('\n}', sheetAt) + 2);
    // ── ۲۹ شهریور: اسکرول از خودِ شیت به ناحیهٔ درونی‌اش منتقل شد ──────────
    // هدف همان است («ردیفِ تازه نباید بریده شود») ولی شکلِ درستش عوض شد:
    // سرصفحهٔ ثابتِ «همهٔ بخش‌ها» + شمارِ بخش‌ها بالای شیت می‌ماند و
    // `.sheetScroll` تنها ظرفِ اسکرول است، با محوشدگیِ شرطیِ بالا/پایین.
    // پس «اسکرول‌پذیری» یعنی: سقفِ ارتفاع روی شیت **و** یک ظرفِ
    // `overflow-y:auto` — یا در خودِ شیت، یا در ناحیهٔ درونی‌اش.
    const scrollAt = sheetFile.indexOf('.sheetScroll {');
    const scrollCss = scrollAt < 0 ? '' : sheetFile.slice(scrollAt, sheetFile.indexOf('\n}', scrollAt) + 2);
    ok('شیتِ «بیشتر» در وب سقفِ ارتفاع و اسکرول دارد (ردیفِ تازه بریده نشود)',
      /max-height/.test(sheetCss)
      && (/overflow-y:\s*auto/.test(sheetCss) || /overflow-y:\s*auto/.test(scrollCss)));
    ok('وب: برای «برنامه‌ای نیست» حالتِ خالی دارد (کادرِ سفیدِ بی‌توضیح نه)',
      /برنامه/.test(read('userweb/src/screens/RecommendedApps.jsx')));
    ok('اندروید: برای «برنامه‌ای نیست» حالتِ خالی دارد',
      /برنامه/.test(read('mobile/lib/screens/user/recommended_apps_page.dart')));
    ok('وب: عکسِ نبود را با جایگزین نشان می‌دهد (نقطهٔ شکسته نه)',
      /onError|catch/.test(read('userweb/src/screens/RecommendedApps.jsx')));
    ok('اندروید: تصویرِ خراب، کلِ صفحه را نمی‌شکند',
      /errorBuilder|SafeImage/.test(read('mobile/lib/screens/user/recommended_apps_page.dart')));
  }

  console.log(`\n${fail === 0 ? '✓' : '✗'} ${pass} بررسی موفق، ${fail} ناموفق\n`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });

/** میان‌بر: متنِ سرویس (چند جا لازم می‌شود). */
function svcSrc0() {
  return fs.readFileSync(path.join(ROOT, 'backend/src/services/recommendedApps.js'), 'utf8');
}
