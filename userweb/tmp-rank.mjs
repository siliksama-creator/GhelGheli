import { chromium } from 'playwright';
const TOK=process.argv[2];
const b=await chromium.launch();
const ctx=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2});
const p=await ctx.newPage();
// ۱۲ کاربر ساختگی به پاسخ لیگ تزریق می‌کنیم (فقط در مرورگر، DB دست‌نخورده)
await p.route('**/api/league/current*', async route => {
  const res = await route.fetch();
  const j = await res.json();
  const names=['کاپیتان‌رضا','سلطان‌گل','هت‌تریک','مهدی‌طوفان','آرش‌کمانگیر','پنالتی‌زن','یوز_ایرانی','گلادیاتور','شاهین‌تهرانی','ببر_مازندران','عقاب‌طلایی','نیمار_ایران'];
  j.entries = names.map((n,i)=>({user_id:'u'+i, nickname:n, coins:120-i*7, points:9500-i*430, level:20-i, cosmetics:null}));
  j.myEntry = {rank:5, coins:88, points:7350};
  await route.fulfill({response:res, json:j});
});
await p.goto('https://user.ghelghelishop.ir',{waitUntil:'networkidle'});
await p.evaluate(t=>localStorage.setItem('token',t),TOK);
await p.reload({waitUntil:'networkidle'}); await p.waitForTimeout(2500);
await p.locator('.mobileNav button',{hasText:'لیگ'}).click(); await p.waitForTimeout(2200);
const r=await p.evaluate(()=>{
  const rows=[...document.querySelectorAll('div')].filter(d=>d.style.borderRadius==='12px'&&d.style.justifyContent==='space-between');
  const pod=document.querySelectorAll('[style*="flex-end"] > div');
  return {
    rankRows:rows.length,
    rowHeights:rows.slice(0,4).map(d=>Math.round(d.getBoundingClientRect().height)),
    podiumHeight: pod.length?Math.round(pod[0].parentElement.getBoundingClientRect().height):null,
    docHeight:Math.round(document.body.scrollHeight), fold:innerHeight,
  };
});
console.log(JSON.stringify(r,null,1));
await p.screenshot({path:'/home/user/lg-before.png'});
await b.close();
