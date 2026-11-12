import type { GameRecord, ScoreResult, Side, Termination } from '../db/schema';
import { myResultOf } from '../db/games';

/** Ausschnitt einer Partie aus /pub/player/{name}/games/{YYYY}/{MM} */
export type ChessComPlayer = { username: string; rating?: number; result: string };
export type ChessComGame = {
  url: string;
  pgn?: string;
  time_control?: string;
  time_class?: string;
  end_time?: number;
  rated?: boolean;
  accuracies?: { white?: number; black?: number };
  uuid?: string;
  rules?: string;
  eco?: string;
  white: ChessComPlayer;
  black: ChessComPlayer;
};

const drawCodes: Record<string, Termination> = {
  agreed: 'agreement',
  repetition: 'repetition',
  stalemate: 'stalemate',
  insufficient: 'insufficient',
  '50move': 'fiftyMoves',
  timevsinsufficient: 'timeoutVsInsufficient',
};

const lossCodes: Record<string, Termination> = {
  checkmated: 'checkmate',
  resigned: 'resign',
  timeout: 'timeout',
  abandoned: 'abandoned',
};

function pgnHeader(pgn: string, key: string): string | undefined {
  return pgn.match(new RegExp(`^\\[${key} "([^"]*)"\\]`, 'm'))?.[1];
}

/** Halbzüge zählen, ohne die ganze Partie nachzuspielen */
export function countPlies(pgn: string): number {
  const body = pgn
    .replace(/^\[.*\]\s*$/gm, '')
    .replace(/\{[^}]*\}/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\$\d+/g, ' ')
    .replace(/\d+\.(\.\.)?/g, ' ')
    .replace(/(1-0|0-1|1\/2-1\/2|\*)\s*$/, ' ');
  return body.split(/\s+/).filter(Boolean).length;
}

/** „https://www.chess.com/openings/Queens-Pawn-Opening-Chigorin-Variation“ → „Queens Pawn Opening Chigorin Variation“ */
export function openingFromUrl(url?: string): string | undefined {
  const slug = url?.split('/openings/')[1];
  if (!slug) return undefined;
  return decodeURIComponent(slug).replace(/-/g, ' ').replace(/\s+/g, ' ').trim() || undefined;
}

const timeClasses = ['bullet', 'blitz', 'rapid', 'daily', 'classical'] as const;

/**
 * Wandelt eine Chess.com-Partie in unseren Datensatz um.
 * Gibt null zurück bei Varianten (Chess960 usw.) oder wenn der Benutzer nicht mitgespielt hat.
 */
export function convertChessComGame(raw: ChessComGame, username: string, now = Date.now()): GameRecord | null {
  if (raw.rules !== 'chess' || !raw.pgn || !raw.url) return null;
  const me = username.trim().toLowerCase();
  const myColor: Side | null =
    raw.white.username.toLowerCase() === me ? 'white' : raw.black.username.toLowerCase() === me ? 'black' : null;
  if (!myColor) return null;

  let result: ScoreResult;
  let termination: Termination;
  if (raw.white.result === 'win') {
    result = '1-0';
    termination = lossCodes[raw.black.result] ?? 'other';
  } else if (raw.black.result === 'win') {
    result = '0-1';
    termination = lossCodes[raw.white.result] ?? 'other';
  } else {
    result = '1/2-1/2';
    termination = drawCodes[raw.white.result] ?? drawCodes[raw.black.result] ?? 'other';
  }

  const date = raw.end_time ? raw.end_time * 1000 : now;
  const timeClass = timeClasses.find((c) => c === raw.time_class);
  const eco = pgnHeader(raw.pgn, 'ECO');
  return {
    id: raw.uuid ? `chesscom-${raw.uuid}` : `chesscom-${raw.url.split('/').pop()}`,
    userId: null,
    createdAt: now,
    updatedAt: now,
    date,
    source: 'chesscom',
    mode: 'online',
    white: { name: raw.white.username, rating: raw.white.rating },
    black: { name: raw.black.username, rating: raw.black.rating },
    myColor,
    myResult: myResultOf(result, myColor),
    result,
    termination,
    timeControl: raw.time_control && raw.time_control !== '-' ? raw.time_control : null,
    timeClass,
    rated: raw.rated,
    eco: eco && eco !== '?' ? eco : undefined,
    opening: openingFromUrl(raw.eco ?? pgnHeader(raw.pgn, 'ECOUrl')),
    pgn: raw.pgn,
    plies: countPlies(raw.pgn),
    externalId: raw.url,
    account: username.trim(),
    accuracies: raw.accuracies,
  };
}
