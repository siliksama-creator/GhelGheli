#!/usr/bin/env node
/**
 * Headless smoke test for the user web app.
 *
 * WHY THIS EXISTS
 * A refactor once deleted the `Avatar` component while leaving its call site
 * in place. `vite build` succeeded (JSX identifiers are resolved at RUNTIME),
 * the deploy went green, and every logged-in user got a blank page with
 * "Avatar is not defined" in the console. A build that compiles is not proof
 * that the app renders — this actually loads it in Chromium, logs in, walks
 * every tab and fails on any page error.
 *
 * Usage:
 *   node tool/smoke.mjs <baseUrl> <jwt>
 */
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://localhost:4173';
const TOKEN = process.argv[3] || '';

const TABS = ['home', 'rewards', 'league', 'club', 'support', 'profile'];

let failures = 0;
const ok = (cond, name) => {
  console.log(`  ${cond ? '✓' : '✗'} ${name}`);
  if (!cond) failures++;
};

const browser = await chromium.launch();
const page = await browser.newPage();

const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error') pageErrors.push(m.text());
});

try {
  console.log(`\n== smoke: ${BASE} ==`);
  await page.goto(BASE, { waitUntil: 'networkidle' });
  ok(pageErrors.length === 0, `login page renders cleanly${pageErrors[0] ? ` (${pageErrors[0].slice(0, 90)})` : ''}`);
  ok((await page.innerText('body')).trim().length > 0, 'login page is not blank');

  if (!TOKEN) {
    console.log('  (no token supplied — skipping the logged-in checks)');
  } else {
    pageErrors.length = 0;
    await page.evaluate((t) => localStorage.setItem('token', t), TOKEN);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(2500);

    const rootLen = await page.evaluate(() => document.getElementById('root')?.innerHTML.length || 0);
    ok(rootLen > 500, `portal rendered (${rootLen} chars in #root)`);
    ok(pageErrors.length === 0,
      `no runtime errors after login${pageErrors[0] ? ` (${pageErrors[0].slice(0, 120)})` : ''}`);

    const nav = await page.locator('.mobileNav button').count();
    ok(nav >= 6, `navigation rendered (${nav} tabs)`);

    // Walk every tab: this is what would have caught the missing Avatar.
    for (let i = 0; i < TABS.length; i++) {
      pageErrors.length = 0;
      await page.locator('.mobileNav button').nth(i).click();
      await page.waitForTimeout(900);
      const txt = (await page.innerText('body')).trim();
      ok(txt.length > 40 && pageErrors.length === 0,
        `tab "${TABS[i]}" renders${pageErrors[0] ? ` — ${pageErrors[0].slice(0, 90)}` : ''}`);
    }
  }
} catch (e) {
  console.error('  ✗ smoke run threw:', e.message);
  failures++;
} finally {
  await browser.close();
}

console.log(`\n${failures === 0 ? '✅' : '❌'} ${failures} failure(s)\n`);
process.exit(failures === 0 ? 0 : 1);
