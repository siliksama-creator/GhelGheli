// Interactive Next-Gen Penalty Shootout for Web
import React, { useState, useEffect } from 'react';
import { fa } from './lib/api.js';

export default function PenaltyGame({ state, mySymbol, turn, onMove }) {
  const [selectedZone, setSelectedZone] = useState(null);
  const [power, setPower] = useState(0.7);

  const isShooter = mySymbol === 'X';
  const myTurn = true; // simultaneous in penalty
  const pending = state.pending || {};
  const haveIChosen = Boolean(pending[mySymbol]);
  const lastKick = state.lastKick;
  const score = state.score || { X: 0, O: 0 };
  const history = state.history || [];

  const handleShoot = () => {
    if (selectedZone === null || haveIChosen) return;
    onMove({ zone: selectedZone, power });
    setSelectedZone(null);
  };

  const handleDive = (zone) => {
    if (haveIChosen) return;
    onMove({ zone, power: 0.8 });
  };

  return (
    <div style={{ maxWidth: '440px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '14px' }}>
      {/* Scoreboard */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.4)', padding: '12px 20px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.1)' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '11px', color: '#38BDF8', fontWeight: 'bold' }}>{isShooter ? 'شما (زننده)' : 'حریف (زننده)'}</div>
          <div style={{ fontSize: '24px', fontWeight: '900', color: '#FFF' }}>{fa(score.X)}</div>
        </div>

        <div style={{ display: 'flex', gap: '4px' }}>
          {Array.from({ length: 5 }).map((_, i) => {
            const h = history[i * 2];
            return (
              <span key={i} style={{ width: '12px', height: '12px', borderRadius: '50%', background: h ? (h.outcome === 'goal' ? '#22E7A6' : '#EF4444') : 'rgba(255,255,255,0.15)', display: 'inline-block' }} />
            );
          })}
        </div>

        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '11px', color: '#F59E0B', fontWeight: 'bold' }}>{!isShooter ? 'شما (دروازه‌بان)' : 'حریف (دروازه‌بان)'}</div>
          <div style={{ fontSize: '24px', fontWeight: '900', color: '#FFF' }}>{fa(score.O)}</div>
        </div>
      </div>

      {/* Goal Frame & 9 Zones */}
      <div
        style={{
          position: 'relative',
          height: '240px',
          background: 'linear-gradient(180deg, #0F172A 0%, #020617 100%)',
          borderRadius: '16px',
          border: '4px solid #FFF',
          boxShadow: 'inset 0 0 30px rgba(0,0,0,0.8), 0 0 20px rgba(56, 189, 248, 0.2)',
          padding: '8px',
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gridTemplateRows: 'repeat(3, 1fr)',
          gap: '6px',
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
                  ? 'rgba(255, 215, 0, 0.35)'
                  : 'rgba(255,255,255,0.06)',
                border: isSelected ? '2px solid #FFD700' : '1px dashed rgba(255,255,255,0.2)',
                borderRadius: '8px',
                color: isSelected ? '#FFD700' : 'rgba(255,255,255,0.7)',
                fontSize: '18px',
                fontWeight: '900',
                cursor: haveIChosen ? 'not-allowed' : 'pointer',
                transition: 'all 0.15s',
              }}
            >
              {i + 1}
            </button>
          );
        })}

        {/* Last Kick Overlay banner */}
        {lastKick && (
          <div
            style={{
              position: 'absolute',
              inset: 'auto 10px 10px 10px',
              padding: '6px 12px',
              borderRadius: '8px',
              background: lastKick.outcome === 'goal' ? 'rgba(34, 231, 166, 0.9)' : 'rgba(239, 68, 68, 0.9)',
              color: '#000',
              fontWeight: '900',
              fontSize: '13px',
              textAlign: 'center',
              boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
            }}
          >
            {lastKick.outcome === 'goal' ? '⚽ گل شد!' : '🧤 مهار توسط دروازه‌بان!'}
          </div>
        )}
      </div>

      {/* Shooter Action Bar */}
      {isShooter && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <button
            type="button"
            disabled={selectedZone === null || haveIChosen}
            onClick={handleShoot}
            style={{
              padding: '14px',
              borderRadius: '14px',
              background: selectedZone !== null && !haveIChosen ? 'linear-gradient(135deg, #22E7A6, #00D49A)' : 'rgba(255,255,255,0.1)',
              color: selectedZone !== null && !haveIChosen ? '#00281D' : '#64748B',
              fontWeight: '900',
              fontSize: '15px',
              border: 'none',
              cursor: selectedZone !== null && !haveIChosen ? 'pointer' : 'not-allowed',
            }}
          >
            {haveIChosen ? 'در انتظار شیرجه دروازه‌بان...' : (selectedZone !== null ? `شوت به ناحیه ${selectedZone + 1} ⚽` : 'یک ناحیه را انتخاب کنید')}
          </button>
        </div>
      )}

      {!isShooter && haveIChosen && (
        <div style={{ textAlign: 'center', color: '#38BDF8', fontWeight: 'bold', fontSize: '13px', padding: '10px' }}>
          شیرجه ثبت شد — در انتظار ضربه زننده...
        </div>
      )}
    </div>
  );
}
