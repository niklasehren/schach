import { useEffect, useState, type DependencyList } from 'react';
import { liveQuery } from 'dexie';

/** Liest aus der Datenbank und aktualisiert automatisch, wenn sich die Daten ändern. undefined = lädt noch. */
export function useLive<T>(query: () => Promise<T>, deps: DependencyList): T | undefined {
  const [value, setValue] = useState<T | undefined>(undefined);
  useEffect(() => {
    const sub = liveQuery(query).subscribe({ next: setValue, error: () => setValue(undefined) });
    return () => sub.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return value;
}
