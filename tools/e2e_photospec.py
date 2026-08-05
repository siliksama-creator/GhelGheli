# -*- coding: utf-8 -*-
"""بررسیِ نقطه‌به‌نقطهٔ منطقی که مالک توصیف کرد — روی سرور زنده."""
import io, json, sys, urllib.request, urllib.error, colorsys
from PIL import Image, ImageDraw, ImageFilter, ImageEnhance
API='https://api.ghelghelishop.ir'; B='----spec'
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
    else: bad+=1; print('  ✗',n,'→',str(d)[:150])

apw=sys.argv[1]
_,a=req('POST','/api/admin/auth/login',body={'username':'Admin','password':apw}); atok=a['token']
_,u=req('POST','/api/auth/login',body={'mobile':'09001112233','password':'Qa!12345'}); utok=u['token']

def card(hue,seed):
    im=Image.new('RGB',(420,640)); d=ImageDraw.Draw(im)
    for y in range(640):
        f=y/640; rr,gg,bb=colorsys.hsv_to_rgb(((hue+f*45)%360)/360,0.78,0.30+0.45*f)
        d.line([(0,y),(420,y)],fill=(int(rr*255),int(gg*255),int(bb*255)))
    for k in range(-640,420+640,13):
        d.line([(k,0),(k+640,640)],fill=(int((hue*3+k)%255),int((k*7)%255),int((hue+k*2)%255)),width=3)
    d.ellipse([95,190,325,425],fill=(250,215,70) if hue<100 else (70,225,180))
    d.rectangle([0,545,420,640],fill=(14,14,24))
    d.text((160,585),f'S{seed}',fill=(255,255,255))
    b=io.BytesIO(); im.save(b,'PNG'); return b.getvalue(),im
def shot(im,rot=6,blur=1.1,sc=0.35,br=0.85):
    o=im.rotate(rot,expand=True,fillcolor=(28,28,34))
    o=o.resize((int(o.width*sc),int(o.height*sc)),Image.LANCZOS).filter(ImageFilter.GaussianBlur(blur))
    o=ImageEnhance.Brightness(o).enhance(br)
    b=io.BytesIO(); o.save(b,'JPEG',quality=45); return b.getvalue()

print('\n══ گام ۱: مدیر عکس را وارد می‌کند — بدون هیچ کدی ══')
pngA,imA=card(205,1); pngB,imB=card(25,2)
stA,rA=req('POST','/api/admin/photo-cards/designs',atok,{'name':'SPEC-آبی','pointValue':'120'},{'image':('a.png',pngA,'image/png')})
stB,rB=req('POST','/api/admin/photo-cards/designs',atok,{'name':'SPEC-نارنجی','pointValue':'340'},{'image':('b.png',pngB,'image/png')})
ck('طرح ۱ ثبت شد',stA==200,f'{stA} {rA}')
ck('طرح ۲ ثبت شد',stB==200,f'{stB} {rB}')
ck('پاسخِ آپلود هیچ کدی برنمی‌گرداند',
   'code' not in json.dumps(rA) and 'codes' not in json.dumps(rA), json.dumps(rA,ensure_ascii=False)[:120])
idA=rA['design']['id']

print('\n══ گام ۲: مدیر فقط یک سری کد تعریف می‌کند ══')
codes=[f'SPEC-{i:04d}' for i in range(1,16)]
st,r=req('POST','/api/admin/photo-cards/codes',atok,{'rawCodes':'\n'.join(codes)})
ck('۱۵ کد بدون اشاره به طرح ثبت شد',st==200 and r['insertedCount']==15,f'{st} {r.get("insertedCount")}')
st,r=req('GET','/api/admin/photo-cards/codes?status=unused',atok)
sample=[c for c in r.get('codes',[]) if str(c['code']).startswith('SPEC-')]
ck('کدها به هیچ کارتی وصل نیستند',all(c.get('card_type_name') is None for c in sample),
   str([c.get('card_type_name') for c in sample[:3]]))

print('\n══ گام ۳: کاربر عکس + کد می‌فرستد → تشخیص، قفلِ کد، اینونتوری ══')
st,r=req('POST','/api/photo-cards/submit',utok,{'code':'SPEC-0001'},{'image':('s.jpg',shot(imA),'image/jpeg')})
ck('پذیرفته شد',st==200 and r.get('status')=='approved',f'{st} {r}')
ck('کارتِ درست تشخیص داده شد',r.get('cardType')=='SPEC-آبی',str(r.get('cardType')))
ck('امتیازِ همان کارت داده شد (۱۲۰ نه ۳۴۰)',r.get('addedPoints')==120,str(r.get('addedPoints')))
ck('تصویرِ اینونتوری = عکسِ باکیفیتِ مدیر',r.get('imageUrl')==rA['design']['image_url'],str(r.get('imageUrl')))
st2,r2=req('GET','/api/admin/photo-cards/codes?q=SPEC-0001',atok)
row=[c for c in r2.get('codes',[]) if str(c['code'])=='SPEC-0001']
ck('کد قفل شد (used)',row and row[0]['status']=='used',str(row[0]['status'] if row else '—'))
ck('کد حالا به همان طرح گره خورد',row and row[0].get('card_type_name')=='SPEC-آبی',str(row[0].get('card_type_name') if row else '—'))

print('\n══ گام ۴: عکسِ کارتِ دوم با کدِ دیگر → کارتِ دوم، نه اولی ══')
st,r=req('POST','/api/photo-cards/submit',utok,{'code':'SPEC-0002'},{'image':('s.jpg',shot(imB),'image/jpeg')})
ck('کارتِ دوم درست تشخیص داده شد',st==200 and r.get('cardType')=='SPEC-نارنجی',f'{st} {r.get("cardType")}')
ck('امتیازِ کارتِ دوم (۳۴۰)',r.get('addedPoints')==340,str(r.get('addedPoints')))

print('\n══ گام ۵: کدِ استفاده‌شده دوباره کار نمی‌کند ══')
st,r=req('POST','/api/photo-cards/submit',utok,{'code':'SPEC-0001'},{'image':('s.jpg',shot(imA),'image/jpeg')})
ck('کدِ مصرف‌شده رد شد',st==409,f'{st} {r.get("message","")[:60]}')

print('\n══ گام ۶: کد معتبر + عکسِ ناشناخته → صف بررسی ══')
noise=Image.effect_noise((380,520),95).convert('RGB')
nb=io.BytesIO(); noise.save(nb,'JPEG',quality=55)
st,r=req('POST','/api/photo-cards/submit',utok,{'code':'SPEC-0003'},{'image':('n.jpg',nb.getvalue(),'image/jpeg')})
ck('به صف بررسی رفت (نه رد)',st==200 and r.get('status')=='pending',f'{st} {r.get("status")}')
ck('علت image_unknown',r.get('reason')=='image_unknown',str(r.get('reason')))
ck('به کاربر گفته شد کدش درست است',('کد شما درست است' in r.get('message','')),r.get('message','')[:80])

print('\n══ گام ۷: مدیر خودش طرح را انتخاب می‌کند ══')
st,r=req('GET','/api/admin/photo-cards/submissions?status=pending',atok)
subs=[s for s in r.get('submissions',[]) if s.get('code')=='SPEC-0003']
ck('پرونده در صف است',len(subs)==1,str(len(subs)))
if subs:
    st,r=req('POST',f"/api/admin/photo-cards/submissions/{subs[0]['id']}/decide",atok,{'approve':True,'designId':idA})
    ck('تأیید با طرحِ انتخابیِ مدیر',st==200,f'{st} {r}')

print('\n══ گام ۸: کاربر ۵ شانس دارد ══')
seen=[]
for i in range(1,7):
    st,r=req('POST','/api/photo-cards/submit',utok,{'code':f'GHOST-{i:04d}'},{'image':('s.jpg',shot(imA),'image/jpeg')})
    seen.append((i,st,r.get('status'),r.get('triesLeft')))
    print(f'   تلاش {i}: {st} {r.get("status")} باقی‌مانده={r.get("triesLeft")}')
ck('تلاش‌های ۱ تا ۴ فقط اخطار می‌دهند',all(s[2]=='bad_code' for s in seen[:4]),str(seen[:4]))
ck('شمارش معکوس درست است (۴،۳،۲،۱)',[s[3] for s in seen[:4]]==[4,3,2,1],str([s[3] for s in seen[:4]]))
ck('تلاش پنجم قفل می‌کند',seen[4][2]=='locked',str(seen[4]))
ck('کد HTTP قفل = ۴۲۹',seen[4][1]==429,str(seen[4][1]))

print('\n══ گام ۹: قفل تا ۳ ساعت، حتی با کدِ درست ══')
st,r=req('POST','/api/photo-cards/submit',utok,{'code':'SPEC-0004'},{'image':('s.jpg',shot(imA),'image/jpeg')})
ck('کدِ درست هم در حالت قفل رد می‌شود',st==429 and r.get('status')=='locked',f'{st} {r.get("status")}')
ck('پیام «۳ ساعت» دارد',('3 ساعت' in r.get('message','') or '۳ ساعت' in r.get('message','')),r.get('message','')[:100])
ck('پیام «فعالیت مشکوک» دارد',('مشکوک' in r.get('message','')),r.get('message','')[:100])
st2,r2=req('GET','/api/admin/photo-cards/codes?q=SPEC-0004',atok)
row=[c for c in r2.get('codes',[]) if str(c['code'])=='SPEC-0004']
ck('کدِ سالم در حالت قفل مصرف نشد',row and row[0]['status']=='unused',str(row[0]['status'] if row else '—'))

print('\n══ گام ۱۰: سیستم قدیمی دست‌نخورده ══')
st,_=req('POST','/api/cards/redeem',utok,{'code':'NOT-REAL'}); ck('ثبت کد قدیمی کار می‌کند',st==404,str(st))
st,_=req('GET','/api/admin/card-codes',atok); ck('کدهای قدیمی سالم',st==200,str(st))
st,_=req('GET','/api/bootstrap',utok); ck('bootstrap سالم',st==200,str(st))

print(f'\n{"✓" if bad==0 else "✗"} {ok} موفق، {bad} ناموفق')
sys.exit(0 if bad==0 else 1)
