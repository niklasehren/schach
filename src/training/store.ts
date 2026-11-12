import { db, type PuzzleRecord } from '../db/schema';
import { newId } from '../db/games';
import { buildPuzzles, dedupe } from './puzzles';
import { schedule } from './leitner';

/** Puzzles für eine frisch analysierte Partie anlegen (doppelte Stellungen werden übersprungen) */
export async function syncPuzzlesForGame(gameId: string, now = Date.now()): Promise<number> {
  const [game, analysis] = await Promise.all([db.games.get(gameId), db.analyses.get(gameId)]);
  if (!game || !analysis) return 0;
  const candidates = buildPuzzles(game, analysis, now);
  if (candidates.length === 0) return 0;
  return db.transaction('rw', db.puzzles, async () => {
    const keys = new Set((await db.puzzles.where('fenKey').anyOf(candidates.map((c) => c.fenKey)).toArray()).map((p) => p.fenKey));
    const ids = new Set(await db.puzzles.where('gameId').equals(gameId).primaryKeys());
    const fresh = dedupe(candidates, keys, ids);
    await db.puzzles.bulkAdd(fresh);
    return fresh.length;
  });
}

/** Alle fertigen Analysen durchgehen (z. B. für Partien, die vor Block 7 analysiert wurden) */
export async function syncAllPuzzles(now = Date.now()): Promise<number> {
  const done = await db.analyses.where('status').equals('done').primaryKeys();
  const withPuzzles = new Set((await db.puzzles.toArray()).map((p) => p.gameId));
  let added = 0;
  // ältere Partien zuerst, damit bei gleicher Stellung die frühere Partie das Puzzle „besitzt“
  const games = (await db.games.bulkGet(done)).filter((g): g is NonNullable<typeof g> => !!g).sort((a, b) => a.date - b.date);
  for (const g of games) {
    if (withPuzzles.has(g.id)) continue;
    added += await syncPuzzlesForGame(g.id, now);
  }
  return added;
}

/** Versuch protokollieren */
export async function logAttempt(puzzleId: string, move: string, correct: boolean, tryNo: number, ms: number, now = Date.now()) {
  await db.attempts.add({ id: newId(), puzzleId, date: now, correct, ms, move, try: tryNo });
}

/** Puzzle abschließen: Leitner-Kasten und nächsten Termin setzen */
export async function finishPuzzle(p: PuzzleRecord, correctFirstTry: boolean, now = Date.now()): Promise<PuzzleRecord> {
  const next = schedule(p.box, correctFirstTry, now);
  const updated: PuzzleRecord = { ...p, box: next.box, due: next.due, firstSeen: p.firstSeen ?? now };
  await db.puzzles.put(updated);
  return updated;
}

/** Beim ersten Anzeigen eines neuen Puzzles den Tag merken (Tageslimit) */
export async function markSeen(p: PuzzleRecord, now = Date.now()) {
  if (p.firstSeen === null) await db.puzzles.update(p.id, { firstSeen: now });
}
