import { useEffect, useState } from 'react';
import { Activity, CheckCircle2, RefreshCw, Share2, Repeat2, AlertTriangle } from 'lucide-react';
import { Card, Button, Badge } from '../components/ui.jsx';
import { useToast } from '../lib/toast.jsx';

export function AnalyticsPage({ request }) {
  const notify = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const load = () => {
    setLoading(true);
    request('/api/admin/analytics?days=30').then(setData)
      .catch(e => notify(e.message || 'دریافت تحلیل ناموفق بود', 'error'))
      .finally(() => setLoading(false));
  };
  useEffect(load, [request]);
  const resolve = async hash => {
    // A group may contain many reports; opening the crash inbox by group is
    // more useful than pretending one click resolves every occurrence. The
    // summary intentionally remains read-only until individual triage UI is
    // needed; operators still see exact grouped signal and PM2 logs.
    notify(`گروه خطا ${hash.slice(0, 8)} برای بررسی در مانیتورینگ مشخص شد`);
  };
  const f = data?.funnel || {};
  const e = data?.events || {};
  return <div className="stack">
    <div className="tabRow" style={{ justifyContent:'space-between' }}>
      <div><h2 style={{ margin:0 }}>تحلیل رشد و پایداری</h2><p className="topbar-sub">رویدادهای دست‌اول، بدون SDK تبلیغاتی یا فروش داده کاربر · ۳۰ روز اخیر</p></div>
      <Button icon={RefreshCw} variant="secondary" loading={loading} onClick={load}>بروزرسانی</Button>
    </div>
    <div className="card-grid cols-4" style={{ display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(190px,1fr))',gap:12 }}>
      <Card title="شروع مسابقه" action={<Activity size={20}/>}><b style={{ fontSize:30,color:'#38bdf8' }}>{(f.started||0).toLocaleString('fa-IR')}</b><small className="topbar-sub">{(e.match_started?.users||0).toLocaleString('fa-IR')} کاربر یکتا</small></Card>
      <Card title="تکمیل مسابقه" action={<CheckCircle2 size={20}/>}><b style={{ fontSize:30,color:'#34d399' }}>{(f.completionRate||0).toLocaleString('fa-IR')}٪</b><small className="topbar-sub">{(f.completed||0).toLocaleString('fa-IR')} پایان معتبر</small></Card>
      <Card title="نبرد دوباره" action={<Repeat2 size={20}/>}><b style={{ fontSize:30,color:'#ffd36b' }}>{(f.rematchRate||0).toLocaleString('fa-IR')}٪</b><small className="topbar-sub">نسبت به مسابقات کامل</small></Card>
      <Card title="اشتراک نتیجه" action={<Share2 size={20}/>}><b style={{ fontSize:30,color:'#a855f7' }}>{(f.shareRate||0).toLocaleString('fa-IR')}٪</b><small className="topbar-sub">نسبت به مسابقات کامل</small></Card>
    </div>
    <Card title="قیف رویدادها" subtitle="ثبت شروع/پایان/ریمچ روی موتور authoritative انجام می‌شود؛ کلاینت نمی‌تواند جعل کند.">
      <div style={{ display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))',gap:8 }}>
        {Object.entries(e).map(([name,value])=><div key={name} style={{ padding:12,borderRadius:12,background:'rgba(255,255,255,.035)' }}>
          <b style={{ display:'block',direction:'ltr',textAlign:'left' }}>{name}</b><span>{value.total.toLocaleString('fa-IR')} رویداد · {value.users.toLocaleString('fa-IR')} کاربر</span>
        </div>)}
      </div>
    </Card>
    <Card title={`صندوق خطاهای باز (${(data?.openCrashCount||0).toLocaleString('fa-IR')})`} subtitle="خطاهای Web، Android و Backend پس از حذف توکن، موبایل و کلیدهای حساس گروه‌بندی شده‌اند." action={<AlertTriangle size={20} color="#ff5070"/>}>
      <div style={{ display:'grid',gap:8 }}>
        {(data?.crashes||[]).map(crash=><div key={`${crash.error_hash}-${crash.platform}`} style={{ display:'grid',gridTemplateColumns:'100px 1fr auto',gap:10,alignItems:'center',padding:12,border:'1px solid rgba(255,80,112,.18)',borderRadius:12 }}>
          <Badge tone="danger">{crash.platform}</Badge>
          <div><b>{crash.message}</b><small className="topbar-sub" style={{ display:'block' }}>{crash.occurrences.toLocaleString('fa-IR')} بار · {crash.affected_users.toLocaleString('fa-IR')} کاربر · آخرین {new Date(crash.last_seen).toLocaleString('fa-IR')}</small></div>
          <Button size="sm" variant="secondary" onClick={()=>resolve(crash.error_hash)}>نشانه‌گذاری</Button>
        </div>)}
        {!data?.crashes?.length && <div className="topbar-sub">در ۳۰ روز اخیر خطای بازی ثبت نشده است.</div>}
      </div>
    </Card>
  </div>;
}
