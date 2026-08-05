# -*- coding: utf-8 -*-
"""ادغامِ «کدِ نام‌دار» و «کدِ بی‌نام» — روی سرورِ زنده.

═══════════════════════════════════════════════════════════════════════════
چه چیزی سنجیده می‌شود
═══════════════════════════════════════════════════════════════════════════

خواستهٔ مالک سه شاخه دارد و هر سه باید هم‌زمان درست کار کنند:

  ۱. کدِ گره‌خورده + عکسِ خیلی بد (ولی کارت) → تأیید خودکار
  ۲. کدِ بی‌نام + تشخیصِ قاطع → تأیید خودکار (رفتارِ قدیمی)
  ۳. کدِ درست + عکسِ نامفهوم → صف بررسی

تستِ واحد (`testDecision.js`) منطق را می‌سنجد. این فایل چیزِ دیگری را
می‌سنجد: آیا آن منطق واقعاً از HTTP تا دیتابیس **وصل** است؟ ستون
اضافه شده؟ اینونتوری پر می‌شود؟ کد مصرف می‌شود؟

این دو با هم فرق دارند: منطق می‌تواند بی‌نقص باشد و مسیرِ HTTP
`expectedTypeId` را اصلاً پاس ندهد.

استفاده: python3 e2e_bound.py <admin-password>
"""
import colorsys
import io
import json
import os
import sys
import time
import urllib.error
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _authcache import (admin_token, block_test_user,  # noqa: E402
                        deactivate_stale_designs)

from PIL import Image, ImageDraw, ImageFilter  # noqa: E402

API = 'https://api.ghelghelishop.ir'
B = '----bound'


def req(m, p, tok=None, body=None, files=None):
    h = {}
    if tok:
        h['Authorization'] = 'Bearer ' + tok
    d = None
    if files is not None:
        buf = io.BytesIO()
        for k, v in (body or {}).items():
            buf.write(f'--{B}\r\nContent-Disposition: form-data; '
                      f'name="{k}"\r\n\r\n{v}\r\n'.encode())
        for k, (fn, c, ct) in files.items():
            buf.write(f'--{B}\r\nContent-Disposition: form-data; name="{k}"; '
                      f'filename="{fn}"\r\nContent-Type: {ct}\r\n\r\n'.encode())
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
        with urllib.request.urlopen(r, timeout=120) as x:
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
        print('  ✗', n, '→', str(d)[:180])


def card(hue, seed=1):
    """کارتِ مصنوعی با الگوی یکتا."""
    im = Image.new('RGB', (420, 640))
    d = ImageDraw.Draw(im)
    for y in range(640):
        f = y / 640
        rr, gg, bb = colorsys.hsv_to_rgb(((hue + f * 45) % 360) / 360, 0.78,
                                         0.30 + 0.45 * f)
        d.line([(0, y), (420, y)],
               fill=(int(rr * 255), int(gg * 255), int(bb * 255)))
    for k in range(-640, 1060, 11 + seed):
        d.line([(k, 0), (k + 640, 640)],
               fill=(int((hue * 3 + k) % 255), int((k * 7) % 255),
                     int((hue + k * 2) % 255)), width=3)
    d.ellipse([95, 190, 325, 425], fill=(70, 225, 180))
    d.rectangle([0, 545, 420, 640], fill=(14, 14, 24))
    b = io.BytesIO()
    im.save(b, 'PNG')
    return b.getvalue(), im


def good_shot(im, q=72):
    """عکسِ قابل‌قبول از کارت."""
    o = im.rotate(4, expand=True, fillcolor=(28, 28, 34))
    o = o.resize((int(o.width * .55), int(o.height * .55)), Image.LANCZOS)
    o = o.filter(ImageFilter.GaussianBlur(0.5))
    b = io.BytesIO()
    o.save(b, 'JPEG', quality=q)
    return b.getvalue()


def awful_shot(im):
    """عکسِ فاجعه: کج، تار، تاریک، ریز — ولی هنوز همان کارت.

    این دقیقاً همان چیزی است که مالک توصیف کرد: «عکس فقط ۲۰٪ هم به عکس
    مرجع شباهت داشت».
    """
    o = im.rotate(19, expand=True, fillcolor=(20, 20, 26))
    o = o.resize((int(o.width * .10), int(o.height * .10)), Image.LANCZOS)
    o = o.filter(ImageFilter.GaussianBlur(3.6))
    b = io.BytesIO()
    o.save(b, 'JPEG', quality=22)
    return b.getvalue()


def noise_shot():
    """چیزی که اصلاً کارت نیست."""
    im = Image.new('RGB', (300, 300), (240, 238, 235))
    d = ImageDraw.Draw(im)
    for i in range(0, 300, 20):
        d.line([(0, i), (300, i)], fill=(225, 222, 220), width=6)
    b = io.BytesIO()
    im.save(b, 'JPEG', quality=60)
    return b.getvalue()


apw = sys.argv[1]
at = admin_token(apw)
PFX = f'BD{int(time.time()) % 100000:05d}'

mob = f'0900{int(time.time()) % 1000000:06d}'
st, ru = req('POST', '/api/auth/register-password', body={
    'mobile': mob, 'password': 'Qa!12345', 'firstName': 'تست',
    'lastName': 'گره', 'nickname': f'گره{PFX}'})
if st != 200 or not ru.get('token'):
    raise SystemExit(f'✗ ساخت کاربر ناموفق: {st} {ru}')
ut = ru['token']
_, _b0 = req('GET', '/api/bootstrap', ut)
_TEST_UID = (_b0.get('user') or {}).get('id')

import atexit as _atexit  # noqa: E402
_atexit.register(
    lambda: _TEST_UID and block_test_user('/home/user/tools/rx.py', _TEST_UID))

print(f'کاربر تست: {mob}\n')
deactivate_stale_designs(req, at)

# ═══════════════════════════════════════════════════════════════════════
print('══ آماده‌سازی: دو طرح و یک نوعِ کارتِ بدونِ طرح ══')
# ═══════════════════════════════════════════════════════════════════════
pngA, imA = card(205, 1)
pngB, imB = card(35, 5)
st, rA = req('POST', '/api/admin/photo-cards/designs', at,
             {'name': f'{PFX}-آبی', 'pointValue': '120'},
             {'image': ('a.png', pngA, 'image/png')})
ck('طرح آبی ثبت شد', st == 200, f'{st} {rA}')
typeA = rA.get('cardTypeId')

st, rB = req('POST', '/api/admin/photo-cards/designs', at,
             {'name': f'{PFX}-نارنجی', 'pointValue': '340'},
             {'image': ('b.png', pngB, 'image/png')})
ck('طرح نارنجی ثبت شد', st == 200, f'{st} {rB}')
typeB = rB.get('cardTypeId')

# نوعِ کارتی که **هیچ طرحِ تصویری ندارد** — سناریوی «مدیر هنوز عکس
# مرجع را آپلود نکرده ولی کدها را می‌داند».
st, rC = req('POST', '/api/admin/card-types', at,
             {'name': f'{PFX}-بی‌عکس', 'pointValue': 90, 'cashAmount': 0})
typeC = (rC.get('cardType') or rC).get('id') if st == 200 else None
ck('نوع کارتِ بدونِ طرح ساخته شد', bool(typeC), f'{st} {rC}')

# ═══════════════════════════════════════════════════════════════════════
print('\n══ ۱: کدِ گره‌خورده + عکسِ فاجعه → تأیید خودکار ══')
# ═══════════════════════════════════════════════════════════════════════
codes_bound = [f'{PFX}-B{i:03d}' for i in range(1, 6)]
st, r = req('POST', '/api/admin/photo-cards/codes', at,
            {'rawCodes': '\n'.join(codes_bound), 'cardTypeId': typeA,
             'batchLabel': f'{PFX}-bound'})
ck('۵ کد با نوعِ کارتِ مشخص ثبت شد', st == 200 and r.get('insertedCount') == 5,
   f'{st} {r.get("insertedCount")} {r.get("message")}')
ck('پاسخ نوعِ گره‌خورده را برمی‌گرداند', r.get('expectedCardTypeId') == typeA)

st, r = req('POST', '/api/photo-cards/submit', ut, {'code': codes_bound[0]},
            {'image': ('x.jpg', awful_shot(imA), 'image/jpeg')})
ck('عکسِ فاجعه با کدِ گره‌خورده تأیید شد', st == 200
   and r.get('status') == 'approved', f'{st} {r.get("status")} {r.get("message","")[:80]}')
ck('امتیازِ همان کارت داده شد (۱۲۰)', r.get('addedPoints') == 120,
   r.get('addedPoints'))
print(f'   نمرهٔ تطبیق: {r.get("matchScore")}')

# ═══════════════════════════════════════════════════════════════════════
print('\n══ ۲: کدِ گره‌خورده به کارتی که هیچ طرحی ندارد ══')
# ═══════════════════════════════════════════════════════════════════════
codes_noimg = [f'{PFX}-N{i:03d}' for i in range(1, 4)]
st, r = req('POST', '/api/admin/photo-cards/codes', at,
            {'rawCodes': '\n'.join(codes_noimg), 'cardTypeId': typeC,
             'batchLabel': f'{PFX}-noimg'})
ck('کدها به کارتِ بدونِ طرح گره خوردند', st == 200 and r.get('insertedCount') == 3,
   f'{st} {r}')

st, r = req('POST', '/api/photo-cards/submit', ut, {'code': codes_noimg[0]},
            {'image': ('y.jpg', good_shot(imA), 'image/jpeg')})
ck('تأیید شد با اینکه طرحی برای مقایسه نبود',
   st == 200 and r.get('status') == 'approved',
   f'{st} {r.get("status")} {r.get("message","")[:80]}')
ck('امتیازِ کارتِ بی‌عکس (۹۰)', r.get('addedPoints') == 90, r.get('addedPoints'))

# ═══════════════════════════════════════════════════════════════════════
print('\n══ ۳: کدِ بی‌نام — رفتارِ قدیمی دست‌نخورده ══')
# ═══════════════════════════════════════════════════════════════════════
codes_free = [f'{PFX}-F{i:03d}' for i in range(1, 6)]
st, r = req('POST', '/api/admin/photo-cards/codes', at,
            {'rawCodes': '\n'.join(codes_free), 'batchLabel': f'{PFX}-free'})
ck('کدهای بی‌نام ثبت شدند', st == 200 and r.get('insertedCount') == 5, st)
ck('و به هیچ کارتی گره نخوردند', r.get('expectedCardTypeId') is None)

st, r = req('POST', '/api/photo-cards/submit', ut, {'code': codes_free[0]},
            {'image': ('z.jpg', good_shot(imB), 'image/jpeg')})
ck('عکسِ خوب + کدِ بی‌نام → تأیید خودکار',
   st == 200 and r.get('status') == 'approved', f'{st} {r.get("status")}')
ck('کارتِ درست تشخیص داده شد', r.get('cardType') == f'{PFX}-نارنجی',
   r.get('cardType'))

# مهم‌ترین رگرسیون: عکسِ فاجعه با کدِ **بی‌نام** نباید تأیید شود.
st, r = req('POST', '/api/photo-cards/submit', ut, {'code': codes_free[1]},
            {'image': ('w.jpg', awful_shot(imA), 'image/jpeg')})
ck('عکسِ فاجعه با کدِ بی‌نام → صف بررسی (نه تأیید)',
   st == 200 and r.get('status') == 'pending',
   f'{st} {r.get("status")} — آستانهٔ نرم نباید به این مسیر نشت کند')

# ═══════════════════════════════════════════════════════════════════════
print('\n══ ۴: عکسِ نامفهوم حتی با کدِ گره‌خورده → بررسی ══')
# ═══════════════════════════════════════════════════════════════════════
st, r = req('POST', '/api/photo-cards/submit', ut, {'code': codes_bound[1]},
            {'image': ('n.jpg', noise_shot(), 'image/jpeg')})
ck('عکسی که اصلاً کارت نیست تأیید نمی‌شود', r.get('status') != 'approved',
   f'{st} {r.get("status")} {r.get("message","")[:70]}')

# ═══════════════════════════════════════════════════════════════════════
print('\n══ ۵: تناقضِ کد و عکس ══')
# ═══════════════════════════════════════════════════════════════════════
# کد مالِ کارتِ آبی است، ولی عکسِ کارتِ نارنجی فرستاده می‌شود.
st, r = req('POST', '/api/photo-cards/submit', ut, {'code': codes_bound[2]},
            {'image': ('m.jpg', good_shot(imB), 'image/jpeg')})
ck('عکسِ کارتِ دیگر → تأیید نمی‌شود', r.get('status') != 'approved',
   f'{st} {r.get("status")}')
ck('و علتش به کاربر گفته می‌شود',
   'هم‌خوانی' in str(r.get('message', '')) or r.get('reason') == 'type_mismatch',
   f'{r.get("reason")} | {str(r.get("message",""))[:90]}')

# ═══════════════════════════════════════════════════════════════════════
print('\n══ ۶: تخصیصِ گروهیِ نوع به کدهای موجود ══')
# ═══════════════════════════════════════════════════════════════════════
st, r = req('POST', '/api/admin/photo-cards/codes/assign-type', at,
            {'batchLabel': f'{PFX}-free', 'cardTypeId': typeB})
ck('تخصیصِ گروهی کار می‌کند', st == 200 and r.get('updated', 0) >= 1,
   f'{st} {r}')
ck('کدهای مصرف‌شده دست نخوردند', r.get('skipped', 0) >= 1, r.get('skipped'))

# حالا کدی که قبلاً بی‌نام بود باید نام‌دار شده باشد.
st, r = req('POST', '/api/photo-cards/submit', ut, {'code': codes_free[2]},
            {'image': ('q.jpg', awful_shot(imB), 'image/jpeg')})
ck('کدِ تازه‌گره‌خورده حالا با عکسِ بد هم تأیید می‌شود',
   st == 200 and r.get('status') == 'approved', f'{st} {r.get("status")}')

st, r = req('POST', '/api/admin/photo-cards/codes/assign-type', at,
            {'batchLabel': f'{PFX}-free'})
ck('بازکردنِ گره هم ممکن است', st == 200, f'{st} {r.get("message")}')

st, r = req('POST', '/api/admin/photo-cards/codes/assign-type', at,
            {'cardTypeId': typeB})
ck('بدونِ برچسب رد می‌شود', st == 400, st)

# ═══════════════════════════════════════════════════════════════════════
print('\n══ ۷: اعتبارسنجیِ سمتِ مدیر ══')
# ═══════════════════════════════════════════════════════════════════════
st, r = req('POST', '/api/admin/photo-cards/codes', at,
            {'rawCodes': f'{PFX}-BAD1', 'cardTypeId': 'not-a-uuid'})
ck('شناسهٔ نامعتبر رد می‌شود', st == 400, st)

# UUID معتبرِ v4 ولی ناموجود. نسخهٔ اول از UUID تماماً صفر استفاده
# می‌کرد که `validateUuid` معتبر نمی‌شمارد، پس ۴۰۰ می‌گرفت نه ۴۰۴ —
# تست چیزی را می‌سنجید که فکر می‌کرد نمی‌سنجد.
st, r = req('POST', '/api/admin/photo-cards/codes', at,
            {'rawCodes': f'{PFX}-BAD2',
             'cardTypeId': 'd3f4a1b2-5c6d-4e7f-8a9b-0c1d2e3f4a5b'})
ck('نوعِ کارتِ ناموجود رد می‌شود', st == 404, f'{st} {r.get("message")}')

# ═══════════════════════════════════════════════════════════════════════
print('\n══ ۸: اینونتوری و مصرفِ کد ══')
# ═══════════════════════════════════════════════════════════════════════
_, b = req('GET', '/api/bootstrap', ut)
inv = b.get('inventory', [])
names = [i.get('name') for i in inv]
ck('کارتِ گره‌خورده در اینونتوری هست', f'{PFX}-آبی' in names, names)
ck('کارتِ بدونِ طرح هم در اینونتوری هست', f'{PFX}-بی‌عکس' in names, names)

st, cl = req('GET', f'/api/admin/photo-cards/codes?q={PFX}-B001', at)
row = [c for c in cl.get('codes', []) if str(c['code']) == f'{PFX}-B001']
ck('کد مصرف شد', row and row[0]['status'] == 'used',
   row[0]['status'] if row else '—')
ck('فهرست نوعِ گره‌خورده را نشان می‌دهد',
   row and row[0].get('expected_card_type_name') == f'{PFX}-آبی',
   row[0].get('expected_card_type_name') if row else '—')

print(f'\n{"✓" if bad == 0 else "✗"} {ok} موفق، {bad} ناموفق')
sys.exit(0 if bad == 0 else 1)
