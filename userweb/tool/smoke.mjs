#!/usr/bin/env node
/**
 * Runtime smoke test for the user portal. A Vite build does not resolve every
 * JSX identifier at compile time, so this logs in and actually mounts every
 * destination, including pages hidden behind the mobile «بیشتر» sheet.
 *
 * Usage: node tool/smoke.mjs <baseUrl> <jwt>
 */
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://localhost:4173';
const TOKEN = process.argv[3] || '';
const DIRECT = {
  home: 'خانه', rewards: 'جوایز', league: 'لیگ', club: 'چت و بازی',
};
const MORE = {
  inventory: 'کلکسیون کارت‌ها', wallet: 'کیف پول', invite: 'دعوت دوستان',
  support: 'پشتیبانی', profile: 'پروفایل',
};
const HEADER = { pass: 'گذر نبرد فصلی', shop: 'فروشگاه', wheel: 'گردونه' };
const DESTINATIONS = [
  'home', 'rewards', 'league', 'club', 'inventory', 'wallet', 'invite',
  'support', 'profile', 'pass', 'shop', 'wheel',
];

let failures = 0;
const ok = (cond, name) => {
  console.log(`  ${cond ? '✓' : '✗'} ${name}`);
  if (!cond) failures++;
};

const browser = await chromium.launch();
const page = await browser.newPage();
const pageErrors = [];

// Local preview talks to the production API by design, whose CORS allow-list
// correctly rejects localhost. Playwright relays those requests from Node so
// we can runtime-test an authenticated local build without weakening CORS or
// deploying unverified code. This only proxies requests initiated by the page.
if (/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/)/.test(BASE)) {
  await page.route('https://api.ghelghelishop.ir/**', async route => {
    try {
      const response = await route.fetch();
      await route.fulfill({ response });
    } catch {
      await route.abort();
    }
  });
}

page.on('pageerror', e => pageErrors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') pageErrors.push(m.text()); });

async function openDestination(id) {
  if (DIRECT[id]) {
    await page.locator('.mobileNav button', { hasText: DIRECT[id] }).click();
  } else if (MORE[id]) {
    await page.locator('.mobileNav button', { hasText: 'بیشتر' }).click();
    await page.locator('.moreSheet button', { hasText: MORE[id] }).click();
  } else {
    const selector = id === 'wheel'
      ? '.appBar button.wheelShortcut'
      : `.appBar button[title="${HEADER[id]}"]`;
    await page.locator(selector).click();
  }
  await page.waitForTimeout(900);
}

try {
  console.log(`\n== smoke: ${BASE} ==`);
  await page.goto(BASE, { waitUntil: 'networkidle' });
  ok(pageErrors.length === 0,
    `login page renders cleanly${pageErrors[0] ? ` (${pageErrors[0].slice(0, 90)})` : ''}`);
  ok((await page.innerText('body')).trim().length > 0, 'login page is not blank');

  if (!TOKEN) {
    console.log('  (no token supplied — skipping the logged-in checks)');
  } else {
    pageErrors.length = 0;
    await page.evaluate(t => localStorage.setItem('token', t), TOKEN);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(2500);

    const rootLen = await page.evaluate(() =>
      document.getElementById('root')?.innerHTML.length || 0);
    ok(rootLen > 500, `portal rendered (${rootLen} chars in #root)`);
    ok(pageErrors.length === 0,
      `no runtime errors after login${pageErrors[0] ? ` (${pageErrors[0].slice(0, 120)})` : ''}`);

    const nav = await page.locator('.mobileNav button').count();
    ok(nav === 5, `mobile navigation has four primary tabs + More (${nav})`);

    for (const id of DESTINATIONS) {
      pageErrors.length = 0;
      await openDestination(id);
      const txt = (await page.innerText('body')).trim();
      ok(txt.length > 40 && pageErrors.length === 0,
        `destination "${id}" renders${pageErrors[0] ? ` — ${pageErrors[0].slice(0, 90)}` : ''}`);
    }

    // Club has a second, nested destination that ordinary tab walking misses.
    await openDestination('club');
    await page.locator('.clubTabs button', { hasText: 'بازی‌ها' }).click();
    await page.waitForTimeout(900);
    const gamesText = await page.innerText('body');
    ok(gamesText.includes('۱۰۰ امتیاز') && gamesText.includes('ضربه‌زن'),
      'club: complete games hub renders');
    ok(pageErrors.length === 0, 'club: games hub has no runtime error');

    // Standalone games must be real routed screens, not the old placeholders.
    pageErrors.length = 0;
    await page.locator('.card', { hasText: 'دوئل کارت‌ها' }).last().click();
    await page.waitForTimeout(1200);
    ok((await page.innerText('body')).includes('دوئل ۳ کارتی'),
      'card duel full screen renders');
    ok(pageErrors.length === 0, 'card duel has no runtime error');
    await page.getByRole('button', { name: /بازگشت/ }).first().click();
    await page.waitForTimeout(500);
    await page.locator('.card', { hasText: 'بازی ضربه‌زن' }).first().click();
    await page.waitForTimeout(1000);
    ok((await page.innerText('body')).includes('لول'), 'tap game full screen renders');
    ok(pageErrors.length === 0, 'tap game has no runtime error');

    // Wallet gets focused assertions because it is financially sensitive.
    pageErrors.length = 0;
    await openDestination('wallet');
    const wTxt = await page.innerText('body');
    ok(wTxt.includes('موجودی قابل برداشت'), 'wallet balance card renders');
    ok((await page.locator('.walletHero').count()) === 1, 'wallet hero exists');
    ok((await page.locator('.walletActions button').count()) >= 2,
      'wallet withdraw and bank-card actions exist');
    ok(pageErrors.length === 0,
      `wallet has no runtime error${pageErrors[0] ? ` — ${pageErrors[0].slice(0, 110)}` : ''}`);

    // Home shortcuts must lead to the same standalone destinations.
    await openDestination('home');
    ok((await page.locator('.walletEntry').count()) === 1,
      'home wallet entry is visible');
    await page.locator('.walletEntry').click();
    await page.waitForTimeout(800);
    ok((await page.innerText('body')).includes('موجودی قابل برداشت'),
      'home wallet entry opens wallet');
  }
} catch (e) {
  console.error('  ✗ smoke run threw:', e.message);
  failures++;
} finally {
  await browser.close();
}

console.log(`\n${failures === 0 ? '✅' : '❌'} ${failures} failure(s)\n`);
process.exit(failures === 0 ? 0 : 1);
