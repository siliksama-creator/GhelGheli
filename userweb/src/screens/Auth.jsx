// Sign in / quick registration with 2028 Next-Gen aesthetic.
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

  function normalizeDigits(str) {
    return String(str || '')
      .replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
      .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
  }

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    setMsg('');
    const cleanMobile = normalizeDigits(f.mobile).trim();
    if (!cleanMobile) {
      return setMsg('شماره موبایل را وارد کنید');
    }
    if (!f.password) {
      return setMsg('رمز عبور را وارد کنید');
    }
    setBusy(true);
    try {
      const d = mode === 'register'
        ? await req('/api/auth/register-password', 'POST', {
            mobile: cleanMobile,
            password: f.password,
            nickname: f.nickname.trim() || undefined,
            referralCode: f.referralCode.trim() || undefined,
            profileAvatarKey: avatars[0],
            ...(needsCurrentPassword ? { currentPassword: f.currentPassword } : {}),
          })
        : await req('/api/auth/login', 'POST', { mobile: cleanMobile, password: f.password });

      if (d.referralApplied) {
        setMsg(`🎉 ${faNum(d.referralSpins)} چرخش گردونه پاداش گرفتی!`);
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
    <div style={{ maxWidth: 420, margin: '0 auto', padding: '16px' }}>
      <form className="card auth" onSubmit={submit} style={{
        borderRadius: 24,
        background: 'linear-gradient(145deg, #132238, #0A1424)',
        border: '1.5px solid rgba(0, 212, 154, 0.25)',
        boxShadow: '0 16px 36px rgba(0, 0, 0, 0.45), 0 0 20px rgba(0, 212, 154, 0.12)',
        padding: '24px 20px'
      }}>
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <h2 style={{ fontSize: 22, fontWeight: 900, color: '#FFFFFF', margin: 0 }}>
            {mode === 'register' ? 'ثبت‌نام در قلقلی ⚽' : 'ورود به حساب قلقلی 🚀'}
          </h2>
          <p style={{ color: '#94A3B8', fontSize: 12.5, marginTop: 4 }}>
            {mode === 'register' ? 'کارت‌ها را ثبت کن، بازی کن و جایزه ببر' : 'به دنیای هیجان و فوتبال خوش آمدید'}
          </p>
        </div>

        <div className="tabs" style={{
          background: 'rgba(0, 0, 0, 0.35)',
          borderRadius: 14,
          padding: 4,
          display: 'flex',
          marginBottom: 18,
          border: '1px solid rgba(255, 255, 255, 0.08)'
        }}>
          <button type="button" style={{
            flex: 1,
            padding: '10px',
            borderRadius: 10,
            border: 'none',
            cursor: 'pointer',
            fontWeight: 800,
            fontSize: 13.5,
            transition: 'all 0.2s',
            background: mode === 'login' ? '#00D49A' : 'transparent',
            color: mode === 'login' ? '#00281D' : '#CBD5E1'
          }} onClick={() => { setMode('login'); setMsg(''); }}>ورود</button>
          <button type="button" style={{
            flex: 1,
            padding: '10px',
            borderRadius: 10,
            border: 'none',
            cursor: 'pointer',
            fontWeight: 800,
            fontSize: 13.5,
            transition: 'all 0.2s',
            background: mode === 'register' ? '#00D49A' : 'transparent',
            color: mode === 'register' ? '#00281D' : '#CBD5E1'
          }} onClick={() => { setMode('register'); setMsg(''); }}>ثبت‌نام</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input
            placeholder="شماره موبایل (مثلاً ۰۹۱۲۳۴۵۶۷۸۹)"
            value={f.mobile}
            inputMode="tel"
            autoComplete="username"
            style={{ borderRadius: 12, padding: '12px 14px', fontSize: 14 }}
            onChange={e => setF({ ...f, mobile: e.target.value })}
          />
          <input
            placeholder="رمز عبور"
            type="password"
            value={f.password}
            autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
            style={{ borderRadius: 12, padding: '12px 14px', fontSize: 14 }}
            onChange={e => setF({ ...f, password: e.target.value })}
          />

          {mode === 'register' && (
            <>
              <input
                placeholder="نام مستعار در بازی (اختیاری)"
                value={f.nickname}
                style={{ borderRadius: 12, padding: '12px 14px', fontSize: 14 }}
                onChange={e => setF({ ...f, nickname: e.target.value })}
              />
              <input
                placeholder="کد معرف دوست (اختیاری — جایزه چرخش)"
                value={f.referralCode}
                style={{ borderRadius: 12, padding: '12px 14px', fontSize: 14 }}
                onChange={e => setF({ ...f, referralCode: e.target.value })}
              />
              {needsCurrentPassword && (
                <input
                  placeholder="رمز عبور قبلی برای ثبت مجدد"
                  type="password"
                  value={f.currentPassword}
                  style={{ borderRadius: 12, padding: '12px 14px', fontSize: 14 }}
                  onChange={e => setF({ ...f, currentPassword: e.target.value })}
                />
              )}
            </>
          )}

          {msg && (
            <div style={{
              padding: '10px 12px',
              borderRadius: 10,
              background: msg.includes('چرخش') ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
              border: `1px solid ${msg.includes('چرخش') ? '#22C55E' : '#EF4444'}`,
              color: msg.includes('چرخش') ? '#22C55E' : '#EF4444',
              fontSize: 12.5,
              fontWeight: 700,
              textAlign: 'center'
            }}>
              {msg}
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            style={{
              marginTop: 6,
              height: 50,
              borderRadius: 14,
              border: 'none',
              background: 'linear-gradient(90deg, #00D49A, #1C78FF)',
              color: '#FFFFFF',
              fontSize: 15.5,
              fontWeight: 900,
              cursor: 'pointer',
              boxShadow: '0 8px 20px rgba(0, 212, 154, 0.35)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8
            }}
          >
            {busy ? 'در حال ارتباط با سرور...' : (mode === 'register' ? 'تکمیل ثبت‌نام و ورود' : 'ورود به حساب کاربری')}
          </button>
        </div>
      </form>
    </div>
  );
}
