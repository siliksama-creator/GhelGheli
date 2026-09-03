/**
 * liveConfig — تنها نقطهٔ خواندنِ «متن‌ها و اعداد زنده» در وب (فاز ۲)
 *
 * ═══════════════════════════════════════════════════════════════════════
 * چرا یک ماژولِ جدا و نه contextِ دستی در هر صفحه
 * ═══════════════════════════════════════════════════════════════════════
 *
 * پیش از این `/api/config` در **چهار نقطهٔ پراکنده** fetch می‌شد
 * (main.jsx، games.jsx، Wheel.jsx، League.jsx) و هر صفحه سرنوشتِ خودش را
 * داشت: اگر fetchِ همان صفحه شکست می‌خورد، همان صفحه با متنِ کهنه‌ای که
 * داخل باندل نوشته شده بود می‌ماند — بدونِ هیچ نشانه‌ای.
 *
 * اینجا یک کشِ همگامِ ماژول‌سطح داریم که **یک بار** پر می‌شود و هر صفحه‌ای
 * که لازم دارد با `useLive()` مشترک می‌شود. دلایلِ این انتخاب:
 *
 *   ۱. `React is not defined` سابقهٔ دردناکی در این پروژه است و پروژه
 *      `vite.config` برای JSX ندارد؛ هر انتزاعِ تازه‌ای که React را در
 *      فایل‌های بیشتری لازم کند، سطحِ ریسکِ بیلد را بالا می‌برد.
 *   ۲. صفحاتِ موجود پیش از مقدارگیریِ config رندر می‌شوند (config با
 *      await می‌رسد). یک getterِ همگام + مشترک‌شدن، همان رفتار را نگه
 *      می‌دارد و «اول رندر با پیش‌فرض، بعد تازه‌شدن» را تضمین می‌کند.
 *   ۳. تست‌های `userweb/tool/*.mjs` و `smoke.mjs` این لایه را مستقیم
 *      صدا می‌زنند؛ بدونِ React هم کار می‌کند.
 *
 * ── قراردادِ طلایی (بند ۲ نقشه‌راه) ─────────────────────────────────────
 *
 *   * هیچ عددی در متنِ UI نباشد: یا از config می‌آید یا در قالبِ
 *     سرور جای‌گذاری می‌شود.
 *   * هر مقدارِ سفت‌شده باید **فول‌بکِ ایمن** باشد — دقیقاً همان رشته‌ای
 *     که دیروز هاردکد بود. پس اولین رندر با نسخهٔ امروزِ محصول واژه‌به‌
 *     واژه یکسان است؛ کاربر هیچ تفاوتی نمی‌بیند مگر وقتی ادمین چیزی را
 *     عوض کند.
 *   * اگر سرورِ متن خراب/ناتمام باشد، **کلِ جمله** به فول‌بک می‌رود؛ یک
 *     «{quota}» خام هرگز روی صفحه نمی‌آید (توضیحِ این انتخاب در `text`).
 *   * اگر پاسخ config نرسید (`store` تهی)، همان فول‌بکِ تاریخی نشان داده
 *     می‌شود — که همان رفتارِ امروزِ وب است. پس این تغییر برای کاربر
 *     بی‌صداست و در عین حال «در» را باز می‌کند.
 */
import { useEffect, useState } from 'react';
import { req, fa } from './api.js';

const CONFIG_PATH = '/api/config';

let store = null;
let loading = null;
const listeners = new Set();

/** پرکردنِ کش از بدنه‌ای که از قبل داریم (main.jsx خود config را می‌زند). */
export function primeLiveConfig(payload) {
  if (!payload || typeof payload !== 'object') return;
  store = payload;
  listeners.forEach((fn) => { try { fn(); } catch { /* صفحهٔ رفته */ } });
}

/**
 * یک fetchِ مشترک برای هر اجرای برنامه.
 *
 * `primeLiveConfig` از main.jsx راهِ معمول است؛ این تابع برای صفحه‌ها و
 * ابزارهایی است که مستقل باز می‌شوند (e2e، پیش‌نمایشِ عمق‌لینک). اگر
 * کش پر شده باشد درخواستِ تازه‌ای نمی‌زند، و اگر در حالِ رفتن باشد همان
 * Promise را برمی‌گرداند — یعنی چند فراخوانی = یک درخواست.
 */
export function loadLiveConfig() {
  if (store) return Promise.resolve(store);
  if (!loading) {
    loading = req(CONFIG_PATH, 'GET', null, null)
      .then((d) => { primeLiveConfig(d); return store; })
      .catch(() => null)
      .finally(() => { loading = null; });
  }
  return loading;
}

/** پاسخِ خامِ config — برای لاگِ دیباگ و `configVersion`. */
export function liveConfig() {
  return store;
}

/** شمارندهٔ ذخیره‌ها؛ برای نوشتن در لاگِ خطا («با چه نسلِ تنظیماتی؟»). */
export function liveConfigVersion() {
  const n = Number(store?.configVersion);
  return Number.isFinite(n) ? n : null;
}

/** خواندنِ مسیرِ `a.b.c` از کش؛ هر چیزِ نبوده = undefined. */
function pick(path) {
  if (!store) return undefined;
  let cur = store;
  for (const seg of String(path).split('.')) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = cur[seg];
  }
  return cur;
}

const PLACEHOLDER = /\{([a-zA-Z][a-zA-Z0-9_]*)\}/g;

function hasPlaceholder(t) {
  PLACEHOLDER.lastIndex = 0;
  return PLACEHOLDER.test(String(t));
}

/**
 * متنِ کاربر — قالبِ `live_copy.<group>.<field>` با جای‌نگهدارهای پرشده.
 *
 * `vars` اعدادی است که صفحه در اختیار دارد (سهمیه، قیمت، …). هر مقدارِ
 * عددی با `fa` به رقمِ فارسی تبدیل می‌شود تا جای‌نگهدار با بقیهٔ متنِ
 * فارسی یکی باشد (درسِ «ورودی 100» در راهنمای سکه).
 *
 * دو حالتِ بازگشتِ عمدی:
 *   • قالب در سرور نیست (پاسخِ ناقص/قدیمی) → `fallback`
 *   • جای‌نگهداری در `vars` نیست → **کلِ** `fallback`، نه متنِ سوراخ.
 *
 * چرا در حالتِ دوم کلِ جمله عوض می‌شود؟ چون یک «تا  بازی در ورودی»
 * بی‌عدد از جملهٔ سفت‌شده بدتر است: کاربرِ فارسی‌زبان نمی‌فهمد چه چیزی
 * کم است، ولی جملهٔ کاملِ دیروز را می‌فهمد. جملهٔ نیمه‌کاره همچنین
 * با نگهبانِ «هیچ جای‌نگهدارِ خامی روی صفحه نماند» در CI در می‌افتد.
 */
export function text(key, fallback, vars = {}) {
  const raw = pick(`copy.${key}`);
  const template = typeof raw === 'string' && raw.trim() ? raw : null;
  // فول‌بک می‌تواند گرهٔ JSX باشد (متنِ **غنی‌شده** با <b> داخلش). در آن
  // حالت ما قالبِ سرور را جایگزین نمی‌کنیم مگر اینکه واقعاً باشد؛ اگر نبود،
  // همان گرهٔ JSX بی‌دست‌زدن برمی‌گردد تا برجسته‌سازیِ بصریِ امروزِ محصول
  // با یک تغییرِ متن‌محور از دست نرود.
  if (typeof fallback !== 'string') {
    if (!template) return fallback;
    return fillString(template, vars, null) ?? fallback;
  }
  if (!template) return fallback;
  if (!hasPlaceholder(template)) return template;
  return fillString(template, vars, fallback);
}

/** مرکزِ پرکردنِ جای‌نگهدار — یک پیاده‌سازی، دو مصرف‌کننده (بالا). */
function fillString(template, vars, onMissing) {
  const missing = [];
  const filled = String(template).replace(PLACEHOLDER, (m, name) => {
    const v = vars[name];
    if (v === null || v === undefined || v === '') {
      missing.push(name);
      return '';
    }
    return typeof v === 'number' ? fa(v) : String(v);
  });
  return missing.length ? onMissing : filled;
}

/**
 * متنِ سادهٔ بدونِ جای‌نگهدار (برچسب‌هایی که فقط **لحن**شان زنده است،
 * مثل جملهٔ «سهمیهٔ روزانه هر شب ساعت ۱۲…»). اگر چیزی در متنِ سرور
 * جای‌نگهدار بماند، یعنی ادمین قالبی را با متغیر پر کرده که ما عددش را
 * نداریم — ریسکش با این مسیر کم است: فقط متنِ کامل پذیرفته می‌شود.
 */
export function rawText(key, fallback) {
  const v = pick(`copy.${key}`);
  if (typeof v !== 'string' || !v.trim()) return fallback;
  return hasPlaceholder(v) ? fallback : v;
}

/** رشته‌های آرایه‌ای (مثل بندهای منشورِ حریم خصوصی). */
export function rawList(key, fallback) {
  const v = pick(`copy.${key}`);
  return Array.isArray(v) && v.length ? v : fallback;
}

/** عددِ ساختاری از `live_rules` — `fallback` همان ثابتِ دیروزِ کد است. */
export function ruleNumber(name, fallback) {
  const n = Number(pick(`rules.${name}`));
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** فهرستِ آواتارهای سرو‌شده؛ نبود = همان فهرستِ باندل (رفتارِ امروز). */
export function avatarList() {
  const items = pick('avatars.keys');
  if (!Array.isArray(items) || !items.length) return null;
  return items.map((it) => (typeof it === 'string' ? it : it?.key)).filter(Boolean);
}

/** تعداد آواتارها (برای برچسب «N مدل اختصاصی»). */
export function avatarCount(fallback) {
  const n = Number(pick('avatars.count'));
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * مشترک‌شدنِ واکنشی: هر صفحه‌ای که متنِ زنده نشان می‌دهد این را صدا
 * می‌زند تا بعد از رسیدنِ config یک بار تازه شود.
 */
export function useLive() {
  const [, bump] = useState(0);
  useEffect(() => {
    const fn = () => bump((n) => n + 1);
    listeners.add(fn);
    if (!store) loadLiveConfig();
    return () => listeners.delete(fn);
  }, []);
  return store;
}
