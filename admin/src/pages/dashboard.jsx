import { useEffect, useState } from 'react';
import {
  AlertTriangle, BarChart3, CreditCard, Gift, LifeBuoy, ScanLine,
  UserPlus, Users, Wallet, Coins, CircleDot,
} from 'lucide-react';
import { fmtNumber } from '../lib/api.js';
import { Card, Skeleton } from '../components/ui.jsx';
import { RankList } from '../components/rank-list.jsx';

/**
 * داشبورد عملیاتی.
 *
 * نسخهٔ قبلی چهار عدد کلی + لیدربرد بود. مدیر برای «کار امروز» باید
 * جداگانه پشتیبانی، کیف پول، صف بررسی کارت و صندوق خطا را باز می‌کرد.
 * صف‌های در انتظار همین‌جا هستند و با کلیک به صفحهٔ مربوط می‌روند.
 */
export function Dashboard({ request, onNavigate }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    request('/api/admin/dashboard').then(setData);
  }, [request]);

  if (!data) {
    return (
      <div className="card-grid">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} height={100} />
        ))}
        <div style={{ gridColumn: '1 / -1' }}>
          <Skeleton height={240} />
        </div>
      </div>
    );
  }

  const go = (page) => onNavigate && onNavigate(page);

  const overview = [
    ['کاربران', data.users, Users, null],
    ['کدهای امروز', data.usedCodesToday, CreditCard, 'photo-cards'],
    ['کدهای ماه', data.usedCodesThisMonth, BarChart3, null],
    ['عضویت امروز', data.usersJoinedToday || 0, UserPlus, 'users'],
  ];

  const queues = [
    {
      label: 'جوایز در انتظار',
      value: data.pendingClaims,
      page: 'rewards',
      icon: Gift,
      warn: data.pendingClaims > 0,
    },
    {
      label: 'تیکت باز',
      value: data.pendingTickets || 0,
      page: 'support',
      icon: LifeBuoy,
      warn: (data.pendingTickets || 0) > 0,
    },
    {
      label: 'برداشت در انتظار',
      value: data.pendingWithdrawals || 0,
      extra: data.pendingWithdrawalAmount
        ? `${fmtNumber(data.pendingWithdrawalAmount)} تومان`
        : null,
      page: 'wallet',
      icon: Wallet,
      warn: (data.pendingWithdrawals || 0) > 0,
    },
    {
      label: 'صف بررسی کارت',
      value: data.pendingPhotoReviews || 0,
      page: 'photo-cards',
      icon: ScanLine,
      warn: (data.pendingPhotoReviews || 0) > 0,
    },
    {
      label: 'خطای باز',
      value: data.openCrashes || 0,
      page: 'analytics',
      icon: AlertTriangle,
      warn: (data.openCrashes || 0) > 0,
    },
  ];

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <div className="card-grid">
        {overview.map(([label, value, Icon, page]) => (
          <Card
            key={label}
            className="stat-card"
            style={page ? { cursor: 'pointer' } : undefined}
            onClick={page ? () => go(page) : undefined}
          >
            <div className="stat-icon"><Icon size={18} /></div>
            <div className="stat-value">{fmtNumber(value)}</div>
            <div className="stat-label">{label}</div>
          </Card>
        ))}
      </div>

      <Card
        title="صف کار امروز"
        subtitle="هر عدد به صفحهٔ مربوط می‌رود — کاشی صفر یعنی صف خالی است"
      >
        <div className="card-grid" style={{ margin: 0 }}>
          {queues.map((q) => {
            const Icon = q.icon;
            return (
              <button
                key={q.label}
                type="button"
                onClick={() => go(q.page)}
                className="stat-card"
                style={{
                  textAlign: 'start',
                  cursor: 'pointer',
                  border: q.warn
                    ? '1px solid color-mix(in srgb, var(--gg-warning) 55%, transparent)'
                    : undefined,
                  background: q.warn
                    ? 'color-mix(in srgb, var(--gg-warning) 10%, transparent)'
                    : undefined,
                }}
              >
                <div className="stat-icon"><Icon size={18} /></div>
                <div className="stat-value">{fmtNumber(q.value)}</div>
                <div className="stat-label">{q.label}</div>
                {q.extra && (
                  <div className="topbar-sub" style={{ marginTop: 4 }}>{q.extra}</div>
                )}
              </button>
            );
          })}
        </div>
      </Card>

      <div className="card-grid cols-2">
        <Card title="اقتصاد زنده" subtitle="سکهٔ فصل و اشتراک پلاس — بدون نیاز به صفحهٔ جدا">
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            <div>
              <div className="stat-label">سکه در گردش</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 22, fontWeight: 900 }}>
                <Coins size={18} /> {fmtNumber(data.coinsInCirculation || 0)}
              </div>
            </div>
            <div>
              <div className="stat-label">پلاس فعال</div>
              <div style={{ fontSize: 22, fontWeight: 900 }}>{fmtNumber(data.plusActive || 0)}</div>
            </div>
            <div>
              <div className="stat-label">چرخش گردونه امروز</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 22, fontWeight: 900 }}>
                <CircleDot size={18} /> {fmtNumber(data.wheelSpinsToday || 0)}
              </div>
            </div>
          </div>
        </Card>
        <Card title="لیدربرد زنده" subtitle="رتبه‌بندی لیگ ماه جاری">
          <RankList entries={data.league?.entries || []} />
        </Card>
      </div>
    </div>
  );
}
