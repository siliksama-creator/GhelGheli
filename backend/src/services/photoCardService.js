/**
 * «ثبت کارت از طریق عکس» — منطق دامنه.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * رابطهٔ این ماژول با سیستم فعلی «ثبت کد کارت»
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * هیچ. عمداً.
 *
 * جدول‌ها جدا (`photo_card_*` در برابر `card_codes`)، مسیرها جدا، و این
 * فایل هیچ‌جا `card_codes` را نمی‌خواند یا نمی‌نویسد. تنها نقطهٔ اشتراک
 * `card_types` است که فقط **خوانده** می‌شود — چون امتیاز و جایزهٔ نقدی
 * باید یکی باشد، وگرنه یک کارت از دو راه دو ارزش متفاوت پیدا می‌کند.
 *
 * دلیلش این نیست که تکرار خوب است؛ دلیلش این است که خواستهٔ صریح مالک
 * «بدون هیچ تغییری در بخش‌های قبلی» بود و مسیر ثبت کد فعلی روی پول واقعی
 * کار می‌کند.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * چرا اعتبار دادن اینجاست و نه در server.js
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * دو مسیر به یک نتیجه می‌رسند: تأیید خودکار (امتیاز بالا) و تأیید دستی
 * مدیر (از صف بررسی). اگر منطق در دو جا نوشته می‌شد، روزی یکی عوض می‌شد و
 * دیگری نه — و آن روز یک مسیر کمیسیون معرف می‌داد و دیگری نمی‌داد.
 */

const walletService = require('./walletService');
const referrals = require('./referralService');

/**
 * کد را به شکل متعارف در می‌آورد.
 *
 * چرا نسخهٔ جداگانه و نه استفاده از `normalizeCardCode` سرور:
 * آن تابع فقط trim و uppercase می‌کند. اینجا دو مشکل واقعی‌تر داریم که
 * در مسیر عکس بیشتر پیش می‌آید:
 *
 *   ۱. **ارقام فارسی/عربی.** همان باگی که یک بار در ورود با موبایل
 *      گرفتار شد: کیبورد فارسی اندروید «۷» تایپ می‌کند نه «7». کاربری
 *      که کد را از روی کارت می‌خواند و تایپ می‌کند، دقیقاً در همین
 *      دام می‌افتد.
 *
 *   ۲. **خطاهای رونویسی.** کاربر کد را از روی کارت فیزیکی می‌خواند.
 *      O/0 و I/1 روی چاپ تقریباً یکسان‌اند. به‌جای اینکه کاربر را با
 *      «کد نامعتبر» برگردانیم، به شکل متعارف نگاشت می‌کنیم. این یعنی
 *      بانک کد نباید هم O و هم 0 داشته باشد — که در تولیدکنندهٔ کد
 *      رعایت شده (الفبای بدون کاراکترِ مبهم).
 */
function normalizePhotoCode(raw) {
  let s = String(raw || '').trim().toUpperCase();
  // ارقام فارسی (۰۶۶۰–۰۶۶۹) و عربی (۰۶F0–۰۶F9)
  s = s.replace(/[\u06F0-\u06F9]/g, d => String(d.charCodeAt(0) - 0x06F0));
  s = s.replace(/[\u0660-\u0669]/g, d => String(d.charCodeAt(0) - 0x0660));
  // جداکننده‌های تزئینی: کاربر ممکن است با فاصله یا نقطه تایپ کند.
  s = s.replace(/[\s._]+/g, '-');
  // کاراکترهای مبهم روی چاپ.
  s = s.replace(/O/g, '0').replace(/I/g, '1').replace(/L/g, '1');
  return s.replace(/-{2,}/g, '-').replace(/^-|-$/g, '');
}

/** فرمت کد بانک عکسی. */
function isValidPhotoCode(code) {
  return /^[A-Z0-9-]{6,64}$/.test(code);
}

// ── الفبای تولید کد ──
//
// عمداً بدون O، I، L، U و بدون ۰/۱ در جایگاه حروف. دلیل:
//   • O/0 و I/1/L روی کارت چاپی از هم قابل تشخیص نیستند
//   • U و V در فونت‌های فشرده شبیه‌اند
// چون `normalizePhotoCode` هرحال O→0 و I/L→1 می‌کند، اگر الفبا این‌ها را
// داشت دو کدِ متفاوت به یک چیز نگاشت می‌شدند و برخورد پیش می‌آمد.
const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';

/**
 * کد تصادفی می‌سازد. قالب: GHP-XXXX-XXXX
 *
 * پیشوند GHP («قلقلی-عکس») عمداً با کدهای فعلی فرق دارد تا مدیر با یک
 * نگاه بفهمد کد مالِ کدام سیستم است — و کاربر هم کدِ اشتباه را در فرمِ
 * اشتباه وارد نکند.
 */
function generateCode(rng = Math.random) {
  const pick = n => Array.from({ length: n },
    () => CODE_ALPHABET[Math.floor(rng() * CODE_ALPHABET.length)]).join('');
  return `GHP-${pick(4)}-${pick(4)}`;
}

/**
 * فضای کد: ۳۰^۸ ≈ ۶.۶×۱۰¹¹.
 *
 * برای ۱۵٬۰۰۰ کد، احتمال برخورد در تولید ناچیز است، ولی تولیدکننده هرحال
 * یکتایی را در سطح دیتابیس تضمین می‌کند (`UNIQUE` روی ستون code) و
 * دوباره تلاش می‌کند. حدس زدن هم عملاً ناممکن است: شانس یافتن یک کد
 * معتبر با حدس تصادفی ≈ ۱ در ۴۴ میلیون.
 */
const CODE_SPACE = Math.pow(CODE_ALPHABET.length, 8);

/**
 * امتیاز و جایزهٔ نقدی را به کاربر می‌دهد و کد را قفل می‌کند.
 *
 * ⚠️ باید داخل یک تراکنش باز (`client`) صدا زده شود. تماس‌گیرنده مسئول
 * BEGIN/COMMIT است، چون در مسیر تأیید مدیر چند کار دیگر هم در همان
 * تراکنش انجام می‌شود.
 *
 * @returns {{ points:number, cash:number, cardTypeName:string, imageUrl:string }}
 */
async function creditSubmission(client, { userId, codeId, design, adminId = null }) {
  // قفل ردیف کد. `FOR UPDATE` جلوی حالتی را می‌گیرد که دو درخواست هم‌زمان
  // (کاربر دوبار دکمه بزند، یا مدیر هم‌زمان با خودکار تأیید کند) هر دو
  // ببینند کد آزاد است. بدون این، یک کد دو بار امتیاز می‌داد.
  const codeRow = await client.query(
    `SELECT id, status FROM photo_card_codes WHERE id = $1 FOR UPDATE`,
    [codeId],
  );
  if (!codeRow.rows[0]) {
    throw Object.assign(new Error('کد یافت نشد'), { status: 404 });
  }
  const st = codeRow.rows[0].status;
  if (st === 'used') {
    throw Object.assign(new Error('این کد قبلاً استفاده شده است'), { status: 409 });
  }
  if (st === 'voided') {
    throw Object.assign(new Error('این کد باطل شده است'), { status: 409 });
  }

  const typeRow = await client.query(
    `SELECT id, name, point_value, cash_amount, is_active
       FROM card_types WHERE id = $1`,
    [design.card_type_id],
  );
  const type = typeRow.rows[0];
  if (!type) {
    throw Object.assign(new Error('نوع کارت یافت نشد'), { status: 404 });
  }
  if (!type.is_active) {
    throw Object.assign(new Error('نوع این کارت غیرفعال است'), { status: 400 });
  }

  const points = Number(type.point_value || 0);
  const cash = Number(type.cash_amount || 0);

  // کد را به طرحی که تصویرش تطبیق خورد **می‌بندیم**.
  //
  // این تمام هدف این قابلیت است: قبلاً معلوم نبود کدام کد مالِ کدام کارت
  // است، پس کسی که فقط کد را می‌دانست هر کارتی را می‌توانست ادعا کند.
  // حالا کد در لحظهٔ مصرف به یک طرح مشخص گره می‌خورد و در لاگ می‌ماند.
  await client.query(
    `UPDATE photo_card_codes
        SET status = 'used', used_by_user_id = $1, used_at = NOW(),
            bound_design_id = $2, updated_at = NOW()
      WHERE id = $3`,
    [userId, design.id, codeId],
  );

  if (points > 0) {
    await client.query(
      `UPDATE users
          SET current_points = current_points + $1,
              lifetime_points = lifetime_points + $1,
              monthly_league_points = monthly_league_points + $1,
              updated_at = NOW()
        WHERE id = $2`,
      [points, userId],
    );
    // کمیسیون ۵٪ معرف — همان قاعدهٔ مسیر ثبت کد، روی همین تراکنش تا اگر
    // چیزی برگشت، امتیازی از هوا ساخته نشود.
    await referrals.payCommission(client, userId, points, 'card');
  }

  // اینونتوری: **عکس مدیر** ثبت می‌شود، نه عکس کاربر.
  //
  // خواستهٔ صریح مالک. منطقی هم هست: عکس کاربر تار و کج است و در گالریِ
  // «کارت‌های من» زشت دیده می‌شود؛ ضمن اینکه نگه‌داشتن عکس شخصی کاربر
  // بار حریم خصوصی دارد بدون اینکه فایده‌ای داشته باشد.
  //
  // چون `card_type_id` همان کاتالوگ فعلی است، این ردیف دقیقاً مثل کارتی
  // که با کد ثبت شده رفتار می‌کند و جوایز پلکانی بدون تغییر کار می‌کنند.
  const inv = await client.query(
    `SELECT id FROM user_card_inventory
      WHERE user_id = $1 AND card_type_id = $2 AND consumed_in_reward = false`,
    [userId, design.card_type_id],
  );
  if (inv.rows[0]) {
    await client.query(
      `UPDATE user_card_inventory SET quantity = quantity + 1, updated_at = NOW()
        WHERE id = $1`, [inv.rows[0].id],
    );
  } else {
    await client.query(
      `INSERT INTO user_card_inventory(user_id, card_type_id, quantity, consumed_in_reward)
       VALUES($1, $2, 1, false)`, [userId, design.card_type_id],
    );
  }

  if (cash > 0) {
    // مرجع = شناسهٔ کد. ایندکس یکتای دفتر کل مانع واریز دوم می‌شود حتی
    // اگر این مسیر به هر دلیلی دوبار اجرا شود.
    await walletService.credit(client, {
      userId,
      amount: cash,
      source: 'card_cash',
      referenceType: 'photo_card_codes',
      referenceId: codeId,
      description: `جایزهٔ نقدی کارت «${type.name}» (ثبت با عکس)`,
    });
  }

  return {
    points, cash,
    cardTypeName: type.name,
    cardTypeId: type.id,
    imageUrl: design.image_url,
    adminId,
  };
}

module.exports = {
  normalizePhotoCode,
  isValidPhotoCode,
  generateCode,
  creditSubmission,
  CODE_ALPHABET,
  CODE_SPACE,
};
