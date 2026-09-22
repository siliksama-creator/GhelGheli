/**
 * نگهبانِ یکدستیِ سبکِ فراخوانی در پنل ادمین.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * باگی که جلویش را می‌گیرد
 * ═══════════════════════════════════════════════════════════════════════
 *
 * ممیزیِ ۸ مهر ۱۴۰۵ پیدا کرد: `request` در پنل همان createApi خام است
 * (fetch با API_BASE + مسیرِ کامل) و ۲۷ صفحهٔ ۲۸ صفحه مسیرِ کاملِ
 * «/api/admin/...» می‌دهند — ولی cloudflare.jsx پنج فراخوانی با مسیرِ
 * نسبیِ «/cloudflare» داشت که در عمل به ۴۰۴/HTML می‌رسید: صفحهٔ
 * کلادفلر پنل از روز اول سیم‌کشیِ غلط داشت و هیچ تستی هم نمی‌شد چون
 * build و پاریتی‌ها رشته‌ها را چک می‌کنند، نه مقصدِ واقعی را.
 *
 * قراردادِ یگانه: آرگومانِ اولِ request همیشه با «/api» شروع می‌شود.
 * این گارد هر آرگومانِ نسبی را خطا می‌کند تا سبک دوم هرگز برنگردد.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const AD = path.join(REPO, 'admin', 'src');
let bad = 0;
const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { walk(p); continue; }
    if (!e.name.endsWith('.jsx') && !e.name.endsWith('.js')) continue;
    const src = fs.readFileSync(p, 'utf8');
    for (const m of src.matchAll(/request\(\s*(['"`])([^'"`]+)\1/g)) {
      if (!m[2].startsWith('/api')) {
        bad += 1;
        console.log(`✗ ${p.replace(REPO + '/', '')}:${src.slice(0, m.index).split('\n').length} → «${m[2]}» باید با /api شروع شود`);
      }
    }
  }
};
walk(AD);
if (bad) { console.log(`\n✗ ${bad} فراخوانی خارج از قرارداد`); process.exit(1); }
console.log('✅ همهٔ فراخوانی‌های پنل با مسیرِ کاملِ /api هم‌خوان‌اند');
