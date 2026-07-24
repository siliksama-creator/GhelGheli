import { useEffect, useState } from 'react';
import { BarChart3, CreditCard, Gift, Users } from 'lucide-react';
import { fmtNumber } from '../lib/api.js';
import { Card, Skeleton } from '../components/ui.jsx';
import { RankList } from '../components/rank-list.jsx';

const STAT_ICONS = [Users, CreditCard, BarChart3, Gift];

export function Dashboard({ request }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    request('/api/admin/dashboard').then(setData);
  }, [request]);

  if (!data) {
    return (
      <div className="card-grid">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} height={100} />
        ))}
        <div style={{ gridColumn: '1 / -1' }}>
          <Skeleton height={240} />
        </div>
      </div>
    );
  }

  const stats = [
    ['کاربران', data.users],
    ['کدهای امروز', data.usedCodesToday],
    ['کدهای ماه', data.usedCodesThisMonth],
    ['درخواست‌های در انتظار', data.pendingClaims],
  ];

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <div className="card-grid">
        {stats.map(([label, value], i) => {
          const Icon = STAT_ICONS[i];
          return (
            <Card key={label} className="stat-card">
              <div className="stat-icon">
                <Icon size={18} />
              </div>
              <div className="stat-value">{fmtNumber(value)}</div>
              <div className="stat-label">{label}</div>
            </Card>
          );
        })}
      </div>
      <Card title="لیدربرد زنده" subtitle="رتبه‌بندی لیگ ماه جاری به‌صورت لحظه‌ای">
        <RankList entries={data.league.entries} />
      </Card>
    </div>
  );
}
