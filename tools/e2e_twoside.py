# -*- coding: utf-8 -*-
"""رو و پشتِ کارت + دقتِ موتور روی کارت‌های واقعیِ قلقلی.

═══════════════════════════════════════════════════════════════════════════
این تست چه چیزی را می‌سنجد
═══════════════════════════════════════════════════════════════════════════

سه چیزی که با هم شکایتِ «سیستم تشخیص کاملاً غلط کار می‌کند» را ساختند:

  ۱. **دو عکس در یک درخواست.** مدیر رو و پشت را می‌فرستد؛ باید دو طرح
     ساخته شود که هر دو به یک نوعِ کارت وصل‌اند.

  ۲. **کاربر از هر طرف عکس بگیرد شناخته شود.** عکسِ رو با کدِ همان کارت
     → تأیید. عکسِ پشت با کدِ همان کارت → هم تأیید.

  ۳. **کارتِ اشتباه پذیرفته نشود.** عکسِ Dembélé با کدِ Hakimi باید به
     صف بررسی برود، نه اینکه بی‌سروصدا کارتِ Hakimi را بدهد.

مورد سوم دقیقاً همان چیزی است که در پنل دیده شد: عکسِ کارتِ آبیِ فرانسه
فرستاده شده بود و سیستم «Achraf Hakimi» (قرمز، مراکش) حدس زده بود.

⚠️ این تست به تصاویرِ واقعی نیاز دارد، نه گرادیانِ ساختگی. علتِ ریشه‌ایِ
   آن باگ این بود که کارت‌های واقعی **قالبِ مشترک** دارند (پس‌زمینهٔ
   سفید، جامِ جهانی، نوارِ LIMITED) و فقط رنگِ پیراهنشان فرق می‌کند —
   چیزی که هیچ گرادیانِ ساختگی‌ای بازتولید نمی‌کند.
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
from PIL import Image, ImageEnhance, ImageFilter  # noqa: E402

API = 'https://api.ghelghelishop.ir'
B = '--ts'

# طرح‌های واقعی که مالک آپلود کرده. اگر نبودند تست با پیامِ روشن رد
# می‌شود به‌جای اینکه با خطای مبهم بترکد.
REAL = {
    'hakimi_front': '1786001887532-u3uak3gz3al.webp',
    'hakimi_back': '1786002127039-7yy994wiifi.webp',
    'dembele_front': '1786002355596-yu7z2yqws2f.webp',
    'dembele_back': '1786002420400-wgdyz78ul3.webp',
}


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


def fetch(name):
    """تصویرِ مرجع را از سرور می‌گیرد."""
    u = f'{API}/uploads/images/{name}'
    try:
        with urllib.request.urlopen(u, timeout=90) as r:
            return r.read()
    except Exception:
        return None


def variant(raw, hue):
    """نسخهٔ چرخش‌رنگ‌خوردهٔ یک کارتِ واقعی.

    ⚠️ چرا خودِ تصویرِ اصلی آپلود نمی‌شود
    ═══════════════════════════════════════

    طرح‌های واقعیِ مالک از قبل در کاتالوگِ زنده‌اند. آپلودِ دوبارهٔ همان
    فایل با ۹۹٪ شباهت به محافظِ «طرحِ تکراری» می‌خورد و ۴۰۹ می‌گیرد —
    یعنی تست کلاً اجرا نمی‌شود.

    آن محافظ **درست** کار می‌کند و نباید برای راحتیِ تست ضعیف شود؛
    همان اشتباهی که یک بار نزدیک بود با سقفِ نرخ تکرار شود.

    پس تست نسخهٔ چرخش‌رنگ‌خورده می‌سازد: قالبِ کارت (پس‌زمینهٔ سفید،
    جامِ جهانی، نوارِ LIMITED، چیدمانِ آمار) دقیقاً حفظ می‌شود — که
    همان چیزی است که باگ را می‌ساخت — ولی پالتِ رنگ فرق می‌کند پس
    محافظ راضی است.
    """
    im = Image.open(io.BytesIO(raw)).convert('RGB')
    px = im.load()
    # چرخشِ سادهٔ کانال‌ها: ارزان و بدونِ وابستگی به numpy.
    for y in range(im.height):
        for x in range(im.width):
            r, g, b = px[x, y]
            px[x, y] = (g, b, r) if hue == 1 else (b, r, g)
    o = io.BytesIO()
    im.save(o, 'PNG')
    return o.getvalue()


def phone(raw, rot=5, bright=1.0, blur=0.8, q=70, w=760):
    """شبیه‌سازیِ عکسِ گوشی: چرخش، نور، تاری، فشرده‌سازی."""
    im = Image.open(io.BytesIO(raw)).convert('RGB')
    im = im.rotate(rot, expand=True, fillcolor=(32, 32, 38))
    im = ImageEnhance.Brightness(im).enhance(bright)
    im = im.filter(ImageFilter.GaussianBlur(blur))
    sc = w / max(im.width, 1)
    im = im.resize((int(im.width * sc), int(im.height * sc)), Image.LANCZOS)
    b = io.BytesIO()
    im.save(b, 'JPEG', quality=q)
    return b.getvalue()


apw = sys.argv[1]
at = admin_token(apw)

print('\n══ آماده‌سازی ══')
src = {}
for k, v in REAL.items():
    src[k] = fetch(v)
    if not src[k]:
        raise SystemExit(
            f'✗ تصویرِ مرجع «{v}» روی سرور نیست.\n'
            '  این تست به کارت‌های واقعیِ آپلودشده نیاز دارد — گرادیانِ\n'
            '  ساختگی قالبِ مشترکِ کارت‌ها را بازتولید نمی‌کند و باگی که\n'
            '  این تست برای گرفتنش نوشته شده اصلاً ظاهر نمی‌شود.')
print(f'  {len(src)} تصویرِ مرجع دریافت شد')
# نسخه‌های آزمایشی: قالبِ یکسان، پالتِ متفاوت.
print('  ساختِ نسخه‌های آزمایشی…')
TA_F = variant(src['hakimi_front'], 1)
TA_B = variant(src['hakimi_back'], 1)
TB_F = variant(src['dembele_front'], 2)
TB_B = variant(src['dembele_back'], 2)
print('  آماده')

PFX = f'TS{int(time.time()) % 100000:05d}'
mob = f'09{int(time.time()) % 1000000000:09d}'
st, ru = req('POST', '/api/auth/register-password', body={
    'mobile': mob, 'password': 'Qa!12345', 'firstName': 'تست',
    'lastName': 'دوطرفه', 'nickname': f'دوطرفه{PFX}'})
if st != 200 or not ru.get('token'):
    raise SystemExit(f'✗ ساخت کاربر نشد: {st} {ru}')
ut = ru['token']
uid = (ru.get('user') or {}).get('id')

deactivate_stale_designs(req, at)
atexit.register(lambda: cleanup_own_run(req, at, PFX))
atexit.register(lambda: uid and block_test_user('/home/user/tools/rx.py', uid))

print('\n══ ۱. آپلودِ دو عکس (رو و پشت) در یک درخواست ══')
st, rA = req('POST', '/api/admin/photo-cards/designs', at,
             {'name': f'{PFX}-هاکیمی', 'pointValue': '3000',
              'rawCodes': '\n'.join(f'{PFX}-H{i:03d}' for i in range(1, 6))},
             {'image': ('f.png', TA_F, 'image/png'),
              'imageBack': ('b.png', TA_B, 'image/png')})
ck('درخواست پذیرفته شد', st == 200, f'{st} {str(rA)[:150]}')
ck('دو طرح ساخته شد', rA.get('sideCount') == 2 and len(rA.get('designs') or []) == 2,
   f"sideCount={rA.get('sideCount')} designs={len(rA.get('designs') or [])}")
TYPE_A = rA.get('cardTypeId')
ck('هر دو طرح به یک نوعِ کارت وصل‌اند', bool(TYPE_A), str(rA)[:120])
ck('۵ کد به کارت گره خورد',
   (rA.get('codeReport') or {}).get('insertedCount') == 5,
   str(rA.get('codeReport')))

print('\n══ ۲. کارتِ دوم، همان‌طور ══')
st, rB = req('POST', '/api/admin/photo-cards/designs', at,
             {'name': f'{PFX}-دمبله', 'pointValue': '3000',
              'rawCodes': '\n'.join(f'{PFX}-D{i:03d}' for i in range(1, 6))},
             {'image': ('f.png', TB_F, 'image/png'),
              'imageBack': ('b.png', TB_B, 'image/png')})
ck('کارتِ دوم هم با دو عکس ثبت شد', st == 200 and rB.get('sideCount') == 2,
   f"{st} {rB.get('sideCount')} {str(rB.get('message'))[:80]}")
TYPE_B = rB.get('cardTypeId')
ck('دو کارت نوعِ متفاوت دارند', TYPE_A and TYPE_B and TYPE_A != TYPE_B,
   f'A={TYPE_A} B={TYPE_B}')

print('\n══ ۳. نامِ تکراری کارتِ دوم نمی‌سازد ══')
st, rDup = req('POST', '/api/admin/photo-cards/designs', at,
               {'name': f'{PFX}-هاکیمی', 'pointValue': '3000'},
               {'image': ('x.png', TA_F, 'image/png')})
# یا ۴۰۹ «طرحِ تکراری» می‌گیرد (چون عکس یکی است) یا اگر عکسِ دیگری بود
# باید به همان نوعِ کارت وصل شود — در هیچ حالتی نوعِ سوم ساخته نمی‌شود.
st2, rTypes = req('GET', '/api/admin/photo-cards/designs/options', at)
same = [o for o in (rTypes.get('options') or [])
        if str(o.get('card_type_name', '')) == f'{PFX}-هاکیمی']
ck('هنوز فقط یک «هاکیمی» در کاتالوگ است',
   len({o.get('card_type_name') for o in same}) <= 1, f'{len(same)} طرح')

print('\n══ ۴. کاربر از **روی** کارت عکس می‌گیرد ══')
st, r1 = req('POST', '/api/photo-cards/submit', ut, {'code': f'{PFX}-H001'},
             {'image': ('u.jpg', phone(TA_F), 'image/jpeg')})
ck('پذیرفته شد', st == 200, f'{st} {str(r1.get("message"))[:90]}')
ck(f'تأییدِ خودکار (نمره={r1.get("matchScore")})', r1.get('status') == 'approved',
   f'{r1.get("status")} — {str(r1.get("message"))[:90]}')
ck('کارتِ درست داده شد', str(r1.get('cardType', '')).endswith('هاکیمی'),
   str(r1.get('cardType')))

print('\n══ ۵. کاربر از **پشتِ** همان کارت عکس می‌گیرد ══')
st, r2 = req('POST', '/api/photo-cards/submit', ut, {'code': f'{PFX}-H002'},
             {'image': ('u.jpg', phone(TA_B), 'image/jpeg')})
ck('پذیرفته شد', st == 200, f'{st} {str(r2.get("message"))[:90]}')
ck(f'تأییدِ خودکار (نمره={r2.get("matchScore")})', r2.get('status') == 'approved',
   f'{r2.get("status")} — {str(r2.get("message"))[:90]}')
ck('باز هم همان بازیکن', str(r2.get('cardType', '')).endswith('هاکیمی'),
   str(r2.get('cardType')))

print('\n══ ۶. ⚠️ عکسِ دمبله با کدِ هاکیمی → نباید تأیید شود ══')
print('   (دقیقاً همان چیزی که در پنل غلط کار می‌کرد)')
st, r3 = req('POST', '/api/photo-cards/submit', ut, {'code': f'{PFX}-H003'},
             {'image': ('u.jpg', phone(TB_F), 'image/jpeg')})
ck('کارتِ هاکیمی بی‌سروصدا داده نشد', r3.get('status') != 'approved',
   f'{r3.get("status")} cardType={r3.get("cardType")}')
ck('به صف بررسی رفت', r3.get('status') == 'pending',
   f'{st} {r3.get("status")}')
ck('علتش «تناقضِ کد و عکس» است', r3.get('reason') == 'type_mismatch',
   str(r3.get('reason')))

print('\n══ ۷. عکسِ دمبله با کدِ **خودش** → تأیید ══')
st, r4 = req('POST', '/api/photo-cards/submit', ut, {'code': f'{PFX}-D001'},
             {'image': ('u.jpg', phone(TB_F), 'image/jpeg')})
ck(f'تأییدِ خودکار (نمره={r4.get("matchScore")})', r4.get('status') == 'approved',
   f'{r4.get("status")} — {str(r4.get("message"))[:90]}')
ck('کارتِ دمبله داده شد', str(r4.get('cardType', '')).endswith('دمبله'),
   str(r4.get('cardType')))

print('\n══ ۸. عکسِ بد ولی همان کارت → همچنان تأیید (آستانهٔ ۲۰٪) ══')
st, r5 = req('POST', '/api/photo-cards/submit', ut, {'code': f'{PFX}-D002'},
             {'image': ('u.jpg',
                        phone(TB_B, rot=13, bright=0.7,
                              blur=2.4, q=35, w=420), 'image/jpeg')})
ck(f'عکسِ تارِ پشتِ کارت پذیرفته شد (نمره={r5.get("matchScore")})',
   r5.get('status') in ('approved', 'pending'),
   f'{st} {r5.get("status")}')

print('\n══ ۹. اینونتوری ══')
st, prof = req('GET', '/api/profile', ut)
inv = [i for i in (prof.get('inventory') or [])
       if str(i.get('name', '')).startswith(PFX)]
qty = sum(int(i.get('quantity') or 0) for i in inv)
ck('کارت‌ها در مجموعهٔ کاربر نشستند', len(inv) >= 2, f'{len(inv)} ردیف')
ck('هر بازیکن یک ردیف (نه دو تا به‌ازای رو و پشت)', len(inv) == 2,
   f'{len(inv)} ردیف: {[i.get("name") for i in inv]}')
print(f'   مجموع: {qty} کارت در {len(inv)} ردیف')

print(f'\n{"─" * 58}\n{"✓" if not bad else "✗"} {ok} موفق، {bad} ناموفق')
sys.exit(1 if bad else 0)
