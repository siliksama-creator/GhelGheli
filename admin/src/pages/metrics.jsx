import { useEffect, useState, useRef } from 'react';
import { Activity, RefreshCw, Terminal, Cpu, Database, Network, HardDrive, Copy, ArrowDown } from 'lucide-react';
import { Card, Button, Badge } from '../components/ui.jsx';
import { useToast } from '../lib/toast.jsx';

export function MetricsPage({ request }) {
  const notify = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const terminalRef = useRef(null);

  const load = () => {
    request('/api/admin/metrics')
      .then((x) => {
        setData(x);
        setLoading(false);
      })
      .catch((err) => {
        notify('خطا در دریافت اطلاعات مانیتورینگ', 'error');
        setLoading(false);
      });
  };

  useEffect(() => {
    load();
    if (!autoRefresh) return;
    const interval = setInterval(load, 4000);
    return () => clearInterval(interval);
  }, [request, autoRefresh]);

  const copyLogs = () => {
    if (!data?.pm2Logs) return;
    navigator.clipboard.writeText(data.pm2Logs);
    notify('لاگ‌ها با موفقیت کپی شدند');
  };

  const scrollToBottom = () => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  };

  useEffect(() => {
    if (data?.pm2Logs) {
      scrollToBottom();
    }
  }, [data?.pm2Logs]);

  return (
    <div className="stack">
      {/* ── نوار بالایی کنترل مانیتورینگ ── */}
      <div className="tabRow" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <Button variant="secondary" icon={RefreshCw} onClick={load} loading={loading}>
            بروزرسانی دستی
          </Button>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer', fontSize: 13.5, fontWeight: 700 }}>
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              style={{ width: 16, height: 16, cursor: 'pointer' }}
            />
            بروزرسانی خودکار زنده (هر ۴ ثانیه)
          </label>
        </div>
        {autoRefresh && (
          <Badge tone="success" className="shimmer" style={{ padding: '6px 14px', fontSize: 12.5, fontWeight: 800 }}>
            ● مانیتورینگ زنده فعال است
          </Badge>
        )}
      </div>

      {/* ── کارت‌های آمار و سنجه‌های سرور ── */}
      <div className="card-grid cols-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
        {/* ۱. سوکت‌های آنلاین */}
        <Card
          title="سوکت‌های آنلاین"
          subtitle="تعداد اتصال‌های زندهٔ Socket.io — کاربرانی که همین حالا به بازی/چت وصل‌اند"
          action={<Network size={20} className="pos" style={{ opacity: 0.8 }} />}
        >
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 8 }}>
            <b style={{ fontSize: 32, fontWeight: 900, color: '#b5ef58' }}>
              {data ? data.socketCount.toLocaleString('fa-IR') : '—'}
            </b>
            <span style={{ fontSize: 13, color: '#c9ddf2' }}>اتصال فعال</span>
          </div>
        </Card>

        {/* ۲. اتاق‌های بازی آنلاین */}
        <Card
          title="اتاق‌های بازی زنده"
          subtitle="بازی‌های دونفره‌ای که همین حالا در جریان‌اند"
          action={<Cpu size={20} className="pos" style={{ opacity: 0.8 }} />}
        >
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 8 }}>
            <b style={{ fontSize: 32, fontWeight: 900, color: '#38bdf8' }}>
              {data ? data.activeRooms.toLocaleString('fa-IR') : '—'}
            </b>
            <span style={{ fontSize: 13, color: '#c9ddf2' }}>بازی فعال</span>
          </div>
        </Card>

        {/* ۳. حافظه کش Redis */}
        <Card
          title="حافظه موقت Redis"
          subtitle="مصرف حافظهٔ سرویس کش و صف‌ها"
          action={<HardDrive size={20} className="pos" style={{ opacity: 0.8 }} />}
        >
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
            <b style={{ fontSize: 24, fontWeight: 900, color: '#ffd36b' }}>
              {data ? data.redisMemory : '—'}
            </b>
          </div>
        </Card>

        {/* ۴. اتصالات PostgreSQL */}
        <Card
          title="اتصال‌های PostgreSQL"
          subtitle="تعداد اتصال‌های باز به دیتابیس"
          action={<Database size={20} className="pos" style={{ opacity: 0.8 }} />}
        >
          <div style={{ marginTop: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
              <span>کل اتصالات باز در استخر:</span>
              <b style={{ color: '#fff' }}>{data ? data.postgresConnections.total : '—'}</b>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
              <span>اتصالات بیکار (Idle):</span>
              <b style={{ color: '#34d399' }}>{data ? data.postgresConnections.idle : '—'}</b>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
              <span>در صف انتظار (Waiting):</span>
              <b style={{ color: data?.postgresConnections.waiting > 0 ? '#ff5070' : '#aaa' }}>
                {data ? data.postgresConnections.waiting : '—'}
              </b>
            </div>
          </div>
        </Card>
      </div>

      {/* ── بخش استریم زنده لاگ‌های خطای PM2 ── */}
      <Card
        title="استریم زنده لاگ‌های خطای سرور (PM2 Error Logs)"
        subtitle="نمایش لحظه‌ای ۱۰۰ خط آخر لاگ خطاهای فرآیند ghelgheli-api"
        action={
          <div style={{ display: 'flex', gap: 8 }}>
            <Button size="sm" icon={Copy} onClick={copyLogs}>
              کپی لاگ‌ها
            </Button>
            <Button size="sm" icon={ArrowDown} onClick={scrollToBottom}>
              پایین رفتن
            </Button>
          </div>
        }
      >
        <div style={{ position: 'relative', marginTop: 12 }}>
          <div
            ref={terminalRef}
            style={{
              height: 460,
              overflow: 'auto',
              background: '#040b15',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: 16,
              padding: 16,
              fontFamily: 'monospace',
              fontSize: 12.5,
              lineHeight: 1.6,
              color: '#38bdf8',
              direction: 'ltr',
              textAlign: 'left',
              whiteSpace: 'pre-wrap',
              boxShadow: 'inset 0 4px 20px rgba(0,0,0,0.5)',
            }}
          >
            {loading && !data ? (
              <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: '#888' }}>
                در حال بارگذاری لاگ‌ها...
              </div>
            ) : data?.pm2Logs?.trim() ? (
              data.pm2Logs.trim()
            ) : (
              // این حالت دیگر «در حال بارگذاری» نیست: داده آمده ولی فایل لاگ
              // خطایی ندارد (گره سالم است). قبلاً همین حالت به‌اشتباه متنِ
              // «در حال بارگذاری…» را تا ابد نشان می‌داد چون رشتهٔ خالی falsy بود.
              <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: '#34d399', fontWeight: 700 }}>
                ✓ هیچ خطایی در لاگ سرور ثبت نشده است — همهٔ گره‌ها سالم‌اند
              </div>
            )}
          </div>
          <div
            style={{
              position: 'absolute',
              top: 10,
              right: 15,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: 'rgba(0,0,0,0.6)',
              padding: '4px 10px',
              borderRadius: 20,
              fontSize: 11,
              color: '#ff5070',
              fontWeight: 800,
              border: '1px solid rgba(255, 80, 112, 0.2)',
            }}
          >
            <Terminal size={12} />
            LIVE ERROR STREAM
          </div>
        </div>
      </Card>
    </div>
  );
}
