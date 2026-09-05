/**
 * پنل «ثبت کارت از طریق عکس».
 *
 * سه بخش، به همان ترتیبی که مدیر واقعاً کار می‌کند:
 *   ۱. آپلود عکس خام + تعیین امتیاز
 *   ۲. بانک کد مشترک (تولید، آمار، خروجی CSV برای چاپخانه)
 *   ۳. صف بررسی — عکس‌هایی که موتور تطبیق مطمئن نبوده
 *
 * صفحهٔ «کارت و کد» موجود عمداً دست‌نخورده ماند: آن سیستم دیگری است
 * (ثبت با کد تنها) و قاطی کردنشان در یک صفحه فقط باعث می‌شد مدیر کد را
 * در بانک اشتباه وارد کند.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, Ban, Check, CheckCircle2, Clock, Download,
  Image as ImageIcon, KeyRound, Pencil, RotateCcw, ScanLine, Trash2,
  Upload, XCircle,
} from 'lucide-react';

import { assetUrl, fmtDateTime, fmtNumber } from '../lib/api.js';
import {
  Badge, Button, Card, EmptyState, Field, IconButton, Input, Skeleton,
  Textarea,
} from '../components/ui.jsx';
import { useDialog } from '../components/dialog.jsx';
import { useToast } from '../lib/toast.jsx';
import { groupPhotoCardDesigns } from '../lib/photoCardGroups.js';
import { GroupedCardTile } from '../components/photoCards/GroupedCardTile.jsx';
import { EditGroupedCardModal } from '../components/photoCards/EditGroupedCardModal.jsx';

// مراحلِ واقعیِ آنالیزِ آپلود — هر کدام کارِ واقعیِ سرور.
const UPLOAD_STEPS = [
  '⏳ در حال تحلیل تصویر — رنگ، لبه‌ها، بافت و روشنایی…',
  'در حال خواندن متن کارت — نام بازیکن و شمارهٔ پیراهن…',
  'بررسی تکراری نبودن و ثبت در کاتالوگ…',
];

export function PhotoCardsPage({ request }) {
  const notify = useToast();
  const { confirmAction } = useDialog();

  const [cards, setCards] = useState(null);
  const [deletingCardId, setDeletingCardId] = useState(null);
  const [stats, setStats] = useState(null);
  const [batches, setBatches] = useState([]);
  const [subs, setSubs] = useState(null);
  const [options, setOptions] = useState([]);
  // انتخابِ طرح برای هر پرونده: { [submissionId]: designId }
  const [picks, setPicks] = useState({});
  // فهرست کدها + فیلتر و جست‌وجو
  const [codes, setCodes] = useState([]);
  const [codeFilter, setCodeFilter] = useState('unused');
  const [codeQuery, setCodeQuery] = useState('');
  const [editing, setEditing] = useState(null);   // { id, code }
  // ── گروهِ بازشده در فهرستِ کدها ──
  //
  // شکایتِ مالک: «قسمت ویرایش کد بازیکن برای کد هایی که ثبت شدن باید
  // روی خود بازیکن ویرایش کرد و کد هاشو دید نباید انقدر اسکرول طولانی
  // بشه».
  //
  // با ۱۰۰۰ کد برای هر بازیکن، فهرستِ تخت عملاً غیرقابل‌استفاده بود.
  // حالا کدها زیرِ نامِ بازیکن جمع می‌شوند و فقط گروهِ بازشده ردیف نشان
  // می‌دهد. `null` یعنی همه بسته.
  const [openGroup, setOpenGroup] = useState(null);
  const [subFilter, setSubFilter] = useState('pending');
  const [mismatch, setMismatch] = useState(null);
  const [shadow, setShadow] = useState(null);
  const [quickCode, setQuickCode] = useState('');
  const [quickResult, setQuickResult] = useState(null);
  const [quickBusy, setQuickBusy] = useState(false);

  async function toggleQuickCode() {
    if (!quickCode.trim()) return notify('کد را وارد کنید', 'error');
    setQuickBusy(true);
    try {
      const r = await request('/api/admin/photo-cards/codes/toggle-by-code', {
        method: 'POST',
        body: { code: quickCode.trim() },
      });
      notify(r.message || 'وضعیت کد تغییر کرد', 'success');
      setQuickResult(r);
      loadCodes();
      loadStats();
    } catch (e) {
      notify(e.message, 'error');
    } finally {
      setQuickBusy(false);
    }
  }


  // ── فرم آپلود: دو عکس، رو و پشت ──
  //
  // خواستهٔ مالک: «ادمین برای هر عکس کارت ۲ تا عکس بفرسه هم‌زمان هر ۲
  // عکس آنالیز شن». پشت اختیاری است — کارت‌هایی که فقط یک طرفشان
  // چاپ‌شده هم باید ثبت شوند.
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState('');
  const [fileBack, setFileBack] = useState(null);
  const [previewBack, setPreviewBack] = useState('');
  const [name, setName] = useState('');
  const [points, setPoints] = useState('');
  const [cash, setCash] = useState('');
  const [duel, setDuel] = useState({
    attack: '50', defense: '50', speed: '50', technique: '50',
    goalChance: '50', energy: '100', rarity: 'normal', effect: 'none',
  });
  // ── کارتِ کلکسیونی ──
  //
  // خواستهٔ مالک: «کارت هایی که برای بازی نیستن». وقتی تیک بخورد، بخشِ
  // استاتس کاملاً از فرم محو می‌شود — نه فقط غیرفعال. نمایشِ فیلدهایی که
  // هیچ اثری ندارند مدیر را گمراه می‌کند که انگار دارد چیزی تنظیم می‌کند.
  const [collectible, setCollectible] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [editingCard, setEditingCard] = useState(null);

  function openEditCard(card) {
    setEditingCard(card);
  }

  // ── مرحلهٔ آنالیزِ آپلود ──
  //
  // آپلودِ دو عکس (رو و پشت) حدودِ ۲.۴ ثانیه طول می‌کشد: هر عکس ۳۳۰ms
  // اثرانگشتِ تصویری + ۸۵۰ms خواندنِ متن. بدونِ بازخورد، مدیر فکر
  // می‌کند دکمه کار نکرده و دوباره می‌زند.
  //
  // ⚠️ مراحل ساختگی نیستند؛ کارِ واقعیِ سرور را نشان می‌دهند.
  const [upPhase, setUpPhase] = useState(0);
  // کدهای اختصاصیِ همین کارت — اختیاری، همراه با آپلودِ طرح ثبت می‌شوند.
  const [ownCodes, setOwnCodes] = useState('');
  const [ownBatch, setOwnBatch] = useState('');

  // فرم کد — مدیر خودش وارد می‌کند، سیستم نمی‌سازد
  const [rawCodes, setRawCodes] = useState('');
  // نوعِ کارتی که این دستهٔ کد رویش چاپ می‌شود. خالی = «نمی‌دانم».
  const [codeType, setCodeType] = useState('');
  const [assignBusy, setAssignBusy] = useState(false);
  const [label, setLabel] = useState('');
  const [saving, setSaving] = useState(false);
  const [report, setReport] = useState(null);

  const loadDesigns = useCallback(
    () => request('/api/admin/photo-cards/designs')
      .then(r => {
        const flat = r.designs || [];
        setCards(Array.isArray(r.cards) ? r.cards : groupPhotoCardDesigns(flat));
      })
      .catch(e => {
        setCards([]);
        notify(e.message, 'error');
      }),
    [request, notify],
  );

  const loadCodes = useCallback(
    () => request('/api/admin/photo-cards/codes/stats')
      .then(r => { setStats(r.stats); setBatches(r.batches || []); })
      .catch(() => setStats(null)),
    [request],
  );

  const loadSubs = useCallback(
    (status) => request(`/api/admin/photo-cards/submissions?status=${status}`)
      .then(r => setSubs(r.submissions || []))
      .catch(() => setSubs([])),
    [request],
  );

  const loadCodeList = useCallback(
    () => request(`/api/admin/photo-cards/codes?status=${codeFilter}`
        + (codeQuery.trim() ? `&q=${encodeURIComponent(codeQuery.trim())}` : ''))
      .then(r => setCodes(r.codes || []))
      .catch(() => setCodes([])),
    [request, codeFilter, codeQuery],
  );

  const loadOptions = useCallback(
    () => request('/api/admin/photo-cards/designs/options')
      .then(r => setOptions(r.options || []))
      .catch(() => setOptions([])),
    [request],
  );

  // داشبوردِ «کدهای مشکوکِ شرکت»: اگر چند ثبتِ مختلف، کدی که انتظارش
  // «هالند» بوده را با تصویری که سیستم قاطعانه «رودری» دیده بفرستند، آن
  // سریِ کد احتمالاً دسته‌ای روی کارتِ اشتباه چاپ شده. این گزارش همان را
  // دسته‌ای نشان می‌دهد (آستانهٔ پیش‌فرض ۳).
  const loadMismatch = useCallback(
    () => request('/api/admin/photo-cards/code-mismatch?min=3')
      .then(r => setMismatch(r.mismatches || []))
      .catch(() => setMismatch([])),
    [request],
  );

  // وضعیت «حالت سایه»ٔ بردارِ عصبی (فاز ۲): مدل روی گوشی بردار می‌فرستد ولی
  // هنوز تصمیم نمی‌گیرد؛ این عدد نرخِ توافقش با تصمیم نهایی را نشان می‌دهد.
  const loadShadow = useCallback(
    () => request('/api/admin/photo-cards/embedding-shadow')
      .then(r => setShadow(r))
      .catch(() => setShadow(null)),
    [request],
  );

  useEffect(() => { loadDesigns(); loadCodes(); loadOptions(); loadMismatch(); loadShadow(); },
    [loadDesigns, loadCodes, loadOptions, loadMismatch, loadShadow]);
  useEffect(() => { loadCodeList(); }, [loadCodeList]);
  useEffect(() => { setSubs(null); loadSubs(subFilter); }, [subFilter, loadSubs]);

  // ══════════════════════════════════════════════════════════════════════
  // گروه‌بندیِ کدها بر پایهٔ کارتی که به آن گره خورده‌اند
  // ══════════════════════════════════════════════════════════════════════
  //
  // دو دستهٔ کاملاً متفاوت که مالک خواست از هم جدا شوند:
  //
  //   • کدهای **نام‌دار** — می‌دانیم روی کدام کارت چاپ شده‌اند. زیرِ نامِ
  //     همان بازیکن جمع می‌شوند و مدیر روی خودِ بازیکن کار می‌کند.
  //
  //   • کدهای **بی‌نام** — «کارت‌های قدیمی که هنگام چاپ مشخص نشد کدام کد
  //     روی کدام کارت رفت». بخشِ جدای خودشان را دارند.
  //
  // `useMemo` چون با ۳۰۰ کد در هر رندر دوباره محاسبه می‌شد و تایپ در
  // کادرِ جست‌وجو محسوس کند بود.
  const codeGroups = useMemo(() => {
    const named = new Map();
    const free = [];
    for (const c of codes) {
      const key = c.expected_card_type_name;
      if (!key) { free.push(c); continue; }
      if (!named.has(key)) named.set(key, []);
      named.get(key).push(c);
    }
    return {
      named: [...named.entries()]
        .map(([name, list]) => ({ name, list }))
        .sort((a, b) => b.list.length - a.list.length),
      free,
    };
  }, [codes]);

  // پیش‌نمایش محلی. بدون آن مدیر نمی‌داند فایل درست را انتخاب کرده یا نه.
  function pickFile(f) {
    setFile(f || null);
    // آزادسازی بلابِ قبلی، وگرنه با هر انتخاب یک شیء در حافظه می‌ماند.
    setPreview(prev => { if (prev) URL.revokeObjectURL(prev); return f ? URL.createObjectURL(f) : ''; });
  }

  function pickBack(f) {
    setFileBack(f || null);
    setPreviewBack(prev => {
      if (prev) URL.revokeObjectURL(prev);
      return f ? URL.createObjectURL(f) : '';
    });
  }

  async function uploadDesign() {
    if (!file) return notify('عکس کارت را انتخاب کنید', 'error');
    if (!name.trim()) return notify('نام کارت را بنویسید', 'error');
    setUploading(true);
    setUpPhase(0);
    const timers = [
      setTimeout(() => setUpPhase(1), 500),
      setTimeout(() => setUpPhase(2), 1600),
    ];
    try {
      const r = await request.postForm('/api/admin/photo-cards/designs', {
        file,
        // پشت فقط وقتی فرستاده می‌شود که انتخاب شده باشد؛ سرور نبودش
        // را «کارتِ یک‌طرفه» تفسیر می‌کند نه خطا.
        files: fileBack ? { imageBack: fileBack } : {},
        fields: {
          name: name.trim(),
          pointValue: points || 0,
          cashAmount: cash || 0,
          duelAttack: duel.attack || 50,
          duelDefense: duel.defense || 50,
          duelSpeed: duel.speed || 50,
          duelTechnique: duel.technique || 50,
          duelGoalChance: duel.goalChance || 50,
          duelEnergy: duel.energy || 100,
          duelRarity: duel.rarity || 'normal',
          duelEffect: duel.effect || 'none',
          // رشته و نه boolean: postForm بدنه را multipart می‌سازد و آنجا
          // همه‌چیز رشته است. سرور با collectibleInput هر دو را می‌فهمد.
          isCollectible: collectible ? 'true' : 'false',
          // اگر مدیر کد نوشته باشد، در **همان تراکنش** به این کارت گره
          // می‌خورد. درخواستِ دوم یعنی احتمالِ کارتِ بدونِ کد.
          ...(ownCodes.trim() ? { rawCodes: ownCodes } : {}),
          ...(ownBatch.trim() ? { batchLabel: ownBatch.trim() } : {}),
        },
      });
      notify(r.message || 'کارت ثبت شد', 'success');
      pickFile(null);
      pickBack(null);
      setName(''); setPoints(''); setCash('');
      setDuel({ attack: '50', defense: '50', speed: '50', technique: '50',
        goalChance: '50', energy: '100', rarity: 'normal', effect: 'none' });
      setCollectible(false);
      setOwnCodes(''); setOwnBatch('');
      loadCodes();
      loadDesigns();
    } catch (e) {
      notify(e.message, 'error');
    } finally {
      timers.forEach(clearTimeout);
      setUploading(false);
      setUpPhase(0);
    }
  }

  async function toggleCard(card) {
    try {
      await request(`/api/admin/photo-cards/card-types/${card.card_type_id}`, {
        method: 'PATCH', body: { isActive: !card.is_active },
      });
      notify(card.is_active ? 'کارت و همهٔ تصاویرش غیرفعال شدند' : 'کارت و همهٔ تصاویرش فعال شدند', 'success');
      loadDesigns();
    } catch (e) { notify(e.message, 'error'); }
  }

  async function deleteCard(card) {
    const ok = await confirmAction({
      title: `حذف کارت «${card.card_type_name}»`,
      description: 'روی کارت، پشت کارت و کدهای هرگز مصرف‌نشده با هم حذف می‌شوند. اگر این کارت سابقهٔ کاربر یا کد مصرف‌شده داشته باشد، سرور برای حفظ سابقه اجازهٔ حذف نمی‌دهد.',
      confirmLabel: 'حذف کامل کارت',
      danger: true,
    });
    if (!ok) return;
    setDeletingCardId(card.card_type_id);
    try {
      const result = await request(`/api/admin/photo-cards/card-types/${card.card_type_id}`, {
        method: 'DELETE',
      });
      notify(result.message || 'کارت حذف شد', 'success');
      if (editingCard?.card_type_id === card.card_type_id) setEditingCard(null);
      await Promise.all([loadDesigns(), loadCodes(), loadCodeList(), loadOptions()]);
    } catch (e) {
      notify(e.message, 'error');
    } finally {
      setDeletingCardId(null);
    }
  }


  /**
   * فهرستِ نوعِ کارت‌ها برای منویِ انتخاب.
   *
   * از کارت‌های گروه‌بندی‌شده مشتق می‌شود و نه یک درخواستِ جدا: همان
   * `card_type_id` و نام را دارد و هر کارت دقیقاً یک گزینه می‌شود.
   */
  const cardTypeOptions = (() => {
    const seen = new Map();
    for (const card of cards || []) {
      if (card.card_type_id && !seen.has(card.card_type_id)) {
        seen.set(card.card_type_id, {
          id: card.card_type_id, name: card.card_type_name || '—',
        });
      }
    }
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name, 'fa'));
  })();

  /** نوعِ کارتِ انتخاب‌شده را روی کلِ یک دستهٔ ثبت‌شده اعمال می‌کند. */
  async function assignBatchType() {
    if (!label.trim()) {
      return notify('اول دسته را انتخاب کنید', 'error');
    }
    setAssignBusy(true);
    try {
      const r = await request('/api/admin/photo-cards/codes/assign-type', {
        method: 'POST',
        body: { batchLabel: label.trim(), cardTypeId: codeType || null },
      });
      notify(r.message, 'success');
      loadCodes();
    } catch (e) {
      notify(e.message, 'error');
    } finally {
      setAssignBusy(false);
    }
  }

  /**
   * حذفِ گروهیِ همهٔ کدهای استفاده‌نشده/باطلِ یک دسته.
   *
   * مسیر `bulk-delete` از قبل در بک‌اند بود (برای وقتی ۱۵هزار کد اشتباه
   * وارد شده) ولی هیچ دکمه‌ای نداشت. چون «حذف» برگشت‌ناپذیر است، دو
   * تأیید می‌گیریم و نام دسته را باید عیناً تایپ کند. کدهای مصرف‌شده به‌
   * هیچ‌وجه حذف نمی‌شوند (سرور هم تضمین می‌کند) و شمار باقی‌مانده گزارش
   * می‌شود.
   */
  async function deleteBatch(b) {
    const name = b.batch_label;
    const first = await confirmAction({
      title: `حذف کدهای دستهٔ «${name}»؟`,
      message: `فقط کدهای آزاد و باطلِ این دسته حذف می‌شوند (${fmtNumber(b.count || 0)} کد در این دسته). کدهای مصرف‌شده دست‌نخورده می‌مانند. این عملیات برگشت‌پذیر نیست.`,
      confirmText: 'ادامه',
      danger: true,
    });
    if (!first) return;
    const typed = await promptText({
      title: `برای تأیید، نام دسته را تایپ کنید`,
      description: `نام دسته را دقیقاً بنویسید: ${name}`,
      placeholder: name,
    });
    if ((typed || '').trim() !== name) {
      return notify('نام دسته درست تایپ نشد؛ حذف لغو شد', 'error');
    }
    try {
      const r = await request('/api/admin/photo-cards/codes/bulk-delete', {
        method: 'POST',
        body: { batchLabel: name },
      });
      notify(r.message || 'دسته حذف شد', 'success');
      loadCodes();
    } catch (e) {
      notify(e.message, 'error');
    }
  }

  /**
   * کدها را همان‌طور که مدیر نوشته می‌فرستد.
   *
   * شمارشِ محلی فقط برای نمایش است؛ تفکیک و اعتبارسنجیِ واقعی سمت سرور
   * انجام می‌شود. اگر اینجا هم منطق تفکیک را می‌نوشتم، دو جا برای واگرا
   * شدن داشتیم و روزی یکی «۱۵۰۰۰ کد» می‌گفت و دیگری ۱۴۹۸۷ ثبت می‌کرد.
   */
  async function saveCodes() {
    if (!rawCodes.trim()) return notify('کدها را وارد کنید', 'error');
    setSaving(true);
    setReport(null);
    try {
      const r = await request('/api/admin/photo-cards/codes', {
        method: 'POST',
        body: {
          rawCodes,
          batchLabel: label.trim() || undefined,
          cardTypeId: codeType || undefined,
        },
      });
      setReport(r);
      notify(r.message, r.insertedCount ? 'success' : 'error');
      if (r.insertedCount) setRawCodes('');
      loadCodes();
    } catch (e) {
      notify(e.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  // شمارشِ تقریبی برای نمایشِ زنده زیر کادر. همان جداکننده‌های سرور.
  const typedCount = rawCodes.split(/[\n,;\t، ]+/).filter(Boolean).length;

  async function saveEdit() {
    if (!editing) return;
    try {
      await request(`/api/admin/photo-cards/codes/${editing.id}`, {
        method: 'PATCH', body: { code: editing.code },
      });
      notify('کد ویرایش شد', 'success');
      setEditing(null);
      loadCodeList();
      loadCodes();
    } catch (e) { notify(e.message, 'error'); }
  }

  async function removeCode(c) {
    const okGo = await confirmAction({
      title: `حذف کد ${c.code}`,
      message: 'این کد برای همیشه حذف می‌شود. اگر فقط می‌خواهید موقتاً '
        + 'از دسترس خارج شود، به‌جایش «ابطال» را بزنید.',
      confirmText: 'حذف کن',
      danger: true,
    });
    if (!okGo) return;
    try {
      await request(`/api/admin/photo-cards/codes/${c.id}`, { method: 'DELETE' });
      notify('کد حذف شد', 'success');
      loadCodeList();
      loadCodes();
    } catch (e) { notify(e.message, 'error'); }
  }

  async function voidCode(c) {
    try {
      await request(`/api/admin/photo-cards/codes/${c.id}/void`, {
        method: 'PATCH', body: { reason: 'ابطال دستی' },
      });
      notify('کد باطل شد', 'success');
      loadCodeList();
      loadCodes();
    } catch (e) { notify(e.message, 'error'); }
  }

  async function restoreCode(c) {
    try {
      await request(`/api/admin/photo-cards/codes/${c.id}`, {
        method: 'PATCH', body: { status: 'unused' },
      });
      notify('کد به چرخه برگشت', 'success');
      loadCodeList();
      loadCodes();
    } catch (e) { notify(e.message, 'error'); }
  }

  async function decide(sub, approve) {
    let reason = '';
    // طرحی که مدیر انتخاب کرده؛ اگر انتخاب نکرده، حدسِ موتور.
    const designId = picks[sub.id] || null;

    // ── وقتی موتور حدسی ندارد، انتخاب الزامی است ──
    // بدون آن سرور ۴۰۰ می‌دهد؛ بهتر است همین‌جا جلویش گرفته شود تا
    // مدیر پیام روشن‌تری ببیند.
    if (approve && !designId && !sub.design_image) {
      return notify('اول مشخص کنید این کد مربوط به کدام کارت است', 'error');
    }
    if (!approve) {
      const okGo = await confirmAction({
        title: 'رد کردن این ثبت',
        message: 'کد آزاد می‌شود و کاربر می‌تواند دوباره با عکس بهتر تلاش کند.',
        confirmText: 'رد کن',
        danger: true,
      });
      if (!okGo) return;
      reason = 'عکس با کارت مطابقت نداشت';
    }
    try {
      await request(`/api/admin/photo-cards/submissions/${sub.id}/decide`, {
        method: 'POST',
        body: { approve, reason, ...(designId ? { designId } : {}) },
      });
      notify(approve ? 'تأیید شد' : 'رد شد', 'success');
      loadSubs(subFilter);
      loadCodes();
    } catch (e) { notify(e.message, 'error'); }
  }

  const pendingCount = subFilter === 'pending' && subs ? subs.length : null;

  return (
    <div className="stack-lg">

      {/* ───────── ۱. آپلود عکس خام ───────── */}
      <Card
        title="۱ · تعریف کارت (عکس + امتیاز + کد اختصاصی)"
        subtitle="عکس باکیفیت کارت را بگذارید. اگر می‌دانید کدام کدها روی همین کارت چاپ شده‌اند، همین‌جا واردشان کنید تا ثبتِ کاربر تقریباً همیشه خودکار تأیید شود."
      >
        <div className="photoUploadGrid">
          <div>
            {/* ══════════════════════════════════════════════════════════
                دو عکس: روی کارت و پشتِ کارت
                ══════════════════════════════════════════════════════════

                هر عکس طرحِ مستقلِ خودش می‌شود ولی هر دو به یک کارت وصل
                می‌شوند. کاربر از هر طرف عکس بگیرد، به همان بازیکن
                می‌رسد و کدش درست مصرف می‌شود.

                چرا ادغام نمی‌شوند: شباهتِ تصویریِ رو و پشت فقط ۰.۳۸
                اندازه‌گیری شد — کمتر از شباهتِ دو بازیکنِ متفاوت. یک
                اثرانگشتِ مشترک هر دو را خراب می‌کرد. */}
            <Field label="روی کارت">
              {/* label به‌جای دکمه: کلیک روی کل ناحیه فایل را باز می‌کند */}
              <label className="photoDrop">
                {preview
                  ? <img src={preview} alt="پیش‌نمایش روی کارت" />
                  : (
                    <span className="photoDropHint">
                      <ImageIcon size={26} />
                      <b>انتخاب عکسِ رو</b>
                      <small>PNG یا JPG — هرچه باکیفیت‌تر بهتر</small>
                    </span>
                  )}
                <input
                  type="file" accept="image/*" hidden
                  onChange={e => pickFile(e.target.files?.[0])}
                />
              </label>
            </Field>
            <Field label="پشت کارت (اختیاری)">
              <label className="photoDrop">
                {previewBack
                  ? <img src={previewBack} alt="پیش‌نمایش پشت کارت" />
                  : (
                    <span className="photoDropHint">
                      <ImageIcon size={26} />
                      <b>انتخاب عکسِ پشت</b>
                      <small>اگر پشتِ کارت هم طرح دارد</small>
                    </span>
                  )}
                <input
                  type="file" accept="image/*" hidden
                  onChange={e => pickBack(e.target.files?.[0])}
                />
              </label>
            </Field>
            <p className={`topbar-sub codeTypeHint${fileBack ? ' ok' : ''}`}>
              {fileBack
                ? 'هر دو عکس آنالیز می‌شوند — کاربر از هر طرف عکس '
                  + 'بگیرد شناخته می‌شود.'
                : 'ℹ️ اگر پشتِ کارت هم طرح دارد اضافه‌اش کنید، وگرنه '
                  + 'کاربری که از پشت عکس بگیرد شناخته نمی‌شود.'}
            </p>
          </div>
          <div className="stack">
            <Field label="نام کارت"
              hint="همین نام در اعلانِ کاربر («… بابت کارت «نام» واریز شد») و در پیغامِ «طرحِ این کارت با «نامِ دیگر» یکی است» نوشته می‌شود؛ کارتِ بی‌نام یعنی اعلانِ بی‌نام.">
              <Input value={name} onChange={e => setName(e.target.value)}
                placeholder="مثلاً: امباپه — فرانسه" />
            </Field>
            <Field label="امتیاز این کارت"
              hint="بعد از ثبت به موجودیِ کاربر اضافه می‌شود و در قدرتِ دوئل هم مصرف دارد: √امتیاز ÷ ۳٫۲، اما حداکثر ۲۲ واحد — یعنی از ۵۰۰۰ به بعد، افزایشِ امتیاز کارت را قوی‌تر نمی‌کند.">
              <Input type="number" min="0" value={points}
                onChange={e => setPoints(e.target.value)} placeholder="مثلاً 3000" />
            </Field>
            <Field label="جایزهٔ نقدی (تومان، اختیاری)"
              hint="بزرگ‌تر از صفر یعنی هنگامِ ثبتِ همین کارت مبلغ به کیف پول کاربر واریز شود؛ برای کارت‌هایِ نقدی کمیسیونِ ۵٪ معرف عمداً پرداخت نمی‌شود تا بودجه دو بار خرج نشود.">
              <Input type="number" min="0" value={cash}
                onChange={e => setCash(e.target.value)} placeholder="0" />
            </Field>

            {/* ══════════════════════════════════════════════════════════
                نوعِ کارت: بازی یا کلکسیونی
                ══════════════════════════════════════════════════════════

                این سوییچ باید **بالای** بخشِ استاتس باشد، چون تصمیمش آن
                بخش را حذف می‌کند. اگر پایین‌تر بود، مدیر اول استاتس را پر
                می‌کرد و بعد می‌فهمید لازم نبوده. */}
            <div className={`card cardKindBox${collectible ? ' isCollectible' : ''}`}
              style={{ padding: 12 }}>
              <label className="cardKindRow">
                <input type="checkbox" checked={collectible}
                  onChange={e => setCollectible(e.target.checked)} />
                <span>
                  <b>کارت کلکسیونی است (برای بازی نیست)</b>
                  <span className="topbar-sub" style={{ display: 'block' }}>
                    {collectible
                      ? 'فقط جمع‌آوری: در اینونتوری و جوایز دیده می‌شود، '
                        + 'ولی در آرنای دوئل قابل انتخاب نیست.'
                      : 'کارت بازی: در آرنای دوئل قابل استفاده است و '
                        + 'استاتس می‌خواهد.'}
                  </span>
                </span>
              </label>
            </div>

            {!collectible && (
            <div className="card" style={{ padding: 12 }}>
              <b>استات دوئل کارت</b>
              <p className="topbar-sub">برای بازی زندهٔ پنج‌کارتی؛ ۰ تا ۱۰۰.</p>
              <div className="card-grid cols-2">
                {[
                  ['attack', 'حمله'], ['defense', 'دفاع'], ['speed', 'سرعت'],
                  ['technique', 'تکنیک'], ['goalChance', 'شانس گل'], ['energy', 'انرژی'],
                ].map(([k, label]) => (
                  <Field key={k} label={label}>
                    <Input type="number" min="0" max="100" value={duel[k]}
                      onChange={e => setDuel(d => ({ ...d, [k]: e.target.value }))} />
                  </Field>
                ))}
              </div>
              <div className="card-grid cols-2">
                <Field label="کلاس کارت"
              hint="به قدرتِ دوئل عددِ ثابت اضافه می‌کند (معمولی ۰، نقره‌ای ۵، طلایی ۱۰، پرمیوم ۱۶، لجند ۲۴) و شانسِ افتِ همین کارت از جعبه هم با همین نام‌ها تنظیم می‌شود.">
                  <select value={duel.rarity}
                    onChange={e => setDuel(d => ({ ...d, rarity: e.target.value }))}>
                    <option value="normal">معمولی</option>
                    <option value="silver">نقره‌ای</option>
                    <option value="gold">طلایی</option>
                    <option value="premium">پرمیوم</option>
                    <option value="legend">لجند</option>
                  </select>
                </Field>
                <Field label="افکت خاص"
              hint="امتیازِ هر راند را عوض می‌کند، نه استات‌ها را: سرعتی راندِ اول را بالا می‌برد، فینیشر راندِ آخر را ۲۰ تا زیاد و بقیه را ۱۰ تا کم می‌کند، دیوار دفاعی راندِ چهارم را محکم می‌کند.">
                  <select value={duel.effect}
                    onChange={e => setDuel(d => ({ ...d, effect: e.target.value }))}>
                    <option value="none">بدون افکت</option>
                    <option value="finisher">فینیشر</option>
                    <option value="wall">دیوار دفاعی</option>
                    <option value="speedster">سرعتی</option>
                    <option value="playmaker">بازی‌ساز</option>
                    <option value="lucky_star">ستاره خوش‌شانس</option>
                  </select>
                </Field>
              </div>
            </div>
            )}

            {/* ══════════════════════════════════════════════════════════
                کدهای اختصاصیِ همین کارت — اختیاری
                ══════════════════════════════════════════════════════════

                تفاوتِ اصلیِ دو حالت اینجاست:

                • اگر کد بنویسید، آن کدها «نام‌دار» می‌شوند: سیستم
                  می‌داند مالِ همین کارت‌اند. کاربر که عکس + کد بفرستد،
                  کافی است عکس فقط ۲۰٪ شبیه باشد تا خودکار تأیید شود.

                • اگر خالی بگذارید، فقط طرح ثبت می‌شود و تشخیص کاملاً
                  به عهدهٔ تصویر است (آستانهٔ ۴۰٪). */}
            <Field label="کدهای اختصاصی این کارت (اختیاری — هر خط یک کد)">
              <Textarea
                rows={4}
                dir="ltr"
                className="codeInput"
                value={ownCodes}
                onChange={e => setOwnCodes(e.target.value)}
                placeholder={'GHP-A2B3-C4D5\nGHP-X7K9-M1N2\n…'}
              />
            </Field>
            {ownCodes.trim() && (
              <Field label="برچسب این دسته (اختیاری)">
                <Input value={ownBatch} onChange={e => setOwnBatch(e.target.value)}
                  placeholder="مثلاً: چاپ مهر ۱۴۰۵ — سری آبی" />
              </Field>
            )}
            <p className={`topbar-sub codeTypeHint${ownCodes.trim() ? ' ok' : ''}`}>
              {ownCodes.trim()
                ? 'این کدها به همین کارت گره می‌خورند — ثبتِ کاربر با '
                  + 'شباهت ۲۰٪ هم خودکار تأیید می‌شود.'
                : 'بدون کد اختصاصی، فقط طرح ثبت می‌شود و تشخیص از روی '
                  + 'عکس انجام می‌گیرد (آستانهٔ ۴۰٪).'}
            </p>

            {uploading && (
              <p className="topbar-sub uploadPhase">
                {UPLOAD_STEPS[upPhase]}
              </p>
            )}
            <Button icon={Upload} loading={uploading} onClick={uploadDesign}>
              {ownCodes.trim()
                ? `ثبت کارت${fileBack ? ' (رو و پشت)' : ''} و کدهای آن`
                : `ثبت کارت${fileBack ? ' (رو و پشت)' : ''}`}
            </Button>
          </div>
        </div>
      </Card>


      {/* ───────── طرح‌ها و کارت‌های ثبت‌شده ───────── */}
      <Card
        title={`کارت‌های ثبت‌شده (${cards ? cards.length : 0})`}
        subtitle="هر ردیف یک کارت است؛ تصاویر رو و پشت فقط نمونه‌های مستقل تشخیص همان کارت‌اند. ویرایش، کدها، وضعیت و حذف روی کل کارت اعمال می‌شود."
      >
        {cards === null && <Skeleton height={90} />}
        {cards && cards.length === 0 && (
          <EmptyState icon={ImageIcon} title="هنوز کارتی ثبت نشده"
            message="اولین کارت را با عکس رو و در صورت وجود عکس پشت، از بالا ثبت کنید." />
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
          {(cards || []).map(card => (
            <GroupedCardTile
              key={card.card_type_id}
              card={card}
              deleting={deletingCardId === card.card_type_id}
              onEdit={openEditCard}
              onToggle={toggleCard}
              onDelete={deleteCard}
            />
          ))}
        </div>
      </Card>

      {editingCard && (
        <EditGroupedCardModal
          card={editingCard}
          request={request}
          notify={notify}
          onClose={() => setEditingCard(null)}
          onSaved={() => {
            loadDesigns();
            loadCodes();
            loadCodeList();
          }}
        />
      )}

      {/* ───────── ۲. بانک کد ───────── */}
      <Card
        title="۲ · بانک کد مشترک (کدهایی که نمی‌دانید مالِ کدام کارت‌اند)"
        subtitle="کارت‌های قدیمی که هنگام چاپ مشخص نشد کدام کد روی کدام کارت رفت. تشخیص کاملاً از روی عکسِ کاربر: بالای ۴۰٪ شباهت خودکار، کمتر از آن به صف بررسی شما."
        action={
          <Button
            variant="secondary" icon={Download}
            onClick={() => request.download(
              '/api/admin/photo-cards/codes/export', 'photo-card-codes.csv',
            ).catch(e => notify(e.message, 'error'))}
          >
            خروجی CSV
          </Button>
        }
      >
        {stats && (
          <div className="statRow">
            <div className="statPill"><b>{fmtNumber(stats.total)}</b><span>کل</span></div>
            <div className="statPill ok"><b>{fmtNumber(stats.unused)}</b><span>آزاد</span></div>
            <div className="statPill warn"><b>{fmtNumber(stats.reserved)}</b><span>در بررسی</span></div>
            <div className="statPill used"><b>{fmtNumber(stats.used)}</b><span>مصرف‌شده</span></div>
          </div>
        )}
        {/* ── ورودِ کد: دانه‌ای یا انبوه، در یک کادر ──
            کادر متنی چندخطی هر دو حالت را پوشش می‌دهد: یک کد در یک خط،
            یا ۱۵ هزار کد چسبانده‌شده از اکسل. دو فرم جدا فقط مدیر را
            مجبور می‌کرد بین دوتاشان انتخاب کند بدون اینکه سودی داشته
            باشد. */}
        <Field label="کدها — هر خط یک کد (یا با کاما/فاصله جدا کنید)"
              hint="کدها بزرگ‌حرف می‌شوند، رقمِ فارسی به لاتین تبدیل می‌شود و فاصله/نقطه به خط تیره؛ بعد ۴ تا ۶۴ نویسهٔ A-Z/۰-۹/- می‌ماند. کدِ تکراری بی‌سروصدا رد می‌شود و در گزارشِ «چند کد ثبت شد» می‌بینید چند تا رد شده‌اند.">
          <Textarea
            rows={7}
            dir="ltr"
            className="codeInput"
            value={rawCodes}
            onChange={e => setRawCodes(e.target.value)}
            placeholder={'GHP-A2B3-C4D5\nGHP-X7K9-M1N2\n…'}
          />
        </Field>
        <div className="codeMetaRow">
          <span className="topbar-sub">
            {typedCount > 0
              ? `${fmtNumber(typedCount)} کد نوشته‌اید`
              : 'کدهایی که روی کارت‌ها چاپ شده را اینجا وارد کنید'}
          </span>
        </div>
        {/* ══════════════════════════════════════════════════════════════
            انتخابِ کارت — مهم‌ترین تصمیمِ این فرم
            ══════════════════════════════════════════════════════════════

            دو جنسِ کاملاً متفاوت از کد داریم:

            • «نمی‌دانم» (پیش‌فرض) — کارت‌های قدیمی که نمی‌دانیم کدام کد
              روی کدام کارت چاپ شده. تشخیص کاملاً به عهدهٔ عکس است و
              آستانه سخت‌گیر می‌ماند.

            • یک کارتِ مشخص — کارت‌های جدید که دسته‌بندی‌شان را می‌دانیم.
              آن‌وقت خودِ کد مدرکِ مالکیت است و عکس فقط باید نشان دهد
              کاربر کارتِ فیزیکی را در دست دارد. آستانه به ۲۰٪ می‌افتد
              و تقریباً همهٔ ثبت‌ها خودکار تأیید می‌شوند.

            پیش‌فرض عمداً «نمی‌دانم» است: انتخابِ اشتباهِ یک کارت بدتر
            از انتخاب نکردن است — کاربر امتیازِ کارتِ دیگری می‌گیرد. */}
        <Field label="این کدها روی کدام کارت چاپ می‌شوند؟"
              hint="کارتِ انتخاب‌شده «نامِ کد» می‌شود: اگر کاربر عکس و کد را با هم بفرستد، عکس از ۲۰٪ شباهت هم خودکار تأیید می‌شود؛ بدونِ انتخابِ کارت، تشخیص فقط با آستانهٔ ۴۰٪ انجام می‌گیرد.">
          <select className="input" value={codeType}
            onChange={e => setCodeType(e.target.value)}>
            <option value="">نمی‌دانم — تشخیص از روی عکس</option>
            {cardTypeOptions.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </Field>
        {codeType ? (
          <p className="topbar-sub codeTypeHint ok">
            ثبت این کدها تقریباً همیشه خودکار تأیید می‌شود — کاربر فقط
            باید عکسی از کارت بفرستد، حتی اگر کیفیتش پایین باشد.
          </p>
        ) : (
          <p className="topbar-sub codeTypeHint">
            بدون انتخاب کارت، تشخیص فقط از روی عکس انجام می‌شود و
            عکس‌های نامفهوم به صف بررسی شما می‌روند.
          </p>
        )}

        <div className="photoCodeForm">
          <Field label="برچسب دسته (اختیاری)">
            <Input value={label} onChange={e => setLabel(e.target.value)}
              placeholder="مثلاً: چاپ مهر ۱۴۰۵" />
          </Field>
          <Button icon={KeyRound} loading={saving} onClick={saveCodes}>
            ثبت کدها
          </Button>
        </div>

        {/* ── تخصیصِ گروهی به دستهٔ موجود ──
            مدیری که قبلاً کدها را بدون کارت وارد کرده، بدون این دکمه
            بن‌بست است: کدها چاپ و توزیع شده‌اند و حذفشان ممکن نیست. */}
        {batches.length > 0 && (
          <div className="assignBox">
            <b>تغییر کارتِ یک دستهٔ ثبت‌شده</b>
            <p className="topbar-sub">
              کدهای مصرف‌نشدهٔ دسته را به کارتِ بالا گره می‌زند. اگر
              «نمی‌دانم» انتخاب باشد، گره باز می‌شود.
            </p>
            <div className="assignRow">
              <select className="input" value={label}
                onChange={e => setLabel(e.target.value)}>
                <option value="">— دسته را انتخاب کنید —</option>
                {batches.map(b => (
                  <option key={b.batch_label} value={b.batch_label}>
                    {b.batch_label} ({fmtNumber(b.total)} کد)
                  </option>
                ))}
              </select>
              <Button variant="ghost" loading={assignBusy}
                onClick={assignBatchType}>
                اعمال روی دسته
              </Button>
            </div>
          </div>
        )}

        {/* ── گزارش تفکیک‌شده ──
            «۱۴٬۹۸۷ کد ثبت شد» به‌تنهایی بی‌فایده است — مدیر باید بداند
            کدام‌ها جا افتادند و چرا. */}
        {report && (
          <div className="codeReport">
            <div className="crRow">
              <Badge tone="success">{fmtNumber(report.insertedCount)} ثبت شد</Badge>
              {report.duplicateInDbCount > 0 && (
                <Badge tone="warning">
                  {fmtNumber(report.duplicateInDbCount)} از قبل بود
                </Badge>
              )}
              {report.duplicateInFileCount > 0 && (
                <Badge tone="warning">
                  {fmtNumber(report.duplicateInFileCount)} تکراری در ورودی
                </Badge>
              )}
              {report.invalidCount > 0 && (
                <Badge tone="danger">{fmtNumber(report.invalidCount)} نامعتبر</Badge>
              )}
            </div>

            {report.invalidCount > 0 && (
              <p className="crList">
                نامعتبر: <code>{report.invalid.join('، ')}</code>
              </p>
            )}
            {report.duplicateInDbCount > 0 && (
              <p className="crList">
                از قبل موجود: <code>{report.duplicateInDb.join('، ')}</code>
              </p>
            )}
          </div>
        )}
        {batches.length > 0 && (
          <div className="batchList">
            {batches.map(b => (
              <div key={b.batch_label} className="batchItem">
                <b>{b.batch_label}</b>
                <span>{fmtNumber(b.count)} کد</span>
                <small>{fmtDateTime(b.created_at)}</small>
                <button
                  type="button"
                  className="batchDelBtn"
                  title="حذف کدهای آزاد/باطل این دسته"
                  onClick={() => deleteBatch(b)}
                  style={{ marginInlineStart: 'auto', border: 'none', background: 'transparent', color: 'var(--gg-danger, #ef4444)', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}
                >
                  حذف دسته
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* ───────── فهرست و مدیریتِ کدها ───────── */}
      <Card
        title="کدهای ثبت‌شده"
        subtitle="ویرایش یا حذف فقط برای کدهای استفاده‌نشده ممکن است — کدِ مصرف‌شده امتیاز داده و در مجموعهٔ کاربر نشسته."
        action={
          <div className="segmented">
            {[['unused', 'آزاد'], ['used', 'مصرف‌شده'],
              ['reserved', 'در بررسی'], ['voided', 'باطل']].map(([k, t]) => (
                <button key={k} className={codeFilter === k ? 'on' : ''}
                  onClick={() => setCodeFilter(k)}>{t}</button>
              ))}
          </div>
        }
      >
        <div className="codeSearchRow">
          <Input
            value={codeQuery}
            placeholder="جست‌وجوی کد…"
            dir="ltr"
            onChange={e => setCodeQuery(e.target.value)}
          />
        </div>

        {codes.length === 0 && (
          <EmptyState icon={KeyRound} title="کدی در این دسته نیست"
            message="فیلتر را عوض کنید یا کد جدید وارد کنید." />
        )}

        {/* ══════════════════════════════════════════════════════════════
            کدهای نام‌دار — زیرِ نامِ خودِ بازیکن
            ══════════════════════════════════════════════════════════════

            هر بازیکن یک ردیفِ بسته است که تعدادِ کدهایش را نشان می‌دهد.
            کلیک که شود، فقط کدهای همان بازیکن باز می‌شوند.

            چرا این مهم بود: با ۱۰۰۰ کد برای هر کارت، فهرستِ تخت یعنی
            چند هزار ردیف پشت سر هم — مدیر برای رسیدن به بازیکنِ دوم
            باید بی‌نهایت اسکرول می‌کرد. حالا هر بازیکن یک خط است. */}
        {codeGroups.named.map(g => {
          const open = openGroup === g.name;
          return (
            <div key={g.name} className={`codeGroup${open ? ' open' : ''}`}>
              <button
                type="button"
                className="codeGroupHead"
                onClick={() => setOpenGroup(open ? null : g.name)}
              >
                <span className="codeGroupName">{g.name}</span>
                <span className="codeGroupCount">
                  {fmtNumber(g.list.length)} کد
                </span>
                <span className="codeGroupChevron">{open ? '▲' : '▼'}</span>
              </button>
              {open && (
                <div className="codeList">
                  {g.list.map(c => (
            <div key={c.id} className="codeRow">
              {editing?.id === c.id ? (
                <>
                  <Input
                    className="codeEditInput"
                    dir="ltr"
                    value={editing.code}
                    onChange={e => setEditing({ ...editing, code: e.target.value })}
                    onKeyDown={e => { if (e.key === 'Enter') saveEdit(); }}
                  />
                  <div className="codeRowActions">
                    <Button size="sm" icon={Check} onClick={saveEdit}>ذخیره</Button>
                    <Button size="sm" variant="secondary"
                      onClick={() => setEditing(null)}>انصراف</Button>
                  </div>
                </>
              ) : (
                <>
                  <code className="codeVal">{c.code}</code>
                  <div className="codeMeta">
                    {c.batch_label && <span className="codeBatch">{c.batch_label}</span>}
                    {/* کارتی که کد **از پیش** به آن گره خورده. با
                        `card_type_name` فرق دارد: آن نتیجهٔ تطبیقِ عکس
                        بعد از مصرف است، این تصمیمِ مدیر پیش از توزیع.
                        نشانِ 🔗 تفکیکشان را در یک نگاه ممکن می‌کند. */}
                    {c.expected_card_type_name && (
                      <Badge tone="info">{c.expected_card_type_name}</Badge>
                    )}
                    {c.card_type_name && (
                      <Badge tone="success">{c.card_type_name}</Badge>
                    )}
                    {c.used_by_mobile && (
                      <span className="topbar-sub">{c.used_by_mobile}</span>
                    )}
                  </div>
                  <div className="codeRowActions">
                    {/* ── چرا دکمه‌ها بر پایهٔ وضعیت‌اند ──
                        کدِ مصرف‌شده امتیاز داده و در اینونتوری نشسته؛
                        ویرایش یا حذفش سابقه را دروغ می‌کند. سرور هم
                        جلویش را می‌گیرد، ولی نشان دادنِ دکمه‌ای که
                        همیشه خطا می‌دهد بدترین نوعِ رابط است. */}
                    {(c.status === 'unused' || c.status === 'voided') && (
                      <>
                        <IconButton icon={Pencil} title="ویرایش"
                          onClick={() => setEditing({ id: c.id, code: c.code })} />
                        <IconButton icon={Trash2} title="حذف" variant="danger"
                          onClick={() => removeCode(c)} />
                      </>
                    )}
                    {c.status === 'unused' && (
                      <IconButton icon={Ban} title="ابطال"
                        onClick={() => voidCode(c)} />
                    )}
                    {c.status === 'voided' && (
                      <IconButton icon={RotateCcw} title="بازگرداندن"
                        onClick={() => restoreCode(c)} />
                    )}
                  </div>
                </>
              )}
            </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {/* ══════════════════════════════════════════════════════════════
            بانکِ کدِ بی‌نام — بخشِ جدای خودش
            ══════════════════════════════════════════════════════════════

            خواستهٔ صریح مالک: «کد هایی که برای هیچ کارت بخصوصی مشخص
            نشدن هم باید در قسمت مخصوص خودشون ویرایش بشن».

            این‌ها جنسِ متفاوتی دارند: تشخیصشان کاملاً به عکس وابسته است
            و آستانه‌شان سخت‌گیرتر (۴۰٪ به‌جای ۲۰٪). قاطی کردنشان با
            کدهای نام‌دار باعث می‌شد مدیر نفهمد کدام‌یک کدام است. */}
        {codeGroups.free.length > 0 && (
          <div className={`codeGroup free${openGroup === '__free__' ? ' open' : ''}`}>
            <button
              type="button"
              className="codeGroupHead"
              onClick={() => setOpenGroup(
                openGroup === '__free__' ? null : '__free__')}
            >
              <span className="codeGroupName">
                بدون کارتِ مشخص — تشخیص از روی عکس
              </span>
              <span className="codeGroupCount">
                {fmtNumber(codeGroups.free.length)} کد
              </span>
              <span className="codeGroupChevron">
                {openGroup === '__free__' ? '▲' : '▼'}
              </span>
            </button>
            {openGroup === '__free__' && (
              <div className="codeList">
                {codeGroups.free.map(c => (
            <div key={c.id} className="codeRow">
              {editing?.id === c.id ? (
                <>
                  <Input
                    className="codeEditInput"
                    dir="ltr"
                    value={editing.code}
                    onChange={e => setEditing({ ...editing, code: e.target.value })}
                    onKeyDown={e => { if (e.key === 'Enter') saveEdit(); }}
                  />
                  <div className="codeRowActions">
                    <Button size="sm" icon={Check} onClick={saveEdit}>ذخیره</Button>
                    <Button size="sm" variant="secondary"
                      onClick={() => setEditing(null)}>انصراف</Button>
                  </div>
                </>
              ) : (
                <>
                  <code className="codeVal">{c.code}</code>
                  <div className="codeMeta">
                    {c.batch_label && <span className="codeBatch">{c.batch_label}</span>}
                    {/* کارتی که کد **از پیش** به آن گره خورده. با
                        `card_type_name` فرق دارد: آن نتیجهٔ تطبیقِ عکس
                        بعد از مصرف است، این تصمیمِ مدیر پیش از توزیع.
                        نشانِ 🔗 تفکیکشان را در یک نگاه ممکن می‌کند. */}
                    {c.expected_card_type_name && (
                      <Badge tone="info">{c.expected_card_type_name}</Badge>
                    )}
                    {c.card_type_name && (
                      <Badge tone="success">{c.card_type_name}</Badge>
                    )}
                    {c.used_by_mobile && (
                      <span className="topbar-sub">{c.used_by_mobile}</span>
                    )}
                  </div>
                  <div className="codeRowActions">
                    {/* ── چرا دکمه‌ها بر پایهٔ وضعیت‌اند ──
                        کدِ مصرف‌شده امتیاز داده و در اینونتوری نشسته؛
                        ویرایش یا حذفش سابقه را دروغ می‌کند. سرور هم
                        جلویش را می‌گیرد، ولی نشان دادنِ دکمه‌ای که
                        همیشه خطا می‌دهد بدترین نوعِ رابط است. */}
                    {(c.status === 'unused' || c.status === 'voided') && (
                      <>
                        <IconButton icon={Pencil} title="ویرایش"
                          onClick={() => setEditing({ id: c.id, code: c.code })} />
                        <IconButton icon={Trash2} title="حذف" variant="danger"
                          onClick={() => removeCode(c)} />
                      </>
                    )}
                    {c.status === 'unused' && (
                      <IconButton icon={Ban} title="ابطال"
                        onClick={() => voidCode(c)} />
                    )}
                    {c.status === 'voided' && (
                      <IconButton icon={RotateCcw} title="بازگرداندن"
                        onClick={() => restoreCode(c)} />
                    )}
                  </div>
                </>
              )}
            </div>
                ))}
              </div>
            )}
          </div>
        )}

        {codes.length >= 300 && (
          <p className="topbar-sub">فقط ۳۰۰ کدِ اول نشان داده می‌شود — برای یافتن کدِ خاص از جست‌وجو استفاده کنید.</p>
        )}
      </Card>

      {/* ───────── وضعیت «حالت سایه»ٔ بردارِ عصبی (فاز ۲) ───────── */}
      {shadow && (
        <Card title="موتور تشخیص هوشمند — حالت آزمایشی (Shadow)"
          subtitle="مدل روی گوشی، عکس را به بردار معنایی تبدیل می‌کند و نظرش کنار تصمیم فعلی ذخیره می‌شود؛ هنوز در تأیید خودکار دخالت نمی‌کند تا دقتش روی دادهٔ واقعی به حدِ لازم برسد.">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            <div style={{ flex: '1 1 140px', padding: 12, borderRadius: 10, background: 'var(--bg-subtle, rgba(0,0,0,.04))' }}>
              <div className="topbar-sub">طرح‌های مرجع دارای بردار</div>
              <div style={{ fontSize: 24, fontWeight: 700 }}>{fmtNumber(shadow.embeddingRows)}</div>
            </div>
            <div style={{ flex: '1 1 140px', padding: 12, borderRadius: 10, background: 'var(--bg-subtle, rgba(0,0,0,.04))' }}>
              <div className="topbar-sub">ثبت‌های دارای نظر مدل</div>
              <div style={{ fontSize: 24, fontWeight: 700 }}>{fmtNumber(shadow.total)}</div>
            </div>
            <div style={{ flex: '1 1 140px', padding: 12, borderRadius: 10, background: 'var(--bg-subtle, rgba(0,0,0,.04))' }}>
              <div className="topbar-sub">نرخ توافق مدل با تصمیم نهایی</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: shadow.readyToActivate ? '#16a34a' : undefined }}>
                {shadow.agreementRate == null ? '–' : `${shadow.agreementRate}٪`}
              </div>
            </div>
          </div>
          <p className="topbar-sub" style={{ marginTop: 10 }}>
            {shadow.total < 100
              ? `هنوز داده کافی برای قضاوت نیست (حداقل ۱۰۰ ثبتِ دارای بردار لازم است). به‌محض اینکه اپ نسخهٔ فرستندهٔ بردار منتشر شود این اعداد شروع به پر شدن می‌کنند.`
              : shadow.readyToActivate
                ? `توافق از ${shadow.activateThresholdPct}٪ گذشته — می‌توان موتور هوشمند را به تأیید خودکار وصل کرد.`
                : `توافق هنوز به ${shadow.activateThresholdPct}٪ نرسیده؛ مدل در حالت سایه می‌ماند.`}
          </p>
        </Card>
      )}

      {/* ───────── هشدارِ سریِ کدِ غلط‌برچسبِ شرکت ───────── */}
      {mismatch && mismatch.length > 0 && (
        <Card
          title="هشدار: احتمالِ اشتباه در برچسبِ کدهای چاپ‌شده"
          subtitle="چند کاربرِ مختلف، کدِ یک کارت را با عکسِ کارتِ دیگری فرستاده‌اند. این الگو معمولاً یعنی شرکت هنگام چاپ، کد را روی کارتِ اشتباه گذاشته است."
        >
          <div className="stack">
            {mismatch.map((m, i) => (
              <div key={i} className="reviewRow" style={{
                border: '1px solid rgba(239,68,68,.35)', borderRadius: 10, padding: 12,
                background: 'rgba(239,68,68,.06)',
              }}>
                <div className="reviewBody">
                  <div className="reviewWhy">
                    <b><AlertTriangle size={15} style={{ verticalAlign: '-2px', color: '#ef4444' }} /> {fmtNumber(m.count)} ثبتِ ناسازگار</b>
                    <span>
                      کدِ «{m.expected_name}» روی عکسِ «{m.seen_name}» دیده شد.
                    </span>
                  </div>
                  <div className="topbar-sub">
                    آخرین مورد: {fmtDateTime(m.last_seen)}
                  </div>
                  <p className="topbar-sub" style={{ marginTop: 6 }}>
                    اقدام پیشنهادی: دستهٔ کدِ این سری را بررسی و در صورت تأیید،
                    از بخش «تغییر کارتِ یک دستهٔ ثبت‌شده» آن را به کارتِ درست
                    («{m.seen_name}») گره بزنید.
                  </p>
                </div>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button size="sm" variant="secondary" icon={RotateCcw}
                onClick={() => { loadMismatch(); loadSubs(subFilter); }}>
                بازخوانی
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* ───────── ۳. صف بررسی ───────── */}
      <Card
        title={`صف بررسی${pendingCount ? ` (${fmtNumber(pendingCount)})` : ''}`}
        subtitle="عکس‌هایی که سیستم مطمئن نبوده. تأیید یا رد شما نهایی است."
        action={
          <div className="segmented">
            {[['pending', 'در انتظار'], ['approved', 'تأییدشده'], ['rejected', 'ردشده']]
              .map(([k, t]) => (
                <button key={k} className={subFilter === k ? 'on' : ''}
                  onClick={() => setSubFilter(k)}>{t}</button>
              ))}
          </div>
        }
      >
        {subs === null && <Skeleton height={110} />}
        {subs && subs.length === 0 && (
          <EmptyState
            icon={CheckCircle2}
            title="چیزی در این فهرست نیست"
            message={subFilter === 'pending'
              ? 'همهٔ ثبت‌ها به‌صورت خودکار تعیین تکلیف شده‌اند.'
              : 'موردی یافت نشد.'}
          />
        )}
        {subs && subs.map(s => (
          <div key={s.id} className="reviewRow">
            <div className="reviewShots">
              <figure>
                <img src={assetUrl(s.userImageUrl)} alt="عکس کاربر" />
                <figcaption>عکس کاربر</figcaption>
              </figure>
              <ScanLine size={18} className="reviewArrow" />
              <figure>
                <img src={assetUrl(s.design_image)} alt="طرح پیشنهادی" />
                <figcaption>حدس سیستم</figcaption>
              </figure>
            </div>
            <div className="reviewBody">
              {/* ── چرا این پرونده اینجاست ──
                  تصمیمِ مدیر در دو حالت فرق می‌کند، پس علت باید صریح
                  باشد نه اینکه از روی درصد شباهت حدس زده شود. */}
              {s.review_reason === 'image_unknown' && (
                <div className="reviewWhy">
                  <b>کد معتبر است</b>
                  <span>ولی عکس با هیچ کارتی تطبیق نخورد.
                    مشخص کنید این کد مربوط به کدام کارت است.</span>
                </div>
              )}
              {(s.review_reason === 'code_mismatch_suspected'
                || s.review_reason === 'type_mismatch') && (
                <div className="reviewWhy" style={{
                  border: '1px solid rgba(239,68,68,.3)', background: 'rgba(239,68,68,.06)',
                  borderRadius: 8, padding: 8,
                }}>
                  <b><AlertTriangle size={14} style={{ verticalAlign: '-2px', color: '#ef4444' }} /> کد و عکس دو کارتِ متفاوت‌اند</b>
                  <span>
                    {s.review_reason === 'code_mismatch_suspected'
                      ? 'سیستم با اطمینانِ بالا کارتِ دیگری را در عکس دید، ولی چون این کارت جایزهٔ نقدی دارد خودکار اصلاح نکرد. کارتِ درست را از منوی پایین انتخاب و تأیید کنید؛ اگر این الگو تکرار شود ممکن است کدها روی کارتِ اشتباه چاپ شده باشند.'
                      : 'عکس با کارتی که کد می‌گوید هم‌خوان نیست. ممکن است عکس/کدِ دو کارت جابه‌جا شده باشند.'}
                  </span>
                </div>
              )}
              <b>{s.card_type_name || 'نامشخص'}</b>
              <div className="topbar-sub">
                {s.nickname || s.mobile} · کد {s.code || '—'}
                {s.point_value != null && ` · ${fmtNumber(s.point_value)} امتیاز`}
              </div>
              <div className="reviewMeta">
                {/* امتیاز تطبیق را نشان می‌دهیم چون مدیر باید بداند سیستم
                    چقدر مطمئن بوده — نه اینکه کورکورانه تأیید کند. */}
                <Badge tone={s.match_score >= 0.65 ? 'success' : 'warning'}>
                  شباهت {Math.round((s.match_score || 0) * 100)}٪
                </Badge>
                {s.match_margin != null && s.match_margin < 0.03 && (
                  <Badge tone="warning">
                    <AlertTriangle size={12} /> شبیه چند طرح
                  </Badge>
                )}
                <span className="topbar-sub">{fmtDateTime(s.created_at)}</span>
              </div>
              {s.reject_reason && <p className="topbar-sub">دلیل رد: {s.reject_reason}</p>}
            </div>
            {s.status === 'pending' && (
              <div className="reviewActions">
                {/* انتخابِ دستیِ طرح — خواستهٔ مالک.
                    پیش‌فرض حدسِ موتور است (اگر داشته باشد) تا در حالتِ
                    «کم‌اطمینان» مدیر مجبور به انتخاب دوباره نشود. */}
                <select
                  className="reviewPick"
                  value={picks[s.id] || ''}
                  onChange={e =>
                    setPicks(p => ({ ...p, [s.id]: e.target.value }))}
                >
                  <option value="">
                    {s.card_type_name
                      ? `پیش‌فرض: ${s.card_type_name}`
                      : '— انتخاب کارت —'}
                  </option>
                  {options.map(o => (
                    <option key={o.id} value={o.id}>
                      {o.card_type_name} ({fmtNumber(o.point_value)} امتیاز)
                    </option>
                  ))}
                </select>
                <Button size="sm" icon={CheckCircle2}
                  onClick={() => decide(s, true)}>تأیید</Button>
                <Button size="sm" variant="danger" icon={XCircle}
                  onClick={() => decide(s, false)}>رد</Button>
              </div>
            )}
            {s.status !== 'pending' && (
              <Badge tone={s.status === 'approved' ? 'success' : 'danger'}>
                {s.status === 'approved' ? 'تأییدشده' : 'ردشده'}
              </Badge>
            )}
          </div>
        ))}
      </Card>

      {/* The old flat per-image list was intentionally removed: showing front
          and back as separate editable cards caused duplicate counts and
          half-active cards. The grouped list above contains every action. */}
    </div>
  );
}
