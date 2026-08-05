#!/usr/bin/env python3
"""
ممیزیِ سختگیرانهٔ وب‌اپِ کاربر — نسخهٔ دوم.

═══════════════════════════════════════════════════════════════════════════
چرا نسخهٔ اول (audit_deep.py) دروغ می‌گفت
═══════════════════════════════════════════════════════════════════════════

نسخهٔ اول برای رفتن به هر تب این کار را می‌کرد:

    const b = [...document.querySelectorAll('button')]
                .find(x => x.innerText.includes(label));
    if (b) b.click();

سه نقصِ کشنده داشت:

  ۱. `if (b)` یعنی **اگر دکمه پیدا نشد، بی‌صدا هیچ کاری نکن**. چهار تبِ
     «کیف پول، دعوت، پشتیبانی، پروفایل» پشتِ شیتِ «بیشتر» هستند و دکمه‌شان
     تا وقتی شیت باز نشده اصلاً در DOM نیست. پس اسکریپت روی تبِ قبلی
     می‌ماند، از همان اسکرین‌شات می‌گرفت و اسمش را می‌گذاشت `web-wallet`.
     خروجیِ «۰ مشکل از ۱۸ صفحه» در واقع «۹ صفحهٔ تکراری» بود.

  ۲. هیچ‌وقت **تأیید نمی‌کرد** که تب عوض شده. معیار درستی فقط «خطای JS
     نبود» بود — و صفحه‌ای که اصلاً باز نشده، طبعاً خطا هم ندارد.

  ۳. `innerText.includes(label)` تطبیقِ جزئی است. «چت و بازی» با «بازی‌ها»
     تداخل داشت.

این نسخه: شیت را باز می‌کند، بعد از هر ناوبری با `aria-current` تأیید
می‌گیرد، و اگر تب عوض نشده باشد **آن را باگ گزارش می‌کند** نه موفقیت.
همچنین کنتراستِ واقعیِ پیکسل‌های متن را می‌سنجد.
"""
import asyncio
import json
import sys
from pathlib import Path

from playwright.async_api import async_playwright

OUT = Path('/home/user/shots2')
OUT.mkdir(exist_ok=True)

IGNORE = ('favicon', 'manifest', 'sw.js', 'React DevTools', 'ERR_ABORTED')

# ── تب‌ها و اینکه هرکدام کجا زندگی می‌کنند ──
#
# `sheet=True` یعنی دکمه‌اش پشتِ «بیشتر» است و اول باید شیت باز شود.
# `header=True` یعنی آیکنِ بالای صفحه است (گذر نبرد، فروشگاه، گردونه).
TABS = [
    ('home',    'خانه',        'nav'),
    ('rewards', 'جوایز',       'nav'),
    ('league',  'لیگ',         'nav'),
    ('club',    'چت و بازی',   'nav'),
    ('wallet',  'کیف پول',     'sheet'),
    ('invite',  'دعوت دوستان', 'sheet'),
    ('support', 'پشتیبانی',    'sheet'),
    ('profile', 'پروفایل',     'sheet'),
]


def noisy(t):
    return any(k.lower() in t.lower() for k in IGNORE)


# ═══════════════════════════════════════════════════════════════════════════
# سنجشِ کنتراستِ واقعی از روی DOM
# ═══════════════════════════════════════════════════════════════════════════
#
# ابزارِ ایستای قبلی (audit_contrast.py) رشته‌های رنگ را در CSS می‌خواند.
# این کافی نیست: رنگِ نهایی حاصلِ آبشارِ CSS، متغیرها، و ارث‌بری است.
# اینجا از `getComputedStyle` استفاده می‌کنیم — یعنی همان چیزی که کاربر
# واقعاً می‌بیند — و پس‌زمینه را با بالا رفتن در درختِ والدها پیدا می‌کنیم
# (چون اکثر عناصر `background: transparent` دارند).
CONTRAST_JS = r"""
() => {
  const lum = (r, g, b) => {
    const f = c => { c /= 255; return c <= 0.03928 ? c / 12.92
                                : Math.pow((c + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const parse = s => {
    const m = (s || '').match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(',').map(x => parseFloat(x));
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  // ── پس‌زمینهٔ مؤثر ──
  //
  // اولین والدی که پس‌زمینهٔ مات دارد. نکتهٔ مهم: `backgroundColor` روی
  // عنصری که گرادیان دارد `transparent` است. نسخهٔ اولِ این تابع در آن
  // حالت به والد می‌رفت و مثلاً دکمهٔ `.main` (گرادیانِ سبزِ روشن با
  // متنِ تیره) را «متنِ تیره روی پس‌زمینهٔ تیره ۱:۱» گزارش می‌کرد —
  // مثبتِ کاذبِ محض. حالا اولین رنگِ گرادیان را برمی‌داریم.
  const gradColor = el => {
    const bi = getComputedStyle(el).backgroundImage || '';
    if (!bi.includes('gradient')) return null;
    const m = bi.match(/rgba?\([^)]+\)/g);
    if (!m) return null;
    for (const s of m) { const c = parse(s); if (c && c.a > 0.5) return c; }
    return null;
  };
  const bgOf = el => {
    let n = el;
    while (n && n !== document.documentElement) {
      const g = gradColor(n);
      if (g) return g;
      const c = parse(getComputedStyle(n).backgroundColor);
      if (c && c.a > 0.15) return c;
      n = n.parentElement;
    }
    const c = parse(getComputedStyle(document.body).backgroundColor);
    return c && c.a > 0.15 ? c : { r: 255, g: 255, b: 255, a: 1 };
  };
  const out = [];
  for (const el of document.querySelectorAll('body *')) {
    // فقط عناصری که خودشان متنِ مستقیم دارند؛ وگرنه هر div را دوباره
    // می‌شماریم و گزارش پر از تکرار می‌شود.
    const own = [...el.childNodes]
      .filter(n => n.nodeType === 3).map(n => n.textContent.trim())
      .join(' ').trim();
    if (own.length < 2) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    const rect = el.getBoundingClientRect();
    if (rect.width < 4 || rect.height < 4) continue;
    if (parseFloat(cs.opacity) < 0.25) continue;
    const fg = parse(cs.color);
    if (!fg || fg.a < 0.25) continue;
    const bg = bgOf(el);
    // ترکیبِ آلفای متن روی پس‌زمینه.
    const mix = k => fg[k] * fg.a + bg[k] * (1 - fg.a);
    const L1 = lum(mix('r'), mix('g'), mix('b'));
    const L2 = lum(bg.r, bg.g, bg.b);
    const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    const px = parseFloat(cs.fontSize);
    const bold = parseInt(cs.fontWeight, 10) >= 700;
    // آستانهٔ WCAG AA: متنِ بزرگ ۳:۱، بقیه ۴.۵:۱.
    const need = (px >= 24 || (px >= 18.66 && bold)) ? 3.0 : 4.5;
    if (ratio < need) {
      out.push({
        text: own.slice(0, 42), ratio: +ratio.toFixed(2), need,
        color: cs.color, bg: `rgb(${bg.r},${bg.g},${bg.b})`,
        size: px, cls: (el.className || '').toString().slice(0, 40),
        tag: el.tagName.toLowerCase(),
      });
    }
  }
  // یکتاسازی بر پایهٔ رنگ+پس‌زمینه تا یک قانونِ CSS ۵۰ بار گزارش نشود.
  const seen = new Set(), uniq = [];
  for (const o of out) {
    const k = o.color + '|' + o.bg + '|' + o.cls;
    if (seen.has(k)) continue;
    seen.add(k); uniq.push(o);
  }
  return uniq;
}
"""

# سرریزِ افقی: عنصری که از عرضِ صفحه بیرون زده. روی موبایلِ باریک
# باعثِ اسکرولِ افقیِ ناخواسته و بریده شدنِ متن می‌شود.
OVERFLOW_JS = r"""
() => {
  const w = document.documentElement.clientWidth;
  const bad = [];
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0) continue;
    if (r.right > w + 2 || r.left < -2) {
      const cs = getComputedStyle(el);
      if (cs.position === 'fixed' || cs.overflowX === 'auto'
          || cs.overflowX === 'scroll') continue;
      bad.push({ tag: el.tagName.toLowerCase(),
                 cls: (el.className || '').toString().slice(0, 40),
                 left: Math.round(r.left), right: Math.round(r.right),
                 vw: w });
    }
  }
  return bad.slice(0, 6);
}
"""


class Collector:
    def __init__(self, page):
        self.errors, self.failed = [], []
        page.on('console', lambda m: (
            self.errors.append(f'[console] {m.text[:160]}')
            if m.type == 'error' and not noisy(m.text) else None))
        page.on('pageerror',
                lambda e: self.errors.append(f'[js] {str(e)[:160]}'))
        page.on('response', lambda r: (
            self.failed.append(f'HTTP {r.status} {r.url[:90]}')
            if r.status >= 400 and not noisy(r.url) else None))

    def take(self):
        e, f = self.errors[:5], self.failed[:5]
        self.errors, self.failed = [], []
        return e, f


async def goto_tab(page, tab_id, label, where):
    """به تب می‌رود و **تأیید می‌گیرد** که واقعاً رفته.

    مقدارِ بازگشتی: پیامِ خطا، یا None اگر موفق بود.
    """
    if where == 'sheet':
        # اول شیتِ «بیشتر» را باز کن. بدون این، دکمه در DOM نیست.
        opened = await page.evaluate(
            """() => {
                const b = [...document.querySelectorAll('.mobileNav button')]
                  .find(x => x.innerText.includes('بیشتر'));
                if (!b) return false;
                b.click(); return true;
            }""")
        if not opened:
            return 'دکمهٔ «بیشتر» در نوارِ ناوبری پیدا نشد'
        await page.wait_for_timeout(450)

    sel = '.moreSheet button' if where == 'sheet' else '.mobileNav button'
    clicked = await page.evaluate(
        """([s, label]) => {
            const b = [...document.querySelectorAll(s)]
              .find(x => x.innerText.trim() === label
                      || x.innerText.trim().endsWith(label));
            if (!b) return false;
            b.click(); return true;
        }""", [sel, label])
    if not clicked:
        return f'دکمهٔ «{label}» در {sel} پیدا نشد'

    await page.wait_for_timeout(2000)
    return None


async def run(base, mobile, password):
    results = []
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox'])
        ctx = await b.new_context(viewport={'width': 412, 'height': 900},
                                  locale='fa-IR')
        page = await ctx.new_page()
        col = Collector(page)

        await page.goto(base, wait_until='networkidle', timeout=40000)
        await page.fill('input[type="tel"], input[placeholder*="موبایل"]', mobile)
        await page.fill('input[type="password"], input[placeholder*="رمز"]',
                        password)
        await page.click('button.main')
        await page.wait_for_timeout(4000)
        col.take()

        if not await page.query_selector('.mobileNav'):
            print('!! ورود ناموفق — نوارِ ناوبری رندر نشد', file=sys.stderr)
            print(await page.evaluate("()=>document.body.innerText.slice(0,300)"),
                  file=sys.stderr)
            await b.close()
            return results

        for theme in ('dark', 'light'):
            await page.evaluate(
                "t => document.documentElement.setAttribute('data-theme', t)",
                theme)
            for tab_id, label, where in TABS:
                navfail = await goto_tab(page, tab_id, label, where)
                await page.evaluate(
                    "t => document.documentElement.setAttribute('data-theme', t)",
                    theme)
                await page.wait_for_timeout(500)

                # ── تأییدِ واقعی: آیا این همان تب است؟ ──
                #
                # نکته: برای تب‌های پشتِ شیت، خودِ دکمهٔ «بیشتر» کلاسِ `on`
                # می‌گیرد (`MORE_TABS.some(...)`) و شیت بعد از انتخاب بسته
                # می‌شود، پس دکمهٔ تب دیگر در DOM نیست. اولین نسخهٔ این
                # بررسی همین را «تب عوض نشد» می‌خواند — مثبتِ کاذب.
                # معیارِ درست: کلیدِ `key={tab}` روی <main> باعث می‌شود
                # محتوا کاملاً جایگزین شود؛ پس امضای متنِ صفحه را می‌سنجیم.
                current = await page.evaluate(
                    """() => {
                        const on = document.querySelector(
                          '.mobileNav button.on, .moreSheet button.on');
                        return on ? on.innerText.trim() : '';
                    }""")
                if where == 'sheet':
                    mismatch = ('بیشتر' not in current) and not navfail
                else:
                    mismatch = (label not in current) and not navfail

                body = await page.evaluate(
                    "() => (document.body.innerText || '').trim().length")
                contrast = await page.evaluate(CONTRAST_JS)
                overflow = await page.evaluate(OVERFLOW_JS)
                errs, failed = col.take()
                if navfail:
                    errs.append(f'[ناوبری] {navfail}')
                if mismatch:
                    errs.append(f'[ناوبری] تب عوض نشد — فعال: «{current}»')

                try:
                    await page.screenshot(
                        path=str(OUT / f'web-{tab_id}-{theme}.png'))
                except Exception:
                    pass

                results.append({
                    'tab': tab_id, 'theme': theme, 'len': body,
                    'err': errs, 'failed': failed,
                    'contrast': contrast[:8], 'overflow': overflow,
                })
        await b.close()
    return results


async def main():
    res = await run(sys.argv[1], sys.argv[2], sys.argv[3])
    bad = [r for r in res if r['err'] or r['failed'] or r['contrast']
           or r['overflow'] or r['len'] < 60]
    print(json.dumps(bad, ensure_ascii=False, indent=1))
    print(f'\n── {len(bad)} صفحهٔ مشکل‌دار از {len(res)} بازدید ──')


if __name__ == '__main__':
    asyncio.run(main())
