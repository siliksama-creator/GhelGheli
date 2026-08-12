// Another player's comprehensive profile, opened from chat, the league table or a game.
import React, { useCallback, useEffect, useState } from 'react';

import { req, asset, fa, avatarUrl } from '../lib/api.js';
import { clubImg, CosmeticAvatarFrame, nameColorStyle, profileBackgroundStyle } from '../components/Cosmetics.jsx';
import { useAsync } from '../lib/useAsync.js';
import { LoadingView, ErrorView } from '../components/states.jsx';
import { SvgIcon } from '../components/IconAsset.jsx';

const medal = r => (r === 1 ? '🥇' : r === 2 ? '🥈' : r === 3 ? '🥉' : '');

export default function PublicProfile({ token, userId, close }) {
  const load = useCallback(
    () => req(`/api/users/${userId}/public`, 'GET', null, token),
    [userId, token]);
  const state = useAsync(load, [load]);
  const [tab, setTab] = useState('prizes');

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);

  const u = state.data;
  const cos = u?.cosmetics || {};

  return (
    <div className="modalShade" onClick={close}>
      <div className="publicModal pp" onClick={e => e.stopPropagation()}
        style={profileBackgroundStyle(cos.profileBackground)}
        role="dialog" aria-label="پروفایل کاربر">
        <button className="close" onClick={close}>×</button>

        {state.loading && <LoadingView />}
        {state.error && <ErrorView error={state.error} onRetry={state.reload} />}

        {u && (
          <>
            {/* ── Header ── */}
            <div className="ppHead">
              <CosmeticAvatarFrame frame={cos.frame} className="ppAvatarWrap">
                <img className="ppAvatar" alt="آواتار"
                  src={u.profile_image_url
                    ? asset(u.profile_image_url)
                    : avatarUrl(u.profile_avatar_key)} />
                {cos.club && u.profile_avatar_key !== `club:${cos.club}` && (
                  <img className="ppClub" src={clubImg(cos.club)}
                    alt="نشان باشگاه" width="30" height="30"
                    onError={e => { e.currentTarget.style.display = 'none'; }} />
                )}
              </CosmeticAvatarFrame>

              <div className="ppWho">
                <h2 style={nameColorStyle(cos.color)}>
                  {u.nickname || 'کاربر'}
                  {cos.plus && <span className="plusStarSm" title={cos.annual ? 'عضو پلاس سالانه' : 'عضو قلقلی پلاس'} style={{ color: cos.annual ? '#E9D5FF' : '#FFD166', marginInlineStart: '4px' }}>{cos.annual ? '✦' : '★'}</span>}
                </h2>
                {cos.title && <strong style={{ display:'inline-block', marginTop:'4px', fontSize:'9px', color:'#FFD166', border:'1px solid rgba(255,209,102,.38)', background:'rgba(0,0,0,.24)', padding:'2px 7px', borderRadius:'999px' }}>{cos.title}</strong>}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                  {cos.club && (
                    <span style={{ fontSize: '11px', color: '#ffd166', fontWeight: '700' }}>
                      هوادار باشگاه
                    </span>
                  )}
                  {cos.plus && (
                    <span style={{ fontSize: '10px', background: 'rgba(255,209,102,0.16)', color: '#ffd166', padding: '2px 6px', borderRadius: '6px', fontWeight: '800' }}>
                      عضو قلقلی پلاس
                    </span>
                  )}
                </div>
                <small style={{ marginTop: '4px', display: 'block' }}>
                  عضویت: {new Date(u.joined_at).toLocaleDateString('fa-IR')}
                </small>
              </div>
            </div>

            {/* ── Key Stats 4-Grid ── */}
            <div className="ppStats" style={{ gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', margin: '14px 0' }}>
              <div><b>{`رتبه ${fa(u.currentLeagueRank || u.bestRank || 1)}`}</b><span>رتبه لیگ این ماه</span></div>
              <div><b>{fa(u.lifetime_points)}</b><span>مجموع امتیازات کل</span></div>
              <div><b>{fa(u.totalPrizeAmount || 0)} تومان</b><span>جوایز نقدی کسب‌شده</span></div>
              <div><b>{fa((u.trophies?.length || 0) + (u.rewards?.length || 0))} جایزه</b><span>کل جوایز و تندیس‌ها</span></div>
            </div>

            {/* ── Tabs ── */}
            <div className="ppTabs">
              <button className={tab === 'prizes' ? 'on' : ''}
                onClick={() => setTab('prizes')}>
                جوایز ({fa((u.trophies?.length || 0) + (u.rewards?.length || 0))})
              </button>
              <button className={tab === 'cards' ? 'on' : ''}
                onClick={() => setTab('cards')}>
                کارت‌ها ({fa(u.cards?.length || 0)})
              </button>
              <button className={tab === 'league' ? 'on' : ''}
                onClick={() => setTab('league')}>
                لیگ ({fa(u.leagueHistory?.length || 0)})
              </button>
            </div>

            <div className="ppPane">
              {tab === 'prizes' && (
                (u.trophies?.length || u.rewards?.length) ? (
                  <div className="ppGrid">
                    {(u.trophies || []).map((t, i) => (
                      <div className="ppPrize" key={'t' + i}>
                        <img src={asset(t.image_url)
                          || avatarUrl('avatar_2_trophy.png')} alt={t.name}
                          loading="lazy" />
                        <b>{t.name}</b>
                        {t.status === 'pending' && <em>در انتظار</em>}
                      </div>
                    ))}
                    {(u.rewards || [])
                      .map((r, i) => (
                        <div className="ppPrize" key={'r' + i}>
                          <img src={asset(r.image_url)
                            || avatarUrl('avatar_2_trophy.png')} alt={r.name}
                            loading="lazy" />
                          <b>{r.name}</b>
                          <em>{r.reward_type === 'cash' ? 'نقدی' : 'تندیس'}</em>
                        </div>
                      ))}
                  </div>
                ) : <p className="hint">هنوز جایزه‌ای دریافت نکرده است.</p>
              )}

              {tab === 'cards' && (
                u.cards?.length ? (
                  <div className="ppGrid">
                    {u.cards.map(c => (
                      <div className="ppPrize" key={c.card_type_id}>
                        <img src={asset(c.image_url)
                          || avatarUrl('avatar_1_football.png')} alt={c.name}
                          loading="lazy" />
                        <b>{c.name}</b>
                        <em>{fa(c.registered_count)}× · {fa(c.point_value)} امتیاز</em>
                      </div>
                    ))}
                  </div>
                ) : <p className="hint">هنوز کارتی در کلکسیون ثبت نکرده است.</p>
              )}

              {tab === 'league' && (
                u.leagueHistory?.length ? (
                  <div className="ppLeague">
                    {u.leagueHistory.map((h, i) => (
                      <div className="ppLeagueRow" key={i}>
                        <span className="ppMedal">{medal(h.rank)}</span>
                        <span className="ppMonth">{h.monthYear}</span>
                        <span className="ppRank">رتبهٔ {fa(h.rank)}</span>
                        <span className="ppPts">{fa(h.points)} امتیاز</span>
                        {h.prizeAmount > 0 && (
                          <span className="ppPrizeTag">
                            {fa(h.prizeAmount)} تومان
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                ) : <p className="hint">هنوز در لیگی رتبه نگرفته است.</p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
