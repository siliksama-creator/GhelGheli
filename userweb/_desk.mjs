import { chromium } from 'playwright';
import fs from 'fs'; fs.mkdirSync('/tmp/desk',{recursive:true});
const b=await chromium.launch();
const p=await (await b.newContext({viewport:{width:1440,height:900}})).newPage();
await p.goto('https://user.ghelghelishop.ir/',{waitUntil:'networkidle',timeout:90000});
const ins=await p.$$('input'); await ins[0].fill('09120000001'); await ins[1].fill('Test123456');
await p.click('button:has-text("ورود به حساب کاربری")'); await p.waitForTimeout(6000);
await p.screenshot({path:'/tmp/desk/home.png'});
// عرض محتوا در برابر عرض پنجره
const m=await p.evaluate(()=>{
  const cand=[...document.querySelectorAll('div,main,section')]
    .map(e=>({c:e.className&&String(e.className).slice(0,40),w:e.getBoundingClientRect().width}))
    .filter(x=>x.w>200).sort((a,b)=>b.w-a.w).slice(0,6);
  return {vw:innerWidth, top:cand};
});
console.log('viewport',m.vw); m.top.forEach(t=>console.log(' ',t.w.toFixed(0),t.c));
await p.click('.mobileNav button:has-text("لیگ")').catch(()=>{});
await p.waitForTimeout(2500); await p.screenshot({path:'/tmp/desk/league.png'});
await b.close();
