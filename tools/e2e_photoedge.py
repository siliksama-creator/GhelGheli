# -*- coding: utf-8 -*-
"""شکار باگ در حالت‌های مرزیِ سیستم «کارت با عکس»."""
import io,json,sys,urllib.request,urllib.error,colorsys
from PIL import Image,ImageDraw,ImageFilter
API='https://api.ghelghelishop.ir'; B='--eg'
def req(m,p,tok=None,body=None,files=None,raw=None):
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
    elif raw is not None:
        d=raw; h['Content-Type']='application/json'
    elif body is not None:
        d=json.dumps(body).encode(); h['Content-Type']='application/json'
    r=urllib.request.Request(API+p,data=d,headers=h,method=m)
    try:
        with urllib.request.urlopen(r,timeout=120) as x: return x.status,json.loads(x.read() or b'{}')
    except urllib.error.HTTPError as e:
        try: return e.code,json.loads(e.read() or b'{}')
        except: return e.code,{}
    except Exception as ex: return 0,{'err':str(ex)}
ok=bad=0; notes=[]
def ck(n,c,d=''):
    global ok,bad
    if c: ok+=1; print('  ✓',n)
    else: bad+=1; print('  ✗',n,'→',str(d)[:170]); notes.append(n)

apw=sys.argv[1]
_,a=req('POST','/api/admin/auth/login',body={'username':'Admin','password':apw}); at=a['token']
_,u=req('POST','/api/auth/login',body={'mobile':'09001112233','password':'Qa!12345'}); ut=u['token']

def card(hue,seed=1):
    im=Image.new('RGB',(420,640)); d=ImageDraw.Draw(im)
    for y in range(640):
        f=y/640; rr,gg,bb=colorsys.hsv_to_rgb(((hue+f*45)%360)/360,0.78,0.30+0.45*f)
        d.line([(0,y),(420,y)],fill=(int(rr*255),int(gg*255),int(bb*255)))
    for k in range(-640,1060,13):
        d.line([(k,0),(k+640,640)],fill=(int((hue*3+k)%255),int((k*7)%255),int((hue+k*2)%255)),width=3)
    d.ellipse([95,190,325,425],fill=(250,215,70) if hue<100 else (70,225,180))
    d.rectangle([0,545,420,640],fill=(14,14,24)); d.text((160,585),f'S{seed}',fill=(255,255,255))
    b=io.BytesIO(); im.save(b,'PNG'); return b.getvalue(),im
def good(im,q=70):
    o=im.rotate(4,expand=True,fillcolor=(28,28,34))
    o=o.resize((int(o.width*0.5),int(o.height*0.5)),Image.LANCZOS).filter(ImageFilter.GaussianBlur(0.5))
    b=io.BytesIO(); o.save(b,'JPEG',quality=q); return b.getvalue()

pA,imA=card(200,1)
st,rA=req('POST','/api/admin/photo-cards/designs',at,{'name':'EG-آبی','pointValue':'70'},{'image':('a.png',pA,'image/png')})
did=rA.get('design',{}).get('id')
req('POST','/api/admin/photo-cards/codes',at,{'rawCodes':'\n'.join(f'EG-{i:04d}' for i in range(1,15))})

print('\n══ ورودی‌های خرابکارانه ══')
st,r=req('POST','/api/photo-cards/submit',ut,{'code':'EG-0001'},{'image':('x.txt',b'not an image at all',
    'image/jpeg')})
ck('فایلِ غیرتصویر کرش نمی‌دهد',st in (400,422,500) and st!=0,f'{st} {r.get("message","")[:60]}')
st,r=req('POST','/api/photo-cards/submit',ut,{'code':'EG-0002'},{'image':('e.jpg',b'','image/jpeg')})
ck('فایلِ خالی کرش نمی‌دهد',st in (400,422,500),f'{st}')
st,r=req('POST','/api/photo-cards/submit',ut,{'code':'<script>alert(1)</script>'},{'image':('g.jpg',good(imA),'image/jpeg')})
ck('کدِ حاوی HTML رد می‌شود',st in (400,404,429),f'{st} {r.get("status")}')
st,r=req('POST','/api/photo-cards/submit',ut,{'code':"' OR 1=1 --"},{'image':('g.jpg',good(imA),'image/jpeg')})
ck('تلاش SQL injection رد می‌شود',st in (400,404,429),f'{st}')
st,r=req('POST','/api/photo-cards/submit',ut,{'code':'EG-0003'},{})
ck('بدون فایل رد می‌شود',st==400,f'{st}')

print('\n══ کنترل دسترسی ══')
st,r=req('POST','/api/admin/photo-cards/codes',ut,{'rawCodes':'HACK-1'})
ck('کاربر نمی‌تواند کد بسازد',st in (401,403),f'{st}')
st,r=req('DELETE','/api/admin/photo-cards/codes/00000000-0000-4000-8000-000000000000',ut)
ck('کاربر نمی‌تواند کد حذف کند',st in (401,403),f'{st}')
st,r=req('GET','/api/admin/photo-cards/submissions',ut)
ck('کاربر صف بررسی را نمی‌بیند',st in (401,403),f'{st}')
st,r=req('POST','/api/admin/photo-cards/designs',ut,{'name':'X'},{'image':('a.png',pA,'image/png')})
ck('کاربر نمی‌تواند طرح آپلود کند',st in (401,403),f'{st}')

print('\n══ شناسه‌های نامعتبر ══')
for path,m in [('/api/admin/photo-cards/codes/not-a-uuid','PATCH'),
               ('/api/admin/photo-cards/codes/not-a-uuid','DELETE'),
               ('/api/admin/photo-cards/designs/not-a-uuid','PATCH'),
               ('/api/admin/photo-cards/submissions/not-a-uuid/decide','POST')]:
    st,r=req(m,path,at,{'code':'X','approve':True,'isActive':True})
    ck(f'{m} با شناسهٔ نامعتبر → ۴۰۰',st==400,f'{st}')

print('\n══ حذف/ویرایش دسته‌ای ══')
st,r=req('POST','/api/admin/photo-cards/codes/bulk-delete',at,{'batchLabel':''})
ck('حذف دسته‌ای بدون برچسب رد می‌شود',st==400,f'{st}')
st,r=req('POST','/api/admin/photo-cards/codes/bulk-delete',at,{'batchLabel':'وجود-ندارد'})
ck('برچسبِ ناموجود صفر حذف می‌کند',st==200 and r.get('deletedCount')==0,f'{st} {r.get("deletedCount")}')

print('\n══ یکتایی و برخورد ══')
st,r=req('POST','/api/admin/photo-cards/codes',at,{'rawCodes':'EG-0001'})
ck('کدِ تکراری دوباره درج نمی‌شود',r.get('insertedCount')==0 and r.get('duplicateInDbCount')==1,
   f"ins={r.get('insertedCount')} dup={r.get('duplicateInDbCount')}")
st,r=req('POST','/api/admin/photo-cards/codes',at,{'rawCodes':'EG-000I'})  # I ↔ 1
ck('کدِ مبهم (I در برابر 1) تکراری شمرده می‌شود',r.get('duplicateInDbCount')==1,
   f"ins={r.get('insertedCount')} dup={r.get('duplicateInDbCount')}")

print('\n══ صف بررسی: تصمیم دوباره ══')
st,r=req('GET','/api/admin/photo-cards/submissions?status=approved',at)
apr=r.get('submissions',[])
if apr:
    st,r=req('POST',f"/api/admin/photo-cards/submissions/{apr[0]['id']}/decide",at,{'approve':True,'designId':did})
    ck('تصمیمِ دوباره روی پروندهٔ بسته رد می‌شود',st==409,f'{st} {r.get("message","")[:50]}')
else:
    print('   (پروندهٔ تأییدشده‌ای نبود)')

print('\n══ طرح غیرفعال ══')
req('PATCH',f'/api/admin/photo-cards/designs/{did}',at,{'isActive':False})
st,r=req('POST','/api/photo-cards/submit',ut,{'code':'EG-0004'},{'image':('g.jpg',good(imA),'image/jpeg')})
ck('عکسِ طرحِ غیرفعال خودکار تأیید نمی‌شود',r.get('status')!='approved',f'{st} {r.get("status")}')
st2,r2=req('GET','/api/admin/photo-cards/codes?q=EG-0004',at)
row=[c for c in r2.get('codes',[]) if str(c['code'])=='EG-0004']
ck('کد در حالت طرحِ غیرفعال مصرف نشد',row and row[0]['status']!='used',str(row[0]['status'] if row else '-'))
req('PATCH',f'/api/admin/photo-cards/designs/{did}',at,{'isActive':True})

print('\n══ سیستم قدیمی ══')
st,_=req('GET','/api/admin/card-codes',at); ck('فهرست کدهای قدیمی',st==200,str(st))
st,_=req('GET','/api/admin/card-types',at); ck('انواع کارت',st==200,str(st))
st,_=req('GET','/api/bootstrap',ut); ck('bootstrap',st==200,str(st))
st,_=req('GET','/api/pass',ut); ck('گذر نبرد',st==200,str(st))

print(f'\n{"✓" if bad==0 else "✗"} {ok} موفق، {bad} ناموفق')
for n in notes: print('   -',n)
