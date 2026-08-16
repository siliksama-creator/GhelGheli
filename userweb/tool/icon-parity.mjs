#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// گاردِ آینگیِ آیکون‌ها — دورِ ۲۳
// ═══════════════════════════════════════════════════════════════════════════
//
// ── باگی که این گارد جلویش را می‌گیرد (واقعاً اتفاق افتاد) ──
//
// نامِ آیکون سه‌جا زندگی می‌کند:
//
//   backend/src/services/missionService.js  →  icon: 'football'
//   userweb/src/components/IconAsset.jsx    →  PATHS.football
//   mobile/lib/widgets/ui_icon.dart         →  UiIcons.map['football']
//
// سرور نامِ آیکون را می‌فرستد و هر دو کلاینت باید آن را بشناسند. وقتی
// آیکونی فقط به وب اضافه شد، اندروید همان رشتهٔ خام — کلمهٔ «football» —
// را وسطِ کارتِ ماموریت چاپ می‌کرد. خطایی که هیچ استثنایی پرتاب نمی‌کند و
// فقط با چشم روی دستگاه دیده می‌شود؛ دقیقاً همان چیزی که تستِ خودکار
// باید بگیرد.
//
// اجرا: `node tool/icon-parity.mjs` از ریشهٔ `userweb`.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const ROOT = resolve(process.cwd(), '..');
const WEB = join(ROOT, 'userweb/src/components/IconAsset.jsx');
const DART = join(ROOT, 'mobile/lib/widgets/ui_icon.dart');

// ── ۱. کلیدهای وب: `nameOfIcon: <path .../>` داخلِ شیءِ PATHS ──
const webSrc = readFileSync(WEB, 'utf8');
const pathsBlock = webSrc.slice(webSrc.indexOf('const PATHS'));
const webKeys = new Set(
  [...pathsBlock.matchAll(/^\s{2}([a-z][a-zA-Z0-9_]*)\s*:/gm)].map(m => m[1]),
);

// ── ۲. کلیدهای اندروید: `'nameOfIcon': Icons.something` ──
const dartSrc = readFileSync(DART, 'utf8');
const dartKeys = new Set(
  [...dartSrc.matchAll(/'([a-z][a-zA-Z0-9_]*)'\s*:\s*Icons\./g)].map(m => m[1]),
);

const problems = [];

for (const k of webKeys) {
  if (!dartKeys.has(k)) {
    problems.push(`  «${k}» در وب هست ولی در ui_icon.dart نیست — اندروید نامِ خام را چاپ می‌کند`);
  }
}
for (const k of dartKeys) {
  if (!webKeys.has(k)) {
    problems.push(`  «${k}» در اندروید هست ولی در IconAsset.jsx نیست — وب دایرهٔ خالی نشان می‌دهد`);
  }
}

// ── ۳. نام‌هایی که سرور می‌فرستد باید در هر دو طرف شناخته شوند ──
//
// این مهم‌ترین بخش است: نامِ آیکونی که از دیتابیس/سرور می‌آید هیچ
// چک‌کنندهٔ نوعی ندارد.
function walk(dir, out = []) {
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const name of entries) {
    if (name === 'node_modules') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (name.endsWith('.js')) out.push(full);
  }
  return out;
}

for (const file of walk(join(ROOT, 'backend/src'))) {
  const src = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of src.matchAll(/\bicon:\s*'([a-z][a-zA-Z0-9_]*)'/g)) {
    const name = m[1];
    if (!webKeys.has(name) || !dartKeys.has(name)) {
      const line = src.slice(0, m.index).split('\n').length;
      const where = [!webKeys.has(name) && 'وب', !dartKeys.has(name) && 'اندروید']
        .filter(Boolean).join(' و ');
      problems.push(
        `  ${relative(ROOT, file)}:${line} سرور «${name}» می‌فرستد ولی ${where} نمی‌شناسدش`,
      );
    }
  }
}

if (problems.length) {
  console.error(`\n✗ ${problems.length} ناهماهنگی در نام‌های آیکون:\n`);
  console.error(problems.join('\n'));
  console.error('\n  هر آیکون باید هم‌زمان در سه‌جا باشد: IconAsset.jsx (PATHS)،');
  console.error('  ui_icon.dart (UiIcons.map) و هر نامی که سرور می‌فرستد.\n');
  process.exit(1);
}

console.log(`✓ آینگیِ آیکون‌ها برقرار است (${webKeys.size} آیکون در هر دو پلتفرم)`);
