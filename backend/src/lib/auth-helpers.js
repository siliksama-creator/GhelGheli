// auth-helpers.js — pure helpers extracted from server.js (step 4 of integrated roadmap)
// این توابع هیچ وابستگی به pool/JWT ندارند و تست‌پذیرند. server.js آنها را re-export می‌کند تا API قبلی نشکند.

/**
 * شمارهٔ موبایل / نام کاربری را به شکل متعارف در می‌آورد.
 * ارقام فارسی/عربی → لاتین، حذف فاصله/جداکننده، نرمال‌سازی +98
 */
function normalizeMobile(m) {
  let s = String(m || '').trim();
  s = s.replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06F0));
  s = s.replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660));
  s = s.replace(/[\s\u200c\u200f\u200e\u202a-\u202e]/g, '');
  if (/^[+0-9()\-.]+$/.test(s)) {
    s = s.replace(/[()\-.]/g, '');
    if (s.startsWith('+98')) s = '0' + s.slice(3);
    else if (s.startsWith('0098')) s = '0' + s.slice(4);
    else if (s.startsWith('98') && s.length === 12) s = '0' + s.slice(2);
    else if (/^9\d{9}$/.test(s)) s = '0' + s;
  }
  return s;
}

const FA_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
function faDigits(n) {
  return String(n).replace(/\d/g, (d) => FA_DIGITS[Number(d)]);
}

function anonymousNickname() {
  return `کاربر-${Math.floor(1000 + Math.random() * 9000)}`;
}

function isValidPasswordLength(pw) {
  const s = String(pw || '');
  return s.length >= 6 && Buffer.byteLength(s, 'utf8') <= 72;
}

module.exports = { normalizeMobile, faDigits, anonymousNickname, isValidPasswordLength };
