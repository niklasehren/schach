import { db, type GameRecord } from '../db/schema';
import { convertChessComGame, type ChessComGame } from './convert';

const API = 'https://api.chess.com/pub/player';

export type ImportErrorKind = 'notFound' | 'offline' | 'rateLimit' | 'invalidName' | 'server';

export class ImportError extends Error {
  constructor(
    public kind: ImportErrorKind,
    message: string,
  ) {
    super(message);
  }
}

const messages: Record<ImportErrorKind, (name: string) => string> = {
  invalidName: () => 'Bitte einen gültigen Chess.com-Benutzernamen eingeben (Buchstaben, Ziffern, _ oder -).',
  notFound: (n) => `Den Benutzer „${n}“ gibt es auf Chess.com nicht. Bitte die Schreibweise prüfen.`,
  offline: () => 'Keine Verbindung zu Chess.com. Bitte die Internetverbindung prüfen und erneut versuchen.',
  rateLimit: () => 'Chess.com meldet zu viele Anfragen. Bitte ein paar Minuten warten und dann erneut importieren – bereits geladene Partien bleiben gespeichert.',
  server: () => 'Chess.com antwortet gerade nicht richtig. Bitte später erneut versuchen.',
};

const fail = (kind: ImportErrorKind, name: string) => new ImportError(kind, messages[kind](name));

export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

type Deps = {
  fetch?: Fetcher;
  /** Pause zwischen Anfragen und vor einem zweiten Versuch (in Tests 0) */
  wait?: (ms: number) => Promise<void>;
  signal?: AbortSignal;
  now?: Date;
};

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function getJson<T>(url: string, name: string, deps: Required<Pick<Deps, 'fetch' | 'wait'>> & Deps): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await deps.fetch(url, { signal: deps.signal, headers: { Accept: 'application/json' } });
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') throw e;
      throw fail('offline', name);
    }
    if (res.ok) {
      try {
        return (await res.json()) as T;
      } catch {
        throw fail('server', name);
      }
    }
    if (res.status === 404 || res.status === 410) throw fail('notFound', name);
    // Bei „zu viele Anfragen“ einmal kurz warten und erneut versuchen
    if (res.status === 429 && attempt === 0) {
      await deps.wait(5000);
      continue;
    }
    throw fail(res.status === 429 ? 'rateLimit' : 'server', name);
  }
}

export type Range = 'last3' | 'all';

export function isValidUsername(name: string): boolean {
  return /^[A-Za-z0-9_-]{2,50}$/.test(name.trim());
}

/** Archiv-URLs (…/games/2026/09) auf die letzten 3 Kalendermonate einschließlich des laufenden begrenzen */
export function filterArchives(urls: string[], range: Range, now = new Date()): string[] {
  if (range === 'all') return urls;
  const from = new Date(now.getFullYear(), now.getMonth() - 2, 1);
  const minKey = from.getFullYear() * 12 + from.getMonth();
  return urls.filter((u) => {
    const m = u.match(/\/(\d{4})\/(\d{2})\/?$/);
    return m ? Number(m[1]) * 12 + Number(m[2]) - 1 >= minKey : false;
  });
}

export type Progress = {
  phase: 'archives' | 'months' | 'done';
  month: number;
  months: number;
  /** z. B. „2026/09“ */
  label?: string;
  added: number;
};

export type ImportSummary = {
  months: number;
  added: number;
  duplicates: number;
  /** Varianten wie Chess960 oder Partien ohne den Benutzer */
  skipped: number;
};

/**
 * Holt die Partien eines Chess.com-Benutzers. Die Monate werden nacheinander abgerufen
 * (Chess.com bittet darum, nicht parallel anzufragen); jede Monatsladung wird sofort gespeichert.
 */
export async function importChessCom(
  username: string,
  range: Range,
  onProgress: (p: Progress) => void = () => {},
  deps: Deps = {},
): Promise<ImportSummary> {
  const name = username.trim();
  if (!isValidUsername(name)) throw fail('invalidName', name);
  const d = { ...deps, fetch: deps.fetch ?? ((u: string, i?: RequestInit) => fetch(u, i)), wait: deps.wait ?? sleep };

  onProgress({ phase: 'archives', month: 0, months: 0, added: 0 });
  const { archives = [] } = await getJson<{ archives?: string[] }>(
    `${API}/${encodeURIComponent(name.toLowerCase())}/games/archives`,
    name,
    d,
  );
  // Neueste Monate zuerst, damit die aktuellen Partien schnell da sind
  const months = filterArchives(archives, range, deps.now).reverse();
  const summary: ImportSummary = { months: months.length, added: 0, duplicates: 0, skipped: 0 };

  for (let i = 0; i < months.length; i++) {
    const url = months[i];
    const label = url.match(/(\d{4}\/\d{2})\/?$/)?.[1];
    onProgress({ phase: 'months', month: i + 1, months: months.length, label, added: summary.added });
    if (i > 0) await d.wait(250);
    const { games = [] } = await getJson<{ games?: ChessComGame[] }>(url, name, d);

    const converted: GameRecord[] = [];
    for (const g of games) {
      const rec = convertChessComGame(g, name);
      if (rec) converted.push(rec);
      else summary.skipped++;
    }
    const added = await storeNew(converted);
    summary.added += added;
    summary.duplicates += converted.length - added;
    onProgress({ phase: 'months', month: i + 1, months: months.length, label, added: summary.added });
  }
  onProgress({ phase: 'done', month: months.length, months: months.length, added: summary.added });
  return summary;
}

/** Speichert nur Partien, deren Chess.com-URL noch nicht vorhanden ist. Gibt die Anzahl neuer zurück. */
export async function storeNew(games: GameRecord[]): Promise<number> {
  if (games.length === 0) return 0;
  return db.transaction('rw', db.games, async () => {
    const urls = games.map((g) => g.externalId!);
    const known = new Set((await db.games.where('externalId').anyOf(urls).toArray()).map((r) => r.externalId));
    const seen = new Set<string>();
    const fresh = games.filter((g) => !known.has(g.externalId!) && !seen.has(g.externalId!) && seen.add(g.externalId!));
    await db.games.bulkAdd(fresh);
    return fresh.length;
  });
}

