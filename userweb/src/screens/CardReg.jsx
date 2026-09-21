// تبِ «ثبت کارت» — جایگزینِ تبِ «جوایز» (خواستهٔ مالک، ۳۱ شهریور ۱۴۰۵):
// بخشِ جوایز از وب، اندروید و پنلِ ادمین کاملاً حذف شد و هر چه از «ثبت کارت با
// عکس» به بعد در خانه بود (خودِ فرمِ ثبت + کلکسیون/صندوق‌ها) به این تب منتقل
// شد. بلوکِ ثبت، دقیقاً همان JSXِ قبلیِ Home.jsx است (بدونِ تغییرِ ظاهر) و
// زیرش همان صفحهٔ Inventoryِ قبلی نشسته تا با امکاناتِ ادمین (گرنتِ صندوق،
// کارت‌ها، quantities) هماهنگ بماند.
import React from 'react';
import PhotoCardBox from '../components/PhotoCardBox.jsx';
import Inventory from './Inventory.jsx';

export default function CardReg({ items, grants, token, reload, setMsg }) {
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
              <p style={{ color:'#CBD5E1', fontSize:'11.5px', margin:'4px 0 0', lineHeight:1.45, fontWeight:'600' }}>عکس کارت و کدش را همین‌جا ثبت کن.</p>
            </div>
          </div>
          <PhotoCardBox token={token} setMsg={setMsg} onDone={reload} />
        </div>
      </div>
      <Inventory items={items} grants={grants} token={token} reload={reload} />
    </>
  );
}
