# -*- coding: utf-8 -*-
"""دفترِ امتیاز زیرِ فشارِ همزمانی — روی سرورِ زنده.

═══════════════════════════════════════════════════════════════════════════
چرا این تست لازم است
═══════════════════════════════════════════════════════════════════════════

`e2e_points.py` صحتِ **منطقی** دفتر را می‌سنجد: منبع درست ثبت می‌شود،
جست‌وجو کار می‌کند، مدیر می‌تواند کسر کند. همهٔ آن‌ها تک‌درخواستی‌اند.

ولی خطرناک‌ترین حالتِ یک دفترِ مالی، **همزمانی** است:

  • دو کسبِ هم‌زمان می‌توانند `balance_after` یکسان ثبت کنند →
    دفتر برای همیشه دروغ می‌گوید
  • کسر و کسبِ هم‌زمان می‌توانند یکی‌شان گم شود
  • دو کسرِ هم‌زمان می‌توانند موجودی را منفی کنند

⚠️ هیچ‌کدام خطا نمی‌دهند. دفتر «سالم» به نظر می‌رسد و فقط عددهایش غلط
   است — بدترین حالتِ ممکن، چون مدیر به گزارش اعتماد می‌کند.

بازتولیدِ مستقیمِ الگو روی دیتابیس نشان داد `UPDATE ... RETURNING` امن
است (۸ تراکنشِ هم‌زمان → موجودیِ دقیق). این تست همان را از راهِ **API
واقعی** می‌سنجد، جایی که لایه‌های بیشتری در کارند.

اجرا:
    python3 tools/e2e_ledgerrace.py <رمزِ-مدیر>
"""
import atexit
import json
import os as _os
import sys
import sys as _sys
import threading
import time
import urllib.error
import urllib.request

_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from _authcache import admin_token, block_test_user  # noqa: E402

API = 'https://api.ghelghelishop.ir'
ok = bad = 0


def ck(n, c, d=''):
    global ok, bad
    if c:
        ok += 1
        print('  ✓', n)
    else:
        bad += 1
        print('  ✗', n, '→', str(d)[:220])


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
        with urllib.request.urlopen(r, timeout=120) as x:
            return x.status, json.loads(x.read() or b'{}')
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read() or b'{}')
        except Exception:
            return e.code, {}


apw = sys.argv[1] if len(sys.argv) > 1 else None
if not apw:
    raise SystemExit('استفاده: python3 tools/e2e_ledgerrace.py <رمزِ-مدیر>')
at = admin_token(apw)

mob = f'09{int(time.time() * 3) % 1000000000:09d}'
st, ru = req('POST', '/api/auth/register-password', body={
    'mobile': mob, 'password': 'Qa!12345', 'firstName': 'تست',
    'lastName': 'همزمانی', 'nickname': f'همز{mob[-5:]}'})
if st != 200 or not ru.get('token'):
    raise SystemExit(f'✗ ساخت کاربر نشد: {st}')
ut, uid = ru['token'], (ru.get('user') or {}).get('id')
atexit.register(lambda: block_test_user('/home/user/tools/rx.py', uid))
print(f'\nکاربر: {mob}')


def points_now():
    _, b = req('GET', '/api/bootstrap', ut)
    return int((b.get('user') or {}).get('current_points') or 0)


def ledger():
    # ⚠️ پاسخِ سرور `...hist` را spread می‌کند، پس کلیدِ ردیف‌ها
    #    `items` است نه `entries`. نسخهٔ اولِ این تست `entries` را
    #    می‌خواند و همیشه خالی می‌گرفت — یعنی سه بررسی بی‌صدا بی‌معنی
    #    شده بودند در حالی که «قرمز» به نظر می‌رسیدند.
    _, d = req('GET', f'/api/admin/points/user/{uid}?limit=200', at)
    return d.get('transactions') or []


# ═══════════════════════════════════════════════════════════════════════════
print('\n══ ۱. هشت افزایشِ هم‌زمان ══')
# اگر `balance_after` با مسابقه خراب شود، اینجا معلوم می‌شود.
N = 8
STEP = 25
res = {}
barrier = threading.Barrier(N)


def grant(i):
    barrier.wait()   # همه دقیقاً با هم شلیک کنند
    s, r = req('POST', f'/api/admin/users/{uid}/points', at,
               {'points': STEP, 'reason': f'تست همزمانی {i}'})
    res[i] = s


ths = [threading.Thread(target=grant, args=(i,)) for i in range(N)]
for t in ths:
    t.start()
for t in ths:
    t.join()
time.sleep(1.5)

okc = sum(1 for v in res.values() if v == 200)
ck(f'هر {N} درخواست پذیرفته شد', okc == N, f'{okc}/{N} — {res}')
bal = points_now()
ck(f'موجودی دقیقاً {N * STEP} است', bal == N * STEP,
   f'{bal} — امتیاز گم یا دوبار حساب شده')

# ⚠️ نامِ منبع `admin_adjust` است نه `admin_grant`. نسخهٔ اولِ این تست
#    نامی را حدس زد که در `SOURCES` وجود ندارد و همیشه فهرستِ خالی
#    می‌گرفت — تستی که «قرمز» بود ولی چیزی را نمی‌سنجید.
rows = [e for e in ledger() if e['source'] in ('admin_adjust', 'admin_grant')]
ck(f'{N} ردیف در دفتر ثبت شد', len(rows) >= N, f'{len(rows)}')

# ⚠️ مهم‌ترین بررسی: `balance_after`ها باید **یکتا** و پلکانی باشند.
#    اگر دو ردیف عددِ یکسان داشته باشند، یعنی هر دو موجودیِ قبل از
#    تغییرِ دیگری را دیده‌اند — دفتر دروغ می‌گوید.
bals = sorted(int(e['balance_after']) for e in rows[:N])
ck('هیچ دو ردیفی balance_after یکسان ندارند',
   len(set(bals)) == len(bals), f'{bals}')
ck('پلکانِ موجودی بدونِ جهش است',
   bals == [STEP * (i + 1) for i in range(N)], f'{bals}')

# ═══════════════════════════════════════════════════════════════════════════
print('\n══ ۲. کسر و کسبِ هم‌زمان ══')
before = points_now()
mixed = {}
b2 = threading.Barrier(6)


def mix(i):
    b2.wait()
    delta = 30 if i % 2 == 0 else -30
    s, r = req('POST', f'/api/admin/users/{uid}/points', at,
               {'points': delta, 'reason': f'ترکیبی {i}'})
    mixed[i] = (s, delta, str(r.get('message') or r)[:60])


ths = [threading.Thread(target=mix, args=(i,)) for i in range(6)]
for t in ths:
    t.start()
for t in ths:
    t.join()
time.sleep(1.5)
# سه مثبت و سه منفی → خالص صفر.
after = points_now()
ck(f'خالص صفر ماند ({before} → {after})', after == before,
   f'انتظار {before}، شد {after}')
print('   پاسخ‌ها:', mixed)
mixed_rows = [e for e in ledger() if 'ترکیبی' in str(e.get('description') or '')]
pos = [e for e in mixed_rows if int(e['delta']) > 0]
neg = [e for e in mixed_rows if int(e['delta']) < 0]
ck(f'هر ۶ ردیفِ ترکیبی در دفتر هست ({len(pos)}+ / {len(neg)}-)',
   len(mixed_rows) == 6,
   'ردیفی گم شده — کسر روی users اعمال شده ولی در دفتر ثبت نشده')

# ═══════════════════════════════════════════════════════════════════════════
print('\n══ ۳. کسرِ بیش از موجودی، موجودی را منفی نمی‌کند ══')
cur = points_now()
st, r = req('POST', f'/api/admin/users/{uid}/points', at,
            {'points': -(cur + 5000), 'reason': 'کسرِ بیش از موجودی'})
time.sleep(1)
final = points_now()
ck('درخواست پذیرفته شد', st == 200, f'{st} {str(r)[:90]}')
ck(f'موجودی صفر شد نه منفی ({final})', final == 0, f'{final}')

# ═══════════════════════════════════════════════════════════════════════════
print('\n══ ۴. دفتر با موجودی می‌خواند ══')
_, d = req('GET', f'/api/admin/points/user/{uid}?limit=200', at)
rows_all = d.get('transactions') or []
total = sum(int(e['delta']) for e in rows_all)
u = d.get('user') or {}
# ⚠️ جمعِ دفتر می‌تواند از موجودی **بیشتر** باشد، چون کسرِ بیش از
#    موجودی در `users` به صفر می‌رسد ولی در دفتر کاملش ثبت می‌شود.
#    این عمدی است: دفتر باید *قصدِ* مدیر را نگه دارد.
ck(f'دفتر {len(rows_all)} ردیف دارد', len(rows_all) > 0)
ck(f'موجودی {u.get("current_points")} ≥ صفر',
   int(u.get('current_points') or 0) >= 0)

# ═══════════════════════════════════════════════════════════════════════════
print('\n══ ۵. نگهبانِ صحت این کاربر را خراب گزارش نمی‌کند ══')
# ⚠️ اگر گزارشِ صحت به‌خاطر کسرِ سقف‌خورده هشدار بدهد، مدیر یاد می‌گیرد
#    نادیده‌اش بگیرد — و آن روز که هشدارِ واقعی بدهد هم نگاهش نمی‌کند.
# ⚠️ مسیرِ جداگانهٔ `/integrity` وجود ندارد. به‌جایش خودِ پاسخِ کاربر
#    پرچمِ `ledgerMatches` دارد — که طراحیِ بهتری هم هست: مدیر همان
#    جایی که عدد را می‌بیند، می‌فهمد قابلِ اتکا هست یا نه.
ck('پرچمِ ledgerMatches در پاسخ هست', 'ledgerMatches' in d,
   'مدیر باید بداند عدد را با احتیاط بخواند')
print(f'   دفتر={d.get("ledgerSum")}  موجودی={u.get("current_points")}  '
      f'می‌خواند={d.get("ledgerMatches")}')
# اینجا عمداً برابری **الزامی نیست**: کسرِ بیش از موجودی در `users` به
# صفر می‌رسد ولی در دفتر کامل ثبت می‌شود. پرچم باید این را صادقانه
# `false` نشان بدهد، نه اینکه پنهانش کند.
ck('پرچم با واقعیت می‌خواند',
   d.get('ledgerMatches') == (int(d.get('ledgerSum') or 0)
                              == int(u.get('current_points') or 0)),
   'پرچم دروغ می‌گوید')

print(f'\n{"✗" if bad else "✓"} {ok} موفق، {bad} ناموفق\n')
sys.exit(1 if bad else 0)
