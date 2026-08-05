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


# ═══════════════════════════════════════════════════════════════════════════
# پیشوندهای دادهٔ تست — یک منبعِ واحد
# ═══════════════════════════════════════════════════════════════════════════
#
# هر تستِ سرتاسری طرح‌هایی با پیشوندِ خودش می‌سازد و در شروع، طرح‌های
# باقی‌ماندهٔ اجراهای قبلی را غیرفعال می‌کند تا محافظِ «طرح تکراری» مانع
# نشود.
#
# ⚠️ این فهرست قبلاً در **چهار فایل** کپی شده بود. وقتی
#    `e2e_interference.py` با پیشوندِ تازهٔ `IF` اضافه شد، سه فایلِ دیگر
#    آن را نمی‌شناختند — پس طرحِ `IF` فعال می‌ماند و `e2e_photospec` با
#    ۴۰۹ «طرح تکراری» می‌شکست.
#
# نکته: خودِ محافظ کاملاً درست کار می‌کرد (۹۴٪ شباهت را گرفت). این یک
# باگِ **هماهنگی بین تست‌ها** بود، نه باگِ محصول — و دقیقاً همان جنسِ
# خطایی که با کپی‌کردنِ یک لیست در چند جا ساخته می‌شود.
TEST_PREFIXES = ('SP', 'EG', 'R2', 'IF', 'BD', 'DBG')


def deactivate_stale_designs(req, admin_tok, prefixes=TEST_PREFIXES):
    """طرح‌های باقی‌مانده از اجراهای قبلی را غیرفعال می‌کند.

    غیرفعال و نه حذف: ممکن است اینونتوری یا پرونده‌ای به آن‌ها ارجاع
    بدهد و حذف، تاریخچهٔ کاربر را خراب می‌کند. محافظِ تکراری فقط
    طرح‌های `is_active` را می‌سنجد، پس همین کافی است.

    `req` همان تابعِ درخواستِ خودِ تست است تا این ماژول به شکلِ
    خاصی از HTTP وابسته نشود.
    """
    _, data = req('GET', '/api/admin/photo-cards/designs', admin_tok)
    stale = [d for d in data.get('designs', [])
             if str(d.get('card_type_name', '')).startswith(prefixes)
             and d.get('is_active')]
    for d in stale:
        req('PATCH', f"/api/admin/photo-cards/designs/{d['id']}",
            admin_tok, {'isActive': False})
    return len(stale)


# ═══════════════════════════════════════════════════════════════════════════
# کاربرِ تست: ساخت و پاکسازی
# ═══════════════════════════════════════════════════════════════════════════
#
# هر تستِ سرتاسری یک کاربرِ تازه می‌سازد (سهمیهٔ نرخ و قفلِ ۳ ساعته
# per-user هستند، پس استفادهٔ دوباره از یک کاربر تست را کور می‌کند).
#
# ⚠️ مشکلی که در عمل پیش آمد: آن کاربرها `active` می‌ماندند و در
#    **جدولِ لیگِ زنده** ظاهر می‌شدند. با چند بار اجرای تست، نُه ردیفِ
#    اولِ لیگ اسم‌هایی مثل «تداخلIF51008» بود — چیزی که هر کاربرِ
#    واقعی می‌دید.
#
# لیگ فقط `status='active'` را نشان می‌دهد، پس مسدود کردن کافی است.
# حذفِ کامل عمداً انجام نمی‌شود: ردیف‌های اینونتوری و پرونده‌های عکس به
# این کاربر ارجاع دارند و حذفشان تاریخچه را خراب می‌کند.
def block_test_user(rx_path, user_id):
    """کاربرِ تست را از جدولِ لیگ بیرون می‌برد.

    `rx_path` مسیرِ ابزارِ SSH است. خطا بلعیده می‌شود: ناموفق بودنِ
    پاکسازی نباید نتیجهٔ خودِ تست را عوض کند.
    """
    import subprocess
    try:
        subprocess.run(
            ['python3', rx_path,
             'sudo -u postgres psql -d ghelgheli -tAc '
             f'"update users set status=\'blocked\' where id=\'{user_id}\'"'],
            capture_output=True, timeout=120)
    except Exception:
        pass
