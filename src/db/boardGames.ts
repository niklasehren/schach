import type { Chess } from 'chess.js';
import { parseMoveInput } from '../chess/pgnInput';
import { db as defaultDb, type BoardEntry, type BoardOccasion, type BoardReason, type GameRecord, type Phase, type SchachDB, type Side } from './schema';
import { myResultOf, newId, pgnDate } from './games';

/** Brettpartien am echten Brett (Schritt 12): Schnell-Eintrag, optional mit Zügen */

export const OCCASION_LABELS: Record<BoardOccasion, string> = {
  schulliga: 'Schülerliga',
  freunde: 'Mit Freunden',
  turnier: 'Turnier',
  sonstiges: 'Sonstiges',
};

export const REASON_LABELS: Record<BoardReason, string> = {
  pieceBlunder: 'Figur eingestellt',
  threatMissed: 'Drohung übersehen',
  mateMissed: 'Matt übersehen',
  mateAllowed: 'Matt zugelassen',
  timeTrouble: 'Zeitnot',
  badOpening: 'Eröffnung schlecht',
  endgameUnknown: 'Endspiel nicht gewusst',
  opponentError: 'Gegner hat Fehler gemacht',
  playedWell: 'Gut gespielt',
};

export const PHASE_LABELS: Record<Phase, string> = { opening: 'Eröffnung', middlegame: 'Mittelspiel', endgame: 'Endspiel' };

/**
 * Zuordnung der Gründe zu den Fehlerarten der Analyse (ERROR_TYPE_LABELS in analysis/errorTypes.ts), damit
 * die Statistik (Block 9) Brettpartien und analysierte Partien zusammenführen kann. Siehe PLAN.md, Abschnitt 4c.
 * - errorType: Fehlerart wie bei MoveAnalysis.errorType (null = kein eigener Fehler)
 * - phase: feste Phase des Grundes; sonst gilt „Wo entschieden“
 * - timeTrouble: der Fehler passierte in Zeitnot
 * - mine: zählt als eigener Fehler (false = Einschätzung ohne eigenen Fehler)
 */
export const REASON_MAPPING: Record<BoardReason, { errorType: string | null; phase?: Phase; timeTrouble?: true; mine: boolean }> = {
  pieceBlunder: { errorType: 'pieceTaken', mine: true },
  threatMissed: { errorType: 'threatMissed', mine: true },
  mateMissed: { errorType: 'mateMissed', mine: true },
  mateAllowed: { errorType: 'mateAllowed', mine: true },
  timeTrouble: { errorType: null, timeTrouble: true, mine: true },
  badOpening: { errorType: 'other', phase: 'opening', mine: true },
  endgameUnknown: { errorType: 'other', phase: 'endgame', mine: true },
  opponentError: { errorType: null, mine: false },
  playedWell: { errorType: null, mine: false },
};

/** Ein eigener Fehler aus einem Brett-Eintrag – dieselben Felder wie ein Fehler aus der Analyse */
export type BoardFinding = { gameId: string; reason: BoardReason; errorType: string; phase: Phase | null; timeTrouble: boolean };

/**
 * Eigene Fehler eines Brett-Eintrags im Format der Analyse-Fehler (für die Statistik).
 * „Zeitnot“ ist keine eigene Fehlerart, sondern markiert die übrigen Fehler; steht sie allein, zählt sie als ein Fehler ohne Art („other“).
 */
export function boardFindings(game: GameRecord): BoardFinding[] {
  const b = game.board;
  if (!b) return [];
  const timeTrouble = b.reasons.includes('timeTrouble');
  const out: BoardFinding[] = [];
  for (const r of b.reasons) {
    const m = REASON_MAPPING[r];
    if (!m.mine || !m.errorType) continue;
    out.push({ gameId: game.id, reason: r, errorType: m.errorType, phase: m.phase ?? b.decidedIn, timeTrouble });
  }
  if (timeTrouble && out.length === 0) out.push({ gameId: game.id, reason: 'timeTrouble', errorType: 'other', phase: b.decidedIn, timeTrouble: true });
  return out;
}

export type BoardForm = {
  /** Tag der Partie als „JJJJ-MM-TT“ */
  day: string;
  opponent: string;
  occasion: BoardOccasion;
  myColor: Side;
  myResult: 'win' | 'draw' | 'loss';
  decidedIn: BoardEntry['decidedIn'];
  reasons: BoardReason[];
  note: string;
  /** Optional eingefügte Züge (PGN oder nur Zugtext) */
  pgn: string;
};

export const todayKey = (now = Date.now()) => {
  const d = new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Zeitpunkt der Partie: heute = jetzt (Reihenfolge der Einträge bleibt), sonst 18 Uhr an dem Tag */
export function dateOf(day: string, now = Date.now()): number {
  if (day === todayKey(now)) return now;
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d, 18, 0, 0).getTime();
}

export { MoveInputError as PgnError } from '../chess/pgnInput';

/** Züge prüfen (deutsche, englische oder gemischte Schreibweise); leerer Text = keine Züge. Wirft PgnError mit Zugnummer. */
export const readMoves = (text: string): Chess | null => parseMoveInput(text);

const scoreFor = (myColor: Side, r: BoardForm['myResult']): GameRecord['result'] =>
  r === 'draw' ? '1/2-1/2' : (r === 'win') === (myColor === 'white') ? '1-0' : '0-1';

/** Baut den Datensatz aus dem Formular. Wirft PgnError bei unlesbaren Zügen. */
export function buildBoardGame(form: BoardForm, opts: { myName: string; existing?: GameRecord; now?: number }): GameRecord {
  const now = opts.now ?? Date.now();
  const opponent = form.opponent.trim() || 'Gegner';
  const result = scoreFor(form.myColor, form.myResult);
  const white = form.myColor === 'white' ? opts.myName : opponent;
  const black = form.myColor === 'white' ? opponent : opts.myName;
  const date = opts.existing && todayKey(opts.existing.date) === form.day ? opts.existing.date : dateOf(form.day, now);

  const chess = readMoves(form.pgn);
  let pgn = '';
  if (chess) {
    chess.setHeader('Event', OCCASION_LABELS[form.occasion]);
    chess.setHeader('Site', 'Am Brett');
    chess.setHeader('Date', pgnDate(new Date(date)));
    chess.setHeader('White', white);
    chess.setHeader('Black', black);
    chess.setHeader('Result', result);
    pgn = chess.pgn();
  }
  const board: BoardEntry = {
    occasion: form.occasion,
    decidedIn: form.decidedIn,
    reasons: [...new Set(form.reasons)],
    ...(form.note.trim() ? { note: form.note.trim() } : {}),
  };
  const termination: GameRecord['termination'] = chess?.isCheckmate() ? 'checkmate' : chess?.isStalemate() ? 'stalemate' : 'other';
  return {
    id: opts.existing?.id ?? newId(),
    userId: opts.existing?.userId ?? null,
    createdAt: opts.existing?.createdAt ?? now,
    updatedAt: now,
    date,
    source: 'brett',
    mode: 'board',
    white: { name: white },
    black: { name: black },
    myColor: form.myColor,
    myResult: myResultOf(result, form.myColor),
    result,
    termination,
    timeControl: null,
    pgn,
    plies: chess ? chess.history().length : 0,
    board,
  };
}

/** Formular aus einem gespeicherten Eintrag (zum Bearbeiten) */
export function formOf(game: GameRecord): BoardForm {
  const myColor = game.myColor ?? 'white';
  return {
    day: todayKey(game.date),
    opponent: myColor === 'white' ? game.black.name : game.white.name,
    occasion: game.board?.occasion ?? 'sonstiges',
    myColor,
    myResult: game.myResult ?? 'draw',
    decidedIn: game.board?.decidedIn ?? null,
    reasons: game.board?.reasons ?? [],
    note: game.board?.note ?? '',
    pgn: game.pgn,
  };
}

export const hasMoves = (g: Pick<GameRecord, 'plies' | 'pgn'>) => g.plies > 0 && g.pgn.trim() !== '';

/**
 * Speichert einen neuen oder geänderten Brett-Eintrag. Ändern sich Züge oder Farbe, werden Analyse und daraus
 * entstandene Puzzles verworfen; die Partie wird dann neu analysiert (sofern sie Züge hat).
 */
export async function saveBoardGame(game: GameRecord, d: SchachDB = defaultDb): Promise<string> {
  await d.transaction('rw', [d.games, d.analyses, d.puzzles], async () => {
    const old = await d.games.get(game.id);
    if (old && (old.pgn !== game.pgn || old.myColor !== game.myColor)) {
      await d.analyses.delete(game.id);
      await d.puzzles.where('gameId').equals(game.id).delete();
    }
    await d.games.put(game);
  });
  return game.id;
}

/** Löscht den Eintrag samt Analyse und Puzzles (die Löschung wird mit dem Konto abgeglichen) */
export async function deleteBoardGame(id: string, d: SchachDB = defaultDb): Promise<void> {
  await d.transaction('rw', [d.games, d.analyses, d.puzzles], async () => {
    await d.analyses.delete(id);
    await d.puzzles.where('gameId').equals(id).delete();
    await d.games.delete(id);
  });
}

/** Gegner aus früheren Brett-Einträgen, zuletzt gespielte zuerst (ohne Doppelte, ohne Platzhalter „Gegner“) */
export async function recentOpponents(limit = 8, d: SchachDB = defaultDb): Promise<string[]> {
  const games = await d.games.where('source').equals('brett').toArray();
  games.sort((a, b) => b.date - a.date);
  const seen = new Map<string, string>();
  for (const g of games) {
    const name = (g.myColor === 'black' ? g.white.name : g.black.name).trim();
    const key = name.toLocaleLowerCase('de');
    if (!name || key === 'gegner' || seen.has(key)) continue;
    seen.set(key, name);
    if (seen.size >= limit) break;
  }
  return [...seen.values()];
}
