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

        <Card title="بازی ضربه‌زن" subtitle="سکهٔ هر لولِ تمام‌شده — راهنمای داخلِ اپ و وب از همین عدد ساخته می‌شود.">
          <Field label="سکهٔ هر لول (راهنمای اپ: «هر لول N سکه می‌دهد»)">
            <Input type="number" min="1" max="1000"
              value={cfg.economy.tapCoinsPerLevel}
              onChange={e => setEcon('tapCoinsPerLevel', Number(e.target.value))} />
          </Field>
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
    </div>
  );
}
