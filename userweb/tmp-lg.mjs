import { chromium } from 'playwright';
const TOK=process.argv[2], BASE='https://user.ghelghelishop.ir';
const b=await chromium.launch();
const ctx=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2});
const p=await ctx.newPage();
await p.goto(BASE,{waitUntil:'networkidle'});
await p.evaluate(t=>localStorage.setItem('token',t),TOK);
await p.reload({waitUntil:'networkidle'}); await p.waitForTimeout(2500);
await p.locator('.mobileNav button',{hasText:'لیگ'}).click(); await p.waitForTimeout(2200);
const r=await p.evaluate(()=>{
  const g=document.querySelector('.coinGuide');
  const gh=g?Math.round(g.getBoundingClientRect().height):null;
  const gt=g?Math.round(g.getBoundingClientRect().top):null;
  // ردیف‌های رتبه ۴+ : والدشان دیوِ بعد از myEntry
  const rows=[...document.querySelectorAll('div')].filter(d=>{
    const s=getComputedStyle(d);
    return s.justifyContent==='space-between' && d.style.borderRadius==='12px';
  });
  // پودیوم
  const pod=[...document.querySelectorAll('div')].find(d=>/رتبه ۱/.test(d.textContent||'')&&d.children.length<3);
  return {
    guideTop:gt, guideHeight:gh,
    rankRowCount:rows.length,
    rankRowHeights:rows.slice(0,5).map(d=>Math.round(d.getBoundingClientRect().height)),
    docHeight:Math.round(document.body.scrollHeight), fold:innerHeight,
  };
});
console.log(JSON.stringify(r,null,1));
await p.screenshot({path:'/home/user/lg-before.png',fullPage:false});
await b.close();
