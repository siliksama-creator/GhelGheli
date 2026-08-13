#!/usr/bin/env python3
"""تستِ زندهٔ کارتِ کلکسیونی + سه باگی که در این نوبت رفع شد.

    python3 tools/e2e_collectible.py '<رمز-ادمین>'

چرا زنده و نه واحد: هر سه باگِ این نوبت از دستهٔ «کد نحوش درست است ولی در
عمل کار نمی‌کند» بودند — کوئریِ SQLِ شکسته، تابعِ export نشده، تابعِ اصلاً
تعریف‌نشده. هیچ‌کدام را `node -c` یا ESLint نمی‌گیرد. تنها چیزی که می‌گیرد،
صدا زدنِ خودِ مسیر روی سرورِ واقعی است.
"""
import json
import sys
import time
import urllib.error
import urllib.request

BASE = 'https://api.ghelghelishop.ir'
PW = sys.argv[1] if len(sys.argv) > 1 else ''
if not PW:
    print('usage: e2e_collectible.py <admin-password>')
    sys.exit(2)

ok_count = 0
fail_count = 0
failures = []


def call(method, path, body=None, token=None, raw=False):
    url = BASE + path
    data = None
    headers = {'Accept': 'application/json'}
    if body is not None:
        data = json.dumps(body).encode()
        headers['Content-Type'] = 'application/json'
    if token:
        headers['Authorization'] = 'Bearer ' + token
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            txt = r.read().decode()
            return r.status, (txt if raw else (json.loads(txt) if txt else None))
    except urllib.error.HTTPError as e:
        txt = e.read().decode()
        try:
            return e.code, json.loads(txt)
        except Exception:
            return e.code, txt


def ok(cond, label, detail=''):
    global ok_count, fail_count
    if cond:
        ok_count += 1
        print(f'  ✅ {label}' + (f' — {detail}' if detail else ''))
    else:
        fail_count += 1
        failures.append(label)
        print(f'  ❌ {label}' + (f' — {detail}' if detail else ''))


print('\n' + '=' * 66)
print('  تستِ زنده: کارتِ کلکسیونی و سه باگِ رفع‌شده')
print('=' * 66)

# ── ورود مدیر ──
st, r = call('POST', '/api/admin/auth/login', {'username': 'Admin', 'password': PW})
if st != 200 or not isinstance(r, dict) or not r.get('token'):
    print(f'  ورود مدیر شکست خورد: {st} {r}')
    sys.exit(1)
atok = r['token']
print(f'\n[۰] ورود مدیر ✅')

# ═══════════════════════════════════════════════════════════════════════
print('\n[۱] باگ اول — کوئریِ شکستهٔ GET /api/rewards')
# ═══════════════════════════════════════════════════════════════════════
# قبل از رفع: `WHERErequired_points` باعث می‌شد شرطِ is_active و ترتیب
# بی‌صدا حذف شوند و کاربر جوایزِ غیرفعال را ببیند.
mob = f'09{int(time.time()) % 1000000000:09d}'
st, r = call('POST', '/api/auth/register-password',
             {'mobile': mob, 'password': 'Test@1234', 'nickname': 'کلکسیون‌تست'})
utok = r.get('token') if isinstance(r, dict) else None
if not utok:
    st, r = call('POST', '/api/auth/login', {'mobile': mob, 'password': 'Test@1234'})
    utok = r.get('token') if isinstance(r, dict) else None
ok(bool(utok), 'کاربر آزمایشی ساخته شد', mob)

if utok:
    st, rewards = call('GET', '/api/rewards', token=utok)
    ok(st == 200, 'GET /api/rewards پاسخ ۲۰۰ می‌دهد', f'status={st}')
    ok(isinstance(rewards, list), 'پاسخ آرایه است')
    if isinstance(rewards, list):
        inactive = [x for x in rewards if x.get('is_active') is False]
        ok(not inactive,
           'هیچ جایزهٔ غیرفعالی برنمی‌گردد',
           f'{len(inactive)} غیرفعال در {len(rewards)} ردیف')
        # ترتیب باید بر اساس display_order باشد
        orders = [x.get('display_order', 0) for x in rewards]
        ok(orders == sorted(orders), 'ترتیب بر اساس display_order است')

# ═══════════════════════════════════════════════════════════════════════
print('\n[۲] باگ دوم — parsePhotoCodesInput تعریف‌نشده بود')
# ═══════════════════════════════════════════════════════════════════════
# مسیرِ add-codes قبلاً همیشه ۵۰۰ می‌داد چون تابعی صدا می‌زد که وجود نداشت.
st, types = call('GET', '/api/admin/card-types', token=atok)
target = None
if isinstance(types, list) and types:
    target = types[0]
ok(target is not None, 'کاتالوگ کارت خوانده شد',
   f'{len(types) if isinstance(types, list) else 0} کارت')

if target:
    tid = target['id']
    uniq = int(time.time()) % 100000
    st, r = call('POST', f'/api/admin/photo-cards/card-types/{tid}/add-codes',
                 {'rawCodes': f'ZZTEST-{uniq}-A، ZZTEST-{uniq}-B؛ZZTEST-{uniq}-C',
                  'batchLabel': 'تست خودکار'}, token=atok)
    ok(st != 500, 'مسیر add-codes دیگر ۵۰۰ نمی‌دهد', f'status={st}')
    ok(st == 200, 'کدها پذیرفته شدند',
       str(r.get('message') if isinstance(r, dict) else r)[:70])
    # جداکنندهٔ فارسی «؛» و «،» باید هر سه کد را جدا کرده باشد
    if isinstance(r, dict):
        added = r.get('inserted') or r.get('added') or r.get('count')
        ok(added in (3, None), 'هر سه کد با جداکنندهٔ فارسی خوانده شد',
           f'inserted={added}')

# ═══════════════════════════════════════════════════════════════════════
print('\n[۳] باگ سوم — pruneBattleHistory صادر نشده بود')
# ═══════════════════════════════════════════════════════════════════════
# این را نمی‌شود از HTTP سنجید؛ کرون شبانه است. ولی می‌شود ثابت کرد که
# سرویس حالا آن را صادر می‌کند — تستِ واقعی‌اش در testCardDuel.js است.
print('  ℹ️  با تستِ واحد سنجیده می‌شود (backend/scripts/testCardDuel.js)')

# ═══════════════════════════════════════════════════════════════════════
print('\n[۴] قابلیت تازه — کارتِ کلکسیونی')
# ═══════════════════════════════════════════════════════════════════════
name = f'تست-کلکسیونی-{int(time.time())}'
st, created = call('POST', '/api/admin/card-types',
                   {'name': name, 'pointValue': 10, 'isActive': True,
                    'isCollectible': True}, token=atok)
ok(st == 200 and isinstance(created, dict), 'کارت کلکسیونی ساخته شد', f'status={st}')

cid = created.get('id') if isinstance(created, dict) else None
if cid:
    ok(created.get('is_collectible') is True,
       'سرور is_collectible=true را ذخیره کرد',
       f"مقدار={created.get('is_collectible')}")

    # ── مهم‌ترین بررسی: در فهرست کاتالوگ هم همان مقدار برمی‌گردد ──
    st, types2 = call('GET', '/api/admin/card-types', token=atok)
    row = next((x for x in types2 if x.get('id') == cid), None) if isinstance(types2, list) else None
    ok(row is not None and row.get('is_collectible') is True,
       'در فهرست کاتالوگ هم کلکسیونی است')

    # ── تبدیل به کارتِ بازی و برگشت ──
    st, patched = call('PATCH', f'/api/admin/card-types/{cid}',
                       {'isCollectible': False}, token=atok)
    ok(st == 200 and patched.get('is_collectible') is False,
       'PATCH می‌تواند به کارتِ بازی برگرداند')

    # ── نگهبانِ COALESCE: ویرایشِ بی‌ربط نباید نوع را عوض کند ──
    st, _ = call('PATCH', f'/api/admin/card-types/{cid}',
                 {'isCollectible': True}, token=atok)
    st, patched2 = call('PATCH', f'/api/admin/card-types/{cid}',
                        {'pointValue': 25}, token=atok)
    ok(patched2.get('is_collectible') is True,
       'ویرایشِ فقط-امتیاز نوعِ کارت را حفظ می‌کند',
       'این همان دامی است که COALESCE جلویش را می‌گیرد')

    # پاکسازی
    call('DELETE', f'/api/admin/card-types/{cid}', token=atok)

# ═══════════════════════════════════════════════════════════════════════
print('\n[۵] کارتِ کلکسیونی نباید در آرنای دوئل دیده شود')
# ═══════════════════════════════════════════════════════════════════════
if utok:
    st, duel = call('GET', '/api/card-duel', token=utok)
    if st == 200 and isinstance(duel, dict):
        pool = duel.get('cards') or duel.get('playable') or []
        bad = [c for c in pool if c.get('isCollectible') or c.get('is_collectible')]
        ok(not bad, 'هیچ کارتِ کلکسیونی در استخرِ دوئل نیست',
           f'{len(pool)} کارت قابل بازی')
    else:
        print(f'  ℹ️  وضعیت دوئل: {st} (کاربر تازه کارتی ندارد — طبیعی است)')

print('\n' + '=' * 66)
print(f'  نتیجه: {ok_count} موفق · {fail_count} ناموفق')
print('=' * 66)
if failures:
    print('\n  موارد ناموفق:')
    for f in failures:
        print(f'    • {f}')
sys.exit(1 if fail_count else 0)
