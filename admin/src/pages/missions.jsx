import { useEffect, useMemo, useState } from 'react';
import { Target, Plus, Save, Trash2 } from 'lucide-react';
import { fmtNumber } from '../lib/api.js';
import { Badge, Button, Card, EmptyState, Field, Input, Select, Table } from '../components/ui.jsx';
import { useToast } from '../lib/toast.jsx';

/**
 * مدیریت ماموریت‌های روزانه/هفتگی.
 *
 * پول ماموریت‌ها و جایزهٔ تکمیل روزانه تا امروز در کد هاردکد بود؛
 * حالا هر ماموریتِ توکار قابل بازنویسی است (جایزه/هدف/خاموش) و
 * ماموریت سفارشی هم می‌توان ساخت.
 */
export function MissionsPage({ request }) {
  const notify = useToast();
  const [data, setData] = useState(null);
  const [bonus, setBonus] = useState(null);
  const [edits, setEdits] = useState({}); // key -> override fields
  const [newMission, setNewMission] = useState(null);
  const [mScale, setMScale] = useState(1);
  const [mScope, setMScope] = useState('all'); // builtin|custom|all
  const [mScaleBusy, setMScaleBusy] = useState(false);
  const [scaleDailyBonus, setScaleDailyBonus] = useState(true);

  const load = () => {
    request('/api/admin/missions')
      .then((d) => {
        setData(d);
        setBonus(d.config.dailyBonus);
      })
      .catch((e) => notify(e.message || 'خواندن ماموریت‌ها ناموفق بود', 'error'));
  };
  useEffect(load, [request]);

  const builtin = useMemo(() => data?.builtin || [], [data]);

  function edit(key, field, value) {
    setEdits((m) => ({ ...m, [key]: { ...(m[key] || {}), [field]: value } }));
  }

  async function saveOverride(key) {
    const body = edits[key] || {};
    try {
      const r = await request(`/api/admin/missions/builtin/${key}`, { method: 'PATCH', body });
      notify(r.message, 'success');
      setEdits((m) => { const n = { ...m }; delete n[key]; return n; });
      load();
    } catch (err) {
      notify(err.message || 'ذخیره ناموفق بود', 'error');
    }
  }

  async function saveBonus() {
    try {
      const r = await request('/api/admin/missions/config', {
        method: 'PATCH', body: { dailyBonus: Number(bonus) },
      });
      notify(r.message, 'success');
      load();
    } catch (err) {
      notify(err.message || 'ناموفق', 'error');
    }
  }

  async function createMission(e) {
    e.preventDefault();
    const form = e.target;
    try {
      const r = await request('/api/admin/missions', {
        method: 'POST',
        body: {
          key: form.key.value,
          period: form.period.value,
          event: form.event.value,
          icon: form.icon.value,
          title: form.title.value,
          description: form.description.value,
          goal: Number(form.goal.value),
          reward: Number(form.reward.value),
        },
      });
      notify(r.message, 'success');
      setNewMission(null);
      load();
    } catch (err) {
      notify(err.message || 'ساخت ماموریت ناموفق بود', 'error');
    }
  }

  async function removeCustom(key) {
    if (!window.confirm('ماموریت سفارشی حذف شود؟')) return;
    try {
      const r = await request(`/api/admin/missions/${key}`, { method: 'DELETE' });
      notify(r.message, 'success');
      load();
    } catch (err) {
      notify(err.message || 'ناموفق', 'error');
    }
  }


  const missionPreview = useMemo(() => {
    if (!data) return null;
    let before = 0, after = 0, count = 0;
    const take = (list) => {
      for (const m of list || []) {
        const a = Number(m.reward) || 0;
        before += a;
        after += Math.max(0, Math.round(a * mScale));
        count += 1;
      }
    };
    if (mScope === 'builtin' || mScope === 'all') take(data.builtin);
    if (mScope === 'custom' || mScope === 'all') take(data.customs);
    if (scaleDailyBonus && (mScope === 'builtin' || mScope === 'all')) {
      const b = Number(bonus) || 0;
      before += b;
      after += Math.max(0, Math.round(b * mScale));
      count += 1;
    }
    return { before, after, count };
  }, [data, mScale, mScope, scaleDailyBonus, bonus]);

  async function applyMissionScale() {
    if (Math.abs(mScale - 1) < 0.001) {
      notify('ضریب ۱ یعنی بدون تغییر — نوار را جابه‌جا کنید', 'error');
      return;
    }
    const scopeLabel = mScope === 'builtin' ? 'توکار' : mScope === 'custom' ? 'سفارشی' : 'همه';
    if (!window.confirm(`جایزهٔ امتیاز ماموریت‌های ${scopeLabel} × ${mScale.toFixed(2)} شود؟`)) return;
    setMScaleBusy(true);
    try {
      const r = await request('/api/admin/missions/scale-rewards', {
        method: 'POST',
        body: { factor: mScale, scope: mScope, scaleDailyBonus },
      });
      notify(r.message || 'اعمال شد', 'success');
      setMScale(1);
      setEdits({});
      load();
    } catch (err) {
      notify(err.message || 'مقیاس‌دهی ناموفق بود', 'error');
    } finally {
      setMScaleBusy(false);
    }
  }

  if (!data) return <p>در حال خواندن…</p>;

  return (
    <div className="page-stack">

      <Card title="مقیاس‌دهی یک‌جای جوایز ماموریت"
        subtitle="همهٔ جایزه‌های امتیازی را با یک نوار × ضریب کن — هدف (goal) و وضعیت فعال دست‌نخورده می‌مانند">
        <div className="passScaleBar" dir="rtl">
          <div className="passScaleControls">
            <label className="passScaleTrack">
              <span>دامنه</span>
              <select value={mScope} onChange={(e) => setMScope(e.target.value)}>
                <option value="all">توکار + سفارشی</option>
                <option value="builtin">فقط توکار</option>
                <option value="custom">فقط سفارشی</option>
              </select>
            </label>
            <label className="passScaleSlider">
              <span>ضریب: <strong>× {mScale.toFixed(2)}</strong></span>
              <input type="range" min="0" max="3" step="0.05" value={mScale}
                onChange={(e) => setMScale(Number(e.target.value))} />
              <span className="passScaleTicks">
                <i>۰</i><i>۰٫۵</i><i>۱</i><i>۱٫۵</i><i>۲</i><i>۲٫۵</i><i>۳</i>
              </span>
            </label>
            <div className="passScaleQuick">
              {[0.5, 0.75, 1, 1.25, 1.5, 2].map((v) => (
                <button type="button" key={v}
                  className={Math.abs(mScale - v) < 0.001 ? 'on' : ''}
                  onClick={() => setMScale(v)}>×{v}</button>
              ))}
            </div>
          </div>
          <label className="check-row" style={{ margin: 0 }}>
            <input type="checkbox" checked={scaleDailyBonus}
              onChange={(e) => setScaleDailyBonus(e.target.checked)} />
            جایزهٔ تکمیل روزانه هم × ضریب شود
          </label>
          {missionPreview && (
            <div className="passScalePreview">
              <span>{missionPreview.count} مورد</span>
              <span>جمع قبل: <b>{fmtNumber(missionPreview.before)}</b></span>
              <span>جمع بعد: <b>{fmtNumber(missionPreview.after)}</b></span>
              <span className={missionPreview.after >= missionPreview.before ? 'up' : 'down'}>
                {missionPreview.after >= missionPreview.before ? '▲' : '▼'}
                {' '}{fmtNumber(Math.abs(missionPreview.after - missionPreview.before))}
              </span>
            </div>
          )}
          <div className="passScaleActions">
            <Button icon={Save} loading={mScaleBusy}
              disabled={mScaleBusy || Math.abs(mScale - 1) < 0.001}
              onClick={applyMissionScale}>
              اعمال روی جوایز
            </Button>
            <Button variant="ghost" disabled={mScaleBusy || Math.abs(mScale - 1) < 0.001}
              onClick={() => setMScale(1)}>بازنشانی</Button>
          </div>
        </div>
      </Card>

      <Card title="جایزهٔ تکمیل روزانه" subtitle="وقتی همهٔ ماموریت‌های روز را تمام کند می‌گیرد">
        <span className="inline-inputs">
          <Input type="number" min="0" value={bonus} onChange={(e) => setBonus(e.target.value)} />
          <Button icon={Save} onClick={saveBonus}>ذخیره</Button>
        </span>
      </Card>

      <Card title="ماموریت‌های توکار" subtitle="بازنویسی هر ماموریت از چرخش بعدی اعمال می‌شود؛ «خاموش» یعنی از چرخش بیرون برود">
        {builtin.length === 0 ? <EmptyState icon={Target} title="چیزی نیست" message="-" /> : (
          <Table rows={builtin.map((m) => ({ ...m, ...(edits[m.key] || {}) }))} cols={[
            { key: 'title', title: 'عنوان', render: (r) => <><b>{r.title}</b><br /><small className="dim">{r.key}</small></> },
            { key: 'period', title: 'دوره', render: (r) => <Badge tone={r.period === 'daily' ? 'info' : 'neutral'}>{r.period === 'daily' ? 'روزانه' : 'هفتگی'}</Badge> },
            { key: 'goal', title: 'هدف', render: (r) => <Input key={`g-${r.key}-${r.goal}`} type="number" min="1" defaultValue={r.goal} onChange={(e) => edit(r.key, 'goal', e.target.value)} /> },
            { key: 'reward', title: 'جایزه (امتیاز)', render: (r) => <Input key={`rw-${r.key}-${r.reward}`} type="number" min="0" defaultValue={r.reward} onChange={(e) => edit(r.key, 'reward', e.target.value)} /> },
            { key: 'active', title: 'وضعیت', render: (r) => <Select defaultValue={r.active ? 'on' : 'off'} onChange={(e) => edit(r.key, 'active', e.target.value === 'on')}>
              <option value="on">فعال</option><option value="off">خاموش</option>
            </Select> },
            { key: 'actions', title: '', render: (r) => (
              <Button size="sm" variant="ghost" icon={Save} disabled={!edits[r.key]} onClick={() => saveOverride(r.key)}>ذخیره</Button>
            ) },
          ]} />
        )}
      </Card>

      <Card title="ماموریت‌های سفارشی" subtitle="همیشه فعال‌اند و کنار چرخش روزانه/هفتگی نمایش داده می‌شوند"
        action={<Button icon={Plus} onClick={() => setNewMission({})}>ماموریت جدید</Button>}>
        {(data.customs || []).length === 0 ? <p>هنوز ماموریت سفارشی ساخته نشده.</p> : (
          <Table rows={data.customs} cols={[
            { key: 'title', title: 'عنوان', render: (r) => <b>{r.title}</b> },
            { key: 'period', title: 'دوره', render: (r) => <Badge>{r.period === 'daily' ? 'روزانه' : 'هفتگی'}</Badge> },
            { key: 'goal', title: 'هدف' },
            { key: 'reward', title: 'جایزه' },
            { key: 'is_active', title: 'وضعیت', render: (r) => <Badge tone={r.is_active ? 'success' : 'danger'}>{r.is_active ? 'فعال' : 'خاموش'}</Badge> },
            { key: 'actions', title: '', render: (r) => (
              <Button size="sm" variant="ghost" icon={Trash2} onClick={() => removeCustom(r.key)}>حذف</Button>
            ) },
          ]} />
        )}
        {newMission && (
          <form onSubmit={createMission} className="form-grid">
            <Field label="کلید انگلیسی (یکتا)"><Input name="key" required placeholder="daily_hello" /></Field>
            <Field label="دوره"><Select name="period" defaultValue="daily"><option value="daily">روزانه</option><option value="weekly">هفتگی</option></Select></Field>
            <Field label="رویداد"><Select name="event" defaultValue="other">
              {(data.events || []).map((e) => <option key={e} value={e}>{e}</option>)}
            </Select></Field>
            <Field label="آیکون"><Input name="icon" defaultValue="star" /></Field>
            <Field label="عنوان فارسی"><Input name="title" required /></Field>
            <Field label="توضیح"><Input name="description" /></Field>
            <Field label="هدف"><Input name="goal" type="number" min="1" defaultValue="1" /></Field>
            <Field label="جایزه (امتیاز)"><Input name="reward" type="number" min="0" defaultValue="10" /></Field>
            <Button type="submit" icon={Save}>ثبت ماموریت</Button>
            <Button variant="ghost" onClick={() => setNewMission(null)}>انصراف</Button>
          </form>
        )}
      </Card>
    </div>
  );
}
