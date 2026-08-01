// Monthly league standings.
//
// Previously this had no error branch: `req(...).then(setD)` with no
// `.catch`, so any failure left the user on "در حال بارگذاری لیگ..." forever.
import React, { useCallback } from 'react';

import { req, fa } from '../lib/api.js';
import { useAsync } from '../lib/useAsync.js';
import { AsyncSection, EmptyView } from '../components/states.jsx';

export default function League({ token, openProfile }) {
  const load = useCallback(
    () => req('/api/league/current', 'GET', null, token), [token]);
  const state = useAsync(load, [load]);

  return (
    <AsyncSection state={state} loadingLabel="در حال بارگذاری لیگ...">
      {d => {
        const entries = d.entries || [];
        const season = d.season || {};
        const end = season.ends_at ? new Date(season.ends_at) : null;
        const days = end
          ? Math.max(0, Math.ceil((end - Date.now()) / 86400000))
          : 0;
        const top = entries.slice(0, 3);
        const rest = entries.slice(3);

        return (
          <section className="card wide leaguePage">
            <div className="sectionHead">
              <div>
                <h2>لیگ ماهانه قلقلی</h2>
                <p>
                  رتبه‌بندی زنده کاربران تا پایان ماه؛ امتیاز لیگ آخر ماه ریست
                  می‌شود، امتیاز کلی دست نمی‌خورد.
                </p>
              </div>
              <b className="countdown">{fa(days)} روز مانده</b>
            </div>

            <div className="podium">
              {top.map((e, i) => (
                <div className={`podiumCard p${i + 1}`} key={e.user_id}
                  onClick={() => openProfile(e.user_id)}>
                  <span className="medal">{['🥇', '🥈', '🥉'][i]}</span>
                  <b>{e.nickname || e.first_name || 'کاربر'}</b>
                  <strong>{fa(e.points)} امتیاز</strong>
                </div>
              ))}
            </div>

            <div className="leagueList">
              {rest.map((e, i) => (
                <div className="row clickable leagueRow" key={e.user_id}
                  onClick={() => openProfile(e.user_id)}>
                  <b>#{fa(i + 4)}</b>
                  <span>{e.nickname || e.first_name || 'کاربر'}</span>
                  <strong>{fa(e.points)} امتیاز</strong>
                </div>
              ))}
            </div>

            {!entries.length &&
              <EmptyView icon="🏆">هنوز امتیازی در لیگ ثبت نشده است.</EmptyView>}
          </section>
        );
      }}
    </AsyncSection>
  );
}
