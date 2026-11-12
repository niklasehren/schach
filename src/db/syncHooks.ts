import type Dexie from 'dexie';

/** Tabellen, die mit dem Konto synchronisiert werden (Abschnitt 5 in PLAN.md) */
export const SYNC_TABLES = ['games', 'analyses', 'puzzles', 'attempts', 'settings'] as const;
export type SyncTable = (typeof SYNC_TABLES)[number];

/** Felder, die jede synchronisierte Zeile lokal zusätzlich trägt */
export type SyncFields = {
  /** Zeitpunkt der letzten Änderung (ms); 0 = vor Schritt 13 entstanden, Zeit unbekannt */
  updatedAt?: number;
  /** 1 = lokal geändert, noch nicht hochgeladen (indiziert) */
  dirty?: 1;
};

/** Gelöschte Datensätze, deren Löschung noch hochgeladen werden muss */
export type Tombstone = { id: string; table: SyncTable; key: string; deletedAt: number };

/**
 * Markierung für Schreibvorgänge der Synchronisierung selbst:
 * 'remote' = kommt vom Server (updatedAt bleibt, nicht „dirty“), 'keep' = Felder unverändert lassen.
 * Wird vor dem Speichern wieder entfernt.
 */
export const SYNC_MARK = '__sync';

/** Schlüssel, deren Löschung vom Server kommt – dafür keinen Grabstein anlegen */
export const remoteDeletes = new Set<string>();

/**
 * Solange > 0, legen Löschungen keine Grabsteine an (Gerät leeren beim Abmelden).
 * Wichtig: Sonst würde das Leeren beim nächsten Abgleich die Daten im Konto löschen.
 */
let localOnly = 0;
export async function withoutTombstones<T>(fn: () => Promise<T>): Promise<T> {
  localOnly++;
  try {
    return await fn();
  } finally {
    localOnly--;
  }
}

type Listener = () => void;
const listeners = new Set<Listener>();
/** Benachrichtigung bei lokalen Änderungen (für die verzögerte Hintergrund-Synchronisierung) */
export function onLocalChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
const notify = () => queueMicrotask(() => listeners.forEach((fn) => fn()));

type Row = Record<string, unknown>;

/** Hängt Zeitstempel, „dirty“ und Grabsteine an alle Schreibvorgänge der synchronisierten Tabellen */
export function installSyncHooks(db: Dexie) {
  for (const name of SYNC_TABLES) {
    const table = db.table(name);
    table.hook('creating', (_key, obj: Row) => {
      const mark = obj[SYNC_MARK];
      if (mark) {
        delete obj[SYNC_MARK];
        if (mark === 'remote') delete obj.dirty;
        return;
      }
      obj.updatedAt = Date.now();
      obj.dirty = 1;
      notify();
    });
    table.hook('updating', (modifications: object): Row | void => {
      const mods = modifications as Row;
      const mark = mods[SYNC_MARK];
      if (mark) return mark === 'remote' ? { [SYNC_MARK]: undefined, dirty: undefined } : { [SYNC_MARK]: undefined };
      // Nur Zeitstempel/Markierung geändert oder gar nichts → keine echte Änderung
      if (Object.keys(mods).every((k) => k === 'updatedAt' || k === 'dirty')) return;
      notify();
      return { updatedAt: Date.now(), dirty: 1 };
    });
    table.hook('deleting', (key, _obj, tx) => {
      const id = `${name}:${String(key)}`;
      if (remoteDeletes.delete(id) || localOnly > 0) return;
      tx.on('complete', () => {
        void db
          .table('tombstones')
          .put({ id, table: name, key: String(key), deletedAt: Date.now() } satisfies Tombstone)
          .then(notify);
      });
    });
  }
}
