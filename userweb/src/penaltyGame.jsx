// Next-Gen Interactive Penalty Shootout for Web with Animated Goalkeeper, 9 Zones, and Real Net Action
import React, { useState, useEffect, useRef } from 'react';
import { fa } from './lib/api.js';

export default function PenaltyGame({ state, mySymbol, turn, onMove }) {
  const [selectedZone, setSelectedZone] = useState(null);
  const [power, setPower] = useState(0.7);
  const [isHolding, setIsHolding] = useState(false);
  const [animating, setAnimating] = useState(false);
  const powerRef = useRef(null);

  const isShooter = mySymbol === 'X';
  const pending = state.pending || {};
  const haveIChosen = Boolean(pending[mySymbol]);
  const lastKick = state.lastKick;
  const score = state.score || { X: 0, O: 0 };
  const history = state.history || [];
  const round = state.round || 1;

  // Power meter oscillation while holding
  useEffect(() => {
    if (!isHolding) return;
    let dir = 1;
    const interval = setInterval(() => {
      setPower(prev => {
        let next = prev + dir * 0.04;
        if (next >= 1.0) { next = 1.0; dir = -1; }
        if (next <= 0.2) { next = 0.2; dir = 1; }
        return next;
      });
    }, 30);
    return () => clearInterval(interval);
  }, [isHolding]);

  // Trigger goal/save animation on new kick
  useEffect(() => {
    if (lastKick) {
      setAnimating(true);
      const t = setTimeout(() => setAnimating(false), 2400);
      return () => clearTimeout(t);
    }
  }, [lastKick?.shotZone, lastKick?.diveZone, lastKick?.outcome, history.length]);

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

  // Coordinate mapper for 9 zones: 0..8
  const getZoneCoords = (zone) => {
    if (zone === null || zone === undefined) return { x: 50, y: 50 };
    const row = Math.floor(zone / 3); // 0 (top), 1 (mid), 2 (bottom)
    const col = zone % 3;             // 0 (left), 1 (mid), 2 (right)
    return {
      x: 18 + col * 32,
      y: 20 + row * 30,
    };
  };

  const diveCoords = lastKick ? getZoneCoords(lastKick.diveZone) : { x: 50, y: 55 };
  const ballCoords = lastKick ? getZoneCoords(lastKick.shotZone) : { x: 50, y: 92 };

  return (
    <div style={{ maxWidth: '520px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '14px', userSelect: 'none' }}>
      {/* ── ۱. تابلوی امتیازات زنده و دورهای ۵‌گانه ── */}
      <div
        style={{
          background: 'linear-gradient(135deg, #1E293B, #0F172A)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: '20px',
          padding: '12px 20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '11px', color: '#38BDF8', fontWeight: '900' }}>
            {isShooter ? 'شما (زننده شوت)' : 'حریف (زننده شوت)'}
          </div>
          <div style={{ fontSize: '28px', fontWeight: '900', color: '#FFF' }}>{fa(score.X)}</div>
        </div>

        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '11px', color: '#94A3B8', fontWeight: 'bold', marginBottom: '6px' }}>
            دور {fa(round)} از ۵
          </div>
          <div style={{ display: 'flex', gap: '5px' }}>
            {Array.from({ length: 5 }).map((_, i) => {
              const h = history[i * 2];
              const isGoal = h && h.outcome === 'goal';
              const isSave = h && h.outcome === 'save';
              return (
                <span
                  key={i}
                  style={{
                    width: '14px',
                    height: '14px',
                    borderRadius: '50%',
                    background: isGoal ? '#22E7A6' : isSave ? '#EF4444' : 'rgba(255,255,255,0.15)',
                    border: '1px solid rgba(255,255,255,0.2)',
                    boxShadow: isGoal ? '0 0 8px #22E7A6' : isSave ? '0 0 8px #EF4444' : 'none',
                    display: 'inline-block',
                  }}
                />
              );
            })}
          </div>
        </div>

        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '11px', color: '#F59E0B', fontWeight: '900' }}>
            {!isShooter ? 'شما (دروازه‌بان)' : 'حریف (دروازه‌بان)'}
          </div>
          <div style={{ fontSize: '28px', fontWeight: '900', color: '#FFF' }}>{fa(score.O)}</div>
        </div>
      </div>

      {/* ── ۲. استادیوم و چارچوب دروازه با دروازه‌بان واقعی و توپ متحرک ── */}
      <div
        style={{
          position: 'relative',
          height: '300px',
          background: 'radial-gradient(ellipse at center bottom, #15803D 0%, #064E3B 60%, #022c22 100%)',
          borderRadius: '24px',
          border: '4px solid #F1F5F9',
          boxShadow: 'inset 0 0 40px rgba(0,0,0,0.85), 0 12px 36px rgba(0,0,0,0.6)',
          overflow: 'hidden',
          padding: '12px',
        }}
      >
        {/* خطوط سفید زمین چمن */}
        <div style={{ position: 'absolute', bottom: '0', left: '10%', right: '10%', height: '50px', borderTop: '2px solid rgba(255,255,255,0.2)', borderRadius: '50% 50% 0 0' }} />
        <div style={{ position: 'absolute', bottom: '24px', left: '50%', width: '10px', height: '10px', background: '#FFF', borderRadius: '50%', transform: 'translateX(-50%)' }} />

        {/* توری دروازه با شبکه ۳x۳ */}
        <div
          style={{
            position: 'absolute',
            inset: '16px 20px 50px 20px',
            border: '3px solid #FFF',
            borderRadius: '8px 8px 0 0',
            background: 'repeating-linear-gradient(0deg, rgba(255,255,255,0.06) 0px, rgba(255,255,255,0.06) 1px, transparent 1px, transparent 18px), repeating-linear-gradient(90deg, rgba(255,255,255,0.06) 0px, rgba(255,255,255,0.06) 1px, transparent 1px, transparent 18px)',
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gridTemplateRows: 'repeat(3, 1fr)',
            gap: '6px',
            padding: '6px',
            zIndex: 2,
          }}
        >
          {Array.from({ length: 9 }).map((_, i) => {
            const isSelected = selectedZone === i;
            return (
              <button
                key={i}
                type="button"
                disabled={haveIChosen}
                onClick={() => (isShooter ? setSelectedZone(i) : handleDive(i))}
                style={{
                  background: isSelected
                    ? 'rgba(255, 215, 0, 0.40)'
                    : 'rgba(255,255,255,0.04)',
                  border: isSelected ? '2px solid #FFD700' : '1px dashed rgba(255,255,255,0.18)',
                  borderRadius: '10px',
                  color: isSelected ? '#FFD700' : 'rgba(255,255,255,0.6)',
                  fontSize: '20px',
                  fontWeight: '900',
                  cursor: haveIChosen ? 'not-allowed' : 'pointer',
                  transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                  transform: isSelected ? 'scale(1.04)' : 'scale(1)',
                  boxShadow: isSelected ? '0 0 16px rgba(255, 215, 0, 0.6)' : 'none',
                }}
              >
                {i + 1}
              </button>
            );
          })}
        </div>

        {/* ── دروازه‌بان متحرک با دستکش‌ها ── */}
        <div
          style={{
            position: 'absolute',
            left: `${diveCoords.x}%`,
            top: `${diveCoords.y}%`,
            transform: 'translate(-50%, -50%)',
            transition: 'all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)',
            zIndex: 4,
            pointerEvents: 'none',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
          }}
        >
          <div style={{ display: 'flex', gap: '22px', alignItems: 'center' }}>
            <img src="/pass/glove_icon.webp" alt="" style={{ width: '28px', height: '28px', transform: 'rotate(-25deg)', filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.6))' }} />
            <div
              style={{
                width: '42px',
                height: '48px',
                background: 'linear-gradient(180deg, #F59E0B 0%, #B45309 100%)',
                borderRadius: '14px',
                border: '2px solid #FEF08A',
                boxShadow: '0 6px 16px rgba(0,0,0,0.7)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#FFF',
                fontWeight: '900',
                fontSize: '11px',
              }}
            >
              GK
            </div>
            <img src="/pass/glove_icon.webp" alt="" style={{ width: '28px', height: '28px', transform: 'rotate(25deg)', filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.6))' }} />
          </div>
        </div>

        {/* ── توپ فوتبال متحرک ── */}
        <div
          style={{
            position: 'absolute',
            left: `${animating ? ballCoords.x : 50}%`,
            top: `${animating ? ballCoords.y : 88}%`,
            transform: 'translate(-50%, -50%)',
            transition: animating ? 'all 0.45s cubic-bezier(0.25, 1, 0.5, 1)' : 'none',
            zIndex: 5,
            pointerEvents: 'none',
          }}
        >
          <img
            src="/pass/football_icon.webp"
            alt=""
            style={{
              width: animating ? '32px' : '38px',
              height: animating ? '32px' : '38px',
              transform: animating ? 'rotate(360deg)' : 'none',
              transition: 'transform 0.45s ease-out',
              filter: 'drop-shadow(0 6px 12px rgba(0,0,0,0.8))',
            }}
          />
        </div>

        {/* ── بنر جشن گل یا مهار تماشایی ── */}
        {animating && lastKick && (
          <div
            style={{
              position: 'absolute',
              inset: 'auto 16px 16px 16px',
              padding: '12px',
              borderRadius: '16px',
              background: lastKick.outcome === 'goal'
                ? 'linear-gradient(135deg, #22E7A6, #00D49A)'
                : 'linear-gradient(135deg, #EF4444, #DC2626)',
              color: '#000',
              fontWeight: '900',
              fontSize: '16px',
              textAlign: 'center',
              boxShadow: '0 8px 24px rgba(0,0,0,0.7)',
              zIndex: 10,
              animation: 'popIn 0.25s ease-out',
            }}
          >
            {lastKick.outcome === 'goal' ? '⚽ گللللللل! ضربه مستقیم وارد دروازه شد' : '🧤 مهار تماشایی توسط دروازه‌بان!'}
          </div>
        )}
      </div>

      {/* ── ۳. کنترل‌های زننده و دروازه‌بان ── */}
      {isShooter ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {/* Power Bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '11px', color: '#94A3B8', fontWeight: 'bold', width: '70px' }}>قدرت ضربه:</span>
            <div style={{ flex: 1, height: '14px', background: 'rgba(255,255,255,0.1)', borderRadius: '99px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.15)' }}>
              <div
                style={{
                  height: '100%',
                  width: `${power * 100}%`,
                  background: power > 0.85 ? '#EF4444' : power > 0.5 ? '#22E7A6' : '#38BDF8',
                  borderRadius: '99px',
                  transition: isHolding ? 'none' : 'width 0.1s',
                }}
              />
            </div>
          </div>

          <button
            type="button"
            disabled={selectedZone === null || haveIChosen}
            onMouseDown={() => setIsHolding(true)}
            onMouseUp={handleShoot}
            onTouchStart={() => setIsHolding(true)}
            onTouchEnd={handleShoot}
            style={{
              padding: '15px',
              borderRadius: '16px',
              background: selectedZone !== null && !haveIChosen
                ? 'linear-gradient(135deg, #22E7A6, #00D49A)'
                : 'rgba(255,255,255,0.08)',
              color: selectedZone !== null && !haveIChosen ? '#00281D' : '#64748B',
              fontWeight: '900',
              fontSize: '15px',
              border: 'none',
              cursor: selectedZone !== null && !haveIChosen ? 'pointer' : 'not-allowed',
              boxShadow: selectedZone !== null && !haveIChosen ? '0 8px 24px rgba(34, 231, 166, 0.35)' : 'none',
            }}
          >
            {haveIChosen
              ? 'در انتظار شیرجه دروازه‌بان...'
              : (selectedZone !== null ? `نگه دار برای قدرت و رها کن (شوت به خانه ${selectedZone + 1}) ⚽` : 'روی یکی از خانه‌های ۱ تا ۹ دروازه بزن')}
          </button>
        </div>
      ) : (
        <div style={{ textAlign: 'center', padding: '14px', background: 'rgba(255,255,255,0.04)', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.08)' }}>
          {haveIChosen ? (
            <span style={{ color: '#38BDF8', fontWeight: '900', fontSize: '14px' }}>
              🧤 جهت شیرجه شما ثبت شد — در انتظار شوت حریف...
            </span>
          ) : (
            <span style={{ color: '#F59E0B', fontWeight: '900', fontSize: '14px' }}>
              🧤 جهت شیرجه را از روی خانه‌های ۱ تا ۹ دروازه انتخاب کن!
            </span>
          )}
        </div>
      )}
    </div>
  );
}
