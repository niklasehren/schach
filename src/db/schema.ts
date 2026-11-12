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

export type MoveClass = 'inaccuracy' | 'mistake' | 'blunder';
export type Phase = 'opening' | 'middlegame' | 'endgame';

/** Bewertung einer Stellung aus Sicht von Weiß (cp = Hundertstel-Bauern, mate = Matt in n, positiv = Weiß setzt matt) */
export type PositionEval = { cp?: number; mate?: number; depth: number; best?: string; pv?: string[] };

/** Ein analysierter Halbzug */
export type MoveAnalysis = {
  /** Halbzug-Nummer, 1 = erster Zug von Weiß */
  ply: number;
  san: string;
  uci: string;
  /** Bester Engine-Zug in der Stellung davor */
  best?: string;
  bestSan?: string;
  /** Gewinnchance des ziehenden Spielers vor/nach dem Zug, 0–100 % */
  winBefore: number;
  winAfter: number;
  /** Verlust an Gewinnchance in Prozentpunkten (≥ 0) */
  loss: number;
  class?: MoveClass;
  phase: Phase;
  /** Figur eingestellt: der Gegner gewinnt mit seiner besten Antwort ≥ 2 Bauerneinheiten */
  hanging: boolean;
  missedMate: boolean;
  allowedMate: boolean;
  /** Restzeit vor dem Zug in Sekunden; null = ohne Uhr */
  clock: number | null;
  /** Restzeit < 10 % der Grundzeit; null = nicht bestimmbar (ohne Uhr, Fernschach) */
  timeTrouble: boolean | null;
};

export type SideSummary = {
  moves: number;
  inaccuracies: number;
  mistakes: number;
  blunders: number;
  hanging: number;
  missedMates: number;
  allowedMates: number;
  /** Fehler + Patzer */
  errors: number;
  /** davon in Zeitnot (nur wenn Zeitnot bestimmbar) */
  errorsInTimeTrouble: number;
  timeTroubleKnown: boolean;
  /** Durchschnittlicher Verlust an Gewinnchance pro Zug (Prozentpunkte) */
  avgLoss: number;
};

/** Engine-Analyse einer Partie (Block 5) */
export type AnalysisRecord = {
  gameId: string;
  createdAt: number;
  updatedAt: number;
  /** partial = Zwischenstand (nach Neuladen geht es dort weiter), failed = Partie nicht lesbar */
  status: 'partial' | 'done' | 'failed';
  engine: string;
  limit: { depth: number } | { movetime: number };
  /** Bewertung jeder Stellung, Index 0 = Ausgangsstellung */
  evals: (PositionEval | null)[];
  myColor: Side | null;
  timeClass: GameRecord['timeClass'] | null;
  /** Grundzeit in Sekunden (aus dem TimeControl-Header), null = ohne Uhr/Fernschach */
  baseTime: number | null;
  /** Züge getrennt nach Farbe; meine Züge = sides[myColor] */
  sides?: { white: MoveAnalysis[]; black: MoveAnalysis[] };
  summary?: { white: SideSummary; black: SideSummary };
  /** Reine Rechenzeit in Millisekunden */
  ms: number;
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
    // Version 2: Analysen nach Status abfragbar (Warteschlange)
    this.version(2).stores({ analyses: 'gameId, status' });
  }
}

export const db = new SchachDB();

export const TABLES = ['games', 'analyses', 'puzzles', 'attempts', 'settings'] as const;
