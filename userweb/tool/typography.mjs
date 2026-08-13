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
const DIRECT = { home: 'خانه', rewards: 'جوایز', league: 'لیگ', club: 'چت و بازی' };
const MORE = { inventory: 'کلکسیون کارت‌ها', wallet: 'کیف پول', support: 'پشتیبانی', profile: 'پروفایل' };
const TABS = [...Object.keys(DIRECT), ...Object.keys(MORE)];

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

if (/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/)/.test(BASE)) {
  await page.route('https://api.ghelghelishop.ir/**', async route => {
    try {
      await route.fulfill({ response: await route.fetch() });
    } catch {
      await route.abort();
    }
  });
}

async function openTab(id) {
  if (DIRECT[id]) {
    await page.locator('.mobileNav button', { hasText: DIRECT[id] }).click();
  } else {
    await page.locator('.mobileNav button', { hasText: 'بیشتر' }).click();
    await page.locator('.moreSheet button', { hasText: MORE[id] }).click();
  }
  await page.waitForTimeout(900);
}
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
    // Icon-only leaves (ellipsis/emoji) intentionally use an emoji fallback;
    // only actual letters or digits must render in Vazirmatn.
    const hasLanguageGlyph = /[\p{L}\p{N}]/u.test((el.textContent || '').trim());
    // `<code>` is deliberately monospaced. In `.pcCodeHint` the whole point is
    // to show that `0`/`O` and `1`/`I`/`L` look alike — a proportional Persian
    // face would defeat the lesson the hint is teaching. Latin card codes in a
    // fixed-width box are correct typography, not a regression, so an explicit
    // monospace <code> is exempt rather than a standing false failure.
    const isIntentionalMono = el.tagName === 'CODE'
      && /mono/i.test(cs.fontFamily);
    if (hasLanguageGlyph && !isIntentionalMono && !/Vazirmatn/.test(cs.fontFamily)) {
      bad.notVazir.push(`${label(el)}→${cs.fontFamily.split(',')[0]}`);
    }
    if (parseInt(cs.fontWeight, 10) > maxW) bad.synthBold.push(`${label(el)}:${cs.fontWeight}`);
    // ── چرا نشانِ شمارشی از قاعدهٔ اندازه مستثناست ──
    //
    // `.badge` (شمارِ نوتیفیکیشنِ خوانده‌نشده) و `.wheelBadge` عمداً
    // ۱۰.۵px هستند: یک دایرهٔ ۱۷ پیکسلی روی گوشهٔ آیکنِ زنگ که فقط یک
    // یا دو رقم دارد. بزرگ‌ترکردنِ فونت یعنی یا دایره بزرگ شود و روی
    // آیکن بیفتد، یا رقم سرریز کند.
    //
    // قاعدهٔ ۱۱.۵px برای **متنِ خواندنی** نوشته شده — جمله‌ای که کاربر
    // می‌خواند — نه برای نشانِ عددیِ تک‌رقمی. خودِ `style.css` هم این را
    // مستند کرده و به همین دلیل رنگش را به #d81e33 برده تا با کنتراستِ
    // ۵.۰۶ در همان اندازهٔ کوچک خوانا بماند.
    //
    // ⚠️ بدونِ این استثنا، ابزار روی **هر ۹ تب** یک شکستِ تکراری
    //    گزارش می‌کرد (`badge:10.5px`). نُه قرمزِ کاذب باعث می‌شود آدم‌ها
    //    یاد بگیرند خروجیِ این ابزار را نادیده بگیرند — که از نبودنش
    //    بدتر است.
    const isCountBadge = /(^|\s)(badge|wheelBadge|lvlBadge)(\s|$)/
      .test(el.className?.toString() || '')
      && /^\s*[\u06F0-\u06F9\u0660-\u06690-9]{1,3}\s*$/.test(el.textContent || '');
    if (hasLanguageGlyph && !isCountBadge && parseFloat(cs.fontSize) < minPx) {
      bad.tiny.push(`${label(el)}:${cs.fontSize}`);
    }
  }
  bad.overflow = document.documentElement.scrollWidth > window.innerWidth + 1
    ? `${document.documentElement.scrollWidth}px > ${window.innerWidth}px` : null;

  // ═══════════════════════════════════════════════════════════════════════
  //  ⚠️⚠️ چرا چکِ scrollWidth کافی نیست — باگی که این ابزار از دست داد
  // ═══════════════════════════════════════════════════════════════════════
  //
  // در بازیِ کارت، دو کارت از پنج کارتِ دستِ کاربر بیرونِ صفحه بودند
  // (left=-49 و right=431 در عرضِ ۳۹۰). ولی چون والدشان `overflow:hidden`
  // داشت، سرریز **بریده** می‌شد و `document.scrollWidth` دقیقاً ۳۹۰
  // می‌ماند. یعنی این ابزار سبز گزارش می‌داد در حالی که کاربر
  // نمی‌توانست روی ۴۰٪ از دستش کلیک کند.
  //
  // نگهبانی که فقط اسکرول را می‌بیند، **بریدگی** را نمی‌بیند. پس
  // مستقیم سراغِ خودِ عناصرِ تعاملی می‌رویم و دو چیز را می‌پرسیم:
  //   ۱. مستطیلش داخلِ صفحه است؟
  //   ۲. `elementFromPoint` روی مرکزش خودش را برمی‌گرداند؟ (یعنی واقعاً
  //      قابلِ کلیک است، نه اینکه چیزِ دیگری رویش افتاده باشد)
  //
  // فقط عناصرِ تعاملی، چون تزئینِ بریده‌شده اشکالی ندارد ولی دکمهٔ
  // بریده‌شده یعنی کاربر نمی‌تواند بازی کند.
  bad.unreachable = [];
  for (const el of document.querySelectorAll('button,[role="button"],a[href]')) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;                 // مخفی — کارِ ما نیست
    if (el.disabled) continue;                           // عمداً غیرفعال
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.opacity === '0') continue;
    const outside = r.left < -1 || r.right > window.innerWidth + 1;
    if (!outside) continue;
    // ⚠️ استثنای عمدی: قفسهٔ افقی. اگر عنصر داخلِ ظرفی است که خودش
    //    اسکرولِ افقیِ عمدی دارد (`overflow-x:auto/scroll`)، بیرون بودن
    //    از دیدِ اولیه **باگ نیست** — کاربر اسکرول می‌کند و می‌رسد.
    //    بدونِ این استثنا، `.duelGridV2` (قفسهٔ انتخابِ کارت) قرمزِ کاذب
    //    می‌داد و درسِ ثبت‌شدهٔ این پروژه است که قرمزِ کاذب باعث می‌شود
    //    آدم‌ها کلِ خروجیِ ابزار را نادیده بگیرند.
    let scrollableParent = false;
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      const ox = getComputedStyle(a).overflowX;
      if (ox === 'auto' || ox === 'scroll') { scrollableParent = true; break; }
    }
    if (scrollableParent) continue;
    bad.unreachable.push(`${label(el)}:${Math.round(r.left)}..${Math.round(r.right)}`);
  }
  bad.unreachable = [...new Set(bad.unreachable)].slice(0, 6);
  // Dedupe: one offending class reported once, not fifty times.
  for (const k of ['notVazir', 'synthBold', 'tiny']) bad[k] = [...new Set(bad[k])];
  return bad;
}, [MAX_REAL_WEIGHT, MIN_READABLE_PX]);

const check = (where, r) => {
  ok(r.notVazir.length === 0, `${where}: all text uses Vazirmatn${r.notVazir.length ? ` — ${r.notVazir.slice(0, 4).join(', ')}` : ''}`);
  ok(r.synthBold.length === 0, `${where}: no synthetic bold (>${MAX_REAL_WEIGHT})${r.synthBold.length ? ` — ${r.synthBold.slice(0, 4).join(', ')}` : ''}`);
  ok(r.tiny.length === 0, `${where}: no text under ${MIN_READABLE_PX}px${r.tiny.length ? ` — ${r.tiny.slice(0, 4).join(', ')}` : ''}`);
  ok(!r.overflow, `${where}: no horizontal overflow${r.overflow ? ` — ${r.overflow}` : ''}`);
  // ⚠️ جدا از overflow: این یکی بریدگیِ عناصرِ **تعاملی** را می‌گیرد که
  //    زیرِ `overflow:hidden` پنهان می‌شود و در scrollWidth دیده نمی‌شود.
  ok((r.unreachable || []).length === 0,
    `${where}: every control is inside the viewport${(r.unreachable || []).length ? ` — ${r.unreachable.join(', ')}` : ''}`);
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

    for (const id of TABS) {
      await openTab(id);
      check(`tab "${id}"`, await audit());
    }

    // The games hub is nested under «چت و بازی».
    await openTab('club');
    await page.locator('.clubTabs button', { hasText: 'بازی‌ها' }).click();
    await page.waitForTimeout(1600);
    check('games hub', await audit());
    const hubText = await page.innerText('.tabPane');
    ok(hubText.includes('۱۰۰ امتیاز') && hubText.includes('جفت‌یاب'),
      'games hub renders all game controls');

    // ═══════════════════════════════════════════════════════════════════
    // چرا داخلِ خودِ بازی هم بازرسی می‌شود
    // ═══════════════════════════════════════════════════════════════════
    //
    // این ابزار تا امروز فقط تا «هابِ بازی‌ها» جلو می‌رفت و هرگز واردِ
    // صفحهٔ دوئل نمی‌شد. نتیجه: «۰ شکست» گزارش می‌کرد در حالی که داخلِ
    // آرنا **۱۰۹ متنِ زیرِ ۱۱٫۵px** بود (ریزترین ۸٫۲px) — دقیقاً همان
    // چیزی که مالک گزارش کرد: «فونت های بازی خوانا باشه».
    //
    // درسِ ثبت‌شدهٔ همین پروژه: «۰ خطا» فقط دربارهٔ چیزی معتبر است که
    // ابزار **واقعاً باز کرده باشد**.
    //
    // حالتِ «تمرین با ربات» انتخاب می‌شود چون رایگان است و امتیازِ
    // کاربرِ تست را مصرف نمی‌کند.
    const botMode = page.locator('button', { hasText: 'تمرین با ربات' });
    if (await botMode.count()) {
      await botMode.first().click();
      await page.waitForTimeout(1200);
    }
    // کلیک با JS: نوارِ ناوبریِ پایین روی کاشی می‌افتد و کلیکِ معمولی
    // را می‌دزدد — یک بار همین باعث شد تست فکر کند بازی باز نشده.
    const opened = await page.evaluate(() => {
      const tile = [...document.querySelectorAll('.card')]
        .find(c => c.innerText.includes('دوئل کارت'));
      if (!tile) return false;
      tile.click();
      return true;
    });
    ok(opened, 'card duel tile is reachable from the games hub');
    if (opened) {
      await page.waitForTimeout(3000);
      check('card duel arena', await audit());
      const duelText = await page.innerText('body');
      ok(duelText.includes('دوئل کارت') || duelText.includes('ARENA'),
        'card duel arena actually rendered');

      // ═══════════════════════════════════════════════════════════════
      //  ⚠️⚠️ چرا تا **داخلِ نبرد** جلو می‌رویم و به صفحهٔ ترکیب بسنده
      //       نمی‌کنیم
      // ═══════════════════════════════════════════════════════════════
      //
      // این ابزار تا امروز روی صفحهٔ «ترکیب» می‌ایستاد و سبز می‌داد.
      // ولی سه باگِ جدی فقط **بعد از شروعِ نبرد** دیده می‌شدند:
      //
      //   ۱. دو کارت از پنج کارتِ دست بیرونِ صفحه و غیرقابلِ کلیک
      //   ۲. کارت‌های بی‌تصویر با اسپینرِ ابدی به‌جای چهرهٔ نقاشی‌شده
      //   ۳. ده‌ها متنِ زیرِ ۱۱٫۵px در دستِ کارت و صحنهٔ برخورد
      //
      // «۰ شکست» فقط دربارهٔ صفحه‌ای معتبر است که ابزار واقعاً باز کرده
      // باشد. صفحهٔ نبرد باز نمی‌شد، پس سبزیِ آن بی‌معنی بود.
      const enter = page.locator('button', { hasText: 'ورود به تمرین با ربات' });
      if (await enter.count()) {
        await enter.first().click();
        await page.waitForTimeout(4000);
        check('card duel battle', await audit());

        // ═══════════════════════════════════════════════════════════════
        //  ⚠️ سنجهٔ اختصاصیِ باگِ «کارتِ غیرقابلِ کلیک»
        // ═══════════════════════════════════════════════════════════════
        //
        // دستِ کارت یک قفسهٔ افقیِ اسکرول‌شونده است (همان الگوی اندروید).
        // پس «بیرونِ دیدِ اولیه» به‌تنهایی باگ نیست — سؤالِ درست این است
        // که آیا کاربر **می‌تواند به هر کارت برسد و رویش کلیک کند**.
        //
        // پس هر کارت را به وسطِ قفسه اسکرول می‌کنیم و بعد
        // `elementFromPoint` را می‌پرسیم. این دقیقاً همان کاری است که
        // کاربر می‌کند، و تنها راهِ تشخیصِ «بریده و غیرقابلِ دسترس» از
        // «فعلاً بیرونِ دید ولی قابلِ اسکرول».
        const handCount = await page.evaluate(() =>
          document.querySelectorAll('.duelHandCard').length);
        ok(handCount > 0, 'battle: the hand rendered');
        const broken = [];
        for (let i = 0; i < handCount; i += 1) {
          const reachable = await page.evaluate((idx) => {
            const c = document.querySelectorAll('.duelHandCard')[idx];
            if (!c) return false;
            c.scrollIntoView({ block: 'nearest', inline: 'center' });
            const r = c.getBoundingClientRect();
            if (r.left < -1 || r.right > window.innerWidth + 1) return false;
            const hit = document.elementFromPoint(
              r.left + r.width / 2, r.top + r.height / 2);
            return !!(hit && c.contains(hit));
          }, i);
          if (!reachable) broken.push(i);
        }
        ok(broken.length === 0,
          `battle: all ${handCount} hand cards are reachable and clickable`
          + (broken.length ? ` — card(s) ${broken.join(',')} unreachable` : ''));

        // ⚠️ متنِ بریده در کارتِ فشرده: جعبه کوچک‌تر از محتوا یعنی نام
        //    روی برچسب می‌افتد. این دقیقاً وقتی رخ داد که فونت‌ها را
        //    بالا بردم بدونِ اینکه عرضِ کارت را چک کنم.
        const squeezed = await page.evaluate(() =>
          [...document.querySelectorAll('.duelHandV2 .ggPlayerCard')]
            .filter((el) => {
              const r = el.getBoundingClientRect();
              return el.scrollWidth > Math.ceil(r.width) + 2
                  || el.scrollHeight > Math.ceil(r.height) + 2;
            }).length);
        ok(squeezed === 0,
          `battle: hand cards are wide enough for their content`
          + (squeezed ? ` — ${squeezed} card(s) clipped` : ''));

        // ⚠️ کارتِ بی‌تصویر باید چهرهٔ نقاشی‌شده بگیرد نه اسپینرِ ابدی.
        //    کارت‌های تمرینی در سرور `imageUrl: null` دارند، پس این نما
        //    دقیقاً همان حالتِ بحرانی است.
        const spinners = await page.evaluate(() =>
          document.querySelectorAll('.duelHandV2 .ggCardSpinner').length);
        ok(spinners === 0,
          `battle: no endless spinner on art-less cards${spinners ? ` — ${spinners} found` : ''}`);
      }
    }
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
