import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
// کند کردنِ config تا لحظهٔ پرشِ لوگو قابلِ عکس‌گرفتن شود
await p.route('**/api/config**', async (r) => { await new Promise(x => setTimeout(x, 1500)); r.abort(); });
await p.goto('https://user.ghelghelishop.ir', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(1150);
await p.screenshot({ path: '/home/user/webframes/live-splash-1.png' });
await p.waitForTimeout(1200);
await p.screenshot({ path: '/home/user/webframes/live-splash-2.png' });
await p.waitForTimeout(1200);
await p.screenshot({ path: '/home/user/webframes/live-splash-3.png' });
await b.close();
