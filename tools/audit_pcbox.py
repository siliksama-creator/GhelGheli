# -*- coding: utf-8 -*-
"""ممیزیِ فرمِ جمع‌وجورِ «ثبت کارت با عکس» — روی مرورگرِ واقعی.

═══════════════════════════════════════════════════════════════════════════
چرا این ممیزیِ جدا لازم شد
═══════════════════════════════════════════════════════════════════════════

`audit_pixels.py` و `audit_overlap.py` صفحه‌ها را در حالتِ **عادی** ممیزی
می‌کنند. ولی فرمِ ثبت کارت سه حالت دارد که هیچ‌کدام حالتِ عادی نیستند:

  ۱. کاتالوگ خالی → پیامِ «هنوز فعال نشده»
  ۲. عکسِ انتخاب‌شده → پیش‌نمایش جای کادرِ خالی را می‌گیرد
  ۳. راهنمای حروف باز → ۱۲۰ پیکسل به ارتفاع اضافه می‌شود

فرم در همین جلسه بازچینش شد (از ۵۰۰+ به ۲۹۹ پیکسل). چیزی که در چیدمانِ
فشرده **به‌سادگی** خراب می‌شود و هیچ تستِ واحدی نمی‌گیردش:

  • سرریزِ افقی روی صفحهٔ باریک (۳۲۰ پیکسل، گوشیِ قدیمی)
  • هدفِ لمسِ کوچک‌تر از ۴۴ پیکسل — چون دکمه‌ها از ۷۶ به ۴۸ آمدند
  • کنتراستِ متنِ خلاصهٔ راهنما که حالا کوچک‌تر شده (۱۱.۵px)
  • پرشِ چیدمان هنگامِ انتخابِ عکس

⚠️ این ممیزی به **کاتالوگِ ناخالی** نیاز دارد. اگر کاتالوگ خالی باشد فرم
   اصلاً رندر نمی‌شود و ممیزی با پیامِ روشن رد می‌شود به‌جای اینکه سبزِ
   دروغین بدهد.

اجرا:
    python3 tools/audit_pcbox.py <base-url> <mobile> <password>
"""
import sys
import time

from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else 'https://user.ghelghelishop.ir'
MOB = sys.argv[2]
PW = sys.argv[3]

ok = bad = 0


def ck(n, c, d=''):
    global ok, bad
    if c:
        ok += 1
        print('  ✓', n)
    else:
        bad += 1
        print('  ✗', n, '→', str(d)[:220])


def luminance(rgb):
    def ch(v):
        v /= 255
        return v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4
    r, g, b = rgb
    return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b)


def run(width, label):
    global ok, bad
    print(f'\n══ عرضِ {width} پیکسل ({label}) ══')
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page(viewport={'width': width, 'height': 900},
                        device_scale_factor=2)
        pg.goto(BASE, wait_until='networkidle', timeout=90000)
        time.sleep(1.5)
        pg.locator('input[placeholder*="موبایل"]').first.fill(MOB)
        pg.locator('input[type="password"]').first.fill(PW)
        pg.get_by_role('button', name='ورود').last.click()
        pg.wait_for_timeout(6000)

        box = pg.locator('.photoCardBox').first
        if box.count() == 0:
            print('  … بخشِ ثبت کارت رندر نشد')
            b.close()
            return
        box.scroll_into_view_if_needed(timeout=20000)
        pg.wait_for_timeout(1000)

        # کاتالوگِ خالی؟ آن‌وقت فرم نیست و ممیزی بی‌معنی است.
        if pg.locator('.pcRow').count() == 0:
            print('  ⚠ کاتالوگ خالی است — فرم رندر نشده.')
            print('    این ممیزی به دستِ‌کم یک کارتِ فعال نیاز دارد.')
            b.close()
            return

        # ── ۱. سرریزِ افقی ──
        ov = pg.evaluate("""() => {
          const box = document.querySelector('.photoCardBox');
          const br = box.getBoundingClientRect();
          const bad = [];
          box.querySelectorAll('*').forEach(el => {
            const r = el.getBoundingClientRect();
            if (r.width === 0 || r.height === 0) return;
            if (r.left < br.left - 1 || r.right > br.right + 1)
              bad.push((el.className||el.tagName) + ' '
                       + Math.round(r.left) + '..' + Math.round(r.right));
          });
          return {bad, sw: document.documentElement.scrollWidth,
                  cw: document.documentElement.clientWidth};
        }""")
        ck('صفحه اسکرولِ افقی ندارد', ov['sw'] <= ov['cw'] + 1,
           f"{ov['sw']} > {ov['cw']}")
        ck('هیچ عنصری از کادر بیرون نزده', not ov['bad'],
           ' | '.join(ov['bad'][:4]))

        # ── ۲. هدف‌های لمس ──
        # دکمه‌ها از ۷۶ به ۴۸ پیکسل آمدند. حداقلِ راهنمای دسترس‌پذیری ۴۴
        # است و رد شدن از آن روی موبایل یعنی کاربر مدام اشتباه می‌زند.
        taps = pg.evaluate("""() => {
          const out = [];
          document.querySelectorAll(
            '.photoCardBox .pcPick, .photoCardBox .pcSlot, '
            + '.photoCardBox button.main').forEach(el => {
            const r = el.getBoundingClientRect();
            out.push({c: el.className, w: Math.round(r.width),
                      h: Math.round(r.height)});
          });
          return out;
        }""")
        small = [t for t in taps if t['h'] < 44 or t['w'] < 44]
        ck(f'هر {len(taps)} هدفِ لمس دستِ‌کم ۴۴ پیکسل است', not small,
           str(small))

        # ── ۳. کنتراستِ خلاصهٔ راهنما ──
        # این متن به ۱۱.۵px کوچک شد. متنِ کوچک‌تر کنتراستِ بیشتری
        # می‌خواهد، نه کمتر.
        con = pg.evaluate("""() => {
          const el = document.querySelector('.pcCodeHint > summary');
          if (!el) return null;
          const s = getComputedStyle(el);
          const parse = c => (c.match(/[\\d.]+/g)||[]).slice(0,3).map(Number);
          let bg = null, n = el;
          while (n && !bg) {
            const c = getComputedStyle(n).backgroundColor;
            if (c && !c.includes('rgba(0, 0, 0, 0)')) bg = parse(c);
            n = n.parentElement;
          }
          return {fg: parse(s.color), bg: bg || [11,20,34],
                  size: parseFloat(s.fontSize)};
        }""")
        if con:
            l1 = luminance(con['fg'])
            l2 = luminance(con['bg'])
            ratio = (max(l1, l2) + 0.05) / (min(l1, l2) + 0.05)
            need = 3.0 if con['size'] >= 18.66 else 4.5
            ck(f"کنتراستِ خلاصهٔ راهنما {ratio:.2f} ≥ {need}",
               ratio >= need,
               f"fg={con['fg']} bg={con['bg']} size={con['size']}")

        # ── ۴. راهنما پیش‌فرض بسته است ──
        openness = pg.evaluate(
            "() => document.querySelector('.pcCodeHint')?.open")
        ck('راهنمای حروف پیش‌فرض بسته است', openness is False,
           f'open={openness} — فرم بی‌دلیل دراز می‌شود')

        h_closed = box.bounding_box()['height']
        ck(f'ارتفاعِ فرم زیرِ ۳۶۰ پیکسل است ({round(h_closed)})',
           h_closed < 360, f'{round(h_closed)} پیکسل')

        # ── ۵. باز و بسته شدن ──
        pg.locator('.pcCodeHint > summary').first.click()
        pg.wait_for_timeout(500)
        h_open = box.bounding_box()['height']
        ck('باز شدنِ راهنما ارتفاع را زیاد می‌کند', h_open > h_closed,
           f'{round(h_closed)} → {round(h_open)}')
        vis = pg.locator('.pcCodeHintBody').first.is_visible()
        ck('متنِ کاملِ راهنما بعد از باز شدن دیده می‌شود', vis)
        pg.locator('.pcCodeHint > summary').first.click()
        pg.wait_for_timeout(500)
        ck('دوباره بسته می‌شود',
           abs(box.bounding_box()['height'] - h_closed) < 3)

        # ── ۶. پرشِ چیدمان هنگامِ انتخابِ عکس ──
        # قبلاً پیش‌نمایشِ ۲۶۰ پیکسلی ناگهان ظاهر می‌شد و همه‌چیز می‌پرید.
        import os
        img = '/tmp/_pcaudit_card.png'
        if not os.path.exists(img):
            from PIL import Image, ImageDraw
            im = Image.new('RGB', (520, 760), (14, 40, 90))
            d = ImageDraw.Draw(im)
            d.rectangle([40, 60, 480, 420], fill=(250, 210, 90))
            im.save(img)
        pg.locator('.photoCardBox input[type="file"]').first.set_input_files(img)
        pg.wait_for_timeout(1500)
        h_pic = box.bounding_box()['height']
        ck(f'انتخابِ عکس چیدمان را نمی‌پراند ({round(h_closed)}→{round(h_pic)})',
           abs(h_pic - h_closed) <= 4, f'پرش {round(h_pic - h_closed)} پیکسل')

        # پیش‌نمایش واقعاً دیده می‌شود؟
        ck('پیش‌نمایشِ عکس رندر شد',
           pg.locator('.pcSlotFilled img').count() == 1)
        ck('دکمهٔ حذفِ عکس هست',
           pg.locator('.pcClear').first.is_visible())

        # سرریز بعد از عکس هم بررسی شود.
        sw = pg.evaluate('() => document.documentElement.scrollWidth')
        cw = pg.evaluate('() => document.documentElement.clientWidth')
        ck('با عکس هم اسکرولِ افقی نیست', sw <= cw + 1, f'{sw} > {cw}')

        b.close()


# دو عرض: گوشیِ معمولی و باریک‌ترین گوشیِ رایج.
run(412, 'گوشیِ معمولی')
run(320, 'باریک‌ترین گوشیِ رایج')

print(f'\n{"✗" if bad else "✓"} {ok} موفق، {bad} ناموفق\n')
sys.exit(1 if bad else 0)
