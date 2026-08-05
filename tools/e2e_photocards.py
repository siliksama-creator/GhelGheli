#!/usr/bin/env python3
"""
تست سرتاسری «ثبت کارت از طریق عکس» روی سرور زنده.

چرا روی سرور زنده و نه mock: مسیر واقعی شامل multer، sharp، تراکنش
دیتابیس و کمیسیون معرف است. هیچ‌کدام در تستِ واحد پوشش داده نمی‌شوند و
دقیقاً همان‌جاها بود که باگ‌های قبلی این پروژه پیدا شدند.
"""
import io
import json
import sys
import urllib.request
import urllib.error
import uuid

API = 'https://api.ghelghelishop.ir'
BOUNDARY = '----ghelgheliE2E'

ok = 0
bad = 0
notes = []


def check(name, cond, detail=''):
    global ok, bad
    if cond:
        ok += 1
        print(f'  ✓ {name}')
    else:
        bad += 1
        print(f'  ✗ {name}  {detail}')
        notes.append(f'{name}: {detail}')


def req(method, path, token=None, body=None, files=None, raw=False):
    url = API + path
    headers = {}
    if token:
        headers['Authorization'] = 'Bearer ' + token
    data = None
    if files is not None:
        buf = io.BytesIO()
        for k, v in (body or {}).items():
            buf.write(f'--{BOUNDARY}\r\n'.encode())
            buf.write(f'Content-Disposition: form-data; name="{k}"\r\n\r\n'.encode())
            buf.write(f'{v}\r\n'.encode())
        for k, (fn, content, ct) in files.items():
            buf.write(f'--{BOUNDARY}\r\n'.encode())
            buf.write(
                f'Content-Disposition: form-data; name="{k}"; filename="{fn}"\r\n'
                .encode())
            buf.write(f'Content-Type: {ct}\r\n\r\n'.encode())
            buf.write(content)
            buf.write(b'\r\n')
        buf.write(f'--{BOUNDARY}--\r\n'.encode())
        data = buf.getvalue()
        headers['Content-Type'] = f'multipart/form-data; boundary={BOUNDARY}'
    elif body is not None:
        data = json.dumps(body).encode()
        headers['Content-Type'] = 'application/json'

    r = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(r, timeout=90) as resp:
            payload = resp.read()
            if raw:
                return resp.status, payload
            return resp.status, json.loads(payload or b'{}')
    except urllib.error.HTTPError as e:
        payload = e.read()
        try:
            return e.code, json.loads(payload or b'{}')
        except Exception:
            return e.code, {'raw': payload[:200].decode('utf8', 'replace')}


def main():
    admin_pw = sys.argv[1]
    user_mobile = sys.argv[2]
    user_pw = sys.argv[3]

    print('\n═══ ورود ═══')
    st, r = req('POST', '/api/admin/auth/login',
                body={'username': 'Admin', 'password': admin_pw})
    check('ورود مدیر', st == 200 and r.get('token'), f'{st} {r}')
    atok = r.get('token')

    st, r = req('POST', '/api/auth/login',
                body={'mobile': user_mobile, 'password': user_pw})
    check('ورود کاربر', st == 200 and r.get('token'), f'{st} {r}')
    utok = r.get('token')
    if not atok or not utok:
        return finish()

    # ── ساخت دو طرح متمایز ──
    print('\n═══ مدیر: آپلود عکس خام ═══')
    from PIL import Image, ImageDraw
    designs = {}
    for name, hue in [('E2E-آبی', 210), ('E2E-قرمز', 0)]:
        im = Image.new('RGB', (420, 640))
        d = ImageDraw.Draw(im)
        import colorsys
        for y in range(640):
            f = y / 640
            rr, gg, bb = colorsys.hsv_to_rgb(((hue + f * 50) % 360) / 360,
                                             0.75, 0.35 + 0.4 * f)
            d.line([(0, y), (420, y)], fill=(int(rr*255), int(gg*255), int(bb*255)))
        d.ellipse([90, 180, 330, 420],
                  fill=(255, 215, 60) if hue < 100 else (60, 220, 180))
        d.rectangle([0, 540, 420, 640], fill=(15, 15, 25))
        buf = io.BytesIO()
        im.save(buf, 'PNG')
        st, r = req('POST', '/api/admin/photo-cards/designs', token=atok,
                    body={'name': name, 'pointValue': '250', 'cashAmount': '0'},
                    files={'image': (f'{name}.png', buf.getvalue(), 'image/png')})
        check(f'آپلود طرح «{name}»', st == 200 and r.get('design'), f'{st} {r}')
        if st == 200:
            designs[name] = (r['design'], im)

    st, r = req('GET', '/api/admin/photo-cards/designs', token=atok)
    check('فهرست طرح‌ها', st == 200 and len(r.get('designs', [])) >= 2, f'{st}')

    # ── طرح تکراری باید رد شود ──
    # این در تست واقعی پیدا شد: دو نسخهٔ یکسان باعث می‌شدند همهٔ ثبت‌های
    # آن کارت بی‌سروصدا به بررسی دستی بروند.
    _, first_img = designs['E2E-آبی']
    dup = io.BytesIO(); first_img.save(dup, 'PNG')
    st, r = req('POST', '/api/admin/photo-cards/designs', token=atok,
                body={'name': 'تکراری', 'pointValue': '10'},
                files={'image': ('dup.png', dup.getvalue(), 'image/png')})
    check('طرح تکراری رد می‌شود', st == 409, f'{st} {str(r)[:120]}')

    # ── بانک کد مشترک ──
    print('\n═══ مدیر: بانک کد مشترک ═══')
    label = f'e2e-{uuid.uuid4().hex[:6]}'
    st, r = req('POST', '/api/admin/photo-cards/codes/generate', token=atok,
                body={'count': 60, 'batchLabel': label})
    check('تولید ۶۰ کد', st == 200 and r.get('createdCount') == 60, f'{st} {r}')
    sample = r.get('sample', [])
    check('نمونهٔ کد برگشت', len(sample) > 0, str(r)[:120])

    st, r = req('POST', '/api/admin/photo-cards/codes/generate', token=atok,
                body={'count': 999999})
    check('تعداد بیش از حد رد می‌شود', st == 400, f'{st}')

    st, r = req('GET', '/api/admin/photo-cards/codes/stats', token=atok)
    check('آمار کدها', st == 200 and r['stats']['unused'] >= 60, f'{st} {r}')

    # ── کاربر: مسیر موفق ──
    print('\n═══ کاربر: ثبت با عکس ═══')
    st, r = req('GET', '/api/photo-cards/status', token=utok)
    check('وضعیت قابلیت', st == 200 and r.get('available') is True, f'{st} {r}')

    from PIL import ImageFilter, ImageEnhance
    design_name = 'E2E-آبی'
    _, src = designs[design_name]

    def degraded(img, rot=6, blur=1.4, scale=0.32, bright=0.75):
        o = img.rotate(rot, expand=True, fillcolor=(28, 28, 34))
        o = o.resize((int(o.width*scale), int(o.height*scale)), Image.LANCZOS)
        o = o.filter(ImageFilter.GaussianBlur(blur))
        o = ImageEnhance.Brightness(o).enhance(bright)
        b = io.BytesIO()
        o.save(b, 'JPEG', quality=42)
        return b.getvalue()

    code1 = sample[0]
    st, r = req('POST', '/api/photo-cards/submit', token=utok,
                body={'code': code1},
                files={'image': ('shot.jpg', degraded(src), 'image/jpeg')})
    check('عکس بی‌کیفیت پذیرفته شد', st == 200 and r.get('status') == 'approved',
          f'{st} {json.dumps(r, ensure_ascii=False)[:200]}')
    if st == 200:
        check('امتیاز اضافه شد', r.get('addedPoints') == 250, str(r.get('addedPoints')))
        # ── حیاتی: عکس مدیر برمی‌گردد نه عکس کاربر ──
        check('تصویر اینونتوری = عکس مدیر',
              r.get('imageUrl') == designs[design_name][0]['image_url'],
              f"{r.get('imageUrl')}")

    # ── قفل شدن کد ──
    st, r = req('POST', '/api/photo-cards/submit', token=utok,
                body={'code': code1},
                files={'image': ('shot.jpg', degraded(src), 'image/jpeg')})
    check('کد استفاده‌شده دوباره قبول نمی‌شود', st == 409, f'{st} {r}')

    # ── کد ناشناخته ──
    st, r = req('POST', '/api/photo-cards/submit', token=utok,
                body={'code': 'GHP-ZZZZ-ZZZZ'},
                files={'image': ('shot.jpg', degraded(src), 'image/jpeg')})
    check('کد ناموجود رد می‌شود', st == 404, f'{st} {r}')

    # ── ارقام فارسی ──
    code_fa = sample[1]
    fa_digits = str.maketrans('0123456789', '۰۱۲۳۴۵۶۷۸۹')
    st, r = req('POST', '/api/photo-cards/submit', token=utok,
                body={'code': code_fa.translate(fa_digits).lower()},
                files={'image': ('shot.jpg', degraded(src), 'image/jpeg')})
    check('کد با ارقام فارسی و حروف کوچک کار می‌کند',
          st == 200 and r.get('status') == 'approved',
          f'{st} {json.dumps(r, ensure_ascii=False)[:160]}')

    # ── عکس نامرتبط ──
    noise = Image.effect_noise((300, 400), 90).convert('RGB')
    nb = io.BytesIO()
    noise.save(nb, 'JPEG', quality=60)
    st, r = req('POST', '/api/photo-cards/submit', token=utok,
                body={'code': sample[2]},
                files={'image': ('noise.jpg', nb.getvalue(), 'image/jpeg')})
    check('عکس نامرتبط قبول نمی‌شود', st in (422, 200) and r.get('status') != 'approved',
          f'{st} {json.dumps(r, ensure_ascii=False)[:160]}')

    # کد باید بعد از رد، دست‌نخورده بماند
    st2, r2 = req('GET', '/api/admin/photo-cards/codes/stats', token=atok)
    print(f'    وضعیت کدها: {r2.get("stats")}')

    # ── بدون عکس ──
    st, r = req('POST', '/api/photo-cards/submit', token=utok, body={'code': sample[3]},
                files={})
    check('بدون عکس رد می‌شود', st == 400, f'{st} {r}')

    # ── تاریخچه ──
    st, r = req('GET', '/api/photo-cards/my-submissions', token=utok)
    check('تاریخچهٔ کاربر', st == 200 and len(r.get('submissions', [])) >= 2, f'{st}')

    # ── دسترسی ──
    print('\n═══ دسترسی ═══')
    st, _ = req('GET', '/api/admin/photo-cards/designs')
    check('طرح‌ها بدون توکن مدیر ۴۰۱', st == 401, str(st))
    st, _ = req('GET', '/api/admin/photo-cards/designs', token=utok)
    check('توکن کاربر به پنل دسترسی ندارد', st in (401, 403), str(st))
    st, _ = req('POST', '/api/photo-cards/submit', body={'code': 'X'}, files={})
    check('ثبت بدون ورود ۴۰۱', st == 401, str(st))

    # ── سیستم قدیمی دست‌نخورده ──
    print('\n═══ سیستم فعلی «ثبت کد کارت» ═══')
    st, r = req('POST', '/api/cards/redeem', token=utok, body={'code': 'NOPE-NOT-A-CODE'})
    check('مسیر قدیمی هنوز کار می‌کند', st == 404, f'{st} {r}')
    st, r = req('GET', '/api/admin/card-codes', token=atok)
    check('فهرست کدهای قدیمی سالم است', st == 200, str(st))
    st, r = req('GET', '/api/bootstrap', token=utok)
    check('bootstrap کاربر سالم است', st == 200, str(st))

    finish()


def finish():
    print(f'\n{"✓" if bad == 0 else "✗"} {ok} موفق، {bad} ناموفق')
    for n in notes:
        print('   -', n)
    sys.exit(0 if bad == 0 else 1)


main()
