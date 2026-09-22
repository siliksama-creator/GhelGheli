import { useCallback, useEffect, useState } from 'react';
import { ShieldCheck, ShieldOff, RefreshCw, Save, Globe, AlertTriangle, Trash2 } from 'lucide-react';
import { Badge, Button, Card, Field, Input } from '../components/ui.jsx';
import { useToast } from '../lib/toast.jsx';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * سپرِ سرور (کلادفلر) — آماده، خاموش، و با یک تأیید روشن
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * خواستهٔ مالک (۲۶ شهریور):
 *
 *   «کلادفلر رو تو پنل ادمین تنظیم کن که آدرس‌های سایت رو تایید کردم، بعداً
 *    نیاز شد با یک ثبت و تایید فعالش کنم؛ تا وقتی حمله نشده غیرفعال بمونه.
 *    هم برای اپلیکیشن و هم برای نسخه وب.»
 *
 * ── منطقِ سه‌پله‌ای این صفحه ──────────────────────────────────────────────
 *
 *   ۱. **تنظیم:** توکنِ کلادفلر + فهرستِ دامنه‌ها (قابلِ ویرایش — چون مالک
 *      قصد دارد بعداً به یک دامنهٔ `.com` نقلِ مکان کند و نباید چیزی در کد
 *      هاردکد بماند).
 *   ۲. **تأیید:** دکمهٔ «بررسی و تأیید دامنه‌ها» با API کلادفلر چک می‌کند که
 *      ناحیه فعال است و برای هر دامنه رکوردی وجود دارد. تا این انجام نشود،
 *      دکمهٔ روشن‌کردن کار نمی‌کند — دلیلش ساده است: روشن‌کردنِ سپری که
 *      رکوردهایش وجود ندارند، فقط این توهم را می‌سازد که محافظت فعال است.
 *   ۳. **روشن/خاموش:** با کلمهٔ «تأیید» (دفاع از کلیکِ اشتباهی) و دکمهٔ
 *      جدا برای حالتِ «تحت حمله» — همان موقعیتی که مالک خواسته بود.
 *
 * ── چرا این صفحه همیشه اول می‌گوید «الان چه خبر است» ─────────────────────
 *
 * وضعیتِ واقعی از سه جا می‌آید که ممکن است با هم فرق کنند: تنظیماتِ پنل،
 * سمتِ خودِ کلادفلر، و سمتِ سرور (خواندنِ آی‌پیِ واقعی). یک صفحهٔ وضعیت که
 * این سه را با هم نشان ندهد، در لحظهٔ حادثه گمراه‌کننده است.
 */
export function CloudflarePage({ request }) {
  const notify = useToast();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [st, setSt] = useState(null);
  const [token, setToken] = useState('');
  const [domainsText, setDomainsText] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [underAttack, setUnderAttack] = useState(false);
  const [report, setReport] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await request('/api/admin/cloudflare');
      setSt(r);
      setDomainsText((r.domains || []).join('\n'));
      setUnderAttack(!!r.underAttack);
    } catch (e) {
      notify(e.message || 'خطا در خواندن وضعیت', 'error');
    } finally { setLoading(false); }
  }, [request, notify]);

  useEffect(() => { load(); }, [load]);

  const run = async (key, fn) => {
    setBusy(key);
    try { await fn(); } catch (e) { notify(e.message || 'خطا', 'error'); } finally { setBusy(''); }
  };

  const save = () => run('save', async () => {
    const domains = domainsText.split('\n').map((x) => x.trim()).filter(Boolean);
    const body = { domains };
    if (token.trim()) body.apiToken = token.trim();
    const out = await request('/api/admin/cloudflare', 'PUT', body);
    setSt((prev) => ({ ...prev, ...out }));
    setToken('');
    notify('ذخیره شد. حالا دکمهٔ «بررسی و تأیید دامنه‌ها» را بزن.', 'success');
  });

  const verify = () => run('verify', async () => {
    const out = await request('/api/admin/cloudflare/verify', 'POST', {});
    setReport(out);
    setSt((prev) => ({ ...prev, ...out }));
    if (out.missing?.length) notify(`تأیید شد، ولی ${out.missing.length} دامنه رکورد ندارد.`, 'warning');
    else notify('همهٔ دامنه‌ها تأیید شدند.', 'success');
  });

  const enable = () => run('enable', async () => {
    const out = await request('/api/admin/cloudflare/enable', 'POST', { confirm: confirmText, underAttack });
    setSt((prev) => ({ ...prev, ...out }));
    setConfirmText('');
    notify(out.serverNote || 'سپر روشن شد.', 'success');
  });

  const disable = () => run('disable', async () => {
    const out = await request('/api/admin/cloudflare/disable', 'POST', {});
    setSt((prev) => ({ ...prev, ...out }));
    notify('سپر خاموش شد — ترافیک مستقیم به سرور برگشت.', 'success');
  });

  const on = !!st?.enabled;
  const verifiedCount = st?.verified?.domains?.length || 0;
  const serverMode = st?.serverMode || {};

  return (
    <div className="page">
      <div className="page-head">
        <h1 className="page-title"><Globe size={20} /> سپرِ سرور (کلادفلر)</h1>
        <p className="page-sub">
          این صفحه سپرِ ضدِحمله را آماده نگه می‌دارد. تا وقتی خودت روشنش نکنی،
          ترافیک مستقیم و مثلِ امروز به سرور می‌آید و هیچ چیزی عوض نمی‌شود.
        </p>
      </div>

      {/* ═══════════ وضعیتِ یک‌نگاهی ═══════════ */}
      <Card>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
          <Badge tone={on ? 'success' : 'muted'}>
            {loading ? 'در حال خواندن…' : (on ? (st?.underAttack ? 'روشن — حالتِ تحتِ حمله' : 'روشن') : 'خاموش')}
          </Badge>
          <span className="muted">
            سمتِ کلادفلر: {on ? 'ترافیک از کلادفلر می‌گذرد' : 'مستقیم به سرور'}
          </span>
          <span className="muted">
            سمتِ سرور (خواندنِ آی‌پیِ واقعیِ کاربر):{' '}
            {serverMode.applied === 'on' ? 'اعمال شده' : (serverMode.applied === 'off' ? 'اعمال نشده' : 'نامعلوم')}
          </span>
          <Button variant="ghost" onClick={load} disabled={loading}>
            <RefreshCw size={15} /> تازه‌سازی
          </Button>
        </div>
        {on && !serverMode.inSync && (
          <p className="muted" style={{ marginTop: '8px' }}>
            درخواستِ روشن‌بودن ثبت شده و نگهبانِ سرور تا ۳۰ ثانیهٔ دیگر آن را اعمال می‌کند.
          </p>
        )}
        {st?.lastAction?.at && (
          <p className="muted" style={{ marginTop: '6px' }}>
            آخرین کنش: {st.lastAction.action === 'enable' ? 'روشن‌کردن' : st.lastAction.action === 'disable' ? 'خاموش‌کردن' : st.lastAction.action}
            {' — '}{new Date(st.lastAction.at).toLocaleString('fa-IR')}
          </p>
        )}
      </Card>

      {/* ═══════════ پلهٔ ۱: تنظیم ═══════════ */}
      <Card>
        <h2 className="card-title"><Save size={16} /> پلهٔ ۱ — تنظیمات</h2>
        <p className="muted">
          توکنِ کلادفلر را از حسابِ خودت بساز (My Profile ← API Tokens ← Create Token،
          دسترسیِ <code>Zone: DNS: Edit</code> و <code>Zone: Zone Settings: Edit</code>).
          توکن رمزنگاری‌شده ذخیره می‌شود و دیگر هیچ‌وقت به صفحه برنمی‌گردد.
        </p>
        <Field label={`توکنِ کلادفلر ${st?.tokenSet ? '(ذخیره شده — برای تغییر، مقدارِ تازه بگذار)' : ''}`}>
          <Input
            type="password"
            value={token}
            placeholder={st?.tokenSet ? '••••••••••••••••' : 'توکن را این‌جا بچسبان'}
            onChange={(e) => setToken(e.target.value)}
            autoComplete="off"
          />
        </Field>
        <Field
          label="دامنه‌ها (هر خط یکی)"
          hint="برای انتقالِ بعدی به دامنهٔ نو، فقط همین کادر را عوض کن — بعدش دوباره «بررسی و تأیید» لازم است."
        >
          <textarea
            className="input"
            rows={6}
            value={domainsText}
            onChange={(e) => setDomainsText(e.target.value)}
            spellCheck={false}
            style={{ fontFamily: 'monospace', direction: 'ltr', textAlign: 'left' }}
          />
        </Field>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <Button onClick={save} disabled={busy === 'save'}>
            <Save size={15} /> {busy === 'save' ? 'در حال ذخیره…' : 'ذخیره'}
          </Button>
          <Button variant="ghost" onClick={verify} disabled={busy === 'verify'}>
            <ShieldCheck size={15} /> {busy === 'verify' ? 'در حال بررسی…' : 'بررسی و تأیید دامنه‌ها'}
          </Button>
        </div>
        {st?.verified?.at && (
          <p className="muted" style={{ marginTop: '8px' }}>
            آخرین تأیید: {new Date(st.verified.at).toLocaleString('fa-IR')} — ناحیهٔ <b>{st.verified.zone}</b> —{' '}
            {verifiedCount} دامنه.
          </p>
        )}
        {report?.missing?.length > 0 && (
          <p style={{ marginTop: '8px', color: '#F5A524' }}>
            <AlertTriangle size={14} /> این دامنه‌ها در کلادفلر رکورد ندارند: {report.missing.join('، ')}
          </p>
        )}
      </Card>

      {/* ═══════════ پلهٔ ۲: روشن/خاموش ═══════════ */}
      <Card>
        <h2 className="card-title">{on ? <ShieldCheck size={16} /> : <ShieldOff size={16} />} پلهٔ ۲ — روشن / خاموش</h2>
        {!on ? (
          <>
            <p className="muted">
              وقتی روشن کنی، ترافیکِ اپ و وب از کلادفلر می‌گذرد و موجِ حجمی پیش از رسیدن به سرور
              مهار می‌شود. اگر بعداً دامنه عوض شود، اول از پلهٔ ۱ دامنهٔ نو را تأیید کن.
            </p>
            <label className="muted" style={{ display: 'flex', gap: '8px', alignItems: 'center', margin: '10px 0' }}>
              <input type="checkbox" checked={underAttack} onChange={(e) => setUnderAttack(e.target.checked)} />
              حالتِ «تحتِ حمله» هم روشن شود (سخت‌گیرتر، فقط برای وقتی که موج واقعاً شروع شده)
            </label>
            <Field label="برای روشن‌کردن، کلمهٔ «تأیید» را بنویس">
              <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="تأیید" />
            </Field>
            <Button
              onClick={enable}
              disabled={busy === 'enable' || confirmText.trim() !== 'تأیید' || !verifiedCount}
            >
              <ShieldCheck size={15} /> {busy === 'enable' ? 'در حال روشن‌کردن…' : 'روشن‌کردنِ سپر'}
            </Button>
            {!verifiedCount && (
              <p className="muted" style={{ marginTop: '8px' }}>
                تا دامنه‌ها تأیید نشوند این دکمه فعال نمی‌شود.
              </p>
            )}
          </>
        ) : (
          <>
            <p className="muted">
              سپر روشن است. اگر جایی از برنامه کند یا در دسترس نبود، همین دکمه ترافیک را
              به حالتِ مستقیم برمی‌گرداند (چند ثانیه بیشتر طول نمی‌کشد).
            </p>
            <Button variant="danger" onClick={disable} disabled={busy === 'disable'}>
              <ShieldOff size={15} /> {busy === 'disable' ? 'در حال خاموش‌کردن…' : 'خاموش‌کردنِ سپر'}
            </Button>
          </>
        )}
      </Card>

      {/* ═══════════ راهنما ═══════════ */}
      <Card>
        <h2 className="card-title"><AlertTriangle size={16} /> پیش از روشن‌کردن، این سه چیز را بدان</h2>
        <ol className="muted" style={{ paddingInlineStart: '18px', lineHeight: 1.9 }}>
          <li>
            دامنه باید در کلادفلر <b>فعال</b> باشد (نیم‌سرورها در پنلِ ایرنیک به کلادفلر
            تغییر کرده و نشسته باشد). این کار یک‌بار انجام می‌شود و از پنل قابل انجام نیست.
          </li>
          <li>
            با روشن‌شدنِ سپر، سرور باید آی‌پیِ واقعیِ کاربر را از هدرِ کلادفلر بخواند؛
            وگرنه همهٔ کاربران از دیدِ سقفِ ضدِربات یک نفر می‌شوند. این کار خودکار انجام می‌شود
            (نگهبانِ سرور در ۳۰ ثانیه اعمالش می‌کند) و وضعیتش بالای همین صفحه نشان داده می‌شود.
          </li>
          <li>
            اگر روزی مسیرِ کلادفلر برای کاربرانِ داخل ایران کند/مسدود شد، خاموش‌کردن دقیقاً
            همان لحظه ترافیک را به حالتِ عادی برمی‌گرداند — پس این دکمه را در دسترس نگه دار.
          </li>
        </ol>
        <p className="muted">
          <Trash2 size={13} /> خاموش‌کردن، تنظیمات را پاک نمی‌کند؛ فقط سپر را برمی‌دارد.
        </p>
      </Card>
    </div>
  );
}
