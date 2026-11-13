import type { Color } from '@lichess-org/chessground/types';
import { defaultStrengthIndex, strengthLabel, strengthLevels } from '../engine/strength';
import type { GameStatus } from './game';

/** Einstellungen für eine neue Partie */
export type GameSetup = {
  mode: 'computer' | 'friend';
  /** Gegen Computer: gewünschte Farbe */
  colorChoice: Color | 'random';
  strengthIndex: number;
  /** true, sobald ich die Stärke selbst gewählt habe – vorher gilt die Empfehlung aus meiner Chess.com-Wertung */
  strengthChosen?: boolean;
  /** Gegen Freund: Namen der beiden Spieler */
  whiteName: string;
  blackName: string;
  /** Gegen Freund: Wer von beiden bin ich? (Fehler-Markierung und Puzzles nur für meine Züge) */
  friendMe: Color | 'none';
};

export const defaultSetup: GameSetup = {
  mode: 'computer',
  colorChoice: 'white',
  strengthIndex: defaultStrengthIndex,
  whiteName: '',
  blackName: '',
  friendMe: 'none',
};

export type Player = { name: string; detail?: string; isEngine: boolean };

/** Eine laufende Partie mit festgelegten Spielern */
export type Session = {
  id: number;
  setup: GameSetup;
  players: Record<Color, Player>;
  /** Unten am Brett: eigene Farbe gegen Computer, sonst Weiß */
  orientation: Color;
};

let nextId = 1;

export function createSession(setup: GameSetup): Session {
  if (setup.mode === 'friend') {
    return {
      id: nextId++,
      setup,
      players: {
        white: { name: setup.whiteName.trim() || 'Weiß', isEngine: false },
        black: { name: setup.blackName.trim() || 'Schwarz', isEngine: false },
      },
      orientation: 'white',
    };
  }
  const me: Color = setup.colorChoice === 'random' ? (Math.random() < 0.5 ? 'white' : 'black') : setup.colorChoice;
  const strength = strengthLevels[setup.strengthIndex] ?? strengthLevels[defaultStrengthIndex];
  const engine: Player = { name: 'Stockfish', detail: strengthLabel(strength), isEngine: true };
  const human: Player = { name: 'Du', isEngine: false };
  return {
    id: nextId++,
    setup,
    players: me === 'white' ? { white: human, black: engine } : { white: engine, black: human },
    orientation: me,
  };
}

export type GameResult = {
  winner: Color | null;
  reason: 'checkmate' | 'resign' | 'stalemate' | 'repetition' | 'insufficient' | 'fiftyMoves';
};

export function resultFromStatus(status: GameStatus): GameResult | null {
  if (status.kind === 'checkmate') return { winner: status.winner, reason: 'checkmate' };
  if (status.kind === 'draw') return { winner: null, reason: status.reason };
  return null;
}

export function resultScore(r: GameResult): '1-0' | '0-1' | '½-½' {
  return r.winner === 'white' ? '1-0' : r.winner === 'black' ? '0-1' : '½-½';
}

const reasonText: Record<GameResult['reason'], string> = {
  checkmate: 'Schachmatt',
  resign: 'Aufgabe',
  stalemate: 'Patt',
  repetition: 'dreifache Stellungswiederholung',
  insufficient: 'zu wenig Material',
  fiftyMoves: '50-Züge-Regel',
};

export function resultText(r: GameResult, players: Record<Color, Player>): { headline: string; detail: string } {
  if (r.winner === null) return { headline: 'Remis', detail: `durch ${reasonText[r.reason]}` };
  const winner = players[r.winner];
  const headline = winner.name === 'Du' ? 'Du hast gewonnen' : `${winner.name} gewinnt`;
  return { headline, detail: `durch ${reasonText[r.reason]}` };
}

const STORAGE_KEY = 'schach.setup';

/** Letzte Einstellungen merken (bis Block 4 die richtige Datenbank kommt) */
export function loadSetup(): GameSetup {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...defaultSetup, ...JSON.parse(raw) } : defaultSetup;
  } catch {
    return defaultSetup;
  }
}

export function saveSetup(setup: GameSetup) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(setup));
  } catch {
    // Speichern nicht möglich (z. B. privates Fenster) – dann eben ohne Merken
  }
}
