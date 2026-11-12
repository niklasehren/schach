import { db, TABLES, type GameRecord } from './schema';

const FORMAT = 'schach-backup';
const VERSION = 1;

export type Backup = {
  format: typeof FORMAT;
  version: number;
  exportedAt: string;
  tables: Record<(typeof TABLES)[number], unknown[]>;
};

export async function exportBackup(): Promise<Backup> {
  return db.transaction('r', TABLES, async () => {
    const tables = {} as Backup['tables'];
    for (const name of TABLES) tables[name] = await db.table(name).toArray();
    return { format: FORMAT, version: VERSION, exportedAt: new Date().toISOString(), tables };
  });
}

export type RestoreSummary = { games: number; skippedGames: number; other: number };

export class BackupError extends Error {}

/**
 * Liest eine Sicherung ein und führt sie mit den vorhandenen Daten zusammen:
 * Gleiche IDs werden überschrieben, nichts wird gelöscht. Eine Chess.com-Partie,
 * die unter anderer ID schon vorhanden ist, wird übersprungen.
 */
export async function restoreBackup(raw: unknown): Promise<RestoreSummary> {
  const data = raw as Partial<Backup> | null;
  if (!data || data.format !== FORMAT || typeof data.tables !== 'object' || !data.tables) {
    throw new BackupError('Das ist keine Datensicherung dieser App.');
  }
  if ((data.version ?? 0) > VERSION) {
    throw new BackupError('Die Sicherung stammt aus einer neueren App-Version. Bitte die Seite neu laden und erneut versuchen.');
  }
  const tables = data.tables;
  const summary: RestoreSummary = { games: 0, skippedGames: 0, other: 0 };

  await db.transaction('rw', TABLES, async () => {
    const games = (Array.isArray(tables.games) ? tables.games : []) as GameRecord[];
    const valid = games.filter((g) => g && typeof g.id === 'string' && typeof g.pgn === 'string');
    const external = valid.map((g) => g.externalId).filter((x): x is string => !!x);
    const existing = new Map<string, string>();
    for (const g of await db.games.where('externalId').anyOf(external).toArray()) existing.set(g.externalId!, g.id);
    const toPut = valid.filter((g) => !g.externalId || !existing.has(g.externalId) || existing.get(g.externalId) === g.id);
    // Doppelte innerhalb der Datei selbst ebenfalls nur einmal übernehmen
    const seen = new Set<string>();
    const unique = toPut.filter((g) => !g.externalId || (!seen.has(g.externalId) && seen.add(g.externalId)));
    await db.games.bulkPut(unique);
    summary.games = unique.length;
    summary.skippedGames = games.length - unique.length;

    for (const name of TABLES) {
      if (name === 'games') continue;
      const rows = tables[name];
      if (!Array.isArray(rows) || rows.length === 0) continue;
      await db.table(name).bulkPut(rows);
      summary.other += rows.length;
    }
  });
  return summary;
}

/** Löst im Browser einen Datei-Download aus */
export function downloadFile(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
