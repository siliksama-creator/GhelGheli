/**
 * نگهبانِ سرریزِ نامِ کاربر.
 *
 * `users.nickname` در دیتابیس `VARCHAR(100)` است و هیچ‌جا — نه در ثبت‌نام
 * نه در ویرایشِ پروفایل — کوتاه نمی‌شود. یعنی یک کاربر می‌تواند نامی
 * صد کاراکتری بگذارد و آن نام در فهرستِ دوستان، جدولِ لیگ و دیالوگِ
 * پیروزیِ **بقیهٔ کاربران** ظاهر شود.
 *
 * سمتِ وب این را در CSS حل کرده (`.friendRow b{text-overflow:ellipsis}`)،
 * ولی فلاتر پیش‌فرضِ معادلی ندارد: متن یا می‌پیچد و ردیف را سه‌برابر
 * بلند می‌کند، یا اگر جا نباشد نوارِ زردِ سرریز می‌دهد. در دورِ ۲۸ یک
 * موردِ واقعی پیدا شد که ۶۰۶ پیکسل سرریز می‌کرد.
 *
 * این نگهبان می‌گوید: هر جا نامِ کاربر مستقیماً در یک ردیفِ فشرده
 * چاپ می‌شود، باید `maxLines` و `overflow` داشته باشد.
 */
import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
const ck = (name, cond, detail = '') => {
  if (cond) { pass++; console.log('  ✓', name); }
  else { fail++; console.log('  ✗', name, detail ? `→ ${detail}` : ''); }
};

const R = new URL('../../', import.meta.url).pathname;

console.log('\n══ نامِ کاربر در اندروید ellipsis دارد ══');
const GUARDED = [
  ['mobile/lib/screens/user/games/growth_panel.dart', "friend['nickname']"],
  ['mobile/lib/screens/user/games/growth_panel.dart', "user['nickname']"],
  ['mobile/lib/widgets/victory_share_dialog.dart', 'nickname'],
];
for (const [file, needle] of GUARDED) {
  const src = readFileSync(R + file, 'utf8');
  // `Text(` می‌تواند چندخطی باشد، پس روی خط تکیه نمی‌کنیم: از هر
  // «Text(» جلو می‌رویم تا پرانتزش بسته شود و همان بازه را می‌سنجیم.
  const hits = [];
  for (let i = 0; i < src.length; ) {
    const start = src.indexOf('Text(', i);
    if (start < 0) break;
    let depth = 0, end = start + 4;
    for (; end < src.length; end++) {
      if (src[end] === '(') depth++;
      else if (src[end] === ')') { depth--; if (depth === 0) break; }
    }
    const seg = src.slice(start, end + 1);
    if (seg.includes(needle)) {
      hits.push([seg, src.slice(0, start).split('\n').length]);
    }
    i = start + 5;
  }
  ck(`${file.split('/').pop()} · ${needle} چاپ می‌شود`, hits.length > 0);
  for (const [seg, n] of hits) {
    ck(`  خط ${n} · maxLines + overflow دارد`,
      /maxLines/.test(seg) && /TextOverflow\.ellipsis/.test(seg),
      'نامِ بلندِ کاربر چیدمان را خراب می‌کند');
  }
}

console.log('\n══ وب هم همان قاعده را دارد ══');
const css = readFileSync(R + 'userweb/src/growth.css', 'utf8');
ck('.friendRow b سه‌نقطه می‌گذارد',
  /\.friendRow b\{[^}]*text-overflow:ellipsis/.test(css)
  && /\.friendRow b\{[^}]*white-space:nowrap/.test(css));

console.log(fail ? `\n✗ ${pass} موفق، ${fail} ناموفق\n` : `\n✓ ${pass} بررسی موفق\n`);
process.exit(fail ? 1 : 0);
