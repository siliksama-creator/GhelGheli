# -*- coding: utf-8 -*-
"""قانونِ «پلاس فقط یک باشگاه» روی سرورِ زنده.

═══════════════════════════════════════════════════════════════════════════
چرا این تست
═══════════════════════════════════════════════════════════════════════════

خواستهٔ صریح مالک: «دیگه پلاس اجازه عضویت در هر باشگاه رو نمیده، فقط
پلاس میتونه فقط یک باشگاه رو انتخاب کنه که به عنوان عکس پروفایلش قرار
داده بشه».

این قانون دو نیمه دارد که به‌راحتی می‌شود یکی را درست کرد و دیگری را
شکست:

  ۱. انتخابِ باشگاهِ جدید روی اشتراک باید قبلی را **جایگزین** کند.
  ۲. باشگاهی که کاربر **خریده** باید هرگز حذف نشود — پولش را داده.

نیمهٔ دوم خطرناک‌تر است: اگر خراب شود، کاربر چیزی را از دست می‌دهد که
بابتش پول داده، و ما هیچ‌وقت نمی‌فهمیم مگر اینکه شکایت کند.

استفاده: python3 e2e_clubs.py <admin-password>
"""
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _authcache import admin_token  # noqa: E402

API = 'https://api.ghelghelishop.ir'
RX = '/home/user/tools/rx.py'


def req(m, p, tok=None, body=None):
    h = {}
    if tok:
        h['Authorization'] = 'Bearer ' + tok
    d = None
    if body is not None:
        d = json.dumps(body).encode()
        h['Content-Type'] = 'application/json'
    r = urllib.request.Request(API + p, data=d, headers=h, method=m)
    try:
        with urllib.request.urlopen(r, timeout=60) as x:
            return x.status, json.loads(x.read() or b'{}')
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read() or b'{}')
        except Exception:
            return e.code, {}


def sql(q):
    """اجرای SQL روی سرور — برای کارهایی که API عمداً اجازه نمی‌دهد."""
    subprocess.run(
        ['python3', RX, f'sudo -u postgres psql -d ghelgheli -tAc "{q}"'],
        capture_output=True, timeout=120)


ok = bad = 0


def ck(n, c, d=''):
    global ok, bad
    if c:
        ok += 1
        print('  ✓', n)
    else:
        bad += 1
        print('  ✗', n, '→', str(d)[:160])


apw = sys.argv[1]
admin_token(apw)  # فقط برای اینکه زود بفهمیم رمز درست است

# کاربرِ تازه به‌ازای هر اجرا: عضویتِ باشگاه ماندگار است و اجرای دوم با
# همان کاربر نتیجهٔ اجرای اول را می‌بیند.
mob = f'0900{int(time.time()) % 1000000:06d}'
st, ru = req('POST', '/api/auth/register-password', body={
    'mobile': mob, 'password': 'Qa!12345', 'firstName': 'تست',
    'lastName': 'باشگاه', 'nickname': f'کلاب{int(time.time()) % 10000}'})
if st != 200 or not ru.get('token'):
    raise SystemExit(f'✗ ساخت کاربر ناموفق: {st} {ru}')
ut = ru['token']
_, b = req('GET', '/api/bootstrap', ut)
uid = b['user']['id']
print(f'کاربر تست: {mob}\n')

# پلاس مستقیم در دیتابیس فعال می‌شود — درگاه پرداخت وجود ندارد.
sql(f"insert into user_subscriptions(user_id,plan,price_paid,expires_at) "
    f"values('{uid}','plus',59000,now()+interval '30 days')")
sql(f"update users set wallet_balance=9999999 where id='{uid}'")

_, shop = req('GET', '/api/shop', ut)
items = shop.get('items', shop if isinstance(shop, list) else [])
clubs = [i for i in items if i.get('kind') == 'club_badge'][:3]
if len(clubs) < 3:
    raise SystemExit('✗ برای این تست حداقل سه باشگاه لازم است')


def mine():
    _, cl = req('GET', '/api/clubs', ut)
    return {m['slug']: m.get('permanent') for m in cl.get('mine', [])}


print('══ ۱: پلاس سه باشگاه پشت سر هم انتخاب می‌کند ══')
for c in clubs:
    req('POST', '/api/shop/equip', ut, {'slug': c['slug']})
d = mine()
ck('فقط یک باشگاه می‌ماند', len(d) == 1, d)
ck('و همان آخرین انتخاب است', clubs[-1]['payload'] in d, d)
ck('اشتراکی است نه دائمی', d.get(clubs[-1]['payload']) is False, d)

print('\n══ ۲: باشگاهِ خریداری‌شده هرگز حذف نمی‌شود ══')
buy = clubs[0]
st, r = req('POST', f"/api/shop/items/{buy['id']}/buy", ut, {})
ck('خرید موفق', st == 200, f"{st} {r.get('message')}")
req('POST', '/api/shop/equip', ut, {'slug': clubs[1]['slug']})
d = mine()
ck('خریداری‌شده باقی ماند', buy['payload'] in d, d)
ck('و دائمی علامت خورده', d.get(buy['payload']) is True, d)
ck('اشتراکیِ جدید هم هست', clubs[1]['payload'] in d, d)
ck('مجموعاً دو تا: یک خریداری + یک اشتراکی', len(d) == 2, d)

print('\n══ ۳: انتخابِ بعدی فقط اشتراکی را جابه‌جا می‌کند ══')
req('POST', '/api/shop/equip', ut, {'slug': clubs[2]['slug']})
d = mine()
ck('هنوز دو تا', len(d) == 2, d)
ck('خریداری‌شده دست‌نخورده', d.get(buy['payload']) is True, d)
ck('اشتراکیِ قبلی رفت', clubs[1]['payload'] not in d, d)
ck('اشتراکیِ جدید آمد', clubs[2]['payload'] in d, d)

print('\n══ ۴: بدون پلاس نمی‌شود باشگاهِ نخریده را انتخاب کرد ══')
sql(f"delete from user_subscriptions where user_id='{uid}'")
# باشگاهی که نه خریده و نه الان عضوش است
spare = [c for c in clubs if c['payload'] not in d]
if spare:
    st, r = req('POST', '/api/shop/equip', ut, {'slug': spare[0]['slug']})
    ck('رد می‌شود', st == 403, f"{st} {r.get('message')}")
else:
    # هر سه باشگاه درگیرند؛ یکی دیگر از کاتالوگ بردار.
    other = [i for i in items
             if i.get('kind') == 'club_badge' and i['payload'] not in d]
    if other:
        st, r = req('POST', '/api/shop/equip', ut, {'slug': other[0]['slug']})
        ck('رد می‌شود', st == 403, f"{st} {r.get('message')}")

print(f'\n{"✓" if bad == 0 else "✗"} {ok} موفق، {bad} ناموفق')
# کاربرِ تست نباید در جدولِ لیگ دیده شود.
sql(f"update users set status='blocked' where id='{uid}'")
sys.exit(0 if bad == 0 else 1)
