// Reversi / Othello Board for Web (8x8 felt board with hint dots and flip animations)
import React from 'react';
import { fa } from './lib/api.js';

export default function ReversiGame({ state, mySymbol, turn, onMove }) {
  const board = state.board || Array(64).fill(null);
  const legal = state.legalMoves || [];
  const scores = state.scores || { X: 2, O: 2 };
  const isMyTurn = turn === mySymbol;

  return (
    <div style={{ maxWidth: '440px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '14px', userSelect: 'none' }}>
      {/* Scores bar */}
      <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center', background: 'rgba(0,0,0,0.4)', padding: '10px 20px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.1)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <img src="/pass/football_icon.webp" alt="" style={{ width: '24px', height: '24px' }} />
          <span style={{ fontWeight: '900', color: '#FFF', fontSize: '16px' }}>{mySymbol === 'X' ? 'شما' : 'حریف'}: {fa(scores.X)}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <img src="/games/reversi.webp" alt="" style={{ width: '24px', height: '24px' }} />
          <span style={{ fontWeight: '900', color: '#34D399', fontSize: '16px' }}>{mySymbol === 'O' ? 'شما' : 'حریف'}: {fa(scores.O)}</span>
        </div>
      </div>

      {/* 8x8 Board */}
      <div
        style={{
          aspectRatio: '1/1',
          background: '#15803D',
          borderRadius: '16px',
          border: '4px solid #064E3B',
          padding: '6px',
          boxShadow: '0 12px 36px rgba(0,0,0,0.6), inset 0 0 20px rgba(0,0,0,0.5)',
          display: 'grid',
          gridTemplateColumns: 'repeat(8, 1fr)',
          gap: '3px',
        }}
      >
        {board.map((cell, i) => {
          const isLegal = isMyTurn && legal.includes(i);
          return (
            <button
              key={i}
              type="button"
              disabled={!isLegal}
              onClick={() => onMove(i)}
              style={{
                background: '#166534',
                border: 'none',
                borderRadius: '4px',
                padding: '2px',
                cursor: isLegal ? 'pointer' : 'default',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.15s',
              }}
            >
              {cell === 'X' && (
                <img src="/pass/football_icon.webp" alt="" style={{ width: '85%', height: '85%', objectFit: 'contain', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))' }} />
              )}
              {cell === 'O' && (
                <img src="/games/reversi.webp" alt="" style={{ width: '85%', height: '85%', objectFit: 'contain', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))' }} />
              )}
              {!cell && isLegal && (
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'rgba(255,255,255,0.45)', boxShadow: '0 0 6px #FFF' }} />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
