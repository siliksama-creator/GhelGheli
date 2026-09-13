#!/usr/bin/env node
// generate-tokens.mjs — single source → three outputs
// Reads design/tokens.json and generates:
//  - userweb/src/theme.css
//  - admin/src/theme.css
//  - mobile/lib/theme/colors.dart
// Keeps animations, logic, comments outside :root untouched by design: we ONLY generate :root block + header.
// But to unify, we generate full files with preserved sections.
// Usage: node tools/generate-tokens.mjs [--check]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const tokensPath = path.join(root, 'design/tokens.json');
const tokens = JSON.parse(fs.readFileSync(tokensPath, 'utf8'));

const check = process.argv.includes('--check') || process.argv.includes('--dry-run');

function hexToDart(hex) {
  // #RRGGBB -> 0xFFRRGGBB
  const h = hex.replace('#','').toUpperCase();
  if (h.length === 6) return `0xFF${h}`;
  if (h.length === 8) return `0x${h}`; // already AARRGGBB
  return `0xFF${h}`;
}

function writeFile(p, content) {
  const full = path.join(root, p);
  if (check) {
    const existing = fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : null;
    if (existing !== content) {
      console.error(`✗ ${p} is OUT OF DATE — run: node tools/generate-tokens.mjs`);
      // show diff hint
      if (existing) {
        const a = existing.split('\n');
        const b = content.split('\n');
        for (let i=0;i<Math.min(a.length,b.length);i++) if (a[i]!==b[i]) { console.error(`  diff line ${i+1}: expected "${b[i]}" got "${a[i]}"`); break; }
      }
      process.exitCode = 1;
    } else {
      console.log(`✓ ${p} up to date`);
    }
    return;
  }
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf8');
  console.log(`✓ wrote ${p} (${(content.length/1024).toFixed(1)}KB)`);
}

// ── 1. userweb/src/theme.css ──
function generateUserwebTheme() {
  const { brand, level, surface, veil, typography } = tokens;
  // Note: userweb page-bg historically #06101d vs canonical #060D18 — unify to canonical #060D18 for parity.
  // Keep --page-bg as canonical bg (#060D18) — visual delta <2% but fixes divergence.
  return `/*
  لایهٔ توکن‌های رنگ و اندازه — **GENERATED**
  منبع: design/tokens.json — دستی ویرایش نکنید، بزنید: node tools/generate-tokens.mjs
  ═══════════════════════════════════════════════════════════════════════════
  تمِ روشن حذف شد — تک‌تم تیره. توضیح کامل در git history.
*/

:root {
  /* brand — lime برای متن روی تیره (brand-ink سابق) */
  --brand-ink: ${brand.lime};
  /* brand emerald/blue/amber — آینه mobile BrandColors */
  --brand-emerald: ${brand.emerald};
  --brand-blue: ${brand.blue};
  --brand-amber: ${brand.amber};

  /* level — دقیقاً همان که LevelBadge در فلاتر می‌گیرد */
  --lvl-rookie: ${level.rookie};
  --lvl-bronze: ${level.bronze};
  --lvl-silver: ${level.silver};
  --lvl-gold: ${level.gold};
  --lvl-legend: ${level.legend};

  /* surfaces — یکسان با admin/mobile */
  --page-bg: ${surface.bg};
  --page-fg: ${surface.pageFg};
  --text-muted: ${surface.userTextMuted};
  --text-soft: ${surface.userTextSoft};
  --panel-bg: ${surface.panelBg};
  --surface: ${surface.userSurface};
  --bg: var(--page-bg);
  --text: var(--page-fg);
  --border: ${surface.borderUser};
  --shadow-strong: #0009;
  --shadow-soft: #00000040;

  /* veils */
  --veil-1: ${veil["1"]};
  --veil-2: ${veil["2"]};
  --veil-3: ${veil["3"]};
  --veil-4: ${veil["4"]};
  --veil-5: ${veil["5"]};
  --veil-6: ${veil["6"]};
  --veil-7: ${veil["7"]};

  /* typography */
  --fs-xs: ${typography.fsXs};
  --fs-sm: ${typography.fsSm};
  --fs-lg: ${typography.fsLg};
}
body {
  color: var(--page-fg);
  background: var(--page-bg);
}
.fieldHint { color: #c9ddf2a8; }
.pinnedBanner { --pin: var(--pin-dark); }
.tabLoading { min-height: 42vh; }
.rgSoonScore {
  display: flex; align-items: baseline; justify-content: space-between;
  gap: 12px; margin: 14px 0 4px; padding: 16px 18px; border-radius: 18px;
  background: linear-gradient(135deg, #ffc53d1a, #ffc53d08);
  border: 1px solid #ffc53d33;
}
.rgSoonScore span { color: #cbd5e1; font-size: 13.5px; }
.rgSoonScore b {
  font-size: 30px; font-weight: 800; color: #ffc53d;
  font-variant-numeric: tabular-nums; line-height: 1;
}
.rgSoonWays {
  display: grid; grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px; margin-top: 6px;
}
.rgSoonWays > div {
  display: flex; flex-direction: column; align-items: center; gap: 8px;
  padding: 16px 8px; border-radius: 16px;
  background: #ffffff08; border: 1px solid #ffffff12;
  color: #94a3b8; font-size: 12.5px; text-align: center;
}
.rgSoonWays svg { color: #7dd3fc; opacity: .9; }
@media (min-width: 1100px) {
  .rgSoonWays { max-width: 620px; margin-inline: auto; }
}
`;
}

// ── 2. admin/src/theme.css ──
function generateAdminTheme() {
  const { brand, semantic, surface, spacing, radii, shadows, motion } = tokens;
  return `/*
  GhelGheli shared design tokens — **GENERATED**
  منبع: design/tokens.json — دستی ویرایش نکنید.
  Mirrors mobile/lib/theme/{colors,tokens}.dart
*/
@font-face {
  font-family: 'Vazirmatn';
  src: url('/fonts/Vazirmatn-Regular.woff2') format('woff2');
  font-weight: 400;
  font-display: swap;
}
@font-face {
  font-family: 'Vazirmatn';
  src: url('/fonts/Vazirmatn-Medium.woff2') format('woff2');
  font-weight: 500;
  font-display: swap;
}
@font-face {
  font-family: 'Vazirmatn';
  src: url('/fonts/Vazirmatn-SemiBold.woff2') format('woff2');
  font-weight: 600;
  font-display: swap;
}
@font-face {
  font-family: 'Vazirmatn';
  src: url('/fonts/Vazirmatn-Bold.woff2') format('woff2');
  font-weight: 700;
  font-display: swap;
}
@font-face {
  font-family: 'Vazirmatn';
  src: url('/fonts/Vazirmatn-ExtraBold.woff2') format('woff2');
  font-weight: 800;
  font-display: swap;
}

:root {
  /* Brand */
  --gg-emerald: ${brand.emerald};
  --gg-emerald-deep: ${brand.emeraldDeep};
  --gg-emerald-ink: ${brand.emeraldInk};
  --gg-blue: ${brand.blue};
  --gg-blue-deep: ${brand.blueDeep};
  --gg-amber: ${brand.amber};
  --gg-amber-deep: ${brand.amberDeep};
  --gg-lime: ${brand.lime};
  --gg-success: ${semantic.success};
  --gg-warning: ${semantic.warning};
  --gg-danger: ${semantic.danger};
  --gg-info: ${semantic.info};

  /* Dark surfaces (default theme) */
  --gg-bg: ${surface.bg};
  --gg-surface: ${surface.surface};
  --gg-surface-alt: ${surface.surfaceAlt};
  --gg-surface-high: ${surface.surfaceHigh};
  --gg-surface-highest: ${surface.surfaceHighest};
  --gg-border: ${surface.border};
  --gg-border-soft: ${surface.borderSoft};
  --gg-text: ${surface.text};
  --gg-text-muted: ${surface.textMuted};
  --gg-text-faint: ${surface.textFaint};

  /* Gradients */
  --gg-gradient-hero: linear-gradient(135deg, var(--gg-emerald), var(--gg-blue));
  --gg-gradient-gold: linear-gradient(135deg, var(--gg-amber), var(--gg-amber-deep));
  --gg-gradient-league: linear-gradient(135deg, #172f56, var(--gg-emerald));

  /* Spacing scale (8dp grid) */
  --gg-space-1: ${spacing["1"]};
  --gg-space-2: ${spacing["2"]};
  --gg-space-3: ${spacing["3"]};
  --gg-space-4: ${spacing["4"]};
  --gg-space-5: ${spacing["5"]};
  --gg-space-6: ${spacing["6"]};
  --gg-space-8: ${spacing["8"]};
  --gg-space-10: ${spacing["10"]};

  /* Radii */
  --gg-radius-sm: ${radii.sm};
  --gg-radius-md: ${radii.md};
  --gg-radius-lg: ${radii.lg};
  --gg-radius-xl: ${radii.xl};
  --gg-radius-xxl: ${radii.xxl};
  --gg-radius-pill: ${radii.pill};

  /* Shadows */
  --gg-shadow-soft: ${shadows.soft};
  --gg-shadow-raised: ${shadows.raised};
  --gg-shadow-glow-emerald: ${shadows.glowEmerald};
  --gg-shadow-glow-blue: ${shadows.glowBlue};

  /* Motion */
  --gg-ease: ${motion.ease};
  --gg-fast: ${motion.fast};
  --gg-normal: ${motion.normal};

  font-family: 'Vazirmatn', Tahoma, sans-serif;
  color-scheme: dark;
}
* {
  box-sizing: border-box;
}

html,
body {
  margin: 0;
  min-height: 100vh;
}

body {
  font-family: 'Vazirmatn', Tahoma, sans-serif;
  background: var(--gg-bg);
  color: var(--gg-text);
  direction: rtl;
  transition: background var(--gg-normal) var(--gg-ease), color var(--gg-normal) var(--gg-ease);
}

::selection {
  background: color-mix(in srgb, var(--gg-emerald) 35%, transparent);
}

::-webkit-scrollbar {
  width: 10px;
  height: 10px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
::-webkit-scrollbar-thumb {
  background: var(--gg-surface-highest);
  border-radius: var(--gg-radius-pill);
}
::-webkit-scrollbar-thumb:hover {
  background: var(--gg-surface-high);
}

h1, h2, h3, h4 {
  margin: 0;
  font-weight: 800;
  letter-spacing: -0.01em;
}

p {
  margin: 0;
  color: var(--gg-text-muted);
  line-height: 1.7;
}

a {
  color: inherit;
}

button, input, select, textarea {
  font-family: inherit;
}

.gg-visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}

.pinPreview { --pin: var(--pin-dark); }
.pageLoading { min-height: 50vh; }
`;
}

// ── 3. mobile/lib/theme/colors.dart ──
function generateMobileColors() {
  const { brand, semantic, surface } = tokens;
  return `// Brand color system for GhelGheli — **GENERATED**
// منبع: design/tokens.json — دستی ویرایش نکنید، بزنید: node tools/generate-tokens.mjs
import 'package:flutter/material.dart';

class BrandColors {
  BrandColors._();

  // Core brand identity — emerald/teal (loyalty, growth) + electric blue
  // (energy, sport) + amber (rewards, gold tier).
  static const Color emerald = Color(${hexToDart(brand.emerald)});
  static const Color emeraldDeep = Color(${hexToDart(brand.emeraldDeep)});
  static const Color blue = Color(${hexToDart(brand.blue)});
  static const Color blueDeep = Color(${hexToDart(brand.blueDeep)});
  static const Color amber = Color(${hexToDart(brand.amber)});
  static const Color amberDeep = Color(${hexToDart(brand.amberDeep)});
  static const Color lime = Color(${hexToDart(brand.lime)});

  // Dark theme surfaces — deep navy, never pure black, for a premium feel.
  static const Color darkBg = Color(${hexToDart(surface.darkBg)});
  static const Color darkSurface = Color(${hexToDart(surface.darkSurface)});
  static const Color darkSurfaceAlt = Color(${hexToDart(surface.darkSurfaceAlt)});
  static const Color darkSurfaceHigh = Color(${hexToDart(surface.darkSurfaceHigh)});
  static const Color darkBorder = Color(0x1FFFFFFF);

  // Semantic — designed for dark surfaces, see comments in tokens.json
  static const Color success = Color(${hexToDart(semantic.success)});
  static const Color warning = Color(${hexToDart(semantic.warning)});
  static const Color danger = Color(${hexToDart(semantic.danger)});
  static const Color info = Color(${hexToDart(semantic.info)});

  /// نسخهٔ تیره‌ترِ همان رنگ‌ها، برای نشستن روی سطحِ روشن (WCAG ≥4.5:1).
  static const Color successOnLight = Color(${hexToDart(semantic.successOnLight)});
  static const Color warningOnLight = Color(${hexToDart(semantic.warningOnLight)});
  static const Color dangerOnLight = Color(${hexToDart(semantic.dangerOnLight)});
  static const Color infoOnLight = Color(${hexToDart(semantic.infoOnLight)});
  static const Color amberOnLight = Color(${hexToDart(semantic.amberOnLight)});
  static const Color emeraldOnLight = Color(${hexToDart(semantic.emeraldOnLight)});

  static const List<Color> heroGradientDark = [emerald, blue];
  static const List<Color> heroGradientLight = [
    Color(0xFF00C398),
    Color(0xFF2C82FF)
  ];
  static const List<Color> goldGradient = [amber, amberDeep];
  static const List<Color> leagueGradientDark = [Color(0xFF172F56), emerald];
  static const List<Color> leagueGradientLight = [
    Color(0xFF23477F),
    Color(0xFF00C398)
  ];
  static const List<Color> cardGradient = [
    Color(0xFFFFD36B),
    Color(0xFF0B2B4F),
    emerald
  ];
}
`;
}

writeFile('userweb/src/theme.css', generateUserwebTheme());
writeFile('admin/src/theme.css', generateAdminTheme());
writeFile('mobile/lib/theme/colors.dart', generateMobileColors());

if (!check) {
  console.log('\n✓ tokens.json → 3 files generated. Run with --check in CI to enforce parity.');
}
