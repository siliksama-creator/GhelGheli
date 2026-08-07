# -*- coding: utf-8 -*-
"""جریانِ ثبت کارت با عکس — نسخهٔ قدیمی.

⚠️⚠️ این فایل **بازنشسته است و اجرا نشود**.

═══════════════════════════════════════════════════════════════════════════
چرا بازنشسته شد (۷ آگوست ۲۰۲۶)
═══════════════════════════════════════════════════════════════════════════

کاربرِ تستِ `09001112233` را **هاردکد** کرده و فرض می‌کند از قبل وجود
دارد. بعد از پاکسازیِ عرضه (`reset_for_launch.py`) آن کاربر دیگر نیست،
پس تست با `KeyError: 'token'` می‌ترکد — خطایی که شبیهِ «سرور خراب است»
به نظر می‌رسد در حالی که سرور کارِ درست را کرده.

این همان درسی است که در `_authcache.py` نوشته شده: ابزارِ تست باید
دادهٔ خودش را بسازد، نه به دادهٔ باقی‌مانده تکیه کند. ابزارهای تازه‌تر
همه کاربرِ خودشان را با شمارهٔ یکتا می‌سازند و در پایان پاک می‌کنند.

جانشین‌ها که همین جریان را با دادهٔ خودساخته پوشش می‌دهند:
    tools/e2e_photospec.py   ۳۰ بررسی
    tools/e2e_photov2.py     ۱۷ بررسی
    tools/e2e_invside.py     تصویرِ تصادفیِ اینونتوری
    tools/audit_multiweb.py  همان جریان در مرورگرِ واقعی
"""
import sys as _sys_guard

if '--force' not in _sys_guard.argv:
    raise SystemExit(
        '\n⚠️  این تست بازنشسته شده — سربرگِ فایل را بخوانید.\n'
        '    کاربرِ تستِ هاردکدشده‌اش بعد از پاکسازیِ عرضه وجود ندارد.\n'
        '    جایگزین‌ها: e2e_photospec.py · e2e_photov2.py · audit_multiweb.py\n'
        '    اگر واقعاً لازم دارید: --force\n')

import io,json,sys,urllib.request,urllib.error,colorsys
from PIL import Image,ImageDraw,ImageFilter,ImageEnhance
API='https://api.ghelghelishop.ir'; B='----zz'
def req(m,p,token=None,body=None,files=None):
    h={}
    if token: h['Authorization']='Bearer '+token
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
    else: bad+=1; print('  ✗',n,str(d)[:170])

apw=sys.argv[1]
_,a=req('POST','/api/admin/auth/login',body={'username':'Admin','password':apw}); atok=a['token']
_,u=req('POST','/api/auth/login',body={'mobile':'09001112233','password':'Qa!12345'}); utok=u['token']

def card(hue,seed):
    im=Image.new('RGB',(420,640)); d=ImageDraw.Draw(im)
    for y in range(640):
        f=y/640; rr,gg,bb=colorsys.hsv_to_rgb(((hue+f*45)%360)/360,0.75,0.32+0.42*f)
        d.line([(0,y),(420,y)],fill=(int(rr*255),int(gg*255),int(bb*255)))
    d.ellipse([95,190,325,425],fill=(250,215,70) if hue<100 else (70,225,180))
    d.rectangle([0,545,420,640],fill=(14,14,24))
    d.text((150,585),f'S{seed}',fill=(255,255,255))
    b=io.BytesIO(); im.save(b,'PNG'); return b.getvalue(),im
def deg(im,rot=6,blur=1.2,sc=0.35,br=0.8):
    o=im.rotate(rot,expand=True,fillcolor=(28,28,34))
    o=o.resize((int(o.width*sc),int(o.height*sc)),Image.LANCZOS).filter(ImageFilter.GaussianBlur(blur))
    o=ImageEnhance.Brightness(o).enhance(br)
    b=io.BytesIO(); o.save(b,'JPEG',quality=45); return b.getvalue()

print('\n═══ آماده‌سازی ═══')
png,im1=card(210,1)
st,r=req('POST','/api/admin/photo-cards/designs',atok,{'name':'FLOW-آبی','pointValue':'150'},{'image':('a.png',png,'image/png')})
ck('طرح آپلود شد',st==200,f'{st} {r}')
design_id=r.get('design',{}).get('id')
st,r=req('POST','/api/admin/photo-cards/codes',atok,{'rawCodes':'\n'.join(f'FLOW-{i:04d}' for i in range(1,13))})
ck('۱۲ کد ثبت شد',st==200 and r['insertedCount']==12,f'{st} {r.get("insertedCount")}')

print('\n═══ ۱. کد معتبر + عکس درست → تأیید خودکار ═══')
st,r=req('POST','/api/photo-cards/submit',utok,{'code':'FLOW-0001'},{'image':('s.jpg',deg(im1),'image/jpeg')})
ck('پذیرفته شد',st==200 and r.get('status')=='approved',f'{st} {r}')
ck('امتیاز داده شد',r.get('addedPoints')==150,str(r.get('addedPoints')))

print('\n═══ ۲. کد معتبر + عکس ناشناخته → صف بررسی (نه رد) ═══')
noise=Image.effect_noise((360,500),95).convert('RGB')
nb=io.BytesIO(); noise.save(nb,'JPEG',quality=55)
st,r=req('POST','/api/photo-cards/submit',utok,{'code':'FLOW-0002'},{'image':('n.jpg',nb.getvalue(),'image/jpeg')})
ck('به صف بررسی رفت نه رد',st==200 and r.get('status')=='pending',f'{st} {r}')
ck('علت image_unknown است',r.get('reason')=='image_unknown',str(r.get('reason')))
ck('پیام می‌گوید کد درست است',('کد شما درست است' in r.get('message','')),r.get('message',''))

print('\n═══ ۳. مدیر طرح را دستی انتخاب می‌کند ═══')
st,r=req('GET','/api/admin/photo-cards/designs/options',atok)
ck('فهرست انتخاب طرح',st==200 and len(r.get('options',[]))>=1,str(st))
st,r=req('GET','/api/admin/photo-cards/submissions?status=pending',atok)
subs=r.get('submissions',[])
ck('پرونده در صف است',len(subs)>=1,str(len(subs)))
if subs:
    s0=subs[0]
    ck('review_reason به مدیر می‌رسد',s0.get('review_reason')=='image_unknown',str(s0.get('review_reason')))
    st,r=req('POST',f"/api/admin/photo-cards/submissions/{s0['id']}/decide",atok,{'approve':True,'designId':design_id})
    ck('تأیید با طرحِ انتخابیِ مدیر',st==200,f'{st} {r}')

print('\n═══ ۴. کد غلط → پیام راهنما + شمارش ═══')
st,r=req('POST','/api/photo-cards/submit',utok,{'code':'NOPE-9999'},{'image':('s.jpg',deg(im1),'image/jpeg')})
ck('کد غلط رد شد',st==404 and r.get('status')=='bad_code',f'{st} {r.get("status")}')
ck('راهنمای O/0 و I/L/1 داده شد',('O' in r.get('message','') and 'I' in r.get('message','')),r.get('message','')[:110])
ck('تعداد تلاش باقی‌مانده اعلام شد',r.get('triesLeft')==4,str(r.get('triesLeft')))

print('\n═══ ۵. پنج کد غلط → قفل ۳ ساعته ═══')
last=None
for i in range(2,7):
    st,last=req('POST','/api/photo-cards/submit',utok,{'code':f'WRONG-{i:04d}'},{'image':('s.jpg',deg(im1),'image/jpeg')})
    print(f'   تلاش {i}: {st} {last.get("status")} triesLeft={last.get("triesLeft")}')
ck('بعد از ۵ خطا قفل شد',last.get('status')=='locked',str(last.get('status')))
ck('پیام «فعالیت مشکوک» دارد',('مشکوک' in last.get('message','')),last.get('message','')[:110])
ck('۳ ساعت اعلام شد',('3 ساعت' in last.get('message','') or '۳ ساعت' in last.get('message','')),last.get('message','')[:110])

print('\n═══ ۶. حتی با کد درست هم قفل باقی است ═══')
st,r=req('POST','/api/photo-cards/submit',utok,{'code':'FLOW-0005'},{'image':('s.jpg',deg(im1),'image/jpeg')})
ck('قفل کد درست را هم بلاک می‌کند',st==429 and r.get('status')=='locked',f'{st} {r.get("status")}')

print('\n═══ ۷. سیستم قدیمی دست‌نخورده ═══')
st,r=req('POST','/api/cards/redeem',utok,{'code':'NOT-A-REAL-CODE'})
ck('ثبت کد قدیمی کار می‌کند',st==404,f'{st}')
st,r=req('GET','/api/bootstrap',utok); ck('bootstrap سالم',st==200,str(st))

print(f'\n{"✓" if bad==0 else "✗"} {ok} موفق، {bad} ناموفق')
