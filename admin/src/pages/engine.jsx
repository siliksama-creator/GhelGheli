import { useEffect, useState } from 'react';
import { SlidersHorizontal, Save, AlertTriangle, ShieldCheck, Store } from 'lucide-react';
import { Button, Card, Field, Input, Textarea } from '../components/ui.jsx';
import { useToast } from '../lib/toast.jsx';

/**
 * اهرم‌های موتور — تنظیماتِ فنی‌ای که قبلاً ثابتِ کد بودند.
 *
 * همه از `app_settings` خوانده می‌شوند و ذخیرهٔ همین‌جا بلافاصله روی
 * کلاینت‌ها اثر می‌گذارد؛ بدون ری‌استارت و بدون آپدیت اپ.
 */
export function EnginePage({ request }) {
  const notify = useToast();
  const [data, setData] = useState(null);
  const [canned, setCanned] = useState('');

  const load = () => {
    request('/api/admin/settings/engine')
      .then((d) => {
        setData(d);
        setCanned((d.cannedMessages || []).join('\n'));
      })
      .catch((e) => notify(e.message || 'خواندن تنظیمات ناموفق بود', 'error'));
  };
  useEffect(load, [request]);

  async function save(path, body) {
    try {
      const r = await request(`/api/admin${path}`, { method: 'PATCH', body });
      notify(r.message || 'ذخیره شد', 'success');
      load();
    } catch (err) {
      notify(err.message || 'ذخیره ناموفق بود', 'error');
    }
  }

  if (!data) return <p>در حال خواندن…</p>;

  return (
    <div className="page-stack">
      <Card title="آستانه‌های موتور تشخیص کارت با عکس"
        subtitle="تعیین می‌کند عکس کارت خودکار تأیید شود، به صف بررسی برود یا رد شود"
        action={<span className="warn-chip"><AlertTriangle size={14} /> با احتیاط — روی پذیرش واقعی کاربران اثر می‌گذارد</span>}>
        <form className="form-grid" onSubmit={(e) => {
          e.preventDefault();
          const f = e.target;
          save('/settings/photo-match', {
            acceptScore: Number(f.accept.value),
            reviewScore: Number(f.review.value),
            boundAcceptScore: Number(f.bound.value),
            freeAcceptScore: Number(f.free.value),
            duplicateSimilarity: Number(f.dup.value),
          });
        }}>
          <Field label="آستانهٔ پذیرش خودکار (بالای این = تأیید)"><Input name="accept" type="number" step="0.01" min="0" max="1" defaultValue={data.photoMatch.acceptScore} /></Field>
          <Field label="آستانهٔ صف بررسی"><Input name="review" type="number" step="0.01" min="0" max="1" defaultValue={data.photoMatch.reviewScore} /></Field>
          <Field label="آستانهٔ کد نام‌دار (عکس فقط اثباتِ داشتن کارت)"><Input name="bound" type="number" step="0.01" min="0" max="1" defaultValue={data.photoMatch.boundAcceptScore} /></Field>
          <Field label="آستانهٔ کد بی‌نام"><Input name="free" type="number" step="0.01" min="0" max="1" defaultValue={data.photoMatch.freeAcceptScore} /></Field>
          <Field label="آستانهٔ طرح تکراری"><Input name="dup" type="number" step="0.01" min="0" max="1" defaultValue={data.photoMatch.duplicateSimilarity} /></Field>
          <Button type="submit" icon={Save}>ذخیره آستانه‌ها</Button>
        </form>
      </Card>

      <Card title="منحنی سطح بازیکن" subtitle="XP لازم برای هر لول از این ضرایب ساخته می‌شود — نوار پیشرفت همه یک‌جا عوض می‌شود">
        <form className="form-grid" onSubmit={(e) => {
          e.preventDefault();
          const f = e.target;
          save('/settings/levels', {
            base: Number(f.base.value), lin: Number(f.lin.value),
            exp: Number(f.exp.value), knee: Number(f.knee.value),
            tail: Number(f.tail.value),
          });
        }}>
          <Field label="پایه (XP لول‌های اول)"><Input name="base" type="number" step="0.1" defaultValue={data.levels.base} /></Field>
          <Field label="شیب خطی"><Input name="lin" type="number" step="0.1" defaultValue={data.levels.lin} /></Field>
          <Field label="توان نمایی (رشد اولیه)"><Input name="exp" type="number" step="0.05" defaultValue={data.levels.exp} /></Field>
          <Field label="زانو (از این لول رشد خطی می‌شود)"><Input name="knee" type="number" min="1" max="99" defaultValue={data.levels.knee} /></Field>
          <Field label="پلهٔ بعد از زانو"><Input name="tail" type="number" step="0.1" defaultValue={data.levels.tail} /></Field>
          <Button type="submit" icon={Save}>ذخیره منحنی</Button>
        </form>
      </Card>

      <Card title="چرخهٔ استریک ورود" subtitle="جایزهٔ هر روز پشت‌سرهم؛ طول چرخه = تعداد اعداد (۲ تا ۳۰)">
        <form className="form-grid" onSubmit={(e) => {
          e.preventDefault();
          const f = e.target;
          const rewards = f.rewards.value.split(/[،,\s]+/).map(Number).filter((n) => Number.isFinite(n));
          if (rewards.length < 2 || rewards.length > 30) {
            notify('چرخه باید بین ۲ تا ۳۰ عدد باشد', 'error');
            return;
          }
          save('/settings/streak', { rewards });
        }}>
          <Field label="جوایز (با فاصله یا ویرگول)"><Input name="rewards" defaultValue={data.streak.rewards.join('، ')} /></Field>
          <Button type="submit" icon={Save}>ذخیره چرخه</Button>
        </form>
      </Card>

      <Card title="پیام‌های آمادهٔ چت" subtitle="هر خط یک پیام؛ کاربران همین‌ها را در روم چت می‌بینند (حداکثر ۶۰ پیام)">
        <Field label="پیام‌ها">
          <Textarea rows={14} value={canned} onChange={(e) => setCanned(e.target.value)} />
        </Field>
        <Button icon={Save} onClick={() => {
          const messages = canned.split('\n').map((x) => x.trim()).filter(Boolean);
          if (!messages.length) return notify('حداقل یک پیام لازم است', 'error');
          save('/chat/canned', { messages });
        }}>ذخیره پیام‌ها</Button>
      </Card>

      <OpsLimitsCard request={request} notify={notify} />
      <BazaarProductsCard request={request} />
    </div>
  );
}

/**
 * سقف‌ها و اعدادِ عملیاتی — آخرین دسته از ثابت‌هایی که از پنل قابل تنظیم
 * شدند: نگهداری چت، قفل عکس‌کارت، اقتصاد معرف، نرخِ پنج مسیر و انیمیشن
 * گردونه. گاردهای امنیتی (OTP و ورود) فقط نمایش داده می‌شوند و عمداً
 * قابل ویرایش نیستند.
 */
function OpsLimitsCard({ request, notify }) {
  const [l, setL] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = () => request('/api/admin/settings/ops-limits')
    .then(setL)
    .catch(() => {});
  useEffect(load, [request]);

  const setNum = (path, value) => setL((prev) => {
    const next = JSON.parse(JSON.stringify(prev));
    const parts = path.split('.');
    let node = next;
    for (let i = 0; i < parts.length - 1; i++) node = node[parts[i]];
    node[parts[parts.length - 1]] = Number(value);
    return next;
  });

  async function save() {
    setSaving(true);
    try {
      const r = await request('/api/admin/settings/ops-limits', {
        method: 'PATCH', body: l,
      });
      notify(r.message || 'ذخیره شد', 'success');
      load();
    } catch (err) {
      notify(err.message || 'ذخیره ناموفق بود', 'error');
    } finally { setSaving(false); }
  }

  if (!l) return <Card title="سقف‌ها و اعدادِ عملیاتی"><p className="topbar-sub">در حال بارگذاری…</p></Card>;

  const rlNames = { chat: 'چت', tapBatch: 'ضربه‌زن', wheel: 'گردونه', cardDuel: 'دوئل کارت', withdrawal: 'برداشت کیف پول' };
  return (
    <Card
      title="سقف‌ها و اعدادِ عملیاتی"
      subtitle="تا امروز ثابتِ کد بودند؛ هر ذخیره بدون ری‌استارت و بدون آپدیت اپ اعمال می‌شود."
      action={<span className="warn-chip"><SlidersHorizontal size={14} /> با احتیاط — روی اقتصاد و سقف‌های سرویس اثر می‌گذارد</span>}
    >
      <div className="card-grid cols-3" style={{ gap: 10 }}>
        <Field label="نگه‌داری پیام چت (عدد)"><Input type="number" min="20" max="1000" value={l.chatKeepLimit} onChange={(e) => setNum('chatKeepLimit', e.target.value)} /></Field>
        <Field label="تلاشِ مجاز عکس‌کارت پیش از قفل"><Input type="number" min="1" max="20" value={l.photoLockMaxFails} onChange={(e) => setNum('photoLockMaxFails', e.target.value)} /></Field>
        <Field label="مدت انیمیشن گردونه (میلی‌ثانیه)"><Input type="number" min="500" max="20000" value={l.wheelSpinMs} onChange={(e) => setNum('wheelSpinMs', e.target.value)} /></Field>
        <Field label="دورِ کامل گردونه"><Input type="number" min="1" max="20" value={l.wheelSpinRotations} onChange={(e) => setNum('wheelSpinRotations', e.target.value)} /></Field>
        <Field label="کمیسیون امتیازی معرف (٪)"><Input type="number" min="0" max="50" value={l.referralCommissionPercent} onChange={(e) => setNum('referralCommissionPercent', e.target.value)} /></Field>
        <Field label="کمیسیون نقدی معرف از خرید (٪)"><Input type="number" min="0" max="50" value={l.referralPurchaseCommissionPercent} onChange={(e) => setNum('referralPurchaseCommissionPercent', e.target.value)} /></Field>
        <Field label="سقف دعوت مؤثر روزانه" hint="بیشتر از این تعداد دعوت در یک روز، چرخشِ اضافه نمی‌دهد."><Input type="number" min="1" max="500" value={l.referralMaxInvitesForDaily} onChange={(e) => setNum('referralMaxInvitesForDaily', e.target.value)} /></Field>
        <Field label="چرخش هدیه به هر دو طرف (هر دعوت)" hint="با هر دعوتِ موفق، هم دعوت‌کننده هم دعوت‌شده این تعداد چرخش می‌گیرند."><Input type="number" min="0" max="50" value={l.referralSpinsPerInvite} onChange={(e) => setNum('referralSpinsPerInvite', e.target.value)} /></Field>
        <Field label="دعوت لازم برای چرخش روزانهٔ اضافه" hint="با رسیدن دعوت‌های روز به این عدد، یک چرخشِ بیشتر در همان روز."><Input type="number" min="1" max="100" value={l.referralInvitesPerDailySpin} onChange={(e) => setNum('referralInvitesPerDailySpin', e.target.value)} /></Field>
        <Field label="چرخش روزانهٔ پایه"><Input type="number" min="0" max="50" value={l.referralBaseDailySpins} onChange={(e) => setNum('referralBaseDailySpins', e.target.value)} /></Field>
        <Field label="آستانهٔ برداشت درآمد معرف (تومان)" hint="حداقل موجودی کیف پول برای درخواست برداشت کمیسیون نقدی معرفی. راهنمای صفحهٔ دعوت از همین عدد ساخته می‌شود."><Input type="number" min="1000" max="50000000" value={l.referralWithdrawalThreshold ?? 50000} onChange={(e) => setNum('referralWithdrawalThreshold', e.target.value)} /></Field>
        <Field label="آدرس درگاه کافه‌بازار"><Input value={l.bazaarApiBase} onChange={(e) => setL((p) => ({ ...p, bazaarApiBase: e.target.value }))} /></Field>
      </div>

      <h4 style={{ margin: '16px 0 8px', fontSize: 13.5 }}>محدودکننده‌های نرخ (پنجره/سقف)</h4>
      <p className="topbar-sub" style={{ margin: '-2px 0 8px' }}>
        عدد اول پنجرهٔ زمانی (میلی‌ثانیه) و عدد دوم سقفِ درخواست در همان
        پنجره است؛ عبور از سقف، درخواست را با خطای «زیادی تلاش کردی» رد می‌کند.
      </p>
      <div style={{ display: 'grid', gap: 6 }}>
        {Object.entries(l.rateLimits || {}).map(([k, v]) => (
          <div key={k} style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <span style={{ minWidth: 110, fontSize: 12.5, fontWeight: 700 }}>{rlNames[k] || k}</span>
            <Input type="number" min="1000" max="3600000" value={v.windowMs}
              onChange={(e) => setNum(`rateLimits.${k}.windowMs`, e.target.value)}
              style={{ width: 140 }} />
            <Input type="number" min="1" max="10000" value={v.limit}
              onChange={(e) => setNum(`rateLimits.${k}.limit`, e.target.value)}
              style={{ width: 110 }} />
          </div>
        ))}
      </div>

      <div style={{ marginTop: 14, padding: '10px 12px', borderRadius: 10, background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)' }}>
        <b style={{ fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 6 }}>
          <ShieldCheck size={14} /> گاردهای امنیتی — فقط نمایش، عمداً غیرقابل ویرایش
        </b>
        <p className="topbar-sub" style={{ marginTop: 4 }}>
          سقفِ OTP و ورودها ضدِ brute-force‌اند؛ شل‌کردنشان از پنل یعنی مهاجم با یک رمز
          همهٔ گاردها را می‌گیرد. اگر تغییری لازم شد، مستقیم روی سرور.
        </p>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 6 }}>
          {Object.entries(l.securityRateLimits || {}).map(([k, v]) => (
            <span key={k} style={{ fontSize: 11.5, color: 'rgba(255,255,255,.6)' }}>
              {k}: <b>{v.limit}</b> در {Math.round(v.windowMs / 60000)} دقیقه
            </span>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 14 }}>
        <Button icon={Save} onClick={save} disabled={saving}>
          {saving ? 'در حال ذخیره…' : 'ذخیرهٔ سقف‌ها'}
        </Button>
      </div>
    </Card>
  );
}

/**
 * نقاط قیمتی کافه‌بازار — فقط‌خواندنی. مدیر باید ببیند کدام قیمت‌ها در
 * کنسول محصول دارند تا قیمت صندوق/پلاس روی عددِ بی‌محصول نماند.
 */
function BazaarProductsCard({ request }) {
  const [cat, setCat] = useState(null);
  const [boxPrice, setBoxPrice] = useState(null);

  const load = () => {
    request('/api/admin/bazaar-products').then(setCat).catch(() => {});
    request('/api/admin/card-box').then((d) => setBoxPrice(Number(d.price || 0))).catch(() => {});
  };
  useEffect(load, [request]);

  if (!cat) return <Card title="نقاط قیمتی کافه‌بازار"><p className="topbar-sub">در حال بارگذاری…</p></Card>;

  const priceSet = new Set((cat.priceProducts || []).map((x) => Number(x.price)));
  const boxOk = boxPrice === null || priceSet.has(boxPrice);
  const fa = (n) => new Intl.NumberFormat('fa-IR').format(Number(n || 0));

  return (
    <Card
      title="نقاط قیمتی کافه‌بازار — فقط خواندنی"
      subtitle="این جدول باید دقیقاً با کنسول کافه‌بازار یکی باشد؛ اگر قیمتی اینجا نباشد، خرید آن آیتم ناممکن است."
      action={<span className="warn-chip"><Store size={14} /> {cat.apiBase}</span>}
    >
      {boxPrice !== null && !boxOk && (
        <p style={{ margin: '0 0 10px', padding: '8px 12px', borderRadius: 10, background: 'rgba(248,113,113,.12)', border: '1px solid rgba(248,113,113,.4)', color: '#FCA5A5', fontSize: 12.5, fontWeight: 700 }}>
          هشدار: قیمت فعلی صندوق کارت ({fa(boxPrice)} تومان) در نقاط قیمتی کافه‌بازار محصول ندارد — خرید صندوق رد می‌شود تا وقتی در کنسول محصولش را بسازی یا قیمت را عوض کنی.
        </p>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {(cat.priceProducts || []).map((x) => (
          <span key={x.price} style={{
            padding: '5px 10px', borderRadius: 8, fontSize: 11.5, fontWeight: 700,
            background: 'rgba(255,209,102,.08)', border: '1px solid rgba(255,209,102,.3)', color: '#FFD166',
          }}>
            {fa(x.price)} → <span dir="ltr">{x.productId}</span>
          </span>
        ))}
      </div>
      <h4 style={{ margin: '14px 0 8px', fontSize: 13 }}>اشتراک پلاس</h4>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {(cat.plusProducts || []).map((x) => (
          <span key={x.plan} style={{
            padding: '5px 10px', borderRadius: 8, fontSize: 11.5, fontWeight: 700,
            background: 'rgba(56,189,248,.08)', border: '1px solid rgba(56,189,248,.3)', color: '#7DD3FC',
          }}>
            {x.label} → <span dir="ltr">{x.productId}</span>
          </span>
        ))}
      </div>
    </Card>
  );
}
