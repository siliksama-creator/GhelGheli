#!/usr/bin/env node
/**
 * Runtime smoke test for the user portal. A Vite build does not resolve every
 * JSX identifier at compile time, so this logs in and actually mounts every
 * destination, including pages hidden behind the mobile «بیشتر» sheet.
 *
 * Usage: node tool/smoke.mjs <baseUrl> <jwt>
 */
import { chromium } from 'playwright';
import { installApiStub, isLocalBase } from './api-stub.mjs';

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
// correctly rejects localhost — and a CI runner has no guaranteed route to that
// domain either. Both cases used to leave the page hanging until the 30s
// `networkidle` window expired and then throw two console errors. The stub
// answers those requests inside the browser instead of the network, so the page
// settles immediately and no error is produced at all. Full reasoning:
// tool/api-stub.mjs.
if (isLocalBase(BASE)) await installApiStub(page);

page.on('pageerror', e => pageErrors.push(String(e)));
// هر خطای کنسول می‌شکند. فیلترکردنِ پیام‌ها (یک دور همین‌جا بود) علاوه بر
// نویزِ APIِ تولیدی، خطای واقعیِ شبکه در اپ را هم پنهان می‌کرد. نویز حالا
// از منبعش قطع شده است (tool/api-stub.mjs)، پس شنونده سخت‌گیر می‌ماند.
page.on('console', m => { if (m.type() === 'error') pageErrors.push(m.text()); });

/**
 * پوششِ راه‌اندازی («صفحهٔ بارگذاریِ سینمایی») چند لحظه بعد از بالا آمدنِ اپ
 * محو می‌شود. برای سنجشِ «اصلاً می‌آید یا نه» باید از فریمِ اول نگاه کرد،
 * نه بعد از `networkidle`.
 *
 * نمونه‌گیری تا ۳ ثانیه ادامه دارد و «دیده شد / دیده نشد» را برمی‌گرداند.
 */
async function watchSplash(target) {
  let seen = false;
  for (let i = 0; i < 60; i++) {
    if (await target.evaluate(() => !!document.querySelector('.splashRoot'))) {
      seen = true;
      break;
    }
    await target.waitForTimeout(50);
  }
  // اگر دیده شد، صبر می‌کنیم تا برود؛ وگرنه تست‌های بعدی روی یک لایهٔ
  // تمام‌صفحه اجرا می‌شوند.
  if (seen) {
    for (let i = 0; i < 60; i++) {
      if (!(await target.evaluate(() => !!document.querySelector('.splashRoot')))) break;
      await target.waitForTimeout(50);
    }
  }
  return seen;
}

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
  try {
    await page.goto(BASE, { waitUntil: 'networkidle', timeout: 15000 });
  } catch {
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 15000 });
  }
  ok(pageErrors.length === 0,
    `login page renders cleanly${pageErrors[0] ? ` (${pageErrors[0].slice(0, 90)})` : ''}`);
  ok((await page.innerText('body')).trim().length > 0, 'login page is not blank');

  // ═══════════════════════════════════════════════════════════════════════
  //  پوششِ راه‌اندازی: روی گوشی باید باشد، روی دسکتاپ نه
  // ═══════════════════════════════════════════════════════════════════════
  //
  // خواستهٔ مالک (۲۷ شهریور): «این لودینگ برای وب دسکتاپ رو حذف کن، برای وب
  // موبایل ولی عالیه.» آن تصمیم دو طرف دارد و هر دو باید قفل شوند — وگرنه
  // نفرِ بعدی با «چرا روی مانیتور نمی‌آید؟» حذفش می‌کند، یا برعکس، برمی‌گرداندش.
  //
  // بریکپوینت همان `max-width: 900px` چیدمانِ اپ است (base.css). پس عددِ
  // ۹۰۰ در دو طرفِ مرز سنجیده می‌شود: ۸۹۹ (گوشی) و ۱۴۴۰ (دسکتاپ).
  //
  // ⚠️ چرا با مرورگرِ واقعی و نه با خواندنِ سورس: استاتیک فقط می‌تواند بگوید
  //    «شرط نوشته شده»، نه «شرط کار می‌کند». یک `matchMedia` با پرانتزِ اشتباه
  //    هم از هر بررسیِ متنی رد می‌شود.
  {
    const phone = await browser.newPage({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 3,
    });
    await phone.goto(BASE, { waitUntil: 'domcontentloaded' });
    // `waitUntil: 'domcontentloaded'` تا پوشش را در همان پنجرهٔ خودش ببینیم.
    const phoneSaw = await watchSplash(phone);
    ok(phoneSaw, 'نمای گوشی (۳۹۰px): پوششِ راه‌اندازی نمایش داده می‌شود');
    await phone.close();

    const desk = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await desk.goto(BASE, { waitUntil: 'domcontentloaded' });
    const deskSaw = await watchSplash(desk);
    ok(!deskSaw, 'نمای دسکتاپ (۱۴۴۰px): پوششِ راه‌اندازی نمایش داده نمی‌شود');
    // و صفحه نباید خالی بماند: با حذفِ پوشش، واسطِ اصلی باید خودش بیاید.
    ok((await desk.innerText('body')).trim().length > 15,
      'نمای دسکتاپ: واسطِ اصلی بدونِ پوشش رندر می‌شود');
    // لوگوی دسکتاپ باید همان انیمیشنِ همیشگی را داشته باشد. اگر حذفِ پوشش
    // علامتِ «راه‌اندازی تمام شد» را جا بیندازد، این انیمیشن قفل می‌ماند و
    // هیچ‌کس نمی‌فهمد چرا لوگو بی‌حرکت شده.
    const markAnim = await desk.evaluate(() => {
      const el = document.querySelector('.heroMark');
      return el ? getComputedStyle(el).animationName : '';
    });
    ok(/heroSettle/.test(markAnim),
      `نمای دسکتاپ: انیمیشنِ ورودِ لوگو آزاد است (${markAnim || 'لوگو پیدا نشد'})`);
    await desk.close();
  }

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
    // ــ چرا اول «تمرین با ربات» انتخاب می‌شود ــ
    // حالتِ پیش‌فرضِ هاب «۱۰۰ امتیاز» است و `games.jsx` پیش از باز کردنِ
    // بازی موجودیِ امتیاز را چک می‌کند؛ اگر کاربر کم بیاورد یک alert()
    // می‌دهد و کلیک را رد می‌کند. Playwright به‌طور خودکار alert را
    // می‌بندد، پس کلیک بی‌صدا بی‌اثر می‌شد و تست شکست می‌خورد بدون آنکه
    // خطایی دیده شود — یعنی تست به موجودیِ امتیازِ حسابِ آزمایشی وابسته
    // بود، نه به سلامتِ خودِ صفحه. این گاردِ سمتِ سرور/کلاینت درست است و
    // نباید ضعیف شود؛ در عوض تست حالتِ رایگانِ «تمرین با ربات» را
    // برمی‌گزیند تا مستقل از امتیاز، همیشه همان صفحه‌ی بازی را باز کند.
    pageErrors.length = 0;
    await page.locator('button', { hasText: 'تمرین با ربات' }).first().click();
    await page.waitForTimeout(500);
    await page.locator('.card', { hasText: 'دوئل کارت‌ها' }).last().click();
    await page.waitForTimeout(1200);
    const duelText = await page.innerText('body');
    // ── چرا این‌جا دو تغییر شد (۲۹ شهریور) ───────────────────────────────
    //  ۱. بین «کارتِ دوئل» و «راندِ اول» یک **صفحهٔ لابی** هست (قوانین،
    //     قدرتِ تیم، دکمهٔ «ورود به تمرین با ربات» + کارت‌های قرضی). تستِ
    //     قبلی مستقیم منتظرِ واژهٔ «راند» می‌ماند و روی حسابِ تازه‌ای که
    //     کارتی ندارد هرگز به راند نمی‌رسید — یعنی گارد، شکستِ واقعیِ
    //     محصول را نمی‌سنجید و فقط بی‌دلیل قرمز می‌شد.
    //  ۲. متنِ «راند» فقط در لحظهٔ آغازِ راند دیده می‌شود و بعد می‌رود؛
    //     یک نمونه‌برداری در لحظهٔ ثابت، آزمونی بود که به شانس وابسته
    //     است. حالا تا ۸ ثانیه فعالانه صبر می‌کنیم.
    const enterPractice = page.locator('button', { hasText: 'ورود به تمرین' }).first();
    if (await enterPractice.count()) {
      await enterPractice.click();
    }
    let sawRound = false;
    for (let i = 0; i < 16 && !sawRound; i++) {
      await page.waitForTimeout(500);
      sawRound = (await page.innerText('body')).includes('راند');
    }
    // «سه راند» به «پنج راند» تغییر کرد (بازطراحیِ دوئل، کامیتِ 4f67a5e).
    // به‌جای عددِ ثابت، به تیترِ صفحه و واژهٔ «راند» تکیه می‌کنیم تا تست با
    // هر تغییرِ بعدیِ تعدادِ راندها بی‌دلیل قرمز نشود.
    ok(duelText.includes('دوئل کارت‌ها') && sawRound,
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
