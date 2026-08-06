# -*- coding: utf-8 -*-
"""چرخهٔ کاملِ «ثبت کارت با عکس» از دیدِ کاربر و مدیر.

⚠️ این فایل قبلاً پیشوندِ **ثابتِ** `T2` و کاربرِ ثابت داشت و هیچ
   پاکسازی‌ای نمی‌کرد. نتیجه‌اش دو مشکلِ واقعی بود:

     ۱. اجرای دوم با `KeyError: 'design'` می‌ترکید، چون طرحِ `T2-آبی`
        از اجرای قبلی هنوز فعال بود و محافظِ «طرحِ تکراری» ۴۰۹ می‌داد.
        پیامِ خطا هیچ ربطی به علت نداشت و وقت می‌گرفت.
     ۲. کاربرِ ثابت سهمیهٔ ۲۰ ثبت در ساعت را می‌سوزاند، پس اجرای سوم
        فقط ۴۲۹ می‌دید و بی‌صدا هیچ چیزی را نمی‌سنجید.

   حالا مثل بقیهٔ تست‌ها: پیشوندِ یکتا، کاربرِ تازه، پاکسازیِ `atexit`.
"""
import atexit,io,json,sys,time,urllib.request,urllib.error,colorsys
import os as _os, sys as _sys
_sys.path.insert(0,_os.path.dirname(_os.path.abspath(__file__)))
from _authcache import admin_token, deactivate_stale_designs, cleanup_own_run, block_test_user
from PIL import Image,ImageDraw,ImageFilter,ImageEnhance
API='https://api.ghelghelishop.ir'; B='--t2'
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
ok=bad=0
def ck(n,c,d=''):
    global ok,bad
    if c: ok+=1; print('  ✓',n)
    else: bad+=1; print('  ✗',n,'→',str(d)[:160])
apw=sys.argv[1]
atok=admin_token(apw)
PFX=f'V2{int(time.time())%100000:05d}'
_MOB=f'0900{int(time.time())%1000000:06d}'
st,ru=req('POST','/api/auth/register-password',body={
    'mobile':_MOB,'password':'Qa!12345','firstName':'تست','lastName':'چرخه',
    'nickname':f'چرخه{PFX}'})
if st!=200 or not ru.get('token'):
    raise SystemExit(f'✗ ساخت کاربرِ تست نشد: {st} {ru}')
utok=ru['token']; uid=(ru.get('user') or {}).get('id')
deactivate_stale_designs(req,atok)
# atexit و نه خطِ ساده در انتها: این فایل با sys.exit تمام می‌شود.
atexit.register(lambda: cleanup_own_run(req,atok,PFX))
atexit.register(lambda: uid and block_test_user('/home/user/tools/rx.py',uid))

def card(hue,seed):
    im=Image.new('RGB',(420,640)); d=ImageDraw.Draw(im)
    for y in range(640):
        f=y/640; rr,gg,bb=colorsys.hsv_to_rgb(((hue+f*45)%360)/360,0.78,0.30+0.45*f)
        d.line([(0,y),(420,y)],fill=(int(rr*255),int(gg*255),int(bb*255)))
    for k in range(-640,420+640,13):
        d.line([(k,0),(k+640,640)],fill=(int((hue*3+k)%255),int((k*7)%255),int((hue+k*2)%255)),width=3)
    d.ellipse([95,190,325,425],fill=(250,215,70) if hue<100 else (70,225,180))
    d.rectangle([0,545,420,640],fill=(14,14,24)); d.text((160,585),f'S{seed}',fill=(255,255,255))
    b=io.BytesIO(); im.save(b,'PNG'); return b.getvalue(),im
def blurry(im):
    o=im.rotate(14,expand=True,fillcolor=(28,28,34))
    o=o.resize((int(o.width*0.13),int(o.height*0.13)),Image.LANCZOS).filter(ImageFilter.GaussianBlur(3.4))
    o=ImageEnhance.Brightness(o).enhance(1.5)
    b=io.BytesIO(); o.save(b,'JPEG',quality=30); return b.getvalue()
def noise():
    """چیزی که اصلاً کارت نیست — کاغذِ راه‌راه.

    ⚠️ چرا `blurry()` دیگر برای «به صف بررسی می‌رود» کار نمی‌کند:
       آستانهٔ کدِ بی‌نام از ۰.۵۵ به ۰.۴۰ آمد (خواستهٔ مالک) و عکسِ تارِ
       این تابع نمرهٔ ۰.۷۰ می‌گیرد، پس مستقیم تأیید می‌شود.

       نسخهٔ قبلیِ این تست همچنان `blurry()` می‌فرستاد و انتظارِ
       `pending` داشت — سه ✗ می‌داد که شبیهِ باگ به نظر می‌رسید ولی
       در واقع خودِ تست از تغییرِ آستانه عقب مانده بود.
    """
    im=Image.new('RGB',(300,300),(240,238,235)); d=ImageDraw.Draw(im)
    for i in range(0,300,20):
        d.line([(0,i),(300,i)],fill=(225,222,220),width=6)
    b=io.BytesIO(); im.save(b,'JPEG',quality=60); return b.getvalue()
def good(im):
    o=im.rotate(4,expand=True,fillcolor=(28,28,34))
    o=o.resize((int(o.width*0.5),int(o.height*0.5)),Image.LANCZOS).filter(ImageFilter.GaussianBlur(0.5))
    b=io.BytesIO(); o.save(b,'JPEG',quality=70); return b.getvalue()

pA,imA=card(205,1); pB,imB=card(25,2)
stA,rA=req('POST','/api/admin/photo-cards/designs',atok,{'name':f'{PFX}-آبی','pointValue':'150'},{'image':('a.png',pA,'image/png')})
stB,rB=req('POST','/api/admin/photo-cards/designs',atok,{'name':f'{PFX}-نارنجی','pointValue':'250'},{'image':('b.png',pB,'image/png')})
idA=rA['design']['id']
req('POST','/api/admin/photo-cards/codes',atok,{'rawCodes':'\n'.join(f'{PFX}-{i:04d}' for i in range(1,13)),'batchLabel':'دستهٔ تست'})

print('\n══ ۱. پیام ۲۴ ساعته (عکسی که اصلاً کارت نیست) ══')
st,r=req('POST','/api/photo-cards/submit',utok,{'code':f'{PFX}-0001'},{'image':('n.jpg',noise(),'image/jpeg')})
ck('به صف بررسی رفت',st==200 and r.get('status')=='pending',f'{st} {r.get("status")}')
ck('پیام «۲۴ ساعت» دارد','۲۴ ساعت' in r.get('message',''),r.get('message','')[:110])
ck('پیام «کیفیت» را توضیح می‌دهد','کیفیت' in r.get('message',''),r.get('message','')[:110])

# ══════════════════════════════════════════════════════════════════════════
# ۲. همان عکس با کدِ دیگر → **مجاز**
# ══════════════════════════════════════════════════════════════════════════
#
# ⚠️ معیارِ این بخش برعکس شد. نسخهٔ قبلی انتظار داشت ۴۰۹ با
#    `duplicate_pending` بگیرد، چون فرض بود «یک عکس = یک کارت».
#
#    آن فرض غلط بود: کارت‌ها سری‌ای چاپ می‌شوند و ده نسخهٔ یک کارت ده
#    عکسِ کاملاً یکسان دارند که فقط کدشان فرق می‌کند. گاردِ قدیمی
#    کاربرِ درستکار را مسدود می‌کرد. حالا حذف شده.
print('\n══ ۲. همان عکس با کدِ دیگر → مجاز (نسخهٔ دوم همان کارت) ══')
st,r=req('POST','/api/photo-cards/submit',utok,{'code':f'{PFX}-0002'},{'image':('b2.jpg',blurry(imA),'image/jpeg')})
ck('عکسِ تکراری دیگر رد نمی‌شود',st==200,f'{st} {r.get("status")} {str(r.get("message"))[:80]}')
ck('حالتِ duplicate_pending کاملاً حذف شده',r.get('status')!='duplicate_pending',str(r.get('status')))
st2,r2=req('GET',f'/api/admin/photo-cards/codes?q={PFX}-0002',atok)
row=[c for c in r2.get('codes',[]) if str(c['code'])==f'{PFX}-0002']
# کد یا مصرف شده (تأیید خودکار) یا رزرو (رفته به صف) — ولی حتماً دیگر آزاد نیست.
ck('کدِ دوم واقعاً خرج شد',row and row[0]['status'] in ('used','reserved'),
   str(row[0]['status'] if row else '-'))

print('\n══ ۳. کارتِ دیگر با عکسِ متفاوت → مجاز ══')
st,r=req('POST','/api/photo-cards/submit',utok,{'code':f'{PFX}-0003'},{'image':('g.jpg',good(imB),'image/jpeg')})
ck('کارت دوم ثبت شد',st==200 and r.get('status')=='approved',f'{st} {r.get("status")} {r.get("message","")[:60]}')

print('\n══ ۴. بعد از تأیید مدیر، وضعیت approved می‌شود ══')
st,r=req('GET','/api/admin/photo-cards/submissions?status=pending',atok)
subs=[s for s in r.get('submissions',[]) if s.get('code')==f'{PFX}-0001']
if subs:
    req('POST',f"/api/admin/photo-cards/submissions/{subs[0]['id']}/decide",atok,{'approve':True,'designId':idA})
st,r=req('GET','/api/photo-cards/my-submissions',utok)
mine=r.get('submissions',[])
pend=[m for m in mine if m['status']=='pending']
ck('هیچ پروندهٔ pending نمانده',len(pend)==0,f'{len(pend)} مانده')
ck('پرونده approved شد',any(m['status']=='approved' for m in mine),str([m['status'] for m in mine[:3]]))

print('\n══ ۵. عکسِ تکراری با کدِ تازه، بارِ سوم ══')
# کدِ ۰۰۰۲ در بخشِ ۲ خرج شد، پس اینجا کدِ تازه لازم است.
st,r=req('POST','/api/photo-cards/submit',utok,{'code':f'{PFX}-0004'},{'image':('b3.jpg',blurry(imA),'image/jpeg')})
ck('عکس هرگز مسدود نمی‌شود، هر چند بار هم فرستاده شود',st==200,
   f'{st} {r.get("status")} {str(r.get("message"))[:80]}')

print('\n══ ۶. XP گذر نبرد داده نمی‌شود ══')
st,before=req('GET','/api/pass',utok)
st,r=req('POST','/api/photo-cards/submit',utok,{'code':f'{PFX}-0005'},{'image':('g2.jpg',good(imB),'image/jpeg')})
st,after=req('GET','/api/pass',utok)
bx=before.get('xp') or before.get('progress',{}).get('xp') or 0
ax=after.get('xp') or after.get('progress',{}).get('xp') or 0
ck('XP گذر نبرد تغییر نکرد',bx==ax,f'قبل={bx} بعد={ax}')

print('\n══ ۷. ویرایش و حذف کد ══')
st,r=req('GET','/api/admin/photo-cards/codes?status=unused',atok)
free=[c for c in r.get('codes',[]) if str(c['code']).startswith(PFX)]
cid=free[0]['id']; oldc=free[0]['code']
st,r=req('PATCH',f'/api/admin/photo-cards/codes/{cid}',atok,{'code':f'{PFX}-EDITED-1'})
ck('ویرایش کد',st==200 and r.get('code')==f'{PFX}-EDITED-1',f'{st} {r}')
st,r=req('PATCH',f'/api/admin/photo-cards/codes/{cid}',atok,{'batchLabel':'دستهٔ نو'})
ck('ویرایش برچسب',st==200 and r.get('batch_label')=='دستهٔ نو',f'{st} {r.get("batch_label")}')
st,r=req('DELETE',f'/api/admin/photo-cards/codes/{free[1]["id"]}',atok)
ck('حذف کد آزاد',st==200,f'{st} {r}')
st2,r2=req('GET',f'/api/admin/photo-cards/codes?q={PFX}-0001',atok)
used=[c for c in r2.get('codes',[]) if c['status']=='used']
if used:
    st,r=req('PATCH',f'/api/admin/photo-cards/codes/{used[0]["id"]}',atok,{'code':'HACK'})
    ck('ویرایش کدِ مصرف‌شده رد می‌شود',st==409,f'{st}')
    st,r=req('DELETE',f'/api/admin/photo-cards/codes/{used[0]["id"]}',atok)
    ck('حذف کدِ مصرف‌شده رد می‌شود',st==409,f'{st}')

print('\n══ ۸. کارت‌ها در پروفایل عمومی ══')
if uid:
    st,r=req('GET',f'/api/users/{uid}/public',utok)
    cards=r.get('cards',[])
    names=[c['name'] for c in cards]
    ck('کارت‌های ثبت‌شده با عکس در پروفایل عمومی دیده می‌شوند',
       any(n.startswith(PFX) for n in names),str(names[:4]))

print(f'\n{"✓" if bad==0 else "✗"} {ok} موفق، {bad} ناموفق')
