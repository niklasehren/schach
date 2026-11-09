import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { materialInfo } from '../../src/chess/material';
import { strengthLabel, strengthLevels, strengthOptions } from '../../src/engine/strength';
import { createSession, defaultSetup, resultText } from '../../src/chess/session';

function play(...moves: string[]) {
  const chess = new Chess();
  for (const m of moves) chess.move(m);
  return chess;
}

describe('Material', () => {
  it('Startstellung: nichts geschlagen, kein Vorsprung', () => {
    expect(materialInfo(new Chess())).toEqual({ captured: { white: [], black: [] }, advantage: { white: 0, black: 0 } });
  });

  it('zählt geschlagene Figuren und Vorsprung', () => {
    // Weiß schlägt einen Springer, Schwarz einen Bauern
    const chess = play('e4', 'Nf6', 'Nc3', 'Nxe4', 'Nxe4');
    const info = materialInfo(chess);
    expect(info.captured.white).toEqual(['n']);
    expect(info.captured.black).toEqual(['p']);
    expect(info.advantage).toEqual({ white: 2, black: 0 });
  });

  it('en passant wird als geschlagener Bauer gezählt', () => {
    const chess = play('e4', 'a6', 'e5', 'd5', 'exd6');
    expect(materialInfo(chess).captured.white).toEqual(['p']);
  });

  it('nach Umwandlung zählt die neue Dame', () => {
    const chess = new Chess('8/4P3/8/8/8/8/k7/4K3 w - - 0 1');
    expect(materialInfo(chess).advantage.white).toBe(1);
    chess.move('e8=Q');
    expect(materialInfo(chess).advantage.white).toBe(9);
  });

  it('kann frühere Stellungen auswerten', () => {
    const chess = play('e4', 'd5', 'exd5', 'Qxd5');
    expect(materialInfo(chess, 3).advantage.white).toBe(1);
    expect(materialInfo(chess, 4).advantage.white).toBe(0);
    expect(materialInfo(chess, 0).captured.white).toEqual([]);
  });
});

describe('Spielstärke', () => {
  it('nutzt Elo-Begrenzung ab 1320, darunter Skill Level', () => {
    expect(strengthLevels[0]).toEqual({ kind: 'skill', skill: 0 });
    expect(strengthOptions({ kind: 'elo', elo: 1500 })).toEqual({ 'Skill Level': 20, UCI_LimitStrength: true, UCI_Elo: 1500 });
    expect(strengthOptions({ kind: 'skill', skill: 3 })).toEqual({ UCI_LimitStrength: false, 'Skill Level': 3 });
    expect(strengthLabel({ kind: 'skill', skill: 0 })).toBe('Einsteiger 1/4');
    expect(strengthLevels.every((s) => s.kind === 'skill' || (s.elo >= 1320 && s.elo <= 3190))).toBe(true);
  });
});

describe('Partie-Einstellungen', () => {
  it('gegen Freund: Namen, leere Namen werden zu Weiß/Schwarz', () => {
    const s = createSession({ ...defaultSetup, mode: 'friend', whiteName: ' Anna ', blackName: '' });
    expect(s.players.white.name).toBe('Anna');
    expect(s.players.black.name).toBe('Schwarz');
    expect(resultText({ winner: 'white', reason: 'resign' }, s.players).headline).toBe('Anna gewinnt');
  });

  it('gegen Computer mit Schwarz: Stockfish hat Weiß, Brett von Schwarz aus', () => {
    const s = createSession({ ...defaultSetup, colorChoice: 'black' });
    expect(s.players.white.isEngine).toBe(true);
    expect(s.orientation).toBe('black');
    expect(resultText({ winner: 'black', reason: 'checkmate' }, s.players).headline).toBe('Du hast gewonnen');
  });
});
