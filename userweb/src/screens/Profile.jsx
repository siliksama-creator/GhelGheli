// Private profile + password change.
import React, { useCallback, useState } from 'react';

import { req, avatars, asset, avatarUrl, fa } from '../lib/api.js';
import { useAsync } from '../lib/useAsync.js';
import { clubImg } from '../components/Cosmetics.jsx';
import Field from '../components/Field.jsx';

export default function Profile({ token, p, load, setMsg }) {
  const u = p.user;
  const [edit, setEdit] = useState({
    firstName: u.first_name || '',
    lastName: u.last_name || '',
    nickname: u.nickname || '',
    age: u.age || '',
    city: u.city || '',
    province: u.province || '',
    bankAccount: u.bank_account || '',
    profileAvatarKey: u.profile_avatar_key || avatars[0],
  });
  // Club crests the user has joined can also be worn as an avatar. Fetched
  // separately so the profile still loads for anyone in no club.
  const loadClubs = useCallback(
    () => req('/api/clubs', 'GET', null, token).then(d => d.mine || []),
    [token]);
  const clubs = useAsync(loadClubs, [loadClubs]);

  const [pw, setPw] = useState({ currentPassword: '', newPassword: '' });
  const [pwMsg, setPwMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const [changingPw, setChangingPw] = useState(false);

  async function save() {
    // Without a busy flag a double-tap fires two PATCHes; the second can
    // land first and re-apply stale field values.
    if (saving) return;
    setSaving(true);
    try {
      await req('/api/profile', 'PATCH', edit, token);
      setMsg('پروفایل ذخیره شد');
      load();
    } catch (e) {
      setMsg(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function changePassword(e) {
    e.preventDefault();
    if (changingPw) return;
    setPwMsg('');
    setChangingPw(true);
    try {
      await req('/api/profile/change-password', 'POST', pw, token);
      setPwMsg('رمز عبور با موفقیت تغییر کرد');
      setPw({ currentPassword: '', newPassword: '' });
    } catch (err) {
      setPwMsg(err.message);
    } finally {
      setChangingPw(false);
    }
  }

  return (
    <>
      {/* Physical prizes won. Cash rewards land in the wallet; physical ones
          are only visible here, so the shelf is the user's record of them. */}
      <Trophies token={token} />
      <LeagueHistory token={token} />

      <section className="card wide">
      <h2>تکمیل پروفایل خصوصی</h2>
      <p className="hint">
        این اطلاعات فقط برای مدیر است. در چت فقط نام مستعار و عکس دیده می‌شود.
      </p>

      <div className="avatars">
        {avatars.map(a => (
          <img key={a} src={avatarUrl(a)} alt="آواتار"
            width="62" height="62"
            /* Ten avatars render at once. `async` decoding keeps them off the
               main thread, and the intrinsic size stops the grid reflowing as
               each one arrives. */
            loading="lazy" decoding="async"
            className={edit.profileAvatarKey === a ? 'sel' : ''}
            onClick={() => setEdit({ ...edit, profileAvatarKey: a })} />
        ))}

        {/* Crests sit in the same picker, not a separate one: to the user
            they are just more avatars, and splitting them would make
            switching back and forth feel like two different settings. */}
        {(clubs.data || []).map(c => (
          <img key={c.slug} src={clubImg(c.slug)} alt={c.name}
            width="62" height="62" loading="lazy" decoding="async"
            title={`نشان ${c.name}`}
            className={`clubAvatarPick${
              edit.profileAvatarKey === `club:${c.slug}` ? ' sel' : ''}`}
            onClick={() =>
              setEdit({ ...edit, profileAvatarKey: `club:${c.slug}` })} />
        ))}
      </div>
      {(clubs.data || []).length > 0 && (
        <p className="hint avatarNote">
          🛡️ نشان باشگاه‌هایی که عضوشان هستی هم می‌تواند عکس پروفایلت باشد.
        </p>
      )}

      <div className="formgrid">
        <Field label="نام" value={edit.firstName}
          onChange={v => setEdit({ ...edit, firstName: v })} />
        <Field label="نام خانوادگی" value={edit.lastName}
          onChange={v => setEdit({ ...edit, lastName: v })} />
        <Field label="نام مستعار عمومی" hint="این نام در چت و لیگ دیده می‌شود"
          value={edit.nickname}
          onChange={v => setEdit({ ...edit, nickname: v })} />
        <Field label="سن" type="number" inputMode="numeric" value={edit.age}
          onChange={v => setEdit({ ...edit, age: v })} />
        <Field label="استان" value={edit.province}
          onChange={v => setEdit({ ...edit, province: v })} />
        <Field label="شهر / محل زندگی" value={edit.city}
          onChange={v => setEdit({ ...edit, city: v })} />
        <Field label="شماره کارت بانکی / شبا" inputMode="numeric"
          value={edit.bankAccount}
          onChange={v => setEdit({ ...edit, bankAccount: v })} />
      </div>

      <button className="main" onClick={save} disabled={saving}>
        {saving ? 'در حال ذخیره...' : 'ذخیره پروفایل'}
      </button>

      <hr className="divider" />

      <h2>تغییر رمز عبور</h2>
      <p className="hint">
        چون فعلاً سامانه پیامک فعال نیست، بازیابی خودکار رمز در دسترس نیست؛ رمز
        را فقط از همینجا (با وارد کردن رمز فعلی) می‌توانید عوض کنید. اگر رمز را
        فراموش کرده‌اید، از پشتیبانی بخواهید رمز موقت برایتان تنظیم کند.
      </p>
      <form className="formgrid" onSubmit={changePassword}>
        <Field label="رمز فعلی" type="password" value={pw.currentPassword}
          onChange={v => setPw({ ...pw, currentPassword: v })} />
        <Field label="رمز جدید" hint="حداقل ۶ کاراکتر" type="password"
          value={pw.newPassword}
          onChange={v => setPw({ ...pw, newPassword: v })} />
        <button className="main" type="submit" disabled={changingPw}>
          {changingPw ? 'در حال تغییر...' : 'تغییر رمز عبور'}
        </button>
      </form>
      {pwMsg && <p className="msg">{pwMsg}</p>}
      </section>
    </>
  );
}

function LeagueHistory({ token }) {
  const load = useCallback(
    () => req('/api/profile/league-history', 'GET', null, token), [token]);
  const state = useAsync(load, [load]);
  const seasons = state.data?.seasons || [];
  // Decorative: never push an error above the profile form.
  if (state.loading || state.error || !seasons.length) return null;

  const medal = r => (r === 1 ? '🥇' : r === 2 ? '🥈' : r === 3 ? '🥉' : '🏅');

  return (
    <section className="card wide">
      <h2>سابقهٔ لیگ 🏆</h2>
      <p className="hint">
        امتیاز لیگ آخر هر ماه صفر می‌شود، ولی رتبه و جایزه‌ات اینجا می‌ماند.
      </p>
      <div className="lhList">
        {seasons.map(s2 => (
          <div className="lhRow" key={s2.monthYear + s2.rank}>
            <span className="lhMedal">{medal(s2.rank)}</span>
            <span className="lhMonth">{s2.monthYear}</span>
            <span className="lhRank">رتبهٔ {fa(s2.rank)}</span>
            <span className="lhPts">{fa(s2.points)} امتیاز</span>
            {s2.prizeAmount > 0 && (
              <span className="lhPrize">{fa(s2.prizeAmount)} تومان</span>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function Trophies({ token }) {
  const load = useCallback(
    () => req('/api/profile/trophies', 'GET', null, token), [token]);
  const state = useAsync(load, [load]);
  const list = state.data?.trophies || [];
  // Decorative: a failure must not push an error card above the profile form.
  if (state.loading || state.error || !list.length) return null;

  return (
    <section className="card wide trophyCard">
      <h2>جوایز دریافتی 🏆</h2>
      <div className="trophyShelf">
        {list.map(t => (
          <div className="trophy" key={t.id}>
            <img src={asset(t.image_url) || avatarUrl('avatar_2_trophy.png')}
              alt={t.name || 'جایزه'} />
            {t.status === 'pending' && <span className="trophyPending">در انتظار</span>}
            <b>{t.name || 'جایزه'}</b>
          </div>
        ))}
      </div>
    </section>
  );
}
