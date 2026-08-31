/** OTP, registration, password login, and password reset routes. */
const express = require('express');
const signupGift = require('../services/signupGiftService');
const smsService = require('../services/smsService');

module.exports = function createAuthRoutes(deps) {
  const {
    pool, asyncHandler, otpLimiter, otpVerifyLimiter, userLoginLimiter,
    bcrypt, normalizeMobile, referrals, createNotification, faDigits,
    signUser, safeUser, safeAvatarKey, safeImageUrl, boundedText, intInRange,
    anonymousNickname, isValidPasswordLength,
  } = deps;
  const router = express.Router();

router.post('/auth/request-otp', otpLimiter, asyncHandler(async (req, res) => {
  const mobile = normalizeMobile(req.body.mobile);
  const purpose = req.body.purpose || 'register';
  if (!/^\+?\d{10,15}$/.test(mobile) || !['register','login','reset_password'].includes(purpose)) return res.status(400).json({ message: 'شماره یا نوع درخواست معتبر نیست' });
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const hash = await bcrypt.hash(code, 10);
  const ttl = Number(process.env.OTP_TTL_MINUTES || 5);
  await pool.query('INSERT INTO otp_codes(mobile,code_hash,purpose,expires_at) VALUES($1,$2,$3,NOW()+($4::text||\' minutes\')::interval)', [mobile, hash, purpose, ttl]);
  // ── ارسال واقعی پیامک ─────────────────────────────────────────────────
  // تا قبل از دورِ عملیات، این‌جا فقط کامنت بود و هیچ درگاهی وصل نبود؛
  // کد ساخته می‌شد ولی به دستِ کاربر نمی‌رسید. حالا `smsService` تنظیماتِ
  // پنل ادمین را می‌خواند: اگر پیامک فعال باشد ارسال می‌شود، و اگر ارسال
  // در حالتِ غیرآزمایشی شکست بخورد، مسیرِ ورود متوقف می‌شود تا کاربرِ
  // واقعی با «کد ارسال شد»ی که هرگز نمی‌رسد گمراه نشود.
  const sms = await smsService.sendOtp(mobile, code, purpose);
  if (sms.sent === false && sms.reason === 'failed') {
    return res.status(502).json({ message: 'ارسال پیامک ناموفق بود؛ کمی بعد دوباره تلاش کنید' });
  }
  if (process.env.OTP_DEV_MODE === 'true') console.log(`DEV OTP for ${mobile}: ${code}`);
  res.json({
    message: 'کد تایید ارسال شد',
    devCode: process.env.OTP_DEV_MODE === 'true' ? code : undefined,
    sms: { sent: sms.sent, provider: sms.provider || null },
  });
}));

router.post('/auth/verify-otp', otpVerifyLimiter, asyncHandler(async (req, res) => {
  const mobile = normalizeMobile(req.body.mobile);
  const { code, purpose = 'register' } = req.body;
  const { rows } = await pool.query("SELECT * FROM otp_codes WHERE mobile=$1 AND purpose=$2 AND consumed_at IS NULL AND expires_at>NOW() ORDER BY created_at DESC LIMIT 1", [mobile, purpose]);
  if (!rows[0] || !(await bcrypt.compare(String(code || ''), rows[0].code_hash))) return res.status(400).json({ message: 'کد تایید نادرست یا منقضی است' });
  await pool.query('UPDATE otp_codes SET consumed_at=NOW() WHERE id=$1', [rows[0].id]);
  await pool.query("INSERT INTO users(mobile,mobile_verified) VALUES($1,true) ON CONFLICT(mobile) DO UPDATE SET mobile_verified=true", [mobile]);
  res.json({ message: 'شماره موبایل تایید شد' });
}));

router.post('/auth/register', asyncHandler(async (req, res) => {
  const mobile = normalizeMobile(req.body.mobile);
  const { password, firstName, lastName, nickname } = req.body;
  const { rows } = await pool.query('SELECT * FROM users WHERE mobile=$1 AND mobile_verified=true', [mobile]);
  if (!rows[0]) return res.status(400).json({ message: 'ابتدا شماره موبایل را با OTP تایید کنید' });
  if (!isValidPasswordLength(password)) return res.status(400).json({ message: 'رمز عبور باید بین ۶ تا ۷۲ کاراکتر باشد' });
  const hash = await bcrypt.hash(password, 12);
  const updated = await pool.query(
    'UPDATE users SET password_hash=$1, first_name=$2, last_name=$3, nickname=$4, updated_at=NOW() WHERE mobile=$5 RETURNING *',
    [hash, firstName, lastName, nickname, mobile]
  );

  // همان منطق مسیر ثبت‌نام مستقیم — این مسیر (OTP) وقتی درگاه پیامک وصل
  // شود مسیر اصلی می‌شود، پس نباید بدون سیستم معرفی بماند.
  const newUser = updated.rows[0];
  const myCode = await referrals.ensureCode(newUser.id).catch(() => null);

  let referral = null;
  const referralCode = req.body.referralCode || req.body.referral_code;
  if (referralCode) {
    const refClient = await pool.connect();
    try {
      await refClient.query('BEGIN');
      referral = await referrals.attachReferrer(refClient, newUser.id, referralCode);
      await refClient.query('COMMIT');
    } catch (e) {
      await refClient.query('ROLLBACK').catch(() => {});
      referral = { ok: false, reason: 'error' };
    } finally {
      refClient.release();
    }
    if (referral?.ok) {
      // اعلان فقط برای معرف. دعوت‌شونده جایزه‌اش را همان لحظه در پاسخ
      // ثبت‌نام می‌بیند، پس یک نوتیفیکیشن اضافه فقط تکرار است.
      let body = `${referrals.SPINS_PER_REFERRAL} چرخش گردونه گرفتی و از `
        + `این به بعد ${referrals.COMMISSION_PERCENT}٪ امتیازهای او از ثبت `
        + `کارت و بازی ضربه‌زن هم به تو می‌رسد.`;
      // اگر همین دعوت باعث شد سهمیهٔ روزانه بالا برود، بگو — این بزرگ‌ترین
      // پاداش سیستم است و بی‌صدا دادنش حیف است.
      if (referral.referrerInvites % referrals.INVITES_PER_DAILY_SPIN === 0
          && referral.referrerInvites <= referrals.MAX_INVITES_FOR_DAILY) {
        body += ` با ${faDigits(referral.referrerInvites)} دعوت، از حالا `
          + `روزی ${faDigits(referral.referrerDailySpins)} چرخش رایگان داری!`;
      }
      createNotification(
        referral.referrerId, 'referral', 'یک دوست با کد تو عضو شد', body,
      ).catch(() => {});
    }
  }

  // ── هدیهٔ امتیازِ عضویت ──
  //
  // ⚠️ این مسیر (OTP) مسیرِ **اصلیِ** ثبت‌نام است؛ `/auth/register-password`
  //    با ALLOW_PASSWORD_REGISTRATION خاموش است. هدیه اول فقط آنجا وصل شده
  //    بود، یعنی عملاً هیچ‌وقت پرداخت نمی‌شد — با ثبت‌نامِ واقعی روی سرور
  //    مچ شد (کاربر ۰ امتیاز گرفت).
  //
  // شرطِ «تازه‌بودن» اینجا نبودِ `password_hash` است، نه نبودِ ردیفِ کاربر:
  // `verify-otp` ردیف را از قبل می‌سازد، پس وجودِ ردیف معنایی ندارد. کسی
  // که رمز دارد و دوباره این مسیر را بزند هدیه نمی‌گیرد و نمی‌شود دوشیدش.
  //
  // مثلِ مسیرِ دیگر، هرگز throw نمی‌کند: «امتیاز نگرفتم» شکایتِ کوچکی
  // است، «ثبت‌نامم انجام نشد» فاجعه.
  const isFirstTime = !rows[0].password_hash;
  const giftPoints = isFirstTime ? await signupGift.payoutSignupGift(newUser.id) : 0;
  if (giftPoints > 0) {
    const gift = await signupGift.getSignupGift().catch(() => null);
    createNotification(
      newUser.id, 'signup_gift', 'هدیهٔ عضویت',
      `${faDigits(giftPoints)} امتیاز به حساب تو اضافه شد. ${gift?.message || ''}`.trim(),
    ).catch(() => {});
  }

  res.json({
    token: signUser(newUser),
    // موجودیِ تازه‌شده، وگرنه کلاینت «۰ امتیاز» نشان می‌دهد در حالی که
    // اعلانِ هدیه رسیده — و کاربر فکر می‌کند دروغ است.
    user: safeUser(giftPoints > 0
      ? { ...newUser, current_points: Number(newUser.current_points || 0) + giftPoints }
      : newUser),
    signupGiftPoints: giftPoints,
    referralCode: myCode,
    referralApplied: referral?.ok === true,
    // چند چرخش خودِ دعوت‌شونده گرفت — تا کلاینت بتواند بگوید «۳ چرخش
    // گردونه گرفتی» به‌جای یک «ثبت شد» بی‌معنا.
    referralSpins: referral?.ok ? referrals.SPINS_PER_REFERRAL : 0,
    referralReason: referral && !referral.ok ? referral.reason : undefined,
  });
}));

router.post('/auth/register-password', userLoginLimiter, asyncHandler(async (req, res) => {
  if (process.env.ALLOW_PASSWORD_REGISTRATION !== 'true') return res.status(403).json({ message: 'ثبت‌نام مستقیم فعلاً غیرفعال است' });
  const mobile = normalizeMobile(req.body.mobile);
  const { password, firstName, lastName, nickname, age, city, province, profileImageUrl, profileAvatarKey, bankAccount, currentPassword } = req.body;
  if (!/^\+?[0-9A-Za-z]{3,20}$/.test(mobile)) return res.status(400).json({ message: 'شماره/نام کاربری معتبر نیست' });
  if (!isValidPasswordLength(password)) return res.status(400).json({ message: 'رمز عبور باید بین ۶ تا ۷۲ کاراکتر باشد' });

  // SECURITY FIX: this endpoint used to run an unconditional
  // `ON CONFLICT(mobile) DO UPDATE ... password_hash=EXCLUDED.password_hash`,
  // which meant ANYONE who knew a victim's mobile number could silently
  // overwrite their password and take over the account — with no OTP, no
  // proof of ownership, and no old password required. It even reset
  // status back to 'active', bypassing an admin block. Verified end-to-end
  // against production before this fix.
  //
  // Because the SMS gateway is not wired up yet (see the comment on
  // /api/auth/request-otp), we cannot require a real OTP here without
  // locking every user out. Instead: registration only CREATES a brand new
  // account; if the mobile already has a password set, the caller must
  // prove ownership with the current password before anything is changed.
  const existing = await pool.query('SELECT * FROM users WHERE mobile=$1', [mobile]);
  if (existing.rows[0]?.password_hash) {
    const ok = currentPassword && (await bcrypt.compare(String(currentPassword), existing.rows[0].password_hash));
    if (!ok) return res.status(409).json({ message: 'این شماره قبلاً ثبت‌نام شده است. برای ورود از «ورود» استفاده کنید یا رمز فعلی را برای تغییر وارد کنید.' });
  }

  // Keep an already-set nickname when re-registering to change the password
  // (don't clobber it with a fresh random placeholder); only fall back to
  // an anonymous placeholder for a brand-new account with no nickname.
  const finalNickname = nickname || existing.rows[0]?.nickname || anonymousNickname();

  // AUDIT FIX: این مسیر همان فیلدهایی را می‌نویسد که PATCH /api/profile
  // می‌نویسد، ولی هیچ‌کدام از اعتبارسنجی‌های آن را نداشت. بازتولید روی
  // production:
  //   age:-5                              -> ۵۰۰ (نقض CHECK دیتابیس)
  //   firstName با ۵۰۰۰ کاراکتر            -> ۵۰۰ (سرریز varchar)
  //   profileAvatarKey:"../../etc/passwd"  -> ۲۰۰ و ذخیره شد
  //   profileImageUrl:"javascript:alert(1)"-> ۲۰۰ و ذخیره شد
  //
  // دو مورد آخر جدی‌ترند: هر دو بعداً به کلاینت‌ها برمی‌گردند و مستقیم در
  // مسیر فایل / تگ تصویر می‌نشینند. ممیزی قبلی این‌ها را در PATCH بست ولی
  // این در ثبت‌نام باز مانده بود — یعنی مهاجم فقط کافی بود موقع ثبت‌نام
  // مقدار را بفرستد، نه بعدش.
  let ageValue = null;
  if (age !== undefined && age !== null && age !== '') {
    const n = Number(age);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 5 || n > 120) {
      return res.status(400).json({ message: 'سن باید عددی بین ۵ تا ۱۲۰ باشد' });
    }
    ageValue = n;
  }
  if (profileAvatarKey !== undefined && profileAvatarKey !== null
      && profileAvatarKey !== '' && !safeAvatarKey(profileAvatarKey)) {
    return res.status(400).json({ message: 'آواتار انتخابی معتبر نیست' });
  }
  if (profileImageUrl !== undefined && profileImageUrl !== null
      && profileImageUrl !== '' && !safeImageUrl(profileImageUrl)) {
    return res.status(400).json({ message: 'آدرس عکس پروفایل معتبر نیست' });
  }

  const hash = await bcrypt.hash(String(password), 12);
  const { rows } = await pool.query(
    `INSERT INTO users(mobile,mobile_verified,password_hash,first_name,last_name,nickname,age,city,province,profile_image_url,profile_avatar_key,bank_account,status)
     VALUES($1,true,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'active')
     ON CONFLICT(mobile) DO UPDATE SET password_hash=EXCLUDED.password_hash, first_name=EXCLUDED.first_name, last_name=EXCLUDED.last_name, nickname=EXCLUDED.nickname, age=EXCLUDED.age, city=EXCLUDED.city, province=EXCLUDED.province, profile_image_url=EXCLUDED.profile_image_url, profile_avatar_key=EXCLUDED.profile_avatar_key, bank_account=EXCLUDED.bank_account, mobile_verified=true, updated_at=NOW()
     RETURNING *`,

    // همان محدودیت طولی که PATCH /api/profile اعمال می‌کند، تا رشتهٔ بلند
    // به‌جای ۵۰۰، به‌آرامی کوتاه شود.
    [
      mobile, hash,
      boundedText(firstName, 60),
      boundedText(lastName, 60),
      boundedText(finalNickname, 40),
      ageValue,
      boundedText(city, 60),
      boundedText(province, 60),
      safeImageUrl(profileImageUrl),
      safeAvatarKey(profileAvatarKey),
      boundedText(bankAccount, 40),
    ]
  );

  // کد اختصاصی این کاربر. همیشه ساخته می‌شود، حتی اگر خودش با کد کسی
  // نیامده باشد — کد برای دعوت کردن *دیگران* است.
  const myCode = await referrals.ensureCode(rows[0].id).catch(() => null);

  // اگر با کد دوستی آمده، ثبتش کن.
  //
  // شکست اینجا **نباید** ثبت‌نام را خراب کند: کد اشتباه یعنی «معرفی ثبت
  // نشد»، نه «اکانت ساخته نشد». نتیجه به کلاینت برمی‌گردد تا پیام درست
  // بدهد به‌جای اینکه سکوت کند و کاربر فکر کند کد کار کرد.
  let referral = null;
  const referralCode = req.body.referralCode || req.body.referral_code;
  if (referralCode && !existing.rows[0]) {
    const refClient = await pool.connect();
    try {
      await refClient.query('BEGIN');
      referral = await referrals.attachReferrer(refClient, rows[0].id, referralCode);
      await refClient.query('COMMIT');
    } catch (e) {
      await refClient.query('ROLLBACK').catch(() => {});
      referral = { ok: false, reason: 'error' };
    } finally {
      refClient.release();
    }
    if (referral?.ok) {
      // اعلان فقط برای معرف. دعوت‌شونده جایزه‌اش را همان لحظه در پاسخ
      // ثبت‌نام می‌بیند، پس یک نوتیفیکیشن اضافه فقط تکرار است.
      let body = `${referrals.SPINS_PER_REFERRAL} چرخش گردونه گرفتی و از `
        + `این به بعد ${referrals.COMMISSION_PERCENT}٪ امتیازهای او از ثبت `
        + `کارت و بازی ضربه‌زن هم به تو می‌رسد.`;
      // اگر همین دعوت باعث شد سهمیهٔ روزانه بالا برود، بگو — این بزرگ‌ترین
      // پاداش سیستم است و بی‌صدا دادنش حیف است.
      if (referral.referrerInvites % referrals.INVITES_PER_DAILY_SPIN === 0
          && referral.referrerInvites <= referrals.MAX_INVITES_FOR_DAILY) {
        body += ` با ${faDigits(referral.referrerInvites)} دعوت، از حالا `
          + `روزی ${faDigits(referral.referrerDailySpins)} چرخش رایگان داری!`;
      }
      createNotification(
        referral.referrerId, 'referral', 'یک دوست با کد تو عضو شد', body,
      ).catch(() => {});
    }
  }

  // ── هدیهٔ امتیازِ عضویت ──
  //
  // مبلغش را مدیر در پنل تعیین می‌کند. عمداً **بعد از** ساختِ کاربر و
  // ثبتِ معرفی می‌آید و خودش هرگز throw نمی‌کند: اگر پرداخت شکست بخورد
  // کاربر همچنان اکانتش را دارد. «امتیاز نگرفتم» شکایتِ کوچکی است،
  // «ثبت‌نامم انجام نشد» فاجعه است.
  //
  // فقط برای کاربرِ واقعاً تازه — نه کسی که با ON CONFLICT پروفایلش
  // به‌روزرسانی شده، وگرنه می‌شد با ثبت‌نامِ دوباره هدیه را دوشید.
  const giftPoints = existing.rows[0] ? 0 : await signupGift.payoutSignupGift(rows[0].id);
  if (giftPoints > 0) {
    const gift = await signupGift.getSignupGift().catch(() => null);
    createNotification(
      rows[0].id, 'signup_gift', 'هدیهٔ عضویت',
      `${faDigits(giftPoints)} امتیاز به حساب تو اضافه شد. ${gift?.message || ''}`.trim(),
    ).catch(() => {});
  }

  res.json({
    token: signUser(rows[0]),
    // موجودیِ تازه‌شده را برمی‌گردانیم، وگرنه کلاینت «۰ امتیاز» نشان
    // می‌دهد در حالی که اعلانِ هدیه رسیده — و کاربر فکر می‌کند دروغ است.
    user: safeUser(giftPoints > 0
      ? { ...rows[0], current_points: Number(rows[0].current_points || 0) + giftPoints }
      : rows[0]),
    signupGiftPoints: giftPoints,
    referralCode: myCode,
    referralApplied: referral?.ok === true,
    // چند چرخش خودِ دعوت‌شونده گرفت — تا کلاینت بتواند بگوید «۳ چرخش
    // گردونه گرفتی» به‌جای یک «ثبت شد» بی‌معنا.
    referralSpins: referral?.ok ? referrals.SPINS_PER_REFERRAL : 0,
    referralReason: referral && !referral.ok ? referral.reason : undefined,
  });

}));

router.post('/auth/login', userLoginLimiter, asyncHandler(async (req, res) => {
  const mobile = normalizeMobile(req.body.mobile);
  const { rows } = await pool.query('SELECT * FROM users WHERE mobile=$1', [mobile]);
  const user = rows[0];
  if (!user || !user.password_hash || !(await bcrypt.compare(String(req.body.password || ''), user.password_hash))) return res.status(401).json({ message: 'شماره موبایل یا رمز عبور نادرست است' });
  if (user.status !== 'active') return res.status(403).json({ message: 'حساب شما مسدود شده است' });
  res.json({ token: signUser(user), user: safeUser(user) });
}));

router.post('/auth/forgot-password/reset', otpVerifyLimiter, asyncHandler(async (req, res) => {
  const mobile = normalizeMobile(req.body.mobile);
  const { code, newPassword } = req.body;
  if (!isValidPasswordLength(newPassword)) return res.status(400).json({ message: 'رمز عبور باید بین ۶ تا ۷۲ کاراکتر باشد' });
  const { rows } = await pool.query("SELECT * FROM otp_codes WHERE mobile=$1 AND purpose='reset_password' AND consumed_at IS NULL AND expires_at>NOW() ORDER BY created_at DESC LIMIT 1", [mobile]);
  if (!rows[0] || !(await bcrypt.compare(String(code || ''), rows[0].code_hash))) return res.status(400).json({ message: 'کد بازیابی معتبر نیست' });
  await pool.query('UPDATE otp_codes SET consumed_at=NOW() WHERE id=$1', [rows[0].id]);
  await pool.query('UPDATE users SET password_hash=$1 WHERE mobile=$2', [await bcrypt.hash(newPassword, 12), mobile]);
  res.json({ message: 'رمز عبور تغییر کرد' });
}));

  return router;
};
