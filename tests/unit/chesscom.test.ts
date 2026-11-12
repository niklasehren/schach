import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import archives from '../fixtures/chesscom-archives.json';
import nov from '../fixtures/chesscom-2026-11.json';
import okt from '../fixtures/chesscom-2026-10.json';
import { convertChessComGame, countPlies, openingFromUrl, type ChessComGame } from '../../src/chesscom/convert';
import { filterArchives, importChessCom, ImportError, type Fetcher, type Progress } from '../../src/chesscom/importer';
import { db } from '../../src/db/schema';

const games = [...nov.games, ...okt.games] as ChessComGame[];
const byId = (n: string) => games.find((g) => g.url.endsWith(n))!;

describe('Chess.com-Partie umwandeln', () => {
  it('Niederlage als Schwarz durch Aufgabe', () => {
    const g = convertChessComGame(byId('001'), 'testspieler')!;
    expect(g.source).toBe('chesscom');
    expect(g.myColor).toBe('black');
    expect(g.result).toBe('1-0');
    expect(g.myResult).toBe('loss');
    expect(g.termination).toBe('resign');
    expect(g.timeControl).toBe('600');
    expect(g.timeClass).toBe('rapid');
    expect(g.white).toEqual({ name: 'Gegner1', rating: 175 });
    expect(g.black.rating).toBe(335);
    expect(g.eco).toBe('D00');
    expect(g.opening).toBe('Queens Pawn Opening Chigorin Variation');
    expect(g.externalId).toBe('https://www.chess.com/game/live/900000000001');
    expect(g.date).toBe(1793958995 * 1000);
    expect(g.pgn).toContain('[%clk 0:09:58.9]');
    expect(g.account).toBe('testspieler');
  });

  it('Sieg als Weiß durch Matt, Groß-/Kleinschreibung egal', () => {
    const g = convertChessComGame(byId('002'), 'TESTSPIELER')!;
    expect(g.myColor).toBe('white');
    expect(g.myResult).toBe('win');
    expect(g.termination).toBe('checkmate');
  });

  it('Remis, Zeitüberschreitung und Fernschach ohne Zeitlimit', () => {
    expect(convertChessComGame(byId('003'), 'testspieler')).toMatchObject({ result: '1/2-1/2', myResult: 'draw', termination: 'repetition' });
    expect(convertChessComGame(byId('004'), 'testspieler')).toMatchObject({ myResult: 'win', termination: 'timeout', timeControl: '60+1', timeClass: 'bullet' });
    expect(convertChessComGame(byId('005'), 'testspieler')).toMatchObject({ myColor: 'black', myResult: 'win', timeClass: 'daily', timeControl: null });
  });

  it('Varianten und fremde Partien werden übersprungen', () => {
    expect(convertChessComGame(byId('099'), 'testspieler')).toBeNull();
    expect(convertChessComGame(byId('001'), 'jemandanderes')).toBeNull();
  });

  it('Zuganzahl stimmt mit chess.js überein', () => {
    for (const raw of games.filter((g) => g.rules === 'chess')) {
      const c = new Chess();
      c.loadPgn(raw.pgn!);
      expect(countPlies(raw.pgn!)).toBe(c.history().length);
    }
  });

  it('Eröffnungsname aus der URL', () => {
    expect(openingFromUrl('https://www.chess.com/openings/Sicilian-Defense-Najdorf-Variation-6.Be3')).toBe('Sicilian Defense Najdorf Variation 6.Be3');
    expect(openingFromUrl(undefined)).toBeUndefined();
  });
});

describe('Monate auswählen', () => {
  const urls = ['2025/12', '2026/08', '2026/09', '2026/10', '2026/11'].map((m) => `https://api.chess.com/pub/player/x/games/${m}`);
  it('letzte 3 Monate inkl. laufendem', () => {
    expect(filterArchives(urls, 'last3', new Date(2026, 10, 12)).map((u) => u.slice(-7))).toEqual(['2026/09', '2026/10', '2026/11']);
  });
  it('über den Jahreswechsel', () => {
    const winter = ['2025/10', '2025/11', '2025/12', '2026/01', '2026/02'].map((m) => `https://api.chess.com/pub/player/x/games/${m}`);
    expect(filterArchives(winter, 'last3', new Date(2026, 1, 3)).map((u) => u.slice(-7))).toEqual(['2025/12', '2026/01', '2026/02']);
  });
  it('alle', () => expect(filterArchives(urls, 'all')).toHaveLength(5));
});

/** Nachgestellte Chess.com-API */
function fakeApi(overrides: Record<string, number> = {}): { fetch: Fetcher; calls: string[] } {
  const calls: string[] = [];
  const bodies: Record<string, unknown> = {
    'https://api.chess.com/pub/player/testspieler/games/archives': archives,
    'https://api.chess.com/pub/player/testspieler/games/2026/11': nov,
    'https://api.chess.com/pub/player/testspieler/games/2026/10': okt,
    'https://api.chess.com/pub/player/testspieler/games/2026/06': { games: [] },
  };
  return {
    calls,
    fetch: async (url) => {
      calls.push(url);
      const status = overrides[url];
      if (status) return new Response('{}', { status });
      if (!(url in bodies)) return new Response(JSON.stringify({ code: 0, message: 'not found' }), { status: 404 });
      return new Response(JSON.stringify(bodies[url]), { status: 200 });
    },
  };
}

const noWait = async () => {};

describe('Import', () => {
  beforeEach(async () => {
    await db.games.clear();
  });

  it('holt alle Monate nacheinander, überspringt Varianten und beim zweiten Mal Doppelte', async () => {
    const api = fakeApi();
    const progress: Progress[] = [];
    const first = await importChessCom('TestSpieler', 'all', (p) => progress.push(p), { fetch: api.fetch, wait: noWait });
    expect(first).toEqual({ months: 3, added: 6, duplicates: 0, skipped: 1 });
    // Neueste Monate zuerst
    expect(api.calls.slice(1).map((u) => u.slice(-7))).toEqual(['2026/11', '2026/10', '2026/06']);
    expect(progress.at(-1)).toMatchObject({ phase: 'done', months: 3, added: 6 });
    expect(progress.some((p) => p.phase === 'months' && p.month === 2 && p.months === 3)).toBe(true);
    expect(await db.games.count()).toBe(6);

    const second = await importChessCom('testspieler', 'all', undefined, { fetch: fakeApi().fetch, wait: noWait });
    expect(second).toEqual({ months: 3, added: 0, duplicates: 6, skipped: 1 });
    expect(await db.games.count()).toBe(6);
  });

  it('letzte 3 Monate', async () => {
    const api = fakeApi();
    const s = await importChessCom('testspieler', 'last3', undefined, { fetch: api.fetch, wait: noWait, now: new Date(2026, 10, 12) });
    expect(s.months).toBe(2);
    expect(api.calls).toHaveLength(3);
  });

  it('verständliche Fehler', async () => {
    const run = (name: string, f: Fetcher) => importChessCom(name, 'all', undefined, { fetch: f, wait: noWait });
    await expect(run('gibtsnicht', fakeApi().fetch)).rejects.toMatchObject({ kind: 'notFound' });
    await expect(run('gibtsnicht', fakeApi().fetch)).rejects.toThrow('gibt es auf Chess.com nicht');
    await expect(run('a b', fakeApi().fetch)).rejects.toMatchObject({ kind: 'invalidName' });
    await expect(run('testspieler', () => Promise.reject(new TypeError('Failed to fetch')))).rejects.toMatchObject({ kind: 'offline' });

    const limited = fakeApi({ 'https://api.chess.com/pub/player/testspieler/games/2026/10': 429 });
    const err = await run('testspieler', limited.fetch).catch((e) => e);
    expect(err).toBeInstanceOf(ImportError);
    expect(err.kind).toBe('rateLimit');
    // Einmal erneut versucht
    expect(limited.calls.filter((u) => u.endsWith('2026/10'))).toHaveLength(2);
    // Was bis dahin geladen war, bleibt gespeichert
    expect(await db.games.count()).toBe(4);
  });
});
