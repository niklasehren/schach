import { Chess } from 'chess.js';
import type { GameRecord } from '../db/schema';
import type { ThemeKey } from './themes';

/** Eine Zeile der ausgelieferten Auswahl: [PuzzleId, FEN, Moves, Rating] – Format wie in der Lichess-Datenbank */
export type LichessRow = [string, string, string, number];

/**
 * Lichess-Puzzle, umgerechnet in das Format der App.
 * In der Lichess-Datenbank ist die FEN die Stellung VOR dem Zug des Gegners, und der erste Zug in „Moves“
 * ist der Zug des Gegners. Erst danach beginnt die Lösung: meine Züge an geraden Stellen von `line`.
 */
export type LichessPuzzle = {
  id: string;
  rating: number;
  theme: ThemeKey;
  /** Stellung vor dem Zug des Gegners (so steht sie in der Datenbank) */
  startFen: string;
  /** Zug des Gegners (UCI), wird auf dem Brett vorgespielt */
  opponentMove: string;
  /** Stellung, in der ich am Zug bin */
  fen: string;
  /** Lösung (UCI): meine Züge an geraden Stellen, dazwischen die Antworten des Gegners */
  line: string[];
};

export function parseLichess(row: LichessRow, theme: ThemeKey): LichessPuzzle {
  const [id, startFen, moves, rating] = row;
  const [opponentMove, ...line] = moves.trim().split(/\s+/);
  if (!opponentMove || line.length === 0 || line.length % 2 === 0) throw new Error(`Puzzle ${id}: unerwartete Zugfolge „${moves}“`);
  const chess = new Chess(startFen);
  chess.move({ from: opponentMove.slice(0, 2), to: opponentMove.slice(2, 4), promotion: opponentMove[4] });
  return { id, rating, theme, startFen, opponentMove, fen: chess.fen(), line };
}

/** Themen-Dateien werden erst bei Bedarf geladen (je ca. 28 kB, gepackt ca. 13 kB) */
const files = import.meta.glob<LichessRow[]>(['../data/lichess/*.json', '!../data/lichess/meta.json'], { import: 'default' });

const cache = new Map<ThemeKey, LichessPuzzle[]>();
export async function loadTheme(theme: ThemeKey): Promise<LichessPuzzle[]> {
  const hit = cache.get(theme);
  if (hit) return hit;
  const load = files[`../data/lichess/${theme}.json`];
  if (!load) throw new Error(`Thema ${theme} nicht gefunden`);
  const list = (await load()).map((r) => parseLichess(r, theme));
  cache.set(theme, list);
  return list;
}

/** Suchfenster um mein Rating; wird verdoppelt, bis etwas Ungespieltes drin liegt */
export const RATING_WINDOW = 100;

/**
 * Ein Puzzle passend zu meinem Rating: zufällig aus den ungespielten im Fenster ±100,
 * sonst Fenster vergrößern. Sind alle gespielt, darf eines wiederkommen (das am besten passende).
 */
export function choosePuzzle(list: LichessPuzzle[], rating: number, seen: Set<string>, rand = Math.random()): LichessPuzzle | null {
  if (list.length === 0) return null;
  const fresh = list.filter((p) => !seen.has(p.id));
  const pool = fresh.length ? fresh : list;
  for (let w = RATING_WINDOW; w <= 3200; w *= 2) {
    const near = pool.filter((p) => Math.abs(p.rating - rating) <= w);
    if (near.length) return near[Math.min(near.length - 1, Math.floor(rand * near.length))];
  }
  return pool[0];
}

/* ---------- Puzzle-Rating (vereinfachtes Elo) ---------- */

/** Erwartete Lösungswahrscheinlichkeit nach Elo */
export const expectedScore = (rating: number, puzzleRating: number) => 1 / (1 + 10 ** ((puzzleRating - rating) / 400));

/** Am Anfang schneller anpassen, damit das Rating rasch zum eigenen Niveau findet */
export const kFactor = (played: number) => (played < 15 ? 40 : 20);

/** Ergebnis eines Puzzles: im ersten Versuch gelöst 1, im zweiten 0,5, nicht gelöst 0 */
export const scoreOf = (solved: boolean, firstTry: boolean) => (solved ? (firstTry ? 1 : 0.5) : 0);

export const MIN_RATING = 100;

export function updateRating(rating: number, played: number, puzzleRating: number, score: number): number {
  const next = rating + kFactor(played) * (score - expectedScore(rating, puzzleRating));
  return Math.max(MIN_RATING, Math.round(next));
}

/** Aufschlag auf die Chess.com-Wertung: Puzzle-Ratings liegen deutlich über Partie-Ratings im Anfängerbereich */
export const START_OFFSET = 400;
export const DEFAULT_START = 1000;

/**
 * Startwert aus meiner letzten Chess.com-Wertung (Rapid bevorzugt, sonst Blitz, Bullet, Täglich) + 400,
 * begrenzt auf 600–1800. Ohne Chess.com-Partien: 1000.
 */
export function startRating(games: GameRecord[]): number {
  const mine = games.filter((g) => g.source === 'chesscom' && g.myColor && g[g.myColor].rating);
  for (const tc of ['rapid', 'blitz', 'bullet', 'daily'] as const) {
    const latest = mine.filter((g) => g.timeClass === tc).sort((a, b) => b.date - a.date)[0];
    if (latest) return Math.max(600, Math.min(1800, latest[latest.myColor!].rating! + START_OFFSET));
  }
  return DEFAULT_START;
}
