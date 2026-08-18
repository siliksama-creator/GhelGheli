import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport:{width:412,height:900} });
const errs=[];
p.on('pageerror', e=>errs.push({where:'?',msg:'PAGEERR: '+e.message.slice(0,140)}));
p.on('console', m=>{ if(m.type()==='error') errs.push({where:'?',msg:'CONSOLE: '+m.text().slice(0,140)}); });
await p.goto('https://user.ghelghelishop.ir/', { waitUntil:'networkidle', timeout:60000 });
const ins=await p.$$('input');
await ins[0].fill('09120000001'); await ins[1].fill('Test123456');
await p.click('button:has-text("ورود به حساب کاربری")');
await p.waitForTimeout(5000);

const targets = [
  ['هدر: فروشگاه','button[title="فروشگاه"]'],
  ['هدر: گردونه','button[title$="گردونه شانس"], button.wheelShortcut'],
  ['هدر: گذر نبرد','button[title="گذر نبرد فصلی"]'],
  ['هدر: اعلان‌ها','button[title="اعلان‌ها"]'],
];
for (const [name,sel] of targets) {
  const before=errs.length;
  const el=await p.$(sel);
  if(!el){ console.log(`— ${name}: دکمه پیدا نشد`); continue; }
  await el.click().catch(()=>{});
  await p.waitForTimeout(4500);
  const len=(await p.evaluate(()=>document.body.innerText)).length;
  const neu=errs.slice(before).map(e=>e.msg);
  console.log(`${neu.length?'✗':'✓'} ${name} · len=${len}${neu.length?' :: '+neu[0]:''}`);
  await p.keyboard.press('Escape').catch(()=>{});
  await p.waitForTimeout(500);
}
// تب‌های ناوبری پایین
for (const label of ['خانه','جوایز','لیگ','چت و بازی']) {
  const before=errs.length;
  await p.click(`.mobileNav button:has-text("${label}")`).catch(()=>{});
  await p.waitForTimeout(4500);
  const len=(await p.evaluate(()=>document.body.innerText)).length;
  const neu=errs.slice(before).map(e=>e.msg);
  console.log(`${neu.length?'✗':'✓'} تب ${label} · len=${len}${neu.length?' :: '+neu[0]:''}`);
}
// منوی بیشتر
await p.click('text=بیشتر').catch(()=>{});
await p.waitForTimeout(1500);
for (const label of ['کلکسیون کارت‌ها','کیف پول','دعوت دوستان','پشتیبانی','پروفایل']) {
  const before=errs.length;
  const el=await p.$(`text=${label}`);
  if(!el){ console.log(`— ${label}: نبود`); continue; }
  await el.click().catch(()=>{});
  await p.waitForTimeout(4000);
  const len=(await p.evaluate(()=>document.body.innerText)).length;
  const neu=errs.slice(before).map(e=>e.msg);
  console.log(`${neu.length?'✗':'✓'} ${label} · len=${len}${neu.length?' :: '+neu[0]:''}`);
  await p.click('text=بیشتر').catch(()=>{});
  await p.waitForTimeout(1200);
}
console.log('\nمجموع خطاها:', errs.length);
await b.close();
