import { useEffect, useState } from 'react';
import { Gamepad2, History, Save } from 'lucide-react';
import { Badge, Button, Card, EmptyState, Field, Input } from '../components/ui.jsx';
import { useToast } from '../lib/toast.jsx';

const OUTCOME = { win: 'برد', loss: 'باخت', draw: 'مساوی' };

/**
 * Points for finished ONLINE matches.
 *
 * Bot games deliberately award nothing — otherwise anyone could farm an
 * unlimited score by replaying the computer.
 */
export function GameRewardsPage({ request }) {
  const notify = useToast();
  const [cfg, setCfg] = useState(null);
  const [results, setResults] = useState([]);
  const [saving, setSaving] = useState(false);

  const load = () => {
    request('/api/admin/settings/games').then(setCfg).catch(() => {});
    request('/api/admin/games/results').then(setResults).catch(() => {});
  };
  useEffect(load, [request]);

  async function save() {
    setSaving(true);
    try {
      const d = await request('/api/admin/settings/games', { method: 'PATCH', body: cfg });
      // Show the server's clamped values, not what was typed.
      setCfg({
        enabled: d.enabled,
        winPoints: d.winPoints,
        losePoints: d.losePoints,
        drawPoints: d.drawPoints,
        dailyCap: d.dailyCap,
      });
      notify(d.message || 'ذخیره شد');
      load();
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  if (!cfg) return <Card title="امتیاز بازی‌ها"><p className="topbar-sub">در حال بارگذاری...</p></Card>;

  const set = (k) => (e) => setCfg({ ...cfg, [k]: e.target.value });

  return (
    <div className="card-grid cols-2">
      <Card
        title="امتیاز بازی‌های آنلاین"
        subtitle="فقط بازی دو نفره واقعی امتیاز می‌گیرد؛ بازی با ربات هیچ امتیازی ندارد"
        action={cfg.enabled ? <Badge tone="success">فعال</Badge> : <Badge>غیرفعال</Badge>}
      >
        <Field label="وضعیت">
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={!!cfg.enabled}
              onChange={(e) => setCfg({ ...cfg, enabled: e.target.checked })}
            />
            <span>امتیازدهی به بازی‌ها فعال باشد</span>
          </label>
        </Field>
        <Field label="امتیاز برنده (۰ تا ۱۰۰۰)">
          <Input type="number" value={cfg.winPoints} onChange={set('winPoints')} />
        </Field>
        <Field label="امتیاز بازنده (منفی، مثلاً ‎-۵)">
          <Input type="number" value={cfg.losePoints} onChange={set('losePoints')} />
        </Field>
        <Field label="امتیاز مساوی">
          <Input type="number" value={cfg.drawPoints} onChange={set('drawPoints')} />
        </Field>
        <Field label="سقف بازی امتیازدار در روز">
          <Input type="number" value={cfg.dailyCap} onChange={set('dailyCap')} />
        </Field>
        <p className="topbar-sub" style={{ marginBottom: 10 }}>
          امتیاز کاربر هرگز زیر صفر نمی‌رود و امتیاز «کسب‌شده کل» با باخت کم نمی‌شود.
        </p>
        <Button icon={Save} loading={saving} onClick={save}>ذخیره تنظیمات</Button>
      </Card>

      <Card title="آخرین نتایج امتیازدار" subtitle="۱۰۰ مورد آخر">
        {results.length === 0 ? (
          <EmptyState icon={History} title="هنوز نتیجه‌ای ثبت نشده" />
        ) : (
          <div style={{ maxHeight: 460, overflowY: 'auto' }}>
            {results.map((r) => (
              <div className="row" key={r.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                <div>
                  <b>{r.nickname || r.mobile}</b>
                  <div className="topbar-sub">
                    {OUTCOME[r.outcome] || r.outcome} · {r.game_id} · حریف: {r.opponent_nickname || '—'}
                  </div>
                </div>
                <b style={{
                  color: r.points_delta > 0 ? '#16a34a' : r.points_delta < 0 ? '#ef4444' : 'inherit',
                  whiteSpace: 'nowrap',
                }}>
                  {r.points_delta > 0 ? `+${r.points_delta}` : r.points_delta}
                </b>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

export const GameRewardsIcon = Gamepad2;
