# -*- coding: utf-8 -*-
"""آیا مسیرهای محافظت‌شده واقعاً بدونِ توکن رد می‌شوند؟ — روی سرورِ زنده.

═══════════════════════════════════════════════════════════════════════════
چرا این جدا از testRouteAuth.js لازم است
═══════════════════════════════════════════════════════════════════════════

`testRouteAuth.js` **کد** را می‌خواند و می‌گوید میان‌افزارِ `auth` روی
مسیر هست. این خوب است ولی سه چیز را ثابت نمی‌کند:

  ۱. خودِ `auth` واقعاً کار می‌کند (شاید توکنِ خراب را قبول کند)
  ۲. nginx مسیر را درست پروکسی می‌کند (شاید مسیری اصلاً به اپ نرسد)
  ۳. مسیری که فکر می‌کنیم مدیریتی است، با توکنِ **کاربرِ عادی** باز
     نشود — یعنی تفاوتِ `auth` و `adminAuth` در عمل رعایت شود

مورد سوم مهم‌ترین است و هیچ تستِ ایستایی نمی‌گیردش: هر دو میان‌افزار در
کد شبیه‌اند، ولی یکی هر کاربری را می‌پذیرد.

⚠️ این ممیزی چیزی نمی‌سازد و نمی‌نویسد — فقط GET می‌زند و کدِ وضعیت را
   می‌خواند. روی سرورِ زنده بی‌خطر است.

اجرا:
    python3 tools/audit_authlive.py <رمزِ-مدیر>
"""
import json
import os as _os
import sys
import sys as _sys
import time
import urllib.error
import urllib.request

_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from _authcache import admin_token  # noqa: E402

API = 'https://api.ghelghelishop.ir'

ok = bad = 0


def ck(n, c, d=''):
    global ok, bad
    if c:
        ok += 1
        print('  ✓', n)
    else:
        bad += 1
        print('  ✗', n, '→', str(d)[:200])


def req(method, path, tok=None, body=None):
    h = {}
    if tok:
        h['Authorization'] = 'Bearer ' + tok
    d = None
    if body is not None:
        d = json.dumps(body).encode()
        h['Content-Type'] = 'application/json'
    r = urllib.request.Request(API + path, data=d, headers=h, method=method)
    try:
        with urllib.request.urlopen(r, timeout=60) as x:
            return x.status
    except urllib.error.HTTPError as e:
        return e.code
    except Exception:
        return 0


apw = sys.argv[1] if len(sys.argv) > 1 else None
if not apw:
    raise SystemExit('استفاده: python3 tools/audit_authlive.py <رمزِ-مدیر>')

at = admin_token(apw)

# کاربرِ عادیِ تازه — برای سنجشِ «آیا کاربرِ عادی به پنل راه دارد؟»
mob = f'09{int(time.time()) % 1000000000:09d}'
# ⚠️ نسخهٔ اول بعد از ثبت‌نام سراغِ `/api/auth/login-password` می‌رفت —
#    مسیری که **وجود ندارد**. نتیجه: توکن ساخته نمی‌شد و بخشِ ۳ (مهم‌ترین
#    بخشِ این ممیزی) بی‌صدا رد می‌شد در حالی که بقیه سبز بودند.
#
#    خودِ `register-password` توکن را در پاسخ برمی‌گرداند.
ut = None
try:
    r = urllib.request.Request(
        API + '/api/auth/register-password',
        data=json.dumps({
            'mobile': mob, 'password': 'Qa!12345', 'firstName': 'تست',
            'lastName': 'دسترسی', 'nickname': f'دسترسی{mob[-4:]}'}).encode(),
        headers={'Content-Type': 'application/json'}, method='POST')
    with urllib.request.urlopen(r, timeout=60) as x:
        ut = json.loads(x.read()).get('token')
except Exception as e:
    print('  … ثبت‌نام:', e)

print('\n══ ۱. مسیرهای کاربری بدونِ توکن رد می‌شوند ══')
# اگر یکی از این‌ها ۲۰۰ بدهد، دادهٔ کاربر بدونِ ورود قابلِ خواندن است.
for p in ['/api/profile', '/api/bootstrap', '/api/wallet',
          '/api/photo-cards/status', '/api/chat/messages',
          '/api/notifications', '/api/pass', '/api/referrals']:
    s = req('GET', p)
    ck(f'GET {p} → {s}', s in (401, 403), f'انتظار ۴۰۱/۴۰۳ بود، {s} آمد')

print('\n══ ۲. توکنِ جعلی پذیرفته نمی‌شود ══')
# اگر امضای JWT بررسی نشود، هر کسی می‌تواند توکن بسازد.
for tok in ['bogus', 'Bearer.Bearer.Bearer',
            'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjEifQ.x']:
    s = req('GET', '/api/profile', tok)
    ck(f'توکنِ جعلی «{tok[:22]}…» → {s}', s in (401, 403), f'{s}')

print('\n══ ۳. ⚠️ کاربرِ عادی به پنلِ مدیر راه ندارد ══')
# مهم‌ترین بخش. هر دو میان‌افزار در کد شبیه‌اند؛ فقط اینجا معلوم می‌شود
# که `auth` جای `adminAuth` ننشسته باشد.
if not ut:
    ck('توکنِ کاربرِ تست ساخته شد', False,
       'بدونِ توکن، مهم‌ترین بخشِ این ممیزی اجرا نمی‌شود')
else:
    for p in ['/api/admin/users', '/api/admin/photo-cards/designs',
              '/api/admin/wallet/withdrawals', '/api/admin/settings',
              '/api/admin/admins', '/api/admin/stats',
              '/api/admin/photo-cards/submissions']:
        s = req('GET', p, ut)
        ck(f'کاربرِ عادی → GET {p} → {s}', s in (401, 403, 404),
           f'⚠️ کاربرِ عادی به مسیرِ مدیریتی دسترسی دارد! ({s})')

print('\n══ ۴. مسیرهای عمومی واقعاً بازند ══')
# اگر این‌ها ببندند، ثبت‌نام و صفحهٔ بازی‌ها می‌شکنند.
for p in ['/health', '/api/games', '/api/chat/canned-messages']:
    s = req('GET', p)
    ck(f'GET {p} → {s}', s == 200, f'مسیرِ عمومی باید ۲۰۰ بدهد، {s} آمد')

print('\n══ ۵. مدیر با توکنِ خودش دسترسی دارد ══')
# نگهبانِ برعکس: اگر adminAuth آن‌قدر سفت باشد که خودِ مدیر را هم رد
# کند، پنل از کار می‌افتد — و تست‌های بالا همچنان سبز می‌مانند.
for p in ['/api/admin/users', '/api/admin/photo-cards/designs']:
    s = req('GET', p, at)
    ck(f'مدیر → GET {p} → {s}', s == 200, f'{s}')

print('\n══ ۶. هدرهای امنیتی روی پاسخ هست ══')
try:
    with urllib.request.urlopen(API + '/health', timeout=60) as x:
        h = {k.lower(): v for k, v in x.headers.items()}
    ck('X-Content-Type-Options', h.get('x-content-type-options') == 'nosniff',
       str(h.get('x-content-type-options')))
    ck('X-Frame-Options یا CSP frame-ancestors دارد',
       'x-frame-options' in h or 'frame-ancestors' in
       h.get('content-security-policy', ''),
       'کلیک‌جکینگ ممکن می‌شود')
    ck('هدرِ X-Powered-By لو نمی‌رود', 'x-powered-by' not in h,
       h.get('x-powered-by', ''))
except Exception as e:
    ck('خواندنِ هدرها', False, str(e))

print(f'\n{"✗" if bad else "✓"} {ok} موفق، {bad} ناموفق\n')
sys.exit(1 if bad else 0)
