#!/usr/bin/env node
/**
 * Typography regression test for the user web app.
 *
 * WHY THIS EXISTS
 * The app shipped `font-family: Tahoma, Arial, sans-serif` while five
 * Vazirmatn weights sat unused in /public/fonts. Tahoma has no Persian
 * design, so every device fell back to a different system font and the UI
 * looked cheap and inconsistent. The deployed CSS bundle contained ZERO
 * @font-face rules — a build that compiles proves nothing about what the
 * browser actually paints, so this loads the real app and inspects the
 * COMPUTED styles of every rendered element.
 *
 * It fails on:
 *   1. any text not rendered in Vazirmatn
 *   2. a computed font-weight above 800 (Vazirmatn's real maximum — anything
 *      higher makes the browser synthesise a smeared fake bold)
 *   3. body text below 11.5px, which is unreadable on a phone
 *   4. horizontal page overflow
 *   5. any console/page error while walking the tabs
 *
 * Usage:
 *   node tool/typography.mjs <baseUrl> <jwt>
 */
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://localhost:4173';
const TOKEN = process.argv[3] || '';
const TABS = ['home', 'rewards', 'league', 'club', 'support', 'profile'];

/** Vazirmatn's heaviest real cut. Above this the browser fakes it. */
const MAX_REAL_WEIGHT = 800;
const MIN_READABLE_PX = 11.5;

let failures = 0;
const ok = (cond, name) => {
  console.log(`  ${cond ? '✓' : '✗'} ${name}`);
  if (!cond) failures++;
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 430, height: 950 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

/** Walks the DOM and reports every typography violation on screen. */
const audit = () => page.evaluate(([maxW, minPx]) => {
  const bad = { notVazir: [], synthBold: [], tiny: [] };
  const label = el => el.className?.toString().split(' ')[0] || el.tagName;
  for (const el of document.querySelectorAll('body *')) {
    // Only leaf nodes that actually paint text.
    if (el.children.length || !(el.textContent || '').trim()) continue;
    if (getComputedStyle(el).display === 'none') continue;
    const cs = getComputedStyle(el);
    if (!/Vazirmatn/.test(cs.fontFamily)) bad.notVazir.push(`${label(el)}→${cs.fontFamily.split(',')[0]}`);
    if (parseInt(cs.fontWeight, 10) > maxW) bad.synthBold.push(`${label(el)}:${cs.fontWeight}`);
    if (parseFloat(cs.fontSize) < minPx) bad.tiny.push(`${label(el)}:${cs.fontSize}`);
  }
  bad.overflow = document.documentElement.scrollWidth > window.innerWidth + 1
    ? `${document.documentElement.scrollWidth}px > ${window.innerWidth}px` : null;
  // Dedupe: one offending class reported once, not fifty times.
  for (const k of ['notVazir', 'synthBold', 'tiny']) bad[k] = [...new Set(bad[k])];
  return bad;
}, [MAX_REAL_WEIGHT, MIN_READABLE_PX]);

const check = (where, r) => {
  ok(r.notVazir.length === 0, `${where}: all text uses Vazirmatn${r.notVazir.length ? ` — ${r.notVazir.slice(0, 4).join(', ')}` : ''}`);
  ok(r.synthBold.length === 0, `${where}: no synthetic bold (>${MAX_REAL_WEIGHT})${r.synthBold.length ? ` — ${r.synthBold.slice(0, 4).join(', ')}` : ''}`);
  ok(r.tiny.length === 0, `${where}: no text under ${MIN_READABLE_PX}px${r.tiny.length ? ` — ${r.tiny.slice(0, 4).join(', ')}` : ''}`);
  ok(!r.overflow, `${where}: no horizontal overflow${r.overflow ? ` — ${r.overflow}` : ''}`);
};

try {
  console.log(`\n== typography: ${BASE} ==`);
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);

  // The whole point: the font files must actually load, not just be declared.
  const loaded = await page.evaluate(() =>
    [...document.fonts].filter(f => f.status === 'loaded').map(f => `${f.family}:${f.weight}`));
  ok(loaded.some(f => f.startsWith('Vazirmatn')),
    `Vazirmatn actually loaded (${loaded.join(', ') || 'nothing'})`);

  check('login', await audit());

  if (!TOKEN) {
    console.log('  (no token supplied — skipping the logged-in checks)');
  } else {
    await page.evaluate(t => localStorage.setItem('token', t), TOKEN);
    await page.reload({ waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(2200);

    for (let i = 0; i < TABS.length; i++) {
      await page.locator('.mobileNav button').nth(i).click();
      await page.waitForTimeout(900);
      check(`tab "${TABS[i]}"`, await audit());
    }

    // The games hub lives behind a sub-tab of «چت و بازی», so we have to get
    // back onto that top-level tab first — the loop above left us on
    // "profile". Selecting by LABEL rather than index keeps this working if
    // the nav is ever reordered.
    for (const t of await page.locator('.mobileNav button').all()) {
      if ((await t.innerText()).includes('بازی')) { await t.click(); break; }
    }
    await page.waitForTimeout(1000);
    for (const t of await page.locator('.clubTabs button').all()) {
      if ((await t.innerText()).includes('بازی')) { await t.click(); break; }
    }
    await page.waitForTimeout(1600);
    check('games hub', await audit());

    const tiles = await page.locator('.gameTile').count();
    ok(tiles >= 3, `games hub lists its tiles (${tiles})`);

    const hubText = await page.innerText('.gameGrid');
    ok(hubText.includes('جفت') || hubText.includes('بازی'), 'games hub renders game tiles correctly');
  }

  ok(errors.length === 0, `no runtime errors${errors[0] ? ` — ${errors[0].slice(0, 100)}` : ''}`);
} catch (e) {
  console.error('  ✗ typography run threw:', e.message);
  failures++;
} finally {
  await browser.close();
}

console.log(`\n${failures === 0 ? '✅' : '❌'} ${failures} failure(s)\n`);
process.exit(failures === 0 ? 0 : 1);
