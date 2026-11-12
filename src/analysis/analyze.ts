import { Chess, type Move } from 'chess.js';
import type { Engine, SearchLimit } from '../engine/stockfish';
import type { AnalysisRecord, GameRecord, MoveAnalysis, PositionEval, Side, SideSummary } from '../db/schema';
import { parseClock } from '../chess/format';
import {
  allowedMate,
  baseTimeFrom,
  inTimeTrouble,
  judge,
  materialLossAfterPv,
  missedMate,
  phaseOf,
  pov,
  povChances,
  toPercent,
} from './rules';

/** Standard-Einstellung (gewählt nach Messung, siehe PLAN.md Abschnitt 3) */
export const DEFAULT_LIMIT: SearchLimit = { depth: 16 };

export type ParsedGame = { moves: Move[]; fens: string[]; clocks: (number | null)[]; timeControl: string | null };

/** PGN nachspielen: alle Stellungen (Index 0 = Ausgangsstellung) und Restzeit nach jedem Zug */
export function parseGame(game: Pick<GameRecord, 'pgn' | 'timeControl'>): ParsedGame {
  const chess = new Chess();
  chess.loadPgn(game.pgn);
  const moves = chess.history({ verbose: true });
  const comments = new Map(chess.getComments().map((c) => [c.fen, c.comment]));
  const fens = [moves[0]?.before ?? chess.fen(), ...moves.map((m) => m.after)];
  const header = chess.getHeaders().TimeControl;
  return {
    moves,
    fens,
    clocks: moves.map((m) => parseClock(comments.get(m.after))),
    timeControl: header && header !== '?' ? header : game.timeControl,
  };
}

/** Endstellungen ohne Engine bewerten (Matt, Patt, zu wenig Material) */
function terminalEval(fen: string): PositionEval | null {
  const c = new Chess(fen);
  if (c.isCheckmate()) return { mate: 0, depth: 0 };
  if (c.isStalemate() || c.isInsufficientMaterial()) return { cp: 0, depth: 0 };
  return null;
}

export type EvalProgress = { position: number; positions: number };

/**
 * Bewertet alle Stellungen einer Partie. Bereits vorhandene Bewertungen (Zwischenstand) werden übernommen.
 * Gibt null zurück, wenn shouldStop() zwischendurch true liefert (Pause) – der Zwischenstand steckt dann in onSave.
 */
export async function computeEvals(
  fens: string[],
  engine: Engine,
  limit: SearchLimit,
  opts: {
    resume?: (PositionEval | null)[];
    shouldStop?: () => boolean;
    onProgress?: (p: EvalProgress) => void;
    onSave?: (evals: (PositionEval | null)[]) => Promise<void> | void;
  } = {},
): Promise<PositionEval[] | null> {
  const evals: (PositionEval | null)[] = fens.map((_, i) => opts.resume?.[i] ?? null);
  let unsaved = 0;
  for (let i = 0; i < fens.length; i++) {
    opts.onProgress?.({ position: i, positions: fens.length });
    if (evals[i]) continue;
    if (opts.shouldStop?.()) {
      await opts.onSave?.(evals);
      return null;
    }
    evals[i] = terminalEval(fens[i]) ?? (await engine.evaluate(fens[i], limit));
    if (++unsaved >= 4) {
      unsaved = 0;
      await opts.onSave?.(evals);
    }
  }
  opts.onProgress?.({ position: fens.length, positions: fens.length });
  return evals as PositionEval[];
}

const uciOf = (m: Move) => m.from + m.to + (m.promotion ?? '');

function sanOf(fen: string, uci?: string): string | undefined {
  if (!uci) return undefined;
  try {
    return new Chess(fen).move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }).san;
  } catch {
    return undefined;
  }
}

/** Aus den Bewertungen aller Stellungen: Klasse und Merkmale jedes Zuges, getrennt nach Farbe */
export function buildAnalysis(game: GameRecord, parsed: ParsedGame, evals: PositionEval[]) {
  const base = baseTimeFrom(parsed.timeControl, game.timeClass);
  const sides: Record<Side, MoveAnalysis[]> = { white: [], black: [] };
  const lastClock: Record<Side, number | null> = { white: base, black: base };

  parsed.moves.forEach((m, i) => {
    const mover: Side = m.color === 'w' ? 'white' : 'black';
    const fenBefore = parsed.fens[i];
    const fenAfter = parsed.fens[i + 1];
    const before = pov(evals[i], mover);
    const after = pov(evals[i + 1], mover);
    const j = judge(before, after);
    const winBefore = toPercent(povChances(before));
    // In einer Mattstellung nach meinem Zug ist der Gegner matt: für mich 100 %
    const winAfter = toPercent(povChances(after, false));
    const isError = j?.class === 'mistake' || j?.class === 'blunder';
    const clockBefore = parsed.clocks.some((c) => c !== null) ? lastClock[mover] : null;
    if (parsed.clocks[i] !== null) lastClock[mover] = parsed.clocks[i];
    const best = evals[i].best;
    sides[mover].push({
      ply: i + 1,
      san: m.san,
      uci: uciOf(m),
      best,
      bestSan: sanOf(fenBefore, best),
      winBefore: round1(winBefore),
      winAfter: round1(winAfter),
      loss: round1(Math.max(0, winBefore - winAfter)),
      class: j?.class,
      phase: phaseOf(fenBefore),
      hanging: isError && materialLossAfterPv(fenBefore, fenAfter, evals[i + 1].pv, mover) >= 2,
      missedMate: missedMate(before, after),
      allowedMate: allowedMate(before, after),
      clock: clockBefore,
      timeTrouble: inTimeTrouble(clockBefore, base),
    });
  });

  return { sides, summary: { white: summarize(sides.white), black: summarize(sides.black) }, baseTime: base };
}

const round1 = (x: number) => Math.round(x * 10) / 10;

export function summarize(moves: MoveAnalysis[]): SideSummary {
  const count = (f: (m: MoveAnalysis) => boolean) => moves.filter(f).length;
  const errors = moves.filter((m) => m.class === 'mistake' || m.class === 'blunder');
  return {
    moves: moves.length,
    inaccuracies: count((m) => m.class === 'inaccuracy'),
    mistakes: count((m) => m.class === 'mistake'),
    blunders: count((m) => m.class === 'blunder'),
    hanging: count((m) => m.hanging),
    missedMates: count((m) => m.missedMate),
    allowedMates: count((m) => m.allowedMate),
    errors: errors.length,
    errorsInTimeTrouble: errors.filter((m) => m.timeTrouble === true).length,
    timeTroubleKnown: moves.some((m) => m.timeTrouble !== null),
    avgLoss: moves.length ? round1(moves.reduce((s, m) => s + m.loss, 0) / moves.length) : 0,
  };
}

/** Komplette Analyse einer Partie mit der Engine (für Tests und die Warteschlange) */
export async function analyseGame(
  game: GameRecord,
  engine: Engine,
  limit: SearchLimit = DEFAULT_LIMIT,
  opts: Parameters<typeof computeEvals>[3] & { engineName?: string; previousMs?: number } = {},
): Promise<AnalysisRecord | null> {
  const parsed = parseGame(game);
  // Engine-Speicher leeren: gleiche Partie → gleiches Ergebnis, unabhängig von der Partie davor
  await engine.newGame();
  const started = performance.now();
  const evals = await computeEvals(parsed.fens, engine, limit, opts);
  if (!evals) return null;
  const built = buildAnalysis(game, parsed, evals);
  const now = Date.now();
  return {
    gameId: game.id,
    createdAt: now,
    updatedAt: now,
    status: 'done',
    engine: opts.engineName ?? 'Stockfish 19 Lite',
    limit,
    evals,
    myColor: game.myColor,
    timeClass: game.timeClass ?? null,
    baseTime: built.baseTime,
    sides: built.sides,
    summary: built.summary,
    ms: Math.round((opts.previousMs ?? 0) + performance.now() - started),
  };
}

const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** Kurze Zusammenfassung, z. B. „2 Patzer, 1 Figur eingestellt, 3 von 4 Fehlern in Zeitnot“ */
export function summaryText(s: SideSummary): string {
  const parts: string[] = [];
  if (s.blunders) parts.push(n(s.blunders, 'Patzer', 'Patzer'));
  if (s.mistakes) parts.push(n(s.mistakes, 'Fehler', 'Fehler'));
  if (s.inaccuracies) parts.push(n(s.inaccuracies, 'Ungenauigkeit', 'Ungenauigkeiten'));
  if (s.hanging) parts.push(s.hanging === 1 ? '1 Figur eingestellt' : `${s.hanging} Figuren eingestellt`);
  if (s.missedMates) parts.push(`${s.missedMates}× Matt übersehen`);
  if (s.allowedMates) parts.push(`${s.allowedMates}× Matt zugelassen`);
  if (s.timeTroubleKnown && s.errors > 0) parts.push(`${s.errorsInTimeTrouble} von ${n(s.errors, 'Fehler', 'Fehlern')} in Zeitnot`);
  return parts.length ? parts.join(', ') : 'Keine Fehler und keine Ungenauigkeiten';
}
