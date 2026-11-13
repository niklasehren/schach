import type { AnalysisRecord, GameRecord, MoveAnalysis, Phase, Side } from '../db/schema';
import { boardFindings, type BoardFinding } from '../db/boardGames';
import { decisiveError, gameAccuracy } from './accuracy';
import { openingOf } from './openings';

/**
 * Statistik (Block 9): ehrliche Auswertung meiner Partien. Alles hier ist reine Rechnung (ohne Datenbank) und getestet.
 * Grundregeln: Jede Zahl kommt mit der Anzahl Partien; unter MIN_GAMES Partien in einer Gruppe gibt es kein Urteil.
 */

export const MIN_GAMES = 10;
const DAY = 86_400_000;

/** Fehlerarten, die „übersehen“ bedeuten (Taktik nicht gesehen) */
export const OVERSIGHT_TYPES = ['threatMissed', 'undefended', 'fork', 'pieceTaken', 'mateAllowed', 'mateMissed'];
/** Fehlerarten, bei denen Material verloren geht */
export const MATERIAL_TYPES = ['pieceTaken', 'undefended', 'fork'];

export type GameFact = {
  id: string;
  date: number;
  source: GameRecord['source'];
  /** null = ohne Zeitklasse (App-Partie, Brettpartie) */
  timeClass: string | null;
  myColor: Side;
  result: 'win' | 'loss' | 'draw';
  /** 1 / ½ / 0 */
  score: number;
  opening: string | null;
  /** Fertig analysiert (dann gibt es moves, blunders, accuracy …) */
  analysed: boolean;
  /** Meine Züge aus der Analyse */
  moves: MoveAnalysis[];
  blunders: number;
  mistakes: number;
  /** Meine Fehler und Patzer */
  errors: MoveAnalysis[];
  accuracy: number | null;
  /** Nur bei Niederlagen: entscheidender Fehler (null = keiner gefunden) */
  decisive: MoveAnalysis | null;
  /** Partie mit Uhr: Zeitnot bestimmbar */
  clock: boolean;
  /** Grundzeit in Sekunden (für „Restzeit“) */
  baseTime: number | null;
  /** Brettpartien: eigene Gründe */
  board: GameRecord['board'];
  findings: BoardFinding[];
};

/** Fasst Partie und Analyse zusammen; null für Partien ohne eigene Farbe (Gegen Freund) */
export function gameFact(g: GameRecord, a: AnalysisRecord | undefined, opening: string | null = openingOf(g)): GameFact | null {
  if (!g.myColor || !g.myResult) return null;
  const me = g.myColor;
  const done = a?.status === 'done' && !!a.sides && !!a.summary;
  const moves = done ? a!.sides![me] : [];
  const errors = moves.filter((m) => m.class === 'mistake' || m.class === 'blunder');
  const acc = done ? gameAccuracy(a!.evals) : null;
  return {
    id: g.id,
    date: g.date,
    source: g.source,
    timeClass: g.timeClass ?? null,
    myColor: me,
    result: g.myResult,
    score: g.myResult === 'win' ? 1 : g.myResult === 'draw' ? 0.5 : 0,
    opening,
    analysed: done,
    moves,
    blunders: moves.filter((m) => m.class === 'blunder').length,
    mistakes: moves.filter((m) => m.class === 'mistake').length,
    errors,
    accuracy: acc ? acc[me] : null,
    decisive: done && g.myResult === 'loss' ? decisiveError(a!.sides!, me) : null,
    clock: done && moves.some((m) => m.timeTrouble !== null),
    baseTime: done ? a!.baseTime : null,
    board: g.board,
    findings: g.source === 'brett' ? boardFindings(g) : [],
  };
}

export type Period = '4w' | 'all';
export type Filter = { period: Period; timeClass: string };

export function applyFilter(facts: GameFact[], f: Filter, now: number): GameFact[] {
  const from = f.period === '4w' ? now - 28 * DAY : -Infinity;
  return facts.filter((x) => x.date >= from && x.date <= now && (f.timeClass === 'all' || x.timeClass === f.timeClass));
}

/* ---------- Kennzahlen ---------- */

export type Stat = { value: number | null; n: number };

const avg = (xs: number[]): number | null => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);

/** Punkte-Quote in Prozent (Sieg 1, Remis ½) über alle Partien der Gruppe */
export const scoreRate = (gs: GameFact[]): Stat => ({ value: gs.length ? (100 * gs.reduce((s, g) => s + g.score, 0)) / gs.length : null, n: gs.length });
/** Patzer pro analysierter Partie */
export const blundersPerGame = (gs: GameFact[]): Stat => {
  const a = gs.filter((g) => g.analysed);
  return { value: avg(a.map((g) => g.blunders)), n: a.length };
};
/** Fehler + Patzer pro analysierter Partie */
export const errorsPerGame = (gs: GameFact[]): Stat => {
  const a = gs.filter((g) => g.analysed);
  return { value: avg(a.map((g) => g.errors.length)), n: a.length };
};
/** Durchschnittliche Genauigkeit (Lichess-Formel) */
export const accuracyOf = (gs: GameFact[]): Stat => {
  const a = gs.filter((g) => g.accuracy !== null);
  return { value: avg(a.map((g) => g.accuracy!)), n: a.length };
};
/** Fehler mit Materialverlust pro analysierter Partie (eingestellt, ungedeckt, Gabel) */
export const materialErrorsPerGame = (gs: GameFact[]): Stat => {
  const a = gs.filter((g) => g.analysed);
  return { value: avg(a.map((g) => g.errors.filter(isMaterialError).length)), n: a.length };
};
export const isMaterialError = (m: MoveAnalysis) => m.hanging || MATERIAL_TYPES.includes(m.errorType ?? '');

/** Häufigste Fehlerart (konkrete vor „Stellungsfehler“); null ohne Fehler */
export function topErrorType(gs: GameFact[]): { type: string; count: number } | null {
  const counts = new Map<string, number>();
  for (const g of gs) for (const m of g.errors) if (m.errorType) counts.set(m.errorType, (counts.get(m.errorType) ?? 0) + 1);
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const concrete = sorted.find(([t]) => t !== 'other');
  const pick = concrete ?? sorted[0];
  return pick ? { type: pick[0], count: pick[1] } : null;
}

/* ---------- Zeitnot ---------- */

export type MoveRate = { errors: number; blunders: number; moves: number; games: number; rate: number | null; blunderRate: number | null };

function moveRate(pairs: { g: GameFact; m: MoveAnalysis }[]): MoveRate {
  const errors = pairs.filter((p) => p.m.class === 'mistake' || p.m.class === 'blunder').length;
  const blunders = pairs.filter((p) => p.m.class === 'blunder').length;
  return {
    errors,
    blunders,
    moves: pairs.length,
    games: new Set(pairs.map((p) => p.g.id)).size,
    rate: pairs.length ? (100 * errors) / pairs.length : null,
    blunderRate: pairs.length ? (100 * blunders) / pairs.length : null,
  };
}

/** Fehlerquote pro Zug in Zeitnot (< 10 % Restzeit) gegenüber sonst – nur Partien mit Uhr */
export function timeTroubleRates(gs: GameFact[]): { trouble: MoveRate; normal: MoveRate; clockGames: number } {
  const withClock = gs.filter((g) => g.clock);
  const pairs = withClock.flatMap((g) => g.moves.filter((m) => m.timeTrouble !== null).map((m) => ({ g, m })));
  return { trouble: moveRate(pairs.filter((p) => p.m.timeTrouble)), normal: moveRate(pairs.filter((p) => !p.m.timeTrouble)), clockGames: withClock.length };
}

export const CLOCK_BUCKETS = [
  { key: 'lt10', label: 'unter 10 %', min: 0, max: 0.1 },
  { key: '10-25', label: '10–25 %', min: 0.1, max: 0.25 },
  { key: '25-50', label: '25–50 %', min: 0.25, max: 0.5 },
  { key: 'gt50', label: 'über 50 %', min: 0.5, max: Infinity },
] as const;

/** Fehlerquote nach Restzeit (Anteil der Grundzeit vor dem Zug) */
export function clockBuckets(gs: GameFact[]): ({ key: string; label: string } & MoveRate)[] {
  const pairs = gs.filter((g) => g.clock && g.baseTime).flatMap((g) => g.moves.filter((m) => m.clock !== null).map((m) => ({ g, m, share: m.clock! / g.baseTime! })));
  return CLOCK_BUCKETS.map((b) => ({ key: b.key, label: b.label, ...moveRate(pairs.filter((p) => p.share >= b.min && p.share < b.max)) }));
}

/* ---------- Spielphasen ---------- */

export const PHASES: Phase[] = ['opening', 'middlegame', 'endgame'];

export type PhaseRow = { phase: Phase; moves: number; errors: number; rate: number | null; decisive: number };

/** Fehler und entscheidende Fehler je Phase (nur analysierte Partien) */
export function phaseRows(gs: GameFact[]): { rows: PhaseRow[]; losses: number; noDecisive: number } {
  const a = gs.filter((g) => g.analysed);
  const losses = a.filter((g) => g.result === 'loss');
  const rows = PHASES.map((phase) => {
    const moves = a.flatMap((g) => g.moves.filter((m) => m.phase === phase));
    const errors = moves.filter((m) => m.class === 'mistake' || m.class === 'blunder').length;
    return { phase, moves: moves.length, errors, rate: moves.length ? (100 * errors) / moves.length : null, decisive: losses.filter((g) => g.decisive?.phase === phase).length };
  });
  return { rows, losses: losses.length, noDecisive: losses.filter((g) => !g.decisive).length };
}

/** Brettpartien: wo entschieden (eigene Angabe) bei Niederlagen */
export function boardDecided(gs: GameFact[]): { phase: Phase | null; count: number }[] {
  const losses = gs.filter((g) => g.source === 'brett' && g.result === 'loss' && g.board);
  return [...PHASES, null].map((phase) => ({ phase, count: losses.filter((g) => (g.board!.decidedIn ?? null) === phase).length }));
}

/* ---------- Eröffnungen ---------- */

export type OpeningRow = { family: string; color: Side; games: number; analysed: number; score: number | null; blunders: number | null; topError: string | null };

export function openingRows(gs: GameFact[]): OpeningRow[] {
  const groups = new Map<string, GameFact[]>();
  for (const g of gs) {
    if (!g.opening) continue;
    const k = `${g.myColor}|${g.opening}`;
    groups.set(k, [...(groups.get(k) ?? []), g]);
  }
  return [...groups.entries()]
    .map(([k, list]) => {
      const [color, family] = k.split('|') as [Side, string];
      const b = blundersPerGame(list);
      return { family, color, games: list.length, analysed: b.n, score: scoreRate(list).value, blunders: b.value, topError: topErrorType(list)?.type ?? null };
    })
    .sort((x, y) => y.games - x.games || x.family.localeCompare(y.family));
}

/* ---------- Fortschritt ---------- */

/** Montag 0:00 der Woche (lokale Zeit) */
export function weekStart(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}

export type WeekRow = { week: number; games: number; blunders: number | null; accuracy: number | null };

/** Patzer pro Partie und Genauigkeit je Kalenderwoche (nur Wochen mit analysierten Partien) */
export function weekly(gs: GameFact[]): WeekRow[] {
  const by = new Map<number, GameFact[]>();
  for (const g of gs.filter((x) => x.analysed)) {
    const w = weekStart(g.date);
    by.set(w, [...(by.get(w) ?? []), g]);
  }
  return [...by.entries()].sort((a, b) => a[0] - b[0]).map(([week, list]) => ({ week, games: list.length, blunders: blundersPerGame(list).value, accuracy: accuracyOf(list).value }));
}

/* ---------- Zeitklassen und Quellen ---------- */

export type ClassRow = { timeClass: string; games: number; analysed: number; score: number | null; blunders: number | null; accuracy: number | null };

export function timeClassRows(gs: GameFact[]): ClassRow[] {
  const by = new Map<string, GameFact[]>();
  for (const g of gs) if (g.timeClass) by.set(g.timeClass, [...(by.get(g.timeClass) ?? []), g]);
  const order = ['bullet', 'blitz', 'rapid', 'classical', 'daily'];
  return [...by.entries()]
    .sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]))
    .map(([timeClass, list]) => ({ timeClass, games: list.length, analysed: blundersPerGame(list).n, score: scoreRate(list).value, blunders: blundersPerGame(list).value, accuracy: accuracyOf(list).value }));
}

/** Fehlerarten, die man auch am Brett angeben kann, plus Zeitnot */
export const SOURCE_COMPARE = ['pieceTaken', 'threatMissed', 'mateMissed', 'mateAllowed', 'timeTrouble'] as const;

export type SourceColumn = { games: number; score: number | null; shares: Record<(typeof SOURCE_COMPARE)[number], number | null> };

/**
 * Chess.com gegen Brett: Anteil Partien mit dieser Fehlerart. Chess.com aus der Analyse (Material eingestellt umfasst
 * hier auch ungedeckt und Gabel), Brett nur aus den eigenen Gründen.
 */
export function sourceCompare(gs: GameFact[]): { chesscom: SourceColumn; board: SourceColumn } {
  const cc = gs.filter((g) => g.source === 'chesscom' && g.analysed);
  const bd = gs.filter((g) => g.source === 'brett' && g.board);
  const share = (list: GameFact[], pred: (g: GameFact) => boolean) => (list.length ? (100 * list.filter(pred).length) / list.length : null);
  const ccHas = (g: GameFact, t: string) =>
    t === 'timeTrouble' ? g.errors.some((m) => m.timeTrouble) : t === 'pieceTaken' ? g.errors.some(isMaterialError) : g.errors.some((m) => m.errorType === t);
  const bdHas = (g: GameFact, t: string) => (t === 'timeTrouble' ? g.board!.reasons.includes('timeTrouble') : g.findings.some((f) => f.errorType === t));
  const col = (list: GameFact[], has: (g: GameFact, t: string) => boolean): SourceColumn => ({
    games: list.length,
    score: scoreRate(list).value,
    shares: Object.fromEntries(SOURCE_COMPARE.map((t) => [t, share(list, (g) => has(g, t))])) as SourceColumn['shares'],
  });
  return { chesscom: col(cc, ccHas), board: col(bd, bdHas) };
}
