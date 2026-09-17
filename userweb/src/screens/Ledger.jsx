// ═══════════════════════════════════════════════════════════════════════════
// دفتر امتیازات و سکه — صفحهٔ مستقل، از «بیشتر» باز می‌شود
// ═══════════════════════════════════════════════════════════════════════════
//
// ── دو خواستهٔ مالک که این صفحه پاسخ می‌دهد (۱۷ شهریور) ──────────────────
//
//   ۱. «دفتر امتیاز در پروفایل بود؛ جای درستش «بیشتر» است.»
//      قبلاً داخل صفحهٔ پروفایل بود: کاربر برای دیدنِ مالی‌ترین دادهٔ خودش
//      باید وارد فرمِ ویرایشِ اطلاعات شخصی می‌شد.
//   ۲. «صفحه‌بندی کن که پشت‌سرهم اسکرول نشود.»
//      نسخهٔ قبلی `slice(0, 20)` روی یک پاسخِ ۳۰ ردیفی بود؛ ردیف‌های ۲۱ به
//      بعد **هیچ‌وقت** دیده نمی‌شدند. حالا صفحه‌به‌صفحه از سرور می‌آید.
//
// ── چرا سکه هم اینجاست ─────────────────────────────────────────────────
//
// امتیاز و سکه دو اقتصادِ جدا هستند (سکه فقط داخلِ لیگِ فعال معنا دارد و
// پایانِ هر لیگ صفر می‌شود) ولی سؤالِ کاربر یکی است: «این عدد از کجا آمد و
// کجا رفت؟» دو صفحهٔ جدا یعنی کاربر باید بداند کدام سؤالش کدام دفتر است.
import React, { useCallback, useEffect, useState } from 'react';
import { req, fa } from '../lib/api.js';

// برچسبِ فارسیِ منبعِ هر ردیف — کلیدها با CHECK مایگریشنِ ۰۴۵ و با نقشهٔ
// پنل ادمین یکی است.
const POINT_SOURCE_FA = {
  photo_card: 'ثبت کارت با عکس',
  card_code: 'ثبت کارت با کد',
  referral: 'کمیسیون معرفی',
  game: 'بازی',
  pass_reward: 'گذر نبرد',
  wheel: 'گردونهٔ شانس',
  reward_claim: 'دریافت جایزه',
  admin_adjust: 'تنظیم مدیر',
  admin_deduct: 'کسر مدیر',
  signup_gift: 'هدیهٔ عضویت',
  mission: 'ماموریت',
  card_box: 'جعبهٔ کارت',
  league_perk: 'مزیت لیگ',
  other: 'سایر',
};
const pointSrcFa = (s) => POINT_SOURCE_FA[s] || s || '—';

// تاریخ شمسیِ کوتاه — بدون وابستگی، همان الگوی بقیهٔ وب.
function whenText(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  try { return new Intl.DateTimeFormat('fa-IR', { dateStyle: 'short', timeStyle: 'short' }).format(d); }
  catch { return d.toLocaleString(); }
}

const PAGE_SIZE = 20;

export default function Ledger({ token, setMsg }) {
  const [tab, setTab] = useState('points');
  const [rows, setRows] = useState([]);
  const [totals, setTotals] = useState(null);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (which, offset) => {
    const path = which === 'points' ? '/api/points/history' : '/api/coins/history';
    const data = await req(`${path}?limit=${PAGE_SIZE}&offset=${offset}`, 'GET', null, token);
    const fresh = Array.isArray(data?.transactions) ? data.transactions : [];
    // شکلِ پاسخِ دو مسیر کمى فرق دارد: امتیاز جمعِ کل را در
    // `summary.totals` می‌دهد و سکه در `totals` — هر دو یکی می‌شوند.
    const t = data?.summary?.totals || data?.totals || null;
    return { fresh, totals: t, page: data?.page || null };
  }, [token]);

  const reload = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const { fresh, totals: t, page } = await load(tab, 0);
      setRows(fresh); setTotals(t);
      setTotal(Number(page?.total ?? fresh.length));
      setHasMore(page?.hasMore ?? fresh.length >= PAGE_SIZE);
    } catch (e) { setError(e.message || 'دفتر در دسترس نیست'); }
    finally { setLoading(false); }
  }, [load, tab]);

  useEffect(() => { reload(); }, [reload]);

  async function loadMore() {
    if (more || !hasMore) return;
    setMore(true);
    try {
      const { fresh, page } = await load(tab, rows.length);
      setRows((r) => [...r, ...fresh]);
      if (page?.total != null) setTotal(Number(page.total));
      setHasMore(page?.hasMore ?? fresh.length >= PAGE_SIZE);
    } catch (e) { setMsg?.(e.message || 'خطا در بارگذاری'); }
    finally { setMore(false); }
  }

  const isCoin = tab === 'coins';

  return (
    <div style={{ maxWidth: 820, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 14, padding: '14px 12px 80px' }}>
      <div style={{ display: 'flex', gap: 8 }}>
        {[['points', 'امتیاز'], ['coins', 'سکه']].map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            aria-pressed={tab === id}
            style={{
              flex: 1, padding: '10px 12px', borderRadius: 14, fontWeight: 900, fontSize: 13,
              cursor: 'pointer',
              background: tab === id ? 'rgba(132,204,22,0.16)' : 'rgba(255,255,255,0.045)',
              border: `1px solid ${tab === id ? 'rgba(132,204,22,0.5)' : 'rgba(255,255,255,0.09)'}`,
              color: tab === id ? '#B8F06B' : '#C7D2DE',
            }}>{label}</button>
        ))}
      </div>

      <section style={{
        background: 'linear-gradient(135deg, rgba(132,204,22,0.12), rgba(56,189,248,0.06))',
        border: '1px solid rgba(132,204,22,0.28)', borderRadius: 16, padding: 14,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <h3 style={{ color: '#84CC16', fontWeight: 900, margin: 0, flex: 1 }}>
            {isCoin ? 'دفتر سکه‌های من' : 'دفتر امتیازهای من'}
          </h3>
          <span style={{ color: '#94A3B8', fontSize: 10.5, fontWeight: 700 }}>
            {fa(total)} ردیف
          </span>
        </div>
        {totals && (
          <div style={{ color: '#B6C6D8', fontSize: 11, fontWeight: 700, marginBottom: 8 }}>
            کسب {fa(totals.earned || 0)} · خرج {fa(totals.spent || 0)}
          </div>
        )}
        {/* پایانِ هر لیگ سکه‌ها صفر می‌شود؛ بدونِ توضیح کاربر فکر می‌کند
            سکه‌اش را خورده‌اند. */}
        {isCoin && (
          <div style={{ color: '#94A3B8', fontSize: 10.5, lineHeight: 1.8, marginBottom: 8 }}>
            سکه فقط تا پایانِ لیگ اعتبار دارد؛ درصدی از آن به فصلِ بعد منتقل می‌شود.
          </div>
        )}

        {loading && <div style={{ color: '#94A3B8', fontSize: 12 }}>در حال بارگذاری…</div>}
        {!loading && error && (
          <div style={{ color: '#FF8A8A', fontSize: 12 }}>{error}</div>
        )}
        {!loading && !error && rows.length === 0 && (
          <div style={{ color: '#B6C6D8', fontSize: 12, lineHeight: 1.9 }}>
            {isCoin
              ? 'هنوز سکه‌ای ثبت نشده است. در لیگِ فعال بازی کن تا سکه بگیری.'
              : 'هنوز امتیازی ثبت نشده است. با ماموریت‌ها و بازی‌ها شروع کن.'}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {rows.map((tx) => {
            const delta = Number(tx.delta || 0);
            const positive = delta >= 0;
            const desc = String(tx.description || '').trim();
            const label = isCoin
              ? (tx.sourceLabel || tx.source || '—')
              : pointSrcFa(tx.source);
            const balance = tx.balanceAfter;
            return (
              <div key={tx.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '7px 10px', borderRadius: 10, background: 'rgba(255,255,255,0.045)' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', marginTop: 7, flexShrink: 0, background: positive ? '#84CC16' : '#EF4444' }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: '#FFF', fontSize: 11.5, fontWeight: 700 }}>{desc || label}</div>
                  <div style={{ color: '#94A3B8', fontSize: 9.5 }}>
                    {label} · {whenText(tx.created_at)}
                    {isCoin && balance != null ? ` · موجودی ${fa(balance)}` : ''}
                  </div>
                </div>
                <b style={{ color: positive ? '#84CC16' : '#EF4444', fontSize: 12, fontWeight: 900 }}>
                  {positive ? '+' : ''}{fa(delta)}
                </b>
              </div>
            );
          })}
        </div>

        {!loading && hasMore && (
          <button
            onClick={loadMore}
            disabled={more}
            style={{
              marginTop: 12, width: '100%', padding: '11px 12px', borderRadius: 12, cursor: 'pointer',
              background: 'rgba(132,204,22,0.14)', border: '1px solid rgba(132,204,22,0.4)',
              color: '#B8F06B', fontWeight: 900, fontSize: 12.5,
            }}>
            {more ? 'در حال آوردن…' : 'بیشتر نشان بده'}
          </button>
        )}
      </section>
    </div>
  );
}
