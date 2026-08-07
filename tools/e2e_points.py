# -*- coding: utf-8 -*-
"""دفترِ ریزِ امتیازات — تستِ سرتاسری روی سرورِ زنده.

═══════════════════════════════════════════════════════════════════════════
چه چیزی سنجیده می‌شود
═══════════════════════════════════════════════════════════════════════════

دفترِ امتیاز تازه ساخته شده و هفت مسیرِ جدا در آن می‌نویسند. مهم‌ترین
ادعایش این است:

    SUM(delta) هر کاربر  ==  users.current_points

اگر این نخواند، کلِ «ریز امتیازات» دروغ می‌گوید — و بدتر، دروغی که
درست به نظر می‌رسد. پس بعد از **هر** عملیات دوباره سنجیده می‌شود.

⚠️ درسی که از کیفِ پول گرفته شده: آنجا `wallet drift` روی ۱۶ کاربر
   ماه‌ها بی‌سروصدا ماند تا اسکریپتِ بک‌آپ گزارشش کرد. اینجا از روزِ
   اول تست می‌شود.

اجرا:
    python3 tools/e2e_points.py <رمزِ-مدیر>
"""
import atexit
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

API = 'https://api.ghelghelishop.ir'
B = '--pt'


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
        print('  ✗', n, '→', str(d)[:250])


def card(text, bg, fg, layout=0):
    im = Image.new('RGB', (520, 760), bg)
    d = ImageDraw.Draw(im)
    step = (37, 23, 61)[layout % 3]
    for i in range(0, 760, step):
        d.line([(0, i), (520, i)], fill=fg, width=2 + layout)
    if layout == 0:
        d.rectangle([40, 60, 480, 420], fill=fg)
        d.rectangle([70, 90, 450, 390], fill=bg)
        d.ellipse([160, 470, 360, 670], fill=fg)
    else:
        d.rectangle([30, 40, 250, 700], fill=fg)
        d.polygon([(300, 640), (500, 640), (400, 420)], fill=fg)
    d.text((90, 200), text, fill=fg)
    o = io.BytesIO()
    im.save(o, 'PNG')
    return o.getvalue()


apw = sys.argv[1] if len(sys.argv) > 1 else None
if not apw:
    raise SystemExit('استفاده: python3 tools/e2e_points.py <رمزِ-مدیر>')
at = admin_token(apw)
PFX = f'PT{int(time.time()) % 100000:05d}'
deactivate_stale_designs(req, at)
atexit.register(lambda: cleanup_own_run(req, at, PFX))


def ledger(uid):
    """(موجودی، جمعِ دفتر، تعداد ردیف) از دیدِ پنلِ مدیر."""
    st, d = req('GET', f'/api/admin/points/user/{uid}', at)
    if st != 200:
        return None
    return (int(d['user']['current_points']), int(d['ledgerSum']),
            int(d['total']), d)


print('\n══ ۱. آماده‌سازی ══')
st, rc = req('POST', '/api/admin/photo-cards/designs', at,
             {'name': f'{PFX}-امتیاز', 'pointValue': '250',
              'rawCodes': '\n'.join(f'{PFX}-P{i:03d}' for i in range(1, 5))},
             {'image': ('f.png', card('PTS', (14, 40, 90), (250, 210, 90)),
                        'image/png')})
ck('کارت ۲۵۰ امتیازی ساخته شد', st == 200, f'{st} {str(rc)[:130]}')

mob = f'09{int(time.time() * 11) % 1000000000:09d}'
st, ru = req('POST', '/api/auth/register-password', body={
    'mobile': mob, 'password': 'Qa!12345', 'firstName': 'تست',
    'lastName': 'امتیاز', 'nickname': f'امتیاز{PFX}'})
ut = ru.get('token')
uid = (ru.get('user') or {}).get('id')
ck('کاربر ساخته شد', bool(ut and uid), f'{st}')
if not ut:
    raise SystemExit('\n✗ بدونِ کاربر ادامه بی‌معنی است.')
atexit.register(lambda: block_test_user('/home/user/tools/rx.py', uid))

bal, led, n, _ = ledger(uid)
ck('کاربرِ تازه: موجودی صفر و دفترِ خالی', bal == 0 and led == 0 and n == 0,
   f'bal={bal} ledger={led} n={n}')

print('\n══ ۲. ثبت کارت → ردیفِ دفتر ══')
st, s1 = req('POST', '/api/photo-cards/submit', ut, {'code': f'{PFX}-P001'},
             {'image': ('u.png', card('PTS', (14, 40, 90), (250, 210, 90)),
                        'image/png')})
ck('کارت ثبت شد', s1.get('status') == 'approved',
   f"{st} {s1.get('status')} {str(s1.get('message'))[:70]}")
time.sleep(1)
bal, led, n, d = ledger(uid)
ck(f'موجودی ۲۵۰ شد', bal == 250, str(bal))
ck('دفتر با موجودی می‌خواند', led == bal, f'ledger={led} balance={bal}')
ck('دقیقاً یک ردیف ثبت شد', n == 1, str(n))
tx = (d.get('transactions') or [{}])[0]
ck('منبعش photo_card است', tx.get('source') == 'photo_card',
   str(tx.get('source')))
ck('balance_after درست است', int(tx.get('balance_after') or 0) == 250,
   str(tx.get('balance_after')))
ck('توضیحِ فارسی دارد', 'کارت' in str(tx.get('description') or ''),
   str(tx.get('description')))

print('\n══ ۳. چند ثبتِ دیگر → دفتر همچنان می‌خواند ══')
for i in (2, 3):
    req('POST', '/api/photo-cards/submit', ut, {'code': f'{PFX}-P{i:03d}'},
        {'image': ('u.png', card('PTS', (14, 40, 90), (250, 210, 90)),
                   'image/png')})
time.sleep(1)
bal, led, n, d = ledger(uid)
ck(f'موجودی ۷۵۰ ({bal})', bal == 750, str(bal))
ck('دفتر همچنان می‌خواند', led == bal, f'{led} vs {bal}')
ck('سه ردیف', n == 3, str(n))

print('\n══ ۴. ⚠️ کسرِ امتیاز بدونِ دلیل باید رد شود ══')
st, r = req('POST', f'/api/admin/users/{uid}/points', at, {'points': -100})
ck('کسر بدونِ دلیل رد شد', st == 400, f'{st} {str(r.get("message"))[:90]}')
st, r = req('POST', f'/api/admin/users/{uid}/points', at,
            {'points': -100, 'reason': 'ا'})
ck('دلیلِ خیلی کوتاه هم رد شد', st == 400, f'{st}')
bal2, _, _, _ = ledger(uid)
ck('موجودی دست‌نخورده ماند', bal2 == 750, str(bal2))

print('\n══ ۵. کسرِ امتیاز با دلیل ══')
REASON = 'ثبت کارت تکراری — بررسی دستی'
st, r = req('POST', f'/api/admin/users/{uid}/points', at,
            {'points': -200, 'reason': REASON})
ck('کسر انجام شد', st == 200, f'{st} {str(r)[:130]}')
ck('مقدارِ اعمال‌شده گزارش شد', r.get('applied') == -200, str(r.get('applied')))
time.sleep(1)
bal, led, n, d = ledger(uid)
ck(f'موجودی ۵۵۰ شد ({bal})', bal == 550, str(bal))
ck('دفتر می‌خواند', led == bal, f'{led} vs {bal}')
ck('چهار ردیف', n == 4, str(n))
tx = (d.get('transactions') or [{}])[0]
ck('ردیفِ کسر منفی است', int(tx.get('delta') or 0) == -200, str(tx.get('delta')))
ck('منبعش admin_deduct است', tx.get('source') == 'admin_deduct',
   str(tx.get('source')))
ck('دلیل ذخیره شد', REASON in str(tx.get('description') or ''),
   str(tx.get('description')))
ck('نامِ مدیر ثبت شد', tx.get('admin_username') == 'Admin',
   str(tx.get('admin_username')))

print('\n══ ۶. اعلانِ زنگوله به کاربر رفت ══')
st, nt = req('GET', '/api/notifications', ut)
items = nt if isinstance(nt, list) else (nt.get('notifications') or nt.get('items') or [])
ded = [x for x in items if x.get('type') == 'points_deducted']
ck('اعلانِ کسر ساخته شد', len(ded) >= 1,
   f'انواعِ موجود: {[x.get("type") for x in items][:6]}')
if ded:
    body = str(ded[0].get('body') or '')
    ck('دلیل داخلِ متنِ اعلان هست', REASON in body, body[:110])
    ck('مقدار به فارسی نوشته شده', '۲۰۰' in body, body[:110])

print('\n══ ۷. ⚠️ کسرِ بیش از موجودی → فقط تا صفر ══')
st, r = req('POST', f'/api/admin/users/{uid}/points', at,
            {'points': -99999, 'reason': 'تست سقف'})
ck('پذیرفته شد', st == 200, f'{st}')
ck('فقط ۵۵۰ کسر شد نه ۹۹۹۹۹', r.get('applied') == -550,
   f"applied={r.get('applied')} — دفتر باید کسرِ واقعی را بگوید")
time.sleep(1)
bal, led, n, _ = ledger(uid)
ck('موجودی صفر شد', bal == 0, str(bal))
ck('⚠️ دفتر همچنان می‌خواند', led == bal, f'{led} vs {bal} — کسرِ خام ثبت شده؟')

print('\n══ ۸. سقفِ مقدار ══')
st, r = req('POST', f'/api/admin/users/{uid}/points', at,
            {'points': 99999999, 'reason': 'تست'})
ck('مقدارِ نجومی رد شد', st == 400, f'{st} {str(r.get("message"))[:80]}')
st, r = req('POST', f'/api/admin/users/{uid}/points', at, {'points': 0})
ck('صفر رد شد', st == 400, f'{st}')

print('\n══ ۹. جست‌وجو با شمارهٔ موبایل ══')
st, sr = req('GET', f'/api/admin/points/search?q={mob}', at)
ck('جست‌وجو کار کرد', st == 200, f'{st}')
found = [u for u in (sr.get('users') or []) if u.get('id') == uid]
ck('کاربر پیدا شد', len(found) == 1, f"{len(sr.get('users') or [])} نتیجه")
# جست‌وجوی جزئی — مدیر معمولاً کلِ شماره را تایپ نمی‌کند.
st, sr2 = req('GET', f'/api/admin/points/search?q={mob[3:9]}', at)
ck('جست‌وجوی جزئی هم کار می‌کند',
   any(u.get('id') == uid for u in (sr2.get('users') or [])),
   f"{len(sr2.get('users') or [])} نتیجه برای «{mob[3:9]}»")
# ارقامِ فارسی — همان باگی که یک بار در ورود رخ داد.
fa = str(mob).translate(str.maketrans('0123456789', '۰۱۲۳۴۵۶۷۸۹'))
st, sr3 = req('GET',
              '/api/admin/points/search?q=' + urllib.request.quote(fa), at)
ck('⚠️ ارقامِ فارسی هم پیدا می‌کند',
   any(u.get('id') == uid for u in (sr3.get('users') or [])),
   'مدیری که با کیبوردِ فارسی تایپ کند هیچ‌وقت چیزی پیدا نمی‌کند')
st, sr4 = req('GET', '/api/admin/points/search?q=ab', at)
ck('جست‌وجوی خیلی کوتاه نتیجه نمی‌دهد', not (sr4.get('users') or []),
   'بار اضافه روی دیتابیس')

print('\n══ ۱۰. بیشترین امتیازگیرندگان ══')
st, top = req('GET', '/api/admin/points/top', at)
ck('مسیر کار کرد', st == 200, f'{st}')
ck('کاربرِ ما در فهرست است',
   any(u.get('id') == uid for u in (top.get('top') or [])),
   f"{len(top.get('top') or [])} کاربر")
me = next((u for u in (top.get('top') or []) if u.get('id') == uid), {})
ck('«بیشترین دریافتِ تک‌باره» درست است',
   int(me.get('biggest_single') or 0) == 250, str(me.get('biggest_single')))
ck('تفکیکِ منبع برگشت', len(top.get('bySource') or []) >= 1,
   str(top.get('bySource')))
ck('⚠️ هیچ کاربری drift ندارد', not (top.get('drift') or []),
   f"{len(top.get('drift') or [])} کاربر ناسازگار: {top.get('drift')}")

print('\n══ ۱۱. خلاصهٔ منابع ══')
_, _, _, d = ledger(uid)
sm = d.get('summary') or {}
ck('بزرگ‌ترین دریافت‌ها فهرست شد', len(sm.get('biggestGains') or []) >= 1,
   str(sm.get('biggestGains'))[:100])
tot = sm.get('totals') or {}
ck('جمعِ کسب‌شده ۷۵۰', int(tot.get('earned') or 0) == 750, str(tot))
ck('جمعِ خرج‌شده ۷۵۰', int(tot.get('spent') or 0) == 750, str(tot))
ck('خالص صفر', int(tot.get('net') or 0) == 0, str(tot))

print('\n══ ۱۲. کاربر ریزِ امتیازِ خودش را می‌بیند ══')
st, mine = req('GET', '/api/points/history', ut)
ck('مسیرِ کاربر کار کرد', st == 200, f'{st}')
ck('همان تعداد ردیف', int(mine.get('total') or 0) == n, f"{mine.get('total')} vs {n}")

print('\n══ ۱۳. کاربرِ عادی به دفترِ دیگران دسترسی ندارد ══')
st, _ = req('GET', f'/api/admin/points/user/{uid}', ut)
ck(f'رد شد → {st}', st in (401, 403), f'⚠️ نشتِ داده! ({st})')
st, _ = req('GET', '/api/admin/points/top', ut)
ck(f'فهرستِ برترین‌ها هم بسته است → {st}', st in (401, 403), f'{st}')

print(f'\n{"✗" if bad else "✓"} {ok} موفق، {bad} ناموفق\n')
sys.exit(1 if bad else 0)
