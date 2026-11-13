import type { PuzzleFilter } from '../app/router';
import type { AnalysisRecord, GameRecord, Phase, PuzzleRecord, Side } from '../db/schema';
import { openingOf } from '../stats/openings';
import { isDue, practiceQueue } from './leitner';

/** Merkmale eines Puzzles aus meinen Fehlern – zum Filtern im Training (Statistik → „Übe Puzzles aus …“) */
export type PuzzleTags = { phase: Phase | null; opening: string | null; color: Side | null; zeitnot: boolean };

export function tagPuzzles(puzzles: PuzzleRecord[], games: GameRecord[], analyses: AnalysisRecord[]): Map<string, PuzzleTags> {
  const gameById = new Map(games.map((g) => [g.id, g]));
  const analysisById = new Map(analyses.map((a) => [a.gameId, a]));
  const openings = new Map<string, string | null>();
  const out = new Map<string, PuzzleTags>();
  for (const p of puzzles) {
    const g = gameById.get(p.gameId);
    const a = analysisById.get(p.gameId);
    // Die Farbe des Puzzles = die Seite am Zug in der Stellung (ich)
    const color: Side = p.fen.split(' ')[1] === 'b' ? 'black' : 'white';
    const m = a?.sides?.[color].find((x) => x.ply === p.ply);
    if (g && !openings.has(g.id)) openings.set(g.id, openingOf(g));
    out.set(p.id, { phase: m?.phase ?? null, opening: g ? openings.get(g.id)! : null, color, zeitnot: m?.timeTrouble === true });
  }
  return out;
}

export function matchesFilter(t: PuzzleTags | undefined, f: PuzzleFilter): boolean {
  if (!t) return false;
  if (f.phase && t.phase !== f.phase) return false;
  if (f.opening && t.opening !== f.opening) return false;
  if (f.color && t.color !== f.color) return false;
  if (f.zeitnot && !t.zeitnot) return false;
  return true;
}

export const isEmptyFilter = (f: PuzzleFilter) => !f.phase && !f.opening && !f.color && !f.zeitnot;

/**
 * Reihenfolge für das gefilterte Üben: fällige Wiederholungen, dann neue (wie „Weiter üben“), dann die übrigen
 * schon geübten (niedrigster Kasten zuerst) – so gibt es auch nach dem Tagesziel immer etwas zu üben.
 */
export function filteredQueue(puzzles: PuzzleRecord[], tags: Map<string, PuzzleTags>, f: PuzzleFilter, now: number): PuzzleRecord[] {
  const list = puzzles.filter((p) => matchesFilter(tags.get(p.id), f));
  const due = list.filter((p) => isDue(p, now)).sort((a, b) => a.due! - b.due!);
  const fresh = practiceQueue(list);
  const rest = list.filter((p) => p.box > 0 && !isDue(p, now)).sort((a, b) => a.box - b.box || (a.due ?? 0) - (b.due ?? 0));
  return [...due, ...fresh, ...rest];
}
