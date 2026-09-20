// ── کلیدِ «دوئل طوفان» — مودِ دومِ دوئل کارت ────────────────────────────
//
// خواستهٔ مالک (۲۹ شهریور):
//   «برای بازی دوئل کارت ۲ تا مود ساخته شده؛ گفته شده یکیش باید دستی از
//   پنل ادمین فعال شه — هرچی گشتم پیداش نکردم. پیداش کن و یک جای توچشم
//   قرارش بده.»
//
// واقعیتِ کد: دو مود وجود دارد و هر دو از *همین دو عددِ زنده* کنترل
// می‌شوند (backend/src/services/liveContent.js → mayhemGateFor):
//   • کلیدِ اصلی: `duelMayhem`      ۰/۱
//   • دامنهٔ روشن‌بودن: `duelMayhemStage` ۰..۳
// مشکلِ «پیدا نشد» این بود که این دو فقط به‌شکلِ دو فیلدِ عددیِ خام، وسطِ
// فهرستِ بلندِ «عددهایی که در متن نوشته می‌شوند» (صفحهٔ «متن‌های زنده»)
// رندر می‌شدند — بدونِ وضعیتِ روشن/خاموش، بدونِ این‌که معلوم باشد چه کسی
// چه چیزی می‌بیند. پس اینجا یک کنترلِ اختصاصی ساخته شد که در «داشبورد»
// (بالای صفحه، اولین چیزی که مدیر می‌بیند) و در صفحهٔ «مود دوئل کارت»
// سوار می‌شود. از فهرستِ خامِ عددها هم برداشته شد تا دو جای ناهم‌خوان
// وجود نداشته باشد.
//
// چرا اینجا: منطقِ داوری فقط در بک‌اند است (اصولِ تغییرناپذیر دوئل) —
// این کامپوننت فقط همان دو عدد را با یک PATCH ساده عوض می‌کند؛ هیچ قاعده‌ای
// در پنل بازنویسی نمی‌شود. برگشتِ اضطراری هم همین کلید است: صفر.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Flame, Power, RotateCcw, Save } from 'lucide-react';
import { Badge, Button } from './ui.jsx';
import { useToast } from '../lib/toast.jsx';

export const MAYHEM_RULES_PATH = '/api/admin/settings/live-content';
export const MAYHEM_RULES_PATCH = '/api/admin/settings/live-content/rules';

/**
 * پلکانِ روشن‌سازی — عیناً همان چیزی که `mayhemGateFor` در بک‌اند داوری
 * می‌کند. متن‌ها عمداً «چه کسی چه چیزی می‌بیند» را می‌گویند، نه شمارهٔ
 * فنیِ مرحله را؛ مدیر باید بدونِ خواندنِ کد بداند الان چه اتفاقی افتاده.
 */
export const MAYHEM_STAGES = [
  {
    value: 0,
    label: 'خاموش — هیچ‌جا',
    who: 'هیچ‌کس',
    line: 'حتی با کلیدِ روشن هم هیچ نبردی طوفانی نمی‌شود.',
  },
  {
    value: 1,
    label: 'فقط تمرین با ربات',
    who: 'کاربر، در تمرین با ربات',
    line: 'تستِ بی‌خطر: کاربر در «تمرین با ربات» طوفان را تجربه می‌کند؛ نبردهای واقعی کلاسیک می‌مانند.',
  },
  {
    value: 2,
    label: 'تمرین + نبرد آنلاین بدونِ سهام',
    who: 'کاربر، در تمرین و نبردِ رایگان',
    line: 'طوفان به نبردهای آنلاینی که سکه/امتیاز را درگیر نمی‌کنند هم می‌رسد؛ سهامی‌ها هنوز کلاسیک‌اند.',
  },
  {
    value: 3,
    label: 'همه‌جا — شاملِ نبردِ سهامی',
    who: 'همهٔ کاربران، در همهٔ نبردها',
    line: 'روشن‌سازیِ کامل: تمرین، نبرد بدونِ سهام و نبردِ سهامی همه طوفانی می‌شوند.',
  },
];

/** جملهٔ یک‌خطیِ وضعیت — هم در داشبورد و هم در صفحهٔ اختصاصی استفاده می‌شود. */
export function mayhemSentence(flag, stage) {
  if (Number(flag) !== 1) return 'خاموش است: همهٔ نبردها (تمرین و آنلاین) با قانونِ کلاسیک برگزار می‌شوند.';
  const s = MAYHEM_STAGES[Number(stage)] || MAYHEM_STAGES[0];
  if (s.value === 0) return 'کلید روشن است ولی مرحله «هیچ‌جا» است — یعنی هنوز هیچ‌کس طوفان را نمی‌بیند.';
  return `روشن است: ${s.who} طوفان را می‌بیند.`;
}

/**
 * دو شکلِ پاسخِ سرور را یکسان می‌کند:
 *   GET   /settings/live-content         → { rules: { defs, values } }
 *   PATCH /settings/live-content/rules   → { rules: <خودِ مقادیر>, configVersion }
 * اگر فقط شکلِ GET خوانده شود، بعد از ذخیره وضعیت به «خاموش» می‌پرد و
 * دکمهٔ خاموش‌کردن قفل می‌ماند — همان باگی که تستِ استابِ محلی گرفت.
 */
// رقمِ فارسی در همهٔ شماره‌های روی صفحه (هم‌رسمِ بقیهٔ پنل: «۳ ماموریت»، نه «3»).
const FA_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
const fa = (n) => String(n).replace(/\d/g, (d) => FA_DIGITS[Number(d)]);

function normalize(view) {
  const r = (view && view.rules) || {};
  const v = r.values || r;
  return {
    flag: Number(v.duelMayhem) === 1 ? 1 : 0,
    stage: Number(v.duelMayhemStage) || 0,
  };
}

/**
 * کنترلِ دوئل طوفان.
 *
 * `compact` نسخهٔ داشبورد است: وضعیت + دو دکمهٔ روشن/خاموش + لینکِ تنظیمِ
 * کامل. نسخهٔ کامل (صفحهٔ «مود دوئل کارت») پلکانِ چهارپله‌ای و توضیحِ هر
 * مرحله را هم نشان می‌دهد.
 */
export function MayhemControl({ request, compact = false, onNavigate }) {
  const notify = useToast();
  const [saved, setSaved] = useState(null);
  const [flag, setFlag] = useState(0);
  const [stage, setStage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    request(MAYHEM_RULES_PATH)
      .then((view) => {
        if (!alive) return;
        const s = normalize(view);
        setSaved(s);
        setFlag(s.flag);
        setStage(s.stage);
      })
      .catch((e) => { if (alive) setError(e.message || 'وضعیتِ فعلی خوانده نشد'); });
    return () => { alive = false; };
  }, [request]);

  const dirty = useMemo(
    () => !!saved && (Number(saved.flag) !== Number(flag) || Number(saved.stage) !== Number(stage)),
    [saved, flag, stage],
  );
  const on = Number(flag) === 1 && Number(stage) >= 1;
  const sentence = error || mayhemSentence(flag, stage);

  /** ذخیره — تنها جایی که به سرور می‌نویسد (یک PATCH، بدونِ دیپلوی). */
  const save = useCallback(async (nextFlag, nextStage) => {
    const body = { duelMayhem: Number(nextFlag), duelMayhemStage: Number(nextStage) };
    setBusy(true);
    try {
      const res = await request(MAYHEM_RULES_PATCH, { method: 'PATCH', body });
      const s = normalize({ rules: res && res.rules });
      setSaved(s);
      setFlag(s.flag);
      setStage(s.stage);
      const stageInfo = MAYHEM_STAGES[s.stage] || MAYHEM_STAGES[0];
      notify(
        s.flag === 1 && s.stage >= 1
          ? `دوئل طوفان روشن شد — ${stageInfo.who}`
          : 'دوئل طوفان خاموش شد — همه‌جا قانونِ کلاسیک',
      );
    } catch (e) {
      notify(e.message || 'ذخیره نشد', 'error');
    } finally {
      setBusy(false);
    }
  }, [notify, request]);

  /**
   * روشن‌کردن با مرحلهٔ امن.
   *
   * اگر کلید روشن شود ولی مرحله روی «۰» بماند، هیچ‌کس طوفان را نمی‌بیند —
   * یعنی دکمهٔ «روشن کن» بی‌اثر به نظر می‌رسد. پس اگر مرحلهٔ ذخیره‌شده
   * صفر باشد، همان‌جا به «۱ = فقط تمرین با ربات» (پلهٔ پیشنهادیِ اول)
   * می‌رود و در پیام هم می‌گوید.
   */
  const turnOn = useCallback(() => {
    const nextStage = Number(stage) >= 1 ? Number(stage) : 1;
    save(1, nextStage);
  }, [save, stage]);

  const turnOff = useCallback(() => {
    if (!confirm('دوئل طوفان خاموش شود؟ از این لحظه همهٔ نبردها قانونِ کلاسیک را می‌گیرند.')) return;
    save(0, Number(stage));
  }, [save, stage]);

  if (compact) {
    return (
      <div style={{ display: 'grid', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {on
            ? <Badge tone="success">روشن</Badge>
            : <Badge tone="neutral">خاموش</Badge>}
          <b>{on ? 'حریف‌ها طوفان را می‌بینند' : 'همه‌جا کلاسیک است'}</b>
        </div>
        <p style={{ margin: 0, opacity: .8, fontSize: 13, lineHeight: 1.9 }}>{sentence}</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {on
            ? <Button variant="danger" icon={Power} loading={busy} onClick={turnOff}>خاموشش کن</Button>
            : <Button icon={Flame} loading={busy} onClick={turnOn}>روشنش کن (فقط تمرین با ربات)</Button>}
          <Button variant="ghost" onClick={() => onNavigate && onNavigate('duel-modes')}>
            تنظیمِ کامل و پلکانِ مرحله‌ها
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {on ? <Badge tone="success">روشن</Badge> : <Badge tone="neutral">خاموش</Badge>}
        <b style={{ fontSize: 14 }}>{sentence}</b>
        {dirty && <Badge tone="warning">تغییرِ ذخیره‌نشده</Badge>}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {on ? (
          <Button variant="danger" icon={Power} loading={busy} onClick={turnOff}>
            خاموشش کن (بازگشتِ فوری)
          </Button>
        ) : (
          <Button icon={Flame} loading={busy} onClick={turnOn}>روشنش کن</Button>
        )}
        {dirty && (
          <Button variant="ghost" icon={RotateCcw} disabled={busy}
            onClick={() => { setFlag(saved.flag); setStage(saved.stage); }}>
            بازگرداندنِ فرم
          </Button>
        )}
        {!dirty && !on && (
          <span style={{ fontSize: 12.5, opacity: .7 }}>
            با یک کلیک، طوفان برای تمرین با ربات روشن می‌شود (پلهٔ امنِ اول).
          </span>
        )}
      </div>

      <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
        {MAYHEM_STAGES.map((s) => {
          const selected = Number(stage) === s.value;
          return (
            <button
              key={s.value}
              type="button"
              data-mayhem-stage={s.value}
              aria-pressed={selected}
              onClick={() => setStage(s.value)}
              style={{
                textAlign: 'start',
                cursor: 'pointer',
                display: 'grid',
                gap: 4,
                padding: '10px 12px',
                borderRadius: 14,
                lineHeight: 1.8,
                border: selected
                  ? '1px solid color-mix(in srgb, var(--gg-info) 60%, transparent)'
                  : '1px solid rgba(255,255,255,.10)',
                background: selected
                  ? 'color-mix(in srgb, var(--gg-info) 12%, transparent)'
                  : 'transparent',
              }}
            >
              <span style={{ fontWeight: 900, fontSize: 13 }}>
                {`مرحله ${fa(s.value)} — `}{s.label}
                {selected ? ' (انتخاب‌شده)' : ''}
              </span>
              <span style={{ fontSize: 12.5, opacity: .8 }}>{s.line}</span>
            </button>
          );
        })}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <Button icon={Save} loading={busy} disabled={!dirty}
          onClick={() => save(flag, stage)}>
          ذخیرهٔ مرحله
        </Button>
        <span style={{ fontSize: 12.5, opacity: .7 }}>
          پیشنهادِ پلکان: اول مرحله ۱ (یک هفته دادهٔ تمرین)، بعد ۲، آخر ۳.
        </span>
      </div>
    </div>
  );
}
