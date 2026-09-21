// ورود و ثبت‌نامِ جدا (قراردادِ ۳۰ مهر).
// ورود: تا پیامک خاموش است فقط رمزِ مدیر؛ با آمدنِ پیامک خودبه‌خود کد OTP.
// ثبت‌نام: شماره + نام مستعارِ اجباری + کد معرف + کد OTP.
import React, { useState, useEffect } from 'react';
import { req, avatars } from '../lib/api.js';

const faNum = n => new Intl.NumberFormat('fa-IR').format(Number(n || 0));

const inputStyle = { borderRadius: 12, padding: '12px 14px', fontSize: 14 };

export default function Auth({ done }) {
  const [tab, setTab] = useState('login'); // 'login' | 'register'
  const [step, setStep] = useState('mobile'); // 'mobile' | 'code'
  const [smsEnabled, setSmsEnabled] = useState(false);
  const [f, setF] = useState({ mobile: '', code: '', nickname: '', referralCode: '' });
  const [admin, setAdmin] = useState({ mobile: '', password: '' });
  const [msg, setMsg] = useState('');
  const [msgOk, setMsgOk] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    req('/api/config').then(d => setSmsEnabled(Boolean(d.smsEnabled))).catch(() => {});
  }, []);

  function normalizeDigits(str) {
    return String(str || '')
      .replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
      .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
  }
  const cleanMobile = () => normalizeDigits(f.mobile).trim();
  function say(text, ok = false) { setMsg(text); setMsgOk(ok); }
  function switchTab(next) { setTab(next); setStep('mobile'); setMsg(''); }

  async function requestCode(purpose) {
    if (busy) return;
    setMsg('');
    if (!cleanMobile()) return say('شماره موبایل را وارد کنید');
    if (purpose === 'register' && !f.nickname.trim()) return say('نام مستعار الزامی است');
    setBusy(true);
    try {
      const d = await req('/api/auth/request-otp', 'POST', { mobile: cleanMobile(), purpose });
      if (d.smsDisabled) {
        say('سامانهٔ پیامک هنوز فعال نشده است؛ ورود و عضویت با کد به‌زودی فعال می‌شود.');
      } else {
        setStep('code');
        say(d.devCode ? `کد آزمایشی شما: ${d.devCode}` : 'کد تایید به شماره‌تان ارسال شد', true);
      }
    } catch (x) {
      say(x.message);
    } finally {
      setBusy(false);
    }
  }

  async function submitLoginOtp(e) {
    e?.preventDefault();
    if (busy) return;
    setMsg('');
    const code = normalizeDigits(f.code).trim();
    if (!code) return say('کد تایید را وارد کنید');
    setBusy(true);
    try {
      await req('/api/auth/verify-otp', 'POST', { mobile: cleanMobile(), code, purpose: 'login' });
      const d = await req('/api/auth/login-otp', 'POST', { mobile: cleanMobile() });
      done(d.token);
    } catch (x) {
      say(x.message);
    } finally {
      setBusy(false);
    }
  }

  async function submitRegisterOtp(e) {
    e?.preventDefault();
    if (busy) return;
    setMsg('');
    const code = normalizeDigits(f.code).trim();
    if (!code) return say('کد تایید را وارد کنید');
    setBusy(true);
    try {
      await req('/api/auth/verify-otp', 'POST', { mobile: cleanMobile(), code, purpose: 'register' });
      const d = await req('/api/auth/register', 'POST', {
        mobile: cleanMobile(),
        nickname: f.nickname.trim(),
        referralCode: f.referralCode.trim() || undefined,
        profileAvatarKey: avatars[0],
      });
      if (d.referralApplied) say(`${faNum(d.referralSpins)} چرخش گردونه پاداش گرفتی!`, true);
      done(d.token);
    } catch (x) {
      say(x.message);
    } finally {
      setBusy(false);
    }
  }

  async function adminLogin(e) {
    e?.preventDefault();
    if (busy) return;
    setMsg('');
    if (!admin.mobile || !admin.password) return say('نام کاربری و رمز مدیر را وارد کنید');
    setBusy(true);
    try {
      const d = await req('/api/auth/login', 'POST', {
        mobile: normalizeDigits(admin.mobile).trim(),
        password: admin.password,
      });
      done(d.token);
    } catch (x) {
      say(x.message);
    } finally {
      setBusy(false);
    }
  }

  const loginOtp = tab === 'login' && smsEnabled;
  const onSubmit = tab === 'register'
    ? (step === 'code' ? submitRegisterOtp : e => { e.preventDefault(); requestCode('register'); })
    : (loginOtp
      ? (step === 'code' ? submitLoginOtp : e => { e.preventDefault(); requestCode('login'); })
      : adminLogin);

  return (
    <div style={{ maxWidth: 420, margin: '0 auto', padding: '16px' }}>
      <form className="card auth" onSubmit={onSubmit} style={{
        borderRadius: 24,
        background: 'linear-gradient(145deg, #132238, #0A1424)',
        border: '1.5px solid rgba(0, 212, 154, 0.25)',
        boxShadow: '0 16px 36px rgba(0, 0, 0, 0.45), 0 0 20px rgba(0, 212, 154, 0.12)',
        padding: '24px 20px'
      }}>
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: '#FFFFFF', margin: 0 }}>
            {tab === 'register'
              ? (step === 'code' ? 'کد تایید را وارد کن' : 'ثبت‌نام در قلقلی')
              : (loginOtp ? (step === 'code' ? 'کد تایید را وارد کن' : 'ورود به قلقلی') : 'ورود مدیر')}
          </h2>
          <p style={{ color: '#94A3B8', fontSize: 13, marginTop: 4 }}>
            {tab === 'register'
              ? 'شماره + نام مستعار + کد معرف؛ بدون رمز عبور'
              : (loginOtp
                ? (step === 'code' ? `کد به شمارهٔ ${cleanMobile()} ارسال شد` : 'فقط شماره موبایل و کد یک‌بارمصرف')
                : 'تا فعال‌شدن پیامک، ورود کاربران با کد غیرفعال است')}
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
            flex: 1, padding: '10px', borderRadius: 10, border: 'none', cursor: 'pointer',
            fontWeight: 800, fontSize: 13.5, transition: 'all 0.2s',
            background: tab === 'login' ? '#00D49A' : 'transparent',
            color: tab === 'login' ? '#00281D' : '#CBD5E1'
          }} onClick={() => switchTab('login')}>ورود</button>
          <button type="button" style={{
            flex: 1, padding: '10px', borderRadius: 10, border: 'none', cursor: 'pointer',
            fontWeight: 800, fontSize: 13.5, transition: 'all 0.2s',
            background: tab === 'register' ? '#00D49A' : 'transparent',
            color: tab === 'register' ? '#00281D' : '#CBD5E1'
          }} onClick={() => switchTab('register')}>ثبت‌نام</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {tab === 'register' ? (
            step === 'mobile' ? (
              <>
                <input placeholder="شماره موبایل (مثلاً ۰۹۱۲۳۴۵۶۷۸۹)" value={f.mobile}
                  inputMode="tel" autoComplete="username" style={inputStyle}
                  onChange={e => setF({ ...f, mobile: e.target.value })} />
                <input placeholder="نام مستعار (اجباری — حرف فارسی/انگلیسی یا عدد)" value={f.nickname}
                  maxLength={8} style={inputStyle}
                  onChange={e => setF({ ...f, nickname: e.target.value })} />
                <input placeholder="کد معرف دوست (اختیاری — جایزه چرخش)" value={f.referralCode}
                  style={inputStyle}
                  onChange={e => setF({ ...f, referralCode: e.target.value })} />
              </>
            ) : (
              <CodeInputs f={f} setF={setF} onBack={() => { setStep('mobile'); setMsg(''); }}
                onResend={() => requestCode('register')} />
            )
          ) : (loginOtp ? (
            step === 'mobile' ? (
              <input placeholder="شماره موبایل" value={f.mobile}
                inputMode="tel" autoComplete="username" style={inputStyle}
                onChange={e => setF({ ...f, mobile: e.target.value })} />
            ) : (
              <CodeInputs f={f} setF={setF} onBack={() => { setStep('mobile'); setMsg(''); }}
                onResend={() => requestCode('login')} />
            )
          ) : (
            <>
              <input placeholder="نام کاربری / شماره مدیر" value={admin.mobile}
                autoComplete="username" style={inputStyle}
                onChange={e => setAdmin({ ...admin, mobile: e.target.value })} />
              <input placeholder="رمز عبور" type="password" value={admin.password}
                autoComplete="current-password" style={inputStyle}
                onChange={e => setAdmin({ ...admin, password: e.target.value })} />
            </>
          ))}

          {msg && (
            <div style={{
              padding: '10px 12px', borderRadius: 10,
              background: msgOk ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
              border: `1px solid ${msgOk ? '#22C55E' : '#EF4444'}`,
              color: msgOk ? '#22C55E' : '#EF4444',
              fontSize: 13, fontWeight: 700, textAlign: 'center'
            }}>
              {msg}
            </div>
          )}

          <button type="submit" disabled={busy} style={{
            marginTop: 6, height: 50, borderRadius: 14, border: 'none',
            background: 'linear-gradient(90deg, #00D49A, #1C78FF)',
            color: '#FFFFFF', fontSize: 15.5, fontWeight: 800, cursor: 'pointer',
            boxShadow: '0 8px 20px rgba(0, 212, 154, 0.35)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8
          }}>
            {busy ? 'در حال ارتباط با سرور...' : (
              tab === 'register'
                ? (step === 'code' ? 'ورود / عضویت' : 'دریافت کد یک‌بارمصرف')
                : (loginOtp ? (step === 'code' ? 'ورود' : 'دریافت کد یک‌بارمصرف') : 'ورود مدیر'))}
          </button>
        </div>
      </form>
    </div>
  );
}

function CodeInputs({ f, setF, onBack, onResend }) {
  return (
    <>
      <input placeholder="کد ۶ رقمی پیامک" value={f.code} inputMode="numeric"
        autoComplete="one-time-code" maxLength={6}
        style={{ ...inputStyle, textAlign: 'center', letterSpacing: 6, fontSize: 18, fontWeight: 800 }}
        onChange={e => setF({ ...f, code: e.target.value })} />
      <button type="button" onClick={onBack}
        style={{ background: 'none', border: 'none', color: '#7DD3FC', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
        تغییر شماره / ویرایش اطلاعات
      </button>
      <button type="button" onClick={onResend}
        style={{ background: 'none', border: 'none', color: '#94A3B8', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
        ارسال دوبارهٔ کد
      </button>
    </>
  );
}
