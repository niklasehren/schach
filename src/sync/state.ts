import { useSyncExternalStore } from 'react';
import { PROJECT_REF } from './config';

/** Zustand von Konto und Synchronisierung – klein und immer geladen; Supabase selbst wird erst bei Bedarf geladen */
export type AccountUser = { id: string; username: string; email: string; isAdmin: boolean };
export type AccountState = {
  status: 'unknown' | 'signed-out' | 'signed-in';
  user: AccountUser | null;
  sync: 'idle' | 'syncing' | 'error' | 'offline';
  lastSync: number | null;
  message: string | null;
};

let state: AccountState = { status: 'unknown', user: null, sync: 'idle', lastSync: null, message: null };
const listeners = new Set<() => void>();

export function setAccountState(patch: Partial<AccountState>) {
  state = { ...state, ...patch };
  listeners.forEach((fn) => fn());
}
export const getAccountState = () => state;

export function useAccount(): AccountState {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => state,
  );
}

/** Supabase speichert die Sitzung unter diesem Schlüssel; liegt er vor, wird das Konto beim Start geladen */
export const SESSION_KEY = `sb-${PROJECT_REF}-auth-token`;
export function hasStoredSession(): boolean {
  try {
    return !!localStorage.getItem(SESSION_KEY);
  } catch {
    return false;
  }
}

/** Lädt den Konto-Teil (mit Supabase) erst, wenn er gebraucht wird */
export const loadAccount = () => import('./account');

/** Beim Start: nur mit gespeicherter Sitzung Supabase laden und im Hintergrund synchronisieren */
export function startAccountIfSignedIn() {
  if (hasStoredSession()) void loadAccount().then((m) => m.init());
  else setAccountState({ status: 'signed-out' });
}
