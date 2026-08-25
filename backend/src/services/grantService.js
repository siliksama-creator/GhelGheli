// ═══════════════════════════════════════════════════════════════════════════
// جایزه‌های بازنشده — صندوقِ بسته‌ای که روی قفسه می‌ماند
// ═══════════════════════════════════════════════════════════════════════════
//
// خواستهٔ مالک: «اگه صندوق بردن پیام بردن صندوق بیاد و کاربرها بتونن
// صندوق کارت رو باز کنن · یا مثلا اگه جایزه گردونه صندوق کارت بود».
//
// ── چرا این سرویس جدا از cardBoxService است ──
//
// `grantBox` قرعه می‌زند و کارت تحویل می‌دهد. خریدِ فروشگاه همان لحظه
// باید باز شود. جایزهٔ گردونه/لیگ نباید: کاربر باید پیام «بردی» را ببیند
// و **بعد** صندوق را باز کند. اگر قرعه همان لحظهٔ برد زده می‌شد، انیمیشن
// باز شدن دروغ می‌شد و کاربری که اپ را بسته بود صندوقش را گم می‌کرد.
//
// این فایل فقط سندِ «مالِ توست، هنوز باز نشده» را نگه می‌دارد. باز کردن
// از همان `grantBox` می‌گذرد تا شانس و اینونتوری یک مسیر داشته باشند.

const { pool } = require('../config/db');
const cardBox = require('./cardBoxService');
const points = require('./pointService');

const KINDS = Object.freeze(['card_box', 'shop_item', 'plus_days']);
const SOURCES = Object.freeze(['wheel', 'league', 'admin']);

function fail(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

function view(row) {
  if (!row) return null;
  return {
    id: row.id,
    kind: row.kind,
    value: Number(row.value || 0),
    itemSlug: row.item_slug || null,
    label: row.label || defaultLabel(row),
    source: row.source,
    sourceRef: row.source_ref || null,
    boxId: row.box_id || null,
    openedAt: row.opened_at || null,
    createdAt: row.created_at,
    pending: !row.opened_at && row.kind === 'card_box',
  };
}

function defaultLabel(row) {
  if (row.kind === 'card_box') return 'صندوق کارت';
  if (row.kind === 'plus_days') {
    return `${Number(row.value || 0).toLocaleString('fa-IR')} روز اشتراک پلاس`;
  }
  if (row.kind === 'shop_item') return 'یک آیتم فروشگاه';
  return 'جایزه';
}

/**
 * فهرستِ جایزه‌های بازنشدهٔ کاربر — برای بنر خانه و صفحهٔ کلکسیون.
 */
async function pendingFor(userId, client = pool) {
  const { rows } = await client.query(
    `SELECT * FROM user_item_grants
      WHERE user_id=$1 AND opened_at IS NULL AND kind='card_box'
      ORDER BY created_at ASC`,
    [userId],
  );
  return rows.map(view);
}

async function countPending(userId, client = pool) {
  const { rows } = await client.query(
    `SELECT COUNT(*)::int AS n FROM user_item_grants
      WHERE user_id=$1 AND opened_at IS NULL AND kind='card_box'`,
    [userId],
  );
  return Number(rows[0]?.n || 0);
}

/**
 * تاریخچهٔ جایزه‌های یک کاربر — برای جزئیاتِ پنل ادمین.
 *
 * بدون این، مدیر می‌توانست صندوق بدهد ولی نمی‌توانست ببیند کاربر چند
 * صندوقِ بازنشده دارد. پشتیبانی به سؤالِ «صندوقم نیومد» جوابی نداشت.
 */
async function listFor(userId, { limit = 40 } = {}, client = pool) {
  const n = Math.min(100, Math.max(1, Math.trunc(Number(limit) || 40)));
  const { rows } = await client.query(
    `SELECT * FROM user_item_grants
      WHERE user_id=$1
      ORDER BY created_at DESC
      LIMIT $2`,
    [userId, n],
  );
  return rows.map(view);
}

/**
 * چند صندوقِ جدا می‌سازد (سقف ۵).
 *
 * ── چرا یک ردیف با value=N نه ──
 *
 * `open()` یک صندوق باز می‌کند و opened_at را می‌گذارد. اگر سه صندوق در
 * یک ردیف می‌نشستند، یک تپ هر سه را می‌سوزاند یا دوتا گم می‌شدند. لیگ
 * هم از قبل N ردیف جدا می‌سازد؛ گردونه و اعطای ادمین باید همان قرارداد
 * را داشته باشند تا بنر خانه «۳ صندوق» راست بگوید.
 *
 * ضدتکرار فقط روی اولین ردیف است (`sourceRef`). بقیه source_ref=null
 * می‌گیرند چون UNIQUE (source, source_ref) اجازهٔ چند ردیف با یک
 * spinId نمی‌دهد. اگر اولین ردیف duplicate باشد، بقیه ساخته نمی‌شوند —
 * وگرنه کرشِ وسطِ چرخش سه صندوق اضافه می‌ساخت.
 */
async function awardBoxes(client, {
  userId, count = 1, label = null, source, sourceRef = null,
}) {
  const n = Math.min(5, Math.max(1, Math.trunc(Number(count) || 1)));
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const r = await award(client, {
      userId,
      kind: 'card_box',
      value: 1,
      label,
      source,
      sourceRef: i === 0 ? sourceRef : null,
    });
    if (r.duplicate) {
      return { grants: [r.grant], grant: r.grant, duplicate: true };
    }
    out.push(r.grant);
  }
  return { grants: out, grant: out[0] || null, duplicate: false };
}

/**
 * یک جایزه را ثبت می‌کند. باید داخل تراکنش صدا زده شود.
 *
 * ── تحویلِ فوری در برابرِ pending ──
 *
 * آیتم شاپ و پلاس همان لحظه به کاربر می‌رسند (کازمتیکِ دائمی / اشتراک)
 * و opened_at پر می‌شود. صندوق pending می‌ماند تا کاربر بازش کند.
 *
 * ضدتکرار: UNIQUE (source, source_ref). اگر همین چرخش قبلاً جایزه داده،
 * duplicate برمی‌گردد نه خطای ۵۰۰.
 */
async function award(client, {
  userId, kind, value = 1, itemSlug = null, label = null,
  source, sourceRef = null,
}) {
  if (!KINDS.includes(kind)) throw fail(`نوع جایزه نامعتبر: ${kind}`);
  if (!SOURCES.includes(source)) throw fail(`منبع جایزه نامعتبر: ${source}`);

  const qty = Math.max(0, Math.trunc(Number(value) || 0));
  if (kind !== 'card_box' && kind !== 'shop_item' && qty <= 0) {
    throw fail('مقدار جایزه باید بزرگ‌تر از صفر باشد');
  }

  let delivered = false;
  let openedAt = null;

  if (kind === 'plus_days') {
    const active = await client.query(
      `SELECT MAX(expires_at) AS expires_at
         FROM user_subscriptions
        WHERE user_id=$1 AND plan IN ('plus','plus_annual')
          AND expires_at > NOW()`,
      [userId],
    );
    const startsAt = active.rows[0]?.expires_at || new Date();
    const expiresAt = new Date(
      new Date(startsAt).getTime() + qty * 86400000);
    await client.query(
      `INSERT INTO user_subscriptions(user_id,plan,price_paid,starts_at,expires_at)
       VALUES($1,'plus',0,$2,$3)`,
      [userId, startsAt, expiresAt],
    );
    delivered = true;
    openedAt = new Date();
  } else if (kind === 'shop_item' && itemSlug) {
    const { rows } = await client.query(
      'SELECT id, kind, payload, slug FROM shop_items WHERE slug=$1 AND is_active=true',
      [itemSlug],
    );
    if (!rows[0]) {
      // آیتم بین تنظیم و پرداخت حذف شده. ردیف را pending می‌گذاریم تا
      // مدیر در پنل ببیند؛ کلِ چرخش/فصل نباید بمیرد.
      console.error(`[grants] shop item not found: ${itemSlug}`);
    } else {
      await client.query(
        `INSERT INTO user_shop_items(user_id,item_id,price_paid)
         VALUES($1,$2,0) ON CONFLICT DO NOTHING`,
        [userId, rows[0].id],
      );
      // نشان باشگاه بدون عضویت یعنی کاربر آیتم را «دارد» ولی نمی‌تواند
      // بپوشد — همان بن‌بستی که خرید عادی شاپ با user_clubs حلش کرده.
      if (rows[0].kind === 'club_badge') {
        const clubSlug = rows[0].payload || rows[0].slug;
        if (clubSlug) {
          await client.query(
            `INSERT INTO user_clubs(user_id,club_slug,source,joined_at)
             VALUES($1,$2,'purchase',NOW())
             ON CONFLICT(user_id,club_slug)
             DO UPDATE SET source='purchase', joined_at=EXCLUDED.joined_at`,
            [userId, clubSlug],
          );
        }
      }
      delivered = true;
      openedAt = new Date();
    }
  }
  // card_box: delivered=false, openedAt=null — عمدی.

  try {
    const ins = await client.query(
      `INSERT INTO user_item_grants
         (user_id, kind, value, item_slug, label, source, source_ref, opened_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [userId, kind, kind === 'shop_item' ? 1 : Math.max(1, qty),
        itemSlug, label, source, sourceRef, openedAt],
    );
    return { grant: view(ins.rows[0]), delivered, duplicate: false };
  } catch (e) {
    if (e.code === '23505' && sourceRef) {
      const { rows } = await client.query(
        `SELECT * FROM user_item_grants
          WHERE source=$1 AND source_ref=$2 LIMIT 1`,
        [source, sourceRef],
      );
      return { grant: view(rows[0]), delivered: false, duplicate: true };
    }
    throw e;
  }
}

/**
 * باز کردنِ صندوقِ جایزه. قرعه همان لحظه زده می‌شود — نه موقعِ برد.
 *
 * قفلِ ردیف جلوی دو دستگاهِ هم‌زمان را می‌گیرد: هر دو «باز نشده» می‌دیدند
 * و دو صندوق از یک جایزه بیرون می‌آمد.
 */
async function open(userId, grantId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT * FROM user_item_grants WHERE id=$1 AND user_id=$2 FOR UPDATE`,
      [grantId, userId],
    );
    const grant = rows[0];
    if (!grant) throw fail('این جایزه پیدا نشد', 404);
    if (grant.kind !== 'card_box') {
      throw fail('فقط صندوق کارت بازشدنی است', 400);
    }
    if (grant.opened_at) {
      // قبلاً باز شده — کارت‌های همان صندوق را برگردان، دوباره قرعه نزن.
      await client.query('COMMIT');
      const hist = await cardBox.history(userId, 50);
      const box = hist.find((b) => b.id === grant.box_id) || null;
      return {
        alreadyOpened: true,
        grant: view(grant),
        cards: box?.cards || [],
        points: box?.points || 0,
        boxId: grant.box_id,
      };
    }

    const box = await cardBox.grantBox(client, {
      userId,
      pricePaid: 0,
      source: grant.source === 'wheel' ? 'wheel' : 'grant',
    });

    if (box.points > 0) {
      await points.credit(client, {
        userId,
        points: box.points,
        source: 'card_box',
        referenceType: 'card_box_purchases',
        referenceId: box.boxId,
        description: `صندوق جایزه — ${box.cards.length} کارت`,
        // امتیازِ جایزهٔ لیگ/گردونه نباید رتبهٔ فصلِ بعد را بخرد.
        league: false,
      });
    }

    const upd = await client.query(
      `UPDATE user_item_grants
          SET opened_at=NOW(), box_id=$2
        WHERE id=$1
        RETURNING *`,
      [grant.id, box.boxId],
    );
    await client.query('COMMIT');
    return {
      alreadyOpened: false,
      grant: view(upd.rows[0]),
      cards: box.cards,
      points: box.points,
      distinctCards: box.distinctCards === true,
      boxId: box.boxId,
    };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

module.exports = {
  KINDS,
  SOURCES,
  pendingFor,
  countPending,
  listFor,
  awardBoxes,
  award,
  open,
  view,
};
