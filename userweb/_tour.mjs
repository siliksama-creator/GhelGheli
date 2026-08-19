import { chromium } from 'playwright';
import fs from 'fs';
const OUT='/tmp/tour'; fs.mkdirSync(OUT,{recursive:true});
const b = await chromium.launch();
const p = await (await b.newContext({viewport:{width:412,height:915},deviceScaleFactor:2})).newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message.slice(0,140)));
await p.goto('https://user.ghelghelishop.ir/',{waitUntil:'networkidle',timeout:90000});
await p.screenshot({path:`${OUT}/00-login.png`});
const ins=await p.$$('input');
await ins[0].fill('09120000001'); await ins[1].fill('Test123456');
await p.click('button:has-text("ورود به حساب کاربری")'); await p.waitForTimeout(6000);
const shot=async(n)=>{await p.waitForTimeout(2200); await p.screenshot({path:`${OUT}/${n}.png`,fullPage:true});
  console.log(n,'✓');};
await shot('01-home');
for (const [tab,name] of [['جوایز','02-rewards'],['لیگ','03-league'],['چت و بازی','04-club']]) {
  try{ await p.click(`.mobileNav button:has-text("${tab}")`); await shot(name);}catch(e){console.log(name,'✗',e.message.slice(0,60));}
}
try{ await p.click('button:has-text("بازی‌ها")'); await shot('05-games'); }catch(e){console.log('games ✗');}
try{ await p.click('text=بیشتر'); await p.waitForTimeout(1000); await p.screenshot({path:`${OUT}/06-more.png`});
     await p.click('button:has-text("فروشگاه")'); await shot('07-shop'); }catch(e){console.log('shop ✗');}
try{ await p.click('text=بیشتر'); await p.waitForTimeout(1000);
     await p.click('button:has-text("کیف پول")'); await shot('08-wallet'); }catch(e){console.log('wallet ✗');}
try{ await p.click('button.wheelShortcut'); await shot('09-wheel'); }catch(e){console.log('wheel ✗');}
console.log('errors:',errs.length?errs:'none');
await b.close();
