# -*- coding: utf-8 -*-
"""هم‌زمانی: چهار درخواستِ موازی با یک عکس و چهار کد — هر چهار باید موفق شوند.

═══════════════════════════════════════════════════════════════════════════
⚠️ معیارِ این فایل **برعکس** شد و دلیلش مهم است
═══════════════════════════════════════════════════════════════════════════

نسخهٔ قبلی تضمین می‌کرد که از چهار درخواستِ هم‌زمان با یک عکس، دقیقاً
**یکی** موفق شود. آن وقت درست بود، چون فرض بر این بود که «یک عکس = یک
کارتِ فیزیکی» و بقیه تلاشِ تقلب‌اند.

آن فرض غلط بود. کارت‌ها سری‌ای چاپ می‌شوند و ده نسخهٔ یک کارت **ده عکسِ
یکسان** دارند که فقط کدِ پشتشان فرق می‌کند. پس رفتارِ درست این است که
هر چهار درخواست موفق شوند.

خواستهٔ صریح مالک:

    «اصلا هیچ محدودیتی تعداد تکراری عکس نباید وجود داشته باشه … مهم
     کد های اصلی که در سیستم ثبت شده هستن»

پس این فایل حالا چیزِ دیگری را می‌سنجد و همچنان ارزش دارد: **هم‌زمانی
نباید کد را بسوزاند یا کارتِ اضافه بدهد.** چهار درخواست، چهار کد، دقیقاً
چهار کارت — نه سه (کدی گم شده) و نه پنج (کدی دوبار حساب شده).
"""
import io,json,sys,time,threading,urllib.request,urllib.error,colorsys
import os as _os, sys as _sys
_sys.path.insert(0,_os.path.dirname(_os.path.abspath(__file__)))
from _authcache import admin_token, deactivate_stale_designs, cleanup_own_run, block_test_user
from PIL import Image,ImageDraw,ImageFilter,ImageEnhance
API='https://api.ghelghelishop.ir'; B='--r2'
def req(m,p,tok=None,body=None,files=None):
    h={}
    if tok: h['Authorization']='Bearer '+tok
    d=None
    if files is not None:
        buf=io.BytesIO()
        for k,v in (body or {}).items():
            buf.write(f'--{B}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode())
        for k,(fn,c,ct) in files.items():
            buf.write(f'--{B}\r\nContent-Disposition: form-data; name="{k}"; filename="{fn}"\r\nContent-Type: {ct}\r\n\r\n'.encode()); buf.write(c); buf.write(b'\r\n')
        buf.write(f'--{B}--\r\n'.encode()); d=buf.getvalue(); h['Content-Type']=f'multipart/form-data; boundary={B}'
    elif body is not None:
        d=json.dumps(body).encode(); h['Content-Type']='application/json'
    r=urllib.request.Request(API+p,data=d,headers=h,method=m)
    try:
        with urllib.request.urlopen(r,timeout=120) as x: return x.status,json.loads(x.read() or b'{}')
    except urllib.error.HTTPError as e:
        try: return e.code,json.loads(e.read() or b'{}')
        except: return e.code,{}
apw=sys.argv[1]
# توکن از کش می‌آید تا سقفِ ۱۰ ورود در ۱۵ دقیقه نسوزد — توضیح در _authcache.py
at=admin_token(apw)

# ── جداسازیِ اجرا ──
# کاربرِ تازه: سهمیهٔ محدودکنندهٔ نرخ و شمارندهٔ قفلِ ۳ ساعته هر دو
# per-user هستند، پس استفادهٔ دوباره از یک کاربر باعث می‌شد اجرای دوم
# فقط ۴۲۹ ببیند و اصلاً به منطقِ مسابقهٔ زمانی نرسد — یعنی تست بی‌صدا
# هیچ چیزی را نمی‌سنجید.
# پیشوندِ یکتا: طرح و کدِ اجرای قبلی هنوز در دیتابیس‌اند.
PFX=f'R2{int(time.time())%100000:05d}'
UMOB=f'0900{int(time.time())%1000000:06d}'
st,ru=req('POST','/api/auth/register-password',body={
    'mobile':UMOB,'password':'Qa!12345','firstName':'تست','lastName':'همزمانی',
    'nickname':f'همزمان{PFX}'})
if st==200 and ru.get('token'):
    ut=ru['token']
    _TEST_UID=(ru.get('user') or {}).get('id')
else:
    print(f'  ⚠ ساخت کاربر تازه نشد ({st}) — کاربرِ ثابت؛ ممکن است به سقفِ نرخ بخورد')
    _,u=req('POST','/api/auth/login',body={'mobile':'09001112233','password':'Qa!12345'}); ut=u['token']
deactivate_stale_designs(req,at)
# ── پاکسازی: کاربرِ تست نباید در جدولِ لیگِ زنده دیده شود ──
#
# بدون این، بعد از چند اجرا ردیف‌های اولِ لیگ پر می‌شود از اسم‌هایی
# مثل «تداخلIF51008» — که هر کاربرِ واقعی هم می‌بیند.
#
# ⚠️ چرا atexit و نه یک خط ساده در انتهای فایل:
#    این فایل‌ها با `sys.exit(...)` تمام می‌شوند و هر کدی که **بعد** از
#    آن نوشته شود هرگز اجرا نمی‌شود. تلاشِ اولِ همین رفع دقیقاً همین
#    اشتباه را داشت — کد نوشته شده بود ولی مرده بود.
#    `atexit` در هر مسیرِ خروج اجرا می‌شود: موفق، ناموفق، یا استثنا.
import atexit as _atexit
_atexit.register(lambda: cleanup_own_run(req, at, PFX))
_atexit.register(
    lambda: _TEST_UID and block_test_user('/home/user/tools/rx.py', _TEST_UID))

def card(hue):
    im=Image.new('RGB',(420,640)); d=ImageDraw.Draw(im)
    for y in range(640):
        f=y/640; rr,gg,bb=colorsys.hsv_to_rgb(((hue+f*45)%360)/360,0.78,0.30+0.45*f)
        d.line([(0,y),(420,y)],fill=(int(rr*255),int(gg*255),int(bb*255)))
    for k in range(-640,1060,13):
        d.line([(k,0),(k+640,640)],fill=(int((hue*3+k)%255),int((k*7)%255),int((hue+k*2)%255)),width=3)
    d.ellipse([95,190,325,425],fill=(70,225,180)); d.rectangle([0,545,420,640],fill=(14,14,24))
    b=io.BytesIO(); im.save(b,'PNG'); return b.getvalue(),im
def blurry(im):
    o=im.rotate(14,expand=True,fillcolor=(28,28,34))
    o=o.resize((int(o.width*0.13),int(o.height*0.13)),Image.LANCZOS).filter(ImageFilter.GaussianBlur(3.4))
    o=ImageEnhance.Brightness(o).enhance(1.5)
    b=io.BytesIO(); o.save(b,'JPEG',quality=30); return b.getvalue()
pA,imA=card(200)
req('POST','/api/admin/photo-cards/designs',at,{'name':f'{PFX}-1','pointValue':'44'},{'image':('a.png',pA,'image/png')})
req('POST','/api/admin/photo-cards/codes',at,{'rawCodes':'\n'.join(f'{PFX}-{i:04d}' for i in range(1,5))})
img=blurry(imA)
res=[]
def fire(code):
    res.append((code,)+req('POST','/api/photo-cards/submit',ut,{'code':code},{'image':('b.jpg',img,'image/jpeg')}))
ts=[threading.Thread(target=fire,args=(f'{PFX}-{i:04d}',)) for i in range(1,5)]
[t.start() for t in ts]; [t.join() for t in ts]
print('۴ درخواستِ هم‌زمان با **همان عکس** ولی ۴ کدِ متفاوت:')
pend=dup=0
for code,st,r in sorted(res):
    print(f'   {code}: {st} {r.get("status")}')
    if r.get('status')=='pending': pend+=1
    if r.get('status')=='duplicate_pending': dup+=1
st,r=req('GET','/api/admin/photo-cards/codes?status=used',at)
used=[c for c in r.get('codes',[]) if str(c['code']).startswith(PFX)]

# ── معیار: هر چهار درخواست باید کارت بدهند ──
#
# `pending` هم موفق حساب می‌شود: کد رزرو شده و بعد از تأیید مدیر کارت
# می‌آید. چیزی که **نباید** رخ دهد، ۴۰۹ یا ۵۰۰ است — یعنی درخواستی که
# به‌خاطر برخوردِ هم‌زمانی بی‌دلیل رد شود.
granted = pend + sum(1 for _c, _s, r in res if r.get('status') == 'approved')
failed  = [(c, st, r.get('status'), str(r.get('message'))[:60])
           for c, st, r in res if st >= 400]
print(f'\nپذیرفته‌شده: {granted} از ۴')
print(f'ردشده به‌عنوان تکراری: {dup} (باید ۰ باشد — این حالت حذف شد)')
print(f'کدهای مصرف‌شده: {len(used)}')
for f in failed:
    print(f'   ✗ {f}')

bad = 0
if granted != 4:
    print(f'⚠ فقط {granted} از ۴ پذیرفته شد — قفلِ حذف‌شده برگشته؟')
    bad = 1
if dup:
    print(f'⚠ {dup} درخواست «تکراری» اعلام شد — گاردِ عکس برگشته است')
    bad = 1

# ── چرا شمارشِ اینونتوری هم لازم است ──
#
# «چهار پاسخِ ۲۰۰» ثابت نمی‌کند چهار کارت واقعاً ثبت شده. اگر دو تراکنشِ
# هم‌زمان روی یک ردیفِ اینونتوری بنویسند و یکی دیگری را بازنویسی کند،
# هر دو پاسخِ موفق می‌دهند ولی `quantity` فقط یکی بالا می‌رود — یک باگِ
# «lost update» کلاسیک که فقط با خواندنِ حالتِ نهایی دیده می‌شود.
st, prof = req('GET', '/api/profile', ut)
rows = [i for i in prof.get('inventory', []) if str(i.get('name','')).startswith(PFX)]
qty = sum(int(i.get('quantity') or 0) for i in rows)
appr = sum(1 for _c, _s, r in res if r.get('status') == 'approved')
print(f'اینونتوری: {qty} نسخه در {len(rows)} ردیف (انتظار {appr} در ۱ ردیف)')
if qty != appr:
    print(f'⚠ lost update: {appr} تأیید ولی فقط {qty} در اینونتوری')
    bad = 1
if len(rows) > 1:
    print(f'⚠ {len(rows)} ردیفِ جدا برای یک نوعِ کارت — باید یکی با quantity باشد')
    bad = 1

if bad:
    sys.exit(1)
print('✓ هم‌زمانی سالم است: چهار کد، چهار کارت، یک ردیفِ اینونتوری')
