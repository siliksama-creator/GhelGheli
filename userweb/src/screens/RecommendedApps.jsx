// ═══════════════════════════════════════════════════════════════════════════
// برنامه‌های پیشنهادی — صفحهٔ مستقل، از «بیشتر» باز می‌شود
// ═══════════════════════════════════════════════════════════════════════════
//
// ── خواستهٔ مالک (۲۶ شهریور) ───────────────────────────────────────────────
//
//   «یک قسمت برنامهٔ پیشنهادی در قسمت (بیشتر) وب و اندروید که از پنل ادمین
//    مدیریت بشه... ادمین می‌تونه برنامه یا سایت معرفی کنه با لینکِ دانلود یا
//    لینکِ ورود به وب‌سایت، به همراه عکس و توضیحات؛ بصورتِ خیلی زیبا و
//    کادربندی‌شده در قسمتِ بیشتر نشان داده بشه. بدونِ نیاز به آپدیت اندروید و
//    وب‌سایت. وقتی ادمین برنامه‌های بیشتری معرفی کرد، در اون قسمت به کاربر‌ها
//    نمایش داده بشه؛ اگه تعداد بیشتر از ۱۰ عدد شد، صفحه‌بندی‌شده.»
//
// ── تصمیم‌هایی که ظاهر را تعیین کرده‌اند ────────────────────────────────────
//
//   • **کادرِ مستقل برای هر برنامه** (نه ردیفِ متنی): هر کارت عکس، عنوان،
//     برچسبِ نوع، توضیح و دکمهٔ بازکردن دارد. روی گوشی یک‌ستونه و روی
//     مانیتور خودکار چندستونه می‌شود (`auto-fill`) — بدونِ هیچ media query
//     که با گاردِ چیدمانِ دسکتاپ تعارض داشته باشد.
//   • **همه‌چیز از سرور**: عنوان/توضیح/عکس/لینک/برچسب. هیچ رشتهٔ محتواییِ
//     ثابتی اینجا نیست که با آپدیتِ پنل، کهنه بماند.
//   • **بازشدنِ لینک در تبِ تازه**: کاربر روی «دانلود» می‌زند و نباید از اپ
//     بیرون بیفتد؛ پس `target=_blank` + `rel="noopener noreferrer"` (نسخهٔ
//     بدونِ `noopener` اجازه می‌دهد صفحهٔ مقصد به `window.opener` دست ببرد).
//   • **صفحه‌بندیِ شماره‌دار** (خواستهٔ صریحِ مالک): ۱۰ کارت در هر صفحه با
//     دکمه‌های ۱ ۲ ۳ … و «قبلی/بعدی». صفحه‌بندی سمتِ سرور است، پس ۵۰ برنامه
//     هم یعنی ۵ درخواست کوچک، نه یک پاسخِ سنگین.
import React, { useCallback, useEffect, useState } from 'react';
import { req, fa } from '../lib/api.js';
import CachedImg from '../components/CachedImg.jsx';

// اندازهٔ هر صفحه — خواستهٔ مالک «۱۰» بود و سرور هم بیشتر نمی‌پذیرد.
//
// ⚠️ عدد عمداً **در خودِ آدرس** نوشته شده و یک ثابتِ جدا نیست: گاردِ
//    `backend/scripts/testRecommendedApps.js` همین رشته را در وب و اندروید
//    می‌سنجد تا دو کلاینت هرگز دو اندازهٔ صفحه نگیرند. برای محاسبهٔ
//    «چندم تا چندم» از `perPage` خودِ پاسخِ سرور استفاده می‌کنیم، پس عدد
//    همچنان یک منبعِ حقیقت دارد.


/** لوگوی جایگزین وقتی عکسی برای برنامه ثبت نشده. */
function LetterMark({ title }) {
  const ch = String(title || '؟').trim().charAt(0);
  return (
    <div style={{
      width: '100%', height: '100%', display: 'grid', placeItems: 'center',
      background: 'linear-gradient(135deg, rgba(132,204,22,0.22), rgba(56,189,248,0.14))',
      color: '#B8F06B', fontWeight: 900, fontSize: 30,
    }} aria-hidden="true">{ch}</div>
  );
}

/** دکمه‌های شماره‌دار — با «…» برای فهرست‌های بلند. */
function pageList(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const out = new Set([1, total, current, current - 1, current + 1]);
  const sorted = [...out].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b);
  const withGaps = [];
  let prev = 0;
  for (const n of sorted) {
    if (prev && n - prev > 1) withGaps.push('…');
    withGaps.push(n);
    prev = n;
  }
  return withGaps;
}

export default function RecommendedApps({ initial = null, onAvailability = null }) {
  const [items, setItems] = useState(() => (initial?.items || []));
  const [info, setInfo] = useState(() => (initial?.page || null));
  const [enabled, setEnabled] = useState(() => initial?.enabled !== false);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(() => !initial);
  const [error, setError] = useState('');

  const load = useCallback(async (target) => {
    setLoading(true); setError('');
    try {
      // `fresh` یعنی کشِ ETag را دور بزن: ادمین ممکن است همین الان برنامه‌ای
      // اضافه کرده باشد و کاربر تازه صفحه را باز کرده — انتظار دارد ببیندش.
      const data = await req(`/api/recommended-apps?page=${target}&per_page=10`, 'GET', null, null);
      const fresh = Array.isArray(data?.items) ? data.items : [];
      setItems(fresh);
      setInfo(data?.page || null);
      setEnabled(data?.enabled !== false);
      onAvailability?.({ enabled: data?.enabled !== false, total: Number(data?.page?.total || fresh.length) });
      setPage(target);
    } catch (e) {
      setError(e?.message || 'این بخش در دسترس نیست');
    } finally { setLoading(false); }
  }, [onAvailability]);

  // صفحهٔ اول از قبل (probe ای که منو می‌زند) داریم → درخواستِ تکراری نزن.
  useEffect(() => {
    if (initial?.page?.page === 1 && (initial?.items || []).length) return;
    load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalPages = Number(info?.totalPages || 1);
  const total = Number(info?.total || items.length);
  // اندازهٔ صفحه از پاسخِ سرور (۱۰) — نه یک عددِ دستیِ دیگر.
  const perPage = Number(info?.perPage || 10);
  const firstOnPage = total === 0 ? 0 : (page - 1) * perPage + 1;
  const lastOnPage = Math.min(page * perPage, total);

  function goTo(target) {
    if (target < 1 || target > totalPages || target === page || loading) return;
    load(target);
    // صفحه‌بندی معنی ندارد اگر کاربر بالای صفحه بماند و کارت‌های قبلی را ببیند.
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <div style={{ maxWidth: 820, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 14, padding: '14px 12px 80px' }}>
      <section style={{
        background: 'linear-gradient(135deg, rgba(132,204,22,0.14), rgba(56,189,248,0.07))',
        border: '1px solid rgba(132,204,22,0.28)', borderRadius: 18, padding: 14,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#84CC16" strokeWidth="1.9"
            strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1 1" />
            <path d="M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1-1" />
          </svg>
          <h2 style={{ margin: 0, color: '#B8F06B', fontWeight: 900, fontSize: 15.5, flex: 1 }}>
            برنامه‌های پیشنهادی
          </h2>
          {total > 0 && (
            <span style={{ color: '#94A3B8', fontSize: 11, fontWeight: 700 }}>
              {total > perPage
                ? `صفحهٔ ${fa(page)} از ${fa(totalPages)}`
                : `${fa(total)} مورد`}
            </span>
          )}
        </div>
        <p style={{ margin: 0, color: '#B6C6D8', fontSize: 11.5, lineHeight: 1.9 }}>
          برنامه‌ها و سایت‌هایی که به‌نظرِ ما به کارت می‌آید. با زدنِ هر کادر، لینکِ دانلود یا سایتش باز می‌شود.
        </p>
      </section>

      {loading && (
        <div style={{ color: '#94A3B8', fontSize: 12, padding: 12 }}>در حال بارگذاری…</div>
      )}

      {!loading && error && (
        <section style={{ border: '1px solid rgba(239,68,68,0.35)', background: 'rgba(239,68,68,0.08)', borderRadius: 16, padding: 14 }}>
          <div style={{ color: '#FFB4B4', fontSize: 12.5, fontWeight: 700, marginBottom: 8 }}>{error}</div>
          <button onClick={() => load(page)} style={{
            padding: '9px 14px', borderRadius: 12, cursor: 'pointer', fontWeight: 900, fontSize: 12.5,
            background: 'rgba(132,204,22,0.14)', border: '1px solid rgba(132,204,22,0.4)', color: '#B8F06B',
          }}>تلاش دوباره</button>
        </section>
      )}

      {!loading && !error && items.length === 0 && (
        <section style={{ border: '1px dashed rgba(148,163,184,0.35)', borderRadius: 16, padding: 20, textAlign: 'center' }}>
          <div style={{ color: '#E2E8F0', fontSize: 13, fontWeight: 800, marginBottom: 6 }}>
            {enabled ? 'هنوز برنامه‌ای معرفی نشده' : 'این بخش فعلاً غیرفعال است'}
          </div>
          <div style={{ color: '#94A3B8', fontSize: 11.5, lineHeight: 1.9 }}>
            {enabled
              ? 'به‌زودی اینجا برنامه‌ها و سایت‌هایی که پیشنهاد می‌کنیم را می‌بینی.'
              : 'مدیر می‌تواند هر وقت خواست از پنل روشنش کند.'}
          </div>
        </section>
      )}

      {!loading && !error && items.length > 0 && (
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(168px, 1fr))' }}>
          {items.map((app) => (
            <article key={app.id} style={{
              display: 'flex', flexDirection: 'column', gap: 9,
              background: 'rgba(255,255,255,0.045)',
              border: '1px solid rgba(255,255,255,0.09)',
              borderRadius: 18, padding: 11,
              boxShadow: '0 8px 22px rgba(0,0,0,0.22)',
            }}>
              <div style={{
                width: '100%', aspectRatio: '1 / 1', borderRadius: 14, overflow: 'hidden',
                background: 'rgba(148,163,184,0.12)',
              }}>
                {app.imageUrl
                  ? <CachedImg src={app.imageUrl} w={320} alt={app.title}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                  : <LetterMark title={app.title} />}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <h3 style={{ margin: 0, color: '#FFFFFF', fontSize: 12.5, fontWeight: 900, flex: 1, minWidth: 0 }}>
                  {app.title}
                </h3>
                <span style={{
                  fontSize: 9.5, fontWeight: 800, color: '#8ED0FF',
                  background: 'rgba(56,189,248,0.14)', border: '1px solid rgba(56,189,248,0.3)',
                  borderRadius: 999, padding: '2px 7px', whiteSpace: 'nowrap',
                }}>{app.kindLabel}</span>
              </div>

              {app.description && (
                <p style={{
                  margin: 0, color: '#B6C6D8', fontSize: 11, lineHeight: 1.85,
                  display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                }}>{app.description}</p>
              )}

              <a href={app.linkUrl} target="_blank" rel="noopener noreferrer" style={{
                marginTop: 'auto', textAlign: 'center', textDecoration: 'none',
                padding: '9px 10px', borderRadius: 12, fontWeight: 900, fontSize: 11.5,
                background: 'linear-gradient(135deg, rgba(132,204,22,0.22), rgba(56,189,248,0.14))',
                border: '1px solid rgba(132,204,22,0.4)', color: '#C7F58A',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 4v11m0 0 4-4m-4 4-4-4" />
                  <path d="M5 19h14" />
                </svg>
                {app.kind === 'website' ? 'ورود به سایت' : 'دریافت'}
              </a>
            </article>
          ))}
        </div>
      )}

      {/* ═══════════ صفحه‌بندی (خواستهٔ مالک: بیشتر از ۱۰ شد، صفحه‌بندی) ═══════════ */}
      {!loading && !error && totalPages > 1 && (
        <nav aria-label="صفحه‌بندی برنامه‌ها" style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, flexWrap: 'wrap',
          padding: '4px 0 2px',
        }}>
          <button onClick={() => goTo(page - 1)} disabled={page <= 1} style={pagerStyle(page <= 1)}>
            قبلی
          </button>

          {pageList(page, totalPages).map((p, i) => (
            p === '…'
              ? <span key={`gap-${i}`} style={{ color: '#64748B', fontSize: 12, padding: '0 2px' }}>…</span>
              : (
                <button key={p} onClick={() => goTo(p)} aria-current={p === page ? 'page' : undefined}
                  style={{
                    ...pagerStyle(false),
                    minWidth: 34,
                    ...(p === page ? {
                      background: 'rgba(132,204,22,0.22)',
                      borderColor: 'rgba(132,204,22,0.6)',
                      color: '#D9FFA8',
                    } : null),
                  }}>{fa(p)}</button>
              )
          ))}

          <button onClick={() => goTo(page + 1)} disabled={page >= totalPages} style={pagerStyle(page >= totalPages)}>
            بعدی
          </button>

          {total > 0 && (
            <span style={{ color: '#64748B', fontSize: 10.5, fontWeight: 700, marginInlineStart: 4 }}>
              {fa(firstOnPage)}–{fa(lastOnPage)} از {fa(total)}
            </span>
          )}
        </nav>
      )}
    </div>
  );
}

/** استایلِ مشترکِ دکمه‌های صفحه‌بندی (غیرفعال‌ها کم‌رنگ می‌شوند). */
function pagerStyle(disabled) {
  return {
    padding: '8px 11px', borderRadius: 12, fontWeight: 900, fontSize: 11.5,
    cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.45 : 1,
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.12)',
    color: '#C7D2DE',
  };
}
