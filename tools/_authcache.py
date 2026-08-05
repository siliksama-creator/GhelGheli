# -*- coding: utf-8 -*-
"""کشِ توکنِ مدیر برای تست‌های سرتاسری.

═══════════════════════════════════════════════════════════════════════════
چرا این فایل لازم شد
═══════════════════════════════════════════════════════════════════════════

`adminLoginLimiter` سقفِ ۱۰ ورود در ۱۵ دقیقه دارد و کلیدش
`${req.ip}:${username}` است. این **درست** است و نباید عوض شود: ورودِ مدیر
تنها دری است که پشتش کلِ پنل قرار دارد و باید در برابر حدسِ رمز سخت باشد.

ولی هر تستِ سرتاسری در شروع یک بار لاگین می‌کند. با چهار تست و چند بار
اجرا حین باگ‌گیری، خیلی زود به سقف می‌خوریم و تست‌ها با
`KeyError: 'token'` می‌ترکند — که شبیهِ «سرور خراب است» به نظر می‌رسد در
حالی که سرور دقیقاً کار درست را کرده.

وسوسه‌کننده بود که سقف را بالا ببریم تا تست‌ها راحت شوند. آن یعنی ضعیف
کردنِ امنیتِ محصول برای راحتیِ ابزار — و دقیقاً همان اشتباهی که در
`submitLimiter` باعثِ باگِ CGNAT شده بود، فقط از جهتِ مخالف.

راهِ درست: توکن یک بار گرفته می‌شود و تا وقتی معتبر است دوباره استفاده
می‌شود. کاربرِ واقعی هم همین کار را می‌کند — هر درخواست دوباره لاگین
نمی‌کند.
"""
import json
import os
import time
import urllib.error
import urllib.request

API = 'https://api.ghelghelishop.ir'
CACHE = '/tmp/.ghelgheli_admin_token.json'
# عمرِ کش عمداً کوتاه‌تر از عمرِ واقعیِ توکن است تا هرگز با توکنِ
# منقضی‌شده وارد تست نشویم و خطا را با باگِ واقعی اشتباه نگیریم.
TTL = 45 * 60


def _login(password, username='Admin'):
    body = json.dumps({'username': username, 'password': password}).encode()
    req = urllib.request.Request(
        API + '/api/admin/auth/login', data=body,
        headers={'Content-Type': 'application/json'}, method='POST')
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return 200, json.loads(r.read() or b'{}')
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read() or b'{}')
        except Exception:
            return e.code, {}


def admin_token(password, username='Admin'):
    """توکنِ مدیر — از کش اگر تازه است، وگرنه با یک ورودِ جدید."""
    try:
        with open(CACHE, encoding='utf-8') as f:
            c = json.load(f)
        if c.get('user') == username and time.time() - c.get('at', 0) < TTL:
            return c['token']
    except Exception:
        pass

    st, r = _login(password, username)
    if st == 200 and r.get('token'):
        try:
            with open(CACHE, 'w', encoding='utf-8') as f:
                json.dump({'token': r['token'], 'at': time.time(), 'user': username}, f)
            os.chmod(CACHE, 0o600)
        except Exception:
            pass
        return r['token']

    if st == 429:
        raise SystemExit(
            '✗ ورودِ مدیر به سقفِ نرخ خورد (۱۰ در ۱۵ دقیقه).\n'
            '  این رفتارِ درستِ محصول است، نه باگ. چند دقیقه صبر کنید.\n'
            f'  کشِ توکن: {CACHE}')
    raise SystemExit(f'✗ ورودِ مدیر ناموفق: {st} {r}')
