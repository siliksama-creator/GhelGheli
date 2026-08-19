import { chromium } from 'playwright';
const b=await chromium.launch();
const p=await (await b.newContext({viewport:{width:1440,height:900}})).newPage();
await p.goto('https://user.ghelghelishop.ir/',{waitUntil:'networkidle',timeout:60000});
const ins=await p.$$('input'); await ins[0].fill('09120000001'); await ins[1].fill('Test123456');
await p.click('button:has-text("ورود به حساب کاربری")'); await p.waitForTimeout(6000);
const r=await p.evaluate(()=>{
  const q=s=>{const e=document.querySelector(s);return e?Math.round(e.getBoundingClientRect().width):null};
  const cards=[...document.querySelectorAll('.tabPane .card')].slice(0,5)
    .map(e=>Math.round(e.getBoundingClientRect().width));
  return {tabPane:q('.tabPane'), page:q('.page'), cards,
    pageH:Math.round(document.body.scrollHeight)};
});
console.log(JSON.stringify(r));
await b.close();
