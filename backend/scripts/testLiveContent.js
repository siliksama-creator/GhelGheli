#!/usr/bin/env node
/**
 * نگهبان «محتوا و اعداد زنده» (نقشه‌راه یکپارچه‌سازی — فاز ۱).
 *
 * دو بخش:
 *   ۱. تستِ واحدِ منطقِ liveContent بدونِ دیتابیس:
 *      بازهٔ امنِ اعداد، پیرینگِ سفید‌نامِ قالب‌ها، پرکردنِ
 *      جای‌نگهدارها و — مهم‌ترین — **سازگاریِ قرارداد**: هیچ قالبی
 *      جای‌نگهدارِ بیرون از قرارداد نداشته باشد و هیچ مسیری در قرارداد
 *      به‌جای خالی نمانده باشد. اگر این دو شکسته باشد، پیش‌نمایشِ پنل
 *      (فاز ۳) با واقعیتِ سرور دروغ می‌گوید.
 *   ۲. نگهبان‌های ایستا: مسیرهای ادمین احراز‌هویت + نقش + audit داشته
 *      باشند، سرور کلیدها را پیش‌بارگیری کند و موتور/جفت‌یاب/تیکت واقعاً
 *      از aعدادِ زنده بخوانند (نه از ثابت).
 */
'use strict';

const fs = require('fs');
const path = require('path');

let failed = 0;
const ok = (name, cond) => {
  if (!cond) failed += 1;
  console.log(`${cond ? '✓' : '✗'} ${name}`);
};

const root = path.join(__dirname, '..');
const svc = require(path.join(root, 'src/services/liveContent.js'));

// ═══════════════════════════════════════════════════════════════════════
// ۱. بازهٔ امنِ اعداد
// ═══════════════════════════════════════════════════════════════════════

// کشِ همگامِ opsConfig در تست خالی است → rules() باید دقیقاً پیش‌فرض‌ها
// را بدهد (نه null، نه خطا).
const defaults = svc.rules();
ok('rules() بدون دیتابیس مقدارِ کامل می‌دهد',
  Object.keys(svc.RULE_DEFS).every(k => Number.isInteger(defaults[k])));
ok('پیش‌فرض memoryPairs = 8 (رفتارِ امروز)', defaults.memoryPairs === 8);
ok('پیش‌فرض reconnectSeconds = 25', defaults.reconnectSeconds === 25);
ok('پیش‌فرض roomCodeLength = 4', defaults.roomCodeLength === 4);
ok('پیش‌فرض ticketsPerDay = 1', defaults.ticketsPerDay === 1);
ok('پیش‌فرض maxTicketAttachments = 5', defaults.maxTicketAttachments === 5);
ok('پیش‌فرض reviewSlaHours = 24', defaults.reviewSlaHours === 24);
ok('پیش‌فرض spinsPerDailyThreshold = 1', defaults.spinsPerDailyThreshold === 1);

// بازه‌ها با واقعیتِ کد هم‌صدا باشند:
ok('بازهٔ memoryPairs ۴–۸ (۸ شکل، تختهٔ ۴×۴)',
  svc.RULE_DEFS.memoryPairs.min === 4 && svc.RULE_DEFS.memoryPairs.max === 8);
ok('بازهٔ roomCodeLength ۴–۸',
  svc.RULE_DEFS.roomCodeLength.min === 4 && svc.RULE_DEFS.roomCodeLength.max === 8);

const clampUp = svc.sanitizeRules({ memoryPairs: 99, reconnectSeconds: 999 });
ok('عددِ بالاتر از سقف به سقف می‌چسبد',
  clampUp.memoryPairs === 8 && clampUp.reconnectSeconds === 60);
const clampDown = svc.sanitizeRules({ memoryPairs: 0, roomCodeLength: 1 });
ok('عددِ پایین‌تر از کف به کف می‌چسبد',
  clampDown.memoryPairs === 4 && clampDown.roomCodeLength === 4);
const garbage = svc.sanitizeRules({ memoryPairs: 'نه‌عدد', ticketsPerDay: null, reconnectSeconds: '' });
ok('ورودیِ نامعتبرِ قدیمی می‌ماند (خطا نمی‌اندازد)',
  garbage.memoryPairs === 8 && garbage.ticketsPerDay === 1 && garbage.reconnectSeconds === 25);
const partial = svc.sanitizeRules({ ticketsPerDay: 3 });
ok('ذخیرهٔ جزئی کلیدهای دیگر را دست نمی‌زند',
  partial.memoryPairs === 8 && partial.ticketsPerDay === 3);

// ═══════════════════════════════════════════════════════════════════════
// ۲. پیرینگِ سفید‌نامِ قالب‌ها
// ═══════════════════════════════════════════════════════════════════════

const base = svc.copy();
ok('copy() ساختارِ کاملِ پیش‌فرض را می‌دهد',
  typeof base.referral.dailySpinRule === 'string'
  && base.support.privacySections.length === 3
  && typeof base.games.memoryRule === 'string');

// کلیدِ غرابه بیرون می‌رود:
const merged = svc.sanitizeCopy({
  games: { memoryRule: 'قالبِ تازه', ghostKey: 'نباید بماند' },
  ghostGroup: { anything: 'x' },
});
ok('قالبِ تازه اعمال می‌شود', merged.games.memoryRule === 'قالبِ تازه');
ok('کلیدِ غرابهٔ درونِ گروه حذف می‌شود', merged.games.ghostKey === undefined);
ok('گروهِ غرابه حذف می‌شود', merged.ghostGroup === undefined);
ok('بقیهٔ گروهِ untouched دست‌نخورده می‌ماند', merged.games.roomCodeLabel === base.games.roomCodeLabel);

// آرایهٔ اشیاء (privacySections): توالیِ ادمین حفظ، ساختار تطبیق:
const mergedSections = svc.sanitizeCopy({
  support: { privacySections: [{ body: 'متنِ تازهٔ بند اول', ghost: 1 }] },
});
ok('privacySections: body تازه اعمال می‌شود',
  mergedSections.support.privacySections[0].body === 'متنِ تازهٔ بند اول');
ok('privacySections: کلیدِ غرابهٔ آیتم حذف می‌شود',
  mergedSections.support.privacySections[0].ghost === undefined);
ok('privacySections: title پیش‌فرض برای آیتمِ ناقص می‌ماند',
  mergedSections.support.privacySections[0].title === base.support.privacySections[0].title);
ok('privacySections: آیتم‌های نرسیده پیش‌فرض می‌مانند',
  mergedSections.support.privacySections[2].title === base.support.privacySections[2].title);

// ═══════════════════════════════════════════════════════════════════════
// ۳. پرکردنِ جای‌نگهدارها
// ═══════════════════════════════════════════════════════════════════════

ok('fillTemplate جای‌نگهدار را پر می‌کند',
  svc.fillTemplate('کد {codeLength} رقمی', { codeLength: '۵' }) === 'کد ۵ رقمی');
ok('جای‌نگهدارِ بدونِ مقدار خالی می‌شود (خام نمی‌ماند)',
  svc.fillTemplate('تا {slaHours} ساعت', {}) === 'تا  ساعت');
ok('متنِ بدونِ جای‌نگهدار دست‌نخورده',
  svc.fillTemplate('ساده و مستقیم', { x: 1 }) === 'ساده و مستقیم');
ok('قالبِ خراب (null) نمی‌افتد', svc.fillTemplate(null, {}) === '');

// ═══════════════════════════════════════════════════════════════════════
// ۴. سازگاریِ قرارداد (مهم‌ترین نگهبانِ این فاز)
// ═══════════════════════════════════════════════════════════════════════

const placeholdersOf = (s) => [...String(s).matchAll(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g)].map(m => m[1]);

let contractOk = true;
let contractMsg = [];
const checkTpl = (tplPath, tpl) => {
  if (typeof tpl !== 'string') return;
  const allowed = svc.COPY_CONTRACT[tplPath.split('.')[0]]?.[tplPath.split('.')[1]]
    || svc.COPY_CONTRACT[tplPath];
  if (!allowed) {
    // گروهی که در قرارداد نیست (مثلاً privacySections) — جای‌نگهدار نباید داشته باشد.
    const used = placeholdersOf(tpl);
    if (used.length) { contractOk = false; contractMsg.push(`${tplPath} جای‌نگهدار دارد ولی در قرارداد نیست: ${used}`); }
    return;
  }
  const used = placeholdersOf(tpl);
  for (const u of used) {
    if (!allowed.includes(u)) { contractOk = false; contractMsg.push(`${tplPath}: ${u} خارج از قرارداد`); }
  }
};
const walk = (obj, prefix) => {
  for (const [k, v] of Object.entries(obj)) {
    const p = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string') checkTpl(p, v);
    else if (Array.isArray(v)) v.forEach((it, i) => walk(it, `${p}[${i}]`));
    else if (v && typeof v === 'object') walk(v, p);
  }
};
walk(base, '');
ok('قرارداد: هیچ قالبی جای‌نگهدارِ بی‌قرارداد ندارد', contractOk,
  contractMsg.join(' | '));

// معکوس: هر مسیرِ قرارداد باید در پیش‌فرض وجود داشته باشد:
let pathsOk = true;
for (const [group, entries] of Object.entries(svc.COPY_CONTRACT)) {
  if (!base[group]) { pathsOk = false; contractMsg.push(`گروهِ قرارداد ${group} در پیش‌فرض نیست`); continue; }
  for (const field of Object.keys(entries)) {
    if (typeof base[group][field] !== 'string') { pathsOk = false; contractMsg.push(`مسیرِ قرارداد ${group}.${field} در پیش‌فرض نیست`); }
  }
}
ok('قرارداد: همهٔ مسیرها در قالب‌های پیش‌فرض وجود دارند', pathsOk);

// preview همه‌چیز را با اعدادِ امروز پر می‌کند:
const prev = svc.preview({
  memoryPairs: '۸', codeLength: '۴', reconnectSeconds: '۲۵', slaHours: '۲۴',
  ticketsPerDay: '۱', maxAttachments: '۵', levelCount: '۵۰', count: '۱۰',
  invitesPerDailySpin: '۱۰', maxInvitesForDaily: '۵۰', spinsPerDailyThreshold: '۱',
});
ok('preview جای‌نگهدارِ خام به‌جا نمی‌گذارد',
  JSON.stringify(prev.template).match(/\{[a-zA-Z]+\}/g) === null);

// ═══════════════════════════════════════════════════════════════════════
// ۵. نگهبان‌های ایستا — وصل‌ها واقعاً در کد هستند
// ═══════════════════════════════════════════════════════════════════════

const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const migration = read('migrations/082_live_content.sql');
ok('مایگریشن 082 جدولِ تاریخچه را می‌سازد',
  /CREATE TABLE IF NOT EXISTS live_content_history/.test(migration));
ok('مایگریشن 082 ایندکسِ (key,id) دارد',
  /live_content_history_key_id_idx/.test(migration));

const engineSrc = read('src/games/engine.js');
ok('موتور پنجرهٔ اتصال را از liveContent می‌خواند',
  /liveContent\.rules\(\)\.reconnectSeconds \* 1000/.test(engineSrc));
ok('موتور طولِ کدِ اتاق را از liveContent می‌خواند',
  /liveContent\.rules\(\)\.roomCodeLength/.test(engineSrc));
ok('ثابتِ قدیمی RECONNECT_WINDOW_MS دیگر در موتور نیست',
  !/const RECONNECT_WINDOW_MS/.test(engineSrc));

const memorySrc = read('src/games/rules/memory.js');
ok('جفت‌یاب تعداد جفت را از liveContent می‌خواند',
  /liveContent\.rules\(\)\.memoryPairs/.test(memorySrc));
ok('جفت‌یاب ثابتِ SIZE=16 حذف شده', !/const SIZE = 16/.test(memorySrc));

const serverSrc = read('src/server.js');
ok('سرور کلیدهای زنده را در بوت پیش‌بارگیری می‌کند',
  /'live_copy', 'live_rules', 'config_version',/.test(serverSrc));
ok('سرور liveContent را به clientConfig می‌دهد',
  /liveContent,\n\}\)\);/.test(serverSrc));
ok('سقفِ ضمیمهٔ تیکت از تابع زنده است',
  /ticketMaxAttachments = \(\) => liveContent\.rules\(\)\.maxTicketAttachments/.test(serverSrc));
ok('سهمیهٔ تیکت از تابع زنده است',
  /ticketsPerDay = \(\) => liveContent\.rules\(\)\.ticketsPerDay/.test(serverSrc));
ok('ثابتِ قدیمی TICKET_MAX_ATTACHMENTS در server.js نیست',
  !/const TICKET_MAX_ATTACHMENTS/.test(serverSrc));

const refSrc = read('src/services/referralService.js');
ok('گردونه ضریبِ آستانه را از liveContent می‌خواند',
  /liveContent\.rules\(\)\.spinsPerDailyThreshold/.test(refSrc));

const routeSrc = read('src/routes/clientConfig.js');
ok('/api/config copy می‌دهد', /copy: liveContent\.copy\(\)/.test(routeSrc));
ok('/api/config rules می‌دهد', /rules: liveContent\.rules\(\)/.test(routeSrc));
ok('/api/config configVersion می‌دهد', /configVersion: liveContent\.configVersion\(\)/.test(routeSrc));
ok('PATCH rules با adminAuth + requireRole',
  /router\.patch\('\/admin\/settings\/live-content\/rules', adminAuth, requireRole\(\)/.test(routeSrc));
ok('PATCH copy با adminAuth + requireRole',
  /router\.patch\('\/admin\/settings\/live-content\/copy', adminAuth, requireRole\(\)/.test(routeSrc));
ok('revert با adminAuth + requireRole',
  /router\.post\('\/admin\/settings\/live-content\/:key\/revert', adminAuth, requireRole\(\)/.test(routeSrc));
ok('ذخیرهٔ rules audited می‌شود', /audit\(req\.admin\.id, 'save_live_rules'/.test(routeSrc));
ok('ذخیرهٔ copy audited می‌شود', /audit\(req\.admin\.id, 'save_live_copy'/.test(routeSrc));
ok('بازگردانی audited می‌شود', /audit\(req\.admin\.id, 'revert_live_content'/.test(routeSrc));

process.exit(failed ? 1 : 0);
