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
# ⚠️ این برچسب‌ها باید **مو‌به‌مو** با NAV_TABS/MORE_TABS در
# userweb/src/main.jsx یکی باشند. نسخهٔ اول از حافظه نوشته شده بود
# («جایزه» به‌جای «جوایز»، «چت» به‌جای «چت و بازی»، «فروشگاه» که اصلاً
# در منو نیست) و نتیجه‌اش این بود که چهار تب هرگز باز نمی‌شدند.
#
# ابزار هشدارِ «باز نشد» می‌داد ولی با خروجیِ موفق تمام می‌شد — یعنی
# «۰ مشکل» گزارش می‌کرد در حالی که نصفِ اپ اصلاً بررسی نشده بود.
# دقیقاً همان دروغِ سبزی که audit_deep.py هم به آن دچار بود.
NAV = [('خانه', 'nav'), ('جوایز', 'nav'), ('لیگ', 'nav'), ('چت و بازی', 'nav'),
       ('کیف پول', 'sheet'), ('دعوت دوستان', 'sheet'), ('پشتیبانی', 'sheet'),
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
  let i = 0;
  // ── چرا فقط emoji رد می‌شود ──
  // emoji یک glyph رنگی است و رنگش از `color` نمی‌آید. وقتی متن را
  // `transparent` می‌کنیم، emoji همچنان رسم می‌شود — پس پیکسل‌های
  // خودش به‌عنوان «پس‌زمینه» شمرده می‌شدند و ابزار برای 🔔 و 🏅 و 🎡
  // مرتب هشدارِ دروغین می‌داد. قاعدهٔ کنتراستِ WCAG هم اصلاً دربارهٔ
  // تصویر/emoji نیست.
  const onlyEmoji = t => !/[\p{L}\p{N}]/u.test(t);
  for (const el of document.querySelectorAll('body *')) {
    const own = [...el.childNodes].filter(n => n.nodeType === 3)
      .map(n => n.textContent.trim()).join(' ').trim();
    if (own.length < 2) continue;
    if (onlyEmoji(own)) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    if (parseFloat(cs.opacity) < 0.25) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) continue;
    if (r.bottom < 0 || r.top > innerHeight) continue;
    // ── چرا عناصرِ پشتِ نوارهای شناور رد می‌شوند ──
    //
    // نوارِ ناوبریِ پایین `position: fixed` است و روی محتوا می‌نشیند.
    // متنی که دقیقاً پشتِ آن افتاده در اسکرین‌شات **دیده نمی‌شود** —
    // پیکسل‌هایی که می‌خوانیم مالِ خودِ نوار است، نه آن متن.
    //
    // نتیجه‌اش یک هشدارِ دروغینِ کاملاً قانع‌کننده بود: دکمهٔ
    // «تازه‌ترین» با نسبتِ ۱.۱۷ گزارش شد، در حالی که خودش پس‌زمینهٔ
    // سبزِ برند با متنِ تیره دارد (نسبتِ واقعی ~۱۲:۱). وقت گرفت تا
    // معلوم شود ابزار رنگِ نوار را خوانده نه رنگِ دکمه.
    //
    // ⚠️ این «پنهان کردنِ مشکل» نیست: کاربر آن متن را در این حالت
    //    اصلاً نمی‌بیند، پس کنتراستش بی‌معنی است. اگر متن **همیشه**
    //    زیر نوار بماند، مسئلهٔ چیدمان است نه کنتراست — و ابزارِ
    //    `audit_overlap.py` دقیقاً برای همان ساخته شده.
    let covered = false;
    for (const f of document.querySelectorAll('*')) {
      const fs = getComputedStyle(f);
      if (fs.position !== 'fixed' && fs.position !== 'sticky') continue;
      if (f.contains(el) || el.contains(f)) continue;
      if (fs.visibility === 'hidden' || fs.display === 'none') continue;
      const fr = f.getBoundingClientRect();
      if (fr.width < 8 || fr.height < 8) continue;
      // همپوشانیِ عمودیِ معنادار: بیش از نیمِ ارتفاعِ متن پوشیده است.
      const ov = Math.min(r.bottom, fr.bottom) - Math.max(r.top, fr.top);
      const ox = Math.min(r.right, fr.right) - Math.max(r.left, fr.left);
      if (ov > r.height * 0.5 && ox > r.width * 0.5) { covered = true; break; }
    }
    if (covered) continue;
    // شناسه می‌گذاریم تا **بعد از** پنهان کردنِ متن دوباره مختصات را
    // بخوانیم. اگر مختصاتِ قبلی را نگه داریم و در این فاصله چیزی جابه‌جا
    // شود (بارگذاریِ ناهمگامِ تراکنش‌ها، انیمیشن، تصویری که می‌رسد)،
    // مستطیل با اسکرین‌شات همخوان نیست و ابزار رنگِ جای دیگری را
    // گزارش می‌کند. این دقیقاً همان چیزی بود که دکمهٔ «درخواست برداشت»
    // را «۱.۴۴ روی سرمه‌ای» نشان می‌داد در حالی که سبزِ روشن است.
    el.setAttribute('data-px-audit', String(i));
    out.push({
      id: i++, txt: own.slice(0, 30), color: cs.color,
      size: parseFloat(cs.fontSize), weight: cs.fontWeight,
      cls: (el.className || '').toString().slice(0, 34),
    });
  }
  return out;
}
"""

# مختصات دوباره خوانده می‌شوند، درست پیش از اسکرین‌شات.
#
# ⚠️ مستطیلِ **خودِ حروف** با Range API گرفته می‌شود، نه
# getBoundingClientRect عنصر. چرا این تفاوت حیاتی است:
#
# دکمهٔ «ثبت کد» گرادیانِ سبزِ روشن دارد با border-radius: 16px و
# padding. مستطیلِ عنصر شاملِ آن گوشه‌های گرد است، و پشتِ گوشه‌ها
# پس‌زمینهٔ تیرهٔ صفحه دیده می‌شود. ابزار روشن‌ترین/بدترین پیکسل را
# می‌گرفت و به گوشه می‌رسید → «متنِ تیره روی سرمه‌ای ۱.۳۸» گزارش
# می‌کرد، در حالی که حروف روی سبزِ روشن نشسته‌اند و کاملاً خوانا هستند.
#
# برشِ اسکرین‌شات این را قطعی ثابت کرد: تصویر دکمه سبزِ روشن بود ولی
# پیکسلِ گوشه (23,46,67) سرمه‌ای.
#
# `Range.getClientRects()` دقیقاً کادرِ خطوطِ متن را می‌دهد — بدون
# padding، بدون گوشهٔ گرد، بدون حاشیه.
RECTS = r"""
() => {
  const out = {};
  for (const el of document.querySelectorAll('[data-px-audit]')) {
    const id = el.getAttribute('data-px-audit');
    const boxes = [];
    for (const n of el.childNodes) {
      if (n.nodeType !== 3 || !n.textContent.trim()) continue;
      const rg = document.createRange();
      rg.selectNodeContents(n);
      for (const r of rg.getClientRects()) {
        if (r.width > 1 && r.height > 1) {
          boxes.push({ x: r.left, y: r.top, w: r.width, h: r.height });
        }
      }
    }
    if (boxes.length) out[id] = boxes;
  }
  return out;
}
"""

# همهٔ متن‌ها نامرئی می‌شوند تا پس‌زمینهٔ خالص بماند.
#
# ═══════════════════════════════════════════════════════════════════════════
# ⚠️ باگی که این تابع داشت و سه «یافتهٔ» کاذب تولید می‌کرد
# ═══════════════════════════════════════════════════════════════════════════
#
# نسخهٔ قبلی فقط `color: transparent` می‌گذاشت. برای متنِ عادی کافی است،
# ولی نامِ کاربر با افکتِ گرادیان این‌طور رنگ می‌گیرد:
#
#     background: linear-gradient(...);
#     -webkit-background-clip: text;
#     -webkit-text-fill-color: transparent;   ← این بر color اولویت دارد
#
# `-webkit-text-fill-color` هر مقداری در `color` را **نادیده می‌گیرد**.
# پس حروف بعد از «پنهان‌سازی» همچنان با گرادیانِ خودشان رسم می‌شدند و
# ابزار **خودِ حروف** را به‌عنوان پس‌زمینه نمونه‌برداری می‌کرد.
#
# نتیجه: سه گزارشِ «نامِ کاربر ۲.۶۳ روی پس‌زمینهٔ صورتی». آن صورتی
# پس‌زمینه نبود — خودِ حروف بود. با یک صفحهٔ آزمایشیِ کنترل‌شده اثبات شد:
# بعد از HIDE، پیکسل‌های ناحیهٔ متن هنوز rgb(245,115,141) بودند.
#
# این دقیقاً همان دسته اشتباهی است که در مستنداتِ خودِ ابزار هشدارش
# داده شده («background-clip:text را دو بار اشتباه خواند») ولی این مسیرِ
# خاص پوشش داده نشده بود.
#
# رفع: هم `-webkit-text-fill-color` صفر می‌شود، هم گرادیانِ متنی حذف
# می‌شود تا هیچ ردی از حروف روی اسکرین‌شات نماند.
HIDE = r"""
() => {
  for (const el of document.querySelectorAll('body *')) {
    const has = [...el.childNodes].some(
      n => n.nodeType === 3 && n.textContent.trim().length > 0);
    if (has) {
      el.style.setProperty('color', 'transparent', 'important');
      // ⚠️ بدونِ این خط، نام‌های گرادیانی پاک نمی‌شوند (توضیح بالا).
      el.style.setProperty('-webkit-text-fill-color', 'transparent', 'important');
      // اگر پس‌زمینه به متن clip شده، خودِ پس‌زمینه هم باید برود وگرنه
      // مرورگر همچنان شکلِ حروف را رنگ می‌کند.
      const cs = getComputedStyle(el);
      if (cs.webkitBackgroundClip === 'text' || cs.backgroundClip === 'text') {
        el.style.setProperty('background', 'none', 'important');
      }
    }
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


def analyse(items, rects, scale):
    """کنتراستِ هر متن بر پایهٔ پیکسل‌های واقعیِ زیرِ خودِ حروف."""
    im = Image.open(SHOT).convert('RGB')
    W, H = im.size
    bad = []
    for it in items:
        fg = _parse(it['color'])
        if not fg or fg[3] < 0.25:
            continue
        boxes = rects.get(str(it['id']))
        if not boxes:
            continue

        px = []
        for bx in boxes:
            x0, y0 = int(bx['x'] * scale), int(bx['y'] * scale)
            x1, y1 = int((bx['x'] + bx['w']) * scale), int((bx['y'] + bx['h']) * scale)
            x0, y0 = max(0, x0), max(0, y0)
            x1, y1 = min(W, x1), min(H, y1)
            if x1 - x0 < 2 or y1 - y0 < 2:
                continue
            # ── چرا ۲۵٪ میانیِ ارتفاع ──
            # بالا و پایینِ کادرِ خط «leading» است: فضای خالی که ممکن
            # است روی عنصرِ دیگری بیفتد. میانه جایی است که خودِ حروف
            # واقعاً رسم می‌شوند.
            pad = max(1, (y1 - y0) // 4)
            for y in range(y0 + pad, y1 - pad, max(1, (y1 - y0 - 2 * pad) // 6)):
                for x in range(x0, x1, max(1, (x1 - x0) // 30)):
                    px.append(im.getpixel((x, y)))
        if not px:
            continue

        # ── چرا صدکِ ۹۰ و نه بدترین تکْ‌پیکسل ──
        # یک پیکسلِ پرت (لبهٔ آیکنی که کنارِ متن است، یا ضدّالیاسِ
        # حاشیه) نباید کلِ قضاوت را عوض کند. صدکِ ۹۰ از هر دو سمت
        # یعنی «پس‌زمینهٔ غالب در بدترین حالتش».
        px.sort(key=_lum)
        cands = {px[max(0, int(len(px) * 0.10))], px[min(len(px) - 1, int(len(px) * 0.90))]}

        worst, worst_r = None, 99.0
        for cand in cands:
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

        async def login():
            await page.goto(base, wait_until='networkidle')
            await page.fill('input', mobile)
            await page.fill('input[type="password"], input[placeholder*="رمز"]',
                            password)
            await page.click('form button[type="submit"], button.main')
            await page.wait_for_timeout(3500)

        await login()

        # تمِ روشن حذف شد؛ فقط یک تم می‌ماند. حلقه نگه داشته شد تا اگر
        # روزی تمِ دیگری اضافه شود، فقط همین رشته عوض شود.
        for theme in ('dark',):
            for label, where in NAV:
                if only and label not in only:
                    continue
                # ── چرا هر صفحه از نو بارگذاری می‌شود ──
                # `HIDE` رنگ‌ها را با `!important` دستکاری می‌کند و راهِ
                # برگشتی ندارد. اگر صفحهٔ بعد را روی همان DOM بسنجیم،
                # همهٔ متن‌ها هنوز نامرئی‌اند و ابزار «پس‌زمینه روی
                # پس‌زمینه» می‌سنجد — یعنی خروجیِ کاملاً بی‌معنی.
                await page.reload(wait_until='networkidle')
                await page.wait_for_timeout(2200)
                if not await goto(page, label, where):
                    # ── چرا این خطاست و نه هشدار ──
                    # تبی که باز نمی‌شود یعنی آن صفحه **اصلاً بررسی
                    # نشده**. اگر فقط هشدار بدهیم، ابزار با «۰ مشکل»
                    # تمام می‌شود و آدم خیال می‌کند همه‌چیز سالم است.
                    # این بدترین حالتِ ممکن برای یک ابزارِ ممیزی است.
                    findings[f'{label}/{theme}'] = [{
                        'txt': '— صفحه باز نشد —', 'cls': '(ناوبری)',
                        'size': 0, 'need': 0, 'ratio': 0,
                        'fg': '-', 'bg': 'برچسبِ تب با main.jsx نمی‌خواند؟'}]
                    print(f'  ✗ {label}/{theme} باز نشد')
                    continue
                items = await page.evaluate(COLLECT)
                await page.evaluate(HIDE)
                await page.wait_for_timeout(700)
                rects = await page.evaluate(RECTS)
                await page.screenshot(path=SHOT)
                bad = analyse(items, rects, scale)
                if bad:
                    findings[f'{label}/{theme}'] = bad
                print(f'  {label:10s} {theme:5s} — {len(items):3d} متن، '
                      f'{len(bad)} مشکل')
        await br.close()
    return findings


def main():
    if len(sys.argv) < 4:
        print(__doc__)
        return 2
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
                  f'{b["txt"][:28]:30s} cls={b["cls"]!r} '
                  f'{b["fg"]} روی {b["bg"]}')
    return 1


if __name__ == '__main__':
    sys.exit(main())
