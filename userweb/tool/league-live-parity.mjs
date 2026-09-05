#!/usr/bin/env node
//
// گاردِ همسانیِ «به‌روزرسانیِ زندهٔ جدول لیگ» بین وب و اندروید.
//
// چرا این فایل وجود دارد
// ─────────────────────
// جدول لیگ قبلاً در هر دو کلاینت روی یک pollِ ثابتِ ۱۲ ثانیه بود: حتی
// وقتی هیچ رتبه‌ای عوض نمی‌شد، هر کاربرِ بازِ صفحه بی‌وقفه HTTP می‌زد و
// تازه‌شدن هم تا ۱۲ ثانیه تأخیر داشت. حالا سرور فقط هنگامِ تغییرِ واقعی
// (پایان بازی، ثبت امتیاز/سکه) رویدادِ `leaderboard:update` را پخش
// می‌کند و هر دو کلاینت با شنیدنش دوباره می‌خوانند.
//
// این گارد تضمین می‌کند:
//   ۱) هیچ‌کدام از دو کلاینت pollِ ۱۲ ثانیه‌ایِ لیگ را برنگردانند؛
//   ۲) هر دو عضو اتاقِ «leaderboard» شوند (subscribe) و موقع بستن صفحه
//      خارج شوند (unsubscribe) — تا پخش فقط به بیننده‌های جدول برود؛
//   ۳) هر دو به رویداد گوش دهند و سرور هم فقط به همان اتاق emit کند.
//
// مثل بقیهٔ گاردهای parity، روی رفتار/قرارداد است نه رنگ و پیکسل، و
// کامنت‌ها با strip() حذف می‌شوند تا توضیحات تست را سبز نکنند.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..');

function strip(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/\/?.*$/gm, '')
    .replace(/([^:])\/\/.*$/gm, '$1');
}

const read = p => strip(fs.readFileSync(path.join(root, p), 'utf8'));

const web = read('userweb/src/screens/League.jsx');
const android = read('mobile/lib/screens/user/league_page.dart');
const server = read('backend/src/server.js');
const signal = read('backend/src/services/leaderboardSignal.js');

let checks = 0;
function ok(label, cond) {
  assert.ok(cond, `❌ ${label}`);
  checks += 1;
  console.log(`  ✓ ${label}`);
}

console.log('\n== جدول لیگ به‌جای poll ثابت، رویدادمحور است ==');

// ── ۱) pollِ ۱۲ ثانیه‌ای نباید برگردد ─────────────────────────────────
ok('وب pollِ زمانی (setInterval 12000) روی لیگ ندارد',
  !/setInterval\([^)]*12000/.test(web) && !/},\s*12000\)/.test(web));
ok('اندروید startPolling با ۱۲ ثانیه روی لیگ ندارد',
  !/startPolling\(\s*const Duration\(seconds:\s*12\)/.test(android));

// ── ۲) هر دو کلاینت به رویداد گوش می‌دهند ─────────────────────────────
console.log('\n== هر دو کلاینت leaderboard:update را می‌شنوند ==');
ok('وب به leaderboard:update گوش می‌دهد',
  /socket\.on\(['"]leaderboard:update['"]/.test(web));
ok('اندروید به leaderboard:update گوش می‌دهد',
  /\.on\(['"]leaderboard:update['"]/.test(android));

// ── ۳) اتاقِ لیدربورد: subscribe/unsubscribe در هر دو ────────────────
console.log('\n== عضویت در اتاقِ leaderboard (پخش فقط به بیننده‌ها) ==');
ok('وب بعد از اتصال subscribe می‌فرستد',
  /emit\(['"]leaderboard:subscribe['"]/.test(web));
ok('اندروید بعد از اتصال subscribe می‌فرستد',
  /emit\(['"]leaderboard:subscribe['"]/.test(android));
ok('وب هنگام بستنِ صفحه unsubscribe می‌فرستد',
  /emit\(['"]leaderboard:unsubscribe['"]/.test(web));
ok('اندروید هنگام dispose unsubscribe می‌فرستد',
  /emit\(['"]leaderboard:unsubscribe['"]/.test(android));

// سرور: هندلرهای join/leave و پخش فقط به اتاق.
ok('سرور هندلر leaderboard:subscribe دارد',
  /on\(['"]leaderboard:subscribe['"]/.test(server));
ok('سرور هندلر leaderboard:unsubscribe دارد',
  /on\(['"]leaderboard:unsubscribe['"]/.test(server));
ok('سیگنال سرور فقط به اتاقِ leaderboard emit می‌کند (نه io.emit سراسری)',
  /\.to\(ROOM\)\.emit\(['"]leaderboard:update['"]/.test(signal)
  && !/ioRef\.emit\(['"]leaderboard:update['"]/.test(signal));

// ── ۴) تمیزکاریِ اتصال ────────────────────────────────────────────────
console.log('\n== بستنِ سوکت هنگام ترک صفحه ==');
ok('وب سوکت را در cleanup می‌بندد', /socket\?\.disconnect\(\)/.test(web));
ok('اندروید سوکت را در dispose می‌بندد', /_socket\?\.dispose\(\)/.test(android));

console.log(`\n══════════════════════════════════════════`);
console.log(`  نتیجه: ${checks} بررسیِ همسانیِ لیدربوردِ زنده موفق`);
console.log(`══════════════════════════════════════════`);
