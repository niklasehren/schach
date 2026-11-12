import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Dexie from 'dexie';
import { SchachDB, type GameRecord, type PuzzleRecord } from '../../src/db/schema';
import { SYNC_TABLES, type SyncTable } from '../../src/db/syncHooks';
import { adoptLocalData, clearLocalData, PULL_ORDER, pull, push, syncOnce, type CursorStore, type Remote, type RemoteRow, type SyncContext } from '../../src/sync/engine';

/** Nachbau des Servers mit denselben Regeln wie die Migration: neuester Stand gewinnt, synced_at = Serverzeit */
class FakeServer {
  rows = new Map<string, RemoteRow>();
  clock = Date.UTC(2026, 10, 12);
  pulls: SyncTable[] = [];
  remote(userId: string): Remote {
    return {
      upsert: async (table, rows) => {
        for (const r of rows) {
          const k = `${userId}/${table}/${r.id}`;
          const old = this.rows.get(k);
          if (old && r.updated_at < old.updated_at) continue;
          this.rows.set(k, { ...structuredClone(r), synced_at: new Date(++this.clock).toISOString() });
        }
      },
      pullSince: async (table, since, limit) => {
        this.pulls.push(table);
        const prefix = `${userId}/${table}/`;
        return [...this.rows.entries()]
          .filter(([k, r]) => k.startsWith(prefix) && (!since || r.synced_at > since))
          .map(([, r]) => structuredClone(r))
          .sort((a, b) => a.synced_at.localeCompare(b.synced_at))
          .slice(0, limit);
      },
    };
  }
  get(userId: string, table: SyncTable, id: string) {
    return this.rows.get(`${userId}/${table}/${id}`);
  }
}

const memCursors = (): CursorStore => {
  const m = new Map<string, string>();
  return { get: (k) => m.get(k) ?? null, set: (k, v) => void m.set(k, v), remove: (k) => void m.delete(k) };
};

const game = (id: string, extra: Partial<GameRecord> = {}): GameRecord =>
  ({
    id, userId: null, createdAt: 1, updatedAt: 1, date: 1, source: 'app', mode: 'computer', white: { name: 'Ich' }, black: { name: 'Stockfish' },
    myColor: 'white', myResult: 'win', result: '1-0', termination: 'checkmate', timeControl: null, pgn: '1. e4 e5', plies: 2, ...extra,
  }) as GameRecord;
const puzzle = (id: string, extra: Partial<PuzzleRecord> = {}): PuzzleRecord => ({
  id, userId: null, createdAt: 0, gameId: 'g1', gameDate: 0, ply: 3, fen: '', fenKey: id, played: 'e2e4', line: ['d2d4'], class: 'mistake', winBefore: 50, box: 0, due: null, firstSeen: null, ...extra,
});

let server: FakeServer;
let dbs: SchachDB[] = [];
let n = 0;
function device(userId = 'userA'): SyncContext {
  const db = new SchachDB(`sync-test-${++n}`);
  dbs.push(db);
  return { db, remote: server.remote(userId), userId, cursors: memCursors() };
}
const raw = (db: SchachDB, table: SyncTable, id: string) => db.table(table).get(id) as Promise<Record<string, unknown> | undefined>;

beforeEach(() => {
  server = new FakeServer();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 12, 10, 0, 0));
});
afterEach(async () => {
  vi.useRealTimers();
  for (const db of dbs) {
    db.close();
    await Dexie.delete(db.name);
  }
  dbs = [];
});
const at = (h: number, m = 0) => vi.setSystemTime(new Date(2026, 10, 12, h, m, 0));

describe('Lokale Änderungen werden vorgemerkt', () => {
  it('Anlegen/Ändern setzt Zeitstempel und „dirty“, Löschen legt einen Grabstein an', async () => {
    const { db } = device();
    await db.games.add(game('g1'));
    expect(await raw(db, 'games', 'g1')).toMatchObject({ dirty: 1, updatedAt: new Date(2026, 10, 12, 10).getTime() });
    at(11);
    await db.games.update('g1', { myResult: 'loss' });
    expect(await raw(db, 'games', 'g1')).toMatchObject({ dirty: 1, updatedAt: new Date(2026, 10, 12, 11).getTime() });
    await db.games.delete('g1');
    await vi.waitFor(async () => expect(await db.tombstones.toArray()).toMatchObject([{ id: 'games:g1', table: 'games', key: 'g1' }]));
  });

  it('Version 4: vorhandene Daten aus Version 3 werden zum Hochladen vorgemerkt, nichts geht verloren', async () => {
    const name = `sync-test-${++n}`;
    const old = new Dexie(name);
    old.version(3).stores({ games: 'id, date, source, &externalId, [source+date]', analyses: 'gameId, status', puzzles: 'id, gameId, due, box, fenKey', attempts: 'id, puzzleId, date', settings: 'key' });
    await old.table('games').add(game('alt', { updatedAt: 1234 }));
    await old.table('puzzles').add(puzzle('p1'));
    await old.table('settings').add({ key: 'chesscomUser', value: 'x' });
    old.close();
    const db = new SchachDB(name);
    dbs.push(db);
    expect(await raw(db, 'games', 'alt')).toMatchObject({ dirty: 1, updatedAt: 1234 });
    const p = await raw(db, "puzzles", "p1");
    expect(p).toMatchObject({ dirty: 1, updatedAt: 0 });
    // Die interne Markierung wirkt nicht mehr nach (Dexie lässt sie als leeres Feld stehen)
    expect(p?.__sync).toBeUndefined();
    expect(await db.settings.where('dirty').equals(1).count()).toBe(1);
  });
});

describe('Synchronisierung zwischen zwei Geräten', () => {
  it('Gerät 1 lädt hoch, Gerät 2 bekommt die Daten; danach ist nichts mehr „dirty“', async () => {
    const d1 = device();
    const d2 = device();
    await d1.db.games.add(game('g1'));
    await d1.db.puzzles.add(puzzle('g1:3'));
    expect(await syncOnce(d1)).toMatchObject({ sent: 2 });
    expect(await d1.db.games.where('dirty').equals(1).count()).toBe(0);
    expect(server.get('userA', 'games', 'g1')).toMatchObject({ deleted: false, data: { id: 'g1', pgn: '1. e4 e5' } });
    // Sync-Felder landen nicht in den Daten
    expect(server.get('userA', 'games', 'g1')!.data).not.toHaveProperty('dirty');

    expect(await syncOnce(d2)).toMatchObject({ sent: 0, received: 2 });
    const g = await raw(d2.db, 'games', 'g1');
    expect(g).toMatchObject({ id: 'g1', pgn: '1. e4 e5' });
    expect(g).not.toHaveProperty('dirty');
    // Nochmal abgleichen bringt nichts Neues und lädt nichts erneut hoch
    expect(await syncOnce(d2)).toMatchObject({ sent: 0 });
  });

  it('Konflikt: der neueste Stand gewinnt – egal, wer zuerst abgleicht', async () => {
    const d1 = device();
    const d2 = device();
    await d1.db.puzzles.add(puzzle('p'));
    await syncOnce(d1);
    await syncOnce(d2);
    // Beide üben dasselbe Puzzle offline: Gerät 2 später
    at(12);
    await d1.db.puzzles.update('p', { box: 2 });
    at(13);
    await d2.db.puzzles.update('p', { box: 3 });
    // Gerät 2 gleicht zuerst ab, dann Gerät 1 (älter) → Server behält Gerät 2
    await syncOnce(d2);
    await syncOnce(d1);
    await syncOnce(d2);
    expect(server.get('userA', 'puzzles', 'p')!.data).toMatchObject({ box: 3 });
    expect(await d1.db.puzzles.get('p')).toMatchObject({ box: 3 });
    expect(await d2.db.puzzles.get('p')).toMatchObject({ box: 3 });

    // Umgekehrt: der neuere lokale Stand wird beim Herunterladen nicht überschrieben
    at(14);
    await d1.db.puzzles.update('p', { box: 4 });
    await pull(d1);
    expect(await d1.db.puzzles.get('p')).toMatchObject({ box: 4 });
    await syncOnce(d1);
    await syncOnce(d2);
    expect(await d2.db.puzzles.get('p')).toMatchObject({ box: 4 });
  });

  it('Löschen wird übertragen', async () => {
    const d1 = device();
    const d2 = device();
    await d1.db.games.add(game('weg'));
    await syncOnce(d1);
    await syncOnce(d2);
    expect(await d2.db.games.get('weg')).toBeTruthy();
    at(12);
    await d1.db.games.delete('weg');
    await vi.waitFor(async () => expect(await d1.db.tombstones.count()).toBe(1));
    await syncOnce(d1);
    expect(await d1.db.tombstones.count()).toBe(0);
    expect(server.get('userA', 'games', 'weg')).toMatchObject({ deleted: true, data: null });
    await syncOnce(d2);
    expect(await d2.db.games.get('weg')).toBeUndefined();
    // Die vom Server kommende Löschung erzeugt auf Gerät 2 keinen neuen Grabstein
    expect(await d2.db.tombstones.count()).toBe(0);
  });

  it('Erster Login: lokale Daten des Geräts werden übernommen, nichts geht verloren, ältere Stände überschreiben nichts', async () => {
    const d1 = device();
    at(9);
    await d1.db.games.add(game('aus-konto'));
    await d1.db.puzzles.add(puzzle('gemeinsam', { box: 5 }));
    await syncOnce(d1);

    // Gerät 2 hat ohne Konto gespielt: eigene Partie, plus dasselbe Puzzle in einem alten Stand (vor Version 4 → Zeit 0)
    const d2 = device();
    await d2.db.games.add(game('nur-lokal'));
    await d2.db.attempts.add({ id: 'a1', puzzleId: 'gemeinsam', date: 1, correct: true, ms: 5, move: 'd2d4', try: 1 });
    await d2.db.puzzles.add(puzzle('gemeinsam', { box: 0 }));
    await d2.db.puzzles.update('gemeinsam', { updatedAt: 0, __sync: 'keep' } as never);
    // so, als wären die Daten vor dem Login schon hochgeladen worden: nicht mehr dirty
    await d2.db.games.update('nur-lokal', { dirty: undefined, __sync: 'remote' } as never);

    expect(await adoptLocalData(d2)).toBe(3);
    await syncOnce(d2);
    await syncOnce(d1);
    for (const d of [d1, d2]) {
      expect((await d.db.games.toArray()).map((g) => g.id).sort()).toEqual(['aus-konto', 'nur-lokal']);
      expect(await d.db.attempts.get('a1')).toBeTruthy();
      // Der geübte Stand vom Konto (Kasten 5) bleibt erhalten
      expect(await d.db.puzzles.get('gemeinsam')).toMatchObject({ box: 5 });
    }
  });

  it('Reihenfolge beim Herunterladen: Puzzles vor Analysen vor Partien; viele Zeilen in mehreren Seiten', async () => {
    const d1 = device();
    await d1.db.attempts.bulkAdd(Array.from({ length: 1203 }, (_, i) => ({ id: `a${i}`, puzzleId: 'p', date: i, correct: true, ms: 1, move: 'e2e4', try: 1 })));
    await d1.db.games.add(game('g'));
    await d1.db.analyses.add({ gameId: 'g', status: 'done' } as never);
    await syncOnce(d1);
    const d2 = device();
    server.pulls = [];
    await pull(d2);
    const order = [...new Set(server.pulls)];
    expect(order).toEqual(PULL_ORDER);
    expect(order.indexOf('puzzles')).toBeLessThan(order.indexOf('analyses'));
    expect(order.indexOf('analyses')).toBeLessThan(order.indexOf('games'));
    expect(await d2.db.attempts.count()).toBe(1203);
    expect(server.pulls.filter((t) => t === 'attempts').length).toBeGreaterThanOrEqual(3);
  });

  it('Konten sind getrennt; Abmelden leert nur dieses Gerät', async () => {
    const a = device('userA');
    const b = device('userB');
    await a.db.games.add(game('von-a'));
    await syncOnce(a);
    await syncOnce(b);
    expect(await b.db.games.count()).toBe(0);
    await clearLocalData(a.db, a.userId, a.cursors);
    for (const t of SYNC_TABLES) expect(await a.db.table(t).count()).toBe(0);
    // Leeren des Geräts darf im Konto nichts löschen: keine Grabsteine, auch nicht verzögert
    await new Promise((r) => setTimeout(r, 50));
    expect(await a.db.tombstones.count()).toBe(0);
    expect(server.get('userA', 'games', 'von-a')).toMatchObject({ deleted: false });
    // Wieder anmelden: alles kommt zurück
    await syncOnce(a);
    expect(await a.db.games.get('von-a')).toBeTruthy();
    expect(await push(a)).toBe(0);
  });
});
