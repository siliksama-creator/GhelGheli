// جشنِ بزرگِ پایانِ مسابقه (دورِ ۳۳)
//
// خواستهٔ مالک: «در بازی پنالتی چه با ربات و چه با کاربر آنلاین، برندهٔ
// بعد از پایان بازی باید بزرگ و به‌شکلِ زیبا و جذاب مشخص بشه».
//
// این کامپوننت برای هر سه بازیِ آنلاین (پنالتی، جفت‌یاب، دوئل کارت) یکسان
// است — تجربهٔ یکدست، همان چیزی که مالک «بصورت یکپارچه در اندروید و وب»
// خواست. نسخهٔ اندرویدِ همین صحنه در game_scaffold.dart نشسته و باید
// هم‌زمان با همین تغییر کند.
//
// ساختار: کاغذرنگی‌های چرخان (confetti) فقط وقتی کاربر برنده شده —
// جشنِ باختِ چشمگیر بی‌مزه و حتی زشت است؛ آیکونِ بزرگِ SVG (جامِ طلایی،
// دست‌دادن، یا جامِ خاموش)؛ تیترِ درشت؛ خطِ نتیجه با نامِ دو طرف؛ و
// children برای چیپ‌های امتیاز/سکه و دکمه‌ها.
import React from 'react';
import { SvgIcon } from './IconAsset.jsx';

const fa = n => new Intl.NumberFormat('fa-IR').format(Number(n || 0));

/** ۱۲ قطعهٔ کاغذرنگی با زاویه/تأخیرهای پلکانی — بدون JS تصادفی تا
 *  اسکرین‌شاتِ تست‌ها همیشه یکسان بماند (درسِ گزارشِ لوپِ کنتراست). */
function Confetti() {
  const colors = ['#FFD166', '#38BDF8', '#22E7A6', '#F472B6', '#A78BFA', '#FDBA74'];
  return (
    <div className="winConfetti" aria-hidden="true">
      {Array.from({ length: 14 }, (_, i) => (
        <span key={i}
          style={{
            '--i': i,
            '--x': `${(i * 37) % 100}%`,
            '--d': `${(i % 5) * 0.22}s`,
            '--c': colors[i % colors.length],
            '--rot': `${((i * 53) % 360) - 180}deg`,
          }} />
      ))}
    </div>
  );
}

export default function WinnerCelebration({
  outcome, // 'win' | 'loss' | 'draw'
  myName, oppName, myScore, oppScore, vsBot = false, children,
}) {
  const won = outcome === 'win';
  const draw = outcome === 'draw';
  const title = draw ? 'مسابقه مساوی شد' : won ? 'تو برنده شدی' : 'حریف برنده شد';
  const icon = draw ? 'handshake' : won ? 'trophy' : 'trophy';
  return (
    <div className={`winStage${won ? ' winStage--win' : draw ? ' winStage--draw' : ' winStage--loss'}`}>
      {won && <Confetti />}
      <span className="winStageIcon" aria-hidden="true">
        <SvgIcon name={icon} size={won ? 92 : 74} />
      </span>
      <h2 className="winStageTitle">{title}</h2>
      <div className="winStageVs">
        <span className={`winSide${won ? ' me' : ''}`}>
          {myName || 'تو'}
          {typeof myScore === 'number' && <b>{fa(myScore)}</b>}
        </span>
        <span className="winStageSep" aria-hidden="true" />
        <span className={`winSide${won ? '' : ' me'}`}>
          {oppName || (vsBot ? 'ربات' : 'حریف')}
          {typeof oppScore === 'number' && <b>{fa(oppScore)}</b>}
        </span>
      </div>
      {draw && <p className="winStageNote">هیچ‌کس جام را نبرد — یک دست دیگر؟</p>}
      {won && !vsBot && <p className="winStageNote">این برد در جدول لیگ ثبت شد</p>}
      {won && vsBot && <p className="winStageNote">تمرینِ خوبی بود — برای سکه و امتیاز آنلاین بازی کن</p>}
      {!won && !draw && <p className="winStageNote">دفعهٔ بعد جبران می‌کنی — تمرین با ربات باز است</p>}
      {children}
    </div>
  );
}
