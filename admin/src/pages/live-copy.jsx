import { useEffect, useMemo, useRef, useState } from 'react';
import { Eye, Layers, RotateCcw, Save, Sparkles } from 'lucide-react';
import { Badge, Button, Card, Field, Input, Textarea } from '../components/ui.jsx';
import { useToast } from '../lib/toast.jsx';

// ═══════════════════════════════════════════════════════════════════════════
// «متن‌ها و اعدادِ داخل اپ» — فاز ۳ نقشه‌راه.
//
// چرا یک صفحهٔ جدا و نه چند ردیفِ پراکنده در «تنظیمات»؟ چون همهٔ این‌ها یک
// کار را می‌کنند: چیزی را که کاربر در اپ می‌بیند عوض می‌کنند. اگر لابه‌لای
// چت و پیامک پخش می‌شدند، دو اتفاق می‌افتاد: (۱) مدیرِ تازه‌کار نمی‌فهمید
// اینجا «متنِ اپ» است و جایِ ریسک، (۲) یک جمله را یکی دو جا ویرایش می‌کرد
// و فرقِ ظاهرِ وب/اندروید را باگِ کلاینت می‌زد. پس: یک صفحه، دو بخش.
//
// سه چیز را عمداً این‌طور ساختیم:
//  • **زبانِ آدم، نه برنامه‌نویس:** برچسبِ هر فیلد، خودِ جمله است — مدیر
//    «coinGuide.quota» را نمی‌خواند، «سهمیهٔ سکه…» را می‌خواند. کلیدِ
//    فنی به `data-key` نشسته و فقط در «حالتِ حرفه‌ای» روی برچسب می‌آید؛
//    آن حالت برای ماست که با لاگ/گاردها صحبت کنیم، نه برای ادمین.
//  • **پیش‌نمایشِ زنده:** `POST …/preview` همان چیزی را می‌دهد که کاربر
//    می‌بیند (سرور جای‌نگهدارها را با `live_rules`ی امروز پر می‌کند). بیِ
//    این، ویرایشِ متنِ «{days} روزه» یعنی نوشتنِ کورکورانه.
//  • **نگهدارِ جای‌نگهدارها:** اگر مدیر `{days}` را از جمله پاک کند، عدد
//    دیگر هیچ‌وقت در اپ نمی‌نشیند و باگ *ساکت* است. اینجا همان لحظه هشدار
//    می‌دهیم — قبلِ ذخیره، نه بعد از شکایتِ کاربر.
//
// بازگردانی: سرور برای هر ذخیره یک ردیف تاریخچه می‌گذارد و `revert` همان
// نسخهٔ قبلی را برمی‌گرداند؛ پس «یه کلیکِ اشتباه» فاجعه نیست.
// ═══════════════════════════════════════════════════════════════════════════

// نامِ فارسیِ گروه‌ها — دقیقاً همان چیزی که اندروید (`admin_live_copy.dart`)
// نشان می‌دهد. اگر این جدول و جدولِ اندروید از هم فاصله بگیرند، دو پنل
// «یکسان» نیستند؛ `testAdminCopyParity` مو‌به‌مو مقایسه‌شان می‌کند.
const GROUP_LABEL = {
  referral: 'دعوت از دوستان',
  coinGuide: 'راهنمای سکه و نرخ‌ها',
  plus: 'اشتراک پلاس',
  streak: 'استریک ورود روزانه',
  support: 'پشتیبانی و منشور حریم خصوصی',
  photoReview: 'بررسی عکس کارت',
  wheel: 'گردونه شانس',
  games: 'بازی‌ها',
  reconnect: 'اتصالِ دوباره',
  avatars: 'آواتارها',
  // گروهِ تازهٔ فاز ۴. اسمِ فارسی عمداً «اپدیتِ نسخه» است نه «بروزرسانی»:
  // همان واژه‌ای که کاربر در دیالوگ می‌بیند، تا ادمینِ غیرفنی بداند این
  // کارتِ کدام صفحه است (بندِ «زبانِ آدم» در نقشه‌راه).
  update: 'پیامِ نسخهٔ تازه',
};

const PLACEHOLDER = /\{([a-zA-Z][a-zA-Z0-9_]*)\}/g;

const placeholdersOf = (s) => {
  const out = [];
  if (typeof s !== 'string') return out;
  for (const m of s.matchAll(PLACEHOLDER)) out.push(m[1]);
  return out;
};

/** برچسبِ آدم‌پسند: خودِ جمله تا ۴۶ حرف، وگرنه «جملهٔ …». */
function labelFor(key, value) {
  const v = (typeof value === 'string' ? value : '').trim();
  if (!v) return key.split('.').pop();
  const short = v.length > 46 ? `${v.slice(0, 46)}…` : v;
  return short;
}

/**
 * اشیایِ آرایه‌ای (بندهای منشور): پنل این‌ها را «بند ۱، بند ۲…» می‌شمارد
 * و برای هر بند تیتر و متن را جدا می‌خواهد. `title`/`body` تنها کلیدهایِ
 * مجازند — `sanitizeCopy` هر چیزِ دیگری را دور می‌ریزد، پس اینجا هم
 * چیزی جز این دو نشان نمی‌دهیم تا مدیر چیزی نبیند که ذخیره نمی‌شود.
 */
function isSections(key, value) {
  return Array.isArray(value) && value.length > 0
    && value.every((it) => it && typeof it === 'object' && !Array.isArray(it));
}

export function LiveCopyPage({ request }) {
  const notify = useToast();
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [rules, setRules] = useState({ defs: {}, values: {} });
  const [copyRaw, setCopyRaw] = useState({});     // قالبِ خامِ ذخیره‌شده
  const [draft, setDraft] = useState({});          // چیزی که مدیر تایپ می‌کند
  const [preview, setPreview] = useState({});      // خروجیِ پرشده از سرور
  const [busy, setBusy] = useState(false);
  const [busyRevert, setBusyRevert] = useState(false);
  const [busyDefaults, setBusyDefaults] = useState(false);
  const [proMode, setProMode] = useState(
    () => localStorage.getItem('admin.proCopy') === '1');
  const [history, setHistory] = useState({ copy: [], rules: [] });
  const previewTimer = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const view = await request('/api/admin/settings/live-content');
        const base = view.copy.template || {};
        setRules({ defs: view.rules.defs || {}, values: view.rules.values || {} });
        setCopyRaw(base);
        setDraft(structuredClone(base));
        setPreview({});
        setLoaded(true);
      } catch (e) {
        setError(e.message || 'پاسخِ سرور نرسید');
      }
    })();
  }, [request]);

  useEffect(() => {
    if (!loaded) return;
    clearTimeout(previewTimer.current);
    previewTimer.current = setTimeout(async () => {
      try {
        const d = await request('/api/admin/settings/live-content/preview', {
          method: 'POST', body: { vars: {} },
        });
        setPreview(d.template || {});
      } catch { /* پیش‌نمایش نمی‌آید؟ خودِ فرم کار می‌کند؛ نباید صفحه سفید شود */ }
    }, 420);
    return () => clearTimeout(previewTimer.current);
  }, [draft, loaded, request]);

  const dirty = useMemo(() => {
    let n = 0;
    const walk = (a, b) => {
      for (const k of Object.keys(b || {})) {
        const x = JSON.stringify(a?.[k]);
        const y = JSON.stringify(b[k]);
        if (x === y) continue;
        if (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k])) walk(a?.[k] || {}, b[k]);
        else n++;
      }
    };
    walk(copyRaw, draft);
    return n;
  }, [copyRaw, draft]);

  const missing = useMemo(() => {
    const out = [];
    for (const [group, fields] of Object.entries(draft)) {
      for (const [field, value] of Object.entries(fields || {})) {
        if (typeof value !== 'string') continue;
        const need = placeholdersOf(copyRaw[group]?.[field]);
        const have = new Set(placeholdersOf(value));
        const lost = need.filter((p) => !have.has(p));
        const unknown = [...have].filter((p) => !need.includes(p));
        if (lost.length || unknown.length) {
          out.push({
            key: `${group}.${field}`,
            lost,
            unknown,
          });
        }
      }
    }
    return out;
  }, [draft, copyRaw]);

  const setField = (group, field, value) =>
    setDraft((d) => ({ ...d, [group]: { ...(d[group] || {}), [field]: value } }));

  const setSection = (group, field, index, part, value) =>
    setDraft((d) => {
      const list = (d[group]?.[field] || []).map((it, i) =>
        (i === index ? { ...it, [part]: value } : it));
      return { ...d, [group]: { ...(d[group] || {}), [field]: list } };
    });

  async function save() {
    setBusy(true);
    try {
      const patched = await request('/api/admin/settings/live-content/copy', {
        method: 'PATCH', body: draft,
      });
      setCopyRaw(structuredClone(patched.copy));
      setDraft(structuredClone(patched.copy));
      await request('/api/admin/settings/live-content/rules', {
        method: 'PATCH', body: rulePatch,
      });
      const view = await request('/api/admin/settings/live-content');
      setRules({ defs: view.rules.defs || {}, values: view.rules.values || {} });
      setRuleEdits({});
      notify('ذخیره شد — از این لحظه وب و اندروید همین را می‌بینند', 'ok');
      loadHistory();
    } catch (e) {
      notify(e.message || 'ذخیره نشد', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function revertAll() {
    if (!confirm('آخرین تغییرِ متن‌ها برگردانده شود؟ (فقط یک مرحله به عقب)')) return;
    setBusyRevert(true);
    try {
      const r = await request('/api/admin/settings/live-content/copy/revert', { method: 'POST' });
      const back = r.copy || {};
      // `copyRaw` هم بازنویسی می‌شود: «جای‌نگهدارِ جا‌افتاده» و «چیزهایی که
      // جا افتاده» نسبی به *وضعیتِ ذخیره‌شده* سنجیده می‌شوند؛ اگر مرجع
      // کهنه بماند، بعد از بازگردانی هشدارهایِ بی‌ربط روی فرم می‌ماند.
      setCopyRaw(structuredClone(back));
      setDraft(structuredClone(back));
      notify('به نسخهٔ قبلی برگشت', 'ok');
      loadHistory();
    } catch (e) {
      notify(e.message || 'بازگردانی نشد', 'error');
    } finally {
      setBusyRevert(false);
    }
  }

  /*
   * «بازگشت به پیش‌فرضِ کد». دو مرحله‌ای و *بی‌ذخیره* است: مقدارها فقط در
   * فرم می‌نشینند و مدیر خودش «ذخیره» را می‌زند. دلیلش روشن است — یک
   * دکمهٔ یک‌کلیکه که مستقیم محصول را به متنِ روزِ اوّل می‌برد، در پنلی که
   * «اشتباهِ مدیر» در آن فاجعه است، طراحیِ بد است؛ حالا می‌تواند قبل از
   * ذخیره در پیش‌نمایش ببیند چه چیزی برمی‌گردد.
   */
  async function loadDefaults() {
    setBusyDefaults(true);
    try {
      const d = await request('/api/admin/settings/live-content/defaults');
      setDraft(structuredClone(d.copy || {}));
      notify('پیش‌فرض‌ها روی فرم نشست — هنوز ذخیره نشده', 'ok');
    } catch (e) {
      notify(e.message || 'پیش‌فرض‌ها نرسید', 'error');
    } finally {
      setBusyDefaults(false);
    }
  }

  async function loadHistory() {
    try {
      const [c, rl] = await Promise.all([
        request('/api/admin/settings/live-content/history/copy'),
        request('/api/admin/settings/live-content/history/rules'),
      ]);
      setHistory({ copy: c || [], rules: rl || [] });
    } catch { /* تاریخچه اختیاری است */ }
  }

  // اعداد را جدا نگه می‌داریم تا یک فیلدِ عددیِ خالی، متن را خراب نکند.
  const [ruleEdits, setRuleEdits] = useState({});
  const rulePatch = useMemo(() => {
    const out = {};
    for (const [name, v] of Object.entries(ruleEdits)) {
      if (v === '' || v == null) continue;
      out[name] = Number(v);
    }
    return out;
  }, [ruleEdits]);

  if (error) {
    return (
      <Card title="متن‌ها و اعدادِ داخل اپ">
        <p style={{ color: '#F87171', margin: 0 }}>{error}</p>
      </Card>
    );
  }
  if (!loaded) {
    return <Card title="متن‌ها و اعدادِ داخل اپ"><p style={{ opacity: .65, margin: 0 }}>در حال خواندن…</p></Card>;
  }

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <Card
        title="متن‌ها و اعدادِ داخل اپ"
        subtitle="هرچه کاربر در وب و اندروید می‌خواند، از همین‌جا است. ذخیره که کنی، در اجرا/بارِ بعدیِ اپ اعمال می‌شود — نیازی به ساختنِ نسخهٔ تازه نیست."
        action={(
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {dirty > 0 && <Badge tone="warn">{dirty} تغییرِ ذخیره‌نشده</Badge>}
            <Button
              variant="ghost"
              onClick={() => {
                const next = !proMode;
                setProMode(next);
                localStorage.setItem('admin.proCopy', next ? '1' : '0');
              }}
            >
              {proMode ? 'حالتِ ساده' : 'حالتِ حرفه‌ای'}
            </Button>
          </div>
        )}
      >
        <p style={{ margin: 0, opacity: .78, fontSize: 13, lineHeight: 1.9 }}>
          نگرانِ خراب‌شدن نباش: متن‌ها فقط «نوشته»‌اند — اگر عددی را عوض نکنی،
          منطقِ بازی دست‌نخورده می‌ماند. هر دکمه‌ای هم که بزنی، یک مرحله به
          عقب برمی‌گردد.
        </p>
      </Card>

      {/* ── ۱) عددها ─────────────────────────────────────────────────── */}
      <Card
        title="عددهایی که در متن نوشته می‌شوند"
        subtitle="این‌ها در اپ «خوانده» می‌شوند و هم‌زمان در بازی «کار» می‌کنند؛ پس بازه‌شان بسته است و بیرونِ بازه ذخیره نمی‌شود."
      >
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
          {Object.entries(rules.defs).map(([name, def]) => {
            const cur = ruleEdits[name] ?? rules.values[name] ?? def.value;
            return (
              <Field key={name} label={def.label} hint={`${def.hint}${proMode ? ` — ${name}` : ''}`}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <Input
                    type="number"
                    min={def.min}
                    max={def.max}
                    value={cur}
                    onChange={(e) => setRuleEdits((s) => ({ ...s, [name]: e.target.value }))}
                  />
                  <span style={{ fontSize: 12, opacity: .6, whiteSpace: 'nowrap' }}>
                    بین {def.min} تا {def.max}
                  </span>
                </div>
              </Field>
            );
          })}
        </div>
      </Card>

      {/* ── ۲) متن‌ها ────────────────────────────────────────────────── */}
      {missing.length > 0 && (
        <Card title="چیزهایی که جا افتاده">
          <p style={{ margin: '0 0 8px', fontSize: 13, opacity: .8 }}>
            اگر علامتِ {`{}`} عددی را از جمله پاک کنی، آن عدد دیگر هیچ‌وقت در اپ
            نمی‌نشیند. این‌ها را برگردان (یا جمله را جورِ دیگری بنویس):
          </p>
          <ul style={{ margin: 0, paddingRight: 18, fontSize: 13, lineHeight: 2 }}>
            {missing.map((m) => (
              <li key={m.key}>
                <b>{proMode ? m.key : labelFor(m.key, copyRaw[m.key.split('.')[0]]?.[m.key.split('.')[1]])}</b>
                {m.lost.length > 0 && <> — جا افتاده: <code>{m.lost.map((p) => `{${p}}`).join(' ')}</code></>}
                {m.unknown.length > 0 && <> — ناشناخته: <code>{m.unknown.map((p) => `{${p}}`).join(' ')}</code></>}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {Object.entries(draft).map(([group, fields]) => {
        const entries = Object.entries(fields || {});
        if (!entries.length) return null;
        return (
          <Card key={group} title={GROUP_LABEL[group] || group}>
            <div style={{ display: 'grid', gap: 12 }}>
              {entries.map(([field, value]) => {
                const key = `${group}.${field}`;
                const rawValue = copyRaw[group]?.[field];
                const filled = preview[group]?.[field];
                if (isSections(key, rawValue)) {
                  return (
                    <div key={field} style={{ display: 'grid', gap: 10 }}>
                      {(value || []).map((item, i) => (
                        <div key={i} style={{ borderRight: '3px solid rgba(255,255,255,.10)', paddingRight: 10 }}>
                          <Field label={`بند ${i + 1} — تیتر`}>
                            <Input
                              value={item?.title ?? ''}
                              onChange={(e) => setSection(group, field, i, 'title', e.target.value)}
                            />
                          </Field>
                          <Field label={`بند ${i + 1} — متن`}>
                            <Textarea
                              rows={4}
                              value={item?.body ?? ''}
                              onChange={(e) => setSection(group, field, i, 'body', e.target.value)}
                            />
                          </Field>
                        </div>
                      ))}
                    </div>
                  );
                }
                return (
                  <Field key={field} label={proMode ? key : labelFor(key, rawValue)}>
                    <Textarea
                      rows={2}
                      value={typeof value === 'string' ? value : ''}
                      onChange={(e) => setField(group, field, e.target.value)}
                    />
                    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 12, opacity: .7, display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                        <Eye size={13} /> در اپ:
                        <span style={{ color: '#9AE6B4' }}>{typeof filled === 'string' && filled ? filled : '—'}</span>
                      </span>
                      {placeholdersOf(rawValue).length > 0 && (
                        <span style={{ fontSize: 11.5, opacity: .6 }}>
                          جای عدد: {placeholdersOf(rawValue).map((p) => `{${p}}`).join(' ')}
                        </span>
                      )}
                    </div>
                  </Field>
                );
              })}
            </div>
          </Card>
        );
      })}

      {/* ── ۳) ذخیره و بازگشت ────────────────────────────────────────── */}
      <Card
        title="ذخیره"
        action={(
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="ghost" icon={Layers} onClick={loadDefaults} loading={busyDefaults}>
              بازگشت به پیش‌فرضِ کد
            </Button>
            <Button variant="ghost" icon={RotateCcw} onClick={revertAll} loading={busyRevert}>
              بازگردانیِ آخرین تغییرِ متن‌ها
            </Button>
            <Button icon={Save} onClick={save} loading={busy} disabled={missing.length > 0}>
              ذخیره{dirty ? ` (${dirty})` : ''}
            </Button>
          </div>
        )}
      >
        <p style={{ margin: 0, fontSize: 13, opacity: .78, lineHeight: 1.9 }}>
          <Sparkles size={13} style={{ verticalAlign: '-2px' }} />{' '}
          با «حالتِ حرفه‌ای» نامِ هر متن را روی برچسب می‌بینی؛ همین نام‌ها را
          گاردهای ما و لاگِ تغییرات می‌گویند، پس برای گزارش‌دادن به ما
          کاری‌شان دارید.
        </p>
      </Card>

      {/* ── ۴) تاریخچه ───────────────────────────────────────────────── */}
      <Card title="تغییراتِ اخیر" subtitle="هر ذخیره یک ردیف می‌گذارد؛ همین‌جا می‌بینی چه کسی چه چیزی را عوض کرده.">
        {(!history.copy.length && !history.rules.length) ? (
          <p style={{ margin: 0, fontSize: 13, opacity: .7 }}>هنوز تغییری ثبت نشده.</p>
        ) : (
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 6, fontSize: 13 }}>
            {history.copy.map((h) => (
              <li key={`c${h.id}`} style={{ opacity: .85 }}>
                متن‌ها — {h.created_at?.slice(0, 16).replace('T', ' ')}
                {h.admin_id ? ` (ادمین ${h.admin_id})` : ''}
              </li>
            ))}
            {history.rules.map((h) => (
              <li key={`r${h.id}`} style={{ opacity: .85 }}>
                عددها — {h.created_at?.slice(0, 16).replace('T', ' ')}
                {h.admin_id ? ` (ادمین ${h.admin_id})` : ''}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

export default LiveCopyPage;
