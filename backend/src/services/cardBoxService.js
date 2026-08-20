// ═══════════════════════════════════════════════════════════════════════════
// صندوق کارت — دروازهٔ دیجیتالِ ورود به دوئل
// ═══════════════════════════════════════════════════════════════════════════
//
// خواستهٔ مالک: «صندوق ها باید امتیاز بدن، که کاربری که فیزیکی نگرفته بتونه
// در دوعل کارت و غیره هم بازی کنه … صندوق باید تصادفی براساس درصد شانس
// باشد. قیمتش باید ۱۰۰ هزارتومان باشد و ۵ کارت تصادفی بده با امتیاز های
// همون کارت»
//
// ── مسئلهٔ بنیادی که این فایل حل می‌کند ──
//
// تا پیش از این، تنها منبعِ کارت `photoCardService.creditSubmission` بود —
// یعنی ثبتِ کدِ یک کارتِ فیزیکی. کسی که کارت فیزیکی نداشت، `deckCards` برایش
// خالی برمی‌گشت و `saveDeck` با «تیم باید دقیقاً ۵ کارت داشته باشد» رد
// می‌کرد. یعنی دوئل کارت برای او یک صفحهٔ قفلِ بدونِ کلید بود.
//
// صندوق دقیقاً پنج کارت می‌دهد — نه چهار، نه شش — چون `DECK_SIZE` در
// `cardDuelService` پنج است. یعنی یک صندوق = یک ترکیبِ کاملِ قابلِ بازی.
// این عدد تصادفی انتخاب نشده و اگر روزی DECK_SIZE عوض شود، این هم باید.

const crypto = require('crypto');
const { pool } = require('../config/db');

const BOX_SIZE = 5;
const DEFAULT_PRICE = 100000;

// ── چرا قرعه‌کشی دو مرحله‌ای است ──────────────────────────────────────────
//
// اول کلاس (rarity) با وزن انتخاب می‌شود، بعد یک کارت **درونِ** آن کلاس
// یکنواخت. مسیرِ ساده‌تر این بود که به هر کارت مستقیم وزن بدهیم، ولی آن‌وقت
// شانسِ واقعیِ هر کلاس به **تعدادِ** کارت‌های آن کلاس گره می‌خورد: امروز ۹
// کارت premium و ۳ کارت legend داریم؛ اگر مدیر فردا دو کارت legend اضافه
// کند، شانسِ legend بی‌آنکه کسی تصمیم گرفته باشد ۶۷٪ بالا می‌رود.
//
// با دو مرحله‌ای بودن، «۳٪ شانسِ لجند» یعنی دقیقاً ۳٪، مستقل از اینکه
// کاتالوگ چند کارتِ لجند دارد.

/**
 * انتخابِ یک کلاس بر اساس وزن، با تصادفِ رمزنگارانه.
 *
 * ⚠️ `Math.random()` عمداً استفاده نشده. این تابع تعیین می‌کند یک خریدِ
 *    ۱۰۰٬۰۰۰ تومانی چه چیزی تحویل می‌دهد. `Math.random` در V8 از xorshift128+
 *    می‌آید که با مشاهدهٔ چند خروجی قابلِ پیش‌بینی است — و مهم‌تر از خطرِ
 *    عملی، در محصولی که پول واقعی می‌گیرد باید بشود گفت «قرعه‌کشی با منبعِ
 *    تصادفِ رمزنگارانه است» و پشتش ایستاد.
 *
 * ⚠️ `randomInt(0, total)` بازهٔ **نیم‌باز** است: صفر را شامل می‌شود و
 *    `total` را نه. این دقیقاً چیزی است که می‌خواهیم — با بازهٔ بسته، یک
 *    مقدارِ برابرِ total از همهٔ سطل‌ها رد می‌شد و به fallback می‌افتاد.
 */
function pickWeighted(weights, rng = crypto) {
  const entries = Object.entries(weights).filter(([, w]) => Number(w) > 0);
  if (!entries.length) return null;
  const total = entries.reduce((s, [, w]) => s + Number(w), 0);
  if (total <= 0) return null;
  let roll = rng.randomInt(0, total);
  for (const [key, w] of entries) {
    roll -= Number(w);
    if (roll < 0) return key;
  }
  // از نظر ریاضی نارسیدنی است چون جمعِ کسرها دقیقاً total است و roll
  // اکیداً کمتر از total. نگه داشته می‌شود چون بازگشتِ undefined از این
  // تابع، پایین‌تر به یک کارتِ null و بعد به یک صندوقِ چهارکارتی تبدیل
  // می‌شد — خرابیِ بی‌صدا در مسیرِ پولی.
  return entries[entries.length - 1][0];
}

function createCardBoxService(db = pool) {
  /** شانس‌های فعلی، به شکل `{rarity: permille}`. */
  async function odds(client = db) {
    const { rows } = await client.query(
      'SELECT rarity, weight_permille FROM card_box_odds ORDER BY weight_permille DESC');
    const map = {};
    for (const r of rows) map[r.rarity] = Number(r.weight_permille);
    return map;
  }

  async function price(client = db) {
    const { rows } = await client.query(
      "SELECT value FROM app_settings WHERE key='card_box_price' LIMIT 1");
    const v = Number(rows[0]?.value);
    return Number.isFinite(v) && v > 0 ? Math.trunc(v) : DEFAULT_PRICE;
  }

  /**
   * نمای عمومیِ صندوق برای صفحهٔ فروش: قیمت، شانس‌ها به درصد، و اینکه
   * کاربر اصلاً کارت دارد یا نه.
   *
   * `needsBox` همان جمله‌ای است که کلاینت باید بر اساسش تصمیم بگیرد صندوق
   * را برجسته کند یا نه: کسی که کمتر از پنج کارت دارد هنوز نمی‌تواند وارد
   * دوئل شود.
   */
  async function overview(userId) {
    const [table, boxPrice] = await Promise.all([odds(), price()]);
    const { rows } = await db.query(
      `SELECT COALESCE(SUM(quantity),0)::int AS owned
         FROM user_card_inventory
        WHERE user_id=$1 AND consumed_in_reward=false`, [userId]);
    const owned = Number(rows[0]?.owned || 0);
    const total = Object.values(table).reduce((s, w) => s + w, 0) || 1000;
    return {
      price: boxPrice,
      size: BOX_SIZE,
      ownedCards: owned,
      // پنج کارت لازم است تا ترکیب کامل شود. این عدد از DECK_SIZE می‌آید.
      needsBox: owned < BOX_SIZE,
      odds: Object.entries(table)
        .map(([rarity, w]) => ({
          rarity,
          permille: w,
          // یک رقمِ اعشار کافی است و بیشترش فقط شلوغی است: ۳.۰٪ خواناست،
          // ۳.۰۰۰٪ نه.
          percent: Math.round((w / total) * 1000) / 10,
        }))
        .sort((a, b) => b.permille - a.permille),
    };
  }

  /**
   * پنج کارت را قرعه می‌کشد و تحویل می‌دهد. **باید داخل یک تراکنش صدا زده
   * شود** و `client` همان کلاینتِ تراکنشِ پرداخت باشد.
   *
   * @returns {{cards: Array, points: number, boxId: string}}
   *
   * ── چرا کاتالوگ یک بار خوانده می‌شود و نه پنج بار ──
   *
   * پنج کوئریِ جدا یعنی پنج رفت‌وبرگشت در مسیرِ داغِ پرداخت، و بدتر: بینِ
   * قرعهٔ اول و پنجم مدیر می‌تواند کارتی را غیرفعال کند و نیمهٔ دومِ صندوق
   * از کاتالوگِ دیگری بیاید.
   *
   * ── چرا تکرار به‌طورِ کلی مجاز است ──
   *
   * کارتِ تکراری در اینونتوری `quantity` را بالا می‌برد و بی‌ارزش نیست:
   * جوایزِ پلکانی (`reward_tier_cards`) تعدادِ مشخصی از یک کارت می‌خواهند.
   * اگر تکرار را همه‌جا ممنوع می‌کردیم، صندوق با کاتالوگِ ۲۹ کارتی بعد از
   * شش خرید عملاً تمام می‌شد.
   *
   * ── استثنا: اولین صندوقِ کاربرِ بی‌کارت ──
   *
   * خواستهٔ مالک: «بین کارت‌هایی که به کاربر بدون کارت داده میشه تکراری
   * نباشه». دلیلش تجربهٔ کاربر است، نه اقتصاد: کسی که هیچ کارتی ندارد و
   * اولین صندوقش را می‌خرد، اگر دو کارتِ یکسان بگیرد **ترکیبِ پنج‌نفره‌اش
   * ناقص می‌ماند** — `validateDeck` پنج کارتِ *متمایز* می‌خواهد. یعنی
   * صندوقی که کل هدفش «بتواند وارد دوئل شود» بود، همان وعده را می‌شکست.
   *
   * برای صندوق‌های بعدی تکرار دوباره مجاز است، چون آن‌وقت کاربر از قبل
   * ترکیبِ کاملی دارد و کارتِ تکراری برایش سرمایهٔ جوایزِ پلکانی است.
   */
  async function grantBox(client, {
    userId, pricePaid, source = 'cafebazaar', orderId = null, rng = crypto,
  }) {
    const weights = await odds(client);

    // آیا این «اولین صندوقِ کاربرِ بی‌کارت» است؟
    //
    // ⚠️ هر دو شرط لازم است. فقط `owned === 0` کافی نیست: کاربری که
    //    کارت‌هایش در جایزه مصرف شده دوباره به صفر می‌رسد و آن‌وقت هر
    //    صندوقش بدونِ تکرار می‌شد — که خواسته نبود.
    //
    // ⚠️ کوئری داخلِ همان تراکنشِ تحویل است، پس دو خریدِ هم‌زمان نمی‌توانند
    //    هر دو «اولین» تشخیص داده شوند.
    const { rows: preRows } = await client.query(
      `SELECT
         (SELECT COALESCE(SUM(quantity),0)::int FROM user_card_inventory
           WHERE user_id=$1 AND consumed_in_reward=false) AS owned,
         (SELECT COUNT(*)::int FROM card_box_purchases WHERE user_id=$1) AS boxes`,
      [userId]);
    const distinctMode = Number(preRows[0]?.owned || 0) === 0
      && Number(preRows[0]?.boxes || 0) === 0;

    // فقط کارت‌های قابلِ بازی. کارتِ کلکسیونی (مهاجرت ۰۶۱) در دوئل
    // نمی‌آید، پس گذاشتنش در صندوقی که هدفش «بتواند بازی کند» است، دقیقاً
    // همان وعده را می‌شکند.
    const { rows: catalogue } = await client.query(
      `SELECT id, name, image_url, point_value, duel_rarity
         FROM card_types
        WHERE is_active = true AND is_collectible = false`);

    if (catalogue.length < 1) {
      const e = new Error('کاتالوگ کارت خالی است');
      e.status = 503;
      throw e;
    }

    const byRarity = new Map();
    for (const c of catalogue) {
      const r = c.duel_rarity || 'normal';
      if (!byRarity.has(r)) byRarity.set(r, []);
      byRarity.get(r).push(c);
    }

    // کلاس‌هایی که هیچ کارتی ندارند از قرعه حذف می‌شوند و وزنشان بینِ
    // بقیه پخش می‌شود (چون pickWeighted روی جمعِ همین‌ها نرمال می‌کند).
    //
    // ⚠️ بدونِ این فیلتر، اگر مدیر تنها کارتِ legend را غیرفعال کند، ۳٪ از
    //    قرعه‌ها به یک سطلِ خالی می‌افتاد و صندوق چهار کارت تحویل می‌داد.
    const live = {};
    for (const [r, w] of Object.entries(weights)) {
      if (byRarity.has(r) && byRarity.get(r).length) live[r] = w;
    }
    if (!Object.keys(live).length) {
      // هیچ کلاسی با کارتِ زنده نماند — به کلِ کاتالوگ برمی‌گردیم تا خرید
      // بی‌جواب نماند.
      for (const [r, list] of byRarity) if (list.length) live[r] = 1;
    }

    // ── قرعه‌کشی ──────────────────────────────────────────────────────
    //
    // در حالتِ `distinctMode` کارتِ انتخاب‌شده از سطلِ خودش کنار گذاشته
    // می‌شود تا دوباره نیاید. اگر سطلی خالی شد، وزنش از `live` حذف می‌شود
    // و شانسش به‌طورِ طبیعی بینِ بقیه پخش می‌گردد (چون `pickWeighted` روی
    // جمعِ ورودی نرمال می‌کند).
    //
    // ⚠️ گاردِ «صندوق همیشه پنج کارت»: اگر کاتالوگ آن‌قدر کوچک باشد که
    //    پنج کارتِ متمایز نداشته باشد، `distinctMode` وسطِ کار خاموش
    //    می‌شود و بقیهٔ اسلات‌ها با قاعدهٔ عادی پر می‌شوند. یک صندوقِ
    //    چهارکارتی در مسیرِ پولی به‌هیچ‌وجه قابلِ قبول نیست.
    const distinctTotal = new Set(catalogue.map(c => c.id)).size;
    let noRepeat = distinctMode && distinctTotal >= BOX_SIZE;

    const pool = new Map();
    for (const [r, list] of byRarity) pool.set(r, list.slice());
    const liveNow = { ...live };

    const picked = [];
    for (let slot = 0; slot < BOX_SIZE; slot++) {
      if (!noRepeat) {
        const rarity = pickWeighted(live, rng);
        const bucket = byRarity.get(rarity) || catalogue;
        picked.push(bucket[rng.randomInt(0, bucket.length)]);
        continue;
      }

      let rarity = pickWeighted(liveNow, rng);
      let bucket = rarity ? pool.get(rarity) : null;

      // سطلِ قرعه‌خورده تمام شده — از `liveNow` بیرونش می‌کنیم و دوباره
      // قرعه می‌زنیم. حلقه‌ٔ بی‌پایان ممکن نیست چون هر دور یک کلید کم
      // می‌شود.
      while (rarity && (!bucket || !bucket.length)) {
        delete liveNow[rarity];
        rarity = pickWeighted(liveNow, rng);
        bucket = rarity ? pool.get(rarity) : null;
      }

      if (!bucket || !bucket.length) {
        // هیچ کلاسی کارتِ استفاده‌نشده ندارد. نباید برسیم اینجا (گاردِ
        // `distinctTotal` جلویش را گرفته)، ولی اگر رسیدیم صندوق را ناقص
        // رها نمی‌کنیم.
        noRepeat = false;
        slot -= 1;
        continue;
      }

      const idx = rng.randomInt(0, bucket.length);
      picked.push(bucket[idx]);
      bucket.splice(idx, 1); // دیگر در همین صندوق نیاید
    }

    const points = picked.reduce((s, c) => s + Number(c.point_value || 0), 0);

    const box = await client.query(
      `INSERT INTO card_box_purchases
         (user_id, price_paid, points_awarded, source, order_id, odds_snapshot,
          distinct_cards)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, created_at`,
      [userId, Math.max(0, Math.trunc(Number(pricePaid) || 0)), points,
        source, orderId, JSON.stringify(weights), noRepeat]);
    const boxId = box.rows[0].id;

    for (let i = 0; i < picked.length; i++) {
      const c = picked[i];
      await client.query(
        `INSERT INTO card_box_cards (box_id, slot, card_type_id, rarity, point_value)
         VALUES ($1,$2,$3,$4,$5)`,
        [boxId, i + 1, c.id, c.duel_rarity || 'normal', Number(c.point_value || 0)]);

      // ── اینونتوری ──
      //
      // `consumed_in_reward=false` در شرطِ ON CONFLICT نیست چون ایندکسِ
      // یکتا خودش جزئی است (`WHERE consumed_in_reward = FALSE`). ردیفِ
      // مصرف‌شده در جایزه، هدفِ این conflict نیست و باید دست‌نخورده بماند
      // — وگرنه سابقهٔ یک جایزهٔ تحویل‌شده بازنویسی می‌شد.
      await client.query(
        `INSERT INTO user_card_inventory
           (user_id, card_type_id, quantity, from_box_quantity, consumed_in_reward)
         VALUES ($1,$2,1,1,false)
         ON CONFLICT (user_id, card_type_id) WHERE consumed_in_reward = false
         DO UPDATE SET quantity = user_card_inventory.quantity + 1,
                       from_box_quantity = user_card_inventory.from_box_quantity + 1,
                       updated_at = NOW()`,
        [userId, c.id]);
    }

    return {
      boxId,
      points,
      // کلاینت با این پرچم می‌تواند در رونماییِ اولین صندوق پیامِ
      // «پنج کارتِ متفاوت» را نشان دهد.
      distinctCards: noRepeat,
      createdAt: box.rows[0].created_at,
      cards: picked.map((c, i) => ({
        slot: i + 1,
        id: c.id,
        name: c.name,
        imageUrl: c.image_url,
        rarity: c.duel_rarity || 'normal',
        pointValue: Number(c.point_value || 0),
      })),
    };
  }

  /** تاریخچهٔ صندوق‌های یک کاربر، برای صفحهٔ «خریدهای من». */
  async function history(userId, limit = 20) {
    const n = Math.min(100, Math.max(1, Number(limit) || 20));
    const { rows } = await db.query(
      `SELECT b.id, b.price_paid, b.points_awarded, b.created_at,
              COALESCE(json_agg(json_build_object(
                'slot', c.slot, 'name', t.name, 'rarity', c.rarity,
                'imageUrl', t.image_url, 'pointValue', c.point_value
              ) ORDER BY c.slot) FILTER (WHERE c.slot IS NOT NULL), '[]') AS cards
         FROM card_box_purchases b
         LEFT JOIN card_box_cards c ON c.box_id = b.id
         LEFT JOIN card_types t ON t.id = c.card_type_id
        WHERE b.user_id = $1
        GROUP BY b.id
        ORDER BY b.created_at DESC
        LIMIT $2`, [userId, n]);
    return rows.map(r => ({
      id: r.id,
      pricePaid: Number(r.price_paid),
      points: Number(r.points_awarded),
      createdAt: r.created_at,
      cards: r.cards,
    }));
  }

  return { odds, price, overview, grantBox, history };
}

module.exports = {
  ...createCardBoxService(),
  createCardBoxService,
  pickWeighted,
  BOX_SIZE,
  DEFAULT_PRICE,
};
