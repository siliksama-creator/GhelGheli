import { chromium } from 'playwright';
const URL=process.argv[2]||'http://127.0.0.1:4173/';
const b=await chromium.launch();
const ctx=await b.newContext({viewport:{width:412,height:900}});
const p=await ctx.newPage();
const cdp=await ctx.newCDPSession(p); await cdp.send('Network.enable');
await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:150,
  downloadThroughput:1.6*1024*1024/8, uploadThroughput:750*1024/8});
await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
let js=0,css=0,n=0;
p.on('response',async r=>{try{const bd=await r.body().catch(()=>null);if(!bd)return;
  const u=r.url(); if(u.includes('/assets/')){n++; u.endsWith('.css')?css+=bd.length:js+=bd.length;}}catch{}});
const t0=Date.now();
await p.goto(URL,{waitUntil:'domcontentloaded',timeout:120000});
const m=await p.evaluate(()=>{const f=performance.getEntriesByType('paint').find(e=>e.name==='first-contentful-paint');
  return {fcp:Math.round(f?f.startTime:0)};});
await p.waitForLoadState('networkidle',{timeout:120000});
console.log(`FCP ${m.fcp}ms | DCL ${Date.now()-t0}ms | JS ${(js/1024).toFixed(0)}KB | CSS ${(css/1024).toFixed(0)}KB | ${n} فایل`);
await b.close();
