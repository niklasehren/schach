import { describe, expect, it } from 'vitest';
import type { AnalysisRecord, GameRecord, MoveAnalysis, Phase, PuzzleRecord, Side } from '../../src/db/schema';
import { decisiveError, gameAccuracy, moveAccuracy, winPercentFromCp } from '../../src/stats/accuracy';
import {
  applyFilter,
  clockBuckets,
  gameFact,
  MIN_GAMES,
  openingRows,
  phaseRows,
  sourceCompare,
  timeTroubleRates,
  weekly,
  weekStart,
  type GameFact,
} from '../../src/stats/insights';
import { evaluate, initialHypotheses, SUGGESTIONS, verdictOf, type Hypothesis } from '../../src/stats/hypotheses';
import { familyFromEco, familyFromPgn, openingLabel, openingOf } from '../../src/stats/openings';
import { filterQuery, href, parseRoute } from '../../src/app/router';
import { filteredQueue, matchesFilter, tagPuzzles } from '../../src/training/filter';

const DAY = 86_400_000;
const NOW = new Date(2026, 10, 13, 12).getTime();

/** Ein Zug aus Sicht des Ziehenden */
function mv(ply: number, winBefore: number, winAfter: number, o: Partial<MoveAnalysis> = {}): MoveAnalysis {
  const loss = Math.max(0, winBefore - winAfter);
  const cls = loss >= 15 ? 'blunder' : loss >= 10 ? 'mistake' : loss >= 5 ? 'inaccuracy' : undefined;
  return { ply, san: 'x', uci: 'a1a2', winBefore, winAfter, loss, class: cls, phase: 'middlegame', hanging: false, missedMate: false, allowedMate: false, clock: null, timeTrouble: null, ...o };
}

/** Partie-Fakt direkt (ohne Datenbank) */
function fact(o: Partial<GameFact> & { id?: string } = {}): GameFact {
  const moves = o.moves ?? [];
  const errors = moves.filter((m) => m.class === 'mistake' || m.class === 'blunder');
  return {
    id: o.id ?? Math.random().toString(36).slice(2),
    date: NOW - DAY,
    source: 'chesscom',
    timeClass: 'rapid',
    myColor: 'white',
    result: 'loss',
    score: 0,
    opening: null,
    analysed: true,
    moves,
    blunders: moves.filter((m) => m.class === 'blunder').length,
    mistakes: moves.filter((m) => m.class === 'mistake').length,
    errors,
    accuracy: 70,
    decisive: null,
    clock: moves.some((m) => m.timeTrouble !== null),
    baseTime: 600,
    board: undefined,
    findings: [],
    ...o,
  } as GameFact;
}

const many = (n: number, o: Partial<GameFact> | ((i: number) => Partial<GameFact>)) => Array.from({ length: n }, (_, i) => fact(typeof o === 'function' ? o(i) : o));
const scoreOf = (r: GameFact['result']) => (r === 'win' ? 1 : r === 'draw' ? 0.5 : 0);

describe('Entscheidender Fehler', () => {
  it('erster eigener Fehler, nach dem die Gewinnchance nie mehr über 50 % kam', () => {
    const sides = {
      // Weiß (ich): Patzer in Zug 5 bei 60 → 40, aber danach wieder 55 % → nicht entscheidend; Fehler in Zug 9 → 38, danach nie mehr über 50
      white: [mv(1, 50, 50), mv(5, 60, 40, { phase: 'opening' }), mv(7, 55, 55), mv(9, 52, 38, { phase: 'endgame', errorType: 'threatMissed' }), mv(11, 30, 20)],
      // Gegner: Gewinnchance aus seiner Sicht
      black: [mv(2, 50, 50), mv(6, 60, 45), mv(8, 45, 48), mv(10, 62, 62)],
    };
    const d = decisiveError(sides, 'white');
    expect(d?.ply).toBe(9);
    expect(d?.phase).toBe('endgame');
  });

  it('kein entscheidender Fehler, wenn ich nur durch Ungenauigkeiten oder Zeit verliere', () => {
    const sides = { white: [mv(1, 50, 46), mv(3, 46, 42), mv(5, 42, 36)], black: [mv(2, 54, 54), mv(4, 58, 58)] };
    expect(decisiveError(sides, 'white')).toBeNull();
  });

  it('als Schwarz: Kurve aus meiner Sicht', () => {
    const sides = { white: [mv(1, 50, 50), mv(3, 30, 80)], black: [mv(2, 50, 70), mv(4, 20, 10, { class: 'blunder' })] };
    // Zug 2 kein Fehler; Zug 4 Patzer, danach (Weiß-Zug 3 → für mich 20 %) unter 50
    expect(decisiveError(sides, 'black')?.ply).toBe(4);
  });
});

describe('Genauigkeit (Lichess-Formel)', () => {
  it('Gewinnchance und Zug-Genauigkeit wie bei Lichess', () => {
    expect(winPercentFromCp(0)).toBe(50);
    expect(winPercentFromCp(5000)).toBeCloseTo(winPercentFromCp(1000), 10);
    expect(winPercentFromCp(100)).toBeCloseTo(59.1, 1);
    expect(moveAccuracy(50, 50)).toBe(100);
    expect(moveAccuracy(50, 60)).toBe(100);
    // 103,1668 · e^(−0,04354 · 10) − 3,1669 + 1 = 64,58
    expect(moveAccuracy(60, 50)).toBeCloseTo(64.58, 2);
    expect(moveAccuracy(100, 0)).toBe(0);
  });

  it('fehlerfreie Partie ≈ 100, Partie mit Patzer deutlich weniger', () => {
    const flat = Array.from({ length: 21 }, () => ({ cp: 20, depth: 16 }));
    const perfect = gameAccuracy(flat)!;
    expect(perfect.white).toBeCloseTo(100, 5);
    expect(perfect.black).toBeCloseTo(100, 5);
    // Weiß stellt in Halbzug 11 eine Figur ein (+20 → −300)
    const blunder = flat.map((e, i) => (i >= 11 ? { cp: -300, depth: 16 } : e));
    const acc = gameAccuracy(blunder)!;
    expect(acc.white!).toBeLessThan(80);
    expect(acc.black!).toBeCloseTo(100, 5);
  });

  it('Matt zählt wie ±1000; fehlende Bewertung → nicht berechenbar', () => {
    const acc = gameAccuracy([{ cp: 0 }, { mate: 3 }, { mate: 0 }])!;
    // Weiß zieht ins Matt-in-3 (besser), Schwarz wird matt gesetzt (Stellung 2: Schwarz am Zug ist matt → für Weiß gewonnen)
    expect(acc.white).toBe(100);
    expect(gameAccuracy([{ cp: 0 }, null])).toBeNull();
  });
});

describe('Spielphasen und Zeitnot', () => {
  it('Fehler je Phase, entscheidende Fehler nur aus Niederlagen', () => {
    const lost = fact({ moves: [mv(1, 50, 30, { phase: 'opening' }), mv(3, 30, 25, { phase: 'middlegame' })], decisive: mv(1, 50, 30, { phase: 'opening' }) });
    const won = fact({ result: 'win', score: 1, moves: [mv(41, 70, 50, { phase: 'endgame' })] });
    const r = phaseRows([lost, won]);
    expect(r.losses).toBe(1);
    expect(r.rows.find((x) => x.phase === 'opening')).toMatchObject({ moves: 1, errors: 1, decisive: 1, rate: 100 });
    expect(r.rows.find((x) => x.phase === 'endgame')).toMatchObject({ errors: 1, decisive: 0 });
  });

  it('Fehlerquote pro Zug in Zeitnot gegenüber sonst, nur Partien mit Uhr', () => {
    const withClock = fact({
      moves: [mv(1, 50, 50, { timeTrouble: false, clock: 500 }), mv(3, 50, 49, { timeTrouble: false, clock: 200 }), mv(5, 50, 30, { timeTrouble: true, clock: 40 }), mv(7, 30, 30, { timeTrouble: true, clock: 30 })],
    });
    const noClock = fact({ timeClass: 'daily', moves: [mv(1, 50, 20)] });
    const r = timeTroubleRates([withClock, noClock]);
    expect(r.clockGames).toBe(1);
    expect(r.trouble).toMatchObject({ moves: 2, errors: 1, rate: 50, games: 1 });
    expect(r.normal).toMatchObject({ moves: 2, errors: 0, rate: 0 });
    const buckets = clockBuckets([withClock]);
    expect(buckets.map((b) => b.moves)).toEqual([2, 0, 1, 1]);
  });
});

describe('Eröffnungen', () => {
  it('Chess.com über den ECO-Code', () => {
    expect(familyFromEco('C01')).toBe('French Defense');
    expect(familyFromEco('B20')).toBe('Sicilian Defense');
    expect(familyFromEco('D00')).toBe("Queen's Pawn Game");
    expect(familyFromEco('Z99')).toBeNull();
    expect(openingLabel('French Defense')).toBe('Französisch');
    expect(openingLabel('Kangaroo Defense')).toBe('Kangaroo Defense');
  });

  it('Sammelcodes (A00) und Partien ohne Header nach den Zügen', () => {
    expect(familyFromEco('A00')).toBeNull();
    expect(openingOf({ source: 'chesscom', eco: 'A00', pgn: '1. a3 e5 2. b4' })).toBe('Polish Opening');
    expect(openingOf({ source: 'chesscom', eco: 'C00', pgn: '1. e4 e6 2. d4 d5' })).toBe('French Defense');
  });

  it('App- und Brettpartien nach den Zügen, auch über Zugumstellung', () => {
    expect(familyFromPgn('1. e4 e6 2. d4 d5 3. Nc3 Bb4 4. e5')).toBe('French Defense');
    // Zugumstellung: 1. d4 e6 2. e4 d5 ist dieselbe Stellung wie 1. e4 e6 2. d4 d5
    expect(familyFromPgn('1. d4 e6 2. e4 d5 3. a3')).toBe('French Defense');
    expect(openingOf({ source: 'app', pgn: '1. e4 c5 2. Nf3 d6' })).toBe('Sicilian Defense');
    expect(familyFromPgn('')).toBeNull();
  });

  it('Tabelle getrennt nach Farbe mit Punkte-Quote und häufigster Fehlerart', () => {
    const fr = (r: GameFact['result'], t: string) => fact({ myColor: 'black', opening: 'French Defense', result: r, score: scoreOf(r), moves: [mv(2, 50, 20, { errorType: t })] });
    const rows = openingRows([fr('win', 'fork'), fr('loss', 'pieceTaken'), fr('loss', 'pieceTaken'), fact({ myColor: 'white', opening: 'French Defense' })]);
    expect(rows[0]).toMatchObject({ family: 'French Defense', color: 'black', games: 3, topError: 'pieceTaken', blunders: 1 });
    expect(rows[0].score).toBeCloseTo(33.33, 1);
    expect(rows[1]).toMatchObject({ color: 'white', games: 1 });
  });
});

describe('Urteils-Regeln', () => {
  it('alle Teile → stimmt, manche → teilweise, keiner → stimmt nicht, zu wenig Daten → kein Urteil', () => {
    const y = { label: 'a', supports: true };
    const n = { label: 'b', supports: false };
    expect(verdictOf([y, y], true)).toBe('stimmt');
    expect(verdictOf([y, n], true)).toBe('teilweise');
    expect(verdictOf([n, n], true)).toBe('stimmtNicht');
    expect(verdictOf([y, y], false)).toBe('zuWenig');
    expect(verdictOf([], true)).toBe('zuWenig');
  });

  const color = SUGGESTIONS.find((h) => h.kind === 'color')!;

  it('Farbe: unter 10 Partien je Farbe → noch zu wenig Daten', () => {
    const gs = [...many(MIN_GAMES, { myColor: 'white', result: 'win', score: 1 }), ...many(MIN_GAMES - 1, { myColor: 'black' })];
    const r = evaluate(color, gs, NOW);
    expect(r.verdict).toBe('zuWenig');
    expect(r.summary).toMatch(/bisher 10 mit Weiß und 9 mit Schwarz/);
    expect(r.action).toBeNull();
  });

  it('Farbe: mehr Punkte und weniger Patzer mit Weiß → stimmt; nur mehr Punkte → teilweise; gleich → stimmt nicht', () => {
    const white = many(10, (i) => ({ myColor: 'white', result: i < 7 ? 'win' : 'loss', score: i < 7 ? 1 : 0, moves: [mv(1, 50, 50)] }));
    const black = many(10, (i) => ({ myColor: 'black', result: i < 4 ? 'win' : 'loss', score: i < 4 ? 1 : 0, moves: [mv(2, 50, 20), mv(4, 50, 20)] }));
    expect(evaluate(color, [...white, ...black], NOW).verdict).toBe('stimmt');
    const blackClean = many(10, (i) => ({ myColor: 'black', result: i < 4 ? 'win' : 'loss', score: i < 4 ? 1 : 0, moves: [mv(2, 50, 50)] }));
    expect(evaluate(color, [...white, ...blackClean], NOW).verdict).toBe('teilweise');
    const same = many(10, (i) => ({ myColor: 'black', result: i < 7 ? 'win' : 'loss', score: i < 7 ? 1 : 0, moves: [mv(2, 50, 50)] }));
    const r = evaluate(color, [...white, ...same], NOW);
    expect(r.verdict).toBe('stimmtNicht');
    expect(r.summary).toBe('Mit Weiß holst du 70 % der Punkte (10 Partien), mit Schwarz 70 % (10 Partien). Patzer pro Partie: 0,0 gegenüber 0,0.');
  });

  it('Endspiel: entscheidende Fehler meist früher durch Übersehen → teilweise', () => {
    const h = SUGGESTIONS.find((x) => x.kind === 'phase')!;
    const losses = many(10, (i) => {
      const d = mv(9, 55, 20, { phase: i < 7 ? 'middlegame' : 'endgame', errorType: i < 6 ? 'pieceTaken' : 'other' });
      return { moves: [d], decisive: d };
    });
    const r = evaluate(h, losses, NOW);
    expect(r.signals.map((s) => s.supports)).toEqual([false, true]);
    expect(r.verdict).toBe('teilweise');
    expect(r.action?.filter).toEqual({ phase: 'middlegame' });
    expect(evaluate(h, losses.slice(0, 9), NOW).verdict).toBe('zuWenig');
  });

  it('Zeitnot: zu wenig Partien mit Zeitnot → kein Urteil; klar mehr Fehler → stimmt', () => {
    const h = SUGGESTIONS.find((x) => x.kind === 'timeTrouble')!;
    const g = (bad: boolean) => fact({ moves: [mv(1, 50, 50, { timeTrouble: false }), mv(3, 50, 50, { timeTrouble: false }), mv(5, 50, bad ? 20 : 50, { timeTrouble: true })] });
    expect(evaluate(h, many(9, {}).map(() => g(true)), NOW).verdict).toBe('zuWenig');
    expect(evaluate(h, Array.from({ length: 10 }, () => g(true)), NOW).verdict).toBe('stimmt');
    expect(evaluate(h, Array.from({ length: 10 }, () => g(false)), NOW).verdict).toBe('stimmtNicht');
  });

  it('Französisch als Schwarz: zu wenig Partien → kein Urteil; mehr Punkte und mehr Materialverlust → stimmt', () => {
    const h = SUGGESTIONS.find((x) => x.kind === 'opening')!;
    const fr = many(10, (i) => ({ myColor: 'black', opening: 'French Defense', result: i < 7 ? 'win' : 'loss', score: i < 7 ? 1 : 0, moves: [mv(2, 60, 30, { errorType: 'pieceTaken' })] }));
    const other = many(10, (i) => ({ myColor: 'black', opening: 'Sicilian Defense', result: i < 4 ? 'win' : 'loss', score: i < 4 ? 1 : 0, moves: [mv(2, 60, 30, { errorType: 'other' })] }));
    expect(evaluate(h, [...fr, ...other], NOW).verdict).toBe('stimmt');
    const r = evaluate(h, [fr[0], ...other], NOW);
    expect(r.verdict).toBe('zuWenig');
    expect(r.summary).toMatch(/^Französisch mit Schwarz: bisher 1 Partie analysiert/);
    expect(r.action?.filter).toEqual({ opening: 'French Defense', color: 'black' });
  });

  it('Fortschritt: ohne Partien davor → kein Urteil mit Hinweis auf „Alles“; weniger Patzer und genauer → stimmt', () => {
    const h = SUGGESTIONS.find((x) => x.kind === 'progress')!;
    const recent = many(10, { date: NOW - 3 * DAY, accuracy: 75, moves: [mv(1, 50, 45)] });
    const r = evaluate(h, recent, NOW);
    expect(r.verdict).toBe('zuWenig');
    expect(r.summary).toMatch(/Wähle oben „Alles“/);
    const before = many(10, { date: NOW - 40 * DAY, accuracy: 65, moves: [mv(1, 50, 20)] });
    expect(evaluate(h, [...recent, ...before], NOW).verdict).toBe('stimmt');
  });
});

describe('Filter und Zusammenführen', () => {
  const game = (o: Partial<GameRecord>): GameRecord =>
    ({ id: 'g1', userId: null, createdAt: 0, updatedAt: 0, date: NOW - DAY, source: 'chesscom', mode: 'online', white: { name: 'Ich' }, black: { name: 'X' }, myColor: 'white', myResult: 'loss', result: '0-1', termination: 'resign', timeControl: '600', timeClass: 'rapid', pgn: '1. e4 e6 2. d4 d5', plies: 4, eco: 'C00', ...o }) as GameRecord;
  const analysis = (sides: { white: MoveAnalysis[]; black: MoveAnalysis[] }): AnalysisRecord =>
    ({ gameId: 'g1', createdAt: 0, updatedAt: 0, status: 'done', engine: 'sf', limit: { depth: 16 }, evals: [{ cp: 0, depth: 16 }, { cp: 0, depth: 16 }, { cp: -300, depth: 16 }], myColor: 'white', timeClass: 'rapid', baseTime: 600, sides, summary: {} as AnalysisRecord['summary'], ms: 0 }) as AnalysisRecord;

  it('Partie + Analyse → Fakt mit Eröffnung, Genauigkeit und entscheidendem Fehler; „Gegen Freund“ fällt weg', () => {
    const f = gameFact(game({}), analysis({ white: [mv(1, 50, 50), mv(3, 50, 20, { phase: 'opening' })], black: [mv(2, 50, 50)] }))!;
    expect(f.opening).toBe('French Defense');
    expect(f.analysed).toBe(true);
    expect(f.decisive?.ply).toBe(3);
    expect(f.accuracy).not.toBeNull();
    expect(gameFact(game({ myColor: null, myResult: null }), undefined)).toBeNull();
    const board = gameFact(game({ source: 'brett', mode: 'board', pgn: '', plies: 0, board: { occasion: 'freunde', decidedIn: 'endgame', reasons: ['pieceBlunder', 'timeTrouble'] } }), undefined)!;
    expect(board.analysed).toBe(false);
    expect(board.findings).toHaveLength(1);
  });

  it('Zeitraum (4 Wochen / alles) und Zeitklasse', () => {
    const gs = [fact({ date: NOW - 2 * DAY }), fact({ date: NOW - 40 * DAY }), fact({ date: NOW - DAY, timeClass: 'blitz' })];
    expect(applyFilter(gs, { period: '4w', timeClass: 'all' }, NOW)).toHaveLength(2);
    expect(applyFilter(gs, { period: 'all', timeClass: 'all' }, NOW)).toHaveLength(3);
    expect(applyFilter(gs, { period: 'all', timeClass: 'blitz' }, NOW)).toHaveLength(1);
  });

  it('Wochen beginnen am Montag', () => {
    const fri = new Date(2026, 10, 13, 18).getTime();
    expect(new Date(weekStart(fri)).getDay()).toBe(1);
    expect(new Date(weekStart(fri)).getDate()).toBe(9);
    const w = weekly([fact({ date: fri, accuracy: 80 }), fact({ date: fri - 7 * DAY, accuracy: 60 }), fact({ date: fri - DAY, accuracy: 70 })]);
    expect(w.map((x) => [x.games, x.accuracy])).toEqual([
      [1, 60],
      [2, 75],
    ]);
  });

  it('Chess.com gegen Brett: Brett nur aus den eigenen Gründen', () => {
    const cc = fact({ moves: [mv(1, 50, 20, { errorType: 'threatMissed' })] });
    const bd = fact({ source: 'brett', analysed: false, board: { occasion: 'freunde', decidedIn: null, reasons: ['pieceBlunder', 'timeTrouble'] }, findings: [{ gameId: 'b', reason: 'pieceBlunder', errorType: 'pieceTaken', phase: null, timeTrouble: true }] });
    const r = sourceCompare([cc, bd]);
    expect(r.chesscom.games).toBe(1);
    expect(r.chesscom.shares.threatMissed).toBe(100);
    expect(r.board.shares.pieceTaken).toBe(100);
    expect(r.board.shares.timeTrouble).toBe(100);
    expect(r.board.shares.threatMissed).toBe(0);
  });
});

describe('Vermutungen und Training', () => {
  it('Besitzer startet mit seinen fünf, Freunde leer; gespeicherte Liste gewinnt', () => {
    expect(initialHypotheses(undefined, 'niklasehren')).toHaveLength(5);
    expect(initialHypotheses(undefined, 'freund')).toEqual([]);
    expect(initialHypotheses(undefined, undefined)).toEqual([]);
    const own: Hypothesis[] = [{ id: 'x', kind: 'timeTrouble', text: 'Zeitnot' }];
    expect(initialHypotheses(own, 'niklasehren')).toBe(own);
    expect(initialHypotheses([], 'niklasehren')).toEqual([]);
  });

  it('Adresse des gefilterten Trainings', () => {
    const route = { page: 'training', mode: 'auswahl', filter: { phase: 'endgame' as Phase, opening: "King's Pawn Game", color: 'black' as Side } } as const;
    expect(href(route)).toBe("#/training/auswahl?phase=endgame&eroeffnung=King%27s+Pawn+Game&farbe=black");
    expect(parseRoute(href(route))).toEqual(route);
    expect(parseRoute('#/training/auswahl?zeitnot=1&phase=quatsch')).toEqual({ page: 'training', mode: 'auswahl', filter: { zeitnot: true } });
    expect(filterQuery({})).toBe('');
    expect(parseRoute('#/statistik')).toEqual({ page: 'statistik' });
  });

  it('Puzzles nach Phase, Eröffnung, Farbe und Zeitnot filtern; fällige zuerst, dann neue, dann geübte', () => {
    const g = { id: 'g1', source: 'chesscom', eco: 'C00', pgn: '1. e4 e6' } as GameRecord;
    const a = { gameId: 'g1', status: 'done', sides: { white: [mv(5, 50, 20, { phase: 'opening', timeTrouble: false }), mv(41, 50, 20, { phase: 'endgame', timeTrouble: true })], black: [] } } as unknown as AnalysisRecord;
    const pz = (ply: number, box: number, due: number | null): PuzzleRecord =>
      ({ id: `g1:${ply}`, gameId: 'g1', ply, fen: '8/8/8/8/8/8/8/K6k w - - 0 1', box, due, class: 'blunder', gameDate: 0, firstSeen: null }) as PuzzleRecord;
    const puzzles = [pz(5, 3, NOW + 5 * DAY), pz(41, 0, null)];
    const tags = tagPuzzles(puzzles, [g], [a]);
    expect(tags.get('g1:41')).toEqual({ phase: 'endgame', opening: 'French Defense', color: 'white', zeitnot: true });
    expect(matchesFilter(tags.get('g1:5'), { phase: 'endgame' })).toBe(false);
    expect(matchesFilter(tags.get('g1:5'), { opening: 'French Defense', color: 'white' })).toBe(true);
    expect(filteredQueue(puzzles, tags, { zeitnot: true }, NOW).map((p) => p.id)).toEqual(['g1:41']);
    expect(filteredQueue(puzzles, tags, { opening: 'French Defense' }, NOW).map((p) => p.id)).toEqual(['g1:41', 'g1:5']);
  });
});
