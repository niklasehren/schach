// Live-Test gegen das echte Supabase-Projekt: Einladung, Login, Row Level Security, Admin, Sync, Konto löschen.
// Admin-Schritte des Tests (Testeinladungen anlegen, aufräumen) laufen über die Supabase-CLI mit dem
// Browser-Login des Entwicklers – kein geheimer Schlüssel im Code. Start: npm run test:live
import 'fake-indexeddb/auto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Dexie from 'dexie';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_KEY, SUPABASE_URL } from '../../src/sync/config';
import { SchachDB, type AnalysisRecord, type GameRecord } from '../../src/db/schema';
import { SYNC_TABLES } from '../../src/db/syncHooks';
import { adoptLocalData, syncOnce, type CursorStore, type SyncContext } from '../../src/sync/engine';
import { supabaseRemote } from '../../src/sync/remote';
import { buildPuzzles } from '../../src/training/puzzles';

/** SQL über die CLI (Rechte des Projekt-Inhabers, nur für Testvorbereitung und Prüfung) */
function sql<T = Record<string, unknown>>(query: string): T[] {
  const out = execFileSync('npx', ['supabase', 'db', 'query', '--remote', '--yes', '--output-format', 'json', query], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  return (JSON.parse(out.slice(out.indexOf('{'))).rows ?? []) as T[];
}

const RUN = Date.now().toString(36);
const user = (tag: string, code: string) => ({
  email: `schach-test-${tag}-${RUN}@example.com`,
  username: `test_${tag}_${RUN}`,
  code,
  password: `Test-Passwort-${RUN}`,
});
const A = user('a', 'AAAA2222');
const B = user('b', 'BBBB3333');
const C = user('c', 'CCCC4444');

const newClient = () => createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
let a: SupabaseClient;
let b: SupabaseClient;
let aId = '';
let bId = '';

const signUp = (c: SupabaseClient, u: typeof A, code = u.code, username = u.username) =>
  c.auth.signUp({ email: u.email, password: u.password, options: { data: { username, invite_code: code } } });

beforeAll(() => {
  // Testeinladungen: A darf Admin werden (um die Admin-Funktionen zu prüfen), B und C normal
  sql(`insert into public.invites (email, code_hash, make_admin) values
    ('${A.email}', extensions.crypt('${A.code}', extensions.gen_salt('bf')), true),
    ('${B.email}', extensions.crypt('${B.code}', extensions.gen_salt('bf')), false),
    ('${C.email}', extensions.crypt('${C.code}', extensions.gen_salt('bf')), false)`);
  a = newClient();
  b = newClient();
});

afterAll(() => {
  sql(`delete from auth.users where email like 'schach-test-%@example.com'`);
  sql(`delete from public.invites where email like 'schach-test-%@example.com'`);
});

describe('Registrierung nur mit Einladung', () => {
  it('ohne Einladung, mit falschem Code oder ungültigem Benutzernamen: abgelehnt', async () => {
    const stranger = { ...A, email: `schach-test-fremd-${RUN}@example.com` };
    expect((await signUp(newClient(), stranger)).error?.message).toContain('Keine gültige Einladung');
    expect((await signUp(newClient(), A, 'FALSCH99')).error?.message).toContain('Keine gültige Einladung');
    expect((await signUp(newClient(), A, A.code, 'x')).error?.message).toContain('Benutzername');
  });

  it('mit Einladung: Konto, Profil, Admin-Recht; der Code wird nicht gespeichert', async () => {
    const r = await signUp(a, A, 'aaaa-2222'); // Schreibweise egal
    expect(r.error).toBeNull();
    expect(r.data.session).toBeTruthy();
    aId = r.data.user!.id;
    expect(r.data.user!.user_metadata).toMatchObject({ username: A.username });
    // Der Code wird nicht gespeichert (Supabase gibt ihn nur in dieser einen Antwort zurück; er ist ab jetzt verbraucht)
    expect(sql(`select raw_user_meta_data ? 'invite_code' as has_code, raw_user_meta_data->>'username' as u from auth.users where id = '${aId}'`)).toEqual([
      { has_code: false, u: A.username },
    ]);
    expect((await a.from('profiles').select('username').single()).data).toEqual({ username: A.username });
    expect((await a.rpc('is_admin')).data).toBe(true);

    const rb = await signUp(b, B);
    expect(rb.error).toBeNull();
    bId = rb.data.user!.id;
    expect((await b.rpc('is_admin')).data).toBe(false);
  });

  it('Benutzername eindeutig (auch in anderer Schreibweise); Einladung nur einmal nutzbar', async () => {
    expect((await signUp(newClient(), C, C.code, A.username.toUpperCase())).error?.message).toContain('schon vergeben');
    expect((await signUp(newClient(), { ...B, password: 'Anderes-Passwort-1' })).error).toBeTruthy();
    const used = sql<{ used: boolean }>(`select used_at is not null as used from public.invites where email = '${B.email}'`);
    expect(used).toEqual([{ used: true }]);
  });
});

describe('Login mit Benutzername oder E-Mail', () => {
  const login = (body: object) =>
    fetch(`${SUPABASE_URL}/functions/v1/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY }, body: JSON.stringify(body) });

  it('Benutzername + Passwort liefert eine Sitzung (über die Edge Function)', async () => {
    const res = await login({ login: A.username.toUpperCase(), password: A.password });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.access_token).toBeTruthy();
    expect(body).not.toHaveProperty('email');
    const c = newClient();
    await c.auth.setSession(body);
    expect((await c.auth.getUser()).data.user?.id).toBe(aId);
  });

  it('falsches Passwort oder unbekannter Name: dieselbe Meldung, keine E-Mail', async () => {
    for (const body of [{ login: A.username, password: 'falsch-falsch' }, { login: `niemand_${RUN}`, password: 'x' }]) {
      const res = await login(body);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'Benutzername/E-Mail oder Passwort falsch.' });
    }
  });

  it('E-Mail + Passwort direkt', async () => {
    const { data, error } = await newClient().auth.signInWithPassword({ email: B.email, password: B.password });
    expect(error).toBeNull();
    expect(data.user?.id).toBe(bId);
  });
});

describe('Row Level Security: Benutzer B kommt nicht an die Daten von A', () => {
  it('lesen, ändern, löschen, unterschieben – alles abgewehrt', async () => {
    const row = { id: 'geheim', data: { pgn: '1. e4' }, updated_at: 1, deleted: false };
    for (const t of SYNC_TABLES) expect((await a.from(t).upsert({ ...row, user_id: aId }, { onConflict: 'user_id,id' })).error).toBeNull();

    for (const t of SYNC_TABLES) {
      // lesen
      expect((await b.from(t).select('*')).data).toEqual([]);
      expect((await b.from(t).select('*').eq('user_id', aId)).data).toEqual([]);
      // ändern und löschen treffen nichts
      expect((await b.from(t).update({ data: { pgn: 'gehackt' }, updated_at: 99 }).eq('id', 'geheim').select()).data).toEqual([]);
      expect((await b.from(t).delete().eq('id', 'geheim').select()).data).toEqual([]);
      // Zeile mit fremder user_id anlegen: verboten
      const ins = await b.from(t).insert({ ...row, id: 'untergeschoben', user_id: aId });
      expect(ins.error?.message).toMatch(/row-level security/);
    }
    // A sieht alles unverändert
    for (const t of SYNC_TABLES) expect((await a.from(t).select('id,data').eq('id', 'geheim').single()).data).toEqual({ id: 'geheim', data: { pgn: '1. e4' } });
    // Gegenprobe über SQL: genau eine Zeile pro Tabelle, und die gehört A
    for (const t of SYNC_TABLES) expect(sql(`select user_id::text as u, data->>'pgn' as p from public.${t} where id = 'geheim'`)).toEqual([{ u: aId, p: '1. e4' }]);
  });

  it('ohne Anmeldung: kein Zugriff; Profile, Einladungen und Admin-Funktionen sind geschützt', async () => {
    const anon = newClient();
    for (const t of SYNC_TABLES) expect((await anon.from(t).select('*')).error?.message).toMatch(/permission denied/);
    expect((await b.from('profiles').select('username')).data).toEqual([{ username: B.username }]);
    expect((await b.from('invites').select('*')).error?.message).toMatch(/permission denied/);
    expect((await b.rpc('admin_list_invites')).error?.message).toContain('Nur für Admins');
    expect((await b.rpc('admin_create_invite', { p_email: 'x@example.com' })).error?.message).toContain('Nur für Admins');
    expect((await b.rpc('admin_set_password', { p_username: A.username, p_password: 'neues-Passwort-1' })).error?.message).toContain('Nur für Admins');
    expect((await b.rpc('email_for_username', { p_username: A.username })).error).toBeTruthy();
    expect((await anon.rpc('email_for_username', { p_username: A.username })).error).toBeTruthy();
    expect((await anon.rpc('delete_my_account')).error).toBeTruthy();
  });

  it('Admin A: Einladung anlegen und Passwort von B zurücksetzen', async () => {
    const email = `schach-test-neu-${RUN}@example.com`;
    const code = (await a.rpc('admin_create_invite', { p_email: email.toUpperCase() })).data as string;
    expect(code).toMatch(/^[A-HJ-KM-NP-Z2-9]{8}$/);
    const list = (await a.rpc('admin_list_invites')).data as { email: string; used_at: string | null; username: string | null }[];
    expect(list.find((i) => i.email === email)).toMatchObject({ used_at: null, username: null });
    expect(list.find((i) => i.email === B.email)).toMatchObject({ username: B.username });
    // Code im Klartext nirgends gespeichert
    expect(sql(`select code_hash like '$2%' as bcrypt from public.invites where email = '${email}'`)).toEqual([{ bcrypt: true }]);

    expect((await a.rpc('admin_set_password', { p_username: B.username, p_password: 'Vorlaeufig-123' })).error).toBeNull();
    expect((await newClient().auth.signInWithPassword({ email: B.email, password: B.password })).error).toBeTruthy();
    expect((await newClient().auth.signInWithPassword({ email: B.email, password: 'Vorlaeufig-123' })).error).toBeNull();
  });
});

describe('Synchronisierung über Supabase mit zwei Geräten', () => {
  const memCursors = (): CursorStore => {
    const m = new Map<string, string>();
    return { get: (k) => m.get(k) ?? null, set: (k, v) => void m.set(k, v), remove: (k) => void m.delete(k) };
  };
  const dev = (name: string): SyncContext => ({ db: new SchachDB(`${name}-${RUN}`), remote: supabaseRemote(a, aId), userId: aId, cursors: memCursors() });

  it('erster Login übernimmt lokale Daten, Gerät 2 bekommt alles, der neueste Stand gewinnt', async () => {
    const d1 = dev('live1');
    const d2 = dev('live2');
    const g = { id: 'app-1', pgn: '1. d4 d5', date: 5, source: 'app', white: { name: 'Ich' }, black: { name: 'X' } } as unknown as GameRecord;
    await d1.db.games.add(g);
    await d1.db.puzzles.add({ id: 'app-1:3', gameId: 'app-1', box: 0 } as never);
    await adoptLocalData(d1);
    await syncOnce(d1);

    await d2.db.games.add({ ...g, id: 'app-2' });
    await adoptLocalData(d2);
    await syncOnce(d2);
    await syncOnce(d1);
    for (const d of [d1, d2]) {
      expect((await d.db.games.toArray()).map((x) => x.id).sort()).toEqual(['app-1', 'app-2', 'geheim']);
    }
    // Konflikt: Gerät 2 später, Gerät 1 gleicht zuletzt ab → Server behält Gerät 2
    await d1.db.puzzles.update('app-1:3', { box: 2 });
    await new Promise((r) => setTimeout(r, 20));
    await d2.db.puzzles.update('app-1:3', { box: 4 });
    await syncOnce(d2);
    await syncOnce(d1);
    expect((await d1.db.puzzles.get('app-1:3'))?.box).toBe(4);
    expect(sql(`select (data->>'box')::int as box from public.puzzles where user_id = '${aId}' and id = 'app-1:3'`)).toEqual([{ box: 4 }]);
    for (const d of [d1, d2]) {
      d.db.close();
      await Dexie.delete(d.db.name);
    }
  });
});

// Speicherbedarf mit echten Daten (101 Partien mit Analysen), nur wenn die Datei lokal vorliegt
const SIZE_DATA = process.env.SCHACH_SIZE_DATA;
describe.runIf(SIZE_DATA && existsSync(SIZE_DATA))('Speicherbedarf', () => {
  it('101 Partien mit Analysen und Puzzles hochladen und messen', async () => {
    const items = JSON.parse(readFileSync(SIZE_DATA!, 'utf8')) as { game: GameRecord; analysis: AnalysisRecord }[];
    const list = Array.isArray(items) ? items : Object.values(items);
    const d = { db: new SchachDB(`size-${RUN}`), remote: supabaseRemote(b, bId), userId: bId, cursors: { get: () => null, set: () => {}, remove: () => {} } };
    const signIn = await b.auth.signInWithPassword({ email: B.email, password: 'Vorlaeufig-123' });
    expect(signIn.error).toBeNull();
    await d.db.games.bulkPut(list.map((x) => x.game));
    await d.db.analyses.bulkPut(list.map((x) => x.analysis));
    await d.db.puzzles.bulkPut(list.flatMap((x) => buildPuzzles(x.game, x.analysis)));
    await syncOnce(d);
    const sizes = sql<{ t: string; rows: number; bytes: number }>(
      SYNC_TABLES.map((t) => `select '${t}' as t, count(*)::int as rows, coalesce(sum(pg_column_size(data)),0)::int + count(*)::int * 100 as bytes from public.${t} where user_id = '${bId}'`).join(' union all '),
    );
    console.log('SPEICHER', JSON.stringify(sizes));
    expect(sizes.find((s) => s.t === 'games')?.rows).toBe(list.length);
    d.db.close();
    await Dexie.delete(d.db.name);
  });
});

describe('Konto löschen', () => {
  it('B löscht sein Konto: alle Daten von B weg, A unberührt', async () => {
    const before = sql<{ n: number }>(`select count(*)::int as n from public.games where user_id = '${bId}'`);
    await b.from('games').upsert({ id: 'b-eigen', data: {}, updated_at: 1, deleted: false, user_id: bId }, { onConflict: 'user_id,id' });
    expect((await b.rpc('delete_my_account')).error).toBeNull();
    const left = sql<{ n: number }>(
      `select (select count(*) from auth.users where id = '${bId}')
        + (select count(*) from public.profiles where user_id = '${bId}')
        + (select count(*) from public.invites where used_by = '${bId}' or email = '${B.email}')
        ${SYNC_TABLES.map((t) => `+ (select count(*) from public.${t} where user_id = '${bId}')`).join(' ')} as n`,
    );
    expect(left).toEqual([{ n: 0 }]);
    expect(before.length).toBe(1);
    expect(sql<{ n: number }>(`select count(*)::int as n from public.games where user_id = '${aId}'`)[0].n).toBeGreaterThan(0);
    // Mit dem gelöschten Konto kann man sich nicht mehr anmelden
    expect((await newClient().auth.signInWithPassword({ email: B.email, password: 'Vorlaeufig-123' })).error).toBeTruthy();
  });
});
