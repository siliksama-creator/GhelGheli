// ─────────────────────────────────────────────────────────────────────
// پروفایلِ کاربر، بوت‌استرپ، سطح، تغییرِ رمز و نمایهٔ عمومی —
// بیرون آمده از server.js (بندِ ۱ نقشهٔ راه). بدنه‌ها مو به مو منتقل شده‌اند.
// ─────────────────────────────────────────────────────────────────────
const express = require('express');

module.exports = ({
  pool, auth, asyncHandler, validateUuid,
  boundedText, safeUser, safeAvatarKey, safeImageUrl,
  isValidPasswordLength, cardDuel, shop, coins,
  gameEconomy, getGameRewardSettings, grants, level,
  loginStreak, pass, wheel, clubs,
  fieldCrypto, nicknamePolicy, bcrypt, changePasswordLimiter,
  signUser, points, rewardGroups, inviteLeague,
}) => {
  const router = express.Router();

router.get('/profile', auth, asyncHandler(async (req, res) => {
  // همان ستون‌های bootstrap تا دو مسیر هرگز از هم جدا نیفتند.
  // INVENTORY_IMAGE_SQL: طرحی که در لحظهٔ ثبت قرعه خورده (رو یا پشت).
  // ⚠️ اینجا عمداً FRONT_IMAGE_SQL نیست — آن مالِ آرنای دوئل است.
  // توضیحِ کاملِ تفاوت و باگی که از یکی‌کردنشان آمد در cardDuelService.
  const inv = await pool.query(
    `SELECT i.*, t.name, ${cardDuel.INVENTORY_IMAGE_SQL} AS image_url,
            t.point_value, t.cash_amount, t.description,
            t.duel_attack, t.duel_defense, t.duel_speed, t.duel_technique,
            t.duel_goal_chance, t.duel_energy, t.duel_rarity, t.duel_effect,
            t.is_collectible
       FROM user_card_inventory i
       JOIN card_types t ON t.id = i.card_type_id
      WHERE i.user_id=$1 AND i.consumed_in_reward=false ORDER BY t.name`,
    [req.user.id]);
  const leaguePayouts = await pool.query(`SELECT p.*, s.month_year FROM league_payouts p JOIN league_seasons s ON s.id=p.league_season_id WHERE p.user_id=$1 ORDER BY p.created_at DESC LIMIT 20`, [req.user.id]);
  const profileCosmetics = await shop.cosmeticsFor([req.user.id]);
  res.json({
    user: safeUser(req.user),
    inventory: inv.rows,
    leaguePayouts: leaguePayouts.rows,
    cosmetics: profileCosmetics.get(req.user.id) || null,
  });
}));

// ── بوت‌استرپ: هر چیزی که اپ بلافاصله بعد از ورود لازم دارد ──────────────
//
// چرا این endpoint وجود دارد
//
// اپ بعد از ورود سه درخواست جدا می‌زد: profile، rewards و wheel. هر سه
// روی سرور در مجموع کمتر از ۵ میلی‌ثانیه کار می‌برند — اندازه‌گیری شد —
// ولی هرکدام حدود ۵۰۰ میلی‌ثانیه طول می‌کشند چون تأخیر شبکه تا ایران
// همین‌قدر است. یعنی ۹۹٪ زمان انتظار کاربر، رفت‌وبرگشت است نه محاسبه.
//
// موازی کردنشان کمک کرد (۱۸۴۸ به ۸۲۱ میلی‌ثانیه)، ولی کف همچنان یک
// رفت‌وبرگشت کامل است. یکی کردنشان آن کف را به یک رفت‌وبرگشت می‌رساند و
// دو تای دیگر را کاملاً حذف می‌کند.
//
// حجم پاسخ‌ها ناچیز است (۰.۸ تا ۱.۸ کیلوبایت)، پس یکی کردنشان هیچ هزینهٔ
// پهنای باندی ندارد.
//
// Promise.all و نه await پشت سر هم: سه کوئری مستقل‌اند و سریالی کردنشان
// همان اشتباهی است که این endpoint قرار است حل کند.
router.get('/bootstrap', auth, asyncHandler(async (req, res) => {
  const [inv, payouts, rewards, wheelState, streakState] = await Promise.all([
    // ── چرا `cash_amount` و `created_at` هم برمی‌گردند ──
    //
    // اینونتوری بازطراحی شد: کاربر می‌تواند نزدیک به ۵۰ نوع کارت داشته
    // باشد و صفحهٔ جدید امکانِ مرتب‌سازی («تازه‌ترین»، «باارزش‌ترین») و
    // نمایشِ ارزشِ نقدی را می‌دهد.
    //
    // `i.created_at` لحظهٔ **اولین** ثبتِ آن نوع کارت است و
    // `i.updated_at` آخرین بار که تعدادش زیاد شده. برای «تازه‌ترین»
    // دومی درست است — کاربر می‌خواهد کارتی را ببیند که همین حالا ثبت
    // کرده، حتی اگر نسخهٔ اولش را ماه‌ها پیش گرفته باشد.
    // INVENTORY_IMAGE_SQL: طرحِ رو/پشتی که در لحظهٔ ثبت قرعه خورده و در
    // `display_design_id` ثابت شده. اگر کارت طرحی نداشته باشد (سیستمِ
    // قدیمی) به تصویرِ پیش‌فرضِ نوعِ کارت برمی‌گردد، نه هیچ.
    pool.query(
      `SELECT i.*, t.name, ${cardDuel.INVENTORY_IMAGE_SQL} AS image_url,
              t.point_value, t.cash_amount, t.description,
              t.duel_attack, t.duel_defense, t.duel_speed, t.duel_technique,
              t.duel_goal_chance, t.duel_energy, t.duel_rarity, t.duel_effect,
              t.is_collectible
         FROM user_card_inventory i
         JOIN card_types t ON t.id = i.card_type_id
        WHERE i.user_id = $1 AND i.consumed_in_reward = false
        ORDER BY t.name`, [req.user.id]),
    pool.query(
      `SELECT p.*, s.month_year FROM league_payouts p
         JOIN league_seasons s ON s.id = p.league_season_id
        WHERE p.user_id = $1 ORDER BY p.created_at DESC LIMIT 20`,
      [req.user.id]),
    pool.query(
      `SELECT * FROM reward_tiers WHERE is_active = true
        ORDER BY required_points`),
    // شکست گردونه نباید کل بوت‌استرپ را ببرد: نشانِ چرخش یک زینت است،
    // پروفایل نیست.
    wheel.status(req.user.id).catch(() => null),
    // استریک روزانه باید در اولین فریم داشبورد حاضر باشد. جدا خواندنش
    // باعث می‌شد کارت بعد از بقیهٔ صفحه بپرد و روی اینترنت موبایل حس
    // «وصله‌ای» بدهد؛ شکستش هم نباید بوت‌استرپ را خراب کند.
    loginStreak.status(req.user.id).catch(() => null),
  ]);

  // XP ورود روزانه. سقف منبع ۲۰ است، پس هر بار باز کردن اپ در یک روز
  // فقط یک بار حساب می‌شود — بقیه بی‌اثرند.
  pass.grantXp(req.user.id, 'daily_login').catch(() => {});

  // خلاصهٔ گذر نبرد برای نشانِ نوار بالا. کل وضعیت اینجا فرستاده
  // نمی‌شود (۵۰ پله × ۲ مسیر حجیم است)؛ فقط چیزی که برای نشان لازم
  // است. صفحهٔ گذر خودش /api/pass را می‌خواند.
  // ── ظاهرِ خودِ کاربر (ستارهٔ پلاس، قاب، رنگ اسم) ────────────────────
  //
  // درخواست مالک: «افرادی که اشتراک پلاس گرفتن در همه جای پلتفرم برای
  // خودشون و افراد دیگه ستارشون مشخص باشه».
  //
  // «برای خودشون» بخش فراموش‌شده بود: چت و لیگ ستارهٔ **بقیه** را نشان
  // می‌دادند، ولی داشبورد خودِ کاربر نام را خام چاپ می‌کرد. یعنی کسی که
  // پول داده بود، در اولین صفحه‌ای که بعد از ورود می‌بیند هیچ نشانی از
  // خریدش نداشت.
  let myCosmetics = null;
  try {
    const m = await shop.cosmeticsFor([req.user.id]);
    myCosmetics = m.get(req.user.id) || null;
  } catch { /* ظاهر یک زینت است؛ نباید بوت‌استرپ را بشکند */ }

  let passBrief = null;
  try {
    const st = await pass.status(req.user.id);
    if (st.active) {
      passBrief = {
        tier: st.tier, tierCount: st.tierCount, claimable: st.claimable,
        hasPlus: st.hasPlus, daysLeft: st.season.daysLeft,
        intoTier: st.intoTier, tierNeeds: st.tierNeeds,
        // نشانِ قرمز کنار آیکون: تعداد پله‌ای که **امروز** باز شده.
        // مالک: «وقتی بتل پس کاربر باز میشه کنار آیکون بتل پس ۱ قرمز
        // میاد اگه دوتا باز شده ۲ میاد ولی سقف باز شدن ۲ هستش».
        tiersToday: st.tiersToday,
        maxTiersPerDay: st.maxTiersPerDay,
        dayCapReached: st.dayCapReached,
      };
    }
  } catch { /* گذر نبرد نباید بوت‌استرپ را بشکند */ }

  res.json({
    user: safeUser(req.user),
    inventory: inv.rows,
    leaguePayouts: payouts.rows,
    rewards: rewards.rows,
    wheel: wheelState,
    loginStreak: streakState,
    pass: passBrief,
    cosmetics: myCosmetics,
    // لولِ خودِ کاربر — صفحهٔ بازی‌ها و هدرِ داشبورد از همین می‌خوانند،
    // پس هیچ درخواستِ اضافه‌ای لازم نیست.
    level: await level.statusFor(req.user.id),
    // سهمیهٔ سکهٔ امروز — سوار بر همان bootstrap تا صفحهٔ بازی‌ها بتواند
    // «۳۰ از ۳۰ بازی سکه‌دار» را بدونِ درخواستِ اضافه نشان بدهد.
    coinQuota: await coins.getQuota(req.user.id),
    // اقتصادِ بازی‌ها برای متن‌های راهنمای داخلِ اپ/وب — از تنظیماتِ
    // ادمین می‌آید، پس حتی اپ‌های قدیمی هم متنِ جدید می‌بینند.
    economy: await gameEconomy.publicView().catch(() => null),
    gamePoints: await getGameRewardSettings().catch(() => null),
    pendingGrants: await grants.pendingFor(req.user.id).catch(() => []),
  });
}));

// ═══════════════════════════════════════════════════════════════════════════
// وضعیتِ کاملِ لول — برای صفحهٔ بازی‌ها
// ═══════════════════════════════════════════════════════════════════════════
//
// bootstrap خلاصه را دارد، ولی صفحهٔ بازی‌ها بعد از هر بازی باید عددِ
// تازه را بگیرد بدون اینکه کلِ bootstrap (که سنگین است) دوباره خوانده
// شود.
router.get('/level', auth, asyncHandler(async (req, res) => {
  res.json(await level.statusFor(req.user.id));
}));

router.patch('/profile', auth, asyncHandler(async (req, res) => {
  const b = req.body || {};
  // EVERY field is validated here rather than trusted. Before this, three
  // separate inputs produced a 500 Server Error instead of a clear message:
  //   age:-5 / age:99999  -> CHECK constraint violation  (23514)
  //   age:"abc"           -> invalid integer syntax      (22P02)
  //   a 3000-char nickname-> value too long              (22001)
  // and `profileAvatarKey: "../../etc/passwd"` was accepted outright.
  let age = null;
  if (b.age !== undefined && b.age !== null && b.age !== '') {
    const n = Number(b.age);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 5 || n > 120) {
      return res.status(400).json({ message: 'سن باید عددی بین ۵ تا ۱۲۰ باشد' });
    }
    age = n;
  }
  if (b.profileAvatarKey !== undefined && b.profileAvatarKey !== null
      && b.profileAvatarKey !== '' && !safeAvatarKey(b.profileAvatarKey)) {
    return res.status(400).json({ message: 'آواتار انتخابی معتبر نیست' });
  }
  // Shape alone is not enough for a club crest: without this check any user
  // could PATCH `profileAvatarKey: "club:real_madrid"` and wear a badge they
  // never bought. The dedicated endpoint checks membership, so this generic
  // one has to as well.
  if (typeof b.profileAvatarKey === 'string'
      && b.profileAvatarKey.startsWith('club:')) {
    const slug = b.profileAvatarKey.slice(5);
    if (!await clubs.isMember(req.user.id, slug)) {
      return res.status(403).json({ message: 'عضو این باشگاه نیستی' });
    }
  }
  // BUG FIX: آواتار محافظ صریح داشت ولی آدرس عکس نداشت. safeImageUrl برای
  // ورودی خطرناک (javascript: / data: / http) مقدار null برمی‌گرداند، و
  // COALESCE در کوئری پایین آن را «تغییری نده» تفسیر می‌کرد — یعنی سرور
  // ۲۰۰ OK برمی‌گرداند و کاربر فکر می‌کرد عکسش ذخیره شده، در حالی که
  // بی‌صدا نادیده گرفته شده بود. حالا مثل آواتار، صریحاً ۴۰۰ می‌دهد.
  if (b.profileImageUrl !== undefined && b.profileImageUrl !== null
      && b.profileImageUrl !== '' && !safeImageUrl(b.profileImageUrl)) {
    return res.status(400).json({ message: 'آدرس عکس پروفایل معتبر نیست' });
  }

  // ── نامِ مستعار: حداکثر ۸ نویسه + فیلترِ فحش‌های فارسی/انگلیسی ────────
  //
  // خواستهٔ مالک (۱۷ شهریور): «در قسمت نامِ مستعار ... تا ۸ حرف نهایت، شامل
  // حرف و عدد و تمامی کاراکترهای خاص باشد. باید یک لیست از کلماتِ فارسی و
  // انگلیسیِ رکیک جمع‌آوری کنی که اگر کاربر آن‌ها را انتخاب کرد، به کاربر
  // بگوید انتخابِ این نام موردِ قبول نیست.»
  //
  // ⚠️ خالی/null یعنی «نامم را عوض نکن» (همان رفتارِ COALESCE)، پس
  //    `allowEmpty` روشن است؛ ولی اگر چیزی فرستاد و نامردود بود، صریحاً
  //    ۴۰۰ با پیامِ فارسی برمی‌گردد (نه سکوت و نه کوتاه‌شدنِ خودکار).
  const nickCheck = await nicknamePolicy.validateWithSettings(b.nickname, { allowEmpty: true });
  if (!nickCheck.ok) {
    return res.status(400).json({ message: nickCheck.error, code: nickCheck.code });
  }

  const { rows } = await pool.query(
    `UPDATE users SET
       first_name=COALESCE($1,first_name), last_name=COALESCE($2,last_name),
       nickname=COALESCE($3,nickname), profile_image_url=COALESCE($4,profile_image_url),
       profile_avatar_key=COALESCE($5,profile_avatar_key),
       bank_account=COALESCE($6,bank_account), age=COALESCE($7,age),
       city=COALESCE($8,city), province=COALESCE($9,province),
       fcm_token=COALESCE($10,fcm_token), updated_at=NOW()
     WHERE id=$11 RETURNING *`,
    [
      boundedText(b.firstName, 60),
      boundedText(b.lastName, 60),
      nickCheck.value,
      safeImageUrl(b.profileImageUrl),
      safeAvatarKey(b.profileAvatarKey),
      // ورودیِ کاربر قبل از نوشتن رمز می‌شود. `boundedText` اول طول را
      // می‌بُرد و بعد رمز می‌شود — ترتیب مهم است، وگرنه بُرش روی متنِ
      // رمزشده می‌افتد و داده را خراب می‌کند.
      fieldCrypto.encrypt(boundedText(b.bankAccount, 40)),
      age,
      boundedText(b.city, 60),
      boundedText(b.province, 60),
      boundedText(b.fcmToken, 500),
      req.user.id,
    ],
  );
  res.json({ user: safeUser(rows[0]) });
}));

router.post('/profile/change-password', auth, changePasswordLimiter, asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!isValidPasswordLength(newPassword)) return res.status(400).json({ message: 'رمز جدید باید بین ۶ تا ۷۲ کاراکتر باشد' });
  if (!req.user.password_hash || !currentPassword || !(await bcrypt.compare(String(currentPassword), req.user.password_hash))) {
    return res.status(401).json({ message: 'رمز فعلی درست نیست' });
  }
  // ═══════════════════════════════════════════════════════════════════════
  // تغییرِ رمز ⇒ بالا رفتنِ نسخهٔ جلسه ⇒ همهٔ دستگاه‌های دیگر بیرون
  // ═══════════════════════════════════════════════════════════════════════
  // خواستهٔ مالک این بود که کاربر «همیشه وارد بماند»، پس اگر فقط توکن‌ها را
  // می‌کشتیم، خودِ کاربری که همین حالا رمزش را عوض کرده هم پرت می‌شد و این
  // شبیهِ خرابی به‌نظر می‌رسید. پس همین دستگاه توکنِ تازه می‌گیرد و بقیه
  // می‌میرند. کلاینتی که پیام را نادیده بگیرد هم چیزِ بدی نمی‌بیند: در
  // درخواستِ بعدی ۴۰۱ می‌گیرد و (مثلِ قبل) صفحهٔ ورود می‌آید.
  const { rows } = await pool.query(
    'UPDATE users SET password_hash=$1, session_epoch=session_epoch+1, updated_at=NOW() WHERE id=$2 RETURNING *',
    [await bcrypt.hash(String(newPassword), 12), req.user.id],
  );
  res.json({
    message: 'رمز عبور با موفقیت تغییر کرد — بقیهٔ دستگاه‌ها از حساب خارج شدند',
    token: signUser(rows[0]),
  });
}));

router.get('/users/:id/public', auth, validateUuid('id'), asyncHandler(async (req, res) => {
  const { rows } = await pool.query('SELECT id,nickname,profile_image_url,profile_avatar_key,lifetime_points,current_points,monthly_league_points,coins,joined_at FROM users WHERE id=$1', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ message: 'کاربر پیدا نشد' });
  const rewards = await pool.query(`SELECT c.claimed_at,c.status,r.name,r.image_url,r.reward_type,r.reward_value FROM user_reward_claims c JOIN reward_tiers r ON r.id=c.reward_tier_id WHERE c.user_id=$1 AND c.status IN ('approved','paid') ORDER BY c.claimed_at DESC LIMIT 50`, [req.params.id]);
  // ═══════════════════════════════════════════════════════════════════════
  // کارت‌های عمومی: از **اینونتوری**، نه از جدولِ کدها
  // ═══════════════════════════════════════════════════════════════════════
  //
  // نسخهٔ قبلی فقط `card_codes` را می‌خواند — یعنی جدولِ سیستمِ قدیمی.
  // نتیجه: کارتی که کاربر با **عکس** ثبت کرده بود در پروفایلِ عمومی
  // اصلاً دیده نمی‌شد. کاربر کارت را در «کارت‌های من» می‌دید ولی
  // حریفش در چت یا لیگ چیزی نمی‌دید — انگار کارتی نخریده.
  //
  // `user_card_inventory` منبعِ واحدِ حقیقت است: هر دو مسیرِ ثبت
  // (کد تنها، و عکس+کد) در همان جدول می‌نویسند. پس این کوئری هر دو را
  // با هم نشان می‌دهد و فردا اگر مسیرِ سومی اضافه شود، خودبه‌خود
  // پوشش داده می‌شود.
  //
  // `consumed_in_reward=false`: کارتی که خرجِ جایزه شده دیگر در
  // مجموعهٔ کاربر نیست.
  // همان COALESCE مسیرهای دیگر: پروفایلِ عمومی باید **دقیقاً** همان
  // تصویری را نشان دهد که خودِ کاربر در «کارت‌های من» می‌بیند. اگر این
  // یکی به‌روز نمی‌شد، کارتی که کاربر «پشت» می‌بیند برای حریفش «رو»
  // دیده می‌شد — همان دسته ناهماهنگی که قبلاً باعث شد کارتِ عکسی اصلاً
  // در پروفایلِ عمومی دیده نشود.
  const cards = await pool.query(
    `SELECT t.id AS card_type_id, t.name,
            ${cardDuel.INVENTORY_IMAGE_SQL} AS image_url, t.point_value,
            t.description, t.duel_attack, t.duel_defense, t.duel_speed,
            t.duel_technique, t.duel_goal_chance, t.duel_energy,
            t.duel_rarity, t.duel_effect, t.is_collectible,
            i.quantity::int AS registered_count,
            i.updated_at AS last_registered_at
       FROM user_card_inventory i
       JOIN card_types t ON t.id = i.card_type_id
      WHERE i.user_id = $1 AND i.consumed_in_reward = false AND i.quantity > 0
      ORDER BY i.quantity DESC, t.name
      LIMIT 50`, [req.params.id]);
  const leaguePayouts = await pool.query(`SELECT p.rank,p.amount,p.payment_status,p.created_at,s.month_year FROM league_payouts p JOIN league_seasons s ON s.id=p.league_season_id WHERE p.user_id=$1 ORDER BY p.created_at DESC LIMIT 20`, [req.params.id]);

  // Everything a visitor should see when they tap someone in chat or the
  // league table: their finishes, their prizes, and their cosmetics.
  const leagueHistory = await pool.query(
    `SELECT month_year, rank, points, prize_amount
       FROM user_league_history WHERE user_id=$1
      ORDER BY created_at DESC LIMIT 24`, [req.params.id]);

  // Physical trophies keep their own snapshot, so they survive a tier being
  // edited or deleted — the JOIN above would lose them.
  const trophies = await pool.query(
    `SELECT reward_name AS name, reward_image AS image_url, status, claimed_at
       FROM user_reward_claims
      WHERE user_id=$1 AND reward_type='physical'
      ORDER BY claimed_at DESC LIMIT 50`, [req.params.id]);

  // ═══════════════════════════════════════════════════════════════════════
  // جوایز و آمارِ اقتصادیِ این کاربر (خواستهٔ مالک، ۴ مهر ۱۴۰۵)
  // ═══════════════════════════════════════════════════════════════════════
  //
  // «وقتی فردی روی پروفایل شخصی می‌ره تمامی جوایز از جمله میزان برد در لیگ
  //  و میزان کمسیون از دعوت از دوستان باید برای کاربر های مختلف قابلِ دیدن
  //  باشه.»
  //
  // تا امروز پروفایلِ عمومی فقط «تاریخچهٔ ۲۴ لیگِ آخر» را می‌داد و کسی که
  // ۳۰ فصل بازی کرده بود، بردِ واقعی‌اش دیده نمی‌شد؛ کمیسیونِ دعوت هم
  // اصلاً نبود. این دو کوئری، عددِ کاملِ عمرِ حساب را می‌دهد (نه ۲۴ ردیفِ
  // آخر) — و مستقل از طولِ `LIMIT`ِ تاریخچه است.
  const [leagueStats, referralStats] = await Promise.all([
    pool.query(
      `SELECT COUNT(*)::int AS seasons,
              COUNT(*) FILTER (WHERE rank = 1)::int AS wins,
              COUNT(*) FILTER (WHERE rank <= 3)::int AS podiums,
              COALESCE(SUM(prize_amount),0)::bigint AS prizes
         FROM user_league_history WHERE user_id=$1`, [req.params.id]),
    pool.query(
      `SELECT
         (SELECT COUNT(*)::int FROM users u
           WHERE u.referred_by=$1 AND u.status='active') AS invited,
         (SELECT COALESCE(SUM(e.earned_points),0)::int FROM referral_earnings e
           WHERE e.referrer_id=$1) AS earned_points,
         (SELECT COALESCE(SUM(c.commission_amount),0)::bigint
            FROM purchase_referral_commissions c
           WHERE c.referrer_id=$1) AS earned_cash`, [req.params.id]),
  ]);
  const ls = leagueStats.rows[0] || {};
  const rs = referralStats.rows[0] || {};
  // رتبهٔ کشوریِ معرفی — همان جدولی که تبِ «معرف‌های برتر تا کنون» نشان
  // می‌دهد، تا پروفایل و آن تب دو عددِ متفاوت از یک واقعیت ندهند.
  let inviteRank = null;
  try {
    const stand = await inviteLeague.standing(req.params.id);
    inviteRank = stand ? stand.rank : null;
  } catch (e) {
    console.error('[profile] invite rank failed:', e.message);
  }

  const cosmeticsMap = await shop.cosmeticsFor([req.params.id]);
  const cosmetics = cosmeticsMap.get(req.params.id) || {};
  // صفحهٔ پروفایلِ عمومی جزئیاتِ کاملِ لول را نشان می‌دهد (نوار
  // پیشرفت)، نه فقط عدد — پس `statusFor` و نه `levelsFor`.
  const levelInfo = await level.statusFor(req.params.id);

  // Best rank ever, for the headline medal.
  const best = leagueHistory.rows.reduce(
    (acc, r) => (acc === null || r.rank < acc ? r.rank : acc), null);

  // ⚠️ ترتیب باید **دقیقاً** همان getLeaderboard باشد: (coins, points).
  //    اگر اینجا فقط points می‌ماند، کاربر در جدولِ لیگ رتبهٔ ۱ می‌دید و
  //    در پروفایلِ خودش رتبهٔ ۴ — دو عددِ متناقض از یک حقیقت.
  const currentRankRow = await pool.query(
    `SELECT sub.rank, sub.coins FROM (
       SELECT user_id, coins,
              DENSE_RANK() OVER(ORDER BY coins DESC, points DESC) AS rank
         FROM league_leaderboard_entries
        WHERE league_season_id = (SELECT id FROM league_seasons WHERE status='active' AND starts_at <= NOW() AND ends_at > NOW() ORDER BY starts_at DESC LIMIT 1)
     ) sub WHERE sub.user_id = $1`,
    [req.params.id]
  );
  const currentRank = currentRankRow.rows[0]?.rank ? Number(currentRankRow.rows[0].rank) : null;
  // سکهٔ فصلِ جاری از جدولِ رتبه‌بندی می‌آید (منبعِ حقیقت)، و اگر هیچ
  // لیگِ فعالی نبود از شمارندهٔ users خوانده می‌شود.
  const seasonCoins = currentRankRow.rows[0]?.coins != null
    ? Number(currentRankRow.rows[0].coins)
    : Number(rows[0].coins || 0);

  res.json({
    currentLeagueRank: currentRank,
    ...rows[0],
    coins: seasonCoins,
    rewards: rewards.rows,
    cards: cards.rows,
    leaguePayouts: leaguePayouts.rows,
    leagueHistory: leagueHistory.rows.map(r => ({
      monthYear: r.month_year, rank: r.rank,
      points: r.points, prizeAmount: Number(r.prize_amount),
    })),
    trophies: trophies.rows,
    bestRank: best,
    // ── آمارِ تازه ──
    // `leagueSeasons`/`leagueWins`/`leaguePodiums` عددِ کلِ عمرِ حساب‌اند،
    // در برابرِ `leagueHistory` که فقط ۲۴ فصلِ آخر را دارد.
    leagueSeasons: Number(ls.seasons || 0),
    leagueWins: Number(ls.wins || 0),
    leaguePodiums: Number(ls.podiums || 0),
    lifetimeLeaguePrizes: Number(ls.prizes || 0),
    referral: {
      invited: Number(rs.invited || 0),
      earnedPoints: Number(rs.earned_points || 0),
      earnedCash: Number(rs.earned_cash || 0),
      rankAllTime: inviteRank ? Number(inviteRank) : null,
    },
    // «چند مدل کارت» و «چند کارتِ ثبت‌شده» دو چیزِ متفاوت‌اند: یکی از
    // پروفایلِ مجموعه حرف می‌زند، دیگری از تعدادِ کارت‌های فیزیکیِ ثبت‌شده.
    cardModels: cards.rows.length,
    cardsRegistered: cards.rows.reduce((a, c) => a + Number(c.registered_count || 0), 0),
    totalPrizeAmount: leagueHistory.rows
      .reduce((a, r) => a + Number(r.prize_amount || 0), 0),
    cosmetics,
    level: levelInfo,
  });
}));

// Physical prizes won — rendered as a trophy shelf on the profile.
router.get('/profile/trophies', auth, asyncHandler(async (req, res) => {
  res.json({ trophies: await rewardGroups.trophies(req.user.id) });
}));

// Past league finishes. monthly_league_points is wiped when a season closes,
// so without this the user loses all evidence of "I came 3rd in Mordad".
router.get('/profile/league-history', auth, asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT month_year, rank, points, prize_amount, created_at
       FROM user_league_history
      WHERE user_id=$1
      ORDER BY created_at DESC
      LIMIT 24`,
    [req.user.id]);
  res.json({ seasons: rows.map(r => ({
    monthYear: r.month_year,
    rank: r.rank,
    points: r.points,
    prizeAmount: Number(r.prize_amount),
    at: r.created_at,
  })) });
}));

  return router;
};
