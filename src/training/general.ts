import { db } from '../db/schema';
import { countErrorTypes } from '../analysis/errorTypes';
import { choosePuzzle, loadTheme, scoreOf, startRating, updateRating, type LichessPuzzle } from './lichess';
import { pickTheme, themeWeights, type ThemeKey } from './themes';

/** Puzzle-Rating des Allgemeinen Trainings; gespeichert in der Tabelle „settings“ (kommt mit ins Backup) */
export type PuzzleRatingState = { rating: number; played: number; updated: number | null };
export const RATING_KEY = 'puzzleRating';

/** Versuche an Lichess-Puzzles stehen in „attempts“ mit dieser Vorsilbe vor der Puzzle-ID */
export const lichessAttemptId = (id: string) => `lichess:${id}`;

export async function getPuzzleRating(): Promise<PuzzleRatingState> {
  const row = await db.settings.get(RATING_KEY);
  if (row) return row.value as PuzzleRatingState;
  return { rating: startRating(await db.games.toArray()), played: 0, updated: null };
}

export async function seenLichess(): Promise<Set<string>> {
  const ids = await db.attempts.where('puzzleId').startsWith('lichess:').toArray();
  return new Set(ids.map((a) => a.puzzleId.slice('lichess:'.length)));
}

/** „weak“ = passend zu meinen Schwächen, sonst ein festes Thema */
export type GeneralMode = 'weak' | ThemeKey;

export async function weightsFromAnalyses() {
  const analyses = await db.analyses.where('status').equals('done').toArray();
  return themeWeights(countErrorTypes(analyses));
}

/**
 * Stellung, die die Übersicht zeigt, wenn aus meinen Fehlern nichts fällig ist. Dasselbe Puzzle kommt beim Start
 * des Allgemeinen Trainings („passend zu meinen Schwächen“) als erstes dran – Antippen des Bretts startet also genau diese Stellung.
 */
let preview: LichessPuzzle | null = null;

export async function previewLichessPuzzle(): Promise<LichessPuzzle | null> {
  if (preview && !(await seenLichess()).has(preview.id)) return preview;
  preview = await nextLichessPuzzle('weak');
  return preview;
}

export async function nextLichessPuzzle(mode: GeneralMode, skip: string[] = [], rand = Math.random): Promise<LichessPuzzle | null> {
  const [state, seen] = await Promise.all([getPuzzleRating(), seenLichess()]);
  for (const id of skip) seen.add(id);
  if (mode === 'weak' && preview && !seen.has(preview.id)) {
    const p = preview;
    preview = null;
    return p;
  }
  const theme = mode === 'weak' ? pickTheme(await weightsFromAnalyses(), rand()) : mode;
  return choosePuzzle(await loadTheme(theme), state.rating, seen, rand());
}

/** Ergebnis eintragen: Rating anpassen und speichern; gibt altes und neues Rating zurück */
export async function recordLichessResult(p: LichessPuzzle, solved: boolean, firstTry: boolean, now = Date.now()) {
  const state = await getPuzzleRating();
  const rating = updateRating(state.rating, state.played, p.rating, scoreOf(solved, firstTry));
  await db.settings.put({ key: RATING_KEY, value: { rating, played: state.played + 1, updated: now } satisfies PuzzleRatingState });
  return { before: state.rating, after: rating };
}
