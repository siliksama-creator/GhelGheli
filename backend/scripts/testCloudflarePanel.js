#!/usr/bin/env node
/**
 * گاردِ «سپرِ سرور (کلادفلر)» — خواستهٔ مالک، ۲۶ شهریور.
 *
 * ── چرا این تست این‌قدر جدی است ──────────────────────────────────────────
 *
 * این قابلیت در بدترین حالت می‌تواند دسترسیِ کلِ برنامه (اپ + وب + پنل) را
 * قطع کند. پس دو چیز باید قفل شود:
 *
 *   ۱. **خاموش‌بودنِ پیش‌فرض.** تا وقتی مالک دکمه را نزده، نباید هیچ رکوردی
 *      نارنجی شود و هیچ فایلی برای نگهبانِ سرور نوشته شود — وگرنه «آماده
 *      بمان تا لازم شود» تبدیل می‌شود به «بی‌خبر روشن شد».
 *   ۲. **تأییدِ اجباری.** روشن‌کردن بدونِ «تأییدِ دامنه‌ها» و بدونِ کلمهٔ
 *      تأییدِ متنی نباید کار کند.
 *
 * ── چه چیزی واقعاً آزمایش می‌شود ─────────────────────────────────────────
 *
 * یک **کلادفلرِ جعلی** روی localhost بالا می‌آید (`CF_API_BASE`) و سرویس با
 * ذخیره‌گاهِ درون‌حافظه و رمزنگاریِ سادهٔ تستی ساخته می‌شود. پس هیچ تستی به
 * حسابِ واقعیِ مالک دست نمی‌زند و هیچ دیتابیسی لازم نیست — این تست هم
 * لوکال سبز می‌شود هم در CI.
 */
const assert = require('assert');
const { execFileSync } = require('child_process');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const { createCloudflareGuard } = require('../src/services/cloudflareGuard');

let pass = 0; let fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass += 1; console.log('  ✓', name); } else { fail += 1; console.log('  ✗', name, detail ? `→ ${detail}` : ''); }
};
const okAsync = async (name, fn) => {
  try { const v = await fn(); ok(name, v === undefined ? true : !!v); }
  catch (e) { ok(name, false, e.message); }
};

// ═══════════════════════════════════════════════════════════════════════════
//  کلادفلرِ جعلی — فقط همان چهار مسیری که کد استفاده می‌کند
// ═══════════════════════════════════════════════════════════════════════════
function startFakeCloudflare(opts = {}) {
  const state = {
    zoneStatus: opts.zoneStatus || 'active',
    records: opts.records || [
      { id: 'rec-api', name: 'api.ghelghelishop.ir', type: 'A', content: '5.102.37.87', proxied: false },
      { id: 'rec-web', name: 'ghelghelishop.ir', type: 'A', content: '5.102.37.87', proxied: false },
      { id: 'rec-admin', name: 'admin.ghelghelishop.ir', type: 'A', content: '5.102.37.87', proxied: false },
      // رکوردهای .com هم مثل واقعیتِ DNS حاضرند (مالک alias ساختها)
      { id: 'rec-com-api', name: 'api.ghelghelishop.com', type: 'A', content: '5.102.37.87', proxied: false },
      { id: 'rec-com-web', name: 'ghelghelishop.com', type: 'A', content: '5.102.37.87', proxied: false },
      { id: 'rec-com-admin', name: 'admin.ghelghelishop.com', type: 'A', content: '5.102.37.87', proxied: false },
      { id: 'rec-com-user', name: 'user.ghelghelishop.com', type: 'A', content: '5.102.37.87', proxied: false },
    ],
    securityLevel: 'medium',
    calls: [],
    token: opts.token || 'cf-token-for-test-1234567890abcdefghij',
  };
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    const send = (obj, code = 200) => {
      res.writeHead(code, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(obj));
    };
    const auth = String(req.headers.authorization || '');
    state.calls.push(`${req.method} ${url.pathname}`);
    if (auth !== `Bearer ${state.token}`) {
      return send({ success: false, errors: [{ message: 'Invalid API Token (401)' }] }, 403);
    }
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      const parsed = body ? JSON.parse(body) : {};
      if (req.method === 'GET' && url.pathname.endsWith('/zones')) {
        const name = url.searchParams.get('name');
        const hit = name === 'ghelghelishop.ir' || name === 'ghelghelishop.com';
        return send({ success: true, result: hit ? [{ id: 'zone-' + (name.endsWith('.com') ? '2' : '1'), name, status: state.zoneStatus }] : [] });
      }
      if (req.method === 'GET' && url.pathname.endsWith('/dns_records')) {
        return send({ success: true, result: state.records });
      }
      if (req.method === 'PATCH' && url.pathname.includes('/dns_records/')) {
        const id = url.pathname.split('/').pop();
        const rec = state.records.find(r => r.id === id);
        if (!rec) return send({ success: false, errors: [{ message: 'record not found' }] }, 404);
        if (typeof parsed.proxied === 'boolean') rec.proxied = parsed.proxied;
        return send({ success: true, result: rec });
      }
      if (req.method === 'PATCH' && url.pathname.includes('/settings/security_level')) {
        state.securityLevel = parsed.value;
        return send({ success: true, result: { id: 'security_level', value: parsed.value } });
      }
      return send({ success: false, errors: [{ message: 'not found' }] }, 404);
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, state, base: `http://127.0.0.1:${server.address().port}/client/v4` }));
  });
}

/** سرویسی که «fieldCrypto» را شبیه‌سازی می‌کند — چیزی که در دیتابیس می‌نشیند. */
function makeGuard({ base, tmp, store, fetchImpl }) {
  const crypto = {
    encrypt: (v) => `enc:v1:${Buffer.from(String(v)).toString('base64')}`,
    decrypt: (v) => String(v || '').startsWith('enc:v1:')
      ? Buffer.from(String(v).slice(7), 'base64').toString('utf8')
      : null,
  };
  const mem = store || (() => {
    const map = new Map();
    return {
      get: async (k) => (map.has(k) ? map.get(k) : null),
      set: async (k, v) => { map.set(k, v); },
      _map: map,
    };
  })();
  return {
    guard: createCloudflareGuard({
      store: mem,
      crypto,
      fetchImpl,
      apiBase: base,
      modeFile: path.join(tmp, 'cloudflare-mode'),
      appliedFile: path.join(tmp, 'cloudflare-mode.applied'),
      logger: { info() {}, warn() {} },
    }),
    store: mem,
  };
}

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cfguard-'));
  const { server, state, base } = await startFakeCloudflare();

  console.log('\n══ ۱) پیش‌فرض‌ها: آماده، ولی خاموش و بی‌اثر ══');
  {
    const { guard, store } = makeGuard({ base, tmp });
    const s = await guard.load();
    ok('پیش‌فرض خاموش است', s.enabled === false);
    ok('حالتِ «تحت حمله» پیش‌فرض خاموش است', s.underAttack === false);
    ok('فهرستِ دامنه‌ها پیش‌فرض پر است (اپ، وب، ادمین، ثبت‌نام)', s.domains.length >= 4 && s.domains.includes('api.ghelghelishop.ir'));
    ok('هیچ رکوردی در کلادفلر دست‌کاری نشده', state.records.every(r => r.proxied === false));
    ok('هیچ فایلی برای نگهبانِ سرور نوشته نشده',
      !fs.existsSync(path.join(tmp, 'cloudflare-mode')));
    ok('وضعیتِ عمومی توکن را لو نمی‌دهد',
      !JSON.stringify(guard.publicState(s)).includes('enc:') && guard.publicState(s).tokenSet === false);
    ok('هیچ نوشتنی در دیتابیس انجام نشده', store._map.size === 0);
  }

  console.log('\n══ ۲) اعتبارسنجیِ دامنه‌ها (اشتباهِ گران‌قیمت اینجاست) ══');
  {
    const { guard } = makeGuard({ base, tmp });
    const good = guard._normalizeDomains(['  API.GhelGhelishop.IR ', 'ghelghelishop.ir', 'ghelghelishop.ir']);
    ok('حروفِ بزرگ و فاصله اصلاح، و تکراری‌ها حذف می‌شوند',
      good.length === 2 && good[0] === 'api.ghelghelishop.ir', JSON.stringify(good));
    for (const bad of ['https://api.example.com', 'api.example.com/path', 'bad_domain', 'x', '']) {
      let threw = false;
      try { guard._normalizeDomains([bad]); } catch { threw = true; }
      ok(`دامنهٔ نامعتبر رد می‌شود: ${bad || '(خالی)'}`, threw);
    }
    let threw = false;
    try { guard._normalizeDomains(Array.from({ length: 20 }, (_, i) => `a${i}.example.com`)); } catch { threw = true; }
    ok('فهرستِ بی‌نهایت بلند رد می‌شود', threw);
  }

  console.log('\n══ ۳) ذخیرهٔ تنظیمات: توکن رمز می‌شود، تأییدِ قبلی می‌پرد ══');
  {
    const { guard, store } = makeGuard({ base, tmp });
    const out = await guard.saveConfig({ apiToken: 'cf-token-for-test-1234567890abcdefghij' }, 7);
    const raw = store._map.get('cloudflare_guard');
    ok('توکنِ ذخیره‌شده در دیتابیس رمزنگاری‌شده است',
      String(raw.apiTokenEnc).startsWith('enc:v1:') && !JSON.stringify(raw).includes('cf-token-for-test'));
    ok('پاسخِ ذخیره توکن را نشان نمی‌دهد', out.tokenSet === true && !JSON.stringify(out).includes('cf-token'));
    let short = false;
    try { await guard.saveConfig({ apiToken: 'kootah' }); } catch { short = true; }
    ok('توکنِ بی‌معنی (کوتاه) رد می‌شود', short);

    await guard.verify(7);
    const before = await guard.load();
    ok('بعد از تأییدِ موفق، وضعیت ثبت شده', !!before.verified && before.verified.domains.length === 3);
    await guard.saveConfig({ domains: ['ghelghelishop.com'] }, 7);
    const after = await guard.load();
    ok('عوض‌کردنِ دامنه‌ها، تأییدِ قبلی را باطل می‌کند (انتقال به دامنهٔ نو)', after.verified === null);
    ok('دامنهٔ نو جای قبلی را گرفته', after.domains[0] === 'ghelghelishop.com');
  }

  console.log('\n══ ۴) «بررسی و تأیید دامنه‌ها» با کلادفلرِ جعلی ══');
  {
    const { guard } = makeGuard({ base, tmp });
    let noTok = false;
    try { await guard.verify(); } catch (e) { noTok = e.code === 'no_token'; }
    ok('بدونِ توکن، پیامِ روشن می‌دهد (نه خطای مبهم)', noTok);

    await guard.saveConfig({ apiToken: 'cf-token-for-test-1234567890abcdefghij' }, 7);
    const rep = await guard.verify(7);
    ok('ناحیه پیدا شد و فهرستِ رکوردها خوانده شد', rep.zone === 'ghelghelishop.ir' && rep.verified === 7);
    ok('دامنهٔ بی‌رکورد گزارش می‌شود', rep.missing.length === 2, JSON.stringify(rep.missing));
    ok('حالتِ فعلیِ رکوردها (خاکستری) گزارش می‌شود', rep.domains.every(d => d.proxied === false));
  }

  console.log('\n══ ۵) ناحیهٔ هنوز-فعال‌نشده: تأیید باید رد شود ══');
  {
    const fake = await startFakeCloudflare({ zoneStatus: 'pending' });
    const { guard } = makeGuard({ base: fake.base, tmp: fs.mkdtempSync(path.join(os.tmpdir(), 'cfg2-')) });
    await guard.saveConfig({ apiToken: 'cf-token-for-test-1234567890abcdefghij' }, 7);
    let e = null;
    try { await guard.verify(7); } catch (err) { e = err; }
    ok('تأیید در حالتِ pending رد می‌شود', !!e && e.code === 'zone_pending');
    ok('پیام اشاره می‌کند که باید نیم‌سرور در ایرنیک عوض شود', /نیم‌سرور/.test(e?.message || ''));
    fake.server.close();
  }

  console.log('\n══ ۶) روشن‌کردن: تأییدِ اجباری، سپس اثرِ واقعی ══');
  {
    const { guard } = makeGuard({ base, tmp });
    await guard.saveConfig({ apiToken: 'cf-token-for-test-1234567890abcdefghij' }, 7);
    let needVerify = null;
    try { await guard.enable({ confirm: 'تأیید' }, 7); } catch (e) { needVerify = e; }
    ok('بدونِ تأییدِ دامنه‌ها، روشن‌کردن ممکن نیست', needVerify?.code === 'not_verified');

    await guard.verify(7);
    let needConfirm = null;
    try { await guard.enable({ confirm: 'بله' }, 7); } catch (e) { needConfirm = e; }
    ok('بدونِ کلمهٔ «تأیید»، روشن‌کردن ممکن نیست', needConfirm?.code === 'need_confirm');
    ok('و تا آن لحظه هیچ رکوردی نارنجی نشده', state.records.every(r => r.proxied === false));

    const out = await guard.enable({ confirm: 'تأیید', underAttack: true }, 7);
    ok('رکوردهای تأییدشده نارنجی شدند', state.records.every(r => r.proxied === true));
    ok('حالتِ «تحت حمله» در کلادفلر روشن شد', state.securityLevel === 'under_attack');
    ok('وضعیت در پاسخ روشن است', out.enabled === true && out.underAttack === true);
    ok('فایلِ حالتِ سمتِ سرور نوشته شد («on»)',
      fs.readFileSync(path.join(tmp, 'cloudflare-mode'), 'utf8').trim() === 'on');
    ok('پاسخ توضیح می‌دهد که سمتِ سرور خودکار اعمال می‌شود', /۳۰ ثانیه/.test(out.serverNote || ''));
  }

  console.log('\n══ ۷) خاموش‌کردن: مسیرِ بازگشتِ اضطراری ══');
  {
    const { guard } = makeGuard({ base, tmp });
    await guard.saveConfig({ apiToken: 'cf-token-for-test-1234567890abcdefghij' }, 7);
    await guard.verify(7);
    await guard.enable({ confirm: 'تأیید', underAttack: true }, 7);
    const out = await guard.disable(7);
    ok('رکوردها خاکستری شدند (ترافیک مستقیم به سرور)', state.records.every(r => r.proxied === false));
    ok('حالتِ حمله برداشته شد', state.securityLevel === 'medium');
    ok('فایلِ حالتِ سرور «off» شد', fs.readFileSync(path.join(tmp, 'cloudflare-mode'), 'utf8').trim() === 'off');
    ok('وضعیت خاموش گزارش می‌شود', out.enabled === false && out.underAttack === false);
  }

  console.log('\n══ ۸) خطاهای خارجی، پیامِ انسانی می‌گیرند (نه ۵۰۰ِ خام) ══');
  {
    // توکنِ اشتباه ⇒ کلادفلر ۴۰۳ می‌دهد
    const { guard } = makeGuard({ base, tmp });
    await guard.saveConfig({ apiToken: 'cf-token-WRONG-1234567890abcdefghij' }, 7);
    let e = null;
    try { await guard.verify(7); } catch (err) { e = err; }
    ok('توکنِ اشتباه، پیامِ «کلادفلر رد کرد» می‌دهد', e?.code === 'cf_error' && /رد کرد/.test(e.message));

    // سرورِ خاموشِ جعلی ⇒ خطای شبکه
    const { guard: g2 } = makeGuard({ base: 'http://127.0.0.1:1/client/v4', tmp: fs.mkdtempSync(path.join(os.tmpdir(), 'cfg3-')) });
    await g2.saveConfig({ apiToken: 'cf-token-for-test-1234567890abcdefghij' }, 7);
    let n = null;
    try { await g2.verify(7); } catch (err) { n = err; }
    ok('قطعِ ارتباط، پیامِ «ارتباط برقرار نشد» می‌دهد', n?.code === 'network');
  }

  console.log('\n══ ۹) سیم‌کشیِ امنیتی در کدِ واقعی ══');
  {
    const serverSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'server.js'), 'utf8');
    const routeSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'routes', 'adminCloudflare.js'), 'utf8');
    const pageSrc = fs.readFileSync(path.join(__dirname, '..', '..', 'admin', 'src', 'pages', 'cloudflare.jsx'), 'utf8');

    ok('مسیرها به adminAuth وصل‌اند', /app\.use\('\/api', require\('\.\/routes\/adminCloudflare'\)/.test(serverSrc));
    const guardedRoutes = routeSrc.match(/router\.(?:get|put|post)\([^\n]*adminAuth, requireRole\(\)[^\n]*/g) || [];
    ok('هر پنج مسیر همزمان adminAuth و requireRole دارند', guardedRoutes.length === 5, `${guardedRoutes.length} از ۵`);
    ok('requireRole بدونِ آرگومان یعنی فقط super_admin (نقشِ پشتیبان کافی نیست)',
      !/requireRole\(['"]/.test(routeSrc));
    ok('هر کنش در کارنامهٔ ممیزی ثبت می‌شود', (routeSrc.match(/await audit\(/g) || []).length === 4);
    ok('سرویس با fieldCrypto ساخته می‌شود (توکن رمزنگاری‌شده)',
      /createCloudflareGuard\(\{[\s\S]{0,200}crypto: fieldCrypto/.test(serverSrc));
    ok('کلیدِ تنظیمات در preload هست (بعد از ری‌استارت گم نشود)', /'cloudflare_guard',/.test(serverSrc));
    ok('تنظیمات از opsConfig می‌آید (نه فایلِ جدا)',
      /createCloudflareGuard\(\{[\s\S]{0,200}store: opsConfig/.test(serverSrc));
    ok('صفحهٔ پنل وجود دارد و دکمهٔ تأییدِ متنی می‌خواهد', /تأیید/.test(pageSrc) && /confirm/i.test(pageSrc));
    ok('صفحهٔ پنل می‌گوید تا روشن‌نشدن، هیچ تغییر نمی‌کند',
      /خاموش/.test(pageSrc) && /مستقیم/.test(pageSrc));

    // ── سمتِ سرور: نگهبانِ root و اسنیپتِ آی‌پیِ واقعی ────────────────────
    const applySrc = fs.readFileSync(path.join(__dirname, '..', '..', 'scripts', 'cloudflare-mode-apply.sh'), 'utf8');
    const installer = fs.readFileSync(path.join(__dirname, '..', '..', 'scripts', 'install-cloudflare-mode.sh'), 'utf8');
    ok('نگهبانِ سرور، آی‌پیِ واقعی را از هدرِ کلادفلر می‌خواند',
      /real_ip_header CF-Connecting-IP;/.test(applySrc));
    ok('فقط به محدوده‌های خودِ کلادفلر اعتماد می‌کند (هدرِ دروغ کار نمی‌کند)',
      /set_real_ip_from/.test(applySrc) && /ips-v4/.test(applySrc));
    ok('پیش از هر reload، کانفیگ آزمایش و در صورتِ خطا پشتیبان برمی‌گردد',
      /nginx -t >\/dev\/null 2>&1 && systemctl reload nginx/.test(applySrc) && /cp -p "\$backup" "\$SITE"/.test(applySrc));
    ok('بدونِ درخواستِ پنل، نگهبان هیچ کاری نمی‌کند (پیش‌فرض: دست‌نخورده)',
      /\[ "\$WANT" = "\$HAVE" \]/.test(applySrc));
    ok('پوشهٔ حالت فقط برای کاربرِ برنامه قابلِ نوشتن است (0750)',
      /install -d -m 0750 -o "\$APP_USER"/.test(installer));
    // رگرسیونِ واقعی: نسخهٔ اول مقدار و زمان را در یک خط می‌نوشت، مقایسه
    // هرگز برابر نمی‌شد و نگهبان هر ۳۰ ثانیه nginx را reload می‌کرد.
    ok('فایلِ «اعمال‌شده» مقدار را در خطِ اولِ جدا می‌نویسد',
      /write_applied\(\) \{ printf '%s\\n%s\\n' "\$1"/.test(applySrc));
  }

  console.log('\n══ ۱۰) آزمایشِ رفتاریِ نگهبانِ سرور (با nginx و systemctl قلابی) ══');
  {
    const repo = path.join(__dirname, '..', '..');
    const sand = fs.mkdtempSync(path.join(os.tmpdir(), 'cfmode-'));
    const bin = path.join(sand, 'bin');
    fs.mkdirSync(bin);
    const stub = (name, body) => {
      const p = path.join(bin, name);
      fs.writeFileSync(p, `#!/bin/bash\n${body}\n`);
      fs.chmodSync(p, 0o755);
    };
    // nginx قلابی: اگر پرچمِ خرابی باشد، تست را رد می‌کند (برای سنجشِ برگشت).
    stub('nginx', '[ -f "$NGINX_FAIL" ] && { echo "emerg: host not found in set_real_ip_from"; exit 1; }; exit 0');
    stub('systemctl', 'exit 0');
    // ⚠️ عمداً «بدونِ خطِ جدیدِ پایانی» — همان چیزی که روی سرورِ تولید
    //    آخرین آی‌پیِ v4 را به اولین آی‌پیِ v6 چسباند و nginx را رد کرد.
    stub('curl', 'case "$*" in *ips-v6*) printf "2400:cb00::/32";; *) printf "173.245.48.0/20\\n104.16.0.0/13";; esac');
    const site = path.join(sand, 'site.conf');
    fs.writeFileSync(site, 'server {\n    listen 80;\n    include /etc/nginx/snippets/ghelgheli-upstream.conf;\n}\n');
    const stateDir = path.join(sand, 'state');
    fs.mkdirSync(stateDir);
    const snippetDir = path.join(sand, 'snippets');
    fs.mkdirSync(snippetDir);
    const appliedFile = path.join(stateDir, 'cloudflare-mode.applied');
    const logFile = path.join(sand, 'log');

    const apply = (args = []) => execFileSync('bash', [
      path.join(repo, 'scripts', 'cloudflare-mode-apply.sh'), ...args,
    ], {
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        APP_DIR: repo,
        STATE_DIR: stateDir,
        SNIPPET_DIR: snippetDir,
        NGINX_SITE: site,
        BACKUP_DIR: path.join(sand, 'backups'),
        LOG: logFile,
        NGINX_FAIL: path.join(sand, 'fail'),
      },
      encoding: 'utf8',
      stdio: 'pipe',
    });

    const siteText = () => fs.readFileSync(site, 'utf8');
    const snippet = path.join(snippetDir, 'ghelgheli-cloudflare-realip.conf');
    ok('بی‌درخواستِ پنل، کانفیگِ nginx عوض نمی‌شود', !siteText().includes('cloudflare-realip'));
    apply();
    ok('بی‌درخواست، لاگ هم چیزی اضافه نمی‌کند', !fs.existsSync(logFile) || fs.readFileSync(logFile, 'utf8').trim() === '');

    fs.writeFileSync(path.join(stateDir, 'cloudflare-mode'), 'on\n');
    apply();
    ok('با درخواستِ «on»، خطِ include به کانفیگِ سایت می‌آید', siteText().includes('include /etc/nginx/snippets/ghelgheli-cloudflare-realip.conf;'));
    ok('اسنیپت با محدوده‌های کلادفلر و هدرِ CF-Connecting-IP ساخته می‌شود',
      fs.readFileSync(snippet, 'utf8').includes('set_real_ip_from 173.245.48.0/20;') &&
      fs.readFileSync(snippet, 'utf8').includes('real_ip_header CF-Connecting-IP;'));
    ok('وضعیتِ اعمال‌شده ثبت می‌شود', fs.readFileSync(appliedFile, 'utf8').split('\n')[0].trim() === 'on');
    // رگرسیونِ تولید: بدونِ خطِ جدیدِ جداکننده، دو فهرستِ آی‌پی به هم می‌چسبند
    // («131.0.72.0/222400:cb00::/32») و nginx کلِ کانفیگ را رد می‌کند.
    const snippetLines = fs.readFileSync(snippet, 'utf8')
      .split('\n').filter(l => l.startsWith('set_real_ip_from'));
    ok('هر خطِ آی‌پی شکلِ درستِ CIDR دارد (فهرست‌های v4 و v6 به هم نمی‌چسبند)',
      snippetLines.length === 3 && snippetLines.every(l =>
        /^set_real_ip_from (([0-9]{1,3}\.){3}[0-9]{1,3}\/[0-9]{1,2}|[0-9a-fA-F:]{2,45}\/[0-9]{1,3});$/.test(l)),
      JSON.stringify(snippetLines));
    ok('هم محدودهٔ IPv4 و هم IPv6 در اسنیپت هست (کلاینتِ موبایل IPv6 دارد)',
      snippetLines.some(l => l.includes('173.245.48.0/20')) && snippetLines.some(l => l.includes('2400:cb00::/32')));

    const after1 = fs.readFileSync(site, 'utf8');
    const logLen = fs.readFileSync(logFile, 'utf8').split('\n').length;
    apply();
    ok('وقتی وضعیت همان است، هیچ کاری نمی‌کند (نه reloadِ بی‌دلیل)',
      fs.readFileSync(site, 'utf8') === after1 && fs.readFileSync(logFile, 'utf8').split('\n').length === logLen);

    // nginx تست را رد می‌کند ⇒ باید به پشتیبان برگردد و خطِ include نماند.
    fs.writeFileSync(path.join(sand, 'fail'), '');
    fs.writeFileSync(path.join(stateDir, 'cloudflare-mode'), 'off\n');
    let rolledBack = false;
    try { apply(); } catch { rolledBack = true; }
    ok('اگر کانفیگِ نو رد شود، نگهبان با خطا برمی‌گردد (خودنمایی نمی‌کند)', rolledBack);
    ok('و کانفیگ به وضعیتِ قبلی برمی‌گردد (سایت سالم می‌ماند)', siteText() === after1);
    ok('علتِ رد شدنِ کانفیگ در لاگ ثبت می‌شود (وگرنه عیب‌یابی کورکورانه است)',
      fs.readFileSync(logFile, 'utf8').includes('host not found in set_real_ip_from'));
    fs.rmSync(path.join(sand, 'fail'));

    apply();
    ok('خاموش‌کردن، خطِ include را برمی‌دارد (کامنتش هم پاک می‌شود)',
      !siteText().includes('cloudflare-realip') && !siteText().includes('کلادفلر: خواندنِ آی‌پیِ واقعی'));
    ok('و سطرهای دیگرِ کانفیگ دست‌نخورده می‌مانند', siteText().includes('ghelgheli-upstream.conf') && siteText().includes('listen 80;'));
    fs.rmSync(sand, { recursive: true, force: true });
  }

  server.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`\n${fail === 0 ? '✓' : '✗'} ${pass} تست موفق، ${fail} ناموفق\n`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
