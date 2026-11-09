import { Chess, type Square } from 'chess.js';
import type { Color, Key } from '@lichess-org/chessground/types';

export type PromotionPiece = 'q' | 'r' | 'b' | 'n';

/** Alle legalen Zielfelder je Ausgangsfeld – so weiß das Brett, wohin gezogen werden darf. */
export function legalDests(chess: Chess): Map<Key, Key[]> {
  const dests = new Map<Key, Key[]>();
  for (const move of chess.moves({ verbose: true })) {
    const list = dests.get(move.from) ?? [];
    if (!list.includes(move.to)) list.push(move.to);
    dests.set(move.from, list);
  }
  return dests;
}

export function turnColor(chess: Chess): Color {
  return chess.turn() === 'w' ? 'white' : 'black';
}

/** Ist der Zug von → nach eine Bauernumwandlung? Dann muss erst eine Figur gewählt werden. */
export function isPromotion(chess: Chess, from: string, to: string): boolean {
  return chess
    .moves({ verbose: true })
    .some((m) => m.from === from && m.to === to && m.promotion !== undefined);
}

/** Feld des Königs, der gerade im Schach steht (für die rote Markierung). */
export function checkSquare(chess: Chess): Key | undefined {
  if (!chess.inCheck()) return undefined;
  const color = chess.turn();
  for (const row of chess.board()) {
    for (const piece of row) {
      if (piece && piece.type === 'k' && piece.color === color) return piece.square;
    }
  }
  return undefined;
}

export type GameStatus =
  | { kind: 'playing'; turn: Color; check: boolean }
  | { kind: 'checkmate'; winner: Color }
  | { kind: 'draw'; reason: 'stalemate' | 'repetition' | 'insufficient' | 'fiftyMoves' };

export function gameStatus(chess: Chess): GameStatus {
  if (chess.isCheckmate()) return { kind: 'checkmate', winner: chess.turn() === 'w' ? 'black' : 'white' };
  if (chess.isStalemate()) return { kind: 'draw', reason: 'stalemate' };
  if (chess.isInsufficientMaterial()) return { kind: 'draw', reason: 'insufficient' };
  if (chess.isThreefoldRepetition()) return { kind: 'draw', reason: 'repetition' };
  if (chess.isDraw()) return { kind: 'draw', reason: 'fiftyMoves' };
  return { kind: 'playing', turn: turnColor(chess), check: chess.inCheck() };
}

const colorName: Record<Color, string> = { white: 'Weiß', black: 'Schwarz' };

const drawReason = {
  stalemate: 'Patt',
  repetition: 'dreifache Stellungswiederholung',
  insufficient: 'zu wenig Material',
  fiftyMoves: '50-Züge-Regel',
} as const;

export function statusText(status: GameStatus): string {
  switch (status.kind) {
    case 'playing':
      return status.check ? `${colorName[status.turn]} steht im Schach` : `${colorName[status.turn]} am Zug`;
    case 'checkmate':
      return `Schachmatt – ${colorName[status.winner]} gewinnt`;
    case 'draw':
      return `Remis durch ${drawReason[status.reason]}`;
  }
}

/** Figurenbuchstaben in deutscher Notation: K D T L S (Bauer ohne Buchstabe). */
const germanLetters: Record<string, string> = { K: 'K', Q: 'D', R: 'T', B: 'L', N: 'S' };

export function toGermanSan(san: string): string {
  return san.replace(/[KQRBN]/g, (c) => germanLetters[c]);
}

export type { Square };
