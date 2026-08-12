#!/usr/bin/env python3
"""آیا چیزی زیرِ نوارِ ناوبریِ ثابت گم می‌شود؟

═══════════════════════════════════════════════════════════════════════════
چرا این ابزار
═══════════════════════════════════════════════════════════════════════════

نوارِ ناوبری `position:fixed` است و ۷۰ پیکسلِ پایینِ صفحه را می‌پوشاند.
هر صفحه باید به‌اندازهٔ کافی padding پایین داشته باشد وگرنه آخرین
عنصرش زیرِ نوار می‌رود — و چون نوار نیمه‌شفاف است، کاربر چیزی می‌بیند
که نه کاملاً پیداست نه کاملاً پنهان.

═══════════════════════════════════════════════════════════════════════════
تلهٔ اصلی: کانتینرهای اسکرول‌دار
═══════════════════════════════════════════════════════════════════════════

نسخهٔ اول هر عنصری را که مستطیلش با مستطیلِ نوار تلاقی داشت گزارش
می‌کرد. برای `.chatbox` — که خودش `overflow-y:auto` است و ارتفاعِ ثابت
دارد — این کاملاً غلط بود: پیام‌هایی که پایین‌ترِ ناحیهٔ دیدِ خودِ
`.chatbox` هستند مختصاتشان بیرونِ کادر می‌افتد، ولی مرورگر آن‌ها را
**نمی‌کشد**. ابزار سه بار پشت سر هم «همپوشانی» گزارش کرد در حالی که
`.chatbox` در ۶۴۲ تمام می‌شد و نوار از ۸۳۰ شروع.

پس هر عنصر اول باید بررسی شود که داخلِ همهٔ کانتینرهای اسکرولِ والدش
واقعاً **دیده** می‌شود یا نه.
"""
import asyncio
import sys

from playwright.async_api import async_playwright

NAV = [('خانه', 'nav'), ('جوایز', 'nav'), ('لیگ', 'nav'), ('چت و بازی', 'nav'),
       ('کیف پول', 'sheet'), ('دعوت دوستان', 'sheet'),
       ('پشتیبانی', 'sheet'), ('پروفایل', 'sheet')]

JS = r"""
async () => {
  window.scrollTo(0, document.body.scrollHeight);
  await new Promise(r => setTimeout(r, 600));
  const navEl = document.querySelector('.mobileNav');
  if (!navEl) return { error: 'نوار ناوبری پیدا نشد' };
  const nav = navEl.getBoundingClientRect();

  // آیا این عنصر درونِ همهٔ والدهای اسکرول‌دارش واقعاً دیده می‌شود؟
  const trulyVisible = (el) => {
    let r = el.getBoundingClientRect();
    let p = el.parentElement;
    while (p && p !== document.body) {
      const cs = getComputedStyle(p);
      const scrolls = /(auto|scroll|hidden)/.test(cs.overflowY + cs.overflowX);
      if (scrolls) {
        const pr = p.getBoundingClientRect();
        if (r.bottom <= pr.top + 1 || r.top >= pr.bottom - 1) return false;
        if (r.right <= pr.left + 1 || r.left >= pr.right - 1) return false;
      }
      p = p.parentElement;
    }
    return true;
  };

  const bad = [];
  for (const el of document.querySelectorAll('body *')) {
    if (el.closest('.mobileNav') || el.closest('.moreSheet')) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    if (parseFloat(cs.opacity) < 0.25) continue;
    const own = [...el.childNodes].filter(n => n.nodeType === 3)
      .map(n => n.textContent.trim()).join(' ').trim();
    if (own.length < 2) continue;
    const r = el.getBoundingClientRect();
    if (r.height < 4 || r.width < 4) continue;
    if (r.bottom <= nav.top + 2 || r.top >= nav.bottom - 2) continue;
    if (!trulyVisible(el)) continue;   // ← تلهٔ کانتینرِ اسکرول‌دار
    bad.push({
      txt: own.slice(0, 30),
      cls: (el.className || '').toString().slice(0, 30),
      overlap: Math.round(Math.min(r.bottom, nav.bottom) - Math.max(r.top, nav.top)),
    });
  }
  return { navTop: Math.round(nav.top), bad: bad.slice(0, 6) };
}
"""


async def goto(pg, label, where):
    if where == 'sheet':
        await pg.evaluate(
            "()=>{const b=[...document.querySelectorAll('.mobileNav button')]"
            ".find(x=>x.innerText.includes('بیشتر'));if(b)b.click();}")
        await pg.wait_for_timeout(450)
    sel = '.moreSheet button' if where == 'sheet' else '.mobileNav button'
    ok = await pg.evaluate(
        "([s,l])=>{const b=[...document.querySelectorAll(s)]"
        ".find(x=>x.innerText.trim()===l||x.innerText.trim().endsWith(l));"
        "if(!b)return false;b.click();return true;}", [sel, label])
    await pg.wait_for_timeout(1700)
    return ok


async def run(base, mobile, pw):
    findings = {}
    async with async_playwright() as p:
        br = await p.chromium.launch(args=['--no-sandbox'])
        pg = await (await br.new_context(
            viewport={'width': 412, 'height': 900},
            device_scale_factor=2, locale='fa-IR')).new_page()
        await pg.goto(base, wait_until='networkidle')
        await pg.fill('input', mobile)
        await pg.fill('input[type="password"], input[placeholder*="رمز"]', pw)
        await pg.click('form button[type="submit"], button.main')
        await pg.wait_for_timeout(3800)
        for label, where in NAV:
            if not await goto(pg, label, where):
                findings[label] = [{'txt': '— صفحه باز نشد —', 'cls': '', 'overlap': 0}]
                print(f'  ✗ {label} باز نشد')
                continue
            r = await pg.evaluate(JS)
            bad = r.get('bad', [])
            if bad:
                findings[label] = bad
            print(f'  {label:14s} {len(bad)} همپوشانی')
        await br.close()
    return findings


def main():
    res = asyncio.run(run(sys.argv[1], sys.argv[2], sys.argv[3]))
    print()
    total = sum(len(v) for v in res.values())
    if not total:
        print('✓ هیچ محتوایی زیرِ نوارِ ناوبری گم نمی‌شود')
        return 0
    print(f'✗ {total} مورد در {len(res)} صفحه:')
    for k, v in res.items():
        print(f'── {k}')
        for b in v:
            print(f'   {b["overlap"]:3d}px  {b["txt"][:30]:32s} cls={b["cls"]!r}')
    return 1


if __name__ == '__main__':
    sys.exit(main())
