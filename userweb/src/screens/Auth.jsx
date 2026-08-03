// Sign in / quick registration.
import React, { useState } from 'react';

import { req, avatars } from '../lib/api.js';

const faNum = n => new Intl.NumberFormat('fa-IR').format(Number(n || 0));

export default function Auth({ mode, setMode, done }) {
  const [f, setF] = useState({
    mobile: '', password: '', nickname: '', currentPassword: '',
    referralCode: '',
  });
  const [msg, setMsg] = useState('');
  const [needsCurrentPassword, setNeedsCurrentPassword] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    // A double submit on registration produces a confusing "already
    // registered" error for what looks like the first attempt.
    if (busy) return;
    setMsg('');
    setBusy(true);
    try {
      const d = mode === 'register'
        ? await req('/api/auth/register-password', 'POST', {
            mobile: f.mobile,
            password: f.password,
            nickname: f.nickname || undefined,
            referralCode: f.referralCode || undefined,
            profileAvatarKey: avatars[0],
            ...(needsCurrentPassword ? { currentPassword: f.currentPassword } : {}),
          })
        : await req('/api/auth/login', 'POST',
            { mobile: f.mobile, password: f.password });
      // اگر کد دعوت گرفت، قبل از ورود بگو چه چیزی برنده شد. یک «ثبت شد»
      // خالی، جایزه را نامرئی می‌کند.
      if (d.referralApplied) {
        setMsg(`🎉 ${faNum(d.referralSpins)} چرخش گردونه گرفتی!`);
      }
      done(d.token);
    } catch (x) {
      setMsg(x.message);
      if (mode === 'register' && x.status === 409) setNeedsCurrentPassword(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card auth" onSubmit={submit}>
      <h2>{mode === 'register' ? 'ثبت‌نام سریع' : 'ورود کاربر'}</h2>

      <div className="tabs">
        <button type="button" className={mode === 'login' ? 'on' : ''}
          onClick={() => setMode('login')}>ورود</button>
        <button type="button" className={mode === 'register' ? 'on' : ''}
          onClick={() => setMode('register')}>ثبت‌نام</button>
      </div>

      <input placeholder="شماره موبایل" value={f.mobile} inputMode="tel"
        autoComplete="username"
        onChange={e => setF({ ...f, mobile: e.target.value })} />
      <input placeholder="رمز عبور" type="password" value={f.password}
        autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
        onChange={e => setF({ ...f, password: e.target.value })} />

      {mode === 'register' && (
        <>
          <input placeholder="نام مستعار اختیاری" value={f.nickname}
            onChange={e => setF({ ...f, nickname: e.target.value })} />

          {/* کد دعوت. inputMode=numeric کیبورد عددی موبایل را باز می‌کند،
              و maxLength=4 جلوی تایپ اضافه را می‌گیرد. ارقام فارسی هم
              پذیرفته می‌شوند — سرور نرمال‌سازی می‌کند. */}
          <input
            className="refInput"
            placeholder="کد دعوت دوستت (اختیاری)"
            value={f.referralCode}
            inputMode="numeric"
            maxLength={4}
            dir="ltr"
            onChange={e => setF({ ...f, referralCode: e.target.value })} />
          <p className="hint refPromo">
            🎁 اگر کد دعوت یکی از دوستانت را وارد کنی،
            {' '}<b>هر دوی شما ۳ چرخش گردونهٔ شانس</b> می‌گیرید.
          </p>
          <p className="hint">
            ثبت‌نام سریع است؛ بعد از ورود از بخش پروفایل، اطلاعات کامل را وارد
            می‌کنی. چون پیامک هنوز فعال نیست، اگر قبلاً با این شماره ثبت‌نام
            کرده‌ای رمز فعلی را هم وارد کن.
          </p>
          {needsCurrentPassword && (
            <input placeholder="رمز فعلی این شماره" type="password"
              value={f.currentPassword}
              onChange={e => setF({ ...f, currentPassword: e.target.value })} />
          )}
        </>
      )}

      <button className="main" disabled={busy}>
        {busy ? '...' : mode === 'register' ? 'ثبت‌نام سریع' : 'ورود'}
      </button>
      {msg && <p className="msg">{msg}</p>}
    </form>
  );
}
