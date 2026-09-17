/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  برنامه‌های پیشنهادی — منطقِ کار (خواستهٔ مالک، ۲۶ شهریور)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ادمین از پنل یک اپ یا سایت معرفی می‌کند (عنوان، توضیح، عکس، لینک) و همان
 * لحظه در بخش «بیشتر» وب و اندروید، در کادرهای مرتب، دیده می‌شود — بدونِ
 * هیچ آپدیتی در اپ یا استور.
 *
 * ── چرا این فایل جدا از مسیرهاست ──────────────────────────────────────────
 *
 * دو دلیلِ عملی:
 *
 *   ۱. **قابلِ‌آزمایش بودنِ قواعد.** «لینک باید با http شروع شود»، «عنوان
 *      بین ۲ تا ۶۰ حرف»، «سقفِ ۱۰۰ ردیف» — اینها قواعدی‌اند که اگر در
 *      مسیرها پخش شوند، فقط با بالا آوردنِ کلِ سرور و دیتابیس می‌شود
 *      سنجیدشان. اینجا تابع‌های خالص‌اند و گاردِ
 *      `scripts/testRecommendedApps.js` بدونِ دیتابیس امتحانشان می‌کند.
 *   ۲. **یک قراردادِ مشترک.** وب و اندروید باید **دقیقاً** یک شکل پاسخ
 *      بگیرند؛ اگر هر کلاینت چیزی را جدا تفسیر کند، همان دسته باگی می‌شود
 *      که گاردهای «آینگی» این پروژه برایش نوشته شده‌اند.
 *
 * ── تصمیم‌های کوچکی که بعداً سؤال می‌شوند ─────────────────────────────────
 *
 *   • `per_page` سقفِ ۱۰ دارد (پیش‌فرض هم همان). خواستهٔ مالک: «بیشتر از ۱۰
 *     عدد شد، صفحه‌بندی شده نشان داده بشه». سقف عددی است نه «هرچه گفت»؛
 *     وگرنه یک درخواست می‌تواند کلِ فهرست را برگرداند و صفحه‌بندی بی‌معنی شود.
 *   • ترتیب: `sort_order` سپس `id`. بدونِ جزءِ دوم، دو ردیفِ هم‌مرتبه
 *     می‌توانند بینِ دو درخواست جابه‌جا شوند — یعنی کاربر یک برنامه را دو
 *     بار ببیند و یکی را هرگز. (همان اشتباهی که در فهرست‌های صفحه‌بندی‌شده
 *     بارها دیده شده.)
 *   • `enabled` هم در پاسخِ عمومی هست: کلاینت‌ها با همین یک درخواست هم
 *     می‌فهمند «این بخش روشن است یا نه»، هم اگر روشن است چه چیزی نشان بدهند.
 *     پس برای نمایش/پنهان‌کردنِ ردیفِ منو، درخواستِ دومی لازم نیست.
 *   • خاموش‌کردنِ کلِ بخش (تیکِ پنل) ردیف‌ها را **پاک نمی‌کند**؛ فقط
 *     `enabled:false` برمی‌گردد. پس ادمین با یک کلیک برمی‌گرداندش و محتوا
 *     سرِ جایش است.
 */
const { pool } = require('../config/db');

/** سقفِ تعدادِ برنامه‌ها — بالاتر از این، یعنی ادمین راهِ اشتباهی رفته. */
const MAX_ITEMS = 100;

/** سقفِ هر صفحه؛ خواستهٔ مالک روی «۱۰» بود. */
const DEFAULT_PER_PAGE = 10;
const MAX_PER_PAGE = 10;

/** برچسبِ فارسیِ نوع — کلاینت‌ها همین متن را نشان می‌دهند. */
const KIND_LABELS = Object.freeze({ app: 'برنامه', website: 'وب‌سایت' });

/** خطای کاربرپسندِ قابلِ‌انتظار (مسیرها آن را ۴۰۰ می‌کنند، نه ۵۰۰). */
function fail(message, code = 'bad_input') {
  const e = new Error(message);
  e.code = code;
  e.expected = true;
  return e;
}

const clip = (value, max) => String(value ?? '').trim().slice(0, max);

/**
 * اعتبارسنجی و نرمال‌سازیِ ورودیِ پنل.
 *
 * `partial` برای ویرایش است: هر فیلدی که نیامده، از مقدارِ فعلی می‌آید.
 */
function validateInput(raw, current = null) {
  const b = raw && typeof raw === 'object' ? raw : {};
  const base = current || {};

  const title = clip(b.title ?? base.title, 60);
  if (title.length < 2) throw fail('عنوان باید حداقل ۲ حرف باشد');

  const description = clip(b.description ?? base.description, 400);

  // لینک: کاربر روی این دکمه می‌زند و از اپ بیرون می‌رود؛ آدرسِ بی‌scheme
  // در مرورگر به «آدرسِ خودمان + رشته» تبدیل می‌شود و کارتِ معرفی، کاربر را
  // به خانهٔ خودمان می‌برد. پس صریح رد می‌شود.
  const linkUrl = clip(b.linkUrl ?? base.linkUrl, 500);
  if (!/^https?:\/\/\S+$/i.test(linkUrl)) {
    throw fail('لینک باید با http:// یا https:// شروع شود');
  }

  const kind = String(b.kind ?? base.kind ?? 'app').trim();
  if (!KIND_LABELS[kind]) throw fail('نوع باید «برنامه» یا «وب‌سایت» باشد');

  // تصویر اختیاری است ولی اگر آمد، باید یا مسیرِ نسبیِ آپلود باشد یا آدرسِ کامل.
  const imageRaw = clip(b.imageUrl ?? base.imageUrl, 500);
  let imageUrl = '';
  if (imageRaw) {
    if (/^https?:\/\//i.test(imageRaw)) imageUrl = imageRaw;
    else if (imageRaw.startsWith('/uploads/')) imageUrl = imageRaw;
    else throw fail('عکس باید مسیرِ /uploads/… یا آدرسِ کامل باشد');
  }

  const isActive = b.isActive === undefined ? (base.isActive ?? true) : b.isActive === true;
  const sortOrder = Number.isFinite(Number(b.sortOrder))
    ? Math.trunc(Number(b.sortOrder))
    : Number(base.sortOrder ?? 0);

  return { title, description, linkUrl, kind, imageUrl, isActive, sortOrder };
}

/** صفحهٔ درخواستی را به بازهٔ امن تبدیل می‌کند (۱-پایه، سقفِ ۱۰ در صفحه). */
function normalizePage(query = {}) {
  const rawPage = Number.parseInt(String(query.page ?? '1'), 10);
  const rawPer = Number.parseInt(String(query.per_page ?? DEFAULT_PER_PAGE), 10);
  const perPage = Math.min(MAX_PER_PAGE, Math.max(1, Number.isFinite(rawPer) ? rawPer : DEFAULT_PER_PAGE));
  const page = Math.max(1, Number.isFinite(rawPage) ? rawPage : 1);
  return { page, perPage, offset: (page - 1) * perPage };
}

/** شمارشِ صفحه‌ها — تا کلاینت بتواند دکمه‌های شماره‌دار بسازد. */
function pageInfo({ page, perPage, total }) {
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  return {
    page,
    perPage,
    total,
    totalPages,
    hasMore: page < totalPages,
    hasPrev: page > 1,
  };
}

/**
 * ردیفِ دیتابیس → شکلِ عمومی.
 *
 * ⚠️ عمداً هیچ فیلدِ داخلی (updated_by_admin_id، sort_order، is_active) به
 *    کلاینت نمی‌رود: کلاینت‌ها فقط به آن چیزی نیاز دارند که نشان می‌دهند، و
 *    هر فیلدِ اضافه یک قراردادِ نانوشتهٔ تازه است که بعداً کسی رویش حساب
 *    می‌کند.
 */
function toPublicItem(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description || '',
    linkUrl: row.link_url,
    kind: row.kind,
    kindLabel: KIND_LABELS[row.kind] || KIND_LABELS.app,
    imageUrl: row.image_url || '',
  };
}

/** ردیفِ دیتابیس → شکلِ پنل (شاملِ وضعیتِ داخلی). */
function toAdminItem(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description || '',
    linkUrl: row.link_url,
    kind: row.kind,
    kindLabel: KIND_LABELS[row.kind] || KIND_LABELS.app,
    imageUrl: row.image_url || '',
    isActive: row.is_active !== false,
    sortOrder: Number(row.sort_order || 0),
    updatedAt: row.updated_at,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
//  دسترسی به دیتابیس
// ═══════════════════════════════════════════════════════════════════════════

/** آیا بخش فعال است؟ (تیکِ «نمایش در اپ و وب») — کلیدش در `client_config`. */
async function isEnabled() {
  const { rows } = await pool.query(
    "SELECT value FROM app_settings WHERE key='client_config' LIMIT 1");
  const features = rows[0]?.value?.features;
  // پیش‌فرض «روشن» است: اگر کلید نبود، محصول رفتارِ «ساخته‌شده» را دارد.
  // ⚠️ این با «تیکِ خاموشِ ادمین» فرق دارد: خاموشی فقط وقتی است که ادمین
  //    صریحاً false نوشته باشد.
  return features?.recommendedApps !== false;
}

/** فهرستِ عمومیِ صفحه‌بندی‌شده — همان چیزی که وب و اندروید می‌خوانند. */
async function listPublic(query = {}) {
  const { page, perPage, offset } = normalizePage(query);
  const enabled = await isEnabled();
  if (!enabled) {
    // وقتی بخش خاموش است، محتوا هم برنمی‌گردد: «خاموش» یعنی هیچ جایی از
    // محصول چیزی از این بخش نمی‌بیند، نه اینکه سرور داده بدهد و کلاینت
    // یادش باشد پنهانش کند.
    return { enabled: false, items: [], page: pageInfo({ page, perPage, total: 0 }) };
  }

  const totalRes = await pool.query('SELECT COUNT(*)::int AS n FROM recommended_apps WHERE is_active');
  const total = totalRes.rows[0]?.n || 0;
  const { rows } = await pool.query(
    `SELECT * FROM recommended_apps
      WHERE is_active
      ORDER BY sort_order ASC, id ASC
      LIMIT $1 OFFSET $2`,
    [perPage, offset]);
  return { enabled: true, items: rows.map(toPublicItem), page: pageInfo({ page, perPage, total }) };
}

/** فهرستِ کاملِ پنل (شاملِ خاموش‌ها) + وضعیتِ تیکِ کلی. */
async function listAll() {
  const { rows } = await pool.query(
    'SELECT * FROM recommended_apps ORDER BY sort_order ASC, id ASC');
  return { active: await isEnabled(), maxItems: MAX_ITEMS, items: rows.map(toAdminItem) };
}

async function countAll() {
  const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM recommended_apps');
  return rows[0]?.n || 0;
}

/** ترتیبِ بعدی = بزرگ‌ترین ترتیب + ۱ (ردیفِ تازه پایینِ فهرست می‌نشیند). */
async function nextSortOrder() {
  const { rows } = await pool.query(
    'SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM recommended_apps');
  return Number(rows[0]?.next || 1);
}

async function create(raw, adminId) {
  if (await countAll() >= MAX_ITEMS) {
    throw fail(`حداکثر ${MAX_ITEMS} برنامه قابلِ معرفی است`, 'limit');
  }
  const v = validateInput(raw);
  if (!Number.isFinite(Number(raw?.sortOrder))) v.sortOrder = await nextSortOrder();
  const { rows } = await pool.query(
    `INSERT INTO recommended_apps
       (title, description, link_url, kind, image_url, is_active, sort_order, updated_by_admin_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING *`,
    [v.title, v.description, v.linkUrl, v.kind, v.imageUrl, v.isActive, v.sortOrder, adminId || null]);
  return toAdminItem(rows[0]);
}

async function update(id, raw, adminId) {
  const cur = await pool.query('SELECT * FROM recommended_apps WHERE id=$1', [id]);
  if (!cur.rowCount) throw fail('این برنامه پیدا نشد', 'not_found');
  const v = validateInput(raw, toAdminItem(cur.rows[0]));
  const { rows } = await pool.query(
    `UPDATE recommended_apps
        SET title=$2, description=$3, link_url=$4, kind=$5, image_url=$6,
            is_active=$7, sort_order=$8, updated_at=NOW(), updated_by_admin_id=$9
      WHERE id=$1
      RETURNING *`,
    [id, v.title, v.description, v.linkUrl, v.kind, v.imageUrl, v.isActive, v.sortOrder, adminId || null]);
  return toAdminItem(rows[0]);
}

async function remove(id) {
  const { rowCount } = await pool.query('DELETE FROM recommended_apps WHERE id=$1', [id]);
  if (!rowCount) throw fail('این برنامه پیدا نشد', 'not_found');
  // شناسه UUID است، پس همان رشته برمی‌گردد. (نسخهٔ اول `Number(id)` می‌کرد؛
  // با UUID یعنی `NaN` — همان اشتباهی که ستونِ `updated_by_admin_id INTEGER`
  // هم داشت و فقط در تولید دیده می‌شد.)
  return { id };
}

/**
 * جابه‌جاییِ یک ردیف با همسایه‌اش (دکمه‌های بالا/پایینِ پنل).
 *
 * چرا swap و نه «همه را از نو شماره بده»: یک درخواستِ کوچک، بدونِ بازنویسیِ
 * کلِ فهرست، و بدونِ پنجرهٔ زمانیِ نیمه‌نوشته که صفحه‌بندیِ هم‌زمانِ کاربر
 * ردیفی را دو بار ببیند.
 */
async function move(id, direction) {
  const dir = direction === 'up' ? 'up' : 'down';
  const cur = await pool.query('SELECT * FROM recommended_apps WHERE id=$1', [id]);
  if (!cur.rowCount) throw fail('این برنامه پیدا نشد', 'not_found');
  const me = cur.rows[0];

  const neighbor = await pool.query(
    dir === 'up'
      ? `SELECT * FROM recommended_apps
          WHERE (sort_order < $1) OR (sort_order = $1 AND id < $2)
          ORDER BY sort_order DESC, id DESC LIMIT 1`
      : `SELECT * FROM recommended_apps
          WHERE (sort_order > $1) OR (sort_order = $1 AND id > $2)
          ORDER BY sort_order ASC, id ASC LIMIT 1`,
    [me.sort_order, me.id]);
  if (!neighbor.rowCount) return { moved: false, id: me.id };   // لبهٔ فهرست

  const other = neighbor.rows[0];
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // اگر ترتیب‌ها مساوی‌اند، عددها را عوض نمی‌کنیم (هیچ اثری ندارد) و فقط
    // ترتیبِ نمایشِ درون‌گروهی عوض می‌شود؛ پس صریح مقدارها را می‌نویسیم.
    const a = Number(other.sort_order);
    const b = Number(me.sort_order);
    const [first, second] = a === b ? [a, b + (dir === 'up' ? -1 : 1)] : [b, a];
    await client.query('UPDATE recommended_apps SET sort_order=$2 WHERE id=$1', [me.id, first]);
    await client.query('UPDATE recommended_apps SET sort_order=$2 WHERE id=$1', [other.id, second]);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  return { moved: true, id: me.id, swappedWith: other.id };
}

module.exports = {
  MAX_ITEMS,
  DEFAULT_PER_PAGE,
  MAX_PER_PAGE,
  KIND_LABELS,
  validateInput,
  normalizePage,
  pageInfo,
  toPublicItem,
  toAdminItem,
  isEnabled,
  listPublic,
  listAll,
  create,
  update,
  remove,
  move,
};
