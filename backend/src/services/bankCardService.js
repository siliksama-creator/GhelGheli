// ============================================================================
//  اعتبارسنجی و شناسایی کارت بانکی ایرانی
// ============================================================================
//
// چرا اعتبارسنجی واقعی و نه فقط «۱۶ رقم باشد»؟
// چون تنها بازخوردی که کاربر از یک شمارهٔ کارت اشتباه می‌گیرد، این است که
// پولش هفته‌ها بعد واریز نمی‌شود و باید تیکت بزند. یک اشتباه تایپی در یک رقم
// را الگوریتم Luhn همان‌جا در فرم می‌گیرد.

/** ارقام فارسی/عربی را به لاتین تبدیل می‌کند. */
function toLatinDigits(input) {
  const fa = '۰۱۲۳۴۵۶۷۸۹';
  const ar = '٠١٢٣٤٥٦٧٨٩';
  return String(input || '').replace(/[۰-۹٠-٩]/g, (d) => {
    const i = fa.indexOf(d);
    return String(i > -1 ? i : ar.indexOf(d));
  });
}

/** فاصله، خط تیره و ارقام فارسی را پاک می‌کند و فقط رقم لاتین برمی‌گرداند. */
function normalizeCardNumber(input) {
  return toLatinDigits(input).replace(/[^0-9]/g, '');
}

/**
 * الگوریتم Luhn — همان چک‌سامی که خود شبکهٔ شتاب برای کارت‌های ۱۶ رقمی
 * استفاده می‌کند. هر خطای یک‌رقمی و اکثر جابه‌جایی‌های دو رقم مجاور را
 * تشخیص می‌دهد.
 */
function isValidCardNumber(input) {
  const n = normalizeCardNumber(input);
  if (!/^[0-9]{16}$/.test(n)) return false;
  // کارت‌های همه‌یک‌رقمی (۰۰۰۰...، ۱۱۱۱...) از Luhn رد می‌شوند ولی واقعی نیستند.
  if (/^(\d)\1{15}$/.test(n)) return false;
  let sum = 0;
  for (let i = 0; i < 16; i++) {
    let d = Number(n[i]);
    // از چپ، موقعیت‌های فرد (index زوج) دو برابر می‌شوند
    if (i % 2 === 0) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

/**
 * اعتبارسنجی شبا: IR + ۲۴ رقم، با چک‌سام استاندارد IBAN (mod-97).
 * شبا اختیاری است ولی اگر وارد شد باید درست باشد.
 */
function isValidSheba(input) {
  const s = toLatinDigits(input).toUpperCase().replace(/\s/g, '').replace(/^IR/, '');
  if (!/^[0-9]{24}$/.test(s)) return false;
  // چهار کاراکتر اول به ته منتقل می‌شود، IR → 18 27
  const rearranged = `${s.slice(4)}1827${s.slice(0, 4)}`;
  // mod-97 تکه‌تکه، چون عدد ۲۶ رقمی از محدودهٔ Number خارج است
  let remainder = 0;
  for (const ch of rearranged) {
    remainder = (remainder * 10 + Number(ch)) % 97;
  }
  return remainder === 1;
}

function normalizeSheba(input) {
  const s = toLatinDigits(input).toUpperCase().replace(/\s/g, '').replace(/^IR/, '');
  return /^[0-9]{24}$/.test(s) ? `IR${s}` : null;
}

/**
 * پیشوند شش‌رقمی (BIN) کارت‌های بانکی ایران.
 * نام بانک را خودمان تشخیص می‌دهیم تا کاربر مجبور نباشد از یک لیست کشویی
 * بلند انتخاب کند — و مدیر هم در پنل بدون جست‌وجو ببیند پول به کدام بانک
 * می‌رود.
 */
const BANK_BINS = {
  603799: 'بانک ملی ایران',
  589210: 'بانک سپه',
  627648: 'بانک توسعه صادرات',
  207177: 'بانک توسعه صادرات',
  627961: 'بانک صنعت و معدن',
  603770: 'بانک کشاورزی',
  639217: 'بانک کشاورزی',
  628023: 'بانک مسکن',
  627760: 'پست بانک ایران',
  502908: 'بانک توسعه تعاون',
  627412: 'بانک اقتصاد نوین',
  622106: 'بانک پارسیان',
  639194: 'بانک پارسیان',
  627884: 'بانک پارسیان',
  502229: 'بانک پاسارگاد',
  639347: 'بانک پاسارگاد',
  627488: 'بانک کارآفرین',
  502910: 'بانک کارآفرین',
  621986: 'بانک سامان',
  639346: 'بانک سینا',
  639607: 'بانک سرمایه',
  636214: 'بانک آینده',
  502806: 'بانک شهر',
  504706: 'بانک شهر',
  502938: 'بانک دی',
  603769: 'بانک صادرات ایران',
  610433: 'بانک ملت',
  991975: 'بانک ملت',
  589463: 'بانک رفاه کارگران',
  627381: 'بانک انصار',
  639370: 'بانک مهر اقتصاد',
  505801: 'موسسه کوثر',
  606373: 'بانک قرض‌الحسنه مهر ایران',
  628157: 'موسسه اعتباری توسعه',
  505416: 'بانک گردشگری',
  636949: 'بانک حکمت ایرانیان',
  585983: 'بانک تجارت',
  627353: 'بانک تجارت',
  505785: 'بانک ایران زمین',
  636795: 'بانک مرکزی',
  639599: 'بانک قوامین',
  504172: 'بانک رسالت',
  507677: 'موسسه نور',
  606256: 'موسسه ملل',
};

/** نام بانک صادرکننده، یا null اگر BIN ناشناخته باشد. */
function detectBank(input) {
  const n = normalizeCardNumber(input);
  if (n.length < 6) return null;
  return BANK_BINS[Number(n.slice(0, 6))] || null;
}

/**
 * اعتبارسنجی کامل ورودی فرم کارت بانکی.
 * @returns {{ok: true, card: object} | {ok: false, message: string}}
 */
function validateCardInput({ cardNumber, cardHolder, sheba }) {
  const number = normalizeCardNumber(cardNumber);
  if (!number) return { ok: false, message: 'شماره کارت را وارد کنید' };
  if (number.length !== 16) return { ok: false, message: 'شماره کارت باید دقیقاً ۱۶ رقم باشد' };
  if (!isValidCardNumber(number)) return { ok: false, message: 'شماره کارت معتبر نیست؛ لطفاً ارقام را دوباره بررسی کنید' };

  const holder = String(cardHolder || '').trim().replace(/\s+/g, ' ');
  if (holder.length < 3) return { ok: false, message: 'نام و نام خانوادگی صاحب کارت را کامل وارد کنید' };
  if (holder.length > 120) return { ok: false, message: 'نام صاحب کارت بیش از حد طولانی است' };
  // فقط حروف فارسی/لاتین و فاصله. جلوی تزریق ایموجی/کاراکتر کنترلی در فیلدی
  // که مستقیم در پنل مدیر و در فرم انتقال بانکی دیده می‌شود را می‌گیرد.
  if (!/^[\u0600-\u06FF\u200cA-Za-z\s'.-]+$/.test(holder)) {
    return { ok: false, message: 'نام صاحب کارت فقط می‌تواند شامل حروف باشد' };
  }

  let shebaNormalized = null;
  const shebaRaw = String(sheba || '').trim();
  if (shebaRaw) {
    if (!isValidSheba(shebaRaw)) return { ok: false, message: 'شماره شبا معتبر نیست' };
    shebaNormalized = normalizeSheba(shebaRaw);
  }

  return {
    ok: true,
    card: {
      number,
      holder,
      sheba: shebaNormalized,
      bank: detectBank(number),
    },
  };
}

module.exports = {
  toLatinDigits,
  normalizeCardNumber,
  isValidCardNumber,
  isValidSheba,
  normalizeSheba,
  detectBank,
  validateCardInput,
  BANK_BINS,
};
