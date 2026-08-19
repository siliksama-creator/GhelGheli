import { chromium } from 'playwright';
const URL='https://user.ghelghelishop.ir/';
const b = await chromium.launch();

// گوشیِ متوسطِ ایرانی: CPU کند + 4G واقعی
const ctx = await b.newContext({ viewport:{width:412,height:900},
  userAgent:'Mozilla/5.0 (Linux; Android 11; SM-A115F) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36' });
const p = await ctx.newPage();
const cdp = await ctx.newCDPSession(p);
await cdp.send('Network.enable');
await cdp.send('Network.emulateNetworkConditions',{offline:false,
  latency:150, downloadThroughput:1.6*1024*1024/8, uploadThroughput:750*1024/8});
await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});

const bytes={}; let total=0;
p.on('response', async r=>{ try{
  const h=await r.body().catch(()=>null); if(!h) return;
  const u=r.url(); const k=u.includes('/assets/')?(u.endsWith('.css')?'CSS':'JS')
    :u.includes('/api/')?'API':u.match(/\.(webp|png|jpe?g|svg)/)?'IMG'
    :u.match(/\.(woff2?|ttf)/)?'FONT':'other';
  bytes[k]=(bytes[k]||0)+h.length; total+=h.length;
}catch{} });

const t0=Date.now();
await p.goto(URL,{waitUntil:'domcontentloaded',timeout:120000});
const dcl=Date.now()-t0;
await p.waitForLoadState('networkidle',{timeout:120000});
const idle=Date.now()-t0;

const m = await p.evaluate(()=>{
  const n=performance.getEntriesByType('navigation')[0]||{};
  const fcp=performance.getEntriesByType('paint').find(e=>e.name==='first-contentful-paint');
  return { ttfb:Math.round(n.responseStart||0), domInt:Math.round(n.domInteractive||0),
    fcp:Math.round(fcp?fcp.startTime:0), domNodes:document.querySelectorAll('*').length,
    styleSheets:document.styleSheets.length,
    cssRules:[...document.styleSheets].reduce((a,s)=>{try{return a+s.cssRules.length}catch{return a}},0) };
});
console.log('── لودِ اولیه (4G + CPU ×4 کندتر) ──');
console.log(' TTFB:',m.ttfb,'ms | FCP:',m.fcp,'ms | DOMInteractive:',m.domInt,'ms');
console.log(' DOMContentLoaded:',dcl,'ms | networkidle:',idle,'ms');
console.log(' DOM nodes:',m.domNodes,'| CSS rules:',m.cssRules);
console.log('── بایت‌ها ──');
for(const [k,v] of Object.entries(bytes).sort((a,b)=>b[1]-a[1])) console.log(` ${k}: ${(v/1024).toFixed(1)} KB`);
console.log(` TOTAL: ${(total/1024).toFixed(1)} KB`);
await b.close();
