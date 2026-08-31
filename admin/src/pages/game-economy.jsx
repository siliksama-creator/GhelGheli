import { useEffect, useState } from 'react';
import { Coins, Save } from 'lucide-react';
import { Badge, Button, Card, Field, Input } from '../components/ui.jsx';
import { useToast } from '../lib/toast.jsx';

const GAMES = [
  { id: 'card_duel', label: 'دوئل کارت‌ها' },
  { id: 'penalty', label: 'ضربات پنالتی' },
  { id: 'memory', label: 'جفت‌یاب' },
];
const OUTCOME = { win: 'برد', draw: 'مساوی', loss: 'باخت' };
const STAKES = [100, 1000];

/**
 * اقتصاد بازی‌ها — یک‌جا کنترلِ همهٔ اهرم‌های سکه و امتیاز.
 *
 * خواستهٔ مالک: «کنترل سکه در حالت برد، کسر امتیاز در حالت برد و غیره
 * تمامی این‌ها بشه توسط ادمین مشخص بشه» و «مشخص کنه چند درصد از سکه به
 * لیگ بعدی منتقل شه؛ ممکنه ۰ قرار بده».
 *
 * کلاینت‌ها (وب + اندروید، حتی نسخه‌های قدیمی) اعداد را از `/api/config`
 * می‌خوانند — پس نوشته‌های داخلِ اپ بلافاصله بعد از ذخیره عوض می‌شوند.
 */
export function GameEconomyPage({ request }) {
  const notify = useToast();
  const [cfg, setCfg] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = () => {
    request('/api/admin/settings/game-economy')
      .then(d => setCfg({
        economy: d.economy,
        gamePoints: d.gamePoints,
        economyCustom: d.economyCustom,
      }))
      .catch(() => {});
  };
  useEffect(load, [request]);

  const setEcon = (path, value) => setCfg(prev => {
    const next = JSON.parse(JSON.stringify(prev));
    const parts = path.split('.');
    let node = next.economy;
    for (let i = 0; i < parts.length - 1; i++) node = node[parts[i]];
    node[parts[parts.length - 1]] = value;
    return next;
  });

  const setPoints = (key, value) => setCfg(prev => ({
    ...prev,
    gamePoints: { ...prev.gamePoints, [key]: value },
  }));

  async function save() {
    setSaving(true);
    try {
      const d = await request('/api/admin/settings/game-economy', {
        method: 'PATCH',
        body: { economy: cfg.economy, gamePoints: cfg.gamePoints },
      });
      setCfg({
        economy: d.economy,
        gamePoints: d.gamePoints || cfg.gamePoints,
        economyCustom: d.economyCustom,
      });
      notify(d.message || 'ذخیره شد');
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  if (!cfg) {
    return <Card title="اقتصاد بازی"><p className="topbar-sub">در حال بارگذاری...</p></Card>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Coins size={20} /> اقتصاد بازی‌ها
          </h2>
          <p className="topbar-sub">
            تغییرات این صفحه بلافاصله در نوشته‌های اپ اندروید و وب اعمال می‌شود — بدون نیاز به نسخهٔ جدید.
          </p>
        </div>
        <Button onClick={save} disabled={saving}>
          <Save size={15} /> {saving ? 'در حال ذخیره…' : 'ذخیرهٔ همه'}
        </Button>
      </div>

      <Card
        title="انتقال سکه بین لیگ‌ها"
        subtitle="سکه‌ها بعد از پایان لیگ صفر می‌شوند و درصدِ تعیین‌شده به لیگِ بعدی منتقل می‌شود. صفر یعنی انتقال صفر."
        action={cfg.economyCustom ? <Badge tone="warning">سفارشی</Badge> : <Badge>پیش‌فرض</Badge>}
      >
        <Field label="درصدِ انتقالِ سکه به لیگ بعدی (۰ تا ۱۰۰)">
          <Input
            type="number" min="0" max="100"
            value={cfg.economy.coinCarryoverPercent}
            onChange={e => setEcon('coinCarryoverPercent', Number(e.target.value))}
          />
        </Field>
        <p className="topbar-sub" style={{ marginTop: 8 }}>
          نمونه: کاربری با ۱۰۰۰ سکه و درصدِ ۱۰، با ۱۰۰ سکه لیگِ بعدی را شروع می‌کند.
          با ۰٪ هیچ سکه‌ای منتقل نمی‌شود.
        </p>
      </Card>

      <Card
        title="سکهٔ هر نتیجه در مسابقات"
        subtitle="پاداشِ سه‌حالتهٔ هر بازی در هر سطحِ ورودی — برای همهٔ بازی‌های آنلاینِ امتیازی."
      >
        <div className="card-grid cols-3" style={{ gap: 10 }}>
          {GAMES.map(g => (
            <div key={g.id} style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: 10 }}>
              <b style={{ fontSize: 13 }}>{g.label}</b>
              {STAKES.map(stake => (
                <div key={stake} style={{ marginTop: 8 }}>
                  <small className="topbar-sub">ورودی {stake}</small>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginTop: 4 }}>
                    {Object.keys(OUTCOME).map(outcome => (
                      <label key={outcome} style={{ fontSize: 11 }}>
                        {OUTCOME[outcome]}
                        <Input
                          type="number" min="0" max="10000"
                          value={cfg.economy.coinRewards[g.id][stake][outcome]}
                          onChange={e => setEcon(`coinRewards.${g.id}.${stake}.${outcome}`, Number(e.target.value))}
                          style={{ marginTop: 2 }}
                        />
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </Card>

      <div className="card-grid cols-2">
        <Card title="سهمیهٔ روزانهٔ سکه" subtitle="تعداد مسابقهٔ سکه‌دار در روز — مشترک بین هر سه بازی.">
          <Field label="سهمیهٔ ورودی ۱۰۰ در روز">
            <Input type="number" min="0" max="1000"
              value={cfg.economy.dailyCoinQuota[100]}
              onChange={e => setEcon('dailyCoinQuota.100', Number(e.target.value))} />
          </Field>
          <Field label="سهمیهٔ ورودی ۱۰۰۰ در روز">
            <Input type="number" min="0" max="1000"
              value={cfg.economy.dailyCoinQuota[1000]}
              onChange={e => setEcon('dailyCoinQuota.1000', Number(e.target.value))} />
          </Field>
        </Card>

        <Card
          title="بازی ضربه‌زن — سکه و منحنی"
          subtitle="منحنی (تعداد لول، جمعِ امتیاز، شیب، سقفِ روزانه) و سکهٔ هر لول — همه بدونِ انتشارِ نسخهٔ جدید، همان لحظه در اپ و وب اعمال می‌شود."
        >
          <Field label="سکهٔ هر لول (راهنمای اپ: «هر لول N سکه می‌دهد»)">
            <Input type="number" min="1" max="1000"
              value={cfg.economy.tapCoinsPerLevel}
              onChange={e => setEcon('tapCoinsPerLevel', Number(e.target.value))} />
          </Field>
          <div className="card-grid cols-2" style={{ gap: 8, marginTop: 10 }}>
            <Field label="تعداد لول‌های بازی (۵ تا ۲۰۰)">
              <Input type="number" min="5" max="200"
                value={cfg.economy.tapCurve?.levelCount ?? 50}
                onChange={e => setEcon('tapCurve.levelCount', Number(e.target.value))} />
            </Field>
            <Field label="جمعِ امتیازِ کلِ بازی">
              <Input type="number" min="1000" max="10000000"
                value={cfg.economy.tapCurve?.totalPoints ?? 50000}
                onChange={e => setEcon('tapCurve.totalPoints', Number(e.target.value))} />
            </Field>
            <Field label="شیبِ گران‌شدنِ لول‌ها (۱ تا ۱٫۵)">
              <Input type="number" min="1" max="1.5" step="0.01"
                value={cfg.economy.tapCurve?.growthFactor ?? 1.05}
                onChange={e => setEcon('tapCurve.growthFactor', Number(e.target.value))} />
            </Field>
            <Field label="سقفِ لول در روز (تقویم تهران)">
              <Input type="number" min="0" max="50"
                value={cfg.economy.tapCurve?.levelsPerDay ?? 2}
                onChange={e => setEcon('tapCurve.levelsPerDay', Number(e.target.value))} />
            </Field>
          </div>
          <p className="topbar-sub" style={{ marginTop: 8 }}>
            جمعِ امتیازِ لول‌ها دقیقاً برابرِ عددِ بالا توزیع می‌شود (خطای گرد شدن در
            لول آخر جبران می‌شود). تغییرِ منحنی پیشرفتِ کسی را پاک نمی‌کند؛ اگر
            لولِ آخر را کم کنی، بازیکنانی که از آن گذشته‌اند در حالتِ «بازی
            تمام شد» می‌مانند تا با دکمهٔ ریستِ پایینِ همین صفحه آزادشان کنی.
          </p>
        </Card>
      </div>

      <Card
        title="امتیازِ بازی‌های آنلاین"
        subtitle="امتیازِ مثبت برای برد، منفی برای باخت (کسر) — در صفحهٔ نتیجهٔ هر دو پلتفرم نمایش داده می‌شود."
        action={cfg.gamePoints.enabled ? <Badge tone="success">فعال</Badge> : <Badge>غیرفعال</Badge>}
      >
        <div className="card-grid cols-3" style={{ gap: 10 }}>
          <Field label="وضعیت">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={Boolean(cfg.gamePoints.enabled)}
                onChange={e => setPoints('enabled', e.target.checked)}
              />
              امتیازِ بازی آنلاین فعال باشد
            </label>
          </Field>
          <Field label="امتیازِ برد (مثبت)">
            <Input type="number" min="0" max="1000"
              value={cfg.gamePoints.winPoints}
              onChange={e => setPoints('winPoints', Number(e.target.value))} />
          </Field>
          <Field label="امتیازِ باخت (منفی = کسر)">
            <Input type="number" min="-1000" max="0"
              value={cfg.gamePoints.losePoints}
              onChange={e => setPoints('losePoints', Number(e.target.value))} />
          </Field>
          <Field label="امتیازِ مساوی">
            <Input type="number" min="-1000" max="1000"
              value={cfg.gamePoints.drawPoints}
              onChange={e => setPoints('drawPoints', Number(e.target.value))} />
          </Field>
          <Field label="سقفِ روزانهٔ امتیازِ مثبت">
            <Input type="number" min="0" max="500"
              value={cfg.gamePoints.dailyCap}
              onChange={e => setPoints('dailyCap', Number(e.target.value))} />
          </Field>
        </div>
      </Card>

      <TapManagementCard request={request} notify={notify} />
    </div>
  );
}

/* ═══ آمار و ریستِ بازی ضربه‌زن (دورِ ۳۳) ═══
 * خواستهٔ مالک: «ادمین بتونه کامل بازی ضربه‌زن رو مدیریت کنه و درصورت نیاز
 * رست بده و آمار لولِ آخر شدن کاربرها رو داشته باشه».
 * ریستِ تک‌کاربر پیشرفتش را صفر می‌کند و فقط همان یک نفر دوباره از
 * لول ۱ شروع می‌کند؛ «ریستِ کل» برای شروعِ فصلِ تازه است. */
function TapManagementCard({ request, notify }) {
  const [stats, setStats] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = () => request('/api/admin/tap/stats')
    .then(setStats)
    .catch(() => {});
  useEffect(() => { load(); }, [request]);

  async function resetUser(u) {
    if (!window.confirm(`پیشرفتِ ضربه‌زنِ «${u.nickname}» ریست شود؟ از لول ۱ شروع می‌کند.`)) return;
    setBusy(true);
    try {
      const d = await request('/api/admin/tap/reset', {
        method: 'POST', body: { userId: u.userId },
      });
      notify(d.message || 'ریست شد');
      load();
    } catch (err) { notify(err.message, 'error'); }
    finally { setBusy(false); }
  }

  async function resetAll() {
    if (!window.confirm('بازی ضربه‌زن برای «همهٔ کاربران» ریست شود؟ این عمل برگشت‌پذیر نیست.')) return;
    setBusy(true);
    try {
      const d = await request('/api/admin/tap/reset', {
        method: 'POST', body: { all: true },
      });
      notify(d.message || 'ریست کل انجام شد');
      load();
    } catch (err) { notify(err.message, 'error'); }
    finally { setBusy(false); }
  }

  const fa = n => new Intl.NumberFormat('fa-IR').format(Number(n || 0));
  return (
    <Card
      title="بازی ضربه‌زن — آمار و ریست"
      subtitle="چه کسانی بازی را تمام کرده‌اند، جمعِ امتیاز و سکهٔ توزیع‌شده، و ریستِ تک‌کاربر یا کلِ بازی."
      action={stats?.curve
        ? <Badge tone="info">{fa(stats.curve.levelCount)} لول · {fa(stats.curve.levelsPerDay)} در روز</Badge>
        : null}
    >
      {!stats ? <p className="topbar-sub">در حال بارگذاری…</p> : (
        <>
          <div className="card-grid cols-4" style={{ gap: 8 }}>
            <div style={{ padding: 10, border: '1px solid rgba(255,255,255,.08)', borderRadius: 10 }}>
              <small className="topbar-sub">بازیکنان</small>
              <div style={{ fontSize: 21, fontWeight: 900 }}>{fa(stats.players)}</div>
            </div>
            <div style={{ padding: 10, border: '1px solid rgba(255,209,102,.4)', borderRadius: 10 }}>
              <small className="topbar-sub">بازی را تمام کردند</small>
              <div style={{ fontSize: 21, fontWeight: 900, color: '#FFD166' }}>{fa(stats.finished)}</div>
            </div>
            <div style={{ padding: 10, border: '1px solid rgba(255,255,255,.08)', borderRadius: 10 }}>
              <small className="topbar-sub">روی لولِ آخر</small>
              <div style={{ fontSize: 21, fontWeight: 900 }}>{fa(stats.atFinalLevel)}</div>
            </div>
            <div style={{ padding: 10, border: '1px solid rgba(255,255,255,.08)', borderRadius: 10 }}>
              <small className="topbar-sub">جمعِ سکهٔ داده‌شده</small>
              <div style={{ fontSize: 21, fontWeight: 900, color: '#FFD166' }}>{fa(stats.totalCoinsAwarded)}</div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, flexWrap: 'wrap', gap: 8 }}>
            <b style={{ fontSize: 13.5 }}>
              بازیکنانی که بازی را تمام کرده‌اند {stats.finishedUsers?.length ? `(${fa(stats.finishedUsers.length)})` : ''}
            </b>
            <Button variant="danger" onClick={resetAll} disabled={busy}>
              ریستِ کلِ بازی (فصلِ تازه)
            </Button>
          </div>

          {!stats.finishedUsers?.length ? (
            <p className="topbar-sub" style={{ marginTop: 8 }}>هنوز کسی بازی را تمام نکرده است.</p>
          ) : (
            <div style={{ overflowX: 'auto', marginTop: 8 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                <thead>
                  <tr style={{ textAlign: 'right', color: 'rgba(255,255,255,.55)' }}>
                    <th style={{ padding: '6px 8px' }}>بازیکن</th>
                    <th style={{ padding: '6px 8px' }}>امتیاز</th>
                    <th style={{ padding: '6px 8px' }}>سکه</th>
                    <th style={{ padding: '6px 8px' }}>ضربه‌ها</th>
                    <th style={{ padding: '6px 8px' }}>تاریخِ پایان</th>
                    <th style={{ padding: '6px 8px' }} />
                  </tr>
                </thead>
                <tbody>
                  {stats.finishedUsers.map(u => (
                    <tr key={u.userId} style={{ borderTop: '1px solid rgba(255,255,255,.07)' }}>
                      <td style={{ padding: '7px 8px', fontWeight: 700 }}>{u.nickname}</td>
                      <td style={{ padding: '7px 8px' }}>{fa(u.pointsAwarded)}</td>
                      <td style={{ padding: '7px 8px', color: '#FFD166', fontWeight: 700 }}>{fa(u.coinsAwarded)}</td>
                      <td style={{ padding: '7px 8px' }}>{fa(u.totalTaps)}</td>
                      <td style={{ padding: '7px 8px' }}>
                        {u.finishedAt ? new Date(u.finishedAt).toLocaleDateString('fa-IR') : '—'}
                      </td>
                      <td style={{ padding: '7px 8px' }}>
                        <Button size="sm" variant="secondary" onClick={() => resetUser(u)} disabled={busy}>
                          ریست
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </Card>
  );
}
