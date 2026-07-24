import { fmtNumber } from '../lib/api.js';
import { EmptyState } from './ui.jsx';
import { Trophy } from 'lucide-react';

// Shared leaderboard rendering used by the dashboard and the league page.
export function RankList({ entries = [] }) {
  if (!entries.length) {
    return <EmptyState icon={Trophy} title="هنوز امتیازی ثبت نشده است" />;
  }
  return (
    <div className="leaderboard">
      {entries.map((e, i) => {
        const rank = e.rank || i + 1;
        const top = rank <= 3;
        return (
          <div key={e.user_id} className={`rank-row ${top ? 'top' : ''}`}>
            <div className="rank-num">{top ? ['🥇', '🥈', '🥉'][rank - 1] : fmtNumber(rank)}</div>
            <span style={{ fontWeight: 700, fontSize: 14 }}>{e.nickname || e.first_name || 'کاربر'}</span>
            <strong>{fmtNumber(e.points)} امتیاز</strong>
          </div>
        );
      })}
    </div>
  );
}
