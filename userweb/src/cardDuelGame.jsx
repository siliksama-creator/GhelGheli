import React, { useEffect, useMemo, useState } from 'react';
import { asset, fa, req } from './lib/api.js';

const idOf = c => String(c?.cardTypeId || c?.id || '');
const n = v => Number(v || 0);
const rarityColor = r => ({
  legend: '#FF7A45', premium: '#FFD166', gold: '#F7C948',
  silver: '#C7D2FE', normal: '#22E7A6',
}[r] || '#22E7A6');

function MiniStat({ label, value }) {
  return <span className="duelMini">{label} {fa(value)}</span>;
}

function DuelCard({ card, selected, onClick }) {
  const color = rarityColor(card.rarity);
  return (
    <button type="button" className={`duelCard${selected ? ' selected' : ''}`}
      style={{ '--duel-rarity': color }} onClick={onClick}>
      <div className="duelArt">
        {card.imageUrl
          ? <img src={asset(card.imageUrl)} alt={card.name || 'کارت'} loading="lazy" decoding="async" />
          : <span>🃏</span>}
        {selected && <i className="duelPicked">✓</i>}
      </div>
      <b>{card.name || 'کارت'}</b>
      <div className="duelMeta">
        <span style={{ color }}>{card.rarityLabel || card.rarity}</span>
        <strong style={{ color }}>P {fa(card.power)}</strong>
      </div>
      <div className="duelStats">
        <MiniStat label="ح" value={card.attack} />
        <MiniStat label="د" value={card.defense} />
        <MiniStat label="س" value={card.speed} />
        <MiniStat label="ت" value={card.technique} />
        <MiniStat label="گل" value={card.goalChance} />
      </div>
    </button>
  );
}

function Lineup({ selected, cards, toggle }) {
  const byId = useMemo(() => new Map(cards.map(c => [idOf(c), c])), [cards]);
  return (
    <div className="duelLineup card">
      {[0, 1, 2].map(i => {
        const id = selected[i];
        const c = id ? byId.get(id) : null;
        return (
          <button type="button" className="duelSlot" key={i}
            onClick={() => c && toggle(id)}>
            {c ? <>
              {c.imageUrl
                ? <img src={asset(c.imageUrl)} alt="" loading="lazy" decoding="async" />
                : <span>🃏</span>}
              <b>{c.name}</b>
            </> : <span>کارت {fa(i + 1)}</span>}
          </button>
        );
      })}
    </div>
  );
}

function BattleResult({ data }) {
  const r = data?.result || {};
  const won = r.winnerSide === 'user';
  const draw = r.winnerSide === 'draw';
  return (
    <section className="duelResult card">
      <div className="duelResultHead">
        <img src="/games/card_duel_glow.png" alt="" width="48" height="48" />
        <div>
          <h3>{draw ? 'مساوی سینمایی' : won ? 'برد قلقلی!' : 'این بار حریف برد'}</h3>
          <small>{r.opponentName || 'حریف'}</small>
        </div>
        <strong>{fa(r.userScore)} - {fa(r.opponentScore)}</strong>
      </div>
      <div className="duelRounds">
        {(r.rounds || []).map(round => (
          <div className="duelRound" key={round.round}>
            <i>{fa(round.round)}</i>
            <div>
              <b>{round.title} — {round.cinematic}</b>
              <small>{round.userCard?.name || 'کارت'} در برابر {round.opponentCard?.name || 'حریف'}</small>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function History({ battles }) {
  return (
    <section>
      <h3 className="duelSectionTitle">نتایج اخیر</h3>
      <div className="duelHistory">
        {(battles || []).slice(0, 6).map(b => {
          const delta = n(b.userDelta);
          return (
            <div className="duelHistoryRow card" key={b.id}>
              <span className={delta > 0 ? 'up' : delta < 0 ? 'down' : ''}>
                {delta > 0 ? '↗' : delta < 0 ? '↘' : '—'}
              </span>
              <b>{b.mode} · {fa(b.userScore)}-{fa(b.opponentScore)}</b>
              <strong className={delta >= 0 ? 'up' : 'down'}>
                {delta > 0 ? `+${fa(delta)}` : fa(delta)}
              </strong>
            </div>
          );
        })}
        {!(battles || []).length && <div className="muted center">هنوز دوئلی ثبت نشده است.</div>}
      </div>
    </section>
  );
}

export default function CardDuelWeb({ token, onBack }) {
  const [data, setData] = useState(null);
  const [selected, setSelected] = useState([]);
  const [last, setLast] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const cards = data?.playableCards || [];
  const load = async () => {
    setLoading(true);
    try {
      const d = await req('/api/card-duel', 'GET', null, token);
      setData(d);
      const deck = d?.activeDeck?.cards || [];
      setSelected(deck.map(idOf).filter(Boolean).slice(0, 3));
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, [token]);

  const toggle = id => setSelected(prev => prev.includes(id)
    ? prev.filter(x => x !== id)
    : prev.length < 3 ? [...prev, id] : prev);

  const run = async (path, body = {}, refresh = false) => {
    if (busy) return;
    setBusy(true); setMsg(''); setError('');
    try {
      const r = await req(path, 'POST', body, token);
      setLast(r);
      setMsg(r.message || 'انجام شد');
      if (refresh) await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="card pad center">در حال بارگذاری دوئل کارت‌ها…</div>;
  if (error && !data) return <div className="card pad center"><div className="err">{error}</div><button onClick={load}>تلاش دوباره</button></div>;

  const active = data?.activeDeck;
  return (
    <div className="duelPage">
      <header className="duelHero">
        <button type="button" className="ghost" onClick={onBack}>← بازگشت</button>
        <img src="/games/card_duel_glow.png" alt="" width="72" height="72" />
        <div>
          <h2>دوئل ۳ کارتی</h2>
          <p>تیم Ghost آماده کن؛ روزی ۱۰ نبرد خودکار. بات فقط تمرین است.</p>
          <div className="duelChips">
            <span>باقی امروز: {fa(data?.autoLeft)}</span>
            <span>استیک: {fa(data?.stakePoints)}</span>
          </div>
        </div>
      </header>

      {active && (
        <div className="duelGhostStatus card">
          <span>{active.ghost_enabled ? '🛡️' : '⏸️'}</span>
          <b>{active.ghost_enabled
            ? `تیم Ghost فعال است؛ ${fa(data.autoLeft)} نبرد خودکار دیگر امروز می‌ماند.`
            : 'تیم ذخیره شده ولی Ghost غیرفعال است.'}</b>
        </div>
      )}

      <Lineup selected={selected} cards={cards} toggle={toggle} />
      <div className="duelActions">
        <button className="main" disabled={busy || selected.length !== 3}
          onClick={() => run('/api/card-duel/deck', { cardTypeIds: selected, ghostEnabled: true }, true)}>
          آماده Ghost
        </button>
        <button disabled={busy || selected.length !== 3}
          onClick={() => run('/api/card-duel/bot', { cardTypeIds: selected })}>
          بات تمرینی
        </button>
        <button className="main" disabled={busy || !active}
          onClick={() => run('/api/card-duel/ghost', {}, true)}>
          {busy ? 'در حال دوئل…' : 'دوئل Ghost دستی'}
        </button>
      </div>
      {msg && <div className="ok duelMessage">{msg}</div>}
      {error && <div className="err duelMessage">{error}</div>}

      <h3 className="duelSectionTitle">کارت‌های قابل بازی</h3>
      {cards.length < 3 ? (
        <div className="card pad center muted">برای دوئل حداقل سه کارت در کلکسیون لازم است.</div>
      ) : (
        <div className="duelGrid">
          {cards.map(c => <DuelCard key={idOf(c)} card={c}
            selected={selected.includes(idOf(c))} onClick={() => toggle(idOf(c))} />)}
        </div>
      )}

      {last && <BattleResult data={last} />}
      <History battles={data?.recentBattles || []} />
    </div>
  );
}
