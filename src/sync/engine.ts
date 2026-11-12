import type { SchachDB } from '../db/schema';
import { remoteDeletes, SYNC_MARK, SYNC_TABLES, withoutTombstones, type SyncTable } from '../db/syncHooks';

/** Eine Zeile auf dem Server (Tabellen games, analyses, puzzles, attempts, settings in Supabase) */
export type RemoteRow = {
  id: string;
  data: Record<string, unknown> | null;
  updated_at: number;
  deleted: boolean;
  /** Serverzeit der letzten Speicherung (ISO) – Grundlage für „neu seit …“ */
  synced_at: string;
};

/** Zugriff auf den Server; in der App Supabase, in Tests ein Nachbau mit denselben Regeln */
export interface Remote {
  upsert(table: SyncTable, rows: Omit<RemoteRow, 'synced_at'>[]): Promise<void>;
  /** Zeilen mit synced_at > since, aufsteigend sortiert, höchstens limit */
  pullSince(table: SyncTable, since: string | null, limit: number): Promise<RemoteRow[]>;
}

/** Merkt sich, bis wohin heruntergeladen wurde (pro Konto und Tabelle) */
export interface CursorStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

export type SyncContext = { db: SchachDB; remote: Remote; userId: string; cursors: CursorStore };

/** Reihenfolge beim Herunterladen: Puzzles vor Analysen (sonst entstünden neue, ungeübte Puzzles),
 *  Analysen vor Partien (sonst würde die Warteschlange schon heruntergeladene Partien neu analysieren). */
export const PULL_ORDER: SyncTable[] = ['puzzles', 'attempts', 'settings', 'analyses', 'games'];

/** Größe eines Upload-Pakets (Analysen sind ca. 25 kB groß) */
const MAX_BATCH_BYTES = 400_000;
const MAX_BATCH_ROWS = 200;
const PAGE = 500;
/** Überlappung beim Herunterladen: fängt Zeilen ab, die mit etwas älterer Serverzeit später gespeichert wurden */
const OVERLAP_MS = 10_000;

const cursorKey = (userId: string, table: SyncTable) => `schach.sync.${userId}.${table}`;
const pkOf = (db: SchachDB, table: SyncTable) => db.table(table).schema.primKey.keyPath as string;

/** Lokale Zeile → Server-Daten (ohne die reinen Sync-Felder) */
function toData(row: Record<string, unknown>): Record<string, unknown> {
  const { dirty: _d, updatedAt: _u, ...data } = row;
  return data;
}

function batches<T>(rows: T[]): T[][] {
  const out: T[][] = [];
  let cur: T[] = [];
  let bytes = 0;
  for (const r of rows) {
    const size = JSON.stringify(r).length;
    if (cur.length && (bytes + size > MAX_BATCH_BYTES || cur.length >= MAX_BATCH_ROWS)) {
      out.push(cur);
      cur = [];
      bytes = 0;
    }
    cur.push(r);
    bytes += size;
  }
  if (cur.length) out.push(cur);
  return out;
}

/** Lokale Änderungen und Löschungen hochladen. Gibt die Anzahl hochgeladener Zeilen zurück. */
export async function push({ db, remote }: SyncContext): Promise<number> {
  let sent = 0;
  for (const table of SYNC_TABLES) {
    const t = db.table(table);
    const pk = pkOf(db, table);
    const dirty = (await t.where('dirty').equals(1).toArray()) as Record<string, unknown>[];
    for (const batch of batches(dirty)) {
      await remote.upsert(
        table,
        batch.map((r) => ({ id: String(r[pk]), data: toData(r), updated_at: (r.updatedAt as number) ?? 0, deleted: false })),
      );
      // „dirty“ nur entfernen, wenn sich die Zeile seitdem nicht wieder geändert hat
      await db.transaction('rw', t, async () => {
        for (const r of batch) {
          const now = (await t.get(r[pk] as string)) as Record<string, unknown> | undefined;
          if (now && now.updatedAt === r.updatedAt) await t.update(r[pk] as string, { dirty: undefined, [SYNC_MARK]: 'remote' });
        }
      });
      sent += batch.length;
    }
  }
  const stones = await db.tombstones.toArray();
  for (const table of SYNC_TABLES) {
    const mine = stones.filter((s) => s.table === table);
    for (const batch of batches(mine)) {
      await remote.upsert(
        table,
        batch.map((s) => ({ id: s.key, data: null, updated_at: s.deletedAt, deleted: true })),
      );
      await db.tombstones.bulkDelete(batch.map((s) => s.id));
      sent += batch.length;
    }
  }
  return sent;
}

/** Neue Daten herunterladen; bei Konflikten gewinnt der neueste Stand. Gibt die Anzahl übernommener Zeilen zurück. */
export async function pull({ db, remote, userId, cursors }: SyncContext): Promise<number> {
  let applied = 0;
  for (const table of PULL_ORDER) {
    const t = db.table(table);
    const pk = pkOf(db, table);
    const key = cursorKey(userId, table);
    const saved = cursors.get(key);
    let since = saved ? new Date(new Date(saved).getTime() - OVERLAP_MS).toISOString() : null;
    for (;;) {
      const rows = await remote.pullSince(table, since, PAGE);
      if (rows.length === 0) break;
      await db.transaction('rw', t, async () => {
        const locals = (await t.bulkGet(rows.map((r) => r.id))) as (Record<string, unknown> | undefined)[];
        const puts: Record<string, unknown>[] = [];
        const dels: string[] = [];
        rows.forEach((r, i) => {
          const local = locals[i];
          const localAt = (local?.updatedAt as number | undefined) ?? -1;
          // Lokal neuer (noch nicht hochgeladen) → lokale Version behalten, sie wird beim nächsten Hochladen gesendet
          if (local && (localAt > r.updated_at || (localAt === r.updated_at && !local.dirty && !r.deleted))) return;
          if (r.deleted) {
            if (local) dels.push(r.id);
            return;
          }
          puts.push({ ...r.data, [pk]: r.id, updatedAt: r.updated_at, [SYNC_MARK]: 'remote' });
        });
        for (const id of dels) remoteDeletes.add(`${table}:${id}`);
        if (dels.length) await t.bulkDelete(dels);
        if (puts.length) await t.bulkPut(puts);
        applied += puts.length + dels.length;
      });
      since = rows[rows.length - 1].synced_at;
      cursors.set(key, since);
      if (rows.length < PAGE) break;
    }
  }
  return applied;
}

/** Ein kompletter Abgleich: erst hoch, dann runter */
export async function syncOnce(ctx: SyncContext): Promise<{ sent: number; received: number }> {
  const sent = await push(ctx);
  const received = await pull(ctx);
  return { sent, received };
}

/**
 * Erster Login auf diesem Gerät: alle lokalen Daten zum Hochladen vormerken (Änderungszeit bleibt),
 * Download-Stand zurücksetzen. Danach übernimmt der Abgleich alles, ohne dass etwas verloren geht.
 */
export async function adoptLocalData({ db, userId, cursors }: SyncContext): Promise<number> {
  let n = 0;
  for (const table of SYNC_TABLES) {
    cursors.remove(cursorKey(userId, table));
    n += await db
      .table(table)
      .toCollection()
      .modify((r: Record<string, unknown>) => {
        if (typeof r.updatedAt !== 'number') r.updatedAt = 0;
        r.dirty = 1;
        r[SYNC_MARK] = 'keep';
      });
  }
  return n;
}

/** Abmelden/Konto löschen: lokale Daten dieses Geräts entfernen (im Konto bleiben sie bzw. sind gelöscht) */
export async function clearLocalData(db: SchachDB, userId: string, cursors: CursorStore) {
  for (const table of SYNC_TABLES) cursors.remove(cursorKey(userId, table));
  // Ohne Grabsteine: die Daten sollen im Konto bleiben, nur dieses Gerät wird geleert
  await withoutTombstones(() =>
    db.transaction('rw', [...SYNC_TABLES, 'tombstones'], async () => {
      for (const table of [...SYNC_TABLES, 'tombstones']) await db.table(table).clear();
    }),
  );
}
