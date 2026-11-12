import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import nov from '../fixtures/chesscom-2026-11.json';
import { convertChessComGame, type ChessComGame } from '../../src/chesscom/convert';
import { AnalysisQueue, type QueueState } from '../../src/analysis/queue';
import { saveGame } from '../../src/db/games';
import { db, TABLES } from '../../src/db/schema';
import { nodeEngine } from './nodeEngine';

function countingEngine() {
  const counter = { evaluations: 0 };
  return { engine: nodeEngine(counter), counter };
}

const until = async (cond: () => boolean | Promise<boolean>, ms = 60000) => {
  const end = Date.now() + ms;
  while (!(await cond())) {
    if (Date.now() > end) throw new Error('Zeitüberschreitung');
    await new Promise((r) => setTimeout(r, 20));
  }
};

const games = (nov.games as ChessComGame[])
  .map((g) => convertChessComGame(g, 'testspieler'))
  .filter((g): g is NonNullable<typeof g> => !!g)
  .filter((g) => ['001', '002'].includes(g.externalId!.slice(-3)));

beforeEach(async () => {
  for (const t of TABLES) await db.table(t).clear();
});

describe('Analyse-Warteschlange', () => {
  it('neueste zuerst, Pause mit Zwischenstand, nach „Neuladen“ weiter, nie doppelt', async () => {
    for (const g of games) await saveGame(g);
    const newest = [...games].sort((a, b) => b.date - a.date)[0];
    const totalPositions = games.reduce((s, g) => s + g.plies + 1, 0);

    // 1. Lauf: nach ein paar Stellungen pausieren
    const first = countingEngine();
    const q1 = new AnalysisQueue(() => first.engine, { depth: 8 });
    const seen: QueueState[] = [];
    q1.subscribe((s) => seen.push(s));
    await q1.start();
    await until(() => q1.state.current !== null && q1.state.current.position >= 9);
    expect(q1.state.current!.gameId).toBe(newest.id);
    await q1.pause();
    await until(() => q1.state.status === 'paused' && q1.state.current === null);
    const partial = await db.analyses.get(newest.id);
    expect(partial?.status).toBe('partial');
    const savedEvals = partial!.evals.filter(Boolean).length;
    expect(savedEvals).toBeGreaterThanOrEqual(4);
    q1.stop();

    // 2. „Neuladen“: neue Warteschlange, Pause-Zustand bleibt gespeichert
    const second = countingEngine();
    const q2 = new AnalysisQueue(() => second.engine, { depth: 8 });
    await q2.start();
    await until(() => q2.state.total === 2);
    expect(q2.state.status).toBe('paused');
    expect(q2.state.processed).toBe(0);
    await q2.resume();
    await until(() => q2.state.processed === 2 && q2.state.status === 'idle');
    // Schon gespeicherte Stellungen wurden nicht neu gerechnet (Endstellungen ohne Engine)
    expect(second.counter.evaluations).toBeLessThanOrEqual(totalPositions - savedEvals);
    for (const g of games) expect((await db.analyses.get(g.id))?.status).toBe('done');
    q2.stop();

    // 3. Nochmal: nichts mehr zu tun
    const third = countingEngine();
    const q3 = new AnalysisQueue(() => third.engine, { depth: 8 });
    await q3.start();
    await until(() => q3.state.total === 2 && q3.state.processed === 2);
    await new Promise((r) => setTimeout(r, 200));
    expect(third.counter.evaluations).toBe(0);

    // Neue Partie kommt automatisch dazu
    const another = convertChessComGame((nov.games as ChessComGame[]).find((g) => g.url.endsWith('004'))!, 'testspieler')!;
    await saveGame(another);
    await until(() => q3.state.processed === 3, 120000);
    expect(third.counter.evaluations).toBeGreaterThan(0);
    q3.stop();
    for (const e of [first, second, third]) e.engine.terminate();
  }, 300000);
});
