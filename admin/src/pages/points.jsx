/**
 * ریزِ امتیازاتِ کاربران — جست‌وجو، تاریخچه، و کسرِ امتیاز.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * خواستهٔ مالک
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   «در قسمتی جدید ریز امتیازات کاربران و کاربرایی که بیشترین امتیاز رو
 *    از کار در اپلیکیشن و وب بدست آوردن قابل دیدنه یعنی ادمین میتونه
 *    بفهمه که کاربر بیشترین امتیازی که یدفه بدست اورده حتی از کجاست و
 *    کاربر هارو میتونه از شماره موبایلی که ثبت کردن جستجوکنه و ریز
 *    امتیازات کاملشون رو ببینه»
 *
 *   «ادمین امتیاز کاربر رو در صورت نیاز بتونه کم کنه و دلیلیشو بگه به
 *    کاربر و دلیلش به کاربر بصورت نوتیفیکشن در زنگوله بره»
 *
 *   «رو این بخش خیلی کار بشه که بدون نقص باشه»
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * تصمیم‌های طراحی
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ── چرا دو ستون و نه دو صفحهٔ جدا ──
 *
 * مدیر همیشه با «کدام کاربر؟» شروع می‌کند و بعد ریزش را می‌خواهد. اگر
 * جست‌وجو و جزئیات دو صفحه باشند، هر بار برگشتن یعنی از دست دادنِ
 * نتیجهٔ جست‌وجو. اینجا فهرست سمتِ راست می‌ماند و جزئیات سمتِ چپ عوض
 * می‌شود.
 *
 * ── چرا «بیشترین امتیازگیرندگان» تبِ جداست ──
 *
 * دو کارِ متفاوت‌اند: یکی «این کاربرِ مشخص چه کرده؟» و دیگری «چه کسی
 * بیشترین امتیاز را گرفته؟». نشان دادنِ هر دو با هم صفحه را شلوغ
 * می‌کند بدونِ اینکه به هیچ‌کدام کمک کند.
 *
 * ── چرا اختلافِ دفتر با موجودی صریح نشان داده می‌شود ──
 *
 * دفتر از مایگریشنِ ۰۴۵ شروع شده و برای کاربرانِ قدیمی‌تر ناقص است.
 * پنهان کردنِ این واقعیت یعنی مدیر عددی را باور کند که کامل نیست.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, ArrowDownCircle, ArrowUpCircle, Gift, Search, TrendingUp, User,
} from 'lucide-react';
import { fmtDateTime, fmtNumber } from '../lib/api.js';
import {
  Badge, Button, Card, EmptyState, Field, Input, Select, Skeleton, Table, Textarea,
} from '../components/ui.jsx';
import { useToast } from '../lib/toast.jsx';

/** برچسبِ فارسیِ هر منبع. کلیدها با CHECK مایگریشنِ ۰۴۵ یکی‌اند. */
const SOURCE_FA = {
  photo_card: 'ثبت کارت با عکس',
  card_code: 'ثبت کارت با کد',
  referral: 'کمیسیون معرفی',
  game: 'بازی',
  pass_reward: 'گذر نبرد',
  wheel: 'گردونهٔ شانس',
  reward_claim: 'جایزه',
  admin_adjust: 'تنظیم مدیر',
  admin_deduct: 'کسر مدیر',
  signup_gift: 'هدیهٔ عضویت',
  other: 'سایر',
};

const srcFa = (s) => SOURCE_FA[s] || s || '—';

export function PointsPage({ request }) {
  const notify = useToast();
  const [tab, setTab] = useState('search');

  // ── جست‌وجو ──
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);

  // ── هدیهٔ عضویت (تنظیمِ سراسری) ──
  //
  // یک رکورد در `app_settings` با کلیدِ `signup_gift`. هر کاربرِ تازه
  // همین مقدار را یک‌بار می‌گیرد. عمداً سراسری است نه per-user، چون
  // خواستهٔ مالک «هر کاربر جدید X امتیاز» بود.
  const [gift, setGift] = useState(null);
  const [giftDraft, setGiftDraft] = useState({ enabled: false, points: '', message: '' });
  const [giftBusy, setGiftBusy] = useState(false);

  // ── کاربرِ انتخاب‌شده ──
  const [sel, setSel] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [srcFilter, setSrcFilter] = useState('');
  const [page, setPage] = useState(0);

  // ── فرمِ تغییرِ امتیاز ──
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  // ── برترین‌ها ──
  const [top, setTop] = useState(null);
  const [days, setDays] = useState('');

  const PAGE = 25;

  const doSearch = useCallback(async (term) => {
    const t = String(term ?? q).trim();
    if (t.length < 3) {
      notify('حداقل ۳ نویسه وارد کنید', 'error');
      return;
    }
    setSearching(true);
    try {
      const r = await request(`/api/admin/points/search?q=${encodeURIComponent(t)}`);
      setResults(r.users || []);
      setSearched(true);
      if (!(r.users || []).length) notify('کاربری پیدا نشد', 'error');
    } finally {
      setSearching(false);
    }
  }, [q, request, notify]);

  const loadDetail = useCallback(async (userId, { offset = 0, source = '' } = {}) => {
    setLoadingDetail(true);
    try {
      const qs = new URLSearchParams({ limit: String(PAGE), offset: String(offset) });
      if (source) qs.set('source', source);
      const d = await request(`/api/admin/points/user/${userId}?${qs}`);
      setDetail(d);
    } finally {
      setLoadingDetail(false);
    }
  }, [request]);

  function pick(u) {
    setSel(u);
    setPage(0);
    setSrcFilter('');
    setAmount('');
    setReason('');
    loadDetail(u.id);
  }

  const loadTop = useCallback(async () => {
    const qs = days ? `?days=${days}` : '';
    setTop(await request(`/api/admin/points/top${qs}`));
  }, [request, days]);

  useEffect(() => { if (tab === 'top') loadTop(); }, [tab, loadTop]);

  // ── اعتبارسنجیِ فرم، سمتِ کلاینت ──
  //
  // سرور هم بررسی می‌کند (و آن مرجع است)، ولی گرفتنِ خطا قبل از رفت‌وبرگشت
  // یعنی مدیر فوراً می‌فهمد چه چیزی کم است.
  const amountNum = Number(String(amount).replace(/[^\d-]/g, ''));
  const isDeduct = amountNum < 0;
  const formError = useMemo(() => {
    if (!amount.trim()) return null;
    if (!Number.isFinite(amountNum) || amountNum === 0) return 'مقدار باید عددی غیر صفر باشد';
    if (Math.abs(amountNum) > 1000000) return 'حداکثر ۱٬۰۰۰٬۰۰۰ امتیاز';
    if (isDeduct && reason.trim().length < 3) {
      return 'برای کسر امتیاز باید دلیل بنویسید — این متن برای کاربر ارسال می‌شود';
    }
    if (isDeduct && detail && Math.abs(amountNum) > Number(detail.user.current_points)) {
      return `کاربر فقط ${fmtNumber(detail.user.current_points)} امتیاز دارد — همان مقدار کسر می‌شود`;
    }
    return null;
  }, [amount, amountNum, isDeduct, reason, detail]);

  // اخطارِ «بیشتر از موجودی» نباید جلوی ارسال را بگیرد: سرور خودش تا
  // صفر محدود می‌کند و مدیر ممکن است عمداً «هرچه هست را صفر کن» بخواهد.
  const blocking = formError && !formError.startsWith('کاربر فقط');

  async function submitPoints() {
    if (!sel || !amount.trim() || blocking) return;
    if (isDeduct && !window.confirm(
      `آیا مطمئنید ${fmtNumber(Math.abs(amountNum))} امتیاز از «`
      + `${sel.nickname || sel.mobile}» کسر شود؟\n\nدلیل زیر برای کاربر `
      + `ارسال می‌شود:\n${reason}`)) return;
    setSaving(true);
    try {
      const r = await request(`/api/admin/users/${sel.id}/points`, {
        method: 'POST',
        body: { points: amountNum, reason: reason.trim() },
      });
      notify(r.message || 'انجام شد');
      setAmount('');
      setReason('');
      await loadDetail(sel.id, { offset: 0, source: srcFilter });
      setPage(0);
      // فهرستِ جست‌وجو هم باید عددِ تازه را نشان بدهد.
      setResults((prev) => prev.map((u) => (u.id === sel.id
        ? { ...u, current_points: r.balanceAfter ?? u.current_points } : u)));
    } finally {
      setSaving(false);
    }
  }

  // ── خواندنِ تنظیمِ هدیه ──
  const loadGift = useCallback(async () => {
    try {
      const r = await request('/api/admin/signup-gift');
      const g = r?.settings || r;
      setGift(g);
      setGiftDraft({
        enabled: !!g?.enabled,
        points: String(g?.points ?? 0),
        message: g?.message || '',
      });
    } catch (e) {
      notify(e.message || 'خطا در خواندن تنظیم هدیه', 'error');
    }
  }, [request, notify]);

  useEffect(() => { if (tab === 'gift' && !gift) loadGift(); }, [tab, gift, loadGift]);

  // ── ذخیرهٔ تنظیمِ هدیه ──
  //
  // اعتبارسنجی اینجا فقط برای بازخوردِ سریع است؛ منبعِ حقیقت همچنان
  // بک‌اند است که سقفِ ۱M و عددِ صحیح را دوباره چک می‌کند.
  async function saveGift() {
    const pts = Number(giftDraft.points);
    if (!Number.isFinite(pts) || !Number.isInteger(pts) || pts < 0) {
      notify('امتیاز باید عددی صحیح و نامنفی باشد', 'error');
      return;
    }
    if (pts > 1_000_000) {
      notify('حداکثر ۱٬۰۰۰٬۰۰۰ امتیاز', 'error');
      return;
    }
    if (giftDraft.enabled && pts === 0) {
      notify('برای فعال کردن، امتیاز باید بیشتر از صفر باشد', 'error');
      return;
    }
    setGiftBusy(true);
    try {
      const r = await request('/api/admin/signup-gift', {
        method: 'PATCH',
        body: {
          enabled: giftDraft.enabled,
          points: pts,
          message: giftDraft.message.trim(),
        },
      });
      const g = r?.settings || r;
      setGift(g);
      setGiftDraft({
        enabled: !!g?.enabled,
        points: String(g?.points ?? 0),
        message: g?.message || '',
      });
      notify(g?.enabled
        ? `فعال شد — هر کاربر جدید ${fmtNumber(g.points)} امتیاز می‌گیرد`
        : 'هدیهٔ عضویت غیرفعال شد', 'success');
    } catch (e) {
      notify(e.message || 'خطا در ذخیره', 'error');
    } finally {
      setGiftBusy(false);
    }
  }

  const giftDirty = gift && (
    !!gift.enabled !== giftDraft.enabled
    || String(gift.points ?? 0) !== String(giftDraft.points)
    || (gift.message || '') !== giftDraft.message
  );

  return (
    <div className="stack">
      <div className="tabRow">
        {/* ⚠️ نامِ تب عمداً با دکمهٔ «جست‌وجو»ی داخلِ فرم فرق دارد.
            ممیزیِ مرورگر نشان داد وقتی هر دو «جست‌وجو» نام داشتند،
            `get_by_role('button', name='جست‌وجو')` دو نتیجه می‌داد و
            ابزار تبِ اشتباه را کلیک می‌کرد. برای صفحه‌خوان هم همان
            ابهام وجود دارد. */}
        <Button variant={tab === 'search' ? 'primary' : 'secondary'}
          icon={Search} onClick={() => setTab('search')}>
          کاربران و ریز امتیازات
        </Button>
        <Button variant={tab === 'top' ? 'primary' : 'secondary'}
          icon={TrendingUp} onClick={() => setTab('top')}>
          بیشترین امتیازگیرندگان
        </Button>
        <Button variant={tab === 'gift' ? 'primary' : 'secondary'}
          icon={Gift} onClick={() => setTab('gift')}>
          هدیهٔ عضویت
        </Button>
      </div>

      {tab === 'search' && (
        <div className="ptGrid">
          {/* ── ستونِ راست: جست‌وجو ── */}
          <Card title="جست‌وجوی کاربر"
            subtitle="شمارهٔ موبایل، نام یا لقب — حداقل ۳ نویسه">
            <form onSubmit={(e) => { e.preventDefault(); doSearch(); }}>
              <div className="ptSearchRow">
                <Input value={q} onChange={(e) => setQ(e.target.value)}
                  placeholder="۰۹۱۲…  یا  نام کاربر" autoFocus />
                <Button type="submit" icon={Search} loading={searching}>
                  جست‌وجو
                </Button>
              </div>
            </form>

            {searching && <Skeleton height={70} />}
            {!searching && searched && !results.length && (
              <EmptyState icon={User} title="کاربری پیدا نشد"
                message="شمارهٔ کامل یا بخشی از آن را امتحان کنید." />
            )}
            <div className="ptList">
              {results.map((u) => (
                <button key={u.id} type="button"
                  className={`ptUser${sel?.id === u.id ? ' on' : ''}`}
                  onClick={() => pick(u)}>
                  <div className="ptUserMain">
                    <b>{u.nickname || `${u.first_name || ''} ${u.last_name || ''}`.trim() || 'بی‌نام'}</b>
                    <span className="ptMobile">{u.mobile}</span>
                  </div>
                  <div className="ptUserSide">
                    <b>{fmtNumber(u.current_points)}</b>
                    <span>امتیاز</span>
                    {u.status !== 'active' && <Badge tone="danger">مسدود</Badge>}
                  </div>
                </button>
              ))}
            </div>
          </Card>

          {/* ── ستونِ چپ: جزئیات ── */}
          {!sel && (
            <Card title="ریز امتیازات">
              <EmptyState icon={User} title="کاربری انتخاب نشده"
                message="از فهرست سمت راست یک کاربر را انتخاب کنید." />
            </Card>
          )}

          {sel && (
            <div className="stack">
              <Card title={sel.nickname || sel.mobile}
                subtitle={`${sel.mobile} · عضویت از ${fmtDateTime(sel.joined_at)}`}>
                {loadingDetail && !detail && <Skeleton height={120} />}
                {detail && (
                  <>
                    <div className="ptStats">
                      <div className="ptStat">
                        <span>امتیاز فعلی</span>
                        <b>{fmtNumber(detail.user.current_points)}</b>
                      </div>
                      <div className="ptStat">
                        <span>مجموع کسب‌شده</span>
                        <b>{fmtNumber(detail.summary.totals.earned)}</b>
                      </div>
                      <div className="ptStat">
                        <span>مجموع خرج‌شده</span>
                        <b>{fmtNumber(detail.summary.totals.spent)}</b>
                      </div>
                      <div className="ptStat">
                        <span>امتیاز مادام‌العمر</span>
                        <b>{fmtNumber(detail.user.lifetime_points)}</b>
                      </div>
                    </div>

                    {/* ⚠️ اختلافِ دفتر با موجودی صریح گفته می‌شود.
                        برای کاربرانِ قبل از مایگریشنِ ۰۴۵ طبیعی است، ولی
                        مدیر باید بداند عدد را با احتیاط بخواند. */}
                    {!detail.ledgerMatches && (
                      <div className="ptWarn">
                        <AlertTriangle size={16} />
                        <div>
                          <b>دفتر با موجودی نمی‌خواند</b>
                          <span>
                            جمع دفتر {fmtNumber(detail.ledgerSum)} است ولی موجودی
                            {' '}{fmtNumber(detail.user.current_points)}.
                            {detail.total === 0
                              ? ' این کاربر قبل از راه‌اندازی دفتر امتیاز داشته و تاریخچه‌اش ثبت نشده.'
                              : ' این اختلاف باید بررسی شود.'}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* بیشترین دریافتِ تک‌باره — خواستهٔ صریحِ مالک */}
                    {!!detail.summary.biggestGains.length && (
                      <div className="ptBig">
                        <span className="ptBigTitle">بیشترین امتیازهای یک‌باره</span>
                        {detail.summary.biggestGains.map((g, i) => (
                          <div className="ptBigRow" key={i}>
                            <b>+{fmtNumber(g.delta)}</b>
                            <span>{srcFa(g.source)}</span>
                            <small>{g.description || ''}</small>
                            <time>{fmtDateTime(g.created_at)}</time>
                          </div>
                        ))}
                      </div>
                    )}

                    {!!detail.summary.bySource.length && (
                      <div className="ptSrc">
                        {detail.summary.bySource.map((s) => (
                          <div className="ptSrcChip" key={s.source}>
                            <b>{srcFa(s.source)}</b>
                            <span className={s.total < 0 ? 'neg' : 'pos'}>
                              {s.total < 0 ? '−' : '+'}{fmtNumber(Math.abs(s.total))}
                            </span>
                            <small>{fmtNumber(s.n)} بار</small>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </Card>

              {/* ── تغییرِ امتیاز ── */}
              <Card title="تغییر امتیاز"
                subtitle="عدد منفی برای کسر · دلیل برای کاربر ارسال می‌شود">
                <div className="ptForm">
                  <Field label="مقدار (منفی = کسر)">
                    <Input value={amount} inputMode="numeric"
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="مثلاً ‎-۵۰۰‎ یا ۱۰۰" />
                  </Field>
                  <Field label={`دلیل${isDeduct ? ' (اجباری)' : ' (اختیاری)'}`}>
                    <Input value={reason} onChange={(e) => setReason(e.target.value)}
                      placeholder="مثلاً: ثبت کارت تکراری" />
                  </Field>
                </div>
                {formError && (
                  <div className={`ptFormMsg${blocking ? ' err' : ' warn'}`}>
                    {formError}
                  </div>
                )}
                <Button
                  icon={isDeduct ? ArrowDownCircle : ArrowUpCircle}
                  variant={isDeduct ? 'danger' : 'primary'}
                  loading={saving}
                  disabled={!amount.trim() || !!blocking}
                  onClick={submitPoints}>
                  {isDeduct ? 'کسر امتیاز و اطلاع به کاربر' : 'افزودن امتیاز'}
                </Button>
              </Card>

              {/* ── تاریخچه ── */}
              <Card title="ریز تراکنش‌ها"
                subtitle={detail ? `${fmtNumber(detail.total)} ردیف` : ''}
                action={(
                  <Select value={srcFilter}
                    onChange={(e) => {
                      setSrcFilter(e.target.value);
                      setPage(0);
                      loadDetail(sel.id, { offset: 0, source: e.target.value });
                    }}>
                    <option value="">همهٔ منابع</option>
                    {Object.entries(SOURCE_FA).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </Select>
                )}>
                {loadingDetail && <Skeleton height={140} />}
                {!loadingDetail && detail && !detail.transactions.length && (
                  <EmptyState icon={TrendingUp} title="تراکنشی ثبت نشده"
                    message="هنوز امتیازی برای این کاربر ثبت نشده است." />
                )}
                {!loadingDetail && detail && !!detail.transactions.length && (
                  <>
                    <Table
                      cols={['زمان', 'تغییر', 'موجودی', 'منبع', 'توضیح', 'مدیر']}
                      rows={detail.transactions.map((t) => [
                        fmtDateTime(t.created_at),
                        <b className={t.delta < 0 ? 'neg' : 'pos'} key="d">
                          {t.delta < 0 ? '−' : '+'}{fmtNumber(Math.abs(t.delta))}
                        </b>,
                        fmtNumber(t.balance_after),
                        srcFa(t.source),
                        t.description || '—',
                        t.admin_username || '—',
                      ])}
                    />
                    {detail.total > PAGE && (
                      <div className="ptPager">
                        <Button variant="secondary" disabled={page === 0}
                          onClick={() => {
                            const p = page - 1;
                            setPage(p);
                            loadDetail(sel.id, { offset: p * PAGE, source: srcFilter });
                          }}>قبلی</Button>
                        <span>صفحهٔ {fmtNumber(page + 1)} از {fmtNumber(Math.ceil(detail.total / PAGE))}</span>
                        <Button variant="secondary"
                          disabled={(page + 1) * PAGE >= detail.total}
                          onClick={() => {
                            const p = page + 1;
                            setPage(p);
                            loadDetail(sel.id, { offset: p * PAGE, source: srcFilter });
                          }}>بعدی</Button>
                      </div>
                    )}
                  </>
                )}
              </Card>
            </div>
          )}
        </div>
      )}

      {tab === 'top' && (
        <div className="stack">
          <Card title="بیشترین امتیازگیرندگان"
            action={(
              <Select value={days} onChange={(e) => setDays(e.target.value)}>
                <option value="">از ابتدا</option>
                <option value="1">۲۴ ساعت اخیر</option>
                <option value="7">۷ روز اخیر</option>
                <option value="30">۳۰ روز اخیر</option>
              </Select>
            )}>
            {!top && <Skeleton height={200} />}
            {top && !top.top.length && (
              <EmptyState icon={TrendingUp} title="هنوز امتیازی ثبت نشده"
                message="به‌محض اینکه کاربران امتیاز بگیرند، اینجا دیده می‌شود." />
            )}
            {top && !!top.top.length && (
              <Table
                cols={['#', 'کاربر', 'موبایل', 'کسب‌شده', 'بیشترین یک‌باره',
                  'تعداد', 'امتیاز فعلی']}
                rows={top.top.map((u, i) => [
                  fmtNumber(i + 1),
                  u.nickname || `${u.first_name || ''} ${u.last_name || ''}`.trim() || 'بی‌نام',
                  u.mobile,
                  <b className="pos" key="e">+{fmtNumber(u.earned_in_window)}</b>,
                  fmtNumber(u.biggest_single),
                  fmtNumber(u.tx_count),
                  fmtNumber(u.current_points),
                ])}
              />
            )}
          </Card>

          {top && !!top.biggestSingle?.length && (
            <Card title="بزرگ‌ترین دریافت‌های یک‌بارهٔ کل پلتفرم"
              subtitle="برای پیدا کردن ناهنجاری — عدد غیرعادی اینجا اول فهرست است">
              <Table
                cols={['مقدار', 'کاربر', 'موبایل', 'منبع', 'توضیح', 'زمان']}
                rows={top.biggestSingle.map((t) => [
                  <b className="pos" key="a">+{fmtNumber(t.delta)}</b>,
                  t.nickname || 'بی‌نام',
                  t.mobile,
                  srcFa(t.source),
                  t.description || '—',
                  fmtDateTime(t.created_at),
                ])}
              />
            </Card>
          )}

          {top && !!top.bySource?.length && (
            <Card title="امتیاز داده‌شده بر اساس منبع">
              <div className="ptSrc">
                {top.bySource.map((s) => (
                  <div className="ptSrcChip" key={s.source}>
                    <b>{srcFa(s.source)}</b>
                    <span className="pos">+{fmtNumber(s.total)}</span>
                    <small>{fmtNumber(s.n)} تراکنش</small>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* ⚠️ ناسازگاریِ دفتر — اگر چیزی اینجا باشد یعنی جایی امتیاز
              بدونِ ثبت داده شده، که یعنی مسیری از دفتر عبور نمی‌کند. */}
          {top && !!top.drift?.length && (
            <Card title="کاربران با دفترِ ناسازگار"
              subtitle="جمع تراکنش‌ها با موجودی نمی‌خواند — باید بررسی شود">
              <Table
                cols={['کاربر', 'موبایل', 'موجودی', 'جمع دفتر', 'اختلاف', 'تعداد']}
                rows={top.drift.map((u) => [
                  u.nickname || 'بی‌نام',
                  u.mobile,
                  fmtNumber(u.current_points),
                  fmtNumber(u.ledger_sum),
                  <b className="neg" key="x">
                    {fmtNumber(u.current_points - u.ledger_sum)}
                  </b>,
                  fmtNumber(u.tx_count),
                ])}
              />
            </Card>
          )}
        </div>
      )}

      {/* ═══ تبِ هدیهٔ عضویت ═══
          یک تنظیمِ سراسری: هر کاربرِ تازه‌ثبت‌نام یک‌بار این امتیاز را
          می‌گیرد. عمداً یک کارتِ ساده است نه یک صفحهٔ کامل — یک عدد و
          یک کلید. */}
      {tab === 'gift' && (
        <div className="stack">
          <Card
            title="هدیهٔ امتیاز برای عضویت"
            subtitle="هر کاربری که تازه ثبت‌نام کند، یک‌بار این امتیاز را می‌گیرد"
            action={gift ? (
              <Badge tone={gift.enabled ? 'success' : 'neutral'}>
                {gift.enabled ? `فعال — ${fmtNumber(gift.points)} امتیاز` : 'غیرفعال'}
              </Badge>
            ) : null}
          >
            {!gift ? <Skeleton height={200} /> : (
              <div className="stack">
                <Field label="وضعیت">
                  <Select
                    value={giftDraft.enabled ? '1' : '0'}
                    onChange={(e) => setGiftDraft((d) => ({ ...d, enabled: e.target.value === '1' }))}
                  >
                    <option value="0">غیرفعال — کاربر جدید هدیه نمی‌گیرد</option>
                    <option value="1">فعال — به هر کاربر جدید هدیه بده</option>
                  </Select>
                </Field>

                <Field label="مقدار امتیاز">
                  <Input
                    type="number" min="0" max="1000000" step="1"
                    placeholder="مثلاً ۵۰۰"
                    value={giftDraft.points}
                    onChange={(e) => setGiftDraft((d) => ({ ...d, points: e.target.value }))}
                  />
                </Field>

                <Field label="پیامِ اعلان به کاربر">
                  <Textarea
                    rows={2} maxLength={200}
                    placeholder="به قلقلی خوش آمدی! این امتیاز هدیهٔ عضویت توست."
                    value={giftDraft.message}
                    onChange={(e) => setGiftDraft((d) => ({ ...d, message: e.target.value }))}
                  />
                </Field>

                {/* ── چرا این هشدارها ──
                    مدیر باید بداند این تنظیم بر چه چیزی اثر دارد و بر چه
                    چیزی ندارد. مهم‌ترینش: گذشته را عوض نمی‌کند. */}
                <div className="hintBox">
                  <div><b>فقط برای ثبت‌نام‌های بعد از ذخیره</b> — کاربرانِ فعلی چیزی نمی‌گیرند.</div>
                  <div>هر کاربر <b>فقط یک‌بار</b> می‌گیرد؛ ورودِ مجدد هدیهٔ دوباره ندارد.</div>
                  <div>این امتیاز <b>در رتبه‌بندی لیگ حساب نمی‌شود</b> و <b>کمیسیون معرف ندارد</b>.</div>
                  <div>در ریز تراکنش‌ها با منبعِ «هدیهٔ عضویت» ثبت می‌شود.</div>
                </div>

                <div className="rowEnd">
                  <Button
                    variant="primary" loading={giftBusy} disabled={!giftDirty}
                    onClick={saveGift}
                  >
                    ذخیرهٔ تنظیم
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
