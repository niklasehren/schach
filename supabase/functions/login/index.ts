// Login mit Benutzername (oder E-Mail) und Passwort.
// Schlägt die E-Mail zum Benutzernamen nach (nur hier, mit dem geheimen Schlüssel, der nur auf dem Server liegt)
// und meldet dann ganz normal mit dem öffentlichen Schlüssel an. Die E-Mail verlässt den Server nie.
import { createClient } from 'npm:@supabase/supabase-js@2.119.0';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const WRONG = { error: 'Benutzername/E-Mail oder Passwort falsch.' };

const env = (...names: string[]) => {
  for (const n of names) {
    const v = Deno.env.get(n);
    if (v) return v;
  }
  throw new Error(`Fehlende Umgebungsvariable ${names.join('/')}`);
};
// Neue Schlüssel (sb_secret_/sb_publishable_) als JSON-Objekt, sonst die klassischen
const firstKey = (name: string) => {
  const raw = Deno.env.get(name);
  if (!raw) return undefined;
  try {
    return Object.values(JSON.parse(raw) as Record<string, string>)[0];
  } catch {
    return undefined;
  }
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Nur POST' }, 405);
  let login = '';
  let password = '';
  try {
    const body = await req.json();
    login = String(body.login ?? '').trim();
    password = String(body.password ?? '');
  } catch {
    return json({ error: 'Ungültige Anfrage' }, 400);
  }
  if (!login || !password) return json(WRONG, 400);

  const url = env('SUPABASE_URL');
  const secret = firstKey('SUPABASE_SECRET_KEYS') ?? env('SUPABASE_SERVICE_ROLE_KEY');
  const publishable = firstKey('SUPABASE_PUBLISHABLE_KEYS') ?? env('SUPABASE_ANON_KEY');

  let email = login;
  if (!login.includes('@')) {
    const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await admin.rpc('email_for_username', { p_username: login });
    if (error) return json({ error: 'Anmeldung gerade nicht möglich.' }, 500);
    if (!data) return json(WRONG, 400);
    email = data as string;
  }

  const anon = createClient(url, publishable, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await anon.auth.signInWithPassword({ email, password });
  if (error || !data.session) return json(WRONG, 400);
  const { access_token, refresh_token } = data.session;
  return json({ access_token, refresh_token });
});
