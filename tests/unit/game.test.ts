import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { checkSquare, gameStatus, isPromotion, legalDests, statusText, toGermanSan } from '../../src/chess/game';

describe('Spiellogik', () => {
  it('kennt die 20 Startzüge', () => {
    const dests = legalDests(new Chess());
    const total = [...dests.values()].reduce((n, list) => n + list.length, 0);
    expect(total).toBe(20);
    expect(dests.get('g1')).toEqual(['f3', 'h3']);
  });

  it('erkennt Bauernumwandlung', () => {
    const chess = new Chess('8/4P3/8/8/8/8/k7/4K3 w - - 0 1');
    expect(isPromotion(chess, 'e7', 'e8')).toBe(true);
    expect(isPromotion(chess, 'e1', 'e2')).toBe(false);
  });

  it('erkennt Schachmatt (Narrenmatt)', () => {
    const chess = new Chess();
    for (const m of ['f3', 'e5', 'g4', 'Qh4#']) chess.move(m);
    const status = gameStatus(chess);
    expect(status).toEqual({ kind: 'checkmate', winner: 'black' });
    expect(statusText(status)).toBe('Schachmatt – Schwarz gewinnt');
    expect(checkSquare(chess)).toBe('e1');
  });

  it('erkennt Patt', () => {
    const chess = new Chess('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');
    expect(statusText(gameStatus(chess))).toBe('Remis durch Patt');
  });

  it('übersetzt Notation ins Deutsche', () => {
    expect(toGermanSan('Nf3')).toBe('Sf3');
    expect(toGermanSan('Qxh7+')).toBe('Dxh7+');
    expect(toGermanSan('exd8=Q#')).toBe('exd8=D#');
    expect(toGermanSan('O-O')).toBe('O-O');
  });
});
