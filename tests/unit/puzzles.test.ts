import 'fake-indexeddb/auto';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import fixture from '../fixtures/chesscom-zwischenzug.json';
import { convertChessComGame, type ChessComGame } from '../../src/chesscom/convert';
import { analyseGame } from '../../src/analysis/analyze';
import { buildPuzzles, dedupe, fenKey, isAcceptable, solutionLine, ACCEPT_LOSS } from '../../src/training/puzzles';
import { addDays, dueText, schedule, startOfDay, todaysQueue, NEW_PER_DAY } from '../../src/training/leitner';
import { finishPuzzle, logAttempt, syncAllPuzzles } from '../../src/training/store';
import { saveGame } from '../../src/db/games';
import { db, TABLES, type AnalysisRecord, type GameRecord, type PuzzleRecord } from '../../src/db/schema';
import { nodeEngine } from './nodeEngine';

const game = convertChessComGame((fixture.games as ChessComGame[])[0], 'testspieler')!;
let analysis: AnalysisRecord;

beforeAll(async () => {
  analysis = (await analyseGame(game, nodeEngine(), { depth: 16 }))!;
}, 120000);

beforeEach(async () => {
  for (const t of TABLES) await db.table(t).clear();
});

const afterLg4 = () => {
  const c = new Chess();
  for (const m of ['d4', 'd5', 'Nc3', 'Nf6', 'e4', 'dxe4', 'f3', 'exf3', 'Qxf3', 'Nc6', 'Bb5', 'Bg4']) c.move(m);
  return c.fen();
};

describe('Puzzles aus eigenen Fehlern', () => {
  it('laugrix-Partie: Stellung nach 6...Lg4, Lösung Lxc6+ bxc6 Dxc6+', () => {
    const puzzles = buildPuzzles(game, analysis);
    const p = puzzles.find((x) => x.ply === 13)!;
    expect(p).toBeDefined();
    expect(p.fen).toBe(afterLg4());
    expect(p.played).toBe('f3f1');
    expect(p.class).toBe('blunder');
    expect(p.line).toEqual(['b5c6', 'b7c6', 'f3c6']);
    expect(p.box).toBe(0);
    // nur meine Züge (Weiß = ungerade Halbzüge), nur Fehler und Patzer
    expect(puzzles.every((x) => x.ply % 2 === 1)).toBe(true);
    const mine = analysis.sides!.white.filter((m) => (m.class === 'mistake' || m.class === 'blunder') && m.winBefore >= 10);
    expect(puzzles.length).toBe(mine.length);
  });

  it('klar verlorene Stellungen (unter 10 %) werden übersprungen', () => {
    const lost = analysis.sides!.white.filter((m) => (m.class === 'mistake' || m.class === 'blunder') && m.winBefore < 10);
    const plies = new Set(buildPuzzles(game, analysis).map((p) => p.ply));
    for (const m of lost) expect(plies.has(m.ply)).toBe(false);
    // künstlich: alles verloren → keine Puzzles
    const hopeless = { ...analysis, sides: { ...analysis.sides!, white: analysis.sides!.white.map((m) => ({ ...m, winBefore: 5 })) } };
    expect(buildPuzzles(game, hopeless)).toEqual([]);
  });

  it('ohne eigene Farbe (Gegen Freund, „Keiner“) keine Puzzles', () => {
    expect(buildPuzzles({ ...game, myColor: null } as GameRecord, analysis)).toEqual([]);
  });

  it('doppelte Stellungen (gleiche FEN) nur einmal', () => {
    const p = buildPuzzles(game, analysis)[0];
    const copy = { ...p, id: 'andere:1', fen: p.fen.replace(/ \d+ \d+$/, ' 9 30') };
    expect(fenKey(copy.fen)).toBe(p.fenKey);
    expect(dedupe([p, copy], new Set(), new Set())).toHaveLength(1);
    expect(dedupe([p], new Set([p.fenKey]), new Set())).toHaveLength(0);
  });

  it('Lösungslinie: ruhiger Zug = 1 Zug, Taktik über mehrere Züge, Matt bis zum Matt', () => {
    expect(solutionLine(afterLg4(), ['b5c6', 'b7c6', 'f3c6', 'g4d7', 'c6c4'])).toEqual(['b5c6', 'b7c6', 'f3c6']);
    expect(solutionLine(new Chess().fen(), ['e2e4', 'e7e5', 'g1f3'])).toEqual(['e2e4']);
    const scholar = new Chess();
    for (const m of ['e4', 'e5', 'Bc4', 'Nc6', 'Qh5', 'Nf6']) scholar.move(m);
    expect(solutionLine(scholar.fen(), ['h5f7', 'e8f7'], 1)).toEqual(['h5f7']);
    // Linie endet nie mit einem Zug des Gegners
    expect(solutionLine(afterLg4(), ['b5c6', 'b7c6']).length % 2).toBe(1);
  });

  it('„fast gleich gut“: bis 3 Prozentpunkte weniger, Matt immer', () => {
    expect(ACCEPT_LOSS).toBe(3);
    expect(isAcceptable(60, 57, false)).toBe(true);
    expect(isAcceptable(60, 56.9, false)).toBe(false);
    expect(isAcceptable(99, 20, true)).toBe(true);
  });

  it('Puzzles werden für schon analysierte Partien nachträglich angelegt', async () => {
    await saveGame(game);
    await db.analyses.put(analysis);
    const added = await syncAllPuzzles();
    expect(added).toBe(buildPuzzles(game, analysis).length);
    expect(await syncAllPuzzles()).toBe(0);
  });
});

describe('Leitner-Wiederholung', () => {
  const now = new Date(2026, 10, 12, 15).getTime();
  const day = (n: number) => addDays(startOfDay(now), n);

  it('richtig → nächster Kasten (1/3/7/14/30 Tage), falsch → Kasten 1, morgen', () => {
    expect(schedule(0, true, now)).toEqual({ box: 2, due: day(3) });
    expect(schedule(0, false, now)).toEqual({ box: 1, due: day(1) });
    expect(schedule(2, true, now)).toEqual({ box: 3, due: day(7) });
    expect(schedule(3, true, now)).toEqual({ box: 4, due: day(14) });
    expect(schedule(4, true, now)).toEqual({ box: 5, due: day(30) });
    expect(schedule(5, true, now)).toEqual({ box: 5, due: day(30) });
    expect(schedule(5, false, now)).toEqual({ box: 1, due: day(1) });
    expect(dueText(day(3), now)).toBe('in 3 Tagen');
    expect(dueText(day(1), now)).toBe('morgen');
  });

  const make = (i: number, extra: Partial<PuzzleRecord>): PuzzleRecord => ({
    id: `g:${i}`, userId: null, createdAt: 0, gameId: 'g', gameDate: 0, ply: i, fen: '', fenKey: `${i}`, played: '', line: [], class: 'mistake', winBefore: 50, box: 0, due: null, firstSeen: null, ...extra,
  });

  it('Tageslimit: höchstens 10 neue, fällige Wiederholungen immer; Patzer vor Fehlern, neuere Partien zuerst', () => {
    const fresh = Array.from({ length: 15 }, (_, i) => make(i, { class: i % 3 === 0 ? 'blunder' : 'mistake', gameDate: i }));
    const due = [make(100, { box: 2, due: day(0) }), make(101, { box: 1, due: day(-2) }), make(102, { box: 3, due: day(2) })];
    const q = todaysQueue([...fresh, ...due], now);
    expect(q.due.map((p) => p.ply)).toEqual([101, 100]);
    expect(q.fresh).toHaveLength(NEW_PER_DAY);
    expect(q.fresh.slice(0, 5).every((p) => p.class === 'blunder')).toBe(true);
    expect(q.fresh[0].gameDate).toBeGreaterThan(q.fresh[1].gameDate);
    // heute schon 7 neue geübt → nur noch 3
    const seen = Array.from({ length: 7 }, (_, i) => make(200 + i, { box: 2, due: day(3), firstSeen: now - 1000 }));
    expect(todaysQueue([...fresh, ...seen], now).fresh).toHaveLength(3);
  });

  it('Versuche werden protokolliert, Abschluss setzt Kasten und Termin', async () => {
    const p = make(1, {});
    await db.puzzles.add(p);
    await logAttempt(p.id, 'f3f1', false, 1, 4000, now);
    await logAttempt(p.id, 'b5c6', true, 2, 6000, now);
    const updated = await finishPuzzle(p, false, now);
    expect(updated).toMatchObject({ box: 1, due: day(1), firstSeen: now });
    expect(await db.attempts.where('puzzleId').equals(p.id).count()).toBe(2);
  });
});
