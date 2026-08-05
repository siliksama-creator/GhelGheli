#!/usr/bin/env python3
"""
ممیزیِ سختگیرانهٔ پنل مدیریت — همان سنجشِ زندهٔ کنتراست که در وب‌اپ
ده باگ پیدا کرد، این بار روی پنل.

`audit_admin.py` قبلی فقط خطاهای JS و صفحهٔ سفید را می‌دید. این نسخه
`getComputedStyle` را روی هر عنصرِ متن‌دار اجرا می‌کند، پس متنی که
رندر می‌شود ولی خوانده نمی‌شود هم گرفته می‌شود.
"""
import asyncio, json, sys
from pathlib import Path
from playwright.async_api import async_playwright

OUT = Path('/home/user/shots2')
OUT.mkdir(exist_ok=True)
IGNORE = ('favicon', 'manifest', 'sw.js', 'React DevTools', 'ERR_ABORTED')


def noisy(t):
    return any(k.lower() in t.lower() for k in IGNORE)


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


async def main():
    base, user, pw = sys.argv[1], sys.argv[2], sys.argv[3]
    results = []
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox'])
        ctx = await b.new_context(viewport={'width': 1366, 'height': 900},
                                  locale='fa-IR')
        page = await ctx.new_page()
        col = Collector(page)

        await page.goto(base, wait_until='networkidle', timeout=40000)
        ins = page.locator('input')
        await ins.nth(0).fill(user)
        await ins.nth(1).fill(pw)
        await page.locator('button').first.click()
        await page.wait_for_timeout(4500)
        col.take()

        # ناوبریِ پنل با state است نه href؛ «خروج» حذف می‌شود وگرنه
        # بقیهٔ بازدیدها روی صفحهٔ ورود انجام می‌شوند.
        links = await page.evaluate(
            """()=>[...document.querySelectorAll('aside button, nav button')]
                 .map(b=>b.innerText.trim())
                 .filter(t=>t && t.length<24 && !/خروج|logout/i.test(t))""")
        print(f'{len(links)} صفحه: {links}', file=sys.stderr)
        if not links:
            print('!! ورود ناموفق', file=sys.stderr)
            await b.close()
            return

        for theme in ('dark', 'light'):
            await page.evaluate(
                "t=>document.documentElement.setAttribute('data-theme',t)", theme)
            for label in links:
                ok = await page.evaluate(
                    """(l)=>{const b=[...document.querySelectorAll('button')]
                        .find(x=>x.innerText.trim()===l);
                        if(!b) return false; b.click(); return true;}""", label)
                await page.wait_for_timeout(1900)
                await page.evaluate(
                    "t=>document.documentElement.setAttribute('data-theme',t)", theme)
                await page.wait_for_timeout(400)

                txt = await page.evaluate(
                    "()=>(document.body.innerText||'').trim().length")
                contrast = await page.evaluate(CONTRAST_JS)
                overflow = await page.evaluate(OVERFLOW_JS)
                errs, failed = col.take()
                if not ok:
                    errs.append(f'[ناوبری] دکمهٔ «{label}» پیدا نشد')
                try:
                    await page.screenshot(
                        path=str(OUT / f'adm-{label.replace(" ", "_")[:18]}-{theme}.png'))
                except Exception:
                    pass
                results.append({'page': label, 'theme': theme, 'len': txt,
                                'err': errs, 'failed': failed,
                                'contrast': contrast[:10], 'overflow': overflow})
        await b.close()

    bad = [r for r in results if r['err'] or r['failed'] or r['contrast']
           or r['overflow'] or r['len'] < 60]
    print(json.dumps(bad, ensure_ascii=False, indent=1))
    print(f'\n── {len(bad)} مشکل از {len(results)} بازدید ──')


if __name__ == '__main__':
    asyncio.run(main())

