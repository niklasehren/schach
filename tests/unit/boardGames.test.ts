import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import Dexie from 'dexie';
import { SchachDB, type AnalysisRecord, type PuzzleRecord } from '../../src/db/schema';
import {
  boardFindings,
  buildBoardGame,
  dateOf,
  deleteBoardGame,
  formOf,
  hasMoves,
  PgnError,
  REASON_MAPPING,
  recentOpponents,
  saveBoardGame,
  todayKey,
  type BoardForm,
} from '../../src/db/boardGames';
import { ERROR_TYPE_LABELS } from '../../src/analysis/errorTypes';

const NOW = new Date(2026, 10, 13, 17, 30).getTime();
const form = (extra: Partial<BoardForm> = {}): BoardForm => ({
  day: todayKey(NOW),
  opponent: 'Lena',
  occasion: 'schulliga',
  myColor: 'black',
  myResult: 'loss',
  decidedIn: 'middlegame',
  reasons: ['pieceBlunder', 'timeTrouble'],
  note: '  Turm auf e8 übersehen ',
  pgn: '',
  ...extra,
});

let dbs: SchachDB[] = [];
let n = 0;
const newDb = () => {
  const d = new SchachDB(`brett-test-${++n}`);
  dbs.push(d);
  return d;
};
afterEach(async () => {
  for (const d of dbs) {
    d.close();
    await Dexie.delete(d.name);
  }
  dbs = [];
});

describe('Brett-Eintrag bauen', () => {
  it('ohne Züge: Quelle „brett“, Ergebnis aus meiner Sicht, Namen nach Farbe, keine Analyse nötig', () => {
    const g = buildBoardGame(form(), { myName: 'niklas', now: NOW });
    expect(g).toMatchObject({
      source: 'brett',
      mode: 'board',
      myColor: 'black',
      myResult: 'loss',
      result: '1-0',
      white: { name: 'Lena' },
      black: { name: 'niklas' },
      pgn: '',
      plies: 0,
      timeControl: null,
      date: NOW,
      board: { occasion: 'schulliga', decidedIn: 'middlegame', reasons: ['pieceBlunder', 'timeTrouble'], note: 'Turm auf e8 übersehen' },
    });
    expect(hasMoves(g)).toBe(false);
  });

  it('Gegner leer → „Gegner“; Remis = ½-½; früherer Tag = 18 Uhr an dem Tag', () => {
    const g = buildBoardGame(form({ opponent: ' ', myResult: 'draw', day: '2026-11-10' }), { myName: 'Ich', now: NOW });
    expect(g.white.name).toBe('Gegner');
    expect(g.result).toBe('1/2-1/2');
    expect(g.myResult).toBe('draw');
    expect(g.date).toBe(new Date(2026, 10, 10, 18).getTime());
    expect(dateOf(todayKey(NOW), NOW)).toBe(NOW);
  });

  it('mit Zügen: PGN mit eigenen Kopfzeilen, Halbzüge gezählt, Matt erkannt', () => {
    const g = buildBoardGame(form({ myColor: 'white', myResult: 'win', pgn: '1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7#' }), { myName: 'Ich', now: NOW });
    expect(g.plies).toBe(7);
    expect(g.termination).toBe('checkmate');
    expect(g.pgn).toContain('[Event "Schülerliga"]');
    expect(g.pgn).toContain('[White "Ich"]');
    expect(g.pgn).toContain('[Black "Lena"]');
    expect(g.pgn).toContain('4. Qxf7# 1-0');
    expect(hasMoves(g)).toBe(true);
  });

  it('deutsche Schreibweise wird umgewandelt, gespeichert wird englisch (wie Chess.com-Partien)', () => {
    const g = buildBoardGame(form({ myColor: 'white', myResult: 'win', pgn: '1. e4 e5 2. Lc4 Sc6 3. Dh5 Sf6 4. Dxf7#' }), { myName: 'Ich', now: NOW });
    expect(g.plies).toBe(7);
    expect(g.pgn).toContain('4. Qxf7# 1-0');
  });

  it('ungültiger Zug → Fehlermeldung mit Zugnummer', () => {
    expect(() => buildBoardGame(form({ pgn: '1. e4 e5 2. Sf3 Sf5' }), { myName: 'Ich', now: NOW })).toThrow(new PgnError('Zug 2 … Sf5 (Schwarz) ist in dieser Stellung nicht möglich.'));
  });

  it('Formular aus gespeichertem Eintrag ergibt wieder denselben Eintrag', () => {
    const g = buildBoardGame(form(), { myName: 'Ich', now: NOW });
    const again = buildBoardGame(formOf(g), { myName: 'Ich', existing: g, now: NOW + 60_000 });
    expect({ ...again, updatedAt: 0 }).toEqual({ ...g, updatedAt: 0 });
  });
});

describe('Speichern, Bearbeiten, Löschen', () => {
  it('speichert, wird zum Hochladen vorgemerkt und ist nach Bearbeiten geändert (gleiche ID)', async () => {
    const d = newDb();
    const g = buildBoardGame(form(), { myName: 'Ich', now: NOW });
    await saveBoardGame(g, d);
    const stored = (await d.games.get(g.id)) as Record<string, unknown>;
    expect(stored).toMatchObject({ source: 'brett', dirty: 1 });
    expect(await d.games.where('source').equals('brett').count()).toBe(1);

    const edited = buildBoardGame(formOf(g), { myName: 'Ich', existing: g, now: NOW });
    edited.board!.reasons = ['opponentError'];
    await saveBoardGame({ ...edited, myResult: 'win', result: '0-1' }, d);
    expect(await d.games.count()).toBe(1);
    expect(await d.games.get(g.id)).toMatchObject({ myResult: 'win', board: { reasons: ['opponentError'] } });
  });

  it('Züge oder Farbe geändert → Analyse und Puzzles der Partie werden verworfen (neu analysieren)', async () => {
    const d = newDb();
    const g = buildBoardGame(form({ pgn: '1. e4 e5 2. Nf3 Nc6' }), { myName: 'Ich', now: NOW });
    await saveBoardGame(g, d);
    await d.analyses.put({ gameId: g.id, status: 'done' } as AnalysisRecord);
    await d.puzzles.put({ id: `${g.id}:3`, gameId: g.id, fenKey: 'x' } as PuzzleRecord);
    // nur Notiz geändert → Analyse bleibt
    await saveBoardGame({ ...g, board: { ...g.board!, note: 'neu' } }, d);
    expect(await d.analyses.get(g.id)).toBeTruthy();
    // Züge geändert → weg
    await saveBoardGame(buildBoardGame(formOf({ ...g, pgn: '1. d4 d5' }), { myName: 'Ich', existing: g, now: NOW }), d);
    expect(await d.analyses.get(g.id)).toBeUndefined();
    expect(await d.puzzles.where('gameId').equals(g.id).count()).toBe(0);
  });

  it('Löschen entfernt Eintrag, Analyse und Puzzles und legt Grabsteine für den Abgleich an', async () => {
    const d = newDb();
    const g = buildBoardGame(form({ pgn: '1. e4 e5' }), { myName: 'Ich', now: NOW });
    await saveBoardGame(g, d);
    await d.analyses.put({ gameId: g.id, status: 'done' } as AnalysisRecord);
    await deleteBoardGame(g.id, d);
    expect(await d.games.get(g.id)).toBeUndefined();
    expect(await d.analyses.get(g.id)).toBeUndefined();
    await expect.poll(async () => (await d.tombstones.toArray()).map((t) => t.id).sort()).toEqual([`analyses:${g.id}`, `games:${g.id}`]);
  });

  it('Gegner-Vorschläge: zuletzt gespielte zuerst, ohne Doppelte und ohne Platzhalter', async () => {
    const d = newDb();
    const add = (opponent: string, day: string, myColor: 'white' | 'black' = 'white') =>
      saveBoardGame(buildBoardGame(form({ opponent, day, myColor }), { myName: 'Ich', now: NOW }), d);
    await add('Lena', '2026-11-01');
    await add('Max', '2026-11-05', 'black');
    await add('lena', '2026-11-08');
    await add('', '2026-11-09');
    expect(await recentOpponents(8, d)).toEqual(['lena', 'Max']);
  });
});

describe('Zuordnung der Gründe zu den Fehlerarten (für Block 9)', () => {
  it('jede zugeordnete Fehlerart gibt es auch in der Analyse', () => {
    for (const m of Object.values(REASON_MAPPING)) if (m.errorType) expect(ERROR_TYPE_LABELS).toHaveProperty(m.errorType);
  });

  it('Gründe → Fehler im Format der Analyse: Phase aus „entschieden in“, Zeitnot markiert, Gegnerfehler/gut gespielt zählen nicht', () => {
    const g = buildBoardGame(form({ reasons: ['pieceBlunder', 'mateAllowed', 'badOpening', 'timeTrouble', 'opponentError'] }), { myName: 'Ich', now: NOW });
    expect(boardFindings(g)).toEqual([
      { gameId: g.id, reason: 'pieceBlunder', errorType: 'pieceTaken', phase: 'middlegame', timeTrouble: true },
      { gameId: g.id, reason: 'mateAllowed', errorType: 'mateAllowed', phase: 'middlegame', timeTrouble: true },
      { gameId: g.id, reason: 'badOpening', errorType: 'other', phase: 'opening', timeTrouble: true },
    ]);
    const onlyTime = buildBoardGame(form({ reasons: ['timeTrouble'], decidedIn: 'endgame' }), { myName: 'Ich', now: NOW });
    expect(boardFindings(onlyTime)).toEqual([{ gameId: onlyTime.id, reason: 'timeTrouble', errorType: 'other', phase: 'endgame', timeTrouble: true }]);
    const good = buildBoardGame(form({ reasons: ['playedWell', 'opponentError'], myResult: 'win' }), { myName: 'Ich', now: NOW });
    expect(boardFindings(good)).toEqual([]);
  });
});
