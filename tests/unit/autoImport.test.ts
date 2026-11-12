import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import nov from '../fixtures/chesscom-2026-11.json';
import okt from '../fixtures/chesscom-2026-10.json';
import { AUTO_INTERVAL_MS, AUTO_KEY, maybeAutoImport } from '../../src/chesscom/autoImport';
import { setSetting } from '../../src/db/games';
import { db, TABLES } from '../../src/db/schema';
import type { Fetcher } from '../../src/chesscom/importer';

const base = 'https://api.chess.com/pub/player/testspieler/games';
function api() {
  const calls: string[] = [];
  const fetch: Fetcher = async (url) => {
    calls.push(url);
    const bodies: Record<string, unknown> = {
      [`${base}/archives`]: { archives: [`${base}/2026/06`, `${base}/2026/10`, `${base}/2026/11`] },
      [`${base}/2026/11`]: nov,
      [`${base}/2026/10`]: okt,
      [`${base}/2026/06`]: { games: [] },
    };
    return url in bodies ? new Response(JSON.stringify(bodies[url])) : new Response('{}', { status: 404 });
  };
  return { fetch, calls };
}
const nowNov = new Date(2026, 10, 12, 12).getTime();

beforeEach(async () => {
  for (const t of TABLES) await db.table(t).clear();
});

describe('Automatischer Import', () => {
  it('ohne gespeicherten Namen passiert nichts', async () => {
    const a = api();
    expect(await maybeAutoImport({ now: nowNov, fetch: a.fetch })).toBe(0);
    expect(a.calls).toHaveLength(0);
  });

  it('holt nur aktuellen und vorherigen Monat, danach höchstens alle 10 Minuten, nur neue Partien', async () => {
    await setSetting('chesscomUsername', 'TestSpieler');
    const a = api();
    expect(await maybeAutoImport({ now: nowNov, fetch: a.fetch })).toBe(6);
    expect(a.calls.map((u) => u.slice(base.length))).toEqual(['/archives', '/2026/11', '/2026/10']);

    // 5 Minuten später: keine Anfrage
    const b = api();
    expect(await maybeAutoImport({ now: nowNov + 5 * 60 * 1000, fetch: b.fetch })).toBe(0);
    expect(b.calls).toHaveLength(0);

    // nach 10 Minuten: wieder nachsehen, aber nichts Neues
    const c = api();
    expect(await maybeAutoImport({ now: nowNov + AUTO_INTERVAL_MS, fetch: c.fetch })).toBe(0);
    expect(c.calls.length).toBeGreaterThan(0);
    expect(await db.games.count()).toBe(6);
  });

  it('Schalter aus: kein Abruf', async () => {
    await setSetting('chesscomUsername', 'TestSpieler');
    await setSetting(AUTO_KEY, false);
    const a = api();
    expect(await maybeAutoImport({ now: nowNov, fetch: a.fetch })).toBe(0);
    expect(a.calls).toHaveLength(0);
  });

  it('kein Internet: still 0, und erst nach 10 Minuten neuer Versuch', async () => {
    await setSetting('chesscomUsername', 'TestSpieler');
    let calls = 0;
    const offline: Fetcher = async () => {
      calls++;
      throw new TypeError('Failed to fetch');
    };
    expect(await maybeAutoImport({ now: nowNov, fetch: offline })).toBe(0);
    expect(await maybeAutoImport({ now: nowNov + 60_000, fetch: offline })).toBe(0);
    expect(calls).toBe(1);
  });
});
