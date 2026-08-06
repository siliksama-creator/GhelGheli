# -*- coding: utf-8 -*-
"""چند نسخه از یک کارت: یک عکس، چند کد، چند کارت در اینونتوری.

═══════════════════════════════════════════════════════════════════════════
این تست چه چیزی را می‌سنجد و چرا لازم شد
═══════════════════════════════════════════════════════════════════════════

سیستم تا دیروز یک گاردِ «عکسِ تکراری» داشت که اگر کاربر **همان عکس** را
دوباره می‌فرستاد، درخواست را با ۴۰۹ رد می‌کرد. آن گارد روی یک فرضِ غلط
بنا شده بود:

    «یک عکس = یک کارتِ فیزیکی، پس دو ثبت با یک عکس یعنی تقلب.»

واقعیت این است که کارت‌ها **سری‌ای** چاپ می‌شوند. کاربری که ده نسخه از
کارتِ «محمد صلاح» دارد، ده کارتِ فیزیکیِ کاملاً یکسان در دست دارد که فقط
کدِ پشت‌شان فرق می‌کند. عکسِ هر ده تا از نظر موتورِ تطبیق صد در صد یکسان
است — چون واقعاً هستند.

خواستهٔ صریح مالک:

    «مثلا کاربر ۱۰ تا از یک عکس با ۱۰ تا کد مختلف داره ولی دیگه هر بار
     نمیاد عکس جدید بگیره. مهم اینه که کدش اصالت داشته باشه … اصلا هیچ
     محدودیتی تعداد تکراری عکس نباید وجود داشته باشه.»

پس این تست دو چیزِ متضاد را هم‌زمان تضمین می‌کند:

  ✅ تکرارِ عکس **کاملاً آزاد** است — ده ثبت با یک عکس باید ده کارت بدهد
  ✅ تکرارِ **کد** همچنان ممنوع است — همان کد بارِ دوم ۴۰۹ می‌گیرد

اگر روزی کسی گاردِ عکس را برگرداند «تا امن‌تر شود»، بخشِ اول قرمز می‌شود.
اگر کسی برای راحتیِ کاربر یکتاییِ کد را شل کند، بخشِ دوم قرمز می‌شود.
"""
import atexit
import colorsys
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
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter  # noqa: E402

API = 'https://api.ghelghelishop.ir'
B = '--mx'


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
        print('  ✗', n, '→', str(d)[:200])


apw = sys.argv[1]
at = admin_token(apw)

# ── جداسازیِ اجرا ──
# کاربرِ تازه در هر اجرا: سهمیهٔ نرخ (۲۰ ثبت در ساعت) و شمارندهٔ قفلِ
# ۳ ساعته هر دو per-user هستند. استفادهٔ دوباره از یک کاربر یعنی اجرای
# دوم فقط ۴۲۹ می‌بیند و بی‌صدا هیچ چیزی را نمی‌سنجد.
PFX = f'MX{int(time.time()) % 100000:05d}'
UMOB = f'0900{int(time.time()) % 1000000:06d}'
st, ru = req('POST', '/api/auth/register-password', body={
    'mobile': UMOB, 'password': 'Qa!12345', 'firstName': 'تست',
    'lastName': 'چندنسخه', 'nickname': f'چندنسخه{PFX}'})
if st == 200 and ru.get('token'):
    ut = ru['token']
    _UID = (ru.get('user') or {}).get('id')
else:
    raise SystemExit(f'✗ ساخت کاربرِ تست نشد: {st} {ru}')

deactivate_stale_designs(req, at)
# ⚠️ atexit و نه خطِ ساده در انتها: این فایل با sys.exit تمام می‌شود و
#    هر کدی بعد از آن مرده است. این اشتباه قبلاً واقعاً رخ داد.
atexit.register(lambda: cleanup_own_run(req, at, PFX))
atexit.register(lambda: _UID and block_test_user('/home/user/tools/rx.py', _UID))


def card(hue):
    im = Image.new('RGB', (420, 640))
    d = ImageDraw.Draw(im)
    for y in range(640):
        f = y / 640
        rr, gg, bb = colorsys.hsv_to_rgb(((hue + f * 45) % 360) / 360, 0.78, 0.30 + 0.45 * f)
        d.line([(0, y), (420, y)], fill=(int(rr * 255), int(gg * 255), int(bb * 255)))
    for k in range(-640, 1060, 13):
        d.line([(k, 0), (k + 640, 640)],
               fill=(int((hue * 3 + k) % 255), int((k * 7) % 255), int((hue + k * 2) % 255)),
               width=3)
    d.ellipse([95, 190, 325, 425], fill=(70, 225, 180))
    d.rectangle([0, 545, 420, 640], fill=(14, 14, 24))
    b = io.BytesIO()
    im.save(b, 'PNG')
    return b.getvalue(), im


def photo(im):
    """عکسِ «واقع‌گرایانه» از کارت: کمی چرخیده، کمی تار، فشرده."""
    o = im.rotate(5, expand=True, fillcolor=(28, 28, 34))
    o = o.resize((int(o.width * 0.45), int(o.height * 0.45)), Image.LANCZOS)
    o = o.filter(ImageFilter.GaussianBlur(0.6))
    o = ImageEnhance.Brightness(o).enhance(1.05)
    b = io.BytesIO()
    o.save(b, 'JPEG', quality=72)
    return b.getvalue()


def blurry(im):
    """عکسِ بد: تار، کج، کم‌کیفیت — باید به صف بررسی برود."""
    o = im.rotate(14, expand=True, fillcolor=(28, 28, 34))
    o = o.resize((int(o.width * 0.13), int(o.height * 0.13)), Image.LANCZOS)
    o = o.filter(ImageFilter.GaussianBlur(3.4))
    o = ImageEnhance.Brightness(o).enhance(1.5)
    b = io.BytesIO()
    o.save(b, 'JPEG', quality=30)
    return b.getvalue()


png, im = card(210)
N = 6   # شش نسخه از یک کارت — کمتر از سقفِ ۲۰ ثبت در ساعت

print('\n══ آماده‌سازی: یک کارت با شش کدِ اختصاصی ══')
st, rd = req('POST', '/api/admin/photo-cards/designs', at,
             {'name': f'{PFX}-صلاح', 'pointValue': '80'},
             {'image': ('a.png', png, 'image/png')})
ck('طرح ساخته شد', st == 200 and rd.get('design'), f'{st} {rd}')
# ⚠️ پاسخِ ساختِ طرح `cardTypeId` را در **ریشه** برمی‌گرداند، نه داخل
# `design`. تلاشِ اول `design.card_type_id` را خواند، `None` گرفت، و
# چون سرور `cardTypeId`ِ خالی را «کدِ بی‌نام» تفسیر می‌کند، تست بی‌صدا
# مسیرِ اشتباه را سنجید و **سبز شد**. بدترین نوعِ تست: آن که موفق
# می‌شود بدونِ اینکه چیزی را که ادعا می‌کند بسنجد.
TYPE_ID = rd.get('cardTypeId') or (rd.get('design') or {}).get('card_type_id')
if not TYPE_ID:
    raise SystemExit(f'✗ شناسهٔ نوعِ کارت از پاسخ خوانده نشد: {rd}')

codes = [f'{PFX}-{i:04d}' for i in range(1, N + 1)]
st, rc = req('POST', '/api/admin/photo-cards/codes', at,
             {'rawCodes': '\n'.join(codes),
              'cardTypeId': TYPE_ID,
              'batchLabel': f'سریِ {PFX}'})
ck(f'{N} کدِ نام‌دار ثبت شد', st == 200 and rc.get('insertedCount') == N,
   f"{st} ins={rc.get('insertedCount')}")

print(f'\n══ ۱. همان عکس، {N} کدِ متفاوت، پشت‌سرهم ══')
print('   (کاربر یک بار عکس گرفته و شش کد را وارد می‌کند)')
img = photo(im)
approved = pending = rejected = 0
for c in codes:
    st, r = req('POST', '/api/photo-cards/submit', ut, {'code': c},
                {'image': ('x.jpg', img, 'image/jpeg')})
    stt = r.get('status')
    print(f'   {c}: {st} {stt}'
          + (f" score={r.get('matchScore')}" if r.get('matchScore') is not None else '')
          + ('' if st < 400 else f" — {str(r.get('message'))[:70]}"))
    if stt == 'approved':
        approved += 1
    elif stt == 'pending':
        pending += 1
    else:
        rejected += 1

ck(f'هیچ ثبتی به‌خاطرِ «عکسِ تکراری» رد نشد ({rejected} رد)', rejected == 0,
   f'{rejected} رد شد — گاردِ حذف‌شده برگشته؟')
ck(f'هر {N} کد پذیرفته شد (تأیید یا بررسی)', approved + pending == N,
   f'تأیید={approved} بررسی={pending} رد={rejected}')

print('\n══ ۲. اینونتوری: تعداد باید برابرِ تأییدشده‌ها باشد ══')
# ⚠️ مسیر `/api/profile` است نه `/api/cards/inventory`.
# تلاشِ اول مسیرِ دومی را زد و ۴۰۴ گرفت — که به‌شکلِ «صفر کارت در
# اینونتوری» ظاهر شد و دقیقاً شبیهِ باگِ محصول به نظر می‌رسید. یعنی
# تستِ اشتباه، خودش یک هشدارِ دروغینِ قانع‌کننده تولید کرد.
def inventory(tok, pfx):
    st, d = req('GET', '/api/profile', tok)
    if st != 200:
        raise SystemExit(f'✗ /api/profile پاسخ نداد: {st} {d}')
    rows = [i for i in d.get('inventory', [])
            if str(i.get('name', '')).startswith(pfx)]
    return rows, sum(int(i.get('quantity') or 0) for i in rows)


mine, qty = inventory(ut, PFX)
ck('کارت در اینونتوری هست', len(mine) >= 1, f'{len(mine)} ردیف')
ck(f'تعداد = {approved} (برابرِ ثبت‌های تأییدشده)', qty == approved,
   f'quantity={qty} approved={approved}')
ck('همه در **یک ردیف** جمع شده‌اند، نه چند ردیفِ جدا', len(mine) <= 1,
   f'{len(mine)} ردیف برای یک نوعِ کارت')

print('\n══ ۳. ولی همان **کد** بارِ دوم رد می‌شود ══')
st, r = req('POST', '/api/photo-cards/submit', ut, {'code': codes[0]},
            {'image': ('x.jpg', img, 'image/jpeg')})
ck('کدِ مصرف‌شده ۴۰۹ می‌گیرد', st == 409, f'{st} {r.get("status")} {r.get("message","")[:80]}')
ck('پیامش «قبلاً استفاده شده» است', 'استفاده شده' in str(r.get('message', '')),
   str(r.get('message'))[:100])
mine2, qty2 = inventory(ut, PFX)
ck('اینونتوری بعد از تلاشِ ناموفق تغییر نکرد', qty2 == qty, f'{qty} → {qty2}')

print('\n══ ۴. کدِ ناموجود هم رد می‌شود (اصالت تنها معیار است) ══')
st, r = req('POST', '/api/photo-cards/submit', ut, {'code': f'{PFX}-9999'},
            {'image': ('x.jpg', img, 'image/jpeg')})
ck('کدِ جعلی ۴۰۴ می‌گیرد', st == 404 and r.get('status') == 'bad_code',
   f'{st} {r.get("status")}')
ck('شمارندهٔ تلاش برگشت داده می‌شود', r.get('triesLeft') is not None,
   str(r)[:100])

print('\n══ ۵. هم‌زمانی: چهار درخواست با یک عکس و چهار کدِ تازه ══')
print('   (قفلِ مشورتی حذف شد؛ باید هر چهار موفق شوند)')
codes2 = [f'{PFX}-R{i:03d}' for i in range(1, 5)]
st, rc2 = req('POST', '/api/admin/photo-cards/codes', at,
              {'rawCodes': '\n'.join(codes2), 'cardTypeId': TYPE_ID})
res = []
lock = threading.Lock()


def fire(code):
    r = req('POST', '/api/photo-cards/submit', ut, {'code': code},
            {'image': ('y.jpg', img, 'image/jpeg')})
    with lock:
        res.append((code,) + r)


ts = [threading.Thread(target=fire, args=(c,)) for c in codes2]
[t.start() for t in ts]
[t.join() for t in ts]
gran = 0
for c, s_, r in sorted(res):
    print(f'   {c}: {s_} {r.get("status")}')
    if r.get('status') in ('approved', 'pending'):
        gran += 1
ck('هر ۴ درخواستِ هم‌زمان پذیرفته شدند', gran == 4,
   f'{gran} از ۴ — قفلِ حذف‌شده برگشته؟')

mine3, qty3 = inventory(ut, PFX)
appr2 = sum(1 for _c, _s, r in res if r.get('status') == 'approved')
ck(f'اینونتوری از {qty} به {qty + appr2} رسید', qty3 == qty + appr2,
   f'انتظار={qty + appr2} واقعی={qty3}')
ck('باز هم یک ردیف، فقط quantity بالاتر', len(mine3) <= 1, f'{len(mine3)} ردیف')

print('\n══ ۶. عکسِ بد + کدِ نام‌دار → همچنان تأیید (آستانهٔ ۲۰٪) ══')
st, rc3 = req('POST', '/api/admin/photo-cards/codes', at,
              {'rawCodes': f'{PFX}-BLUR1', 'cardTypeId': TYPE_ID})
st, r = req('POST', '/api/photo-cards/submit', ut, {'code': f'{PFX}-BLUR1'},
            {'image': ('bl.jpg', blurry(im), 'image/jpeg')})
ck('عکسِ تارِ همان کارت با کدِ نام‌دار پذیرفته شد',
   r.get('status') in ('approved', 'pending'), f'{st} {r.get("status")}')

print(f'\n{"─" * 60}')
print(f'✓ {ok} موفق، ✗ {bad} ناموفق')
if bad:
    sys.exit(1)
