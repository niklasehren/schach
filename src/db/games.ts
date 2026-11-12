import { Chess } from 'chess.js';
import Dexie from 'dexie';
import type { GameResult, Session } from '../chess/session';
import { db, type GameRecord, type ScoreResult, type Side } from './schema';

export const newId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

const pad = (n: number) => String(n).padStart(2, '0');
export const pgnDate = (d: Date) => `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;

export function scoreOf(winner: Side | null): ScoreResult {
  return winner === 'white' ? '1-0' : winner === 'black' ? '0-1' : '1/2-1/2';
}

export function myResultOf(result: ScoreResult, myColor: Side | null): GameRecord['myResult'] {
  if (!myColor) return null;
  if (result === '1/2-1/2') return 'draw';
  return (result === '1-0') === (myColor === 'white') ? 'win' : 'loss';
}

const terminationText: Record<GameResult['reason'], string> = {
  checkmate: 'Schachmatt',
  resign: 'Aufgabe',
  stalemate: 'Patt',
  repetition: 'Dreifache Stellungswiederholung',
  insufficient: 'Zu wenig Material',
  fiftyMoves: '50-Züge-Regel',
};

/** Baut aus einer beendeten App-Partie den Datensatz inkl. PGN. */
export function buildAppGame(session: Session, chess: Chess, result: GameResult, endedAt = Date.now()): GameRecord {
  const { players, setup } = session;
  const name = (side: Side) => {
    const p = players[side];
    return p.isEngine && p.detail ? `${p.name} (${p.detail})` : p.name;
  };
  const score = scoreOf(result.winner);
  const pgnGame = new Chess();
  for (const m of chess.history()) pgnGame.move(m);
  pgnGame.setHeader('Event', setup.mode === 'computer' ? 'Gegen Stockfish' : 'Gegen Freund');
  pgnGame.setHeader('Site', 'Schach-App');
  pgnGame.setHeader('Date', pgnDate(new Date(endedAt)));
  pgnGame.setHeader('White', name('white'));
  pgnGame.setHeader('Black', name('black'));
  pgnGame.setHeader('Result', score);
  pgnGame.setHeader('Termination', terminationText[result.reason]);

  const myColor: Side | null = setup.mode === 'computer' ? session.orientation : null;
  return {
    id: newId(),
    userId: null,
    createdAt: endedAt,
    updatedAt: endedAt,
    date: endedAt,
    source: 'app',
    mode: setup.mode,
    white: { name: players.white.name, isEngine: players.white.isEngine || undefined, detail: players.white.detail },
    black: { name: players.black.name, isEngine: players.black.isEngine || undefined, detail: players.black.detail },
    myColor,
    myResult: myResultOf(score, myColor),
    result: score,
    termination: result.reason,
    timeControl: null,
    pgn: pgnGame.pgn(),
    plies: chess.history().length,
  };
}

export async function saveGame(game: GameRecord): Promise<string> {
  await db.games.put(game);
  return game.id;
}

export type SourceFilter = 'all' | GameRecord['source'];

/** Partien, neueste zuerst */
export function listGames(filter: SourceFilter, limit: number): Promise<GameRecord[]> {
  if (filter === 'all') return db.games.orderBy('date').reverse().limit(limit).toArray();
  return db.games
    .where('[source+date]')
    .between([filter, Dexie.minKey], [filter, Dexie.maxKey])
    .reverse()
    .limit(limit)
    .toArray();
}

export function countGames(filter: SourceFilter): Promise<number> {
  return filter === 'all' ? db.games.count() : db.games.where('source').equals(filter).count();
}

export const getGame = (id: string) => db.games.get(id);

export async function getSetting<T>(key: string): Promise<T | undefined> {
  return (await db.settings.get(key))?.value as T | undefined;
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await db.settings.put({ key, value });
}
