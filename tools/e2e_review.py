# -*- coding: utf-8 -*-
"""صفِ بررسیِ مدیر — تأیید و ردِ دستی، روی سرورِ زنده.

═══════════════════════════════════════════════════════════════════════════
چرا این مسیر تا امروز تست نشده بود
═══════════════════════════════════════════════════════════════════════════

وقتی موتور نمی‌تواند تصمیم بگیرد (عکسِ تار، کارتِ ناشناخته) پرونده به
`status='pending'` می‌رود و مدیر باید دستی تأیید یا رد کند:

    POST /admin/photo-cards/submissions/:id/decide

تست‌های موجود همه روی مسیرِ **خودکار** تمرکز دارند — یعنی حالتی که موتور
مطمئن است. ولی صفِ بررسی جایی است که:

  • امتیاز و پولِ واقعی واریز می‌شود (`creditSubmission`)
  • کدِ کاربر مصرف می‌شود — و اگر اشتباه شود، برگشت‌ناپذیر است
  • همان تراکنشی اجرا می‌شود که در مسیرِ خودکار، ولی با ورودیِ **مدیر**

⚠️ دقیقاً همان‌جایی که کمترین تست را دارد، بیشترین ریسکِ مالی است.

چهار چیزِ خطرناک که اینجا سنجیده می‌شود:

  ۱. تأییدِ **دوباره** یک پرونده نباید دو بار امتیاز بدهد
  ۲. ردِ پرونده نباید کد را بسوزاند (کاربر باید بتواند دوباره تلاش کند)
  ۳. پروندهٔ ردشده نباید بعداً قابل تأیید باشد
  ۴. شناسهٔ نامعتبر باید ۴۰۰ بدهد نه ۵۰۰

اجرا:
    python3 tools/e2e_review.py <رمزِ-مدیر>
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
B = '--rv'


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
        print('  ✗', n, '→', str(d)[:240])


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
    elif layout == 1:
        d.rectangle([30, 40, 250, 700], fill=fg)
        d.rectangle([60, 80, 220, 660], fill=bg)
        d.polygon([(300, 640), (500, 640), (400, 420)], fill=fg)
    else:
        for gx in range(2):
            for gy in range(3):
                if (gx + gy) % 2 == 0:
                    d.rectangle([40 + gx * 220, 50 + gy * 230,
                                 240 + gx * 220, 260 + gy * 230], fill=fg)
    d.text((90, 200), text, fill=fg)
    o = io.BytesIO()
    im.save(o, 'PNG')
    return o.getvalue()


def noise(seed):
    """تصویری که به هیچ طرحی شبیه نیست → پرونده به صفِ بررسی می‌رود."""
    im = Image.new('RGB', (400, 560), (30, 30, 30))
    d = ImageDraw.Draw(im)
    for i in range(60):
        v = (seed * 37 + i * 53) % 255
        d.rectangle([(i * 7) % 380, (i * 11) % 540,
                     ((i * 7) % 380) + 22, ((i * 11) % 540) + 22],
                    fill=(v, (v * 3) % 255, (v * 7) % 255))
    o = io.BytesIO()
    im.save(o, 'JPEG', quality=55)
    return o.getvalue()


def points_of(tok):
    _, b = req('GET', '/api/bootstrap', tok)
    return int((b.get('user') or {}).get('current_points') or 0)


def inv_qty(tok, pfx):
    _, b = req('GET', '/api/bootstrap', tok)
    rows = [x for x in (b.get('inventory') or [])
            if str(x.get('name', '')).startswith(pfx)]
    return sum(int(x.get('quantity') or 0) for x in rows)


apw = sys.argv[1] if len(sys.argv) > 1 else None
if not apw:
    raise SystemExit('استفاده: python3 tools/e2e_review.py <رمزِ-مدیر>')
at = admin_token(apw)
PFX = f'RV{int(time.time()) % 100000:05d}'
deactivate_stale_designs(req, at)
atexit.register(lambda: cleanup_own_run(req, at, PFX))

print('\n══ ۱. کارت و کدها ══')
NC = 6
st, rc = req('POST', '/api/admin/photo-cards/designs', at,
             {'name': f'{PFX}-بررسی', 'pointValue': '250',
              'rawCodes': '\n'.join(f'{PFX}-V{i:03d}' for i in range(1, NC + 1))},
             {'image': ('f.png', card('REV', (14, 40, 90), (250, 210, 90)),
                        'image/png')})
ck('کارت ساخته شد', st == 200, f'{st} {str(rc)[:140]}')
if st != 200:
    raise SystemExit('\n✗ آماده‌سازی شکست خورد.')

mob = f'09{int(time.time() * 7) % 1000000000:09d}'
st, ru = req('POST', '/api/auth/register-password', body={
    'mobile': mob, 'password': 'Qa!12345', 'firstName': 'تست',
    'lastName': 'بررسی', 'nickname': f'بررسی{PFX}'})
ck('کاربر ساخته شد', st == 200 and ru.get('token'), f'{st}')
ut = ru.get('token')
uid = (ru.get('user') or {}).get('id')
if uid:
    atexit.register(lambda: block_test_user('/home/user/tools/rx.py', uid))
if not ut:
    raise SystemExit('\n✗ بدونِ کاربر ادامه بی‌معنی است.')

print('\n══ ۲. عکسِ ناشناخته → صفِ بررسی ══')
st, s1 = req('POST', '/api/photo-cards/submit', ut, {'code': f'{PFX}-V001'},
             {'image': ('n.jpg', noise(1), 'image/jpeg')})
ck('پذیرفته شد ولی تأیید نشد', st == 200 and s1.get('status') == 'pending',
   f"{st} {s1.get('status')} — {str(s1.get('message'))[:80]}")
p_before = points_of(ut)
ck('هنوز امتیازی داده نشده', p_before == 0, f'{p_before}')

print('\n══ ۳. پرونده در صفِ مدیر دیده می‌شود ══')
st, q = req('GET', '/api/admin/photo-cards/submissions?status=pending', at)
ck('صف خوانده شد', st == 200, f'{st}')
mine = [x for x in (q.get('submissions') or [])
        if str(x.get('code') or '').startswith(PFX)]
ck('پروندهٔ ما در صف است', len(mine) >= 1, f'{len(mine)} پرونده')
sub_id = mine[0]['id'] if mine else None

print('\n══ ۴. مدیر تأیید می‌کند → امتیاز واریز می‌شود ══')
design_id = (rc.get('designs') or [{}])[0].get('id')
st, dres = req('POST', f'/api/admin/photo-cards/submissions/{sub_id}/decide',
               at, {'approve': True, 'designId': design_id})
ck('تأیید پذیرفته شد', st == 200, f'{st} {str(dres)[:150]}')
time.sleep(1)
p_after = points_of(ut)
ck(f'امتیاز واریز شد ({p_before} → {p_after})', p_after == 250,
   f'انتظار ۲۵۰، شد {p_after}')
ck('کارت به اینونتوری رفت', inv_qty(ut, PFX) == 1, str(inv_qty(ut, PFX)))

print('\n══ ۵. ⚠️ تأییدِ دوباره نباید امتیازِ دوم بدهد ══')
# اگر مدیر دوبار روی دکمه بزند یا دو مدیر هم‌زمان تأیید کنند.
st, d2 = req('POST', f'/api/admin/photo-cards/submissions/{sub_id}/decide',
             at, {'approve': True, 'designId': design_id})
ck('تأییدِ دوم رد شد', st == 409, f'{st} {str(d2.get("message"))[:110]}')
time.sleep(1)
p3 = points_of(ut)
ck(f'امتیاز دوبرابر نشد (هنوز {p3})', p3 == 250, f'{p3} — امتیاز از هوا آمد!')
ck('اینونتوری هم دوبرابر نشد', inv_qty(ut, PFX) == 1, str(inv_qty(ut, PFX)))

print('\n══ ۶. ردِ پرونده نباید کد را بسوزاند ══')
st, s2 = req('POST', '/api/photo-cards/submit', ut, {'code': f'{PFX}-V002'},
             {'image': ('n.jpg', noise(2), 'image/jpeg')})
ck('پروندهٔ دوم به صف رفت', s2.get('status') == 'pending',
   f"{s2.get('status')}")
st, q2 = req('GET', '/api/admin/photo-cards/submissions?status=pending', at)
m2 = [x for x in (q2.get('submissions') or [])
      if str(x.get('code') or '') == f'{PFX}-V002']
sub2 = m2[0]['id'] if m2 else None
ck('در صف پیدا شد', bool(sub2), 'پرونده در صف نیست')

if sub2:
    st, dr = req('POST', f'/api/admin/photo-cards/submissions/{sub2}/decide',
                 at, {'approve': False, 'rejectReason': 'عکس ناخواناست'})
    ck('رد پذیرفته شد', st == 200, f'{st} {str(dr)[:120]}')
    time.sleep(1)
    ck('امتیازی اضافه نشد', points_of(ut) == 250, str(points_of(ut)))

    # ── مهم: کد باید دوباره قابل استفاده باشد ──
    #
    # اگر ردِ مدیر کد را بسوزاند، کاربری که عکسِ بدی فرستاده کارتِ
    # فیزیکی‌اش را برای همیشه از دست می‌دهد — با اینکه تقصیری نداشته.
    st, s3 = req('POST', '/api/photo-cards/submit', ut,
                 {'code': f'{PFX}-V002'},
                 {'image': ('f.png',
                            card('REV', (14, 40, 90), (250, 210, 90)),
                            'image/png')})
    ck('کدِ ردشده دوباره قابل استفاده است',
       s3.get('status') in ('approved', 'pending'),
       f"{st} {s3.get('status')} — {str(s3.get('message'))[:90]}")

print('\n══ ۷. پروندهٔ ردشده بعداً قابلِ تأیید نیست ══')
if sub2:
    st, d3 = req('POST', f'/api/admin/photo-cards/submissions/{sub2}/decide',
                 at, {'approve': True, 'designId': design_id})
    ck('تأییدِ پروندهٔ ردشده رد شد', st == 409, f'{st}')

print('\n══ ۸. ورودیِ نامعتبر ۴۰۰ می‌دهد نه ۵۰۰ ══')
for bad_id, label in [('not-a-uuid', 'شناسهٔ بی‌ریخت'),
                      ('00000000-0000-0000-0000-000000000000', 'شناسهٔ ناموجود')]:
    st, _ = req('POST', f'/api/admin/photo-cards/submissions/{bad_id}/decide',
                at, {'approve': True})
    ck(f'{label} → {st}', st in (400, 404), f'{st} — نباید ۵۰۰ باشد')

print('\n══ ۹. کاربرِ عادی نمی‌تواند تصمیم بگیرد ══')
if sub_id:
    st, _ = req('POST',
                f'/api/admin/photo-cards/submissions/{sub_id}/decide',
                ut, {'approve': True})
    ck(f'کاربرِ عادی رد شد → {st}', st in (401, 403),
       f'⚠️ کاربرِ عادی می‌تواند کارتِ خودش را تأیید کند! ({st})')

print(f'\n{"✗" if bad else "✓"} {ok} موفق، {bad} ناموفق\n')
sys.exit(1 if bad else 0)
