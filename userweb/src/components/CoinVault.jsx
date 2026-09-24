import React, { useCallback, useMemo, useState } from 'react';
import { req, fa } from '../lib/api.js';
import { useAsync } from '../lib/useAsync.js';
import { AsyncSection } from './states.jsx';
import { SvgIcon } from './IconAsset.jsx';
import { text, useLive } from '../lib/liveConfig.js';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * «صندوق سکه» — تبِ چهارمِ صفحهٔ لیگ
 * ═══════════════════════════════════════════════════════════════════════
 *
 * ── خواستهٔ مالک (۱۴۰۵/۰۷/۰۲) ────────────────────────────────────────
 *
 * «یه قسمت جدید به نام صندوق سکه… مجموع سکه موقت در لیگ جاری رو نشون
 *  می‌ده، و یه قسمت هم سکه بدست آمده که اون ۱۰ درصد سکه بعد پایان لیگ
 *  ذخیره بشه داخلش و دیگه به لیگ جدید منتقل نشه. این تب این امکان رو به
 *  کاربر می‌ده که خودش با انتخاب خودش سکه بدست اومده رو به هر لیگ در
 *  جریانی که خواست واریز کنه. و زیرش یک قسمت دریافت جوایز مخصوص سکه که
 *  فعلاً بزودی است.»
 *
 * ── چرا دو عدد و نه یکی ───────────────────────────────────────────────
 *
 * کاربر تا امروز فقط یک عددِ «سکه» می‌دید و نمی‌دانست کدامش با پایانِ
 * لیگ می‌سوزد. این تب همان یک عدد را به دو چیزِ متفاوت می‌شکند:
 *   • سکهٔ موقت  — رتبه می‌سازد، با پایانِ لیگ صفر می‌شود.
 *   • سکهٔ بدست‌آمده — نمی‌سوزد، ولی تا واریز نشود رتبه هم نمی‌سازد.
 * برچسبِ زیرِ هر عدد همین را می‌گوید، چون بدونِ آن دو عددِ بی‌توضیح
 * گیج‌کننده‌تر از یک عددِ مبهم است.
 *
 * تمام متن‌ها کلیدِ `vault.*` در قراردادِ متنِ زنده‌اند تا وب و اندروید
 * هرگز دو جمله نشان ندهند و مالک بتواند از پنل عوضشان کند.
 */

/** کارتِ یک عدد بزرگ + توضیحِ کوتاه. */
function VaultStat({ icon, tone, label, value, note }) {
  return (
    <div className="vaultStat" data-tone={tone}>
      <span className="vaultStatIcon" aria-hidden="true">
        <SvgIcon name={icon} size={22} />
      </span>
      <div className="vaultStatBody">
        <span className="vaultStatLabel">{label}</span>
        <b className="vaultStatValue">{fa(value)}</b>
        <span className="vaultStatNote">{note}</span>
      </div>
    </div>
  );
}

export default function CoinVault({ token, onChanged }) {
  const live = useLive();
  const pct = Number(live?.economy?.coinCarryoverPercent ?? 10);

  const load = useCallback(
    () => req('/api/coin-vault', 'GET', null, token), [token]);
  const state = useAsync(load, [load]);

  const [seasonId, setSeasonId] = useState('');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);

  const data = state.data;
  const vaultCoins = Number(data?.vaultCoins || 0);
  const leagues = useMemo(() => data?.activeLeagues || [], [data]);

  // لیگِ پیش‌فرض: اولینِ فهرست. بدونِ این، کاربر باید قبل از هر واریز یک
  // انتخابِ اضافه انجام دهد در حالی که معمولاً فقط یک لیگ در جریان است.
  const chosen = seasonId || leagues[0]?.seasonId || '';

  const submit = async (e) => {
    e?.preventDefault?.();
    setMsg(null);
    setErr(null);
    const want = Math.floor(Number(amount));
    if (!Number.isFinite(want) || want <= 0) {
      setErr('مبلغ واریز را بنویس.');
      return;
    }
    if (want > vaultCoins) {
      setErr('موجودی صندوق کافی نیست.');
      return;
    }
    setBusy(true);
    try {
      const r = await req('/api/coin-vault/deposit', 'POST',
        { seasonId: chosen, amount: want }, token);
      setMsg(text('vault.depositDone',
        `${fa(r.deposited)} سکه به ${r.seasonTitle} واریز شد`,
        { amount: r.deposited, league: r.seasonTitle }));
      setAmount('');
      state.reload?.();
      // جدولِ لیگ هم عوض شده — والد باید تازه‌اش کند وگرنه کاربر سکه را
      // در صندوق کم‌شده می‌بیند ولی در جدول پیدا نمی‌کند.
      onChanged?.();
    } catch (e2) {
      setErr(e2?.message || 'واریز انجام نشد.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AsyncSection state={state} loadingLabel="در حال بارگذاری صندوق..." keepStale>
      {() => (
        <div className="coinVault">
          <div className="vaultStats">
            <VaultStat
              icon="coins"
              tone="league"
              label={text('vault.leagueCoinsLabel', 'سکهٔ موقت در لیگ جاری')}
              value={Number(data?.leagueCoins || 0)}
              note={text('vault.leagueCoinsNote',
                'این سکه رتبهٔ تو را در لیگ می‌سازد و با پایانِ لیگ صفر می‌شود.')}
            />
            <VaultStat
              icon="shield"
              tone="vault"
              label={text('vault.earnedLabel', 'سکهٔ بدست آمده')}
              value={vaultCoins}
              note={text('vault.earnedNote',
                'سهمی که از لیگ‌های پایان‌یافته ذخیره شده. صفر نمی‌شود و هر وقت خواستی به لیگِ دلخواهت واریزش کن.')}
            />
          </div>

          {/* ── واریز ── */}
          <div className="vaultDeposit">
            <b className="vaultSectionTitle">
              {text('vault.depositTitle', 'واریز به لیگ')}
            </b>

            {vaultCoins <= 0 ? (
              <p className="vaultEmpty">
                {text('vault.empty',
                  `هنوز سکه‌ای در صندوق نداری. با پایانِ هر لیگ، ${fa(pct)}٪ سکه‌ات اینجا ذخیره می‌شود.`,
                  { percent: pct })}
              </p>
            ) : !leagues.length ? (
              <p className="vaultEmpty">
                {text('vault.noLeague',
                  'الان هیچ لیگی در جریان نیست. به‌محضِ شروعِ لیگِ بعدی می‌توانی واریز کنی.')}
              </p>
            ) : (
              <form onSubmit={submit}>
                <p className="vaultHint">
                  {text('vault.depositHint',
                    'لیگ را انتخاب کن و مبلغ را بنویس. بعد از واریز، سکه واردِ رتبه‌بندیِ همان لیگ می‌شود و برگشت ندارد.')}
                </p>
                <div className="vaultLeaguePick">
                  {leagues.map(l => (
                    <button
                      type="button"
                      key={l.seasonId}
                      className={chosen === l.seasonId ? 'on' : ''}
                      onClick={() => setSeasonId(l.seasonId)}
                    >
                      <b>{l.title}</b>
                      <small>سکهٔ تو: {fa(l.myCoins)}</small>
                    </button>
                  ))}
                </div>
                <div className="vaultAmountRow">
                  <input
                    type="number"
                    min="1"
                    max={vaultCoins}
                    inputMode="numeric"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    placeholder="مقدار سکه"
                    aria-label="مقدار سکه برای واریز"
                  />
                  <button type="button" className="ghost"
                    onClick={() => setAmount(String(vaultCoins))}>
                    {text('vault.depositAll', 'همه')}
                  </button>
                </div>
                <button type="submit" className="main" disabled={busy}>
                  {busy ? 'در حال واریز...' : text('vault.depositCta', 'واریز به این لیگ')}
                </button>
              </form>
            )}

            {msg && <p className="vaultOk" role="status">{msg}</p>}
            {err && <p className="vaultErr" role="alert">{err}</p>}
          </div>

          {/* ── جوایز مخصوص سکه — خواستهٔ مالک: فعلاً «بزودی» ── */}
          <div className="vaultSoon" aria-disabled="true">
            <div className="vaultSoonHead">
              <b>{text('vault.prizesTitle', 'دریافت جوایز مخصوص سکه')}</b>
              <span className="vaultSoonBadge">
                {text('vault.prizesSoon', 'بزودی')}
              </span>
            </div>
            <p>{text('vault.prizesNote',
              'به‌زودی می‌توانی سکه‌هایت را مستقیم با جوایزِ ویژه عوض کنی.')}</p>
          </div>
        </div>
      )}
    </AsyncSection>
  );
}
