import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport:{width:412,height:900}, deviceScaleFactor:2 });
await p.goto('https://user.ghelghelishop.ir/', { waitUntil:'networkidle', timeout:60000 });
const ins=await p.$$('input');
await ins[0].fill('09120000001'); await ins[1].fill('Test123456');
await p.click('button:has-text("ورود به حساب کاربری")');
await p.waitForTimeout(5000);

async function shot(name, fn){
  await fn();
  await p.waitForTimeout(5000);
  const t=await p.evaluate(()=>document.body.innerText);
  console.log('===',name,'=== len',t.length);
  console.log(JSON.stringify(t.slice(0,400)));
  await p.screenshot({path:`/tmp/thin_${name}.png`, fullPage:true});
}
await shot('wheel', async()=>{ await p.click('button[title$="گردونه شانس"], button.wheelShortcut'); });
await p.keyboard.press('Escape'); await p.waitForTimeout(800);
await shot('rewards', async()=>{ await p.click('.mobileNav button:has-text("جوایز")'); });
await shot('cards', async()=>{ await p.click('text=بیشتر'); await p.waitForTimeout(1200); await p.click('text=کلکسیون کارت‌ها'); });
await b.close();
