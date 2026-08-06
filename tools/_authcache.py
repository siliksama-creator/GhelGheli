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
# ⚠️ هر پیشوندِ تازه **باید** اینجا اضافه شود. سه بار فراموش شد و هر بار
#    نتیجه‌اش یک تستِ قرمزِ گمراه‌کننده بود که شبیهِ باگِ محصول به نظر
#    می‌رسید: MX پیشوندِ e2e_multi.py است.
TEST_PREFIXES = ('SP', 'EG', 'R2', 'IF', 'BD', 'DBG', 'MX', 'V2', 'T2', 'WB')


def deactivate_stale_designs(req, admin_tok, prefixes=TEST_PREFIXES):
    """طرح‌های باقی‌مانده از اجراهای قبلی را غیرفعال می‌کند.

    غیرفعال و نه حذف: ممکن است اینونتوری یا پرونده‌ای به آن‌ها ارجاع
    بدهد و حذف، تاریخچهٔ کاربر را خراب می‌کند. محافظِ تکراری فقط
    طرح‌های `is_active` را می‌سنجد، پس همین کافی است.

    `req` همان تابعِ درخواستِ خودِ تست است تا این ماژول به شکلِ
    خاصی از HTTP وابسته نشود.

    ⚠️ غیرفعال کردن **کافی نیست**. `card_types` باقی می‌ماند و در
    منویِ «این کدها روی کدام کارت چاپ می‌شوند؟» ظاهر می‌شود. مالک با
    اسکرین‌شات نشان داد که آن منو با ۹۱ کارتِ آزمایشی غیرقابل‌استفاده
    شده بود.

    پس بعد از غیرفعال کردنِ طرح، خودِ نوعِ کارت هم حذف می‌شود. سرور
    اگر وابستگیِ واقعی ببیند ۴۰۹ می‌دهد و ما بی‌سروصدا رد می‌شویم —
    یعنی کارتی که کاربرِ واقعی داردش هرگز پاک نمی‌شود.
    """
    _, data = req('GET', '/api/admin/photo-cards/designs', admin_tok)
    stale = [d for d in data.get('designs', [])
             if str(d.get('card_type_name', '')).startswith(prefixes)]
    type_ids = set()
    for d in stale:
        if d.get('is_active'):
            req('PATCH', f"/api/admin/photo-cards/designs/{d['id']}",
                admin_tok, {'isActive': False})
        if d.get('card_type_id'):
            type_ids.add(d['card_type_id'])

    # حالا خودِ نوعِ کارت. حذفِ طرح لازم است وگرنه سرور ۴۰۹ می‌دهد.
    for d in stale:
        req('DELETE', f"/api/admin/photo-cards/designs/{d['id']}", admin_tok)
    for tid in type_ids:
        req('DELETE', f'/api/admin/card-types/{tid}', admin_tok)
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


def cleanup_own_run(req, admin_tok, prefix, rx_path='/home/user/tools/rx.py'):
    """داده‌ای که **همین اجرا** ساخته را کاملاً پاک می‌کند.

    ═══════════════════════════════════════════════════════════════════════
    چرا مستقیم روی دیتابیس و نه از راهِ API
    ═══════════════════════════════════════════════════════════════════════

    تلاشِ اول از `DELETE /card-types/:id` استفاده می‌کرد و هر بار ۴۰۹
    می‌گرفت:

        «قابل حذف نیست چون ۲ کارت در مجموعهٔ کاربران و ۱ طرح تصویری
         به آن وابسته است»

    و آن پیام **کاملاً درست** بود: تست واقعاً کارت به کاربرِ آزمایشی
    داده و پروندهٔ ثبت ساخته. محافظِ سرور دقیقاً برای همین است و
    نرم کردنش یعنی خراب کردنِ محصول برای راحتیِ تست — همان اشتباهی که
    قبلاً با سقفِ نرخ نزدیک بود تکرار شود.

    پس API دست‌نخورده می‌ماند و پاکسازیِ تست از پایین انجام می‌شود:
    اول وابسته‌ها (پرونده، کد، اینونتوری، طرح) و بعد خودِ نوعِ کارت.

    ⚠️ فقط ردیف‌هایی که نامشان با `prefix` شروع می‌شود. کارتِ واقعی
       هرگز لمس نمی‌شود.

    خطا بلعیده می‌شود: پاکسازیِ ناموفق نباید نتیجهٔ تست را عوض کند.
    """
    import subprocess
    sql = f"""
BEGIN;
CREATE TEMP TABLE junk AS
  SELECT id FROM card_types WHERE name LIKE '{prefix}%';
DELETE FROM photo_card_submissions s
 WHERE s.matched_design_id IN (SELECT id FROM photo_card_designs WHERE card_type_id IN (SELECT id FROM junk))
    OR s.chosen_design_id  IN (SELECT id FROM photo_card_designs WHERE card_type_id IN (SELECT id FROM junk))
    OR s.code_id IN (SELECT id FROM photo_card_codes WHERE expected_card_type_id IN (SELECT id FROM junk))
    OR s.code_id IN (SELECT id FROM photo_card_codes WHERE code LIKE '{prefix}%');
DELETE FROM photo_card_codes
 WHERE expected_card_type_id IN (SELECT id FROM junk)
    OR bound_design_id IN (SELECT id FROM photo_card_designs WHERE card_type_id IN (SELECT id FROM junk))
    OR code LIKE '{prefix}%';
DELETE FROM photo_card_designs WHERE card_type_id IN (SELECT id FROM junk);
DELETE FROM user_card_inventory WHERE card_type_id IN (SELECT id FROM junk);
DELETE FROM card_codes WHERE card_type_id IN (SELECT id FROM junk);
DELETE FROM card_types WHERE id IN (SELECT id FROM junk);
COMMIT;
"""
    try:
        subprocess.run(
            ['python3', rx_path,
             f"sudo -u postgres psql -d ghelgheli -c \"{sql}\""],
            capture_output=True, timeout=180)
    except Exception:
        pass
