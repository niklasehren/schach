import { DEFAULT_POSITION, type Chess, type PieceSymbol } from 'chess.js';
import type { Color } from '@lichess-org/chessground/types';

const values: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const order: PieceSymbol[] = ['q', 'r', 'b', 'n', 'p'];

export type MaterialInfo = {
  /** Von dieser Farbe geschlagene Figuren (des Gegners), wertvollste zuerst */
  captured: Record<Color, PieceSymbol[]>;
  /** Materialvorsprung in Bauerneinheiten (positiv = vorn, sonst 0) */
  advantage: Record<Color, number>;
};

/**
 * Geschlagene Figuren aus dem Zugverlauf (stimmt auch bei en passant),
 * Vorsprung aus dem Material auf dem Brett (stimmt auch nach Umwandlungen).
 */
export function materialInfo(chess: Chess, upToPly?: number): MaterialInfo {
  const captured: Record<Color, PieceSymbol[]> = { white: [], black: [] };
  const history = chess.history({ verbose: true }).slice(0, upToPly);
  for (const move of history) {
    if (move.captured) captured[move.color === 'w' ? 'white' : 'black'].push(move.captured);
  }
  for (const list of Object.values(captured)) list.sort((a, b) => order.indexOf(a) - order.indexOf(b));

  const fen = upToPly === undefined ? chess.fen() : upToPly === 0 ? DEFAULT_POSITION : history[history.length - 1].after;
  let balance = 0;
  for (const ch of fen.split(' ')[0]) {
    const lower = ch.toLowerCase() as PieceSymbol;
    if (lower in values) balance += ch === lower ? -values[lower] : values[lower];
  }
  return { captured, advantage: { white: Math.max(0, balance), black: Math.max(0, -balance) } };
}
