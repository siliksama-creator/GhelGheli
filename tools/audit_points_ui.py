# -*- coding: utf-8 -*-
"""صفحهٔ «ریز امتیازات» در مرورگرِ واقعی — جست‌وجو، کسر، و اعلان.

═══════════════════════════════════════════════════════════════════════════
چرا جدا از e2e_points.py
═══════════════════════════════════════════════════════════════════════════

`e2e_points.py` **API** را می‌سنجد و ۵۲ بررسی دارد. ولی هیچ‌کدام ثابت
نمی‌کنند که مدیر بتواند واقعاً از پنل کار کند:

  • دکمهٔ جست‌وجو به مسیرِ درست وصل است؟
  • نتیجه رندر می‌شود یا زیرِ خطای جاوااسکریپت گم می‌شود؟
  • فرمِ کسر جلوی ارسالِ بدونِ دلیل را می‌گیرد؟
  • عددِ تازه بعد از کسر روی صفحه به‌روز می‌شود یا مدیر باید رفرش کند؟

خواستهٔ مالک صریح بود: «رو این بخش خیلی کار بشه که بدون نقص باشه».
یعنی همان‌قدر که منطق باید درست باشد، رابط هم باید کار کند.

اجرا:
    python3 tools/audit_points_ui.py <رمزِ-مدیر>
"""
import asyncio
import io
import json
import os as _os
import sys
import sys as _sys
import time
import urllib.error
import urllib.request

_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from _authcache import (admin_token, block_test_user,  # noqa: E402
                        cleanup_own_run, deactivate_stale_designs)
from PIL import Image, ImageDraw  # noqa: E402
from playwright.async_api import async_playwright  # noqa: E402

API = 'https://api.ghelghelishop.ir'
ADMIN = 'https://admin.ghelghelishop.ir'
B = '--pu'

ok = bad = 0


def ck(n, c, d=''):
    global ok, bad
    if c:
        ok += 1
        print('  ✓', n)
    else:
        bad += 1
        print('  ✗', n, '→', str(d)[:230])


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


def card(text, bg, fg):
    im = Image.new('RGB', (520, 760), bg)
    d = ImageDraw.Draw(im)
    for i in range(0, 760, 37):
        d.line([(0, i), (520, i)], fill=fg, width=2)
    d.rectangle([40, 60, 480, 420], fill=fg)
    d.rectangle([70, 90, 450, 390], fill=bg)
    d.ellipse([160, 470, 360, 670], fill=fg)
    d.text((90, 200), text, fill=fg)
    o = io.BytesIO()
    im.save(o, 'PNG')
    return o.getvalue()


async def main():
    apw = sys.argv[1]
    at = admin_token(apw)
    PFX = f'PU{int(time.time()) % 100000:05d}'
    deactivate_stale_designs(req, at)

    # ── دادهٔ واقعی بساز: کاربری با چند تراکنش ──
    st, rc = req('POST', '/api/admin/photo-cards/designs', at,
                 {'name': f'{PFX}-رابط', 'pointValue': '300',
                  'rawCodes': f'{PFX}-U001\n{PFX}-U002'},
                 {'image': ('f.png', card('UI', (14, 40, 90), (250, 210, 90)),
                            'image/png')})
    ck('کارت آزمایشی ساخته شد', st == 200, f'{st}')
    mob = f'09{int(time.time() * 13) % 1000000000:09d}'
    st, ru = req('POST', '/api/auth/register-password', body={
        'mobile': mob, 'password': 'Qa!12345', 'firstName': 'تست',
        'lastName': 'رابط', 'nickname': f'رابط{PFX}'})
    ut, uid = ru.get('token'), (ru.get('user') or {}).get('id')
    ck('کاربر ساخته شد', bool(ut), f'{st}')
    if not ut:
        raise SystemExit('✗ بدونِ کاربر ادامه بی‌معنی است')
    for i in (1, 2):
        req('POST', '/api/photo-cards/submit', ut, {'code': f'{PFX}-U{i:03d}'},
            {'image': ('u.png', card('UI', (14, 40, 90), (250, 210, 90)),
                       'image/png')})
    time.sleep(1)

    try:
        async with async_playwright() as p:
            b = await p.chromium.launch(args=['--no-sandbox'])
            pg = await b.new_page(viewport={'width': 1400, 'height': 950})
            errs = []
            pg.on('pageerror', lambda e: errs.append(str(e)))

            await pg.goto(ADMIN, wait_until='networkidle', timeout=90000)
            await pg.wait_for_timeout(1200)
            await pg.locator('input').nth(0).fill('Admin')
            await pg.locator('input').nth(1).fill(apw)
            await pg.get_by_role('button', name='ورود').last.click()
            await pg.wait_for_timeout(5000)

            print('\n══ ۱. صفحه باز می‌شود ══')
            await pg.get_by_role('button', name='ریز امتیازات').first.click()
            await pg.wait_for_timeout(2000)
            body = await pg.inner_text('body')
            ck('تبِ ریز امتیازات باز شد', 'جست‌وجوی کاربر' in body, body[:120])
            ck('خطای جاوااسکریپت ندارد', not errs, ' | '.join(errs[:2]))

            print('\n══ ۲. جست‌وجو با شمارهٔ موبایل ══')
            await pg.locator('.ptSearchRow input').first.fill(mob)
            await pg.get_by_role('button', name='جست‌وجو').first.click()
            await pg.wait_for_timeout(2500)
            n_res = await pg.locator('.ptUser').count()
            ck(f'نتیجه رندر شد ({n_res})', n_res >= 1, f'{n_res} نتیجه')
            ck('شمارهٔ کاربر دیده می‌شود',
               mob in (await pg.inner_text('body')), 'شماره در صفحه نیست')

            print('\n══ ۳. انتخابِ کاربر → ریز امتیازات ══')
            await pg.locator('.ptUser').first.click()
            await pg.wait_for_timeout(2500)
            body = await pg.inner_text('body')
            ck('کارتِ آمار نمایش داده شد',
               await pg.locator('.ptStat').count() >= 4,
               f'{await pg.locator(".ptStat").count()} آمار')
            ck('موجودی ۶۰۰ دیده می‌شود', '۶۰۰' in body or '600' in body,
               'موجودی نمایش داده نشد')
            ck('«بیشترین امتیازهای یک‌باره» هست',
               'بیشترین امتیازهای یک‌باره' in body)
            ck('جدولِ تراکنش‌ها رندر شد',
               await pg.locator('table').count() >= 1)
            ck('منبعِ فارسی نشان داده می‌شود', 'ثبت کارت با عکس' in body,
               'برچسبِ منبع ترجمه نشده')
            ck('هشدارِ ناسازگاری **نمایش داده نمی‌شود** (دفتر سالم است)',
               'دفتر با موجودی نمی‌خواند' not in body,
               'هشدارِ دروغین روی کاربرِ سالم')

            print('\n══ ۴. ⚠️ کسر بدونِ دلیل باید مسدود باشد ══')
            amount_in = pg.locator('.ptForm input').first
            await amount_in.fill('-100')
            await pg.wait_for_timeout(600)
            body = await pg.inner_text('body')
            ck('پیامِ خطا نشان داده شد', 'باید دلیل بنویسید' in body,
               body[-300:])
            btn = pg.get_by_role('button', name='کسر امتیاز و اطلاع به کاربر')
            ck('دکمه غیرفعال است', await btn.first.is_disabled(),
               'مدیر می‌تواند بدونِ دلیل کسر کند!')

            print('\n══ ۵. کسر با دلیل ══')
            REASON = 'تست رابط — کسر آزمایشی'
            await pg.locator('.ptForm input').nth(1).fill(REASON)
            await pg.wait_for_timeout(500)
            ck('دکمه فعال شد', not await btn.first.is_disabled())
            # confirm را خودکار تأیید کن.
            pg.on('dialog', lambda d: asyncio.ensure_future(d.accept()))
            await btn.first.click()
            await pg.wait_for_timeout(3500)
            body = await pg.inner_text('body')
            ck('موجودی روی صفحه به‌روز شد (۵۰۰)',
               '۵۰۰' in body or '500' in body, 'عدد تازه نشان داده نشد')
            ck('ردیفِ کسر در جدول آمد', 'کسر مدیر' in body,
               'تراکنشِ تازه در جدول نیست')
            ck('دلیل در جدول دیده می‌شود', REASON in body, 'دلیل ثبت نشد')
            ck('هنوز خطای جاوااسکریپتی نیست', not errs,
               ' | '.join(errs[:2]))

            print('\n══ ۶. تبِ بیشترین امتیازگیرندگان ══')
            await pg.get_by_role('button', name='بیشترین امتیازگیرندگان').first.click()
            await pg.wait_for_timeout(2500)
            body = await pg.inner_text('body')
            ck('جدولِ برترین‌ها رندر شد',
               await pg.locator('table').count() >= 1)
            ck('کاربرِ ما در فهرست است', mob in body, 'کاربر در جدول نیست')
            ck('بزرگ‌ترین دریافت‌ها هم هست',
               'بزرگ‌ترین دریافت‌های یک‌باره' in body)
            ck('⚠️ بخشِ «دفترِ ناسازگار» نمایش داده نمی‌شود',
               'دفترِ ناسازگار' not in body,
               'یعنی جایی امتیاز بدونِ ثبت داده شده')

            print('\n══ ۷. سرریزِ افقی ندارد ══')
            sw = await pg.evaluate('()=>document.documentElement.scrollWidth')
            cw = await pg.evaluate('()=>document.documentElement.clientWidth')
            ck(f'بدونِ اسکرولِ افقی ({sw}/{cw})', sw <= cw + 1, f'{sw} > {cw}')

            print('\n══ ۸. روی صفحهٔ باریک هم سالم است ══')
            await pg.set_viewport_size({'width': 800, 'height': 900})
            await pg.wait_for_timeout(1200)
            sw = await pg.evaluate('()=>document.documentElement.scrollWidth')
            cw = await pg.evaluate('()=>document.documentElement.clientWidth')
            ck(f'۸۰۰ پیکسل: بدونِ سرریز ({sw}/{cw})', sw <= cw + 1, f'{sw} > {cw}')

            print('\n══ ۹. صفحهٔ لیگ: تاریخ و تأیید جوایز ══')
            await pg.set_viewport_size({'width': 1400, 'height': 950})
            await pg.get_by_role('button', name='لیگ ماهانه').first.click()
            await pg.wait_for_timeout(2500)
            body = await pg.inner_text('body')
            ck('بخشِ تاریخِ لیگ هست', 'تاریخ شروع و پایان لیگ' in body)
            ck('دو ورودیِ تاریخ رندر شد',
               await pg.locator('input[type="datetime-local"]').count() == 2,
               f'{await pg.locator("input[type=datetime-local]").count()} ورودی')
            # ⚠️ ورودی نباید خالی باشد: یعنی toLocalInput کار می‌کند.
            v = await pg.locator('input[type="datetime-local"]').first.input_value()
            ck('تاریخِ فعلی از سرور پر شد', bool(v), 'ورودی خالی است')
            ck('نشانِ خودکار/دستی دیده می‌شود',
               'خودکار' in body or 'دستی' in body)
            ck('خطای جاوااسکریپت ندارد', not errs, ' | '.join(errs[:2]))

            await b.close()
    finally:
        if uid:
            block_test_user('/home/user/tools/rx.py', uid)
        cleanup_own_run(req, at, PFX)

    print(f'\n{"✗" if bad else "✓"} {ok} موفق، {bad} ناموفق\n')
    sys.exit(1 if bad else 0)


asyncio.run(main())
