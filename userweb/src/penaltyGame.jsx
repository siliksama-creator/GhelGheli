 // 1:1 با اندروید penalty_board.dart — پنالتی دقیقاً مثل اپ با تور فیزیکی و دروازه‌بان ۳بعدی
import React, { useState, useEffect, useRef } from 'react';
import { fa } from './lib/api.js';

export default function PenaltyGame({ state, mySymbol, turn, onMove }) {
  const [selectedZone, setSelectedZone] = useState(null);
  const [power, setPower] = useState(0.7);
  const [isHolding, setIsHolding] = useState(false);
  const [animating, setAnimating] = useState(false);
  const [sweetWindow, setSweetWindow] = useState({ min: 0.62, max: 0.78 });

  const isShooter = mySymbol === 'X';
  const pending = state.pending || {};
  const haveIChosen = Boolean(pending[mySymbol]);
  const lastKick = state.lastKick;
  const score = state.score || { X: 0, O: 0 };
  const history = state.history || [];
  const round = state.round || 1;

  useEffect(() => {
    // هر ضربه پنجره طلایی تصادفی جدید
    setSweetWindow({ min: 0.45 + Math.random()*0.25, max: 0.65 + Math.random()*0.2 });
  }, [history.length]);

  useEffect(() => {
    if (!isHolding) return;
    let dir = 1;
    const interval = setInterval(() => {
      setPower(prev => {
        let next = prev + dir * 0.035;
        if (next >= 1.0) { next = 1.0; dir = -1; }
        if (next <= 0.35) { next = 0.35; dir = 1; }
        return next;
      });
    }, 28);
    return () => clearInterval(interval);
  }, [isHolding]);

  useEffect(() => {
    if (lastKick) {
      setAnimating(true);
      const t = setTimeout(() => setAnimating(false), 1900);
      return () => clearTimeout(t);
    }
  }, [lastKick?.shotZone, lastKick?.diveZone, lastKick?.outcome]);

  const handleShoot = () => {
    if (selectedZone === null || haveIChosen) return;
    onMove({ zone: selectedZone, power });
    setSelectedZone(null);
    setIsHolding(false);
  };
  const handleDive = (zone) => {
    if (haveIChosen) return;
    onMove({ zone, power: 0.8 });
  };
  const getZoneCoords = (zone) => {
    if (zone==null) return { x:50, y:50 };
    const row = Math.floor(zone/3), col = zone%3;
    return { x: 18 + col*32, y: 20 + row*30 };
  };
  const diveCoords = lastKick ? getZoneCoords(lastKick.diveZone) : { x:50, y:55 };
  const ballCoords = lastKick ? getZoneCoords(lastKick.shotZone) : { x:50, y:92 };
  const inSweet = power >= sweetWindow.min && power <= sweetWindow.max;

  return (
    <div style={{ maxWidth:'520px', margin:'0 auto', display:'flex', flexDirection:'column', gap:'12px', userSelect:'none' }}>
      <div style={{ background:'linear-gradient(135deg, #1E293B, #0F172A)', border:'1px solid rgba(255,255,255,0.12)', borderRadius:'20px', padding:'10px 16px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div style={{ textAlign:'center' }}>
          <div style={{ fontSize:'11px', color:'#38BDF8', fontWeight:'900' }}>{isShooter?'شما (زننده)':'حریف (زننده)'}</div>
          <div style={{ fontSize:'26px', fontWeight:'900', color:'#FFF' }}>{fa(score.X)}</div>
        </div>
        <div style={{ textAlign:'center' }}>
          <div style={{ fontSize:'11px', color:'#94A3B8', fontWeight:'bold' }}>دور {fa(round)} از ۵</div>
          <div style={{ display:'flex', gap:'4px', marginTop:'4px' }}>
            {Array.from({length:5}).map((_,i)=>{
              const h=history[i*2]; const isGoal=h&&h.outcome==='goal', isSave=h&&h.outcome==='save';
              return <span key={i} style={{ width:'12px', height:'12px', borderRadius:'50%', background: isGoal?'#22E7A6':isSave?'#EF4444':'rgba(255,255,255,0.15)', border:'1px solid rgba(255,255,255,0.2)', boxShadow: isGoal?'0 0 6px #22E7A6':'' }} />;
            })}
          </div>
        </div>
        <div style={{ textAlign:'center' }}>
          <div style={{ fontSize:'11px', color:'#F59E0B', fontWeight:'900' }}>{!isShooter?'شما (دروازه‌بان)':'حریف (دروازه‌بان)'}</div>
          <div style={{ fontSize:'26px', fontWeight:'900', color:'#FFF' }}>{fa(score.O)}</div>
        </div>
      </div>

      <div style={{ position:'relative', height:'320px', background:'radial-gradient(ellipse at center bottom, #15803D 0%, #064E3B 60%, #022c22 100%)', borderRadius:'24px', border:'4px solid #F1F5F9', overflow:'hidden', padding:'12px', boxShadow:'inset 0 0 40px rgba(0,0,0,0.85), 0 12px 36px rgba(0,0,0,0.6)' }}>
        <div style={{ position:'absolute', bottom:0, left:'10%', right:'10%', height:'50px', borderTop:'2px solid rgba(255,255,255,0.15)', borderRadius:'50% 50% 0 0' }} />
        <div style={{ position:'absolute', inset:'16px 20px 50px 20px', border:'3px solid #FFF', borderRadius:'8px 8px 0 0', background:'repeating-linear-gradient(0deg, rgba(255,255,255,0.05) 0px, rgba(255,255,255,0.05) 1px, transparent 1px, transparent 18px), repeating-linear-gradient(90deg, rgba(255,255,255,0.05) 0px, rgba(255,255,255,0.05) 1px, transparent 1px, transparent 18px)', display:'grid', gridTemplateColumns:'repeat(3,1fr)', gridTemplateRows:'repeat(3,1fr)', gap:'6px', padding:'6px', zIndex:2 }}>
          {Array.from({length:9}).map((_,i)=>{
            const sel = selectedZone===i;
            return (
              <button key={i} disabled={haveIChosen} onClick={()=>isShooter?setSelectedZone(i):handleDive(i)} style={{ background: sel?'rgba(255,215,0,0.35)':'rgba(255,255,255,0.03)', border: sel?'2px solid #FFD700':'1px dashed rgba(255,255,255,0.15)', borderRadius:'10px', color: sel?'#FFD700':'rgba(255,255,255,0.5)', fontSize:'18px', fontWeight:'900', cursor: haveIChosen?'not-allowed':'pointer', transform: sel?'scale(1.03)':'scale(1)', boxShadow: sel?'0 0 12px rgba(255,215,0,0.5)':'none' }}>
                {i+1}
              </button>
            );
          })}
        </div>
        <div style={{ position:'absolute', left:`${diveCoords.x}%`, top:`${diveCoords.y}%`, transform:'translate(-50%,-50%)', transition:'all 0.45s cubic-bezier(0.34, 1.56, 0.64, 1)', zIndex:4, display:'flex', flexDirection:'column', alignItems:'center' }}>
          <div style={{ display:'flex', gap:'20px', alignItems:'center' }}>
            <img src="/pass/glove_icon.webp" alt="" style={{ width:'26px', height:'26px', transform:'rotate(-25deg)', filter:'drop-shadow(0 4px 8px rgba(0,0,0,0.6))' }} />
            <div style={{ width:'40px', height:'46px', background:'linear-gradient(180deg, #F59E0B, #B45309)', borderRadius:'12px', border:'2px solid #FEF08A', display:'flex', alignItems:'center', justifyContent:'center', color:'#FFF', fontWeight:'900', fontSize:'10px', boxShadow:'0 6px 16px rgba(0,0,0,0.7)' }}>GK</div>
            <img src="/pass/glove_icon.webp" alt="" style={{ width:'26px', height:'26px', transform:'rotate(25deg)', filter:'drop-shadow(0 4px 8px rgba(0,0,0,0.6))' }} />
          </div>
        </div>
        <div style={{ position:'absolute', left:`${animating?ballCoords.x:50}%`, top:`${animating?ballCoords.y:88}%`, transform:'translate(-50%,-50%)', transition: animating?'all 0.42s cubic-bezier(0.25,1,0.5,1)':'none', zIndex:5 }}>
          <img src="/pass/football_icon.webp" alt="" style={{ width: animating?'30px':'36px', height: animating?'30px':'36px', transform: animating?'rotate(360deg)':'none', transition:'transform 0.42s', filter:'drop-shadow(0 6px 12px rgba(0,0,0,0.8))' }} />
        </div>
        {animating && lastKick && (
          <div style={{ position:'absolute', inset:'auto 16px 16px 16px', padding:'10px', borderRadius:'14px', background: lastKick.outcome==='goal'?'linear-gradient(135deg, #22E7A6, #00D49A)':'linear-gradient(135deg, #EF4444, #DC2626)', color:'#000', fontWeight:'900', textAlign:'center', zIndex:10 }}>
            {lastKick.outcome==='goal'?'⚽ گللللل!':'🧤 مهار تماشایی!'}
          </div>
        )}
        {/* تور موج‌دار ساده برای وب - نمایش موج در گل */}
        {animating && lastKick?.outcome==='goal' && (
          <div style={{ position:'absolute', inset:'16px 20px 50px 20px', borderRadius:'8px 8px 0 0', background:'rgba(34,231,166,0.08)', animation:'pulse 0.4s ease-out 2', pointerEvents:'none' }} />
        )}
      </div>

      {isShooter ? (
        <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
            <span style={{ fontSize:'11px', color:'#94A3B8', fontWeight:'bold', width:'70px' }}>قدرت:</span>
            <div style={{ flex:1, height:'14px', background:'rgba(255,255,255,0.1)', borderRadius:'99px', overflow:'hidden', border:'1px solid rgba(255,255,255,0.1)', position:'relative' }}>
              <div style={{ position:'absolute', left:`${sweetWindow.min*100}%`, width:`${(sweetWindow.max-sweetWindow.min)*100}%`, top:0, bottom:0, background:'rgba(255,215,0,0.4)', border:'1px solid #FFD700' }} />
              <div style={{ height:'100%', width:`${power*100}%`, background: inSweet?'#FFD700':power>0.85?'#EF4444':power>0.5?'#22E7A6':'#38BDF8', borderRadius:'99px', transition: isHolding?'none':'width 0.08s' }} />
              <div style={{ position:'absolute', left:`${power*100}%`, top:'-2px', bottom:'-2px', width:'3px', background:'#FFF', borderRadius:'99px', transform:'translateX(-50%)', boxShadow:'0 0 6px #FFF' }} />
            </div>
          </div>
          <div style={{ display:'flex', gap:'8px' }}>
            <button disabled={selectedZone===null||haveIChosen} onMouseDown={()=>setIsHolding(true)} onMouseUp={handleShoot} onTouchStart={()=>setIsHolding(true)} onTouchEnd={handleShoot} style={{ flex:1, padding:'14px', borderRadius:'14px', border:'none', background: selectedZone===null||haveIChosen?'#334155':'linear-gradient(135deg, #38BDF8, #0284C7)', color:'#FFF', fontWeight:'900', fontSize:'15px', cursor:'pointer', boxShadow: selectedZone===null?'none':'0 6px 16px rgba(56,189,248,0.4)' }}>
              {haveIChosen?'منتظر حریف...': isHolding ? 'رها کن!' : 'نگه دار و رها کن'}
            </button>
          </div>
          <div style={{ textAlign:'center', color: inSweet?'#FFD700':'#94A3B8', fontSize:'11px', fontWeight:'700' }}>
            {haveIChosen?'منتظر انتخاب دروازه‌بان...': selectedZone===null?'یک گوشه را انتخاب کن (۱-۹)': isHolding ? (inSweet?'داخل نوار طلایی — ضربه تمیز!':'رها کن تا شوت بزنی') : 'نگه دار تا قدرت تنظیم شود'}
          </div>
        </div>
      ) : (
        <div style={{ textAlign:'center', padding:'12px', background:'rgba(56,189,248,0.08)', border:'1px solid rgba(56,189,248,0.2)', borderRadius:'12px' }}>
          <div style={{ color:'#38BDF8', fontWeight:'900', fontSize:'13px' }}>{haveIChosen?'منتظر ضربه زننده...':'تو دروازه‌بانی — حدس بزن کجا می‌زند'}</div>
          <div style={{ color:'#64748B', fontSize:'11px', marginTop:'4px' }}>یک خانه (۱-۹) را بزن تا شیرجه بزنی</div>
        </div>
      )}
    </div>
  );
}
