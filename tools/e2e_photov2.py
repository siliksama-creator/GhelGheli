# -*- coding: utf-8 -*-
import io,json,sys,urllib.request,urllib.error,colorsys
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
_,a=req('POST','/api/admin/auth/login',body={'username':'Admin','password':apw}); atok=a['token']
_,u=req('POST','/api/auth/login',body={'mobile':'09001112233','password':'Qa!12345'}); utok=u['token']
uid=u['user']['id'] if 'user' in u else None

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
def good(im):
    o=im.rotate(4,expand=True,fillcolor=(28,28,34))
    o=o.resize((int(o.width*0.5),int(o.height*0.5)),Image.LANCZOS).filter(ImageFilter.GaussianBlur(0.5))
    b=io.BytesIO(); o.save(b,'JPEG',quality=70); return b.getvalue()

pA,imA=card(205,1); pB,imB=card(25,2)
stA,rA=req('POST','/api/admin/photo-cards/designs',atok,{'name':'T2-آبی','pointValue':'150'},{'image':('a.png',pA,'image/png')})
stB,rB=req('POST','/api/admin/photo-cards/designs',atok,{'name':'T2-نارنجی','pointValue':'250'},{'image':('b.png',pB,'image/png')})
idA=rA['design']['id']
req('POST','/api/admin/photo-cards/codes',atok,{'rawCodes':'\n'.join(f'T2-{i:04d}' for i in range(1,13)),'batchLabel':'دستهٔ تست'})

print('\n══ ۱. پیام ۲۴ ساعته ══')
st,r=req('POST','/api/photo-cards/submit',utok,{'code':'T2-0001'},{'image':('b.jpg',blurry(imA),'image/jpeg')})
ck('به صف بررسی رفت',st==200 and r.get('status')=='pending',f'{st} {r.get("status")}')
ck('پیام «۲۴ ساعت» دارد','۲۴ ساعت' in r.get('message',''),r.get('message','')[:110])
ck('پیام «کیفیت» را توضیح می‌دهد','کیفیت' in r.get('message',''),r.get('message','')[:110])

print('\n══ ۲. همان عکس با کدِ دیگر → رد ══')
st,r=req('POST','/api/photo-cards/submit',utok,{'code':'T2-0002'},{'image':('b2.jpg',blurry(imA),'image/jpeg')})
ck('عکسِ تکراری رد شد',st==409 and r.get('status')=='duplicate_pending',f'{st} {r.get("status")}')
ck('توضیح «وضوح کامل نداشت»','وضوح' in r.get('message',''),r.get('message','')[:120])
ck('گفته کارت‌های دیگر مجازند','کارت‌های دیگر' in r.get('message',''),r.get('message','')[:120])
st2,r2=req('GET','/api/admin/photo-cards/codes?q=T2-0002',atok)
row=[c for c in r2.get('codes',[]) if str(c['code'])=='T2-0002']
ck('کدِ دوم مصرف نشد',row and row[0]['status']=='unused',str(row[0]['status'] if row else '-'))

print('\n══ ۳. کارتِ دیگر با عکسِ متفاوت → مجاز ══')
st,r=req('POST','/api/photo-cards/submit',utok,{'code':'T2-0003'},{'image':('g.jpg',good(imB),'image/jpeg')})
ck('کارت دوم ثبت شد',st==200 and r.get('status')=='approved',f'{st} {r.get("status")} {r.get("message","")[:60]}')

print('\n══ ۴. بعد از تأیید مدیر، وضعیت approved می‌شود ══')
st,r=req('GET','/api/admin/photo-cards/submissions?status=pending',atok)
subs=[s for s in r.get('submissions',[]) if s.get('code')=='T2-0001']
if subs:
    req('POST',f"/api/admin/photo-cards/submissions/{subs[0]['id']}/decide",atok,{'approve':True,'designId':idA})
st,r=req('GET','/api/photo-cards/my-submissions',utok)
mine=r.get('submissions',[])
pend=[m for m in mine if m['status']=='pending']
ck('هیچ پروندهٔ pending نمانده',len(pend)==0,f'{len(pend)} مانده')
ck('پرونده approved شد',any(m['status']=='approved' for m in mine),str([m['status'] for m in mine[:3]]))

print('\n══ ۵. حالا همان عکس دوباره مجاز است ══')
st,r=req('POST','/api/photo-cards/submit',utok,{'code':'T2-0002'},{'image':('b3.jpg',blurry(imA),'image/jpeg')})
ck('بعد از تعیین تکلیف، عکس دیگر مسدود نیست',r.get('status')!='duplicate_pending',f'{st} {r.get("status")}')

print('\n══ ۶. XP گذر نبرد داده نمی‌شود ══')
st,before=req('GET','/api/pass',utok)
st,r=req('POST','/api/photo-cards/submit',utok,{'code':'T2-0005'},{'image':('g2.jpg',good(imB),'image/jpeg')})
st,after=req('GET','/api/pass',utok)
bx=before.get('xp') or before.get('progress',{}).get('xp') or 0
ax=after.get('xp') or after.get('progress',{}).get('xp') or 0
ck('XP گذر نبرد تغییر نکرد',bx==ax,f'قبل={bx} بعد={ax}')

print('\n══ ۷. ویرایش و حذف کد ══')
st,r=req('GET','/api/admin/photo-cards/codes?status=unused',atok)
free=[c for c in r.get('codes',[]) if str(c['code']).startswith('T2-')]
cid=free[0]['id']; oldc=free[0]['code']
st,r=req('PATCH',f'/api/admin/photo-cards/codes/{cid}',atok,{'code':'T2-EDITED-1'})
ck('ویرایش کد',st==200 and r.get('code')=='T2-EDITED-1',f'{st} {r}')
st,r=req('PATCH',f'/api/admin/photo-cards/codes/{cid}',atok,{'batchLabel':'دستهٔ نو'})
ck('ویرایش برچسب',st==200 and r.get('batch_label')=='دستهٔ نو',f'{st} {r.get("batch_label")}')
st,r=req('DELETE',f'/api/admin/photo-cards/codes/{free[1]["id"]}',atok)
ck('حذف کد آزاد',st==200,f'{st} {r}')
st2,r2=req('GET','/api/admin/photo-cards/codes?q=T2-0001',atok)
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
       any(n.startswith('T2-') for n in names),str(names[:4]))

print(f'\n{"✓" if bad==0 else "✗"} {ok} موفق، {bad} ناموفق')
