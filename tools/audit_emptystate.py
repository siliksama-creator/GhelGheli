# -*- coding: utf-8 -*-
"""حالتِ خالی — دقیقاً وضعیتی که مالک روزِ عرضه در آن است.

═══════════════════════════════════════════════════════════════════════════
چرا این ممیزی از همه به‌موقع‌تر است
═══════════════════════════════════════════════════════════════════════════

دیتابیس همین حالا **کاملاً خالی** است: صفر کارت، صفر کد، یک کاربر. این
دقیقاً وضعیتی است که اپ در روزِ عرضه در آن قرار دارد، و همان وضعیتی است
که هیچ‌وقت تست نمی‌شود — چون توسعه‌دهنده همیشه داده دارد.

⚠️ باگی که مالک قبلاً با اسکرین‌شات نشان داد دقیقاً از همین جنس بود:
   بنرِ «ثبت کارت‌های قلقلی» بدونِ هیچ دکمه‌ای. کدْ `return null` می‌کرد
   و فکر می‌کرد کارِ درست را انجام می‌دهد.

پس این ممیزی هر صفحهٔ هر دو کلاینت را در حالتِ خالی باز می‌کند و سه
چیز را می‌سنجد:

  ۱. صفحه اصلاً رندر می‌شود؟ (نه سفید، نه خطای جاوااسکریپت)
  ۲. پیامِ راهنما دارد یا فقط سکوت؟
  ۳. عددی به‌شکلِ `NaN`، `undefined`، `null` یا `Infinity` نشان
     نمی‌دهد؟ — تقسیم بر صفر در محاسبهٔ درصد، کلاسیک‌ترین باگِ حالتِ
     خالی است.

اجرا:
    python3 tools/audit_emptystate.py <mobile> <pw> <admin-pw>
"""
import asyncio
import re
import sys

from playwright.async_api import async_playwright

WEB = 'https://user.ghelghelishop.ir'
ADMIN = 'https://admin.ghelghelishop.ir'

ok = bad = 0


def ck(n, c, d=''):
    global ok, bad
    if c:
        ok += 1
        print('  ✓', n)
    else:
        bad += 1
        print('  ✗', n, '→', str(d)[:220])


# نشانه‌های عددِ خراب. دور تا دورشان مرزِ کلمه نیست چون در فارسی کنارِ
# حروف می‌چسبند.
BADNUM = re.compile(r'NaN|undefined|\[object Object\]|Infinity|null تومان'
                    r'|، null|=null')


async def sweep(pg, label, names):
    """هر تب را باز می‌کند و سه چیز را می‌سنجد."""
    for nm in names:
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        try:
            btn = pg.get_by_role('button', name=nm)
            if await btn.count() == 0:
                continue
            await btn.first.click()
            await pg.wait_for_timeout(1800)
        except Exception as e:
            ck(f'{label} · {nm} باز می‌شود', False, str(e))
            continue

        body = (await pg.inner_text('body')) or ''
        ck(f'{label} · {nm} — خطای جاوااسکریپت ندارد', not errs,
           ' | '.join(errs[:2]))
        # صفحهٔ سفید: کمتر از ۴۰ نویسه یعنی عملاً چیزی رندر نشده.
        ck(f'{label} · {nm} — سفید نیست ({len(body)} نویسه)',
           len(body) > 40, body[:80])
        m = BADNUM.search(body)
        ck(f'{label} · {nm} — عددِ خراب ندارد', m is None,
           f'«{m.group(0) if m else ""}» در متن')


async def main():
    mob, pw, apw = sys.argv[1], sys.argv[2], sys.argv[3]
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox'])

        # ── وب‌اپِ کاربر ──
        print('\n══ وب‌اپِ کاربر، دیتابیسِ خالی ══')
        pg = await b.new_page(viewport={'width': 412, 'height': 900})
        await pg.goto(WEB, wait_until='networkidle', timeout=90000)
        await pg.wait_for_timeout(1500)
        await pg.locator('input[placeholder*="موبایل"]').first.fill(mob)
        await pg.locator('input[type="password"]').first.fill(pw)
        await pg.get_by_role('button', name='ورود').last.click()
        await pg.wait_for_timeout(6000)

        # پیامِ «هنوز فعال نشده» باید باشد — نه سکوت. این همان باگی است
        # که مالک با اسکرین‌شات نشان داد.
        body = await pg.inner_text('body')
        ck('کاتالوگِ خالی: پیامِ راهنما دیده می‌شود',
           'هنوز فعال نشده' in body or 'هنوز کارتی' in body,
           'سکوت — کاربر نمی‌داند اپ خراب است یا کارتی نیست')

        await sweep(pg, 'وب', ['خانه', 'جوایز', 'لیگ', 'چت و بازی',
                               'بیشتر'])
        await pg.close()

        # ── پنلِ مدیر ──
        print('\n══ پنلِ مدیر، دیتابیسِ خالی ══')
        pg = await b.new_page(viewport={'width': 1280, 'height': 900})
        await pg.goto(ADMIN, wait_until='networkidle', timeout=90000)
        await pg.wait_for_timeout(1500)
        await pg.locator('input').nth(0).fill('Admin')
        await pg.locator('input').nth(1).fill(apw)
        await pg.get_by_role('button', name='ورود').last.click()
        await pg.wait_for_timeout(6000)

        await sweep(pg, 'پنل', [
            'داشبورد', 'ثبت کارت', 'جوایز', 'کیف پول', 'لیگ ماهانه',
            'کاربران', 'چت', 'امتیاز بازی', 'پشتیبانی', 'اطلاعیه‌ها',
            'تنظیمات', 'ادمین‌ها'])

        # ── نمودار/آمارِ داشبورد با صفر داده ──
        # تقسیم بر صفر اینجا محتمل‌ترین جاست.
        await pg.get_by_role('button', name='داشبورد').first.click()
        await pg.wait_for_timeout(2500)
        dash = await pg.inner_text('body')
        ck('داشبورد با صفر داده عددِ خراب ندارد',
           BADNUM.search(dash) is None,
           str(BADNUM.search(dash).group(0) if BADNUM.search(dash) else ''))
        ck('داشبورد واقعاً محتوا دارد', len(dash) > 200, f'{len(dash)} نویسه')

        await pg.close()
        await b.close()

    print(f'\n{"✗" if bad else "✓"} {ok} موفق، {bad} ناموفق\n')
    sys.exit(1 if bad else 0)


asyncio.run(main())
