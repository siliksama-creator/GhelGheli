#!/usr/bin/env node
// tokens-parity.mjs — قفل یکپارچگی توکن‌ها
// تضمین می‌کند design/tokens.json تنها منبع حقیقت است و هیچ‌کس theme/colors را دستی عوض نکرده
// اجرا: node tool/tokens-parity.mjs
// در CI: node ../tools/generate-tokens.mjs --check

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');
const gen = path.join(repoRoot, 'tools/generate-tokens.mjs');

console.log('🔍 tokens parity — checking design/tokens.json → generated files');

// 1. tokens.json must exist and be valid JSON
let tokens;
try {
  const raw = fs.readFileSync(path.join(repoRoot, 'design/tokens.json'), 'utf8');
  tokens = JSON.parse(raw);
} catch (e) {
  console.error('✗ design/tokens.json missing or invalid JSON:', e.message);
  process.exit(1);
}

// 2. required keys
const required = ['brand.emerald', 'brand.blue', 'brand.amber', 'brand.lime', 'surface.bg', 'semantic.success'];
for (const k of required) {
  const [a,b] = k.split('.');
  if (!tokens[a]?.[b]) { console.error(`✗ missing tokens.${k}`); process.exit(1); }
}

// 3. generated files exist
const files = [
  'userweb/src/theme.css',
  'admin/src/theme.css',
  'mobile/lib/theme/colors.dart',
];
for (const f of files) {
  if (!fs.existsSync(path.join(repoRoot, f))) {
    console.error(`✗ missing generated file ${f} — run node tools/generate-tokens.mjs`);
    process.exit(1);
  }
  const content = fs.readFileSync(path.join(repoRoot, f), 'utf8');
  if (!content.includes('GENERATED') || !content.includes('design/tokens.json')) {
    console.error(`✗ ${f} does not look generated (missing header)`);
    process.exit(1);
  }
}

// 4. run generator in --check mode and capture exit
const res = spawnSync(process.execPath, [gen, '--check'], { cwd: repoRoot, encoding: 'utf8' });
if (res.status !== 0) {
  console.error(res.stdout || '');
  console.error(res.stderr || '');
  console.error('✗ tokens parity FAILED — generated files out of date. Run: node tools/generate-tokens.mjs');
  process.exit(1);
}
console.log(res.stdout.trim());

// 5. cross-check critical values are identical across platforms
const userwebTheme = fs.readFileSync(path.join(repoRoot, 'userweb/src/theme.css'), 'utf8');
const adminTheme = fs.readFileSync(path.join(repoRoot, 'admin/src/theme.css'), 'utf8');
const mobileColors = fs.readFileSync(path.join(repoRoot, 'mobile/lib/theme/colors.dart'), 'utf8');

function mustContain(file, needle, label) {
  if (!file.includes(needle)) { console.error(`✗ ${label} missing ${needle}`); process.exit(1); }
}
mustContain(userwebTheme, tokens.brand.lime, 'userweb --brand-ink');
mustContain(adminTheme, tokens.brand.emerald, 'admin --gg-emerald');
mustContain(mobileColors, tokens.brand.emerald.replace('#','0xFF'), 'mobile emerald');

// Ensure lime is in mobile too (parity previously missing)
mustContain(mobileColors, tokens.brand.lime.replace('#','0xFF'), 'mobile lime');

console.log('✓ tokens parity passed — 3 platforms in sync via design/tokens.json');
