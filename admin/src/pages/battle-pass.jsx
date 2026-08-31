import { useEffect, useMemo, useState } from 'react';
import { Layers, Plus, Save, CalendarDays } from 'lucide-react';
import { Badge, Button, Card, EmptyState, Field, Input, Select, Table } from '../components/ui.jsx';
import { useToast } from '../lib/toast.jsx';
import { fmtNumber } from '../lib/api.js';

const KIND_LABEL = { points: 'امتیاز', spins: 'گردونه', cash: 'نقدی', shop_item: 'آیتم فروشگاه' };

/**
 * مدیریت گذر نبرد (بتل‌پس).
 *
 * تا امروز فصل و ۱۰۰ ردیف پاداش فقط با مایگریشن SQL ساخته می‌شد —
 * یعنی هر فصل جدید یک دپلوی بود. حالا: ساخت فصل (با کپی پاداش‌ها)،
 * ویرایش پله‌ها و تنظیم منحنی XP، همه از پنل.
 */
export function BattlePassPage({ request }) {
  const notify = useToast();
  const [seasons, setSeasons] = useState([]);
  const [config, setConfig] = useState(null);
  const [activeId, setActiveId] = useState(null);
  const [seasonDetail, setSeasonDetail] = useState(null); // {season, tiers}
  const [detailBusy, setDetailBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = () => {
    request('/api/admin/pass')
      .then((d) => {
        setSeasons(d.seasons || []);
        setConfig(d.config || null);
        setActiveId(d.activeSeasonId);
        setLoaded(true);
      })
      .catch((e) => notify(e.message || 'خواندن گذر نبرد ناموفق بود', 'error'));
  };
  useEffect(load, [request]);

  async function openSeason(id) {
    setDetailBusy(true);
    try {
      setSeasonDetail(await request(`/api/admin/pass/seasons/${id}`));
    } catch (e) {
      notify(e.message || 'خواندن فصل ناموفق بود', 'error');
    } finally {
      setDetailBusy(false);
    }
  }

  async function createSeason(e) {
    e.preventDefault();
    const form = e.target;
    const body = {
      name: form.name.value,
      startsAt: new Date(form.startsAt.value).toISOString(),
      endsAt: new Date(form.endsAt.value).toISOString(),
      templateSeasonId: form.template.value || null,
    };
    try {
      const r = await request('/api/admin/pass/seasons', { method: 'POST', body });
      notify(r.message, 'success');
      load();
      openSeason(r.season.id);
    } catch (err) {
      notify(err.message || 'ساخت فصل ناموفق بود', 'error');
    }
  }

  async function toggleSeason(season) {
    try {
      const r = await request(`/api/admin/pass/seasons/${season.id}`, {
        method: 'PATCH', body: { isActive: !season.is_active },
      });
      notify(r.message || 'ذخیره شد', 'success');
      load();
    } catch (err) {
      notify(err.message || 'ناموفق', 'error');
    }
  }

  async function saveTier(tier, track, row) {
    if (!row?.id) return;
    try {
      const r = await request(`/api/admin/pass/tiers/${row.id}`, {
        method: 'PATCH',
        body: { kind: row.kind, amount: Number(row.amount), label: row.label, payload: row.payload || null },
      });
      notify(r.message, 'success');
      openSeason(tier.season_id);
    } catch (err) {
      notify(err.message || 'ذخیرهٔ پله ناموفق بود', 'error');
    }
  }

  async function saveConfig(e) {
    e.preventDefault();
    const form = e.target;
    const sources = {};
    for (const [key, def] of Object.entries(config.sources)) {
      sources[key] = {
        xp: Number(form[`s_${key}_xp`].value),
        dailyCap: Number(form[`s_${key}_cap`].value),
        label: def.label,
      };
    }
    const body = {
      xpBase: Number(form.xpBase.value),
      xpStep: Number(form.xpStep.value),
      maxTiersPerDay: Number(form.maxTiers.value),
      claimGraceDays: Number(form.grace.value),
      sources,
    };
    try {
      const r = await request('/api/admin/pass/config', { method: 'PATCH', body });
      setConfig(r.config);
      notify(r.message || 'پیکربندی ذخیره شد', 'success');
    } catch (err) {
      notify(err.message || 'ناموفق', 'error');
    }
  }

  const seasonRows = useMemo(() => seasons.map((s) => ({
    ...s,
    dates: `${String(s.starts_at).slice(0, 10)} ← ${String(s.ends_at).slice(0, 10)}`,
  })), [seasons]);

  return (
    <div className="page-stack">
      <Card title="فصل‌های گذر نبرد" subtitle="فقط یک فصل می‌تواند فعال باشد — فعال‌کردن فصل جدید، قبلی را می‌بندد"
        action={<Button icon={Plus} onClick={() => document.getElementById('new-season-form')?.scrollIntoView({ behavior: 'smooth' })}>فصل جدید</Button>}>
        {!loaded ? <p>در حال خواندن…</p> : seasonRows.length === 0 ? (
          <EmptyState icon={Layers} title="فصلی وجود ندارد" message="اولین فصل را بسازید." />
        ) : (
          <Table rows={seasonRows} cols={[
            { key: 'name', title: 'نام' },
            { key: 'dates', title: 'بازه', render: (r) => <small>{r.dates}</small> },
            { key: 'tier_rows', title: 'ردیف پاداش', render: (r) => <Badge>{r.tier_rows}</Badge> },
            { key: 'is_active', title: 'وضعیت', render: (r) => (
              <Badge tone={r.is_active ? 'success' : 'neutral'}>{r.is_active ? 'فعال' : 'بایگانی'}</Badge>
            ) },
            { key: 'actions', title: '', render: (r) => (
              <span className="row-actions">
                <Button size="sm" variant="ghost" onClick={() => openSeason(r.id)}>پله‌ها</Button>
                <Button size="sm" variant="ghost" onClick={() => toggleSeason(r)}>
                  {r.is_active ? 'غیرفعال' : 'فعال‌کردن'}
                </Button>
              </span>
            ) },
          ]} />
        )}
      </Card>

      <Card id="new-season-form" title="ساخت فصل جدید" subtitle="پاداش پله‌ها از فصل الگو کپی می‌شود؛ بدون الگو، فصل خالی ساخته می‌شود">
        <form onSubmit={createSeason} className="form-grid">
          <Field label="نام فصل"><Input name="name" required placeholder="فصل مهر" /></Field>
          <Field label="شروع (شمسی را خودتان تبدیل کنید)"><Input name="startsAt" type="date" required /></Field>
          <Field label="پایان"><Input name="endsAt" type="date" required /></Field>
          <Field label="کپی پاداش‌ها از فصل"><Select name="template" defaultValue="">
            <option value="">— بدون الگو —</option>
            {seasons.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select></Field>
          <Button type="submit" icon={CalendarDays}>ساخت و فعال‌کردن</Button>
        </form>
      </Card>

      {detailBusy && <p>در حال خواندن فصل…</p>}
      {seasonDetail && (
        <Card title={`پله‌های «${seasonDetail.season.name}»`} subtitle="هر پله دو جایزه دارد: مسیر رایگان و مسیر پلاس. مقدار پلهٔ پلاس فقط برای دارندگان اشتراک باز می‌شود.">
          <div className="tier-grid">
            {seasonDetail.tiers.map((t) => (
              <div className="tier-row" key={t.tier}>
                <b className="tier-num">پلهٔ {t.tier}</b>
                {['free', 'plus'].map((track) => {
                  const row = t[track];
                  if (!row) return <span key={track} className="tier-missing">—</span>;
                  return (
                    <span key={track} className="tier-edit">
                      <small>{track === 'free' ? 'رایگان' : 'پلاس'}</small>
                      <Select value={row.kind}
                        onChange={(e) => setSeasonDetail((d) => {
                          const tiers = d.tiers.map((x) => (x.tier === t.tier
                            ? { ...x, [track]: { ...x[track], kind: e.target.value } } : x));
                          return { ...d, tiers };
                        })}>
                        {Object.entries(KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </Select>
                      <Input type="number" value={row.amount}
                        onChange={(e) => setSeasonDetail((d) => {
                          const tiers = d.tiers.map((x) => (x.tier === t.tier
                            ? { ...x, [track]: { ...x[track], amount: e.target.value } } : x));
                          return { ...d, tiers };
                        })} />
                      <Input value={row.label}
                        onChange={(e) => setSeasonDetail((d) => {
                          const tiers = d.tiers.map((x) => (x.tier === t.tier
                            ? { ...x, [track]: { ...x[track], label: e.target.value } } : x));
                          return { ...d, tiers };
                        })} />
                      <Button size="sm" variant="ghost" icon={Save} onClick={() => saveTier(seasonDetail.season, track, row)}>ذخیره</Button>
                    </span>
                  );
                })}
              </div>
            ))}
          </div>
        </Card>
      )}

      {config && (
        <Card title="منحنی و سقف‌ها" subtitle="XP لازم هر پله از این دو عدد ساخته می‌شود؛ سقف روزانه یعنی چند پله در روز باز می‌شود">
          <form onSubmit={saveConfig} className="form-grid">
            <Field label="XP پلهٔ اول"><Input name="xpBase" type="number" required defaultValue={config.xpBase} /></Field>
            <Field label="رشد هر پله"><Input name="xpStep" type="number" required defaultValue={config.xpStep} /></Field>
            <Field label="سقف پله در روز"><Input name="maxTiers" type="number" min="1" max="50" required defaultValue={config.maxTiersPerDay} /></Field>
            <Field label="مهلت دریافت بعد از پایان (روز)"><Input name="grace" type="number" min="0" required defaultValue={config.claimGraceDays} /></Field>
            <div className="full-row">
              <b>منابع XP (هر منبع سقف روزانهٔ خودش را دارد):</b>
              <div className="form-grid">
                {Object.entries(config.sources).map(([key, def]) => (
                  <Field key={key} label={`${def.label} (${key})`}>
                    <span className="inline-inputs">
                      <Input name={`s_${key}_xp`} type="number" required defaultValue={def.xp} placeholder="XP" />
                      <Input name={`s_${key}_cap`} type="number" required defaultValue={def.dailyCap} placeholder="سقف" />
                    </span>
                  </Field>
                ))}
              </div>
            </div>
            <Button type="submit" icon={Save}>ذخیرهٔ پیکربندی</Button>
          </form>
        </Card>
      )}
    </div>
  );
}
