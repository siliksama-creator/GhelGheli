#!/usr/bin/env python3
"""ممیزیِ کنتراست بر پایهٔ **پیکسلِ واقعی**، نه حدسِ CSS.

═══════════════════════════════════════════════════════════════════════════
چرا این ابزار لازم شد در حالی که audit_web.py هست
═══════════════════════════════════════════════════════════════════════════

`audit_web.py` کنتراست را از روی CSS حساب می‌کند: رنگِ متن را می‌خواند،
در درختِ والدها بالا می‌رود تا اولین پس‌زمینهٔ مات را پیدا کند، و نسبت
را می‌سنجد. برای پس‌زمینهٔ **یکدست** درست کار می‌کند.

برای گرادیان اساساً نمی‌تواند درست کار کند، و این را با تجربه فهمیدیم:

  • نسخهٔ اول اولین توقفِ رنگ را برمی‌داشت → برای کارتِ «موجودی» که
    گرادیانِ طلایی→سرمه‌ای→زمردی دارد، همیشه «طلایی» را پس‌زمینه فرض
    می‌کرد و «۱.۴۲» گزارش می‌داد. نمونه‌برداری از پیکسلِ واقعی نشان داد
    پشتِ متن در آن لحظه سرمه‌ای بود. عددِ گزارش‌شده از پایه غلط بود.

  • نسخهٔ دوم بدترین توقف را برمی‌دارد. دیگر چیزی را از قلم نمی‌اندازد،
    ولی حالا محافظه‌کار است: رنگی را متهم می‌کند که شاید اصلاً زیرِ آن
    متنِ خاص نباشد.

هیچ‌کدام نمی‌توانند به این سؤال جواب بدهند: «**دقیقاً** چه رنگی زیرِ
این حروف است؟» چون جوابش به موقعیتِ عنصر روی گرادیان بستگی دارد، که
خودش به اندازهٔ صفحه و تعدادِ آیتم‌ها وابسته است.

═══════════════════════════════════════════════════════════════════════════
روشِ این ابزار
═══════════════════════════════════════════════════════════════════════════

۱. مختصاتِ هر متن و رنگش را از DOM می‌گیرد.
۲. رنگِ **همهٔ** متن‌ها را `transparent` می‌کند.
۳. اسکرین‌شات می‌گیرد — حالا پس‌زمینهٔ خالص است، بدون آلودگیِ
   ضدّالیاسینگِ خودِ حروف (که در تلاشِ اول نتیجه را خراب کرده بود:
   لبهٔ سفیدِ حروف به‌عنوان «پس‌زمینهٔ روشن» شمرده می‌شد).
۴. در مستطیلِ هر متن، روشن‌ترین/تیره‌ترین پیکسل را پیدا می‌کند — یعنی
   بدترین حالتِ واقعی برای آن متنِ مشخص.
۵. آلفای رنگِ متن را روی همان پیکسل ترکیب می‌کند و نسبت را می‌سنجد.

خروجی قابل اتکاست چون همان چیزی را می‌سنجد که چشمِ کاربر می‌بیند.

استفاده:
    python3 audit_pixels.py <base-url> <mobile> <password> [tab ...]
"""
import asyncio
import json
import re
import sys

from PIL import Image
from playwright.async_api import async_playwright

# تب‌هایی که در نوارِ پایین‌اند و آن‌هایی که پشتِ شیتِ «بیشتر» پنهان‌اند.
NAV = [('خانه', 'nav'), ('جایزه', 'nav'), ('چت', 'nav'), ('لیگ', 'nav'),
       ('کیف پول', 'sheet'), ('فروشگاه', 'sheet'), ('دعوت', 'sheet'),
       ('پروفایل', 'sheet')]

SHOT = '/tmp/_audit_px.png'


def _lum(c):
    def f(v):
        v /= 255
        return v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2])


def _ratio(a, b):
    la, lb = _lum(a), _lum(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


def _parse(css):
    n = [float(x) for x in re.findall(r'[\d.]+', css)]
    if len(n) < 3:
        return None
    return (n[0], n[1], n[2], n[3] if len(n) > 3 else 1.0)


# مختصات و رنگِ هر متنِ دیده‌شده.
COLLECT = r"""
() => {
  const out = [];
  for (const el of document.querySelectorAll('body *')) {
    const own = [...el.childNodes].filter(n => n.nodeType === 3)
      .map(n => n.textContent.trim()).join(' ').trim();
    if (own.length < 2) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    if (parseFloat(cs.opacity) < 0.25) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) continue;
    if (r.bottom < 0 || r.top > innerHeight) continue;
    out.push({
      txt: own.slice(0, 30), color: cs.color, size: parseFloat(cs.fontSize),
      weight: cs.fontWeight,
      cls: (el.className || '').toString().slice(0, 34),
      x: Math.round(r.left), y: Math.round(r.top),
      w: Math.round(r.width), h: Math.round(r.height),
    });
  }
  return out;
}
"""

# همهٔ متن‌ها نامرئی می‌شوند تا پس‌زمینهٔ خالص بماند.
HIDE = r"""
() => {
  for (const el of document.querySelectorAll('body *')) {
    const has = [...el.childNodes].some(
      n => n.nodeType === 3 && n.textContent.trim().length > 0);
    if (has) el.style.setProperty('color', 'transparent', 'important');
    // سایهٔ متن هم باید برود وگرنه رنگش روی پس‌زمینه می‌ماند.
    el.style.setProperty('text-shadow', 'none', 'important');
  }
}
"""


async def goto(page, label, where):
    if where == 'sheet':
        opened = await page.evaluate(
            """() => { const b=[...document.querySelectorAll('.mobileNav button')]
                 .find(x=>x.innerText.includes('بیشتر'));
                 if(!b) return false; b.click(); return true; }""")
        if not opened:
            return False
        await page.wait_for_timeout(450)
    sel = '.moreSheet button' if where == 'sheet' else '.mobileNav button'
    clicked = await page.evaluate(
        """([s,l]) => { const b=[...document.querySelectorAll(s)]
             .find(x=>x.innerText.trim()===l||x.innerText.trim().endsWith(l));
             if(!b) return false; b.click(); return true; }""", [sel, label])
    if not clicked:
        return False
    await page.wait_for_timeout(1800)
    return True


def analyse(items, scale):
    im = Image.open(SHOT).convert('RGB')
    W, H = im.size
    bad = []
    for it in items:
        fg = _parse(it['color'])
        if not fg or fg[3] < 0.25:
            continue
        x0, y0 = int(it['x'] * scale), int(it['y'] * scale)
        x1, y1 = int((it['x'] + it['w']) * scale), int((it['y'] + it['h']) * scale)
        x0, y0 = max(0, x0), max(0, y0)
        x1, y1 = min(W, x1), min(H, y1)
        if x1 <= x0 or y1 <= y0:
            continue
        px = [im.getpixel((x, y))
              for y in range(y0, y1, max(1, (y1 - y0) // 12))
              for x in range(x0, x1, max(1, (x1 - x0) // 24))]
        if not px:
            continue
        # بدترین پس‌زمینه = آنکه کمترین کنتراست را با این متن می‌دهد.
        worst, worst_r = None, 99.0
        for cand in px:
            mixed = tuple(fg[i] * fg[3] + cand[i] * (1 - fg[3]) for i in range(3))
            r = _ratio(mixed, cand)
            if r < worst_r:
                worst, worst_r = cand, r
        bold = it['weight'].isdigit() and int(it['weight']) >= 700
        need = 3.0 if (it['size'] >= 24 or (it['size'] >= 18.66 and bold)) else 4.5
        if worst_r < need:
            bad.append({'txt': it['txt'], 'cls': it['cls'], 'size': it['size'],
                        'need': need, 'ratio': round(worst_r, 2),
                        'fg': it['color'], 'bg': f'rgb{worst}'})
    # یکتاسازی تا یک قانونِ CSS ده بار گزارش نشود.
    seen, uniq = set(), []
    for b in bad:
        k = (b['cls'], b['fg'], b['bg'])
        if k in seen:
            continue
        seen.add(k)
        uniq.append(b)
    return uniq


async def run(base, mobile, password, only):
    scale = 2
    findings = {}
    async with async_playwright() as p:
        br = await p.chromium.launch(args=['--no-sandbox'])
        ctx = await br.new_context(viewport={'width': 412, 'height': 900},
                                   device_scale_factor=scale, locale='fa-IR')
        page = await ctx.new_page()
        await page.goto(base, wait_until='networkidle')
        await page.fill('input', mobile)
        await page.fill('input[type="password"], input[placeholder*="رمز"]', password)
        await page.click('button.main')
        await page.wait_for_timeout(3500)

        for theme in ('dark', 'light'):
            if theme == 'light':
                await page.evaluate(
                    "() => document.documentElement.setAttribute('data-theme','light')")
                await page.wait_for_timeout(400)
            for label, where in NAV:
                if only and label not in only:
                    continue
                if not await goto(page, label, where):
                    print(f'  ⚠ {label} باز نشد')
                    continue
                items = await page.evaluate(COLLECT)
                await page.evaluate(HIDE)
                await page.wait_for_timeout(250)
                await page.screenshot(path=SHOT)
                bad = analyse(items, scale)
                if bad:
                    findings[f'{label}/{theme}'] = bad
                print(f'  {label:10s} {theme:5s} — {len(items):3d} متن، '
                      f'{len(bad)} مشکل')
                # حالتِ نامرئی باید برگردد وگرنه صفحهٔ بعد هم خراب می‌ماند.
                await page.reload(wait_until='networkidle')
                await page.wait_for_timeout(1800)
                if theme == 'light':
                    await page.evaluate(
                        "() => document.documentElement.setAttribute('data-theme','light')")
                    await page.wait_for_timeout(300)
        await br.close()
    return findings


def main():
    base, mobile, pw = sys.argv[1], sys.argv[2], sys.argv[3]
    only = sys.argv[4:]
    res = asyncio.run(run(base, mobile, pw, only))
    print()
    total = sum(len(v) for v in res.values())
    if not total:
        print('✓ هیچ متنی زیرِ حدِ WCAG نیست (سنجشِ پیکسلِ واقعی)')
        return 0
    print(f'✗ {total} موردِ کنتراست در {len(res)} صفحه:\n')
    for k, v in res.items():
        print(f'── {k}')
        for b in sorted(v, key=lambda z: z['ratio']):
            print(f'   {b["ratio"]:5.2f} (نیاز {b["need"]}) '
                  f'{b["txt"][:28]:30s} cls={b["cls"]!r} {b["fg"]} روی {b["bg"]}')
    return 1


if __name__ == '__main__':
    sys.exit(main())
