# -*- coding: utf-8 -*-
"""هم‌زمانی روی **اولین** نسخهٔ یک کارت — باگِ SELECT-سپس-INSERT.

═══════════════════════════════════════════════════════════════════════════
چه چیزی سنجیده می‌شود
═══════════════════════════════════════════════════════════════════════════

`e2e_photorace.py` هم‌زمانی را می‌سنجد ولی نه این حالتِ خاص را. تفاوت
ظریف و مهم است:

  • آن تست چهار کدِ **یک کاربر** را موازی می‌فرستد. اگر کاربر از قبل
    ردیفِ اینونتوری داشته باشد، هر چهار به شاخهٔ UPDATE می‌روند که
    اتمیک است و مشکلی ندارد.

  • این تست حالتی را می‌سنجد که کاربر **هیچ ردیفی ندارد** و دو درخواست
    هم‌زمان می‌رسند. آن‌وقت هر دو شاخهٔ INSERT را می‌گیرند:

        SELECT id FROM user_card_inventory WHERE ...   ← هر دو: خالی
        INSERT INTO user_card_inventory ...            ← دومی می‌ترکد

    چون `uq_inventory_active` روی (user_id, card_type_id) یکتاست.

نتیجهٔ باگ: کاربر دو کارت دارد، دکمه را دو بار می‌زند (یا اینترنتش کند
است و اپ دوباره می‌فرستد)، و یکی از دو کد **بدونِ کارت** سوخته می‌شود —
چون تراکنش برمی‌گردد ولی کاربر پیامِ خطای مبهم می‌بیند و فکر می‌کند کد
مصرف شده.

⚠️ این باگ **از قبل** وجود داشت (الگوی SELECT-سپس-INSERT). تغییرِ
   `display_design_id` آن را نساخت، ولی چون همان کد را لمس کرد، اینجا
   سنجیده و رفع می‌شود.

اجرا:
    python3 tools/e2e_invrace.py <رمزِ-مدیر>
"""
import atexit
import io
import json
import os as _os
import sys
import sys as _sys
import threading
import time
import urllib.error
import urllib.request

_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from _authcache import (admin_token, block_test_user, cleanup_own_run,  # noqa: E402
                        deactivate_stale_designs)
from PIL import Image, ImageDraw  # noqa: E402

API = 'https://api.ghelghelishop.ir'
B = '--ir'


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


def card(t, bg, fg):
    im = Image.new('RGB', (520, 760), bg)
    d = ImageDraw.Draw(im)
    d.rectangle([40, 60, 480, 420], fill=fg)
    d.text((90, 200), t, fill=bg)
    d.ellipse([160, 470, 360, 670], fill=fg)
    o = io.BytesIO()
    im.save(o, 'PNG')
    return o.getvalue()


apw = sys.argv[1] if len(sys.argv) > 1 else None
if not apw:
    raise SystemExit('استفاده: python3 tools/e2e_invrace.py <رمزِ-مدیر>')
at = admin_token(apw)
PFX = f'IR{int(time.time()) % 100000:05d}'
deactivate_stale_designs(req, at)
atexit.register(lambda: cleanup_own_run(req, at, PFX))

print('\n══ ۱. یک کارتِ دوطرفه با چند کد ══')
FRONT = card('F', (12, 44, 92), (250, 210, 90))
BACK = card('B', (240, 200, 80), (18, 28, 58))
NCODE = 6
st, rc = req('POST', '/api/admin/photo-cards/designs', at,
             {'name': f'{PFX}-مسابقه', 'pointValue': '10',
              'rawCodes': '\n'.join(f'{PFX}-R{i:03d}'
                                    for i in range(1, NCODE + 1))},
             {'image': ('f.png', FRONT, 'image/png'),
              'imageBack': ('b.png', BACK, 'image/png')})
ck('کارت ساخته شد', st == 200 and rc.get('sideCount') == 2,
   f'{st} {str(rc)[:150]}')
if bad:
    raise SystemExit('\n✗ آماده‌سازی شکست خورد.')

print('\n══ ۲. ⚠️ دو درخواستِ هم‌زمان روی **اولین** کارتِ کاربر ══')
print('   (کاربر هیچ ردیفِ اینونتوری ندارد — هر دو شاخهٔ INSERT می‌گیرند)')

ROUNDS = 3
for rnd in range(1, ROUNDS + 1):
    mob = f'09{(int(time.time() * 1000) + rnd * 4441) % 1000000000:09d}'
    st, ru = req('POST', '/api/auth/register-password', body={
        'mobile': mob, 'password': 'Qa!12345', 'firstName': 'تست',
        'lastName': 'مسابقه', 'nickname': f'مس{PFX}{rnd}'})
    if st != 200 or not ru.get('token'):
        ck(f'دورِ {rnd}: کاربر ساخته شد', False, f'{st}')
        continue
    ut = ru['token']
    uid = (ru.get('user') or {}).get('id')
    if uid:
        atexit.register(
            lambda u=uid: block_test_user('/home/user/tools/rx.py', u))

    # دو کدِ متفاوت، **هم‌زمان**. هر دو باید موفق شوند: کاربر واقعاً دو
    # کارتِ فیزیکی دارد.
    codes = [f'{PFX}-R{rnd * 2 - 1:03d}', f'{PFX}-R{rnd * 2:03d}']
    res = {}
    barrier = threading.Barrier(2)

    def fire(code):
        # Barrier تضمین می‌کند هر دو نخ **دقیقاً** با هم شلیک کنند،
        # وگرنه اولی تمام می‌شود و مسابقه‌ای رخ نمی‌دهد.
        barrier.wait()
        s, r = req('POST', '/api/photo-cards/submit', ut, {'code': code},
                   {'image': ('u.png', FRONT, 'image/png')})
        res[code] = (s, r)

    ths = [threading.Thread(target=fire, args=(c,)) for c in codes]
    for t in ths:
        t.start()
    for t in ths:
        t.join()

    statuses = {c: res[c][1].get('status') for c in codes}
    httpc = {c: res[c][0] for c in codes}
    good = sum(1 for c in codes
               if res[c][1].get('status') in ('approved', 'pending'))
    err5 = [c for c in codes if res[c][0] >= 500]

    ck(f'دورِ {rnd}: هیچ خطای ۵۰۰ نگرفتیم', not err5,
       f'HTTP={httpc} status={statuses} '
       f'msg={ {c: str(res[c][1].get("message"))[:70] for c in err5} }')
    ck(f'دورِ {rnd}: هر دو کد نتیجهٔ سالم گرفتند', good == 2,
       f'{good}/2 — {statuses}')

    # مهم‌ترین بررسی: اینونتوری باید **دقیقاً ۲** باشد.
    st, bs = req('GET', '/api/bootstrap', ut)
    inv = [x for x in (bs.get('inventory') or [])
           if str(x.get('name', '')).startswith(PFX)]
    qty = int(inv[0].get('quantity') or 0) if inv else 0
    ck(f'دورِ {rnd}: اینونتوری دقیقاً ۲ است', qty == 2,
       f'qty={qty} — نه {qty} (کدی گم یا دوبار حساب شده)')
    ck(f'دورِ {rnd}: فقط یک ردیفِ اینونتوری', len(inv) <= 1,
       f'{len(inv)} ردیف — ایندکسِ یکتا نقض شده؟')
    if inv:
        ck(f'دورِ {rnd}: تصویر خالی نیست', bool(inv[0].get('image_url')),
           str(inv[0].get('image_url')))

print(f'\n{"✗" if bad else "✓"} {ok} موفق، {bad} ناموفق\n')
sys.exit(1 if bad else 0)
