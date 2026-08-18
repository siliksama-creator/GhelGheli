// Deterministic cosmetics shop + monthly/annual GhelGheli Plus.
// Prices and grants are authoritative here/the database; clients only render.
const { pool } = require('../config/db');
const referrals = require('./referralService');
const payments = require('./paymentService');
const wallet = require('./walletService');
const points = require('./pointService');
const cardBox = require('./cardBoxService');

// Kept as named constants for economy audits and backwards-compatible tests.
const PLUS_PRICE = 59000;
const ANNUAL_PLUS_PRICE = 499000;

const PLUS_PLANS = Object.freeze({
  monthly: {
    key: 'monthly', plan: 'plus', price: PLUS_PRICE, days: 30,
    label: 'پلاس ماهانه', savingPercent: 0,
  },
  annual: {
    key: 'annual', plan: 'plus_annual', price: ANNUAL_PLUS_PRICE, days: 365,
    label: 'پلاس سالانه', savingPercent: 30,
  },
});

const PLUS_BENEFITS = Object.freeze([
  'دسترسی به قاب‌ها و افکت‌های نام متحرک در مدت اشتراک',
  'ستاره پلاس در پروفایل، چت، لیگ و بازی',
  'عضویت دائمی در یک باشگاه منتخب',
  'مسیر ویژه گذر نبرد (Premium Pass)',
  'حذف تبلیغات عادی',
]);

const ANNUAL_BENEFITS = Object.freeze([
  'قاب سلطنتی سالانه؛ هدیه دائمی و انحصاری',
  'عنوان دائمی «ستاره سالانه» روی پروفایل',
  'یک فرصت تغییر باشگاه منتخب در هر دوره سالانه',
]);

const SLOT_FOR_KIND = Object.freeze({
  club_badge: 'equipped_club',
  card_frame: 'equipped_frame',
  name_color: 'equipped_color',
  profile_background: 'equipped_profile_background',
  emote_pack: 'equipped_emote_pack',
  profile_badge: 'equipped_profile_badge',
});
const PLUS_UNLOCK_KINDS = new Set(['club_badge', 'card_frame', 'name_color']);

function fail(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

function styleKey(item) {
  return item?.payload || item?.slug || null;
}

function selectedValue(user, kind) {
  return user?.[SLOT_FOR_KIND[kind]] || null;
}

function planView(plan) {
  return {
    billingCycle: plan.key,
    plan: plan.plan,
    label: plan.label,
    price: plan.price,
    days: plan.days,
    savingPercent: plan.savingPercent,
    benefits: plan.key === 'annual'
      ? [...PLUS_BENEFITS, ...ANNUAL_BENEFITS]
      : [...PLUS_BENEFITS],
  };
}

/**
 * @param {string} userId
 * @param {object} [client]
 * @param {object|null} [preloadedUser]
 *   ردیفِ `users` که فراخوان از قبل خوانده. اگر داده شود، این تابع دیگر
 *   `users` را نمی‌خواند. فقط `annual_club_switches` از آن لازم است.
 *
 *   ⚠️ چرا `undefined` و `null` فرق دارند: `catalogue()` ردیف را پاس
 *      می‌دهد و ممکن است کاربر حذف شده باشد (`null`). در آن حالت هم
 *      نباید دوباره کوئری بزنیم — پاسخ همان صفر است. پس تشخیص با
 *      `arguments.length`/`!== undefined` انجام می‌شود، نه با truthiness.
 */
async function plusStatus(userId, client = pool, preloadedUser = undefined) {
  const skipUserQuery = preloadedUser !== undefined;
  const [subscriptions, user] = await Promise.all([
    client.query(
      `SELECT plan, starts_at, expires_at
         FROM user_subscriptions
        WHERE user_id=$1 AND plan IN ('plus','plus_annual')
          AND expires_at > NOW()
        ORDER BY expires_at DESC`,
      [userId],
    ),
    skipUserQuery
      ? Promise.resolve({ rows: preloadedUser ? [preloadedUser] : [] })
      : client.query(
        `SELECT annual_club_switches FROM users WHERE id=$1`, [userId]),
  ]);
  const activeRows = subscriptions.rows;
  const annual = activeRows.find((r) => r.plan === 'plus_annual');
  const latest = activeRows[0];
  const active = activeRows.length > 0;
  return {
    active,
    tier: annual ? 'annual' : active ? 'monthly' : null,
    plan: annual?.plan || latest?.plan || null,
    startedAt: annual?.starts_at || latest?.starts_at || null,
    expiresAt: latest?.expires_at || null,
    adFree: active,
    premiumPass: active,
    clubSwitchesRemaining: Number(user.rows[0]?.annual_club_switches || 0),
  };
}

async function catalogue(userId) {
  // ── یک خواندنِ `users` به‌جای سه‌تا ────────────────────────────────────
  //
  // قبلاً همین یک ردیف سه بار از دیتابیس خوانده می‌شد:
  //   ۱. ستون‌های تجهیزشده (`equipped_*`)
  //   ۲. `wallet_balance` در یک کوئریِ جدا
  //   ۳. `annual_club_switches` داخلِ `plusStatus()`
  //
  // هر سه به یک ردیفِ یکسان با یک شرطِ یکسان می‌رسیدند. حالا یک کوئری
  // همهٔ ستون‌ها را می‌آورد و به `plusStatus` پاس داده می‌شود.
  //
  // ⚠️ چرا این کار **از نظر درستی** هم بهتر است، نه فقط سریع‌تر:
  //    سه کوئریِ جدا سه اسنپ‌شاتِ متفاوت از یک ردیف می‌دیدند. اگر وسطِ
  //    این سه، خریدی commit می‌شد، کاربر می‌توانست موجودیِ **قبل** از
  //    خرید را کنار آیتمِ **بعد** از خرید ببیند. حالا هر سه از یک
  //    اسنپ‌شاتِ واحد می‌آیند و چنین ناسازگاری ممکن نیست.
  const userRow = await pool.query(
    `SELECT equipped_club, equipped_frame, equipped_color,
            equipped_profile_background, equipped_emote_pack,
            equipped_profile_badge, profile_title, annual_club_switches,
            wallet_balance
       FROM users WHERE id=$1`, [userId]);
  const userRecord = userRow.rows[0] || null;

  const [items, owned, plus, clubs, history] = await Promise.all([
    pool.query(
      `SELECT id, slug, kind, name, description, image_url, payload, price,
              display_order, access_tier, is_purchasable, metadata
         FROM shop_items WHERE is_active=true
        ORDER BY kind, display_order, price, name`,
    ),
    pool.query(
      `SELECT item_id, price_paid, bought_at
         FROM user_shop_items WHERE user_id=$1`, [userId]),
    plusStatus(userId, pool, userRecord),
    pool.query(
      `SELECT m.club_slug AS slug, COALESCE(i.name,m.club_slug) AS name,
              (m.source='purchase') AS permanent, m.joined_at
         FROM effective_club_memberships m
         LEFT JOIN shop_items i ON i.kind='club_badge'
          AND COALESCE(i.payload,i.slug)=m.club_slug
        WHERE m.user_id=$1 ORDER BY m.joined_at DESC`,
      [userId],
    ),
    purchaseHistory(userId, { limit: 24, offset: 0 }),
  ]);
  const user = userRecord || {};
  const ownedById = new Map(owned.rows.map((r) => [r.item_id, r]));
  const memberClubs = new Set(clubs.rows.map((club) => club.slug));

  const decorated = items.rows.map((item) => {
    const purchase = ownedById.get(item.id);
    const unlockedByPlus = plus.active
      && item.access_tier !== 'annual'
      && PLUS_UNLOCK_KINDS.has(item.kind);
    const value = item.kind === 'club_badge' ? styleKey(item) : styleKey(item);
    return {
      ...item,
      price: Number(item.price),
      owned: Boolean(purchase),
      boughtAt: purchase?.bought_at || null,
      member: item.kind === 'club_badge' && memberClubs.has(value),
      unlockedByPlus,
      usable: Boolean(purchase || unlockedByPlus
        || (item.kind === 'club_badge' && memberClubs.has(value))),
      equipped: selectedValue(user, item.kind) === value,
    };
  });

  const groups = {};
  for (const item of decorated) (groups[item.kind] ||= []).push(item);
  const walletBalance = Number(userRecord?.wallet_balance || 0);
  return {
    walletBalance,
    // Compatibility with APKs released before the compact Shop redesign.
    balance: walletBalance,
    plus: {
      ...plus,
      price: PLUS_PLANS.monthly.price,
      days: PLUS_PLANS.monthly.days,
      daysLeft: plus.expiresAt
        ? Math.max(0, Math.ceil((new Date(plus.expiresAt) - Date.now()) / 86400000))
        : 0,
      benefits: [...PLUS_BENEFITS],
      perks: [...PLUS_BENEFITS],
      annualBenefits: [...ANNUAL_BENEFITS],
      expiryNote: 'خرید مستقیم دائمی است؛ دسترسی اشتراکی با پایان دوره متوقف می‌شود و باشگاه منتخبت می‌ماند.',
    },
    plans: [planView(PLUS_PLANS.monthly), planView(PLUS_PLANS.annual)],
    groups,
    items: decorated,
    clubs: clubs.rows,
    purchaseHistory: history.map((row) => ({
      ...row,
      pricePaid: Number(row.price_paid || 0),
      purchasedAt: row.purchased_at,
      expiresAt: row.expires_at || null,
    })),
    equipped: {
      club: user.equipped_club || null,
      color: user.equipped_color || null,
      clubBadge: user.equipped_club || null,
      frame: user.equipped_frame || null,
      nameColor: user.equipped_color || null,
      profileBackground: user.equipped_profile_background || null,
      emotePack: user.equipped_emote_pack || null,
      profileBadge: user.equipped_profile_badge || null,
      title: user.profile_title || null,
    },
  };
}

/**
 * تحویل یک آیتم شاپ **پس از** تأیید پرداخت بازار.
 *
 * ⚠️ این تابع پول نمی‌گیرد. تنها فراخوانندهٔ مجازش
 * `paymentService.verifyAndDeliver` است و فقط وقتی صدا زده می‌شود که
 * کافه‌بازار پرداخت را تأیید کرده باشد. `client` همان تراکنشی است که
 * سفارش را به `paid` تبدیل کرده — پس اگر تحویل بشکند، سفارش هم برمی‌گردد
 * و کاربر می‌تواند دوباره verify بزند.
 *
 * قبلاً این تابع `buyItem` بود و از کیف پول `debit` می‌کرد. مالک آن مدل
 * را رد کرد: کیف پول فقط پولِ خودِ کاربر است و خرید ۱۰۰٪ از بازار.
 */
/**
 * @param {number} [o.walletPaid=0]  چقدر از این خرید از کیف پول پرداخت
 *   شده. اگر بزرگ‌تر از صفر باشد، کمیسیونِ معرف **پرداخت نمی‌شود** —
 *   خواستهٔ صریحِ مالک. دلیلش این است که پولِ کیف پول خودش از کمیسیون و
 *   جایزهٔ لیگ آمده؛ کمیسیونِ دوباره روی آن، حلقه‌ای می‌سازد که در آن
 *   پول از هیچ زاده می‌شود.
 */
/**
 * تحویلِ صندوق کارت پس از تأییدِ پرداخت.
 *
 * داخلِ تراکنشِ `verifyAndDeliver` اجرا می‌شود، پس اگر هر کدام از سه گامِ
 * زیر شکست بخورد، هیچ‌کدام اعمال نمی‌شود: کارت بی‌امتیاز نمی‌ماند و
 * امتیازِ بی‌کارت هم داده نمی‌شود.
 *
 * ── چرا `league: true` است ──
 *
 * امتیازِ صندوق در رتبه‌بندیِ ماهانه حساب می‌شود. این یعنی پول می‌تواند
 * رتبهٔ لیگ را بالا ببرد — و آگاهانه پذیرفته شده، چون دقیقاً همان چیزی
 * است که کارتِ فیزیکیِ خریداری‌شده هم می‌کند و صندوق قرار است جایگزینِ
 * دیجیتالِ آن باشد. اگر صندوق امتیازِ لیگ نمی‌داد، کاربرِ بدونِ دسترسی به
 * کارتِ فیزیکی در لیگ عقب می‌ماند — همان نابرابری‌ای که صندوق برای رفعش
 * ساخته شد.
 *
 * توزیعِ جایزهٔ نقدی همچنان بر اساسِ **سکه** است (`ORDER BY coins DESC`) و
 * سکه فقط از بازی‌کردن می‌آید؛ پس خریدِ صندوق مستقیماً پول برنمی‌گرداند.
 */
async function deliverCardBox(client, { userId, amount, orderId }) {
  const box = await cardBox.grantBox(client, {
    userId,
    pricePaid: Number(amount) || 0,
    source: 'cafebazaar',
    orderId,
  });

  if (box.points > 0) {
    await points.credit(client, {
      userId,
      points: box.points,
      source: 'card_box',
      referenceType: 'card_box_purchases',
      referenceId: box.boxId,
      description: `صندوق کارت — ${box.cards.length} کارت`,
    });
  }

  // کمیسیونِ نقدیِ ۱۰٪ به معرف. صندوق فروشِ نقدیِ درگاهی است، پس دقیقاً
  // مثل آیتمِ شاپ رفتار می‌کند. `walletPaid` ندارد چون صندوق با کیف پول
  // خریدنی نیست.
  await referrals.payPurchaseCommission(client, {
    buyerId: userId,
    purchaseType: 'card_box',
    purchaseReferenceId: box.boxId,
    purchaseAmount: Number(amount) || 0,
    gatewayProvider: 'cafebazaar',
  });

  return {
    kind: 'card_box',
    boxId: box.boxId,
    cards: box.cards,
    points: box.points,
    referenceId: box.boxId,
  };
}

async function deliverItem(client, { userId, itemId, amount, walletPaid = 0 }) {
  const itemRes = await client.query(
    `SELECT * FROM shop_items WHERE id=$1 AND is_active=true FOR UPDATE`,
    [itemId],
  );
  const item = itemRes.rows[0];
  if (!item) throw fail('کالا پیدا نشد', 404);
  if (!item.is_purchasable || item.access_tier === 'annual') {
    throw fail('این هدیه فقط همراه پلاس سالانه فعال می‌شود', 409);
  }

  // مالکیت دوباره بررسی می‌شود گرچه `createShopOrder` هم بررسی کرده:
  // بین ساخت سفارش و تأیید پرداخت ممکن است کاربر همان آیتم را از راه
  // دیگری گرفته باشد (هدیهٔ سالانه، واریز ادمین). تحویلِ دوباره یعنی
  // خطای UNIQUE و برگشتِ کل تراکنش — پس صریح و با پیام روشن رد می‌شود.
  const previous = await client.query(
    `SELECT purchase_id FROM user_shop_items WHERE user_id=$1 AND item_id=$2`,
    [userId, itemId],
  );
  if (previous.rows[0]) throw fail('این کالا را قبلاً دریافت کرده‌اید', 409);

  // `price_paid` مبلغِ واقعاً پرداخت‌شده در بازار است، نه قیمتِ فعلیِ
  // آیتم. اگر مدیر بعداً قیمت را عوض کند، سابقهٔ مالی دست‌نخورده می‌ماند.
  const purchase = await client.query(
    `INSERT INTO user_shop_items(user_id,item_id,price_paid)
     VALUES($1,$2,$3) RETURNING purchase_id, bought_at`,
    [userId, itemId, Number(amount) || Number(item.price)],
  );
  const purchaseId = purchase.rows[0].purchase_id;

  // Buying a badge is permanent membership, independently of Plus.
  if (item.kind === 'club_badge') {
    const clubSlug = styleKey(item);
    await client.query(
      `INSERT INTO user_clubs(user_id,club_slug,source,joined_at)
       VALUES($1,$2,'purchase',NOW())
       ON CONFLICT(user_id,club_slug)
       DO UPDATE SET source='purchase', joined_at=EXCLUDED.joined_at`,
      [userId, clubSlug],
    );
  }

  // کمیسیون ۵٪ نقدی به معرف — تنها راهی که یک خرید به کیف پول پول
  // اضافه می‌کند. مبلغِ مرجع قیمتِ کاملِ بازار است (تصمیم مالک)، نه
  // سهم خالص پس از کسر ۳۰٪ کارمزد بازار.
  //
  // ⛔ استثنا: سهمی که از کیف پول پرداخت شده کمیسیون‌پذیر نیست. در
  // خریدِ ترکیبی فقط بخشِ واقعاً پرداخت‌شده به بازار مبنا قرار می‌گیرد؛
  // اگر کلِ مبلغ از کیف پول آمده باشد، اصلاً کمیسیونی در کار نیست.
  const commissionable = Math.max(
    0, (Number(amount) || Number(item.price)) - (Number(walletPaid) || 0),
  );
  const commission = commissionable > 0
    ? await referrals.payPurchaseCommission(client, {
      buyerId: userId,
      purchaseType: 'shop_item',
      purchaseReferenceId: purchaseId,
      purchaseAmount: commissionable,
      gatewayProvider: 'cafebazaar',
    })
    : null;

  return {
    referenceId: purchaseId,
    item: { ...item, price: Number(item.price), owned: true },
    boughtAt: purchase.rows[0].bought_at,
    joinedClub: item.kind === 'club_badge' ? styleKey(item) : null,
    referralCommissionCreated: Boolean(commission && !commission.duplicate),
  };
}

function normalizeBillingCycle(value) {
  const clean = String(value || 'monthly').toLowerCase();
  if (['annual', 'yearly', 'year'].includes(clean)) return 'annual';
  if (['monthly', 'month'].includes(clean)) return 'monthly';
  throw fail('دوره اشتراک باید ماهانه یا سالانه باشد');
}

/**
 * تحویل اشتراک پلاس **پس از** تأیید پرداخت بازار.
 *
 * ⚠️ پول نمی‌گیرد؛ فقط `paymentService.verifyAndDeliver` صدایش می‌زند.
 *
 * ── تمدید، نه بازنشانی ──
 * اگر کاربر اشتراک فعال داشته باشد، دورهٔ جدید از `expires_at` فعلی
 * شروع می‌شود نه از امروز. کاربری که ۲۰ روز اعتبار دارد و ماهانه
 * می‌خرد، ۵۰ روز می‌گیرد — نه ۳۰ روز با ۲۰ روز سوخته. این همان رفتاری
 * است که قبل از تغییرِ درگاه هم داشتیم و عمداً حفظ شده.
 */
async function deliverPlus(client, { userId, billingCycle, amount }) {
  const cycle = normalizeBillingCycle(billingCycle);
  const chosen = PLUS_PLANS[cycle];
  {
    const locked = await client.query(
      `SELECT id FROM users WHERE id=$1 FOR UPDATE`, [userId]);
    if (!locked.rows[0]) throw fail('کاربر پیدا نشد', 404);

    const active = await client.query(
      `SELECT MAX(expires_at) AS expires_at
         FROM user_subscriptions
        WHERE user_id=$1 AND plan IN ('plus','plus_annual')
          AND expires_at > NOW()`,
      [userId],
    );
    const startsAt = active.rows[0]?.expires_at || new Date();
    const expiresAt = new Date(new Date(startsAt).getTime() + chosen.days * 86400000);
    const subscription = await client.query(
      `INSERT INTO user_subscriptions(user_id,plan,price_paid,starts_at,expires_at)
       VALUES($1,$2,$3,$4,$5)
       RETURNING id, plan, price_paid, starts_at, expires_at`,
      [userId, chosen.plan, chosen.price, startsAt, expiresAt],
    );
    const subscriptionId = subscription.rows[0].id;

    if (cycle === 'annual') {
      await client.query(
        `INSERT INTO user_shop_items(user_id,item_id,price_paid)
         SELECT $1, i.id, 0 FROM shop_items i
          WHERE i.slug = 'annual_royal_frame'
         ON CONFLICT(user_id,item_id) DO NOTHING`,
        [userId],
      );
      await client.query(
        `INSERT INTO user_entitlements
           (user_id, entitlement_key, metadata, granted_by_subscription_id)
         VALUES
           ($1,'annual_profile_title','{"title":"ستاره سالانه"}'::jsonb,$2),
           ($1,'annual_club_switch','{"switches":1}'::jsonb,$2)
         ON CONFLICT(user_id,entitlement_key) DO UPDATE SET
           metadata=EXCLUDED.metadata,
           granted_by_subscription_id=EXCLUDED.granted_by_subscription_id,
           granted_at=NOW()`,
        [userId, subscriptionId],
      );
      await client.query(
        `UPDATE users SET
           profile_title=COALESCE(profile_title,'ستاره سالانه'),
           equipped_frame=COALESCE(equipped_frame,'annual_royal_frame'),
           annual_club_switches=GREATEST(annual_club_switches,1),
           updated_at=NOW()
         WHERE id=$1`,
        [userId],
      );
    }

    // کمیسیون ۵٪ نقدی به معرف، داخل همان تراکنش.
    const commission = await referrals.payPurchaseCommission(client, {
      buyerId: userId,
      purchaseType: cycle === 'annual' ? 'plus_annual' : 'plus_monthly',
      purchaseReferenceId: subscriptionId,
      purchaseAmount: Number(amount) || chosen.price,
      gatewayProvider: 'cafebazaar',
    });

    // `plusStatus` روی همین client خوانده می‌شود نه pool: اگر از pool
    // بخوانیم، تراکنش هنوز commit نشده و وضعیتِ قبل از خرید برمی‌گردد —
    // کاربر پول داده ولی پاسخ می‌گوید پلاس ندارد.
    return {
      referenceId: subscriptionId,
      subscription: subscription.rows[0],
      billingCycle: cycle,
      plus: await plusStatus(userId, client),
      annualGiftsGranted: cycle === 'annual',
      referralCommissionCreated: Boolean(commission && !commission.duplicate),
    };
  }
}

// ── لایهٔ عمومی: سفارش → بازار → تحویل ────────────────────────────────
//
// این دو تابع همان چیزی هستند که روت‌ها صدا می‌زنند. عمداً اینجا (و نه در
// paymentService) نشسته‌اند تا `require` یک‌طرفه بماند:
//     routes → shopService → paymentService
// اگر paymentService مستقیم shopService را require می‌کرد، حلقه می‌شد.

/**
 * مرحلهٔ ۱ برای آیتم شاپ: سفارش بساز و مشخصات محصول بازار را برگردان.
 *
 * ── پرداختِ ترکیبی با کیف پول (دورِ ۲۲) ──
 *
 * کاربری که از لیگ یا جایزهٔ نقدی پول گرفته باید بتواند همان را در شاپ
 * خرج کند. سه حالت ممکن است:
 *
 *   موجودی ≥ قیمت   → کلِ مبلغ از کیف پول، تحویلِ فوری، بدونِ بازار.
 *   ۰ < موجودی < قیمت → به‌اندازهٔ موجودی از کیف پول کم می‌شود و
 *                        باقی‌مانده از بازار گرفته می‌شود.
 *   موجودی = ۰       → رفتارِ قبلی، کاملاً از بازار.
 *
 * حالتِ میانی عمداً کیف پول را **همین‌جا** کم می‌کند و نه بعد از تأیید
 * بازار: اگر اول بازار را باز کنیم و کاربر وسطش موجودی‌اش را با برداشت
 * خالی کند، سفارش با مبلغی که دیگر وجود ندارد تأیید می‌شود. کسرِ زودهنگام
 * یعنی اگر پرداختِ بازار نیمه‌کاره رها شود باید پول برگردد — که در
 * `refundAbandonedWalletHold` انجام می‌شود.
 *
 * @param {boolean} [useWallet=false] فقط وقتی کلاینت صریحاً خواسته باشد.
 *   پیش‌فرضِ خاموش عمدی است: کاربر نباید ناخواسته موجودیِ نقدی‌اش را
 *   خرج کند چون دکمهٔ «خرید» را زده.
 */
async function buyShopItem(userId, slug, { useWallet = false } = {}) {
  if (!useWallet) return payments.createShopOrder(userId, slug);

  const item = await resolveShopItem(slug);
  const price = Number(item.price);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // قفلِ کاربر پیش از خواندنِ موجودی: بدونِ آن دو خریدِ همزمان هر دو
    // موجودیِ قدیمی را می‌خوانند و کاربر دو کالا با پولِ یکی می‌گیرد.
    const locked = await client.query(
      'SELECT wallet_balance FROM users WHERE id=$1 FOR UPDATE', [userId]);
    if (!locked.rows[0]) throw fail('کاربر پیدا نشد', 404);

    const owned = await client.query(
      'SELECT 1 FROM user_shop_items WHERE user_id=$1 AND item_id=$2',
      [userId, item.id]);
    if (owned.rows[0]) throw fail('این کالا را قبلاً خریده‌اید', 409);

    const balance = Number(locked.rows[0].wallet_balance || 0);
    if (balance <= 0) {
      await client.query('ROLLBACK');
      return payments.createShopOrder(userId, slug);
    }

    const fromWallet = Math.min(balance, price);
    const remainder = price - fromWallet;

    // ── حالتِ کامل: هیچ پولی به بازار نمی‌رود ──
    if (remainder === 0) {
      await wallet.debit(client, {
        userId, amount: fromWallet, source: 'shop',
        referenceType: 'shop_item', referenceId: item.id,
        description: `خرید ${item.name} با موجودی کیف پول`,
      });
      const delivered = await deliverItem(client, {
        userId, itemId: item.id, amount: price, walletPaid: fromWallet,
      });
      await client.query('COMMIT');
      return {
        settled: true,
        paidFromWallet: fromWallet,
        remainingToPay: 0,
        walletBalance: balance - fromWallet,
        ...delivered,
      };
    }

    // ── حالتِ ترکیبی: سهمِ کیف پول رزرو، باقی از بازار ──
    await client.query('COMMIT');
    const order = await payments.createShopOrder(userId, slug, {
      walletAmount: fromWallet,
    });
    return { ...order, settled: false, paidFromWallet: fromWallet, remainingToPay: remainder };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/** یافتنِ آیتم با slug یا UUID — همان قاعدهٔ `createShopOrder`. */
async function resolveShopItem(slug) {
  const key = String(slug || '');
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    .test(key);
  const { rows } = await pool.query(
    `SELECT id, slug, name, price, access_tier, is_purchasable
       FROM shop_items
      WHERE ${isUuid ? 'id=$1::uuid' : 'slug=$1'} AND is_active=true`,
    [key]);
  const item = rows[0];
  if (!item) throw fail('کالا پیدا نشد', 404);
  if (!item.is_purchasable || item.access_tier === 'annual') {
    throw fail('این هدیه فقط همراه پلاس سالانه فعال می‌شود', 409);
  }
  return item;
}

/** مرحلهٔ ۱ برای پلاس. */
async function buyPlusSubscription(userId, billingCycle = 'monthly') {
  return payments.createPlusOrder(userId, billingCycle);
}

/**
 * مرحلهٔ ۱ برای صندوق کارت: فقط سفارش می‌سازد.
 *
 * ⚠️ عمداً کیف پول را نمی‌پذیرد. صندوق برخلافِ آیتمِ شاپ، کارتِ
 *    امتیازدار تحویل می‌دهد و امتیاز در لیگ می‌نشیند؛ اجازهٔ خریدش با
 *    موجودیِ نقدیِ برداشت‌شده از خودِ لیگ، حلقهٔ «جایزه را دوباره به
 *    امتیاز تبدیل کن» را باز می‌کرد. صندوق فقط با پولِ تازه از بازار.
 */
async function buyCardBox(userId) {
  return payments.createCardBoxOrder(userId);
}

/**
 * مرحلهٔ ۳: توکن را راستی‌آزمایی و کالا را تحویل بده.
 *
 * تابعِ تحویل بر اساس `purchase_kind` سفارش انتخاب می‌شود — از روی
 * **سفارشِ ذخیره‌شده**، نه از روی چیزی که کلاینت فرستاده. کلاینت فقط
 * `orderId` و `purchaseToken` می‌دهد؛ اینکه آن سفارش برای چه بوده و
 * چقدر بوده، فقط از دیتابیس خوانده می‌شود.
 */
async function verifyPurchase(userId, orderId, purchaseToken) {
  return payments.verifyAndDeliver(userId, orderId, purchaseToken,
    async (client, { order, amount }) => {
      if (order.purchase_kind === 'shop_item') {
        if (!order.shop_item_id) throw fail('سفارش ناقص است', 409);
        // `amount` مبلغی است که واقعاً به بازار رفته. در خریدِ ترکیبی،
        // سهمِ کیف پول قبلاً کسر شده و باید به تحویل هم گفته شود تا
        // کمیسیونِ معرف روی آن حساب نشود.
        const walletPaid = Number(order.wallet_amount || 0);
        return deliverItem(client, {
          userId,
          itemId: order.shop_item_id,
          amount: Number(amount) + walletPaid,
          walletPaid,
        });
      }
      if (order.purchase_kind === 'card_box') {
        return deliverCardBox(client, { userId, amount, orderId: order.id });
      }
      if (order.purchase_kind === 'plus_monthly'
       || order.purchase_kind === 'plus_annual') {
        return deliverPlus(client, {
          userId,
          billingCycle: order.plus_cycle
            || (order.purchase_kind === 'plus_annual' ? 'annual' : 'monthly'),
          amount,
        });
      }
      throw fail('نوع این سفارش پشتیبانی نمی‌شود', 409);
    });
}

async function assertUsable(client, userId, item) {
  const owned = await client.query(
    `SELECT 1 FROM user_shop_items WHERE user_id=$1 AND item_id=$2`,
    [userId, item.id],
  );
  if (owned.rows[0]) return { owned: true, plus: await plusStatus(userId, client) };
  const plus = await plusStatus(userId, client);
  if (plus.active && item.access_tier !== 'annual' && PLUS_UNLOCK_KINDS.has(item.kind)) {
    return { owned: false, plus };
  }
  throw fail('برای استفاده، ابتدا این مورد را بخرید یا اشتراک لازم را فعال کنید', 403);
}

async function equipClub(client, userId, item, access) {
  const clubSlug = styleKey(item);
  const membership = await client.query(
    `SELECT source FROM user_clubs WHERE user_id=$1 AND club_slug=$2`,
    [userId, clubSlug],
  );
  if (membership.rows[0]?.source === 'purchase' || access.owned) {
    await client.query(
      `INSERT INTO user_clubs(user_id,club_slug,source,joined_at)
       VALUES($1,$2,'purchase',NOW())
       ON CONFLICT(user_id,club_slug) DO UPDATE SET source='purchase'`,
      [userId, clubSlug],
    );
    return { value: clubSlug, switched: false };
  }

  if (!access.plus.active) throw fail('این باشگاه در دسترس نیست', 403);
  const current = await client.query(
    `SELECT club_slug FROM user_clubs
      WHERE user_id=$1 AND source='plus'
      ORDER BY joined_at DESC LIMIT 1 FOR UPDATE`,
    [userId],
  );
  const previous = current.rows[0]?.club_slug;
  if (previous && previous !== clubSlug) {
    // Serialize two devices trying to spend the same annual switch.
    const allowance = await client.query(
      `SELECT annual_club_switches FROM users WHERE id=$1 FOR UPDATE`, [userId]);
    if (access.plus.tier !== 'annual'
        || Number(allowance.rows[0]?.annual_club_switches || 0) <= 0) {
      throw fail('باشگاه منتخب پلاس ثابت است؛ پلاس سالانه هر دوره یک تغییر می‌دهد', 409);
    }
    const consumed = await client.query(
      `UPDATE users SET annual_club_switches=annual_club_switches-1,
              profile_avatar_key=CASE WHEN profile_avatar_key=$2
                THEN 'avatar_1_football.png' ELSE profile_avatar_key END,
              updated_at=NOW()
        WHERE id=$1 AND annual_club_switches > 0
        RETURNING annual_club_switches`,
      [userId, `club:${previous}`],
    );
    if (!consumed.rows[0]) throw fail('فرصت تغییر باشگاه این دوره مصرف شده است', 409);
    await client.query(
      `DELETE FROM user_clubs WHERE user_id=$1 AND source='plus'`, [userId]);
  }
  await client.query(
    `INSERT INTO user_clubs(user_id,club_slug,source,joined_at)
     VALUES($1,$2,'plus',NOW())
     ON CONFLICT(user_id,club_slug)
     DO UPDATE SET joined_at=EXCLUDED.joined_at`,
    [userId, clubSlug],
  );
  return { value: clubSlug, switched: Boolean(previous && previous !== clubSlug) };
}

async function equip(userId, slug, requestedKind = null) {
  if (!slug) {
    const column = SLOT_FOR_KIND[requestedKind];
    if (!column) throw fail('نوع آیتم برای برداشتن انتخاب مشخص نیست');
    await pool.query(`UPDATE users SET ${column}=NULL, updated_at=NOW() WHERE id=$1`, [userId]);
    return { equipped: null, kind: requestedKind };
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const itemRes = await client.query(
      `SELECT * FROM shop_items WHERE slug=$1 AND is_active=true`, [slug]);
    const item = itemRes.rows[0];
    if (!item) throw fail('آیتم پیدا نشد', 404);
    if (requestedKind && requestedKind !== item.kind) throw fail('نوع آیتم اشتباه است');
    const column = SLOT_FOR_KIND[item.kind];
    if (!column) throw fail('این نوع آیتم قابل انتخاب نیست');
    const access = await assertUsable(client, userId, item);
    const clubChoice = item.kind === 'club_badge'
      ? await equipClub(client, userId, item, access)
      : null;
    const value = clubChoice ? clubChoice.value : styleKey(item);
    await client.query(
      `UPDATE users SET ${column}=$2, updated_at=NOW() WHERE id=$1`,
      [userId, value],
    );
    await client.query('COMMIT');
    return {
      equipped: value,
      kind: item.kind,
      clubSwitchesRemaining: Math.max(
        0,
        access.plus.clubSwitchesRemaining - (clubChoice?.switched ? 1 : 0),
      ),
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function useClubAvatar(userId, clubSlug) {
  const clean = String(clubSlug || '').trim().toLowerCase();
  if (!/^[a-z0-9_]{1,40}$/.test(clean)) throw fail('باشگاه معتبر نیست');
  const member = await pool.query(
    `SELECT 1 FROM effective_club_memberships
      WHERE user_id=$1 AND club_slug=$2`, [userId, clean]);
  if (!member.rows[0]) throw fail('ابتدا عضو این باشگاه شوید', 403);
  const key = `club:${clean}`;
  await pool.query(
    `UPDATE users SET profile_avatar_key=$2, updated_at=NOW() WHERE id=$1`,
    [userId, key],
  );
  return { profileAvatarKey: key, clubSlug: clean };
}

async function purchaseHistory(userId, { limit = 50, offset = 0 } = {}) {
  const n = Math.max(1, Math.min(100, Number(limit) || 50));
  const o = Math.max(0, Number(offset) || 0);
  const [items, subscriptions] = await Promise.all([
    pool.query(
      `SELECT usi.purchase_id AS id, 'item' AS type, i.slug, i.kind, i.name,
              usi.price_paid, usi.bought_at AS purchased_at
         FROM user_shop_items usi JOIN shop_items i ON i.id=usi.item_id
        WHERE usi.user_id=$1 ORDER BY usi.bought_at DESC LIMIT $2 OFFSET $3`,
      [userId, n, o],
    ),
    pool.query(
      `SELECT id, 'subscription' AS type, plan AS slug,
              CASE WHEN plan='plus_annual' THEN 'پلاس سالانه' ELSE 'پلاس ماهانه' END AS name,
              price_paid, starts_at, expires_at, created_at AS purchased_at
         FROM user_subscriptions
        WHERE user_id=$1 AND plan IN ('plus','plus_annual')
        ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [userId, n, o],
    ),
  ]);
  return [...items.rows, ...subscriptions.rows]
    .sort((a, b) => new Date(b.purchased_at) - new Date(a.purchased_at))
    .slice(0, n);
}

// Batch projection used by chat, league, profiles and multiplayer payloads.
async function cosmeticsFor(userIds) {
  const ids = [...new Set((userIds || []).filter(Boolean))];
  if (!ids.length) return new Map();
  const { rows } = await pool.query(
    `SELECT u.id, u.equipped_club, u.equipped_frame, u.equipped_color,
            u.equipped_profile_background, u.equipped_emote_pack,
            u.equipped_profile_badge, u.profile_title,
            EXISTS(SELECT 1 FROM user_subscriptions s
                    WHERE s.user_id=u.id AND s.plan IN ('plus','plus_annual')
                      AND s.expires_at>NOW()) AS plus,
            EXISTS(SELECT 1 FROM user_subscriptions s
                    WHERE s.user_id=u.id AND s.plan='plus_annual'
                      AND s.expires_at>NOW()) AS annual
       FROM users u WHERE u.id=ANY($1::uuid[])`,
    [ids],
  );
  const owned = await pool.query(
    `SELECT usi.user_id, i.kind, COALESCE(i.payload,i.slug) AS value
       FROM user_shop_items usi JOIN shop_items i ON i.id=usi.item_id
      WHERE usi.user_id=ANY($1::uuid[])`,
    [ids],
  );
  const membership = await pool.query(
    `SELECT user_id, club_slug FROM effective_club_memberships
      WHERE user_id=ANY($1::uuid[])`, [ids]);
  const ownedSet = new Set(owned.rows.map((r) => `${r.user_id}:${r.kind}:${r.value}`));
  const memberSet = new Set(membership.rows.map((r) => `${r.user_id}:${r.club_slug}`));
  const out = new Map();
  for (const row of rows) {
    const can = (kind, value) => {
      if (!value) return null;
      if (ownedSet.has(`${row.id}:${kind}:${value}`)) return value;
      if (row.plus && PLUS_UNLOCK_KINDS.has(kind)) return value;
      return null;
    };
    const club = row.equipped_club && memberSet.has(`${row.id}:${row.equipped_club}`)
      ? row.equipped_club : null;
    const frame = can('card_frame', row.equipped_frame);
    const color = can('name_color', row.equipped_color);
    out.set(row.id, {
      plus: Boolean(row.plus),
      annual: Boolean(row.annual),
      // Legacy aliases stay stable for already-released Android/Web clients.
      club,
      color,
      frame,
      clubBadge: club,
      nameColor: color,
      profileBackground: can('profile_background', row.equipped_profile_background),
      emotePack: can('emote_pack', row.equipped_emote_pack),
      profileBadge: can('profile_badge', row.equipped_profile_badge),
      title: row.profile_title || null,
    });
  }
  return out;
}

async function emotePacksFor(userId) {
  const { rows } = await pool.query(
    `SELECT i.slug, i.name, i.metadata
       FROM user_shop_items usi JOIN shop_items i ON i.id=usi.item_id
      WHERE usi.user_id=$1 AND i.kind='emote_pack' AND i.is_active=true
      ORDER BY i.display_order`,
    [userId],
  );
  return rows.map((r) => ({
    slug: r.slug,
    name: r.name,
    icon: r.metadata?.icon || 'sparkle',
    messages: Array.isArray(r.metadata?.messages) ? r.metadata.messages : [],
  }));
}

async function isEmoteAllowed(userId, text) {
  const packs = await emotePacksFor(userId);
  return packs.some((pack) => pack.messages.includes(String(text || '').trim()));
}

module.exports = {
  catalogue,
  buyShopItem,
  buyPlusSubscription,
  buyCardBox,
  deliverItem,
  deliverPlus,
  verifyPurchase,
  equip,
  plusStatus,
  purchaseHistory,
  cosmeticsFor,
  useClubAvatar,
  emotePacksFor,
  isEmoteAllowed,
  PLUS_PLANS,
  PLUS_BENEFITS,
  ANNUAL_BENEFITS,
  SLOT_FOR_KIND,
};
