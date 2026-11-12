import type { SupabaseClient } from '@supabase/supabase-js';
import type { SyncTable } from '../db/syncHooks';
import type { Remote, RemoteRow } from './engine';

/** Server-Zugriff über Supabase. user_id wird mitgeschickt; Row Level Security erlaubt nur die eigene. */
export function supabaseRemote(client: SupabaseClient, userId: string): Remote {
  return {
    async upsert(table: SyncTable, rows) {
      if (rows.length === 0) return;
      const { error } = await client.from(table).upsert(
        rows.map((r) => ({ ...r, user_id: userId })),
        { onConflict: 'user_id,id' },
      );
      if (error) throw new Error(`${table}: ${error.message}`);
    },
    async pullSince(table: SyncTable, since, limit) {
      let q = client.from(table).select('id,data,updated_at,deleted,synced_at').order('synced_at').order('id').limit(limit);
      if (since) q = q.gt('synced_at', since);
      const { data, error } = await q;
      if (error) throw new Error(`${table}: ${error.message}`);
      return (data ?? []) as RemoteRow[];
    },
  };
}

/** Speichert die Download-Stände im localStorage */
export const localCursors = {
  get: (k: string) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* privat-Modus: dann wird beim nächsten Mal alles neu verglichen */
    }
  },
  remove: (k: string) => {
    try {
      localStorage.removeItem(k);
    } catch {
      /* egal */
    }
  },
};
