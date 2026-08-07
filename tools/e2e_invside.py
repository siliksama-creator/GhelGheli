# -*- coding: utf-8 -*-
"""تصویرِ اینونتوری: رو یا پشتِ کارت، تصادفی — تستِ سرتاسری روی سرورِ زنده.

═══════════════════════════════════════════════════════════════════════════
چه چیزی سنجیده می‌شود
═══════════════════════════════════════════════════════════════════════════

خواستهٔ مالک: «وقتی کاربر کارت رو ثبت میکنه بصورت تصادفی پشت و یا روی
کارت انتخاب بشه، اینطوری زیبایی اینونتوری بیشتر میشه».

`testInventoryImage.js` نگهبانِ **ساختاری** است: می‌گوید کد ستون را
می‌نویسد و می‌خواند. ولی هیچ‌کدام ثابت نمی‌کنند که روی سرورِ زنده
واقعاً کار می‌کند. چهار چیزی که فقط اینجا معلوم می‌شود:

  ۱. مایگریشن روی دیتابیسِ زنده اجرا شده و ستون وجود دارد
  ۲. ثبتِ واقعی مقدارِ NULL نمی‌گذارد
  ۳. تصویری که برمی‌گردد **یکی از دو طرحِ همان کارت** است، نه چیزِ دیگر
  ۴. انتخاب بین ثبت‌های مختلف واقعاً می‌چرخد (هم رو می‌آید هم پشت)

⚠️ مورد ۴ ذاتاً احتمالاتی است. با ۱۴ کاربر و شانسِ ۵۰٪، احتمالِ اینکه
   همه یک طرف بگیرند حدودِ ۱ در ۸۰۰۰ است. پس شکستش تقریباً همیشه یعنی
   «قرعه اصلاً نمی‌افتد»، نه بدشانسی. با این حال پیامِ خطا این نکته را
   می‌گوید تا کسی سرِ یک اجرای بدشانس دنبالِ باگِ ناموجود نگردد.

── چرا ثباتِ انتخاب هم تست می‌شود ──

مهم‌تر از خودِ تصادفی بودن: انتخاب باید **ثابت بماند**. اگر هر بار
خواندنِ اینونتوری قرعهٔ تازه بیندازد، کارت جلوی چشمِ کاربر ورق می‌خورد و
کشِ دیسکیِ گوشی هم بی‌اثر می‌شود (URL متغیر = دانلودِ دوباره). این تست
اینونتوری را سه بار می‌خواند و مطمئن می‌شود هر سه بار یکی است.

اجرا:
    python3 tools/e2e_invside.py <رمزِ-مدیر>
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
from _authcache import (admin_token, block_test_user, cleanup_own_run,  # noqa: E402
                        deactivate_stale_designs)
from PIL import Image, ImageDraw  # noqa: E402

API = 'https://api.ghelghelishop.ir'
B = '--iv'


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


def card(text, bg, fg, num):
    """کارتِ ساختگی با متن و رنگِ مشخص.

    ⚠️ رو و پشت باید **به‌قدرِ کافی متفاوت** باشند وگرنه گاردِ «طرحِ
       تکراری» (آستانهٔ ۰.۹۳) آپلود را رد می‌کند. رنگِ پس‌زمینه و متن
       هر دو عوض می‌شوند تا فاصله‌شان مطمئن باشد.

       آن گارد درست است و برای راحتیِ تست ضعیف نمی‌شود.
    """
    im = Image.new('RGB', (520, 760), bg)
    d = ImageDraw.Draw(im)
    for i in range(0, 760, 40):
        d.line([(0, i), (520, i)], fill=fg, width=3)
    d.rectangle([40, 60, 480, 420], fill=fg)
    d.rectangle([70, 90, 450, 390], fill=bg)
    d.text((90, 200), text, fill=fg)
    d.text((90, 260), str(num) * 6, fill=fg)
    d.ellipse([160, 470, 360, 670], fill=fg)
    o = io.BytesIO()
    im.save(o, 'PNG')
    return o.getvalue()


apw = sys.argv[1] if len(sys.argv) > 1 else None
if not apw:
    raise SystemExit('استفاده: python3 tools/e2e_invside.py <رمزِ-مدیر>')
at = admin_token(apw)

PFX = f'IV{int(time.time()) % 100000:05d}'
deactivate_stale_designs(req, at)
atexit.register(lambda: cleanup_own_run(req, at, PFX))

print('\n══ ۱. کارتِ دوطرفه با دو طرحِ کاملاً متفاوت ══')
FRONT = card('FRONT', (14, 40, 90), (250, 210, 90), 1)
BACK = card('BACK', (240, 200, 80), (20, 30, 60), 8)

N = 16
# ⚠️ دو کدِ اضافه فراتر از N: بخشِ ۵ (تستِ ثبات) به دو کدِ **مصرف‌نشده**
#    نیاز دارد. نسخهٔ اولِ این تست دقیقاً N کد می‌ساخت و حلقهٔ بخشِ ۲
#    همه‌شان را مصرف می‌کرد، پس بخشِ ۵ بی‌صدا رد می‌شد — تستی که اجرا
#    نمی‌شود ولی سبز گزارش می‌دهد بدترین حالتِ ممکن است.
NEXTRA = 2
st, rc = req('POST', '/api/admin/photo-cards/designs', at,
             {'name': f'{PFX}-دوطرفه', 'pointValue': '10',
              'rawCodes': '\n'.join(f'{PFX}-C{i:03d}'
                                    for i in range(1, N + NEXTRA + 1))},
             {'image': ('f.png', FRONT, 'image/png'),
              'imageBack': ('b.png', BACK, 'image/png')})
ck('آپلود پذیرفته شد', st == 200, f'{st} {str(rc)[:170]}')
ck('دو طرح ساخته شد', rc.get('sideCount') == 2, str(rc.get('sideCount')))
designs = rc.get('designs') or []
urls = {str(d.get('image_url')) for d in designs}
ck('دو تصویرِ متمایز', len(urls) == 2, str(urls))
ck(f'{N + NEXTRA} کد گره خورد',
   (rc.get('codeReport') or {}).get('insertedCount') == N + NEXTRA,
   str(rc.get('codeReport')))
if bad:
    raise SystemExit('\n✗ آماده‌سازی شکست خورد؛ ادامه بی‌معنی است.')

print('\n══ ۲. چند کاربر کارت ثبت می‌کنند ══')
print('   (هر کاربر یک کد، پس هر کدام یک قرعهٔ مستقل است)')
seen = []
uids = []
for i in range(1, N + 1):
    mob = f'09{(int(time.time() * 1000) + i * 7919) % 1000000000:09d}'
    st, ru = req('POST', '/api/auth/register-password', body={
        'mobile': mob, 'password': 'Qa!12345', 'firstName': 'تست',
        'lastName': 'اینونتوری', 'nickname': f'اینو{PFX}{i}'})
    if st != 200 or not ru.get('token'):
        print(f'  … کاربر {i} ساخته نشد ({st}) — رد می‌شویم')
        continue
    ut = ru['token']
    uid = (ru.get('user') or {}).get('id')
    if uid:
        uids.append(uid)

    st, sr = req('POST', '/api/photo-cards/submit', ut,
                 {'code': f'{PFX}-C{i:03d}'},
                 {'image': ('u.png', FRONT, 'image/png')})
    if sr.get('status') != 'approved':
        print(f"  … ثبت {i}: {sr.get('status')} — {str(sr.get('message'))[:60]}")
        continue

    # اینونتوری را از سرور می‌خوانیم، نه از پاسخِ ثبت: هدف دقیقاً همان
    # چیزی است که صفحهٔ «کارت‌های من» می‌بیند.
    st, bs = req('GET', '/api/bootstrap', ut)
    inv = [x for x in (bs.get('inventory') or [])
           if str(x.get('name', '')).startswith(PFX)]
    if inv:
        seen.append(str(inv[0].get('image_url')))

# کاربرانِ تست را از جدولِ لیگ بیرون می‌بریم.
atexit.register(lambda: [block_test_user('/home/user/tools/rx.py', u)
                         for u in uids])

ck(f'حداقل ۱۰ ثبتِ موفق ({len(seen)})', len(seen) >= 10, f'{len(seen)} از {N}')

print('\n══ ۳. تصویرِ اینونتوری یکی از دو طرحِ همان کارت است ══')
uniq = set(seen)
ck('هیچ تصویری خالی نیست', all(u and u != 'None' for u in seen),
   str([u for u in seen if not u or u == 'None'][:3]))
ck('همهٔ تصاویر از طرح‌های همین کارت‌اند', uniq <= urls,
   f'ناشناخته: {uniq - urls}')

print('\n══ ۴. قرعه واقعاً می‌چرخد — هم رو، هم پشت ══')
counts = {u: seen.count(u) for u in urls}
print(f'   توزیع: {json.dumps(counts, ensure_ascii=False)}')
ck('هر دو طرح دستِ کم یک بار انتخاب شده‌اند',
   len(uniq) == 2,
   f'فقط {len(uniq)} طرح دیده شد. با ۵۰٪ شانس و {len(seen)} نمونه، '
   f'احتمالِ بدشانسیِ محض ~۱ در {2 ** max(len(seen) - 1, 1)} است — '
   f'یعنی تقریباً حتماً قرعه اصلاً نمی‌افتد.')

print('\n══ ۵. انتخاب **ثابت** می‌ماند (کشِ گوشی به آن وابسته است) ══')
# اگر خواندنِ اینونتوری هر بار قرعهٔ تازه بیندازد، کارت جلوی چشمِ کاربر
# ورق می‌خورد و URL متغیر کشِ دیسکیِ گوشی را بی‌اثر می‌کند.
mob = f'09{(int(time.time() * 1000) + 31337) % 1000000000:09d}'
st, ru = req('POST', '/api/auth/register-password', body={
    'mobile': mob, 'password': 'Qa!12345', 'firstName': 'تست',
    'lastName': 'ثبات', 'nickname': f'ثبات{PFX}'})
if st == 200 and ru.get('token'):
    ut = ru['token']
    uid = (ru.get('user') or {}).get('id')
    if uid:
        uids.append(uid)
    # دو کدِ رزروشدهٔ انتهایی — حلقهٔ بخشِ ۲ فقط تا N رفته.
    st, sr = req('POST', '/api/photo-cards/submit', ut,
                 {'code': f'{PFX}-C{N + 1:03d}'},
                 {'image': ('u.png', BACK, 'image/png')})
    if sr.get('status') == 'approved':
        reads = []
        for _ in range(3):
            st, bs = req('GET', '/api/bootstrap', ut)
            inv = [x for x in (bs.get('inventory') or [])
                   if str(x.get('name', '')).startswith(PFX)]
            reads.append(str(inv[0].get('image_url')) if inv else None)
            time.sleep(0.4)
        ck('سه بار خواندن، همان تصویر', len(set(reads)) == 1, str(reads))

        # ثبتِ نسخهٔ دوم نباید طرح را عوض کند (COALESCE).
        before = reads[0]
        st, sr2 = req('POST', '/api/photo-cards/submit', ut,
                      {'code': f'{PFX}-C{N + 2:03d}'},
                      {'image': ('u.png', FRONT, 'image/png')})
        st, bs = req('GET', '/api/bootstrap', ut)
        inv = [x for x in (bs.get('inventory') or [])
               if str(x.get('name', '')).startswith(PFX)]
        after = str(inv[0].get('image_url')) if inv else None
        ck('نسخهٔ دومِ همان کارت تصویر را عوض نمی‌کند', before == after,
           f'قبل={before} بعد={after}')
        ck('ولی تعداد زیاد شد',
           inv and int(inv[0].get('quantity') or 0) == 2,
           str(inv[0].get('quantity') if inv else None))
    else:
        # ⚠️ صریحاً شکست، نه رد شدنِ بی‌صدا. نسخهٔ اول فقط چاپ می‌کرد و
        #    تست سبز می‌ماند در حالی که مهم‌ترین ادعایش (ثباتِ انتخاب)
        #    اصلاً سنجیده نشده بود.
        ck('ثبتِ کاربرِ ثبات موفق شد', False,
           f"{sr.get('status')} — {str(sr.get('message'))[:120]}")
else:
    ck('کاربرِ ثبات ساخته شد', False, f'{st} {str(ru)[:120]}')

print(f'\n{"✗" if bad else "✓"} {ok} موفق، {bad} ناموفق\n')
sys.exit(1 if bad else 0)
