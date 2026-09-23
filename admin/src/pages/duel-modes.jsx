// ── صفحهٔ «مود دوئل کارت» ───────────────────────────────────────────────
//
// چرا یک صفحهٔ جدا ساخته شد:
//
// خواستهٔ مالک این بود که کلیدِ روشن‌کردنِ مودِ دوم («دوئل طوفان») دستی از
// پنل زده شود، ولی در پنل پیدا نمی‌شد. آن کلید در کد بود؛ فقط **جای دیدنش**
// بد بود: دو فیلدِ عددیِ خام در فهرستِ بلندِ «عددهایی که در متن نوشته
// می‌شوند». مدیر باید از روی اسمِ انگلیسیِ متغیر حدس می‌زد کدام عدد
// کلیدِ کدام مود است.
//
// پس این صفحه سه کار می‌کند:
//   ۱. کلید را در یک ردیفِ NAV زیرِ گروهِ «بازی‌ها» می‌آورد («مود دوئل کارت»)
//      — همان گروهی که برای «اقتصاد بازی» و «امتیاز بازی» می‌رود.
//   ۲. وضعیت و پلکانِ مرحله‌ها را با زبانِ «چه کسی چه چیزی می‌بیند» نشان
//      می‌دهد، نه با شمارهٔ فنیِ مرحله.
//   ۳. برگشتِ امن می‌گذارد (خاموش‌کردنِ فوری + برگرداندنِ آخرین تغییر)،
//      چون این تنها کلیدی است که قانونِ داوریِ بازی را عوض می‌کند.
//
// این صفحه هیچ قاعده‌ای را در کلاینت پیاده نمی‌کند: همان دو عددِ زنده را
// می‌خواند و می‌نویسد؛ داوری همچنان فقط در بک‌اند است (mayhemGateFor).
import { useCallback, useEffect, useState } from 'react';
import { Flame, RotateCcw, Swords } from 'lucide-react';
import { Badge, Button, Card } from '../components/ui.jsx';
import { MayhemControl } from '../components/mayhem-control.jsx';
import { useToast } from '../lib/toast.jsx';

/** دو مودِ امروزِ دوئل کارت — همان‌طور که کاربر می‌بیندشان. */
const MODES = [
  {
    id: 'classic',
    name: 'دوئل کلاسیک',
    state: 'همیشه روشن',
    tone: 'neutral',
    rows: [
      '۵ راند، هر راند یک کارت و یک امتیاز.',
      'شانسِ روز کوچک است (حدود ±۶) و کارتِ قوی‌تر معمولاً می‌برد.',
      'هیچ کلیدی لازم ندارد؛ پیش‌فرضِ همهٔ نبردها همین است.',
    ],
  },
  {
    id: 'mayhem',
    name: 'دوئل طوفان',
    state: 'کلید در همین صفحه',
    tone: 'gold',
    rows: [
      '۱ تا ۲ راند از ۵ راند، دو‌امتیازی می‌شوند و برچسبِ «طوفان» می‌گیرند.',
      'تساوی در راندِ دو‌امتیازی «وقت اضافه» می‌آید و قدرتِ کلِ ترکیب تصمیم می‌گیرد.',
      'شانس دیده‌شدنی‌تر است (±۹ و در وقت اضافه ±۱۳) ولی برتریِ کارتِ قوی‌تر حفظ می‌شود.',
      'بارِ اول برای هر کاربر، کارتِ معرفیِ «دوئل طوفان رسید» و بعدش بخشِ «قانون دوئل طوفان» در صفحهٔ تمرین.',
    ],
  },
];

function when(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('fa-IR', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return String(iso);
  }
}

export function DuelModesPage({ request }) {
  const notify = useToast();
  const [historyRows, setHistoryRows] = useState([]);
  const [busyRevert, setBusyRevert] = useState(false);

  const loadHistory = useCallback(() => {
    request('/api/admin/settings/live-content/history/rules')
      .then((rows) => setHistoryRows(Array.isArray(rows) ? rows : []))
      .catch(() => { /* تاریخچه اختیاری است؛ نباید صفحه را سفید کند */ });
  }, [request]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  const revertLast = async () => {
    if (!confirm('آخرین تغییرِ عددهای زنده برگردانده شود؟ (فقط یک مرحله به عقب)')) return;
    setBusyRevert(true);
    try {
      await request('/api/admin/settings/live-content/rules/revert', { method: 'POST' });
      notify('به حالتِ قبلی برگشت — صفحه را دوباره بخوان');
      loadHistory();
    } catch (e) {
      notify(e.message || 'برگرداندن نشد', 'error');
    } finally {
      setBusyRevert(false);
    }
  };

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <Card
        title="کلیدِ مودِ دوئل کارت‌ها"
        subtitle="دو مود ساخته شده؛ «کلاسیک» همیشه روشن است و «طوفان» را از همین‌جا روشن می‌کنی. ذخیره که کنی، وب و اندروید در بارِ بعدی همان را می‌خوانند — بدونِ ساختنِ نسخهٔ تازه."
        action={<Badge tone="info">بدونِ دیپلوی</Badge>}
      >
        <MayhemControl request={request} />
      </Card>

      <div className="card-grid cols-2">
        {MODES.map((m) => (
          <Card
            key={m.id}
            title={m.name}
            subtitle={m.id === 'mayhem' ? 'مودِ دوم — با کلیدِ بالا روشن/خاموش می‌شود' : 'مودِ اول — پیش‌فرضِ سیستم'}
            action={<Badge tone={m.tone}>{m.state}</Badge>}
          >
            <ul style={{ margin: 0, paddingRight: 18, display: 'grid', gap: 6, fontSize: 13, lineHeight: 1.9 }}>
              {m.rows.map((r) => <li key={r}>{r}</li>)}
            </ul>
          </Card>
        ))}
      </div>

      <Card
        title="آخرین تغییرهای عددهای زنده"
        subtitle="از جمله همین کلید — چه کسی و کِی. اگر اشتباه شد، یک مرحله به عقب برگردان."
        action={
          <Button variant="ghost" icon={RotateCcw} loading={busyRevert}
            onClick={revertLast} disabled={!historyRows.length}>
            برگرداندنِ آخرین تغییر
          </Button>
        }
      >
        {historyRows.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13, opacity: .7 }}>هنوز تغییری ثبت نشده — یعنی کلید دست‌نخورده و همه‌جا کلاسیک است.</p>
        ) : (
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 6, fontSize: 13 }}>
            {historyRows.slice(0, 6).map((h) => (
              <li key={h.id} style={{ opacity: .85 }}>
                {when(h.createdAt)}
                {h.adminUsername ? ` — ${h.adminUsername}` : ''}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="کلیدهای فنی (برای پشتیبانی و لاگ)"
        subtitle="همین دو عددند که سرور می‌خواند؛ از فهرستِ «متن‌های زنده» برداشته شدند تا دو جای ناهم‌خوان نداشته باشیم.">
        <ul style={{ margin: 0, paddingRight: 18, display: 'grid', gap: 6, fontSize: 13, lineHeight: 1.9 }}>
          <li><code>duelMayhem</code> — ۰ خاموش، ۱ روشن (کلیدِ اصلی؛ صفر یعنی برگشتِ فوری).</li>
          <li><code>duelMayhemStage</code> — ۰ تا ۳؛ دامنهٔ روشن‌بودن (۰ هیچ‌جا، ۱ تمرین، ۲ تمرین + آنلاینِ بدونِ سهام، ۳ همه‌جا).</li>
          <li><Swords size={13} /> داوریِ همین دو عدد در <code>liveContent.mayhemGateFor</code> است؛ پنل هیچ قانونی را دوباره پیاده نمی‌کند.</li>
          <li><Flame size={13} /> کلید و مرحله، هر دو داخلِ <code>/api/config</code> می‌روند؛ همین‌که ذخیره شود، نسخهٔ کانفیگ بالا می‌رود.</li>
        </ul>
      </Card>
    </div>
  );
}

export default DuelModesPage;
