import { getSetting, setSetting } from '../db/games';
import { importChessCom, type Fetcher } from './importer';

export const AUTO_KEY = 'chesscomAutoImport';
const LAST_KEY = 'chesscomAutoImportLast';
const USERNAME_KEY = 'chesscomUsername';
/** Höchstens alle 10 Minuten */
export const AUTO_INTERVAL_MS = 10 * 60 * 1000;

export async function autoImportEnabled(): Promise<boolean> {
  return (await getSetting<boolean>(AUTO_KEY)) ?? true;
}

/**
 * Holt leise neue Partien (aktueller und vorheriger Monat), wenn ein Name gespeichert ist,
 * der Schalter an ist und der letzte Versuch mindestens 10 Minuten her ist.
 * Gibt die Anzahl neuer Partien zurück; Fehler (z. B. kein Internet) werden verschluckt.
 */
export async function maybeAutoImport(deps: { now?: number; fetch?: Fetcher; force?: boolean } = {}): Promise<number> {
  const now = deps.now ?? Date.now();
  const name = await getSetting<string>(USERNAME_KEY);
  if (!name || !(await autoImportEnabled())) return 0;
  const last = (await getSetting<number>(LAST_KEY)) ?? 0;
  if (!deps.force && now - last < AUTO_INTERVAL_MS) return 0;
  // Zeitpunkt vorher merken: auch ein fehlgeschlagener Versuch zählt, damit offline nicht ständig angefragt wird
  await setSetting(LAST_KEY, now);
  try {
    const summary = await importChessCom(name, 'last2', undefined, { fetch: deps.fetch, now: new Date(now), wait: async () => {} });
    return summary.added;
  } catch {
    return 0;
  }
}
