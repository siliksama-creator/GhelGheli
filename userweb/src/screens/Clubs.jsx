// Club rosters — a tab inside the league page.
//
// Two levels: the grid of clubs with their member counts, and one club's
// roster. Members are ordered by this month's league points, so the roster
// doubles as a per-club leaderboard rather than an alphabetical phone book.
//
// Every row opens that user's public profile, which is the whole point: the
// owner asked for the list to be tappable.
import React, { useCallback, useState } from 'react';

import { req, fa, asset, avatarUrl } from '../lib/api.js';
import { useAsync } from '../lib/useAsync.js';
import { AsyncSection, EmptyView } from '../components/states.jsx';
import { clubImg, DisplayName } from '../components/Cosmetics.jsx';

function Roster({ token, club, back, openProfile }) {
  const load = useCallback(
    () => req(`/api/clubs/${club.slug}/members`, 'GET', null, token),
    [club.slug, token]);
  const state = useAsync(load, [load]);

  return (
    <div className="clubRoster">
      <div className="rosterHead">
        <button className="ghost" onClick={back}>‹ همهٔ باشگاه‌ها</button>
        <img src={clubImg(club.slug)} alt="" width="42" height="42" />
        <div>
          <h3>{club.name}</h3>
          <small>{fa(club.memberCount)} هوادار</small>
        </div>
      </div>

      <AsyncSection state={state} loadingLabel="در حال بارگذاری هواداران...">
        {d => (!d.members.length ? (
          <EmptyView icon="group">
            هنوز کسی عضو این باشگاه نشده. اولین نفر باش!
          </EmptyView>
        ) : (
          <div className="rosterList">
            {d.members.map(m => (
              <div className="row clickable rosterRow" key={m.userId}
                onClick={() => openProfile(m.userId)}>
                <b className="rosterRank">#{fa(m.rank)}</b>
                <img className="rosterPic" alt=""
                  src={m.profileImageUrl
                    ? asset(m.profileImageUrl)
                    : avatarUrl(m.profileAvatarKey)}
                  width="34" height="34" loading="lazy" />
                {/* DisplayName به‌جای نام خام: ستارهٔ پلاس، نشان باشگاه و
                    رنگ اسم را هم می‌آورد — همان چیزی که چت و لیگ دارند. */}
                <DisplayName className="rosterName" name={m.nickname}
                  cosmetics={m.cosmetics} avatarKey={m.profileAvatarKey}
                  level={m.level} />
                {/* "۰ امتیاز ماه" next to every name reads as a broken
                    counter, especially early in a month when the league has
                    just reset and NOBODY has points yet. Fall back to the
                    lifetime total, which is never zero for an active user,
                    and label which one is being shown. */}
                <span className="rosterPts">
                  {m.monthlyPoints > 0 ? (
                    <>{fa(m.monthlyPoints)} <small>امتیاز ماه</small></>
                  ) : m.lifetimePoints > 0 ? (
                    <>{fa(m.lifetimePoints)} <small>امتیاز کل</small></>
                  ) : (
                    <small className="rosterNew">تازه‌وارد</small>
                  )}
                </span>
              </div>
            ))}
          </div>
        ))}
      </AsyncSection>
    </div>
  );
}

export default function Clubs({ token, openProfile }) {
  const load = useCallback(
    () => req('/api/clubs', 'GET', null, token), [token]);
  const state = useAsync(load, [load]);
  const [open, setOpen] = useState(null);

  return (
    <AsyncSection state={state} loadingLabel="در حال بارگذاری باشگاه‌ها...">
      {d => {
        if (open) {
          const fresh = d.clubs.find(c => c.slug === open.slug) || open;
          return (
            <Roster token={token} club={fresh} openProfile={openProfile}
              back={() => setOpen(null)} />
          );
        }

        const mine = new Set((d.mine || []).map(c => c.slug));

        return (
          <div className="clubsTab">
            <p className="hint clubsIntro">
              هوادارهای هر باشگاه را ببین. با خرید نشان باشگاه از فروشگاه عضو
              می‌شوی و اسمت اینجا می‌آید.
            </p>

            <div className="clubGrid">
              {d.clubs.map(c => (
                <button className={`clubCard${mine.has(c.slug) ? ' mine' : ''}`}
                  key={c.slug} onClick={() => setOpen(c)}>
                  <img src={clubImg(c.slug)} alt="" width="56" height="56"
                    loading="lazy" decoding="async" />
                  <b>{c.name}</b>
                  <span className="clubCount">
                    {c.memberCount ? `${fa(c.memberCount)} هوادار` : 'بدون هوادار'}
                  </span>
                  {mine.has(c.slug) && <span className="clubMine">عضوی</span>}
                </button>
              ))}
            </div>
          </div>
        );
      }}
    </AsyncSection>
  );
}
