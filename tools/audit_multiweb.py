# -*- coding: utf-8 -*-
"""بازرسیِ زندهٔ وب‌اپ: آیا «چند نسخه از یک کارت» در مرورگرِ واقعی کار می‌کند؟

═══════════════════════════════════════════════════════════════════════════
چرا این ابزار لازم است، وقتی تستِ API سبز است
═══════════════════════════════════════════════════════════════════════════

تستِ API فقط ثابت می‌کند سرور درست جواب می‌دهد. چیزی که کاربر تجربه
می‌کند به کلاینت بستگی دارد و آنجا مستقل می‌تواند خراب باشد:

  • اگر `setFile(null)` بعد از ثبت اجرا شود، عکس از صفحه می‌پرد و کاربر
    مجبور می‌شود دوباره انتخاب کند — سرور کاملاً سالم است ولی محصول
    خراب.
  • اگر `codeRef.current?.focus()` به عنصری وصل نباشد، بی‌صدا هیچ کاری
    نمی‌کند و کیبورد موبایل بسته می‌ماند.
  • باگِ تاریخیِ این پروژه: `React is not defined` که build را سبز نگه
    می‌داشت ولی صفحه را سفید می‌کرد.

پس اینجا یک مرورگرِ واقعی صفحه را باز می‌کند، وارد می‌شود، و **دو بار
پشت‌سرهم** با یک عکس ثبت می‌کند — دقیقاً همان کاری که کاربر می‌کند.
"""
import asyncio
import io
import json
import os
import sys
import time
import urllib.error
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _authcache import (admin_token, block_test_user,  # noqa: E402
                        cleanup_own_run, deactivate_stale_designs)

API = 'https://api.ghelghelishop.ir'
WEB = 'https://user.ghelghelishop.ir'
B = '--wb'


def req(m, p, tok=None, body=None, files=None):
    h = {}
    if tok:
        h['Authorization'] = 'Bearer ' + tok
    d = None
    if files is not None:
        buf = io.BytesIO()
        for k, v in (body or {}).items():
            buf.write(f'--{B}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode())
        for k, (fn, c, ct) in files.items():
            buf.write(f'--{B}\r\nContent-Disposition: form-data; name="{k}"; filename="{fn}"\r\nContent-Type: {ct}\r\n\r\n'.encode())
            buf.write(c)
            buf.write(b'\r\n')
        buf.write(f'--{B}--\r\n'.encode())
        d = buf.getvalue()
        h['Content-Type'] = f'multipart/form-data; boundary={B}'
    elif body is not None:
        d = json.dumps(body).encode()
        h['Content-Type'] = 'application/json'
    r = urllib.request.Request(API + p, data=d, headers=h, method=m)
    try:
        with urllib.request.urlopen(r, timeout=180) as x:
            return x.status, json.loads(x.read() or b'{}')
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read() or b'{}')
        except Exception:
            return e.code, {}


ok = bad = 0


def ck(n, c, d=''):
    global ok, bad
    if c:
        ok += 1
        print('  ✓', n)
    else:
        bad += 1
        print('  ✗', n, '→', str(d)[:220])


async def main():
    global bad
    import colorsys

    from PIL import Image, ImageDraw, ImageFilter
    from playwright.async_api import async_playwright

    apw = sys.argv[1]
    at = admin_token(apw)
    PFX = f'WB{int(time.time()) % 100000:05d}'
    # ⚠️ شمارهٔ موبایل باید **یازده** رقم باشد. الگوی قبلی
    #    `0900{6رقم}` ده‌رقمی می‌ساخت و سرور در ثبت‌نام قبولش می‌کرد ولی
    #    فرمِ وب `normalizeMobile` را اجرا می‌کند و ورود شکست می‌خورد —
    #    بدون هیچ پیامی، فقط صفحهٔ ورود می‌ماند.
    mob = f'09{int(time.time()) % 1000000000:09d}'
    pwd = 'Qa!12345'

    st, ru = req('POST', '/api/auth/register-password', body={
        'mobile': mob, 'password': pwd, 'firstName': 'تست',
        'lastName': 'وب', 'nickname': f'وب{PFX}'})
    if st != 200 or not ru.get('token'):
        raise SystemExit(f'✗ ساخت کاربر نشد: {st} {ru}')
    uid = (ru.get('user') or {}).get('id')

    deactivate_stale_designs(req, at)

    # ── کارت و کدها ──
    im = Image.new('RGB', (420, 640))
    d = ImageDraw.Draw(im)
    for y in range(640):
        f = y / 640
        rr, gg, bb = colorsys.hsv_to_rgb(((150 + f * 45) % 360) / 360, 0.8, 0.3 + 0.45 * f)
        d.line([(0, y), (420, y)], fill=(int(rr * 255), int(gg * 255), int(bb * 255)))
    for k in range(-640, 1060, 17):
        d.line([(k, 0), (k + 640, 640)], fill=((k * 3) % 255, (k * 7) % 255, (k * 11) % 255), width=3)
    d.ellipse([95, 190, 325, 425], fill=(250, 210, 60))
    d.rectangle([0, 545, 420, 640], fill=(14, 14, 24))
    b = io.BytesIO()
    im.save(b, 'PNG')
    png = b.getvalue()

    st, rd = req('POST', '/api/admin/photo-cards/designs', at,
                 {'name': f'{PFX}-کارت', 'pointValue': '55'},
                 {'image': ('a.png', png, 'image/png')})
    if st != 200:
        raise SystemExit(f'✗ ساخت طرح نشد: {st} {rd}')
    # پاسخ `cardTypeId` را در ریشه می‌دهد، نه داخل `design`.
    tid = rd.get('cardTypeId') or (rd.get('design') or {}).get('card_type_id')
    if not tid:
        raise SystemExit(f'✗ شناسهٔ نوعِ کارت خوانده نشد: {rd}')
    codes = [f'{PFX}-{i:03d}' for i in range(1, 4)]
    req('POST', '/api/admin/photo-cards/codes', at,
        {'rawCodes': '\n'.join(codes), 'cardTypeId': tid})

    # عکسِ کاربر روی دیسک — چیزی که در فایل‌پیکرِ مرورگر انتخاب می‌شود.
    shot = im.rotate(5, expand=True, fillcolor=(28, 28, 34))
    shot = shot.resize((int(shot.width * .45), int(shot.height * .45)), Image.LANCZOS)
    shot = shot.filter(ImageFilter.GaussianBlur(.6))
    path = f'/tmp/{PFX}.jpg'
    shot.save(path, 'JPEG', quality=72)

    try:
        async with async_playwright() as p:
            br = await p.chromium.launch(args=['--no-sandbox'])
            pg = await br.new_page(viewport={'width': 420, 'height': 900})

            # ── خطاهای کنسول: باگِ `React is not defined` دقیقاً اینجا دیده می‌شد ──
            errs = []
            pg.on('pageerror', lambda e: errs.append(str(e)))
            pg.on('console', lambda m: m.type == 'error' and errs.append(m.text))

            await pg.goto(WEB, wait_until='networkidle', timeout=90000)
            # ⚠️ سلکتورِ `input[type="tel"]` کار نمی‌کند: فیلدِ موبایل در
            #    این فرم اصلاً `type` ندارد. تلاشِ اول با آن سلکتور
            #    بی‌صدا هیچ چیزی پر نکرد، دکمهٔ ورود بی‌اثر ماند، و خطا
            #    سی ثانیه بعد سرِ `input[type=file]` ظاهر شد — یعنی در
            #    جایی کاملاً بی‌ربط به علتِ واقعی.
            await pg.fill('input[placeholder*="موبایل"]', mob)
            await pg.fill('input[type="password"]', pwd)
            # ⚠️ `.last` حیاتی است: سه دکمهٔ «ورود» روی صفحه هست — دو
            #    تای اول تبِ سوییچِ ورود/ثبت‌نام‌اند و فقط آخری ارسال
            #    می‌کند. کلیک روی اولی هیچ کاری نمی‌کند و تست بی‌صدا در
            #    صفحهٔ ورود می‌ماند.
            await pg.locator('button:has-text("ورود")').last.click()
            await pg.wait_for_timeout(4000)

            has_box = await pg.locator('.photoCardBox').count() > 0
            ck('ورود موفق و بخشِ «ثبت کارت با عکس» رندر شد', has_box,
               (await pg.inner_text('body'))[:200].replace('\n', ' | '))
            if not has_box:
                # ادامه بی‌معنی است و خطاهای بعدی فقط گمراه‌کننده‌اند.
                await pg.screenshot(path=f'/tmp/{PFX}-fail.png', full_page=True)
                print(f'   اسکرین‌شات خطا: /tmp/{PFX}-fail.png')
                await br.close()
                bad += 1
                return 1

            # ── راهنمای «چند نسخه» ──
            #
            # ⚠️ این بررسی بازنویسی شد و دلیلش مهم است.
            #
            # نسخهٔ قبلی فقط `count() > 0` را می‌سنجید. بعد از جمع‌وجور
            # شدنِ فرم، این متن داخلِ `<details>`ِ **بسته** رفت — و تست
            # همچنان سبز می‌ماند، چون `<details>` فرزندِ پنهانش را در
            # DOM نگه می‌دارد. یعنی تست چیزی را «دیده» گزارش می‌کرد که
            # کاربر اصلاً نمی‌دید.
            #
            # همان دام در تست‌های فلاتر هم بود (AnimatedCrossFade) و
            # آنجا با `hitTestable()` رفع شد. اینجا معادلش
            # `is_visible()` است.
            #
            # حالا هر دو چیز سنجیده می‌شود: خلاصه باید **همیشه** دیده
            # شود (هشدارِ ۰/O باید قبل از تایپ به چشم بیاید)، و متنِ
            # کامل باید با یک کلیک در دسترس باشد.
            summary = pg.locator('.pcCodeHint > summary')
            ck('خلاصهٔ راهنما بدونِ کلیک دیده می‌شود',
               await summary.count() > 0 and await summary.first.is_visible())

            body = pg.locator('.pcCodeHintBody')
            ck('جزئیات پیش‌فرض پنهان است (فرم کوتاه بماند)',
               not await body.first.is_visible()
               if await body.count() else False)

            await summary.first.click()
            await pg.wait_for_timeout(400)
            ck('راهنمای «چند نسخه» بعد از باز کردن واقعاً دیده می‌شود',
               await pg.locator('text=چند نسخه از یک کارت').first.is_visible())
            await summary.first.click()
            await pg.wait_for_timeout(300)

            # ── ثبتِ اول ──
            #
            # ⚠️ `<input type="file">` عمداً `hidden` است (دکمه‌های
            #    «دوربین» و «گالری» رویش کلیک می‌کنند). `pg.set_input_files`
            #    منتظرِ دیده‌شدن می‌ماند و بعد از ۳۰ ثانیه تایم‌اوت
            #    می‌دهد — خطایی که شبیهِ «بخش رندر نشده» به نظر می‌رسد
            #    ولی در واقع فقط سلکتور روی عنصرِ مخفی گیر کرده.
            #
            #    `locator(...).set_input_files()` روی عنصرِ مخفی هم کار
            #    می‌کند چون فایل را مستقیم به DOM می‌دهد و کلیکی در کار
            #    نیست — دقیقاً همان کاری که مرورگر بعد از انتخاب کاربر
            #    انجام می‌دهد.
            await pg.locator('input[type="file"]').first.set_input_files(path)
            await pg.wait_for_timeout(900)
            await pg.fill('input.pcCode', codes[0])
            await pg.click('button:has-text("ثبت کارت")')
            await pg.wait_for_timeout(9000)

            ck('ثبتِ اول موفق بود',
               await pg.locator('.pcResult.ok').count() > 0,
               await pg.locator('.pcResult').inner_text() if await pg.locator('.pcResult').count() else 'هیچ نتیجه‌ای')

            # ── حیاتی: عکس باید هنوز روی صفحه باشد ──
            ck('عکس بعد از ثبتِ موفق سرِ جایش ماند',
               await pg.locator('.pcPreview img, img[alt*="انتخاب"]').count() > 0,
               'عکس پاک شد — کاربر مجبور است دوباره انتخاب کند')

            ck('فیلدِ کد خالی شد',
               (await pg.input_value('input.pcCode')).strip() == '',
               await pg.input_value('input.pcCode'))

            ck('فوکوس روی فیلدِ کد است (کیبورد باز می‌ماند)',
               await pg.evaluate(
                   "() => document.activeElement?.classList?.contains('pcCode')"),
               'فوکوس جای دیگری است')

            # ── ثبتِ دوم با **همان عکس** و کدِ بعدی ──
            await pg.fill('input.pcCode', codes[1])
            await pg.click('button:has-text("ثبت کارت")')
            await pg.wait_for_timeout(9000)
            txt = await pg.locator('.pcResult').first.inner_text() \
                if await pg.locator('.pcResult').count() else ''

            ck('ثبتِ دوم با همان عکس هم موفق بود',
               await pg.locator('.pcResult.ok').count() > 0, txt)
            ck('پیامِ «این عکس قبلاً ارسال شده» دیده نمی‌شود',
               'قبلاً ارسال شده' not in txt, txt[:150])

            ck('هیچ خطای جاوااسکریپتی رخ نداد', not errs, errs[:3])

            await pg.screenshot(path=f'/tmp/{PFX}.png', full_page=True)
            print(f'   اسکرین‌شات: /tmp/{PFX}.png')
            await br.close()
    finally:
        # atexit اینجا کار نمی‌کند چون asyncio است؛ finally مطمئن‌تر است.
        cleanup_own_run(req, at, PFX)
        if uid:
            block_test_user('/home/user/tools/rx.py', uid)
        try:
            os.remove(path)
        except OSError:
            pass

    print(f'\n{"─" * 56}\n✓ {ok} موفق، ✗ {bad} ناموفق')
    return 1 if bad else 0


sys.exit(asyncio.run(main()))
