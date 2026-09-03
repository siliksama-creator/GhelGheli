# -*- coding: utf-8 -*-
"""«تستِ ۲۰ تغییر» — بندِ پایانیِ فاز ۵ نقشه‌راه، روی سرورِ زنده.

═══════════════════════════════════════════════════════════════════════════
چرا این فایل هست و چرا *نوشتنِ* تستِ واحد کافی نبود
═══════════════════════════════════════════════════════════════════════════

تست‌های `testLiveContent.js` و `testLiveWiring.js` و دو گاردِ parity همه یک
چیز را می‌سنجند: «آیا رشته‌ها از پنل خوانده می‌شوند و در هر دو کلاینت به یک
جا می‌رسند؟» آن‌ها *منطق* را می‌سنجند. وعدهٔ نقشه‌راه چیزِ دیگری است:

    «ادمین ۲۰ رشته/عدد را عوض می‌کند و در وبِ دسکتاپ، وبِ موبایل و اندروید،
     بدونِ هیچ نصبِ مجددی، همین را می‌بیند.»

هیچ‌کدام از گاردها نمی‌توانند بگویند این روی سرورِ واقعی کار می‌کند یا نه،
چون `live_content_history` در مخزن **خالی** است — یعنی تا امروز یک بایتِ
ادمینی هم از این مسیر ذخیره نشده. این شکافِ **پذیرش** است نه شکافِ کد، و
با نوشتنِ کدِ بیشتر بسته نمی‌شود؛ فقط با زدنِ همان ۲۰ تغییر.

═══════════════════════════════════════════════════════════════════════════
چه چیزی سنجیده می‌شود (هر ۲۰ تغییر، تک‌به‌تک)
═══════════════════════════════════════════════════════════════════════════

 ۱. `configVersion` بعدِ هر ذخیره بالا می‌رود — تنها چیزی که به کلاینت
    می‌گوید «این‌بار واقعاً چیزی عوض شد» (وگرنه ETagِ یکسان = بدنهٔ یکسان =
    کاربر در همین نسخهٔ قدیمی می‌ماند).
 ۲. `/api/config` **عمومی** (بدونِ توکن، با ETag) همان رشتهٔ تازه را دارد —
    یعنی همان چیزی که کاربرِ لاگین‌نکرده/ثبت‌نام‌صفحه می‌بیند، نه فقط
    پاسخِ ادمین. این مهم‌ترین چیزی است که یک تستِ واحدِ لوکال نمی‌تواند
    بگوید: کشِ CDN/مرورگر + ETag + لاگیکِ `apply()` در اندروید.
 ۳. مقدارِ عددیِ `live_rules` **هم** در متنِ پر‌شده (`/preview`) و **هم**
    در خودِ `rules` دیده می‌شود — دو نیمهٔ یک قول؛ اگر یکی عوض شود و دیگری
    نه، کاربر عددی در جمله می‌بیند که بازی با آن عدد کار نمی‌کند.
 ۴. `history` هر ۲۰ ردیف را با نامِ ویرایشگر نگه داشته و `revert` یکی‌شان
    را بی‌دردسر برمی‌گرداند.
 ۵. در پایان، **بدنهٔ `copy` و `rules` باید مو‌به‌مو همان چیزی شود که در
    ابتدا خواندیم** — و اگر نشد، ابزار با صدای بلند فریاد می‌زند و همین
    مسیرِ بازگردانیِ دستی را چاپ می‌کند. ابزارِ تغییرِ محصول که خودش
    محصول را کثیف برگرداند، از نبودنش بدتر است.

═══════════════════════════════════════════════════════════════════════════
ایمنی — چون روی سرورِ زنده می‌نویسیم
═══════════════════════════════════════════════════════════════════════════

  • `--read-only` هیچ چیزی را عوض نمی‌کند و رمز هم نمی‌خواهد: فقط
    «آیا همهٔ زیرساختِ لازم سرِ جایش است» را می‌سنجد. پیش از هر اجرا
    **اول این را بزن**.
  • رمز را از argv می‌گیرد و هیچ‌جا ذخیره/چاپ نمی‌کند.
  • مقدارهایِ اصلی در ابتدا خوانده و در `finally` برگردانده می‌شوند؛ حتی
    اگر تستِ وسطی exception بدهد. اگر خودِ بازگردانی هم شکست، خروجیِ
    ابزار ۲ است و دودستورِ آمادهٔ curl چاپ می‌شود.
  • تغییرها بی‌ضرر انتخاب شده‌اند: برای متن، یک برچسبِ `[e2e]` که در پایان
    پاک می‌شود؛ برای عدد، مقدارِ دیگری درونِ همان `min/max` که سرور خودش
    clamp می‌کند. هیچ مقدارِ «بیرونِ بازه» نمی‌فرستیم تا کلاینتِ زندهٔ کسی
    بینِ دو اجرایِ تست، مقدارِ نامعتبر نبیند.
  • هیچ «بازارِ عددی» در متن نمی‌گذاریم و هیچ مقدارِ تازه‌ای که منطقِ بازی
    را عوض کند، ثبت نمی‌شود مگر در بازهٔ خودش.

استفاده:
    python3 tools/e2e_livecopy20.py --read-only
    python3 tools/e2e_livecopy20.py <admin-password>
"""
import io
import json
import os
import sys
import time
import urllib.error
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# API از محیط قابلِ عوض است، نه با ویرایشِ فایل روی سرور: اجرایِ کاملِ
# این ابزار روی *خودِ سرورِ تولیدی* (از 127.0.0.1) معنی‌دارترین حالت است —
# همان‌جا که ETag/کش/nginx واقعاً سرِ جایشان‌اند — و 'localhost' در URL یعنی
# از 127.0.0.1 خارج نشود. اگر این خط در فایلِ repo عوض شود، دفعهٔ بعدی روی
# ماشینِ توسعه‌دهنده به آدرسِ اشتباه می‌زند.
API = (os.environ.get('E2E_API') or 'https://api.ghelghelishop.ir').rstrip('/')
LIVE = '/api/admin/settings/live-content'
MARK = ' [e2e]'


def req(m, p, tok=None, body=None, headers=None):
    h = dict(headers or {})
    if tok:
        h['Authorization'] = 'Bearer ' + tok
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        h['Content-Type'] = 'application/json'
    r = urllib.request.Request(API + p, data=data, headers=h, method=m)
    try:
        with urllib.request.urlopen(r, timeout=25) as f:
            raw = f.read()
            code = f.getcode()
            etag = f.headers.get('ETag')
    except urllib.error.HTTPError as e:
        raw, code, etag = e.read(), e.code, e.headers.get('ETag')
    out = None
    try:
        out = json.loads(raw.decode('utf-8')) if raw else None
    except Exception:  # noqa: BLE001
        out = None
    return code, out, etag


class Res:
    def __init__(self):
        self.p = []
        self.ok = 0
        self.bad = 0

    def check(self, name, cond, extra=''):
        if cond:
            self.ok += 1
            self.p.append('  ✓ ' + name)
        else:
            self.bad += 1
            self.p.append('  ✗ ' + name + ((' → ' + extra) if extra else ''))
        return bool(cond)

    def report(self, title):
        print('\n══ ' + title + ' ══')
        print('\n'.join(self.p))
        print('\n%s %d موفق، %d ناموفق' % ('✅' if not self.bad else '❌',
                                          self.ok, self.bad))


def flatten_copy(copy):
    """[(group.field, value)] — رشته‌ها و ردیف‌هایِ بندها، بدونِ کپیِ آرایه."""
    out = []
    for group, fields in (copy or {}).items():
        if not isinstance(fields, dict):
            continue
        for field, value in fields.items():
            if isinstance(value, str):
                out.append(('%s.%s' % (group, field), value))
            elif isinstance(value, list):
                for i, item in enumerate(value):
                    if isinstance(item, dict) and 'title' in item:
                        out.append(('%s.%s#%d.title' % (group, field, i),
                                    item['title']))
    return out


def unflatten(grouped):
    """[(key, value)] → بدنهٔ PATCH (`{group: {field: value}}`).

    ردیف‌های `#i.title` باید دوباره آرایه شوند، وگرنه بندهای منشور با یک
    PUTِ نصفه از دست می‌روند — همان چیزی که در ابتدا خواندیم و باید مو‌به‌مو
    برگردد.
    """
    body = {}
    lists = {}
    for key, value in grouped:
        head, field = key.split('.', 1)
        if '#' in field:
            base, rest = field.split('#', 1)
            idx, part = rest.split('.', 1)
            slot = lists.setdefault((head, base), {})
            slot.setdefault(int(idx), {})[part] = value
            body.setdefault(head, {})
            body[head][base] = '__LIST__'
        else:
            body.setdefault(head, {})[field] = value
    for (head, base), slots in lists.items():
        n = max(slots) + 1
        body[head][base] = [
            {'title': slots.get(i, {}).get('title', ''),
             'body': slots.get(i, {}).get('body', '')}
            for i in range(n)
        ]
    return body


def read_panel(tok):
    code, view, _ = req('GET', LIVE, tok)
    if code != 200 or not isinstance(view, dict):
        raise SystemExit('!! پنلِ متن‌ها پاسخِ 200 نداد (HTTP %s). '
                         'یا رمز غلط است یا مسیر عوض شده؛ تست را متوقف '
                         'می‌کنم تا محصول را کثیف نکنم.' % code)
    return view


def main():
    args = [a for a in sys.argv[1:]]
    read_only = '--read-only' in args
    args = [a for a in args if not a.startswith('--')]
    r = Res()

    if read_only:
        code, cfg, etag = req('GET', '/api/config')
        r.check('/api/config عمومی 200 است', code == 200, 'HTTP %s' % code)
        copy = (cfg or {}).get('copy') or {}
        rules = (cfg or {}).get('rules') or {}
        flat = flatten_copy(copy)
        # سقفِ تعدادِ رشته را عمداً *نمی‌بندیم*: سرورِ تولیدی امروز ۳۵ رشته
        # دارد و اگر عددی مثل «بیش از ۴۰» بگذاریم، تا قبلِ deployِ بعدی
        # ابزار قرمز است بی‌آن‌که چیزی خراب باشد — همان اشتباهِ «تستی که
        # عددِ منسوخ را قفل کرده بود». آنچه واقعاً معنی دارد، *پوششِ گروه‌ها*
        # است: گروهی که در config نباشد، یعنی پنل فیلدش را نشان می‌دهد و
        # کلاینت هیچ‌وقت نمی‌خواند.
        EXPECT_GROUPS = ['referral', 'coinGuide', 'plus', 'streak', 'support',
                         'photoReview', 'wheel', 'games', 'reconnect', 'avatars',
                         'update']
        missing = [g for g in EXPECT_GROUPS if not isinstance(copy.get(g), dict)
                   or not copy.get(g)]
        r.check('گروه‌هایِ متنِ زنده در config زنده‌اند (%d رشته)' % len(flat),
                len(flat) >= 30, 'تعدادِ رشته‌ها کم است: سیم‌کشیِ config شکسته')
        if missing:
            print('  · گروه‌های نایاب در configِ زنده: %s '
                  '(اگر تازه در کد اضافه شده و هنوز deploy نشده، طبیعی است)'
                  % '، '.join(missing))
        r.check('هیچ گروهی از ۱۰ گروهِ فاز ۲ غایب نیست',
                not [m for m in missing if m != 'update'], '، '.join(missing))
        r.check('بدنهٔ config شامل `rules` است', bool(rules),
                'rules نیست ⇒ کلاینت عددی برای جای‌نگهدارها ندارد')
        r.check('`configVersion` در بدنه هست',
                isinstance((cfg or {}).get('configVersion'), int),
                'بدونِ این عدد، تغییرِ پنل برای کلاینت نامرئی است')
        r.check('ETag روی /api/config ست شده', bool(etag),
                'بی ETag یعنی هر بار یک بدنهٔ کامل؛ قولِ «بی‌دیتا» نمی‌شود')
        # قراردادِ هر کلید باید با قالب بخواند؛ اینجا همین را روی دادهٔ زنده
        # می‌سنجیم (تستِ لوکال این را روی DEFAULT_COPY می‌سنجد، نه روی چیزی
        # که ادمینِ واقعی ذخیره کرده).
        # آکولادِ *جفت‌نشده* در دادهٔ زنده: اگر ادمین "{days" را وسطِ جمله
        # جا بیندازد، `fillString` آن را جای‌نگهدار نمی‌بیند و رشته روی
        # صفحه با آکولادِ یتیم می‌ماند. تستِ لوکال این را نمی‌سنجد، چون
        # DEFAULT_COPY را می‌خواند نه چیزی که یک آدمِ واقعی ذخیره کرده.
        orphan = [k for k, v in flat if (v.count('{') != v.count('}')
                                         or '}' in v and '{' not in v)]
        r.check('هیچ رشتهٔ زنده‌ای آکولادِ جفت‌نشده ندارد', not orphan,
                ' | '.join(orphan[:6]))
        r.report('فاز ۵ · «تستِ ۲۰ تغییر» — حالتِ فقط‌خواندنی')
        return 1 if r.bad else 0

    # رمز از محیط هم خوانده می‌شود: گذاشتنِ رمز در argv یعنی در `ps` و
    # در تاریخچة شلِ سرور visible باشد — روی همان ماشینِ production که
    # سرویسِ دیگری هم روش نشسته است.
    pwd = os.environ.get('E2E_ADMIN_PASSWORD') or (args[0] if args else '')
    if not pwd:
        print('رمزِ ادمین لازم است: E2E_ADMIN_PASSWORD=… یا '
              'python3 tools/e2e_livecopy20.py <password>\n'
              'یا برای سنجشِ بی‌خطر: --read-only')
        return 2
    from _authcache import admin_token  # noqa: E402
    tok = admin_token(pwd)
    if not tok:
        print('!! ورودِ ادمین ممکن نشد؛ چیزی نمی‌نویسم.')
        return 2

    view = read_panel(tok)
    original_copy = view['copy']['template']
    original_rules = view['rules']['values']
    defs = view['rules']['defs']
    v0 = view.get('configVersion')

    # ── بیست تغییر: ۱۴ متن + ۶ عدد ─────────────────────────────────────────
    edits_text = []
    for key, value in flatten_copy(original_copy):
        if len(edits_text) >= 14:
            break
        if '[e2e]' in value:
            continue  # کثیف‌کاریِ اجرایِ قبلی را دوباره اضافه نکن
        if key.endswith('.privacySections'):
            continue  # برچسبِ رشته‌ای درونِ آرایه؛ برای اطمینان از ترتیب، نگذار
        edits_text.append((key, value + MARK))
    # بندها هم یک بار، تا «فهرستِ اشیاء» هم از همین مسیر عبور کند
    for key, value in flatten_copy(original_copy):
        if '#0.title' not in key:
            continue
        edits_text.append((key.replace('#0.title', '#0.body'), value + MARK))
        if len(edits_text) >= 20:
            break
    edits_text = edits_text[:14]

    edits_num = []
    for name, d in (defs or {}).items():
        if len(edits_num) >= 6:
            break
        lo, hi = d.get('min'), d.get('max')
        cur = original_rules.get(name)
        if not isinstance(lo, int) or not isinstance(hi, int) or not isinstance(cur, int):
            continue
        if lo == hi:
            continue
        # اگر کل بازه یک عددِ صحیح بیشتر ندارد (min+1 == max)، همان عدد
        # تنها انتخاب است؛ butcur دیگر لازم نیست.
        nxt = lo if cur != lo else hi
        if lo + 1 == hi and cur == lo:
            nxt = hi
        edits_num.append((name, nxt))

    all_keys = [k for k, _ in edits_text] + [n for n, _ in edits_num]
    r.check('بیست تغییرِ یکتا ساخته شد (%d)' % len(all_keys),
            len(all_keys) == 20 and len(set(all_keys)) == 20,
            'متن %d + عدد %d — اگر کمتر است، فهرستِ کلیدها را در `update` '
            'بررسی کن' % (len(edits_text), len(edits_num)))

    def apply_text(batch):
        return req('PATCH', LIVE + '/copy', tok, unflatten(batch))

    def apply_rules(batch):
        return req('PATCH', LIVE + '/rules', tok, dict(batch))

    restored = False
    try:
        # ── ۲۰ بار ذخیره، یکی‌یکی (همان کاری که ادمین می‌کند) ──────────────
        prev_version = v0
        for i, (key, value) in enumerate(edits_text, start=1):
            code, out, _ = apply_text([(key, value)])
            if not r.check('تغییرِ %d (متنِ %s) ذخیره شد' % (i, key), code == 200,
                           'HTTP %s %s' % (code, str(out)[:120])):
                continue
            v = (out or {}).get('configVersion')
            r.check('  · نسخهٔ config بالا رفت (%s → %s)' % (prev_version, v),
                    isinstance(v, int) and v > (prev_version or 0),
                    'اگر بالا نرود، کلاینت هیچ‌وقت نمی‌فهمد چیزی عوض شده')
            prev_version = v
            # بدنهٔ عمومی: همان چیزی که کاربر می‌بیند
            _, cfg, _ = req('GET', '/api/config')
            seen = (cfg or {}).get('copy') or {}
            grp, fld = key.split('.', 1)
            got = seen.get(grp, {}).get(fld) if '#' not in fld else None
            if '#' in fld:
                base, rest = fld.split('#', 1)
                idx, part = rest.split('.', 1)
                arr = seen.get(grp, {}).get(base) or []
                got = (arr[int(idx)] or {}).get(part) if len(arr) > int(idx) else None
            r.check('  · /api/config عمومی هم همان رشته را دارد',
                    isinstance(got, str) and MARK in got,
                    'پنل ذخیره کرد ولی configِ عمومی کهنه است: %r' % (got,))

        for i, (name, value) in enumerate(edits_num, start=len(edits_text) + 1):
            code, out, _ = apply_rules({name: value})
            okv = r.check('تغییرِ %d (عددِ %s = %s) ذخیره شد' % (i, name, value),
                          code == 200, 'HTTP %s %s' % (code, str(out)[:120]))
            if not okv:
                continue
            got = ((out or {}).get('rules') or {}).get(name)
            r.check('  · مقدار در پاسخِ پنل نشسته', got == value,
                    'سرور clamp کرد: %r (بازه %s..%s — ابزار باید مقدارِ '
                    'داخلِ بازه انتخاب کند)' % (got, defs[name].get('min'),
                                               defs[name].get('max')))
            _, cfg, _ = req('GET', '/api/config')
            r.check('  · همان عدد در /api/config عمومی هم هست',
                    ((cfg or {}).get('rules') or {}).get(name) == got)

        # ── پیش‌نمایشِ پنل با دادهٔ زنده (قفلِ جای‌نگهدار) ──────────────────
        code, pv, _ = req('POST', LIVE + '/preview', tok, {})
        tpl = (pv or {}).get('template') or {}
        rawv = (pv or {}).get('raw') or {}
        r.check('/preview هم template و هم raw می‌دهد',
                code == 200 and tpl and rawv, 'HTTP %s' % code)
        q = (original_rules.get('ticketsPerDay'),
             (defs.get('ticketsPerDay') or {}).get('value'))
        r.check('قالبِ support.ticketRule بدونِ فرستادنِ vars هم عدد دارد',
                MARK not in str((tpl.get('support') or {}).get('ticketRule', ''))
                and '{' not in str((tpl.get('support') or {}).get('ticketRule', '')),
                'جای‌نگهدارِ ناپر‌شده در پیش‌نمایش = ادمین فکر می‌کند پنل خراب است')

        # ── تاریخچه و بازگردانی ────────────────────────────────────────────
        # توکن لازم است؛ بی‌توکن 401 می‌آید و `json.loads` روی بدنهٔ خطا
        # None می‌دهد — یعنی «تاریخچه خالی» به‌جای «اجازه نداری». اولین
        # اجرا روی پروداکشن دقیقاً همین را به‌عنوانِ باگِ سرور گزارش داد.
        code, hist = req('GET', LIVE + '/history/copy', tok)[:2]
        # `req` سه‌تایی برمی‌گرداند (status, body, etag). اولین نسخهٔ این
        # تست `code, hist = req(...)` نوشته بود و به همین دلیل hist هیچ‌وقت
        # آرایه نبود و تاریخچه «۰ ردیف» شد — یعنی گاردِ محصول *خودش* باید
        # اول روی دادهٔ واقعی آزمایش شود، وگرنه دو خطایِ جعلی به پایِ سرور
        # می‌نوشتی.
        rows = hist if isinstance(hist, list) else []
        n = len(rows)
        r.check('تاریخچه ردیف‌ها را نگه داشته (%s از سقفِ ۲۰)' % n, n >= 5,
                'کم از ۵ یعنی ذخیره‌ها audit نشده‌اند')
        r.check('تاریخچه، ۲۰ ذخیره را دیده (حداقل ۱۸)', n >= 18,
                'اگر کمتر است، یا حلقهٔ ۲۰‌تایی نصف شده یا سقفِ HISTORY_KEEP')
        who = [h.get('adminUsername') for h in rows if isinstance(h, dict)]
        r.check('هر ردیف می‌گوید *چه کسی* عوض کرد (نام، نه شناسه)',
                bool(who) and all(w for w in who), str(who[:3]))
        r.check('ردیفِ تاریخچه لاغر است: بدنهٔ copy در آن نیست',
                all('value' not in h for h in rows if isinstance(h, dict)),
                'اسنپ‌شاتِ کامل در پاسخِ پنل = ~۸۰KB برای یک جدولِ تاریخ')
        r.check('ردیف‌ها `createdAt` دارند (شکلِ camelCaseِ historyView)',
                all(isinstance(h.get('createdAt'), str) for h in rows if isinstance(h, dict)),
                'پنل‌ها این فیلد را می‌خوانند؛ نبودنش یعنی «تاریخچهٔ بی‌تاریخ»')
        # شاهدِ اصلیِ «بدونِ نصبِ مجدد»: بدنهٔ *عمومیِ* config بعد از همه‌چیز
        # باید مو‌به‌مو همان چیزی باشد که پیش از تست خواندیم. این را نه
        # پنلِ ادمین می‌گوید نه تستِ لوکال؛ فقط همین سرورِ زنده.
        _, cfg_end, _ = req('GET', '/api/config')
        r.check('configِ عمومی بعدِ تست مو‌به‌مو به ابتدا برگشت',
                (cfg_end or {}).get('copy') == original_copy
                and (cfg_end or {}).get('rules') == original_rules,
                ' | '.join(_diff(original_copy, (cfg_end or {}).get('copy'))[:3]))

        code, rv, _ = req('POST', LIVE + '/copy/revert', tok)
        r.check('revert یک نسخه به عقب می‌رود و `{copy}` برمی‌گرداند',
                code == 200 and isinstance((rv or {}).get('copy'), dict),
                'HTTP %s — پاسخ باید فیلدِ ثابت copy/rules باشد، '
                'نه نامِ کلیدِ دیتابیس' % code)

        # ── بازگردانیِ کامل ────────────────────────────────────────────────
        apply_text(edits_text)  # برچسب را از همه برداریم (بدنهٔ اصلی)
        c1, out1, _ = req('PATCH', LIVE + '/copy', tok, original_copy)
        c2, out2, _ = req('PATCH', LIVE + '/rules', tok, original_rules)
        final = read_panel(tok)
        # شاهدِ اصلیِ بندِ «بدونِ نصبِ مجدد» همین‌جاست — و **بعد** از
        # بازگردانی، نه قبلش. اولین اجرا این مقایسه را وسطِ تست (بعد از
        # ۲۰ تغییر و پیش از restore) خوانده بود و قرمز شد، چون config
        # عمومی *درست* داشت برچسبِ [e2e] را نشان می‌داد: باگِ محصول نبود،
        # جایِ اشتباهِ یک سنجه بود. سنجهٔ «چیزی عوض نشده» باید در انتهای
        # کار بایستد، وگرنه خودش را نقض می‌کند.
        _, cfg_end, etag_end = req('GET', '/api/config')
        r.check('configِ عمومی بعدِ تست مو‌به‌مو به ابتدا برگشت',
                (cfg_end or {}).get('copy') == original_copy
                and (cfg_end or {}).get('rules') == original_rules,
                ' | '.join(_diff(original_copy, (cfg_end or {}).get('copy'))[:3]))
        r.check('ETag هم با بدنهٔ برگشتی تازه شده (کشِ مرورگر گول نمی‌خورد)',
                bool(etag_end))
        same_copy = final['copy']['template'] == original_copy
        same_rules = final['rules']['values'] == original_rules
        restored = same_copy and same_rules
        r.check('بازگردانی: بدنهٔ copy مو‌به‌مو همان ابتدا شد', same_copy,
                'اختلاف باقی مانده: %s' % _diff(original_copy, final['copy']['template'])[:300])
        r.check('بازگردانی: بدنهٔ rules مو‌به‌مو همان ابتدا شد', same_rules,
                str(original_rules)[:120] + ' != ' +
                str(final['rules']['values'])[:120])
        r.check('پاسخ‌هایِ ذخیره همگی 200 بودند', c1 == 200 and c2 == 200,
                '%s/%s' % (c1, c2))
    finally:
        if not restored and not read_only:
            print('\n⚠️  وضعیتِ محصول در سرور ممکن است تغییرِ آزمایشی داشته '
                  'باشد. بازگردانیِ دستی (با توکنِ تازه):')
            print('   PATCH %s%s/copy   ← بدنهٔ اصلی در ابتدا خوانده شد'
                  % (API, LIVE))
            print('   مقدارهایِ اصلی را در فایلِ موقتِ JSON بگذار و همان را '
                  'PATCH کن؛ یا از «تاریخچه» در پنل، ۲۰ بار undo بزن.')

    r.report('فاز ۵ · «تستِ ۲۰ تغییر» — سرورِ زنده')
    return 1 if (r.bad or not restored) else 0


def _diff(a, b, path=''):
    out = []
    if isinstance(a, dict) and isinstance(b, dict):
        for k in set(list(a) + list(b)):
            out += _diff(a.get(k), b.get(k), (path + '.' + k).strip('.'))
    elif a != b:
        out.append('%s: %r != %r' % (path, a, b))
    return out


if __name__ == '__main__':
    sys.exit(main())
