import { createClient, type Session, type User } from '@supabase/supabase-js';
import { db } from '../db/schema';
import { onLocalChange } from '../db/syncHooks';
import { SUPABASE_KEY, SUPABASE_URL } from './config';
import { adoptLocalData, clearLocalData, syncOnce, type SyncContext } from './engine';
import { localCursors, supabaseRemote } from './remote';
import { getAccountState, setAccountState } from './state';

/** Supabase-Verbindung des Browsers (nur öffentlicher Schlüssel) */
export const client = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
});

/** Für welches Konto die lokalen Daten dieses Geräts schon übernommen wurden */
const OWNER_KEY = 'schach.sync.user';
const INTERVAL_MS = 60_000;
const DEBOUNCE_MS = 4_000;

const WRONG_LOGIN = 'Benutzername/E-Mail oder Passwort falsch.';

/** Fehlermeldungen von Supabase auf Deutsch */
export function germanError(message: string): string {
  if (/invalid login credentials/i.test(message)) return WRONG_LOGIN;
  if (/password should be at least/i.test(message)) return 'Das Passwort muss mindestens 8 Zeichen haben.';
  if (/user already registered/i.test(message)) return 'Mit dieser E-Mail gibt es schon ein Konto.';
  if (/rate limit|too many/i.test(message)) return 'Zu viele Versuche. Bitte warte ein paar Minuten.';
  if (/failed to fetch|network/i.test(message)) return 'Keine Verbindung zum Server. Bist du online?';
  return message;
}

let ctx: SyncContext | null = null;
let running: Promise<void> | null = null;
let timer: number | undefined;
let debounce: number | undefined;
let stopListening: (() => void) | null = null;

const owner = () => {
  try {
    return localStorage.getItem(OWNER_KEY);
  } catch {
    return null;
  }
};

async function loadUser(user: User): Promise<void> {
  const [{ data: profile }, { data: isAdmin }] = await Promise.all([
    client.from('profiles').select('username').eq('user_id', user.id).maybeSingle(),
    client.rpc('is_admin'),
  ]);
  setAccountState({
    status: 'signed-in',
    user: { id: user.id, email: user.email ?? '', username: (profile?.username as string) ?? '', isAdmin: !!isAdmin },
  });
}

async function onSignedIn(session: Session) {
  if (ctx?.userId === session.user.id) return;
  ctx = { db, remote: supabaseRemote(client, session.user.id), userId: session.user.id, cursors: localCursors };
  await loadUser(session.user).catch(() => setAccountState({ status: 'signed-in', user: { id: session.user.id, email: session.user.email ?? '', username: '', isAdmin: false } }));
  // Erster Login auf diesem Gerät: alles Lokale ins Konto übernehmen
  if (owner() !== session.user.id) {
    await adoptLocalData(ctx);
    localStorage.setItem(OWNER_KEY, session.user.id);
  }
  startLoop();
  void syncNow();
}

function startLoop() {
  stopLoop();
  timer = window.setInterval(() => {
    if (document.visibilityState === 'visible') void syncNow();
  }, INTERVAL_MS);
  window.addEventListener('online', onOnline);
  document.addEventListener('visibilitychange', onVisible);
  stopListening = onLocalChange(() => {
    window.clearTimeout(debounce);
    debounce = window.setTimeout(() => void syncNow(), DEBOUNCE_MS);
  });
}
function stopLoop() {
  window.clearInterval(timer);
  window.clearTimeout(debounce);
  window.removeEventListener('online', onOnline);
  document.removeEventListener('visibilitychange', onVisible);
  stopListening?.();
  stopListening = null;
}
const onOnline = () => void syncNow();
const onVisible = () => document.visibilityState === 'visible' && void syncNow();

/** Sofort abgleichen (läuft nie doppelt) */
export function syncNow(): Promise<void> {
  if (!ctx) return Promise.resolve();
  if (running) return running;
  const c = ctx;
  running = (async () => {
    if (!navigator.onLine) {
      setAccountState({ sync: 'offline', message: 'Offline – Änderungen werden später hochgeladen.' });
      return;
    }
    setAccountState({ sync: 'syncing', message: null });
    try {
      await syncOnce(c);
      setAccountState({ sync: 'idle', lastSync: Date.now(), message: null });
    } catch (e) {
      setAccountState({ sync: 'error', message: germanError((e as Error).message) });
    }
  })().finally(() => {
    running = null;
  });
  return running;
}

let initialized = false;
/** Beim Start bzw. beim ersten Öffnen der Konto-Karte */
export async function init() {
  if (initialized) return;
  initialized = true;
  client.auth.onAuthStateChange((event, session) => {
    if (session && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) void onSignedIn(session);
    if (event === 'SIGNED_OUT') {
      stopLoop();
      ctx = null;
      setAccountState({ status: 'signed-out', user: null, sync: 'idle', message: null });
    }
  });
  const { data } = await client.auth.getSession();
  if (!data.session) setAccountState({ status: 'signed-out' });
}

/** Anmelden mit Benutzername oder E-Mail */
export async function signIn(login: string, password: string): Promise<void> {
  await init();
  login = login.trim();
  if (login.includes('@')) {
    const { error } = await client.auth.signInWithPassword({ email: login, password });
    if (error) throw new Error(germanError(error.message));
    return;
  }
  let res: Response;
  try {
    res = await fetch(`${SUPABASE_URL}/functions/v1/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY },
      body: JSON.stringify({ login, password }),
    });
  } catch {
    throw new Error(germanError('failed to fetch'));
  }
  const body = (await res.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; error?: string };
  if (!res.ok || !body.access_token || !body.refresh_token) throw new Error(body.error ?? WRONG_LOGIN);
  const { error } = await client.auth.setSession({ access_token: body.access_token, refresh_token: body.refresh_token });
  if (error) throw new Error(germanError(error.message));
}

/** Registrieren mit Einladung (E-Mail + Code); die Datenbank prüft die Einladung */
export async function signUp(p: { email: string; code: string; username: string; password: string }): Promise<void> {
  await init();
  const { data, error } = await client.auth.signUp({
    email: p.email.trim().toLowerCase(),
    password: p.password,
    options: { data: { username: p.username.trim(), invite_code: p.code } },
  });
  if (error) throw new Error(germanError(error.message));
  if (!data.session) throw new Error('Konto angelegt, aber nicht angemeldet. Bitte melde dich jetzt an.');
}

/** Abmelden: erst alles hochladen, dann die Daten auf diesem Gerät entfernen (im Konto bleiben sie) */
export async function signOut(): Promise<void> {
  const c = ctx;
  if (c) {
    await syncNow();
    const pending = (await Promise.all(['games', 'analyses', 'puzzles', 'attempts', 'settings'].map((t) => db.table(t).where('dirty').equals(1).count()))).reduce((a, b) => a + b, 0);
    if (getAccountState().sync !== 'idle' || pending > 0 || (await db.tombstones.count()) > 0) {
      throw new Error('Abmelden geht erst, wenn alles hochgeladen ist. Bitte prüfe die Internetverbindung und versuche es noch einmal.');
    }
  }
  stopLoop();
  ctx = null;
  await client.auth.signOut({ scope: 'local' });
  if (c) await clearLocalData(db, c.userId, localCursors);
  localStorage.removeItem(OWNER_KEY);
}

/** Konto löschen: alle Daten im Konto und auf diesem Gerät */
export async function deleteAccount(): Promise<void> {
  const c = ctx;
  const { error } = await client.rpc('delete_my_account');
  if (error) throw new Error(germanError(error.message));
  stopLoop();
  ctx = null;
  await client.auth.signOut({ scope: 'local' });
  if (c) await clearLocalData(db, c.userId, localCursors);
  localStorage.removeItem(OWNER_KEY);
}

export async function changePassword(password: string): Promise<void> {
  const { error } = await client.auth.updateUser({ password });
  if (error) throw new Error(germanError(error.message));
}

/* ---------- Admin: Einladungen und Passwörter ---------- */

export type Invite = { email: string; created_at: string; used_at: string | null; username: string | null; is_admin: boolean };

export async function listInvites(): Promise<Invite[]> {
  const { data, error } = await client.rpc('admin_list_invites');
  if (error) throw new Error(germanError(error.message));
  return (data ?? []) as Invite[];
}

/** Gibt eine E-Mail frei; liefert den Einladungscode (nur jetzt sichtbar) */
export async function createInvite(email: string): Promise<string> {
  const { data, error } = await client.rpc('admin_create_invite', { p_email: email });
  if (error) throw new Error(germanError(error.message));
  return data as string;
}

export async function deleteInvite(email: string): Promise<void> {
  const { error } = await client.rpc('admin_delete_invite', { p_email: email });
  if (error) throw new Error(germanError(error.message));
}

export async function adminSetPassword(username: string, password: string): Promise<void> {
  const { error } = await client.rpc('admin_set_password', { p_username: username, p_password: password });
  if (error) throw new Error(germanError(error.message));
}
