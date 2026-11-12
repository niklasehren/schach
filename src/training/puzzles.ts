import { Chess } from 'chess.js';
import type { AnalysisRecord, GameRecord, PositionEval, PuzzleRecord, Side } from '../db/schema';
import { pov, povChances, toPercent } from '../analysis/rules';

/** Stellungen, in denen ich vorher schon klar verloren stand, werden kein Puzzle */
export const MIN_WIN_BEFORE = 10;

/**
 * „Fast gleich gut“: Ein anderer Zug zählt als richtig, wenn er höchstens 3 Prozentpunkte Gewinnchance
 * weniger bringt als der beste Zug. Das liegt deutlich unter der Grenze für eine Ungenauigkeit (5 Punkte),
 * lässt aber Spielraum für das Rauschen der Engine bei Tiefe 16. Matt setzen ist immer richtig.
 */
export const ACCEPT_LOSS = 3;

/** Höchstens so viele eigene Züge hat eine Lösung */
const MAX_MY_MOVES = 3;

/** FEN ohne Halbzug- und Zugzähler: gleiche Stellung = gleicher Schlüssel */
export const fenKey = (fen: string) => fen.split(' ').slice(0, 4).join(' ');

/** Gewinnchance (0–100) aus Sicht einer Farbe; in einer Mattstellung ist die Seite am Zug matt */
export function winFor(ev: Pick<PositionEval, 'cp' | 'mate'>, side: Side, fen: string): number {
  if (ev.mate === 0) {
    const toMove: Side = fen.split(' ')[1] === 'w' ? 'white' : 'black';
    return toMove === side ? 0 : 100;
  }
  return toPercent(povChances(pov(ev, side)));
}

export function isAcceptable(bestWin: number, moveWin: number, deliversMate: boolean): boolean {
  return deliversMate || bestWin - moveWin <= ACCEPT_LOSS;
}

/**
 * Lösungslinie aus der Engine-Variante. Ruhige Züge: nur der erste Zug.
 * Taktik (Schach, Schlagzug, Matt): weiter, solange meine Züge forcierend sind (Schach/Schlagen), höchstens 3 eigene Züge;
 * bei erzwungenem Matt bis zum Matt.
 */
export function solutionLine(fen: string, pv: string[], mate?: number): string[] {
  const chess = new Chess(fen);
  const out: string[] = [];
  let mine = 0;
  for (let i = 0; i < pv.length; i++) {
    const uci = pv[i];
    let m;
    try {
      m = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    } catch {
      break;
    }
    const myMove = i % 2 === 0;
    if (myMove) {
      const forcing = m.san.includes('+') || m.san.includes('#') || !!m.captured;
      const matingLine = mate !== undefined && mate > 0;
      // Ab dem zweiten eigenen Zug nur weiter, wenn er forcierend ist (bzw. zum Matt gehört)
      if (mine > 0 && !forcing && !matingLine) break;
      out.push(uci);
      mine++;
      if (m.san.includes('#') || mine >= (matingLine ? Math.max(MAX_MY_MOVES, mate!) : MAX_MY_MOVES)) break;
      // Erster Zug ruhig: Lösung ist nur dieser eine Zug
      if (mine === 1 && !forcing && !matingLine) break;
    } else {
      // Antwort des Gegners nur aufnehmen, wenn danach noch ein eigener Zug folgt
      if (i + 1 >= pv.length) break;
      out.push(uci);
    }
  }
  // Eine Linie endet immer mit meinem Zug
  if (out.length % 2 === 0) out.pop();
  return out;
}

/** Puzzles einer analysierten Partie: Stellung vor jedem meiner Fehler und Patzer */
export function buildPuzzles(game: GameRecord, analysis: AnalysisRecord, now = Date.now()): PuzzleRecord[] {
  if (!game.myColor || analysis.status !== 'done' || !analysis.sides) return [];
  const chess = new Chess();
  chess.loadPgn(game.pgn);
  const moves = chess.history({ verbose: true });
  const fens = [moves[0]?.before ?? chess.fen(), ...moves.map((m) => m.after)];
  const out: PuzzleRecord[] = [];
  for (const m of analysis.sides[game.myColor]) {
    if (m.class !== 'mistake' && m.class !== 'blunder') continue;
    if (m.winBefore < MIN_WIN_BEFORE) continue;
    const ev = analysis.evals[m.ply - 1];
    const fen = fens[m.ply - 1];
    const pv = ev?.pv?.length ? ev.pv : m.best ? [m.best] : [];
    if (!ev || !fen || pv.length === 0) continue;
    const line = solutionLine(fen, pv, ev.mate !== undefined ? (game.myColor === 'white' ? ev.mate : -ev.mate) : undefined);
    if (line.length === 0) continue;
    out.push({
      id: `${game.id}:${m.ply}`,
      userId: null,
      createdAt: now,
      gameId: game.id,
      gameDate: game.date,
      ply: m.ply,
      fen,
      fenKey: fenKey(fen),
      played: m.uci,
      line,
      class: m.class,
      winBefore: m.winBefore,
      box: 0,
      due: null,
      firstSeen: null,
    });
  }
  return out;
}

/** Doppelte Stellungen herausfiltern (gegen vorhandene und innerhalb der Liste) */
export function dedupe(candidates: PuzzleRecord[], existingKeys: Set<string>, existingIds: Set<string>): PuzzleRecord[] {
  const keys = new Set(existingKeys);
  const out: PuzzleRecord[] = [];
  for (const p of candidates) {
    if (existingIds.has(p.id) || keys.has(p.fenKey)) continue;
    keys.add(p.fenKey);
    out.push(p);
  }
  return out;
}
