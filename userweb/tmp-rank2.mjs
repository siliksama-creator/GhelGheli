import { chromium } from 'playwright';
const TOK=process.argv[2];
const b=await chromium.launch();
const ctx=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2});
const p=await ctx.newPage();
await p.addInitScript(()=>localStorage.setItem('coinGuideSeen','1')); // راهنما بسته
await p.route('**/api/league/current*', async route => {
  const res=await route.fetch(); const j=await res.json();
  const names=['کاپیتان‌رضا','سلطان‌گل','هت‌تریک','مهدی‌طوفان','آرش‌کمانگیر','پنالتی‌زن','یوز_ایرانی','گلادیاتور','شاهین‌تهرانی','ببر_مازندران','عقاب‌طلایی','نیمار_ایران'];
  j.entries=names.map((n,i)=>({user_id:'u'+i,nickname:n,coins:120-i*7,points:9500-i*430,level:20-i,cosmetics:null}));
  j.myEntry={rank:5,coins:88,points:7350};
  await route.fulfill({response:res,json:j});
});
await p.goto('https://user.ghelghelishop.ir',{waitUntil:'networkidle'});
await p.evaluate(t=>localStorage.setItem('token',t),TOK);
await p.reload({waitUntil:'networkidle'}); await p.waitForTimeout(2500);
await p.locator('.mobileNav button',{hasText:'لیگ'}).click(); await p.waitForTimeout(2200);
const r=await p.evaluate(()=>{
  const g=document.querySelector('.coinGuide');
  const rows=[...document.querySelectorAll('div')].filter(d=>d.style.borderRadius==='12px'&&d.style.justifyContent==='space-between');
  const my=[...document.querySelectorAll('div')].find(d=>/جایگاه شما/.test(d.textContent||'')&&d.children.length<4);
  return {
    guideHeight:g?Math.round(g.getBoundingClientRect().height):null,
    rankRows:rows.length, rowH:rows.slice(0,3).map(d=>Math.round(d.getBoundingClientRect().height)),
    myEntryH:my?Math.round(my.closest('div[style*="border-radius: 16px"]')?.getBoundingClientRect().height||0):null,
    docHeight:Math.round(document.body.scrollHeight), fold:innerHeight,
    firstRowTop: rows.length?Math.round(rows[0].getBoundingClientRect().top):null,
  };
});
console.log(JSON.stringify(r,null,1));
await p.screenshot({path:'/home/user/lg-closed.png'});
await b.close();
