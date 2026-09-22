// نوار فشردهٔ اشتراک نتیجهٔ بازی — فقط تلگرام، واتس‌اپ، روبیکا، بله.
//
// navigator.share سیستم‌عامل اینستاگرام را هم نشان می‌دهد؛ مالک خواست
// آن مسیر حذف شود و پیام همیشه کد دعوت + ۳ چرخش رایگان را داشته باشد.
import React, { useCallback, useState } from 'react';
import { req, fa } from '../lib/api.js';
import { ruleNumber } from '../lib/liveConfig.js';

const WEB = 'https://user.ghelghelishop.com';

const TARGETS = [
  { id: 'telegram', label: 'تلگرام', cls: 'tg',
    href: (msg) => `https://t.me/share/url?url=${encodeURIComponent(WEB)}&text=${encodeURIComponent(msg)}` },
  { id: 'whatsapp', label: 'واتس‌اپ', cls: 'wa',
    href: (msg) => `https://wa.me/?text=${encodeURIComponent(msg)}` },
  { id: 'rubika', label: 'روبیکا', cls: 'rb', href: () => 'https://rubika.ir', copyFirst: true },
  { id: 'bale', label: 'بله', cls: 'bl', href: () => 'https://web.bale.ai', copyFirst: true },
];

export function buildGameShareMessage({ title, gameTitle, versus, code, spins = 3 }) {
  const spinN = Number(spins) || 3;
  const codeLine = code
    ? `کد دعوت من: ${code}\nبا این کد ثبت‌نام کن و ${fa(spinN)} چرخش رایگان گردونه بگیر.`
    : `با ثبت‌نام در قلقلی ${fa(spinN)} چرخش رایگان گردونه بگیر.`;
  return `${title}\n${gameTitle}: ${versus}\n${codeLine}\n${WEB}`;
}

async function copyText(value) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch { /* fallback */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = value;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/**
 * @param {object} props
 * @param {string} props.token
 * @param {string} props.title
 * @param {string} props.gameTitle
 * @param {string} props.versus
 * @param {string} [props.gameId]
 * @param {string} [props.matchId]
 */
export default function ShareResult({ token, title, gameTitle, versus, gameId, matchId }) {
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');

  const shareTo = useCallback(async (target) => {
    setErr('');
    setBusy(target.id);
    try {
      let code = '';
      let spins = ruleNumber('referral.spinsPerReferral', 3);
      try {
        const d = await req('/api/referrals', 'GET', null, token);
        code = d?.code || '';
        if (d?.spinsPerReferral != null) spins = d.spinsPerReferral;
      } catch { /* بدون کد هم پیام کامل است */ }

      const msg = buildGameShareMessage({ title, gameTitle, versus, code, spins });
      if (target.copyFirst) {
        const copied = await copyText(msg);
        if (!copied) throw new Error('کپی متن انجام نشد');
      }
      const url = target.href(msg);
      const win = window.open(url, '_blank', 'noopener,noreferrer');
      if (!win && !target.copyFirst) {
        const copied = await copyText(msg);
        if (!copied) throw new Error('پنجرهٔ اشتراک باز نشد');
      }
      req('/api/analytics/events', 'POST', {
        event: 'share', platform: 'web', gameId, matchId, target: target.id,
      }, token).catch(() => {});
    } catch (e) {
      setErr(e?.message || 'اشتراک‌گذاری ناموفق بود');
    } finally {
      setBusy('');
    }
  }, [token, title, gameTitle, versus, gameId, matchId]);

  return (
    <div className="shareStrip" dir="rtl">
      <span className="shareStripLabel">اشتراک نتیجه</span>
      <div className="shareStripBtns">
        {TARGETS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`msgBtn ${t.cls}`}
            disabled={!!busy}
            onClick={() => shareTo(t)}
            aria-label={t.label}
          >
            <span className="msgDot" />
            {busy === t.id ? '…' : t.label}
          </button>
        ))}
      </div>
      {err && <p className="shareStripErr">{err}</p>}
    </div>
  );
}

