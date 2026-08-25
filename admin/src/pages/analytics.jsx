import { useEffect, useState } from 'react';
import { Activity, CheckCircle2, RefreshCw, Share2, Repeat2, AlertTriangle } from 'lucide-react';
import { Card, Button, Badge } from '../components/ui.jsx';
import { fmtNumber } from '../lib/api.js';
import { useToast } from '../lib/toast.jsx';

/**
 * تحلیل رشد + صندوق خطا + آمار گردونه و کمیسیون معرفی.
 *
 * APIهای گردونه و معرفی از قبل بودند ولی هیچ صفحه‌ای صداشان نمی‌زد —
 * یعنی مدیر نمی‌توانست بفهمد نرخ واقعی جایزه با طراحی می‌خواند یا نه.
 */
export function AnalyticsPage({ request }) {
  const notify = useToast();
  const [data, setData] = useState(null);
  const [wheel, setWheel] = useState(null);
  const [refs, setRefs] = useState(null);
  const [duel, setDuel] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    Promise.all([
      request('/api/admin/analytics?days=30'),
      request('/api/admin/wheel/stats').catch(() => null),
      request('/api/admin/referrals/purchase-commissions?limit=30').catch(() => null),
      request('/api/admin/card-duel/balance').catch(() => null),
    ]).then(([a, w, r, d]) => {
      setData(a);
      setWheel(w);
      setRefs(r);
      setDuel(d);
    }).catch(e => notify(e.message || 'دریافت تحلیل ناموفق بود', 'error'))
      .finally(() => setLoading(false));
  };
  useEffect(load, [request]);

  const resolve = async (hash, platform) => {
    try {
      const r = await request(`/api/admin/crashes/groups/${hash}`, {
        method: 'PATCH',
        body: { status: 'resolved', platform },
      });
      notify(`${fmtNumber(r.updated || 0)} گزارش بسته شد`);
      load();
    } catch (e) {
      notify(e.message || 'بستن گروه ناموفق بود', 'error');
    }
  };

  const f = data?.funnel || {};
  const e = data?.events || {};
  return <div className="stack">
    <div className="tabRow" style={{ justifyContent:'space-between' }}>
      <div><h2 style={{ margin:0 }}>تحلیل رشد و پایداری</h2><p className="topbar-sub">رویدادهای دست‌اول، صندوق خطا، گردونه و کمیسیون معرفی · ۳۰ روز اخیر</p></div>
      <Button icon={RefreshCw} variant="secondary" loading={loading} onClick={load}>بروزرسانی</Button>
    </div>
    <div className="card-grid cols-4" style={{ display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(190px,1fr))',gap:12 }}>
      <Card title="شروع مسابقه" action={<Activity size={20}/>}><b style={{ fontSize:30,color:'#38bdf8' }}>{fmtNumber(f.started||0)}</b><small className="topbar-sub">{fmtNumber(e.match_started?.users||0)} کاربر یکتا</small></Card>
      <Card title="تکمیل مسابقه" action={<CheckCircle2 size={20}/>}><b style={{ fontSize:30,color:'#34d399' }}>{fmtNumber(f.completionRate||0)}٪</b><small className="topbar-sub">{fmtNumber(f.completed||0)} پایان معتبر</small></Card>
      <Card title="نبرد دوباره" action={<Repeat2 size={20}/>}><b style={{ fontSize:30,color:'#ffd36b' }}>{fmtNumber(f.rematchRate||0)}٪</b><small className="topbar-sub">نسبت به مسابقات کامل</small></Card>
      <Card title="اشتراک نتیجه" action={<Share2 size={20}/>}><b style={{ fontSize:30,color:'#a855f7' }}>{fmtNumber(f.shareRate||0)}٪</b><small className="topbar-sub">نسبت به مسابقات کامل</small></Card>
    </div>
    <Card title="قیف رویدادها" subtitle="ثبت شروع/پایان/ریمچ روی موتور authoritative انجام می‌شود؛ کلاینت نمی‌تواند جعل کند.">
      <div style={{ display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))',gap:8 }}>
        {Object.entries(e).map(([name,value])=><div key={name} style={{ padding:12,borderRadius:12,background:'rgba(255,255,255,.035)' }}>
          <b style={{ display:'block',direction:'ltr',textAlign:'left' }}>{name}</b><span>{fmtNumber(value.total)} رویداد · {fmtNumber(value.users)} کاربر</span>
        </div>)}
      </div>
    </Card>
    <Card title={`صندوق خطاهای باز (${fmtNumber(data?.openCrashCount||0)})`} subtitle="بستن گروه، همهٔ رخدادهای همان hash را حل‌شده می‌کند — نه فقط یکی." action={<AlertTriangle size={20} color="#ff5070"/>}>
      <div style={{ display:'grid',gap:8 }}>
        {(data?.crashes||[]).map(crash=><div key={`${crash.error_hash}-${crash.platform}`} style={{ display:'grid',gridTemplateColumns:'100px 1fr auto',gap:10,alignItems:'center',padding:12,border:'1px solid rgba(255,80,112,.18)',borderRadius:12 }}>
          <Badge tone="danger">{crash.platform}</Badge>
          <div><b>{crash.message}</b><small className="topbar-sub" style={{ display:'block' }}>{fmtNumber(crash.occurrences)} بار · {fmtNumber(crash.affected_users)} کاربر · آخرین {new Date(crash.last_seen).toLocaleString('fa-IR')}</small></div>
          <Button size="sm" variant="secondary" onClick={()=>resolve(crash.error_hash, crash.platform)}>حل شد</Button>
        </div>)}
        {!data?.crashes?.length && <div className="topbar-sub">در ۳۰ روز اخیر خطای بازی ثبت نشده است.</div>}
      </div>
    </Card>

    {wheel && (
      <Card title="آمار واقعی گردونه" subtitle="بدون این صفحه هیچ راهی نبود بفهمیم نرخ واقعی با وزن طراحی‌شده می‌خواند یا نه.">
        <div style={{ display:'flex', gap:24, flexWrap:'wrap', marginBottom:12 }}>
          <Stat n={wheel.spins} l="چرخش" />
          <Stat n={wheel.players} l="بازیکن" />
          <Stat n={wheel.cashPaid} l="تومان پرداخت‌شده" />
          <Stat n={wheel.actualCashPerSpin} l="هزینه واقعی هر چرخش" />
          <Stat n={wheel.expectedCashPerSpin} l="هزینه مورد انتظار" />
        </div>
        {(wheel.byPrize||[]).slice(0,12).map(p => (
          <div key={`${p.label}-${p.value}`} style={{ display:'flex', justifyContent:'space-between', gap:8, fontSize:13, padding:'6px 0', borderBottom:'1px solid rgba(255,255,255,.06)' }}>
            <span>{p.label}</span>
            <span className="topbar-sub">
              {fmtNumber(p.hits)} بار · واقعی {(p.actualRate*100).toFixed(3)}٪
              {p.expectedRate != null ? ` · انتظار ${(p.expectedRate*100).toFixed(3)}٪` : ''}
            </span>
          </div>
        ))}
      </Card>
    )}

    {refs && (
      <Card title="کمیسیون نقدی معرفی" subtitle={`${fmtNumber(refs.totalCount)} خرید · جمع ${fmtNumber(refs.totalCommission)} تومان`}>
        {(refs.rows||[]).length === 0 ? (
          <div className="topbar-sub">هنوز کمیسیون خریدی ثبت نشده.</div>
        ) : refs.rows.map(row => (
          <div key={row.id} style={{ display:'flex', justifyContent:'space-between', gap:8, fontSize:13, padding:'6px 0', borderBottom:'1px solid rgba(255,255,255,.06)' }}>
            <span>{row.referrer_nickname || row.referrer_mobile} ← {row.buyer_nickname || row.buyer_mobile}</span>
            <b>{fmtNumber(row.commission_amount)} تومان</b>
          </div>
        ))}
      </Card>
    )}

    {duel && (
      <Card title="تعادل دوئل کارت" subtitle={`${fmtNumber(duel.sampledBattles)} نبرد · ${fmtNumber(duel.sampledRounds)} راند آنلاین`}>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:10 }}>
          <div>
            <b>برد بر اساس کمیابی</b>
            {Object.entries(duel.rarityWins || {}).map(([k,v]) => (
              <div key={k} className="topbar-sub">{k}: {fmtNumber(v)}</div>
            ))}
          </div>
          <div>
            <b>برد بر اساس افکت</b>
            {Object.entries(duel.effectWins || {}).map(([k,v]) => (
              <div key={k} className="topbar-sub">{k}: {fmtNumber(v)}</div>
            ))}
          </div>
        </div>
      </Card>
    )}
  </div>;
}

function Stat({ n, l }) {
  return (
    <div>
      <div style={{ fontSize:22, fontWeight:900 }}>{fmtNumber(n || 0)}</div>
      <div className="topbar-sub">{l}</div>
    </div>
  );
}
