// تبِ «ثبت کارت» — جایگزینِ تبِ «جوایز» (خواستهٔ مالک، ۳۱ شهریور ۱۴۰۵):
// بخشِ جوایز از وب، اندروید و پنلِ ادمین کاملاً حذف شد و هر چه از «ثبت کارت با
// عکس» به بعد در خانه بود (خودِ فرمِ ثبت + کلکسیون/صندوق‌ها) به این تب منتقل
// شد. بلوکِ ثبت، دقیقاً همان JSXِ قبلیِ Home.jsx است (بدونِ تغییرِ ظاهر) و
// زیرش همان صفحهٔ Inventoryِ قبلی نشسته تا با امکاناتِ ادمین (گرنتِ صندوق،
// کارت‌ها، quantities) هماهنگ بماند.
import React from 'react';
import PhotoCardBox from '../components/PhotoCardBox.jsx';
import Inventory from './Inventory.jsx';
import { text, useLive } from '../lib/liveConfig.js';

export default function CardReg({ items, grants, token, reload, setMsg }) {
  // متنِ راهنما از پنل می‌آید؛ بدونِ این، عوض‌کردن در «متن‌های زنده»
  // تا رفرشِ کاملِ صفحه دیده نمی‌شد.
  useLive();
  // جملهٔ دومِ کادر (خواستهٔ مالک، ۳ مهر ۱۴۰۵). دلیلِ متغیرِ جدا و
  // نه نوشتنِ داخلِ JSX: اگر کلید خالی شود، همان یک متغیر خالی
  // می‌ماند و سطر (با خطِ جداکننده‌اش) کلاً رندر نمی‌شود؛ وگرنه یک
  // `<p>` خالی با خطِ جداکننده روی صفحه می‌ماند.
  const specialCardsNote = text('cardReg.specialCardsNote', 'کارت های خاص نقره ای طلایی پلاتینیوم و غیره فعلا در اپلیکیشن ثبت نمیشن و پشتیبانی روبیکا این کارت هارو ثبت میکنه');
  return (
    <>
      <div style={{ padding:'12px 12px 0', marginBottom:'12px' }}>
        <div style={{ background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:'16px', padding:'12px' }}>
          <div style={{ display:'flex', gap:'8px', alignItems:'flex-start', marginBottom:'8px' }}>
            <div style={{ width:'58px', height:'58px', borderRadius:'12px', background:'linear-gradient(135deg, rgba(16,185,129,0.22), rgba(56,189,248,0.12))', border:'1px solid rgba(16,185,129,0.35)', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <img src="/brand/card_scan_glow.png" alt="" style={{ width:'40px', height:'40px' }} onError={e=>e.currentTarget.style.display='none'} />
            </div>
            <div style={{ flex:1 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <b style={{ color:'#FFF', fontSize:'14px', fontWeight:'900' }}>ثبت کارت‌های قلقلی</b>
                <span style={{ background:'rgba(245,158,11,0.16)', border:'1px solid rgba(245,158,11,0.45)', color:'#F59E0B', padding:'3px 8px', borderRadius:'99px', fontSize:'10px', fontWeight:'900' }}>ثبت سریع</span>
              </div>
              <p style={{ color:'#CBD5E1', fontSize:'11.5px', margin:'4px 0 0', lineHeight:1.45, fontWeight:'600' }}>{text('cardReg.lead', 'از کارت عکس بگیرید و کد را وارد کنید')}</p>
              <p style={{ color:'#FBBF24', fontSize:'11.5px', margin:'3px 0 0', lineHeight:1.45, fontWeight:'700' }}>{text('cardReg.minPointsNote', 'فقط کارت‌های ۵۰۰ امتیازی و بالاتر ثبت می‌شود.')}</p>
            </div>
          </div>
          <PhotoCardBox token={token} setMsg={setMsg} onDone={reload} />
        </div>
        {/* ── توضیحِ اثرِ کلاسِ کارت در دوئل — متنِ زنده ─────────────────
            خواستهٔ مالک: «زیرش یک متنِ زندهٔ قابلِ‌تغییر در پنلِ ادمین که
            روی اندروید هم بدونِ آپدیت عوض شود.» پس:
              • اینجا فقط `text()` است؛ هیچ واژه‌ای سفت نیست.
              • فول‌بکِ ورودی **واژه‌به‌واژه** همان مقدارِ پیش‌فرضِ سرور
                است (`liveContent.DEFAULT_COPY`)، وگرنه در قطعیِ شبکه
                کاربر یک جمله و بعد از وصل‌شدن جملهٔ دیگری می‌دید.
            گاردِ `live-copy-parity` همین برابری را می‌سنجد. */}
        <div className="cardRegNote">
          <span aria-hidden="true">ⓘ</span>
          <div className="cardRegNoteBody">
            <p>{text('cardReg.duelEffectNote', 'کارت های قلقلی براساس قدرت بازیکن و درصد کمیاب بودن در بازی Duel card تاثیر میذارن این به این معنیه که ممکنه بازیکن افسانه ای مثل پله از بازیکن جدیدی بخاطر اینکه سبک کارتش کمیاب نبوده و افکت اصلی کارتش ضعیف تر هستش دست رو ببازه با احترام به تمامی بازیکن ها قدیمی و افسانه ای سیستم به این صورت عمل میکنه.')}</p>
            {specialCardsNote
              ? <p className="cardRegNoteAlt">{specialCardsNote}</p>
              : null}
          </div>
        </div>
      </div>
      <Inventory items={items} grants={grants} token={token} reload={reload} />
    </>
  );
}
