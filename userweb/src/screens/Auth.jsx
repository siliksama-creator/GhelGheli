// ورود / عضویت فقط با شماره + کد یک‌بارمصرف (قراردادِ مهر ۱۴۰۵).
// رمز عبور از جریانِ عادی حذف شده؛ فقط حسابِ مدیر یک کشوی جدا دارد.
import React, { useState } from 'react';
import { req, avatars } from '../lib/api.js';

const faNum = n => new Intl.NumberFormat('fa-IR').format(Number(n || 0));

const inputStyle = { borderRadius: 12, padding: '12px 14px', fontSize: 14 };

export default function Auth({ done }) {
  const [step, setStep] = useState('mobile'); // 'mobile' | 'code'
  const [f, setF] = useState({ mobile: '', code: '', nickname: '', referralCode: '' });
  const [msg, setMsg] = useState('');
  const [msgOk, setMsgOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [admin, setAdmin] = useState({ mobile: '', password: '' });

  function normalizeDigits(str) {
    return String(str || '')
      .replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
      .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
  }
  const cleanMobile = () => normalizeDigits(f.mobile).trim();

  function say(text, ok = false) { setMsg(text); setMsgOk(ok); }

  async function requestCode(e) {
    e?.preventDefault();
    if (busy) return;
    setMsg('');
    if (!cleanMobile()) return say('شماره موبایل را وارد کنید');
    setBusy(true);
    try {
      const d = await req('/api/auth/request-otp', 'POST', { mobile: cleanMobile(), purpose: 'register' });
      if (d.smsDisabled) {
        say('سامانهٔ پیامک هنوز فعال نشده است؛ ورود با کد به‌زودی فعال می‌شود. مدیران از بخشِ پایین با رمز وارد شوند.');
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

  async function verifyAndEnter(e) {
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
        nickname: f.nickname.trim() || undefined,
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
    if (!admin.mobile || !admin.password) return say('شماره و رمز مدیر را وارد کنید');
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

  return (
    <div style={{ maxWidth: 420, margin: '0 auto', padding: '16px' }}>
      <form className="card auth" onSubmit={step === 'code' ? verifyAndEnter : requestCode} style={{
        borderRadius: 24,
        background: 'linear-gradient(145deg, #132238, #0A1424)',
        border: '1.5px solid rgba(0, 212, 154, 0.25)',
        boxShadow: '0 16px 36px rgba(0, 0, 0, 0.45), 0 0 20px rgba(0, 212, 154, 0.12)',
        padding: '24px 20px'
      }}>
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: '#FFFFFF', margin: 0 }}>
            {step === 'code' ? 'کد تایید را وارد کن' : 'ورود و عضویت در قلقلی'}
          </h2>
          <p style={{ color: '#94A3B8', fontSize: 13, marginTop: 4 }}>
            {step === 'code' ? `کد به شمارهٔ ${cleanMobile()} ارسال شد` : 'فقط شماره موبایل؛ بدون رمز عبور. اگر شماره تازه باشد، همان لحظه حسابت ساخته می‌شود'}
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {step === 'mobile' ? (
            <>
              <input
                placeholder="شماره موبایل (مثلاً ۰۹۱۲۳۴۵۶۷۸۹)"
                value={f.mobile}
                inputMode="tel"
                autoComplete="username"
                style={inputStyle}
                onChange={e => setF({ ...f, mobile: e.target.value })}
              />
              <input
                placeholder="نام مستعار در بازی (اختیاری)"
                value={f.nickname}
                style={inputStyle}
                onChange={e => setF({ ...f, nickname: e.target.value })}
              />
              <input
                placeholder="کد معرف دوست (اختیاری — جایزه چرخش)"
                value={f.referralCode}
                style={inputStyle}
                onChange={e => setF({ ...f, referralCode: e.target.value })}
              />
            </>
          ) : (
            <>
              <input
                placeholder="کد ۶ رقمی پیامک"
                value={f.code}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                style={{ ...inputStyle, textAlign: 'center', letterSpacing: 6, fontSize: 18, fontWeight: 800 }}
                onChange={e => setF({ ...f, code: e.target.value })}
              />
              <button type="button" onClick={() => { setStep('mobile'); setMsg(''); }}
                style={{ background: 'none', border: 'none', color: '#7DD3FC', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
                تغییر شماره / ویرایش اطلاعات
              </button>
              <button type="button" onClick={requestCode}
                style={{ background: 'none', border: 'none', color: '#94A3B8', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
                ارسال دوبارهٔ کد
              </button>
            </>
          )}

          {msg && (
            <div style={{
              padding: '10px 12px',
              borderRadius: 10,
              background: msgOk ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
              border: `1px solid ${msgOk ? '#22C55E' : '#EF4444'}`,
              color: msgOk ? '#22C55E' : '#EF4444',
              fontSize: 13,
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
              fontWeight: 800,
              cursor: 'pointer',
              boxShadow: '0 8px 20px rgba(0, 212, 154, 0.35)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8
            }}
          >
            {busy ? 'در حال ارتباط با سرور...' : (step === 'code' ? 'ورود / عضویت' : 'دریافت کد یک‌بارمصرف')}
          </button>
        </div>

        <div style={{ marginTop: 18, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 12 }}>
          <button type="button" onClick={() => { setAdminOpen(!adminOpen); setMsg(''); }}
            style={{ background: 'none', border: 'none', color: '#64748B', fontSize: 12, fontWeight: 700, cursor: 'pointer', width: '100%' }}>
            {adminOpen ? 'بستنِ ورودِ مدیر ▲' : 'ورود با رمز عبور (فقط حساب مدیر) ▼'}
          </button>
          {adminOpen && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
              <input
                placeholder="شماره / نام کاربری مدیر"
                value={admin.mobile}
                style={inputStyle}
                onChange={e => setAdmin({ ...admin, mobile: e.target.value })}
              />
              <input
                placeholder="رمز عبور مدیر"
                type="password"
                value={admin.password}
                autoComplete="current-password"
                style={inputStyle}
                onChange={e => setAdmin({ ...admin, password: e.target.value })}
              />
              <button type="button" onClick={adminLogin} disabled={busy}
                style={{ height: 44, borderRadius: 12, border: '1px solid rgba(148,163,184,0.35)', background: 'rgba(148,163,184,0.12)', color: '#CBD5E1', fontSize: 13.5, fontWeight: 800, cursor: 'pointer' }}>
                ورود مدیر
              </button>
            </div>
          )}
        </div>
      </form>
    </div>
  );
}
