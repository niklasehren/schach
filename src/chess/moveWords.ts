/**
 * Züge in Worten: Figur ausgeschrieben, dazu Start- und Zielfeld – „deinen Bauern von h7 nach h6 gezogen“.
 * So ist ein Zug auch ohne Notation eindeutig (für Puzzles, Meldungen und Erklärungen).
 */
import { Chess, type Move, type PieceSymbol } from 'chess.js';

export const pieceNouns: Record<PieceSymbol, { noun: string; acc: string; fem: boolean }> = {
  p: { noun: 'Bauer', acc: 'Bauern', fem: false },
  n: { noun: 'Springer', acc: 'Springer', fem: false },
  b: { noun: 'Läufer', acc: 'Läufer', fem: false },
  r: { noun: 'Turm', acc: 'Turm', fem: false },
  q: { noun: 'Dame', acc: 'Dame', fem: true },
  k: { noun: 'König', acc: 'König', fem: false },
};

type MoveLike = Pick<Move, 'piece' | 'from' | 'to' | 'flags' | 'captured' | 'promotion'>;

/** Wer zieht – bestimmt „deinen“ (ich) bzw. „seinen“ (Gegner) */
export type Mover = 'me' | 'opp';

const possAcc = (t: PieceSymbol, who: Mover) => `${who === 'me' ? 'dein' : 'sein'}${pieceNouns[t].fem ? 'e' : 'en'} ${pieceNouns[t].acc}`;
const isCastle = (m: MoveLike) => m.flags.includes('k') || m.flags.includes('q');

/** Kurzform, z. B. „Läufer von f1 nach c4“, „kurze Rochade“, „Bauer von e7 nach e8 (wird zur Dame)“ */
export function moveNoun(m: MoveLike): string {
  if (isCastle(m)) return m.flags.includes('k') ? 'kurze Rochade' : 'lange Rochade';
  const base = `${pieceNouns[m.piece].noun} von ${m.from} nach ${m.to}`;
  return m.promotion ? `${base} (wird zur ${pieceNouns[m.promotion].noun})` : base;
}

/**
 * Satzteil im Perfekt für „Du hast hier …“ bzw. „Dein Gegner hat zuletzt …“:
 * „deinen Bauern von h7 nach h6 gezogen“, „seinen Läufer von b5 nach c6 gezogen und deinen Springer geschlagen“, „kurz rochiert“
 */
export function movedPhrase(m: MoveLike, who: Mover): string {
  if (isCastle(m)) return m.flags.includes('k') ? 'kurz rochiert' : 'lang rochiert';
  const parts = [`${possAcc(m.piece, who)} von ${m.from} nach ${m.to} gezogen`];
  if (m.captured) parts.push(`${possAcc(m.captured, who === 'me' ? 'opp' : 'me')}${m.flags.includes('e') ? ' en passant' : ''} geschlagen`);
  if (m.promotion) parts.push(`in ${pieceNouns[m.promotion].fem ? 'eine' : 'einen'} ${pieceNouns[m.promotion].acc} umgewandelt`);
  return parts.length === 3 ? `${parts[0]}, ${parts[1]} und ${parts[2]}` : parts.join(' und ');
}

/** UCI-Zug in einer Stellung ausführen (ohne Fehler: null) */
export function uciMove(fen: string, uci: string): Move | null {
  try {
    return new Chess(fen).move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
  } catch {
    return null;
  }
}
