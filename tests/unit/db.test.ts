import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import nov from '../fixtures/chesscom-2026-11.json';
import { convertChessComGame, type ChessComGame } from '../../src/chesscom/convert';
import { createSession, defaultSetup } from '../../src/chess/session';
import { exportBackup, restoreBackup } from '../../src/db/backup';
import { buildAppGame, countGames, getGame, getSetting, listGames, saveGame, setSetting } from '../../src/db/games';
import { db, TABLES } from '../../src/db/schema';

function scholarsMate() {
  const c = new Chess();
  for (const m of ['e4', 'e5', 'Bc4', 'Nc6', 'Qh5', 'Nf6', 'Qxf7#']) c.move(m);
  return c;
}

beforeEach(async () => {
  for (const t of TABLES) await db.table(t).clear();
});

describe('App-Partie speichern', () => {
  it('Gegen Computer: Matt mit PGN und Ergebnis aus meiner Sicht', async () => {
    const session = createSession({ ...defaultSetup, mode: 'computer', colorChoice: 'white' });
    const rec = buildAppGame(session, scholarsMate(), { winner: 'white', reason: 'checkmate' }, Date.UTC(2026, 10, 12, 10));
    expect(rec).toMatchObject({ source: 'app', mode: 'computer', myColor: 'white', myResult: 'win', result: '1-0', termination: 'checkmate', plies: 7, timeControl: null });
    expect(rec.black.isEngine).toBe(true);
    expect(rec.pgn).toContain('[Event "Gegen Stockfish"]');
    expect(rec.pgn).toContain('[Result "1-0"]');
    expect(rec.pgn).toMatch(/4\. Qxf7# 1-0$/);

    await saveGame(rec);
    const back = await getGame(rec.id);
    expect(back).toEqual(rec);
    // PGN lässt sich wieder einlesen
    const c = new Chess();
    c.loadPgn(back!.pgn);
    expect(c.isCheckmate()).toBe(true);
  });

  it('Gegen Freund mit Aufgabe: keine eigene Farbe', () => {
    const session = createSession({ ...defaultSetup, mode: 'friend', whiteName: 'Anna', blackName: 'Ben' });
    const c = new Chess();
    c.move('e4');
    const rec = buildAppGame(session, c, { winner: 'white', reason: 'resign' });
    expect(rec).toMatchObject({ myColor: null, myResult: null, result: '1-0', termination: 'resign' });
    expect(rec.pgn).toContain('[Black "Ben"]');
    expect(rec.pgn).toContain('[Termination "Aufgabe"]');
    expect(rec.pgn).toMatch(/1\. e4 1-0$/);
  });
});

describe('Liste und Filter', () => {
  it('neueste zuerst, Filter nach Quelle', async () => {
    const session = createSession({ ...defaultSetup, mode: 'computer', colorChoice: 'black' });
    await saveGame(buildAppGame(session, scholarsMate(), { winner: 'white', reason: 'checkmate' }, Date.UTC(2026, 11, 1)));
    for (const raw of nov.games as ChessComGame[]) {
      const g = convertChessComGame(raw, 'testspieler');
      if (g) await saveGame(g);
    }
    const all = await listGames('all', 100);
    expect(all).toHaveLength(5);
    expect(all[0].source).toBe('app');
    expect(all.map((g) => g.date)).toEqual([...all.map((g) => g.date)].sort((a, b) => b - a));
    expect(await listGames('chesscom', 100)).toHaveLength(4);
    expect(await listGames('app', 100)).toHaveLength(1);
    expect(await countGames('chesscom')).toBe(4);
    expect(await listGames('all', 2)).toHaveLength(2);
  });

  it('Einstellungen merken', async () => {
    await setSetting('chesscomUsername', 'TestSpieler');
    expect(await getSetting('chesscomUsername')).toBe('TestSpieler');
  });
});

describe('Datensicherung', () => {
  it('Export → Löschen → Import ergibt dieselben Daten; doppelter Import verdoppelt nichts', async () => {
    const session = createSession({ ...defaultSetup, mode: 'computer', colorChoice: 'white' });
    await saveGame(buildAppGame(session, scholarsMate(), { winner: 'white', reason: 'checkmate' }));
    await saveGame(convertChessComGame(nov.games[0] as ChessComGame, 'testspieler')!);
    await setSetting('chesscomUsername', 'TestSpieler');

    const backup = JSON.parse(JSON.stringify(await exportBackup()));
    expect(backup.format).toBe('schach-backup');
    expect(backup.tables.games).toHaveLength(2);
    for (const t of TABLES) expect(backup.tables).toHaveProperty(t);

    for (const t of TABLES) await db.table(t).clear();
    expect(await restoreBackup(backup)).toEqual({ games: 2, skippedGames: 0, other: 1 });
    expect(await db.games.count()).toBe(2);
    expect(await getSetting('chesscomUsername')).toBe('TestSpieler');

    await restoreBackup(backup);
    expect(await db.games.count()).toBe(2);
  });

  it('Chess.com-Partie mit anderer ID wird nicht doppelt übernommen', async () => {
    const g = convertChessComGame(nov.games[0] as ChessComGame, 'testspieler')!;
    await saveGame(g);
    const backup = JSON.parse(JSON.stringify(await exportBackup()));
    backup.tables.games[0].id = 'andere-id';
    expect(await restoreBackup(backup)).toMatchObject({ games: 0, skippedGames: 1 });
    expect(await db.games.count()).toBe(1);
  });

  it('fremde Dateien werden abgelehnt', async () => {
    await expect(restoreBackup({ hallo: 1 })).rejects.toThrow('keine Datensicherung');
    await expect(restoreBackup(null)).rejects.toThrow('keine Datensicherung');
  });
});
