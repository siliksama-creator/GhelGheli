import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 400, height: 860 } });
const t0 = Date.now(); const reqs = []; const errs = [];
p.on('pageerror', e => errs.push(String(e)));
p.on('console', m => { if (m.type()==='error') errs.push(m.text()); });
p.on('response', r => { const u=r.url(); if (/ghelgheli/.test(u)) reqs.push({t:Date.now()-t0,u:u.replace(/^https?:\/\/[^/]+/,''),s:Number(r.headers()['content-length']||0),ty:r.request().resourceType()}); });
await p.goto('https://user.ghelghelishop.ir', { waitUntil: 'domcontentloaded' });
let seen=false, gone=null, first=null;
for (let i=0;i<80;i++){
  const s = await p.evaluate(()=>({there:!!document.querySelector('.splashRoot'),
    label:document.querySelector('.splashLabel')?.textContent||null,
    pct:document.querySelector('.splashPct')?.textContent||null}));
  if (s.there){ seen=true; if(!first) first=s; } else if (seen){ gone=Date.now()-t0; break; }
  await p.waitForTimeout(40);
}
console.log('پوشش دیده شد:', seen, '| مرحله:', JSON.stringify(first));
console.log('پوشش رفت در:', gone, 'ms');
console.log('تصویرها تا لحظهٔ رفتنِ پوشش:');
for (const r of reqs.filter(x=>/\.(webp|png)$/.test(x.u))) console.log('  ', String(r.t).padStart(5),'ms', String(r.s).padStart(7), r.u);
const after = await p.evaluate(()=>({hero:!!document.querySelector('.heroMark img'),
  w:Math.round(document.querySelector('.heroMark img')?.getBoundingClientRect().width||0)}));
console.log('صفحهٔ ورود:', JSON.stringify(after));
console.log('خطاها:', errs.length ? errs.slice(0,2) : 'بدونِ خطا');
await p.screenshot({path:'/home/user/webframes/live2-login.png'});
await b.close();
