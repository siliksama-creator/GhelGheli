// Monthly league standings.
//
// Previously this had no error branch: `req(...).then(setD)` with no
// `.catch`, so any failure left the user on "در حال بارگذاری لیگ..." forever.
import React, { useCallback, useState } from 'react';

import { req, fa, asset, avatarUrl } from '../lib/api.js';
import { DisplayName } from '../components/Cosmetics.jsx';
import { useAsync } from '../lib/useAsync.js';
import { AsyncSection, EmptyView } from '../components/states.jsx';
import Clubs from './Clubs.jsx';

export default function League({ token, openProfile }) {
  const load = useCallback(
    () => req('/api/league/current', 'GET', null, token), [token]);
  const state = useAsync(load, [load]);
  const [tab, setTab] = useState('table');

  // The club rosters are their own screen; mounting them only when selected
  // means the league table does not pay for a request nobody looked at.
  if (tab === 'clubs') {
    return (
      <section className="card wide leaguePage">
        <div className="leagueTabs">
          <button onClick={() => setTab('table')}>جدول لیگ</button>
          <button className="on">باشگاه‌ها</button>
        </div>
        <Clubs token={token} openProfile={openProfile} />
      </section>
    );
  }

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
            <div className="leagueTabs">
              <button className="on">جدول لیگ</button>
              <button onClick={() => setTab('clubs')}>باشگاه‌ها</button>
            </div>

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
                  <DisplayName name={e.nickname || e.first_name || 'کاربر'}
                    cosmetics={e.cosmetics} />
                  <strong>{fa(e.points)} امتیاز</strong>
                </div>
              ))}
            </div>

            <div className="leagueList">
              {rest.map((e, i) => (
                <div className="row clickable leagueRow" key={e.user_id}
                  onClick={() => openProfile(e.user_id)}>
                  <b>#{fa(i + 4)}</b>
                  <DisplayName name={e.nickname || e.first_name || 'کاربر'}
                    cosmetics={e.cosmetics} />
                  <strong>{fa(e.points)} امتیاز</strong>
                </div>
              ))}
            </div>

            {!entries.length &&
              <EmptyView icon="🏆">هنوز امتیازی در لیگ ثبت نشده است.</EmptyView>}

            {/* Last month's winners. Without this the previous season simply
                vanishes when the points reset. */}
            {d.previousSeason?.winners?.length > 0 && (
              <div className="prevSeason">
                <h3>🏅 برندگان ماه گذشته ({d.previousSeason.monthYear})</h3>
                <div className="prevList">
                  {d.previousSeason.winners.map(w => (
                    <div className="prevRow" key={w.userId}
                      onClick={() => openProfile(w.userId)}>
                      <span className="prevMedal">
                        {['🥇', '🥈', '🥉'][w.rank - 1] || '🏅'}
                      </span>
                      <img src={w.profileImageUrl
                        ? asset(w.profileImageUrl)
                        : avatarUrl(w.profileAvatarKey)}
                        alt="" width="32" height="32" loading="lazy" />
                      <b>{w.nickname}</b>
                      <span className="prevPts">{fa(w.points)} امتیاز</span>
                      {w.prizeAmount > 0 && (
                        <span className="prevPrize">
                          {fa(w.prizeAmount)} تومان
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        );
      }}
    </AsyncSection>
  );
}
