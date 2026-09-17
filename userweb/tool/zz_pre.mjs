import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 400, height: 860 } });
const t0 = Date.now();
p.on('request', r => { const u = r.url(); if (/logo\.webp|index-|\.css/.test(u))
  console.log('REQ  ', String(Date.now()-t0).padStart(5), r.resourceType().padEnd(9), u.replace(/^https?:\/\/[^/]+/,'').slice(0,40)); });
p.on('response', r => { const u = r.url(); if (/logo\.webp/.test(u))
  console.log('RESP ', String(Date.now()-t0).padStart(5), '                 ', u.replace(/^https?:\/\/[^/]+/,'').slice(0,40)); });
await p.goto('https://user.ghelghelishop.ir', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(3500);
await b.close();
