#!/usr/bin/env node
//
// گاردِ همسانیِ «تعدادِ کارت در نگینِ گوشه» بین وب و اندروید.
//
// چرا این فایل وجود دارد
// ──────────────────────
// خواستهٔ مالک (۳۰ شهریور): وقتی کاربر چند نسخه از یک کارت دارد، عددِ
// تعداد («×۲») باید داخلِ همان مربعِ گوشهٔ پایینِ قاب (نگینِ کمیابی) نوشته
// شود و دیگر بالای کارت چیپِ جدا نداشته باشیم. پیش از این، وب یک چیپِ
// `ggCardQty` بالای کارت می‌گذاشت و اندروید `_MiniChip` — و مربعِ گوشه فقط
// نگینِ کمیابی بود (◆ برای پرمیوم) که از دور شبیحِ «۰» دیده می‌شد و مالک
// آن را شمارندهٔ صفر می‌خواند.
//
// قراردادِ تازه در دو کلاینت:
//   • وب: `PlayerCard` به‌جای چیپِ بالا، `corner={…rarityQtyCorner…}` به
//     `CardRarityFrame` می‌دهد و کلاسِ `qtyCorner` روی قاب می‌گذارد تا CSS
//     نگینِ pseudo را `content:none` کند.
//   • اندروید: `player_card.dart` همان متن را با `cornerText` به
//     `RarityCardFrame` می‌دهد و قاب به‌جای نگینِ کمیابی مربعِ عدد را می‌کارد.
//
// این گارد می‌بندد که هیچ‌کدام از دو کلاینت بی‌صدا به چیپِ بالایی برنگردند
// و عدد در هر دو همان گوشه بنشیند.
//
// ⚠️ گاردِ ایستا نباید کامنت را کد بخواند؛ `strip()` کامنت‌ها را حذف می‌کند.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..');

/** کامنت‌های `//`، `///` و بلوکی را حذف می‌کند. */
function strip(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/\/?.*$/gm, '')
    .replace(/([^:])\/\/.*$/gm, '$1');
}

const read = p => strip(fs.readFileSync(path.join(root, p), 'utf8'));

const webCard = read('userweb/src/components/PlayerCard.jsx');
const webFrame = read('userweb/src/components/CardRarityFrame.jsx');
const webCss = fs.readFileSync(path.join(root, 'userweb/src/styles/brand-mark.css'), 'utf8');
const andCard = read('mobile/lib/widgets/player_card.dart');
const andFrame = read('mobile/lib/widgets/rarity_card_frame.dart');

let checks = 0;
function ok(label, cond) {
  assert.ok(cond, `❌ ${label}`);
  checks += 1;
  console.log(`  ✓ ${label}`);
}

console.log('\n== تعدادِ کارت: نگینِ گوشه، نه چیپِ بالا ==');

ok('وب: چیپِ بالای کارت (ggCardQty) حذف شده است', !/ggCardQty/.test(webCard));
ok('وب: تعداد در نگینِ گوشه رندر می‌شود (corner به قاب می‌رود)',
  /rarityQtyCorner/.test(webCard) && /corner=\{qty > 1/.test(webCard));
ok('وب: قابِ CardRarityFrame پراپِ corner را می‌پذیرد و می‌کارد',
  /corner = null/.test(webFrame) && /\{corner\}/.test(webFrame));
ok('وب CSS: قاعدهٔ .rarityQtyCorner در گوشهٔ پایینِ قاب نشسته است',
  /\.rarityQtyCorner\{[^}]*bottom:-6px/.test(webCss));
ok('وب CSS: نگینِ کمیابیِ پرمیوم/گلد وقتی عدد هست خاموش می‌شود',
  /qtyCorner\.rarity-premium:after[^{]*\{content:none\}/.test(webCss));

ok('اندروید: چیپِ بالای کارت (_MiniChip با ×) حذف شده است',
  !/_MiniChip\(text:\s*'×/.test(andCard));
ok('اندروید: تعداد با cornerText به قاب داده می‌شود',
  /cornerText: qty > 1 \? '×\$\{faNum\(qty\)\}' : null/.test(andCard));
ok('اندروید: قاب cornerText را در گوشهٔ پایین می‌کارد و نگین را کنار می‌برد',
  /widget\.cornerText != null/.test(andFrame)
  && /bottom: -6/.test(andFrame)
  && /cornerText != null\) return const SizedBox\.shrink\(\)/.test(andFrame));

ok('قالبِ عدد در هر دو کلاینت یکی است (× قبل از رقمِ فارسی)',
  /×\{fa\(qty\)\}/.test(webCard) && /'×\$\{faNum\(qty\)\}'/.test(andCard));

console.log(`\n✅ ${checks} تست همسانیِ تعدادِ کارت موفق بود\n`);
