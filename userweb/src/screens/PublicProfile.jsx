// Another player's comprehensive profile, opened from chat, the league table or a game.
import React, { useCallback, useEffect, useState } from 'react';

import { req, fa, avatarUrl } from '../lib/api.js';
import { primeImageCache } from '../lib/imageCache.js';
import CachedImg from '../components/CachedImg.jsx';
import PlayerCard from '../components/PlayerCard.jsx';
import { clubImg, CosmeticAvatarFrame, DisplayName, profileBackgroundClass, profileBackgroundStyle } from '../components/Cosmetics.jsx';
import { useAsync } from '../lib/useAsync.js';
import { LoadingView, ErrorView } from '../components/states.jsx';
import { SvgIcon } from '../components/IconAsset.jsx';
import CoinChip from '../components/CoinChip.jsx';

const medal = r => (r === 1 ? 'medal1' : r === 2 ? 'medal2' : r === 3 ? 'medal3' : '');

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
  // ── آمارِ تازهٔ جوایز (۴ مهر ۱۴۰۵) ──────────────────────────────────────
  //
  // همهٔ این عددها از سرور می‌آید. عمداً هیچ‌کدام در کلاینت جمع نمی‌شود:
  // `leagueHistory` فقط ۲۴ فصلِ آخر است، پس جمع‌زدنِ آن روی کلاینت عددی
  // کمتر از واقعیت می‌داد — همان باگی که برای کاربرِ قدیمی «۳ برد» را
  // «۱ برد» نشان می‌داد.
  const leagueSeasons = Number(u?.leagueSeasons || 0);
  const leagueWins = Number(u?.leagueWins || 0);
  const leaguePodiums = Number(u?.leaguePodiums || 0);
  const lifetimePrizes = Number(u?.lifetimeLeaguePrizes || 0);
  const ref = u?.referral || {};
  const refInvited = Number(ref.invited || 0);
  const refPoints = Number(ref.earnedPoints || 0);
  const refCash = Number(ref.earnedCash || 0);

  useEffect(() => {
    if (!u) return;
    primeImageCache(u).catch(() => {});
  }, [u]);

  return (
    <div className="modalShade" onClick={close}>
      <div className={`publicModal pp ${profileBackgroundClass(cos.profileBackground)}`} onClick={e => e.stopPropagation()}
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
                {u.profile_image_url
                  ? <CachedImg className="ppAvatar" alt="آواتار" src={u.profile_image_url} />
                  : <img className="ppAvatar" alt="آواتار" src={avatarUrl(u.profile_avatar_key)} />}
                {cos.club && u.profile_avatar_key !== `club:${cos.club}` && (
                  <img className="ppClub" src={clubImg(cos.club)}
                    alt="نشان باشگاه" width="30" height="30"
                    onError={e => { e.currentTarget.style.display = 'none'; }} />
                )}
              </CosmeticAvatarFrame>

              <div className="ppWho">
                <h2><DisplayName name={u.nickname || 'کاربر'} cosmetics={cos}
                  level={u.level?.level ?? u.level} /></h2>
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
              {/* رتبه با «سکه» تعیین می‌شود، نه امتیاز — پس همان عددی که
                  رتبه را می‌سازد باید کنارش دیده شود، وگرنه کاربر رتبه‌اش را
                  با مجموعِ امتیازش مقایسه می‌کند و به تناقض می‌رسد. */}
              <div>
                <b>{`رتبه ${fa(u.currentLeagueRank || u.bestRank || 1)}`}</b>
                <span style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:'4px' }}>
                  <CoinChip value={u.coins} size={19} /> سکه فصل
                </span>
              </div>
              <div><b>{fa(u.lifetime_points)}</b><span>مجموع امتیازات کل</span></div>
              <div><b>{fa(u.totalPrizeAmount || 0)} تومان</b><span>جوایز نقدی کسب‌شده</span></div>
              <div><b>{fa((u.trophies?.length || 0) + (u.rewards?.length || 0))} جایزه</b><span>کل جوایز و تندیس‌ها</span></div>
              {/* ── بردهای لیگ و کمیسیونِ دعوت (خواستهٔ مالک، ۴ مهر ۱۴۰۵) ──
                  «تمامی جوایز از جمله میزان برد در لیگ و میزان کمسیون از
                  دعوت از دوستان باید برای کاربر های مختلف دیده بشه.» */}
              <div>
                <b>{leagueWins > 0 ? `${fa(leagueWins)} قهرمانی` : 'بدون قهرمانی'}</b>
                <span>
                  {leagueSeasons > 0
                    ? `از ${fa(leagueSeasons)} فصل لیگ (${fa(leaguePodiums)} سکوی سه‌نما)`
                    : 'هنوز فصلِ کاملی نداشته'}
                </span>
              </div>
              <div>
                <b>{fa(lifetimePrizes)} تومان</b>
                <span>مجموع جایزهٔ لیگ در تمام فصل‌ها</span>
              </div>
              <div>
                <b>{fa(refInvited)} نفر</b>
                <span>
                  {ref.rankAllTime
                    ? `دعوت‌شده · رتبهٔ ${fa(ref.rankAllTime)} معرف‌ها`
                    : 'دعوت‌شده با کد اختصاصی'}
                </span>
              </div>
              <div>
                <b>
                  {refPoints > 0 || refCash > 0
                    ? `${fa(refPoints)} امتیاز + ${fa(refCash)} تومان`
                    : 'بدون کمیسیون'}
                </b>
                <span>کمیسیون از دعوت دوستان</span>
              </div>
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
                        {t.image_url
                          ? <CachedImg src={t.image_url} alt={t.name} loading="lazy" />
                          : <img src={avatarUrl('avatar_2_trophy.png')} alt={t.name} loading="lazy" />}
                        <b>{t.name}</b>
                        {t.status === 'pending' && <em>در انتظار</em>}
                      </div>
                    ))}
                    {(u.rewards || [])
                      .map((r, i) => (
                        <div className="ppPrize" key={'r' + i}>
                          {r.image_url
                            ? <CachedImg src={r.image_url} alt={r.name} loading="lazy" />
                            : <img src={avatarUrl('avatar_2_trophy.png')} alt={r.name} loading="lazy" />}
                          <b>{r.name}</b>
                          <em>{r.reward_type === 'cash' ? 'نقدی' : 'تندیس'}</em>
                        </div>
                      ))}
                  </div>
                ) : <p className="hint">هنوز جایزه‌ای دریافت نکرده است.</p>
              )}

              {tab === 'cards' && (
                u.cards?.length ? (
                  <div className="ppCardsGrid">
                    {u.cards.map(c => (
                      <PlayerCard
                        key={c.card_type_id}
                        item={{ ...c, quantity: c.registered_count }}
                        compact
                        showStats={false}
                      />
                    ))}
                  </div>
                ) : <p className="hint">هنوز کارتی در کلکسیون ثبت نکرده است.</p>
              )}

              {tab === 'league' && (
                u.leagueHistory?.length ? (
                  <div className="ppLeague">
                    {/* عددِ کاملِ عمرِ حساب، بالای جدولِ ۲۴ فصلِ آخر — وگرنه
                        کاربرِ قدیمی فکر می‌کند فقط همین ۲۴ فصل را بازی کرده. */}
                    {(leagueSeasons > 0 || lifetimePrizes > 0) && (
                      <div style={{ display:'flex', flexWrap:'wrap', gap:'6px', marginBottom:'8px' }}>
                        <span className="ppPrizeTag">شرکت در {fa(leagueSeasons)} فصل</span>
                        <span className="ppPrizeTag">{fa(leagueWins)} قهرمانی</span>
                        <span className="ppPrizeTag">{fa(leaguePodiums)} سکوی سه‌نما</span>
                        {lifetimePrizes > 0 && (
                          <span className="ppPrizeTag">
                            مجموع جایزه: {fa(lifetimePrizes)} تومان
                          </span>
                        )}
                      </div>
                    )}
                    {u.leagueHistory.map((h, i) => (
                      <div className="ppLeagueRow" key={i}>
                        {medal(h.rank) && <span className="ppMedal"><SvgIcon name={medal(h.rank)} size={15} /></span>}
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
