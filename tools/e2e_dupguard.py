# -*- coding: utf-8 -*-
"""گاردِ «طرحِ تکراری» — روی سرورِ زنده.

═══════════════════════════════════════════════════════════════════════════
چرا این تست ساخته شد
═══════════════════════════════════════════════════════════════════════════

`e2e_photocards.py` (که حالا بازنشسته شده) ادعا کرد گاردِ تکراری خراب
است: طرحِ یکسان را با ۲۰۰ پذیرفت به‌جای ۴۰۹.

آن ادعا **غلط** بود. مستقیم آزموده شد و سرور ۴۰۹ داد با
`similarity = 1.0`. علتِ قرمزیِ آن تست، تصویرِ گرادیانیِ ساختگی‌اش بود
که بعد از بهبودهای موتور دیگر با خودش ۹۳٪ شباهت نمی‌گرفت.

ولی آن اثبات جایی ثبت نشده بود — و اثباتی که ثبت نشود، گم می‌شود. این
فایل همان آزمایش را دائمی می‌کند.

═══════════════════════════════════════════════════════════════════════════
چرا این گارد اهمیت دارد
═══════════════════════════════════════════════════════════════════════════

اگر دو طرحِ تقریباً یکسان در کاتالوگ باشند، موتور نمی‌تواند بینشان
تشخیص بدهد و **همهٔ** ثبت‌های آن کارت به صفِ بررسیِ دستی می‌روند. یعنی
یک اشتباهِ آپلود، کلِ جریانِ خودکار را برای آن کارت خاموش می‌کند و مدیر
تا وقتی صف را نبیند متوجه نمی‌شود.

⚠️ درسِ تکرارشده: این گارد یک بار **خودش خراب بود** و کسی نفهمید —
   `releaseGuard is not defined` باعث می‌شد به‌جای ۴۰۹ راهنما، خطای
   ۵۰۰ با متنِ انگلیسی بدهد. مدیر فکر می‌کرد سرور خراب است.

سه چیز سنجیده می‌شود:

  ۱. فایلِ کاملاً یکسان → ۴۰۹ با پیامِ فارسیِ راهنما
  ۲. تصویرِ **متفاوت** → ۲۰۰ (گارد نباید بیش از حد سخت‌گیر باشد؛
     سخت‌گیریِ زیاد یعنی مدیر نمی‌تواند کارتِ تازه ثبت کند)
  ۳. رو و پشتِ یک کارت در **یک** درخواست → ۲۰۰ (این‌ها عمداً دو طرحِ
     متفاوتِ یک کارت‌اند و نباید تکراری شمرده شوند)

اجرا:
    python3 tools/e2e_dupguard.py <رمزِ-مدیر>
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
from _authcache import admin_token, cleanup_own_run  # noqa: E402
from PIL import Image, ImageDraw  # noqa: E402

API = 'https://api.ghelghelishop.ir'
B = '--dg'


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
        print('  ✗', n, '→', str(d)[:230])


def card(text, bg, fg, shift=0, layout=0):
    """کارتِ ساختگی با ساختارِ کافی برای اثرانگشتِ معنادار.

    ⚠️ دو نکته که هر کدام یک بار این تست را گمراه کردند:

    ۱. **گرادیانِ ساده کافی نیست.** موتور به لبه، بافت و نواحیِ رنگیِ
       متمایز نیاز دارد وگرنه اثرانگشت‌ها بی‌معنی می‌شوند. تستِ
       بازنشستهٔ `e2e_photocards.py` دقیقاً همین اشتباه را داشت.

    ۲. **فقط عوض کردنِ رنگ کافی نیست.** دو تصویر با هندسهٔ یکسان و
       رنگِ متفاوت، از نظرِ موتور ۹۵٪ شبیه‌اند — و این ارزیابیِ
       **درستی** است، نه باگ. `rgb_sig` دقیقاً برای تشخیصِ همین حالت
       اضافه شد ولی هش‌ها و نقشهٔ روشنایی همچنان ساختار را یکسان
       می‌بینند.

       پس `layout` هندسه را هم جابه‌جا می‌کند: فاصلهٔ خطوط، جای
       مستطیل و شکلِ پایین.
    """
    im = Image.new('RGB', (520, 760), bg)
    d = ImageDraw.Draw(im)
    step = (37, 23, 61)[layout % 3]
    for i in range(0, 760, step):
        d.line([(0, i), (520, i)], fill=fg, width=2 + layout)
    if layout == 0:
        d.rectangle([40, 60, 480, 420], fill=fg)
        d.rectangle([70, 90, 450, 390], fill=bg)
        d.ellipse([160 + shift, 470, 360 + shift, 670], fill=fg)
    elif layout == 1:
        # ستونی به‌جای افقی، و مثلث به‌جای دایره.
        d.rectangle([30, 40, 250, 700], fill=fg)
        d.rectangle([60, 80, 220, 660], fill=bg)
        d.polygon([(300, 640), (500, 640), (400, 420)], fill=fg)
    else:
        # چهار خانهٔ شطرنجی — کاملاً متفاوت از هر دوی بالا.
        for gx in range(2):
            for gy in range(3):
                if (gx + gy) % 2 == 0:
                    d.rectangle([40 + gx * 220, 50 + gy * 230,
                                 240 + gx * 220, 260 + gy * 230], fill=fg)
    d.text((90, 200), text, fill=fg)
    o = io.BytesIO()
    im.save(o, 'PNG')
    return o.getvalue()


apw = sys.argv[1] if len(sys.argv) > 1 else None
if not apw:
    raise SystemExit('استفاده: python3 tools/e2e_dupguard.py <رمزِ-مدیر>')
at = admin_token(apw)
PFX = f'DG{int(time.time()) % 100000:05d}'
atexit.register(lambda: cleanup_own_run(req, at, PFX))

A = card('ALPHA', (14, 40, 90), (250, 210, 90))
A_BACK = card('BACK-A', (240, 200, 80), (18, 28, 58), shift=40)
Bimg = card('BETA', (120, 20, 30), (200, 240, 250), layout=2)

print('\n══ ۱. طرحِ اول ثبت می‌شود ══')
st, r1 = req('POST', '/api/admin/photo-cards/designs', at,
             {'name': f'{PFX}-اول', 'pointValue': '10'},
             {'image': ('a.png', A, 'image/png')})
ck('طرحِ اول پذیرفته شد', st == 200, f'{st} {str(r1)[:130]}')
if st != 200:
    raise SystemExit('\n✗ آماده‌سازی شکست خورد.')

print('\n══ ۲. ⚠️ همان فایل با نامِ دیگر → باید ۴۰۹ بگیرد ══')
st, r2 = req('POST', '/api/admin/photo-cards/designs', at,
             {'name': f'{PFX}-دوم', 'pointValue': '10'},
             {'image': ('b.png', A, 'image/png')})
ck('تصویرِ یکسان رد شد', st == 409, f'{st} — گارد کار نمی‌کند!')
ck('شباهت گزارش شد و بالاست',
   isinstance(r2.get('similarity'), (int, float))
   and r2['similarity'] >= 0.93, str(r2.get('similarity')))
msg = str(r2.get('message') or '')
# ⚠️ همان باگِ تاریخی: `releaseGuard is not defined` باعث می‌شد به‌جای
#    این پیام، خطای ۵۰۰ با متنِ انگلیسی بیاید.
ck('پیام فارسی و راهنماست', 'یکسان است' in msg and 'غیرفعال' in msg,
   msg[:120])
ck('هیچ متنِ انگلیسیِ خطا در پیام نیست',
   'is not defined' not in msg and 'Error' not in msg, msg[:120])
ck('شناسهٔ طرحِ متعارض برگشت', bool(r2.get('duplicateOf')),
   'مدیر باید بداند با کدام طرح تداخل دارد')

print('\n══ ۳. تصویرِ واقعاً متفاوت باید پذیرفته شود ══')
# گاردِ بیش‌ازحد سخت‌گیر یعنی مدیر نمی‌تواند کارتِ تازه ثبت کند — که
# بدتر از نبودِ گارد است.
st, r3 = req('POST', '/api/admin/photo-cards/designs', at,
             {'name': f'{PFX}-سوم', 'pointValue': '10'},
             {'image': ('c.png', Bimg, 'image/png')})
ck('تصویرِ متفاوت پذیرفته شد', st == 200,
   f'{st} {str(r3.get("message"))[:110]} — گارد بیش از حد سخت‌گیر است')

print('\n══ ۴. رو و پشت در یک درخواست تکراری شمرده نمی‌شوند ══')
# این‌ها عمداً دو طرحِ متفاوتِ یک کارت‌اند.
#
# ⚠️ اینجا یک درسِ مهم دربارهٔ **دادهٔ تست** گرفته شد.
#
# نسخهٔ اول از `card('X', ...)` استفاده می‌کرد که فقط **رنگش** با
# `ALPHA` فرق داشت: همان خط‌ها، همان مستطیل‌ها، همان بیضی در همان جای
# دقیق. سرور ۴۰۹ داد با ۹۵٪ شباهت و من اولش فکر کردم باگ است.
#
# بازتولیدِ محلی نشان داد `sameImageScore` دقیقاً همان ۰.۹۵۲ را می‌دهد
# — و **درست** می‌گوید. دو تصویر با چیدمانِ هندسیِ یکسان و فقط رنگِ
# متفاوت، از نظرِ موتور واقعاً نزدیک‌اند؛ همان حالتی که در کارت‌های
# واقعی هم رخ می‌دهد (Hakimi و Dembélé همین مشکل را داشتند).
#
# پس دادهٔ تست عوض شد نه محصول: `layout=` هندسه را هم جابه‌جا می‌کند.
# اگر آستانه را برای راحتیِ تست پایین می‌آوردم، دقیقاً همان اشتباهی
# بود که چند بار در این پروژه تکرار شده — خراب کردنِ محصول برای سبز
# شدنِ تست.
st, r4 = req('POST', '/api/admin/photo-cards/designs', at,
             {'name': f'{PFX}-دوطرفه', 'pointValue': '10'},
             {'image': ('f.png', card('X', (10, 60, 40), (255, 230, 120),
                                      layout=1),
                        'image/png'),
              'imageBack': ('b.png', card('Y', (250, 240, 200),
                                          (30, 20, 70), layout=2),
                            'image/png')})
ck('کارتِ دوطرفه پذیرفته شد', st == 200,
   f'{st} {str(r4.get("message"))[:110]}')
ck('هر دو طرح ساخته شدند', r4.get('sideCount') == 2,
   str(r4.get('sideCount')))

print('\n══ ۵. ⚠️ رو و پشتِ **یکسان** باید رد شود ══')
# اگر مدیر اشتباهاً یک فایل را برای هر دو طرف بفرستد، سیستم نباید دو
# طرحِ همسان بسازد.
same = card('Z', (40, 40, 120), (240, 240, 120))
st, r5 = req('POST', '/api/admin/photo-cards/designs', at,
             {'name': f'{PFX}-اشتباه', 'pointValue': '10'},
             {'image': ('f.png', same, 'image/png'),
              'imageBack': ('b.png', same, 'image/png')})
ck('رو و پشتِ یکسان رد شد', st == 409, f'{st} {str(r5.get("message"))[:110]}')

print('\n══ ۶. طرحِ غیرفعال مانعِ ثبتِ تازه نیست ══')
# پیامِ گارد می‌گوید «اول طرح قبلی را غیرفعال کنید». اگر آن راهنما
# واقعاً کار نکند، مدیر در بن‌بست می‌افتد.
for d in (r1.get('designs') or []):
    req('PATCH', f"/api/admin/photo-cards/designs/{d['id']}", at,
        {'isActive': False})
st, r6 = req('POST', '/api/admin/photo-cards/designs', at,
             {'name': f'{PFX}-جایگزین', 'pointValue': '10'},
             {'image': ('a2.png', A, 'image/png')})
ck('بعد از غیرفعال کردن، همان تصویر پذیرفته می‌شود', st == 200,
   f'{st} {str(r6.get("message"))[:110]} — راهنماییِ پیامِ ۴۰۹ دروغ است!')

print(f'\n{"✗" if bad else "✓"} {ok} موفق، {bad} ناموفق\n')
sys.exit(1 if bad else 0)
