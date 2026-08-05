# -*- coding: utf-8 -*-
"""تداخلِ امکانات: آیا هر قابلیت فقط کارِ خودش را می‌کند؟

═══════════════════════════════════════════════════════════════════════════
چرا این تست جدا از بقیه
═══════════════════════════════════════════════════════════════════════════

تست‌های موجود هر قابلیت را **جداگانه** می‌سنجند: آیا ثبت کارت کار
می‌کند؟ آیا گذر نبرد درست XP می‌دهد؟ آیا گردونه سهمیه را رعایت می‌کند؟

چیزی که هیچ‌کدام نمی‌سنجند این است: وقتی قابلیتِ A را استفاده می‌کنی،
آیا قابلیتِ B هم بی‌اجازه تکان می‌خورد؟

این مهم‌ترین سؤال است چون:

  • دو مسیرِ «ثبت کارت» وجود دارد (کد قدیمی و عکسِ جدید) که باید در
    اینونتوری یکی شوند ولی در گذر نبرد هیچ‌کدام نباید اثر بگذارند.
  • خواستهٔ صریح مالک: «ثبت کارت در هیچ حالتی نباید بتل پس رو چه در
    رایگان چه در پلاس باز کنه».
  • اثرِ جانبیِ ناخواسته هیچ خطایی تولید نمی‌کند — بی‌صدا اتفاق می‌افتد
    و فقط ماه‌ها بعد در آمارِ اقتصادِ بازی دیده می‌شود.

روش: از **همهٔ** شمارنده‌های کاربر عکسِ فوری می‌گیریم، یک کار انجام
می‌دهیم، دوباره عکس می‌گیریم، و تفاوت را با انتظار مقایسه می‌کنیم.
هر تغییرِ پیش‌بینی‌نشده یک باگ است.
"""
import io
import json
import os
import sys
import time
import urllib.error
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _authcache import admin_token, deactivate_stale_designs  # noqa: E402

from PIL import Image, ImageDraw, ImageFilter  # noqa: E402
import colorsys  # noqa: E402

API = 'https://api.ghelghelishop.ir'
B = '----intf'


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
        print('  ✗', n, '→', str(d)[:170])


def card(hue):
    im = Image.new('RGB', (420, 640))
    d = ImageDraw.Draw(im)
    for y in range(640):
        f = y / 640
        rr, gg, bb = colorsys.hsv_to_rgb(((hue + f * 45) % 360) / 360, 0.78,
                                         0.30 + 0.45 * f)
        d.line([(0, y), (420, y)],
               fill=(int(rr * 255), int(gg * 255), int(bb * 255)))
    for k in range(-640, 1060, 13):
        d.line([(k, 0), (k + 640, 640)],
               fill=(int((hue * 3 + k) % 255), int((k * 7) % 255),
                     int((hue + k * 2) % 255)), width=3)
    d.ellipse([95, 190, 325, 425], fill=(70, 225, 180))
    d.rectangle([0, 545, 420, 640], fill=(14, 14, 24))
    b = io.BytesIO()
    im.save(b, 'PNG')
    return b.getvalue(), im


def shot(im, q=72):
    o = im.rotate(4, expand=True, fillcolor=(28, 28, 34))
    o = o.resize((int(o.width * .55), int(o.height * .55)), Image.LANCZOS)
    o = o.filter(ImageFilter.GaussianBlur(0.5))
    b = io.BytesIO()
    o.save(b, 'JPEG', quality=q)
    return b.getvalue()


def snapshot(ut):
    """عکسِ فوری از هر شمارنده‌ای که ممکن است تکان بخورد."""
    _, b = req('GET', '/api/bootstrap', ut)
    _, ps = req('GET', '/api/pass', ut)
    _, lv = req('GET', '/api/level', ut)
    _, w = req('GET', '/api/wallet', ut)
    _, wh = req('GET', '/api/wheel', ut)
    u = b.get('user', {})
    inv = b.get('inventory', [])
    return {
        'امتیاز': u.get('current_points'),
        'امتیاز کل': u.get('lifetime_points'),
        'امتیاز لیگ': u.get('monthly_league_points'),
        'کیف پول': float(w.get('balance') or 0),
        'XP گذر نبرد': ps.get('xp'),
        'پلهٔ گذر نبرد': ps.get('currentTier') or ps.get('tier'),
        'سطح': lv.get('level'),
        'XP سطح': lv.get('xp'),
        'چرخش گردونه': wh.get('spinsLeft') if isinstance(wh, dict) else None,
        'تعداد کارت': sum(int(i.get('quantity') or 0) for i in inv),
        'نوع کارت': len(inv),
    }


def diff(a, b):
    return {k: (a[k], b[k]) for k in a if a[k] != b[k]}


def expect(name, before, after, allowed):
    """فقط کلیدهای `allowed` حق تغییر دارند."""
    d = diff(before, after)
    unexpected = {k: v for k, v in d.items() if k not in allowed}
    ck(f'{name}: هیچ شمارندهٔ نامرتبطی تکان نخورد', not unexpected,
       json.dumps(unexpected, ensure_ascii=False))
    return d


apw = sys.argv[1]
at = admin_token(apw)
PFX = f'IF{int(time.time()) % 100000:05d}'
UMOB = f'0900{int(time.time()) % 1000000:06d}'
st, ru = req('POST', '/api/auth/register-password', body={
    'mobile': UMOB, 'password': 'Qa!12345', 'firstName': 'تست',
    'lastName': 'تداخل', 'nickname': f'تداخل{PFX}'})
if st != 200 or not ru.get('token'):
    raise SystemExit(f'✗ ساخت کاربر ناموفق: {st} {ru}')
ut = ru['token']
print(f'کاربر تست: {UMOB}\n')

# طرح‌های باقی‌مانده غیرفعال شوند تا محافظِ تکراری مانع نشود.
deactivate_stale_designs(req, at)

# ═══════════════════════════════════════════════════════════════════════
print('══ ۱: ثبت کارت با عکس، گذر نبرد و سطح را تکان نمی‌دهد ══')
# ═══════════════════════════════════════════════════════════════════════
pngA, imA = card(210)
st, rA = req('POST', '/api/admin/photo-cards/designs', at,
             {'name': f'{PFX}-آبی', 'pointValue': '150'},
             {'image': ('a.png', pngA, 'image/png')})
ck('طرح ثبت شد', st == 200, f'{st} {rA}')
codes = [f'{PFX}-{i:04d}' for i in range(1, 9)]
req('POST', '/api/admin/photo-cards/codes', at,
    {'rawCodes': '\n'.join(codes)})

before = snapshot(ut)
st, r = req('POST', '/api/photo-cards/submit', ut, {'code': codes[0]},
            {'image': ('s.jpg', shot(imA), 'image/jpeg')})
ck('ثبت با عکس پذیرفته شد', st == 200 and r.get('status') == 'approved',
   f'{st} {r.get("status")} {r.get("message","")[:70]}')
after = snapshot(ut)
d = expect('ثبت با عکس', before, after,
           {'امتیاز', 'امتیاز کل', 'امتیاز لیگ', 'تعداد کارت', 'نوع کارت'})
print('   تغییرات:', json.dumps(d, ensure_ascii=False))
ck('XP گذر نبرد صفر ماند', before['XP گذر نبرد'] == after['XP گذر نبرد'],
   f'{before["XP گذر نبرد"]} → {after["XP گذر نبرد"]}')
ck('پلهٔ گذر نبرد تکان نخورد',
   before['پلهٔ گذر نبرد'] == after['پلهٔ گذر نبرد'])
ck('سطح بازیکن تکان نخورد', before['سطح'] == after['سطح']
   and before['XP سطح'] == after['XP سطح'])
ck('کیف پول تکان نخورد', before['کیف پول'] == after['کیف پول'])
ck('چرخش گردونه تکان نخورد',
   before['چرخش گردونه'] == after['چرخش گردونه'])
ck('امتیاز واقعاً اضافه شد (۱۵۰)',
   (after['امتیاز'] or 0) - (before['امتیاز'] or 0) == 150,
   f'{before["امتیاز"]} → {after["امتیاز"]}')
ck('کارت به اینونتوری اضافه شد',
   after['تعداد کارت'] > before['تعداد کارت'])

# ═══════════════════════════════════════════════════════════════════════
print('\n══ ۲: همان بررسی برای مسیرِ **قدیمیِ** ثبت کد ══')
# ═══════════════════════════════════════════════════════════════════════
st, ct = req('GET', '/api/admin/card-types', at)
# این endpoint آرایهٔ خام برمی‌گرداند، نه شیءِ پوشش‌دار. هر دو حالت
# پشتیبانی می‌شود تا اگر روزی عوض شد تست نشکند.
types = ct if isinstance(ct, list) else ct.get('cardTypes', [])
# ⚠️ نوعِ کارتی انتخاب می‌شود که **از طرحِ عکس نیامده باشد**.
# تلهٔ اول: `types[0]` تازه‌ترین نوع است، و چون همین تست چند خط
# بالاتر یک طرحِ عکس ساخته، همان نوع انتخاب می‌شد. آن‌وقت هر دو
# مسیر روی یک `card_type_id` می‌نشستند و در اینونتوری در **یک
# ردیف** با quantity=2 جمع می‌شدند.
#
# آن رفتار کاملاً درست است (اینونتوری بر پایهٔ نوعِ کارت گروه
# می‌شود، نه بر پایهٔ مسیرِ ثبت)، ولی ادعای «اینونتوری هر دو مسیر
# را دارد» را با شمردنِ ردیف‌ها نمی‌شد سنجید. تست دروغِ قرمز می‌داد.
_, _dz = req('GET', '/api/admin/photo-cards/designs', at)
_photo_types = {d.get('card_type_id') for d in _dz.get('designs', [])}
_plain = [t for t in types if t['id'] not in _photo_types]
if _plain:
    tid = _plain[0]['id']
    old_type_name = _plain[0].get('name')
    oldcode = f'{PFX}OLD1'
    st, r = req('POST', '/api/admin/card-codes', at,
                {'cardTypeId': tid, 'code': oldcode})
    if st == 200:
        before2 = snapshot(ut)
        st, r = req('POST', '/api/cards/redeem', ut, {'code': oldcode})
        ck('ثبت کد قدیمی پذیرفته شد', st == 200, f'{st} {r}')
        after2 = snapshot(ut)
        d2 = expect('ثبت کد قدیمی', before2, after2,
                    {'امتیاز', 'امتیاز کل', 'امتیاز لیگ', 'کیف پول',
                     'تعداد کارت', 'نوع کارت'})
        print('   تغییرات:', json.dumps(d2, ensure_ascii=False))
        ck('XP گذر نبرد صفر ماند (مسیر قدیمی)',
           before2['XP گذر نبرد'] == after2['XP گذر نبرد'],
           f'{before2["XP گذر نبرد"]} → {after2["XP گذر نبرد"]}')
        ck('پلهٔ گذر نبرد تکان نخورد (مسیر قدیمی)',
           before2['پلهٔ گذر نبرد'] == after2['پلهٔ گذر نبرد'])
        ck('سطح تکان نخورد (مسیر قدیمی)', before2['سطح'] == after2['سطح'])
    else:
        ck('ساخت کد قدیمی', False, f'{st} {r}')
else:
    ck('نوع کارتِ غیرعکسی برای تستِ مسیر قدیمی', False,
       'همهٔ نوع‌های کارت از طرحِ عکس آمده‌اند')

# ═══════════════════════════════════════════════════════════════════════
print('\n══ ۳: هر دو مسیر در **یک** اینونتوری جمع می‌شوند ══')
# ═══════════════════════════════════════════════════════════════════════
_, b = req('GET', '/api/bootstrap', ut)
inv = b.get('inventory', [])
names = [i.get('name') for i in inv]
ck('کارتِ مسیرِ عکس در اینونتوری هست',
   any(str(n or '').startswith(PFX) for n in names), str(names))
ck('کارتِ مسیرِ قدیمی هم در همان اینونتوری هست',
   any(n == old_type_name for n in names), f'{old_type_name} در {names}')
ck('اینونتوری هر دو مسیر را دارد', len(inv) >= 2, str(names))
# پروفایل عمومی همان اینونتوری را نشان می‌دهد؟
uid = (b.get('user') or {}).get('id')
if uid:
    st, pub = req('GET', f'/api/users/{uid}/public', ut)
    pubcards = pub.get('cards', pub.get('inventory', []))
    ck('پروفایل عمومی همان کارت‌ها را نشان می‌دهد',
       st == 200 and len(pubcards) >= 1,
       f'{st} {len(pubcards) if isinstance(pubcards,list) else pubcards}')
    pubnames = [c.get('name') for c in pubcards] if isinstance(pubcards, list) else []
    ck('کارتِ عکسی در پروفایل عمومی دیده می‌شود',
       any(str(n or '').startswith(PFX) for n in pubnames), str(pubnames))

# ═══════════════════════════════════════════════════════════════════════
print('\n══ ۴: قفلِ کارت با عکس روی بقیهٔ اپ اثر ندارد ══')
# ═══════════════════════════════════════════════════════════════════════
# پنج کدِ غلط → کاربر قفل می‌شود. باید فقط همین مسیر قفل شود.
for i in range(5):
    req('POST', '/api/photo-cards/submit', ut, {'code': f'{PFX}-ZZ{i:02d}'},
        {'image': ('s.jpg', shot(imA), 'image/jpeg')})
st, r = req('POST', '/api/photo-cards/submit', ut, {'code': codes[1]},
            {'image': ('s.jpg', shot(imA), 'image/jpeg')})
ck('کاربر در مسیرِ عکس قفل شد', st == 429, f'{st} {r.get("status")}')
# بقیهٔ اپ باید کار کند
st, _ = req('GET', '/api/bootstrap', ut)
ck('bootstrap در حالت قفل کار می‌کند', st == 200, st)
st, _ = req('GET', '/api/pass', ut)
ck('گذر نبرد در حالت قفل کار می‌کند', st == 200, st)
st, _ = req('GET', '/api/wallet', ut)
ck('کیف پول در حالت قفل کار می‌کند', st == 200, st)
st, _ = req('GET', '/api/league/current', ut)
ck('لیگ در حالت قفل کار می‌کند', st == 200, st)
st, r = req('GET', '/api/chat/messages', ut)
ck('چت در حالت قفل کار می‌کند', st == 200, st)

# ═══════════════════════════════════════════════════════════════════════
print('\n══ ۵: بانکِ کدِ دو سیستم از هم جدا است ══')
# ═══════════════════════════════════════════════════════════════════════
# کدِ «کارت با عکس» نباید در مسیرِ قدیمی قابل استفاده باشد و برعکس.
st, r = req('POST', '/api/cards/redeem', ut, {'code': codes[2]})
ck('کدِ عکسی در مسیرِ قدیمی کار نمی‌کند', st != 200, f'{st} {r.get("message","")[:60]}')
st, cl = req('GET', f'/api/admin/photo-cards/codes?q={codes[2]}', at)
row = [c for c in cl.get('codes', []) if c['code'] == codes[2]]
ck('و مصرف هم نشد', row and row[0]['status'] == 'unused',
   str(row[0]['status'] if row else '—'))

# ═══════════════════════════════════════════════════════════════════════
print('\n══ ۶: با اشتراکِ **پلاس** هم گذر نبرد باز نمی‌شود ══')
# ═══════════════════════════════════════════════════════════════════════
# خواستهٔ صریح مالک: «ثبت کارت در هیچ حالتی نباید بتل پس رو چه در
# رایگان چه در پلاس باز کنه».
#
# چرا این جدا آزمایش می‌شود: در گذر نبرد، پلاس ضریبِ XP دارد. اگر
# جایی `grantXp` صدا زده شود، در حالتِ رایگان ممکن است گرد شود به صفر
# و دیده نشود، ولی با ضریبِ پلاس خودش را نشان بدهد. تستِ رایگان
# به‌تنهایی این را ثابت نمی‌کند.
UMOB2 = f'0900{(int(time.time()) + 7) % 1000000:06d}'
st, ru2 = req('POST', '/api/auth/register-password', body={
    'mobile': UMOB2, 'password': 'Qa!12345', 'firstName': 'تست',
    'lastName': 'پلاس', 'nickname': f'پلاس{PFX}'})
if st == 200 and ru2.get('token'):
    ut2 = ru2['token']
    _, b2 = req('GET', '/api/bootstrap', ut2)
    uid2 = (b2.get('user') or {}).get('id')
    # پلاس مستقیم در دیتابیس فعال می‌شود چون درگاه پرداخت وجود ندارد.
    import subprocess
    sql = ("insert into user_subscriptions(user_id,plan,price_paid,expires_at) "
           f"values('{uid2}','plus',59000,now()+interval '30 days')")
    subprocess.run(['python3', '/home/user/tools/rx.py',
                    f'sudo -u postgres psql -d ghelgheli -tAc "{sql}"'],
                   capture_output=True, timeout=120)
    _, ps2 = req('GET', '/api/pass', ut2)
    has_plus = bool(ps2.get('isPlus') or ps2.get('plus') or ps2.get('hasPlus'))
    ck('پلاس واقعاً فعال شد', has_plus,
       f'کلیدها: {[k for k in ps2 if "lus" in k or "remium" in k]}')

    codes2 = [f'{PFX}P-{i:04d}' for i in range(1, 4)]
    req('POST', '/api/admin/photo-cards/codes', at,
        {'rawCodes': '\n'.join(codes2)})
    beforeP = snapshot(ut2)
    st, r = req('POST', '/api/photo-cards/submit', ut2, {'code': codes2[0]},
                {'image': ('s.jpg', shot(imA), 'image/jpeg')})
    ck('ثبت با عکس (پلاس) پذیرفته شد',
       st == 200 and r.get('status') == 'approved',
       f'{st} {r.get("status")}')
    afterP = snapshot(ut2)
    dP = expect('ثبت با عکس + پلاس', beforeP, afterP,
                {'امتیاز', 'امتیاز کل', 'امتیاز لیگ', 'تعداد کارت',
                 'نوع کارت'})
    print('   تغییرات:', json.dumps(dP, ensure_ascii=False))
    ck('XP گذر نبرد با پلاس هم تکان نخورد',
       beforeP['XP گذر نبرد'] == afterP['XP گذر نبرد'],
       f'{beforeP["XP گذر نبرد"]} → {afterP["XP گذر نبرد"]}')
    ck('پلهٔ گذر نبرد با پلاس هم تکان نخورد',
       beforeP['پلهٔ گذر نبرد'] == afterP['پلهٔ گذر نبرد'])

    # مسیر قدیمی با پلاس
    if _plain:
        oldcode2 = f'{PFX}OLD2'
        st, _ = req('POST', '/api/admin/card-codes', at,
                    {'cardTypeId': tid, 'code': oldcode2})
        if st == 200:
            beforeQ = snapshot(ut2)
            st, r = req('POST', '/api/cards/redeem', ut2, {'code': oldcode2})
            ck('ثبت کد قدیمی (پلاس) پذیرفته شد', st == 200, f'{st} {r}')
            afterQ = snapshot(ut2)
            ck('XP گذر نبرد با پلاس + مسیر قدیمی تکان نخورد',
               beforeQ['XP گذر نبرد'] == afterQ['XP گذر نبرد'],
               f'{beforeQ["XP گذر نبرد"]} → {afterQ["XP گذر نبرد"]}')
            ck('پلهٔ گذر نبرد با پلاس + مسیر قدیمی تکان نخورد',
               beforeQ['پلهٔ گذر نبرد'] == afterQ['پلهٔ گذر نبرد'])
else:
    ck('ساخت کاربرِ پلاس', False, f'{st}')

print(f'\n{"✓" if bad == 0 else "✗"} {ok} موفق، {bad} ناموفق')
sys.exit(0 if bad == 0 else 1)
