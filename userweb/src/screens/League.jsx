// Monthly league standings with Previous Season Winners Tab.
import React, { useCallback, useState } from 'react';

import { req, fa, asset, avatarUrl } from '../lib/api.js';
import { DisplayName } from '../components/Cosmetics.jsx';
import { useAsync } from '../lib/useAsync.js';
import { AsyncSection, EmptyView } from '../components/states.jsx';
import Clubs from './Clubs.jsx';

export default function League({ token, openProfile }) {
  const [selectedLeagueId, setSelectedLeagueId] = useState(null);
  const load = useCallback(
    () => req(selectedLeagueId ? `/api/league/current?seasonId=${selectedLeagueId}` : '/api/league/current', 'GET', null, token), [token, selectedLeagueId]);
  const state = useAsync(load, [load]);
  const [tab, setTab] = useState('table');

  if (tab === 'clubs') {
    return (
      <section className="card wide leaguePage">
        <div className="leagueTabs">
          <button onClick={() => setTab('table')}>جدول لیگ</button>
          <button className="on">باشگاه‌ها</button>
          <button onClick={() => setTab('prev')}>برندگان قبل</button>
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
        const prevWinners = d.previousSeason?.winners || d.previousWinners || [];
        const end = season.ends_at ? new Date(season.ends_at) : null;
        const days = end ? Math.max(0, Math.ceil((end - Date.now()) / 86400000)) : 0;
        const top = entries.slice(0, 3);
        const rest = entries.slice(3);

        if (tab === 'prev') {
          return (
            <section className="card wide leaguePage">
              <div className="leagueTabs">
                <button onClick={() => setTab('table')}>جدول لیگ</button>
                <button onClick={() => setTab('clubs')}>باشگاه‌ها</button>
                <button className="on">برندگان قبل</button>
              </div>

              <div className="leagueBanner" style={{ margin: '16px 0', background: 'linear-gradient(135deg, #3D2E00, #1A1400)', border: '1px solid rgba(255, 215, 0, 0.3)', padding: '20px', borderRadius: '16px', textAlign: 'center' }}>
                <div style={{ fontSize: '32px' }}>🏆</div>
                <h3 style={{ color: '#FFD700', fontWeight: '900', margin: '8px 0 4px' }}>برندگان دوره قبل لیگ</h3>
                <p style={{ color: '#CBD5E1', fontSize: '12px' }}>جوایز پس از پایان لیگ پرداخت و این برندگان تا پایان لیگ بعدی اینجا نمایش داده می‌شوند.</p>
              </div>

              {prevWinners.length === 0 ? (
                <EmptyView title="هنوز دوره قبلی برگزار نشده است" message="به محض پایان دوره لیگ، اسامی برندگان در این قسمت ثبت می‌شود." />
              ) : (
                <div className="leagueList">
                  {prevWinners.map((w, idx) => (
                    <div key={idx} className="leagueRow" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', background: 'rgba(255,255,255,0.04)', borderRadius: '12px', marginBottom: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{ fontSize: '18px', fontWeight: '900', width: '28px', textAlign: 'center' }}>
                          {w.rank === 1 ? '🥇' : w.rank === 2 ? '🥈' : w.rank === 3 ? '🥉' : fa(w.rank)}
                        </span>
                        <div>
                          <div style={{ fontWeight: 'bold', color: '#FFF' }}>{w.nickname || w.first_name || 'کاربر'}</div>
                          {w.points && <div style={{ fontSize: '11px', color: '#94A3B8' }}>{fa(w.points)} امتیاز</div>}
                        </div>
                      </div>
                      {w.prize_amount > 0 && (
                        <div style={{ background: 'rgba(34, 231, 166, 0.15)', color: '#22E7A6', border: '1px solid rgba(34, 231, 166, 0.4)', padding: '4px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 'bold' }}>
                          {fa(w.prize_amount)} تومان
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          );
        }

        return (
          <section className="card wide leaguePage">
            <div className="leagueTabs">
              <button className="on">جدول لیگ</button>
              <button onClick={() => setTab('clubs')}>باشگاه‌ها</button>
              <button onClick={() => setTab('prev')}>برندگان قبل</button>
            </div>

            <div className="leagueBanner" style={{ margin: '16px 0', background: 'linear-gradient(135deg, #16345F, #071521)', border: '1px solid rgba(56, 189, 248, 0.3)', padding: '20px', borderRadius: '16px' }}>
              <h2 style={{ color: '#FFF', fontWeight: '900', margin: '0 0 6px' }}>لیگ قلقلی</h2>
              <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: '13px', lineHeight: 1.5 }}>
                برترین کاربران تا پایان زمان اعلام شده؛ جوایز پس از پایان لیگ پرداخت و لیگ بعدی آغاز می‌شود.
              </p>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'rgba(255,255,255,0.15)', padding: '6px 12px', borderRadius: '20px', marginTop: '10px', fontSize: '12px', color: '#FFF', fontWeight: 'bold' }}>
                ⏱ {days > 0 ? `${fa(days)} روز تا پایان این دوره لیگ` : 'در حال محاسبه'}
              </div>
            </div>

            {top.length > 0 && (
              <div className="podium" style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
                {top.map((r, i) => (
                  <div key={r.user_id} className={`podiumItem podium-${i + 1}`} style={{ flex: 1, textAlign: 'center', background: i === 0 ? 'rgba(255, 215, 0, 0.15)' : 'rgba(255,255,255,0.05)', border: i === 0 ? '1px solid #FFD700' : '1px solid rgba(255,255,255,0.1)', padding: '14px', borderRadius: '16px' }}>
                    <div style={{ fontSize: '24px' }}>{i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'}</div>
                    <div style={{ margin: '6px 0' }}><DisplayName name={r.nickname || 'کاربر'} cosmetics={r.cosmetics} level={r.level} /></div>
                    <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#38BDF8' }}>{fa(r.points)} امتیاز</div>
                  </div>
                ))}
              </div>
            )}

            <div className="leagueList">
              {rest.map((r, idx) => (
                <div key={r.user_id} className="leagueRow" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', marginBottom: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontWeight: 'bold', width: '24px' }}>{fa(idx + 4)}</span>
                    <DisplayName name={r.nickname || 'کاربر'} cosmetics={r.cosmetics} level={r.level} />
                  </div>
                  <span style={{ fontWeight: 'bold', color: '#38BDF8' }}>{fa(r.points)} امتیاز</span>
                </div>
              ))}
            </div>
          </section>
        );
      }}
    </AsyncSection>
  );
}
