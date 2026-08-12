import React from 'react';
import './matchEffectVisual.css';

export const MATCH_EFFECT_PHASES = {
  stadium_spotlight: 'entry', colored_smoke: 'entry', card_side_fire: 'both',
  victory_confetti: 'finish', golden_cup: 'finish', tunnel_entry: 'entry',
  goal_celebration: 'finish', win_streak: 'finish', mvp_effect: 'finish',
  rematch_effect: 'both',
};

export function matchEffectSupports(slug, phase) {
  const configured = MATCH_EFFECT_PHASES[slug] || 'both';
  return configured === 'both' || configured === phase;
}

const labels = {
  stadium_spotlight: 'ورود با نورافکن', colored_smoke: 'دود رنگی',
  card_side_fire: 'آتش کنار کارت', victory_confetti: 'کاغذرنگی برد',
  golden_cup: 'جام طلایی', tunnel_entry: 'ورود از تونل',
  goal_celebration: 'جشن گل', win_streak: 'برد پیاپی',
  mvp_effect: 'ستاره مسابقه', rematch_effect: 'درخواست ریمچ',
};

function Cup() {
  return <svg className="fxCup" viewBox="0 0 90 110" aria-hidden="true"><path d="M18 8h54v31c0 26-11 42-27 42S18 65 18 39Z"/><path d="M18 20H5v11c0 19 10 30 27 33M72 20h13v11c0 19-10 30-27 33M45 81v17M28 102h34" fill="none" stroke="currentColor" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}

export default function MatchEffectVisual({ slug, mode = 'preview' }) {
  const type = String(slug || 'stadium_spotlight');
  return <div className={`cosFx cosFx-${type} cosFx-${mode}`} aria-label={labels[type] || 'افکت مسابقه'}>
    <div className="fxPitch"><i/><i/><b>VS</b></div>
    {type === 'stadium_spotlight' && <><span className="fxBeam one"/><span className="fxBeam two"/></>}
    {type === 'colored_smoke' && <div className="fxSmoke">{[0,1,2,3].map(i=><i key={i}/>)}</div>}
    {type === 'card_side_fire' && <div className="fxFire">{[0,1,2,3,4,5].map(i=><i key={i}/>)}</div>}
    {type === 'victory_confetti' && <div className="fxConfetti">{Array.from({length:14},(_,i)=><i key={i}/>)}</div>}
    {type === 'golden_cup' && <Cup/>}
    {type === 'tunnel_entry' && <div className="fxTunnel">{[0,1,2,3].map(i=><i key={i}/>)}</div>}
    {type === 'goal_celebration' && <div className="fxGoal"><span/><b>●</b></div>}
    {type === 'win_streak' && <div className="fxStreak">{['W1','W2','W3'].map(x=><i key={x}>{x}</i>)}</div>}
    {type === 'mvp_effect' && <div className="fxMvp"><i>★</i><b>MVP</b></div>}
    {type === 'rematch_effect' && <div className="fxRematch"><i>↻</i><b>دوباره؟</b></div>}
    <small>{labels[type] || 'افکت مسابقه'}</small>
  </div>;
}
