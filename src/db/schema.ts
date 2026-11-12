import Dexie, { type EntityTable } from 'dexie';

/** Wie eine Partie endete (aus Sicht der Regeln, nicht des Spielers) */
export type Termination =
  | 'checkmate'
  | 'resign'
  | 'timeout'
  | 'abandoned'
  | 'stalemate'
  | 'repetition'
  | 'insufficient'
  | 'fiftyMoves'
  | 'agreement'
  | 'timeoutVsInsufficient'
  | 'other';

export type Side = 'white' | 'black';
export type ScoreResult = '1-0' | '0-1' | '1/2-1/2';

export type GamePlayer = {
  name: string;
  rating?: number;
  isEngine?: boolean;
  /** z. B. „Elo 1500“ beim Computer-Gegner */
  detail?: string;
};

/** Eine gespeicherte Partie (App, Chess.com, später Brettpartie) */
export type GameRecord = {
  id: string;
  /** Für die spätere Freundesgruppe (Supabase); lokal noch leer */
  userId: string | null;
  createdAt: number;
  updatedAt: number;
  /** Zeitpunkt der Partie (Ende) in Millisekunden */
  date: number;
  source: 'app' | 'chesscom' | 'brett';
  mode: 'computer' | 'friend' | 'online';
  white: GamePlayer;
  black: GamePlayer;
  /** Meine Farbe; null bei „Gegen Freund“ (beide Seiten sind Menschen am Gerät) */
  myColor: Side | null;
  /** Ergebnis aus meiner Sicht; null, wenn myColor unbekannt */
  myResult: 'win' | 'loss' | 'draw' | null;
  result: ScoreResult;
  termination: Termination;
  /** Chess.com-Schreibweise: „600“, „180+2“, „1/86400“; null = ohne Uhr */
  timeControl: string | null;
  timeClass?: 'bullet' | 'blitz' | 'rapid' | 'daily' | 'classical';
  rated?: boolean;
  eco?: string;
  opening?: string;
  /** PGN, bei Chess.com mit Restzeit pro Zug ({[%clk 0:09:58.9]}) */
  pgn: string;
  /** Anzahl Halbzüge */
  plies: number;
  /** Eindeutige Herkunft, bei Chess.com die Partie-URL – verhindert Doppelte */
  externalId?: string;
  /** Benutzername, mit dem importiert wurde */
  account?: string;
  accuracies?: { white?: number; black?: number };
};

/** Engine-Analyse einer Partie (ab Block 5) */
export type AnalysisRecord = {
  gameId: string;
  createdAt: number;
  engine: string;
  depth: number;
  moves: {
    ply: number;
    eval: { cp?: number; mate?: number };
    best?: string;
    class?: 'inaccuracy' | 'mistake' | 'blunder';
    phase?: 'opening' | 'middlegame' | 'endgame';
    tags?: string[];
  }[];
};

/** Puzzle aus einem eigenen Fehler (ab Block 7) */
export type PuzzleRecord = {
  id: string;
  userId: string | null;
  createdAt: number;
  gameId: string;
  ply: number;
  fen: string;
  solutions: string[];
  themes: string[];
  box: number;
  /** Fälligkeitstag als Zeitstempel (Mitternacht) */
  due: number;
};

export type AttemptRecord = {
  id: string;
  puzzleId: string;
  date: number;
  correct: boolean;
  ms: number;
};

export type SettingRecord = { key: string; value: unknown };

export class SchachDB extends Dexie {
  games!: EntityTable<GameRecord, 'id'>;
  analyses!: EntityTable<AnalysisRecord, 'gameId'>;
  puzzles!: EntityTable<PuzzleRecord, 'id'>;
  attempts!: EntityTable<AttemptRecord, 'id'>;
  settings!: EntityTable<SettingRecord, 'key'>;

  constructor(name = 'schach') {
    super(name);
    // Nur indizierte Felder stehen hier; alle anderen werden trotzdem gespeichert.
    // &externalId = eindeutig: dieselbe Chess.com-Partie kann nicht zweimal vorkommen.
    this.version(1).stores({
      games: 'id, date, source, &externalId, [source+date]',
      analyses: 'gameId',
      puzzles: 'id, gameId, due, box',
      attempts: 'id, puzzleId, date',
      settings: 'key',
    });
  }
}

export const db = new SchachDB();

export const TABLES = ['games', 'analyses', 'puzzles', 'attempts', 'settings'] as const;
