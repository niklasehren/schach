-- Schritt 13: Konten (nur mit Einladung) und Synchronisierung der lokalen Daten.
-- Grundsatz: Jeder sieht und ändert nur seine eigenen Zeilen (Row Level Security).

-- ---------------------------------------------------------------------------
-- Profile: eindeutiger Benutzername (Groß-/Kleinschreibung egal)
-- ---------------------------------------------------------------------------
create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  username text not null check (username ~ '^[A-Za-z0-9_.-]{3,30}$'),
  created_at timestamptz not null default now()
);
create unique index profiles_username_lower on public.profiles (lower(username));
alter table public.profiles enable row level security;
create policy "eigenes Profil lesen" on public.profiles for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.profiles from anon;
grant select on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- Admins: dürfen einladen und Passwörter zurücksetzen. Einträge nur über SQL bzw. Einladung mit make_admin.
-- ---------------------------------------------------------------------------
create table public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade
);
alter table public.admins enable row level security;
create policy "eigenen Admin-Eintrag sehen" on public.admins for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.admins from anon;
grant select on public.admins to authenticated;

create function public.is_admin() returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.admins where user_id = (select auth.uid())) $$;
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- Einladungen: freigegebene E-Mail + Einladungscode (nur als Hash gespeichert).
-- Keine Policies für anon/authenticated → nur über die Admin-Funktionen unten erreichbar.
-- ---------------------------------------------------------------------------
create table public.invites (
  email text primary key check (email = lower(email) and email like '%@%'),
  code_hash text not null,
  make_admin boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  used_by uuid references auth.users (id) on delete set null,
  used_at timestamptz
);
alter table public.invites enable row level security;
revoke all on public.invites from anon, authenticated;

-- Einladungscode: 8 Zeichen ohne verwechselbare Zeichen (kein 0/O, 1/I/L), ca. 40 Bit
create function public.gen_invite_code() returns text
language sql volatile set search_path = ''
as $$
  select string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 1 + (get_byte(b, i) % 31), 1), '' order by i)
  from (select extensions.gen_random_bytes(8) as b) x, generate_series(0, 7) as i
$$;
revoke execute on function public.gen_invite_code() from public, anon, authenticated;

-- Eingaben wie „abcd-efgh“ oder „ABCD EFGH“ vereinheitlichen
create function public.normalize_invite_code(p text) returns text
language sql immutable set search_path = ''
as $$ select upper(regexp_replace(coalesce(p, ''), '[^A-Za-z0-9]', '', 'g')) $$;

-- ---------------------------------------------------------------------------
-- Registrierung nur mit Einladung: Auth-Hook „Before User Created“ (Gratis-Plan).
-- Läuft als supabase_auth_admin, ohne security definer (Vorgabe von Supabase).
-- Prüft E-Mail + Code + freien Benutzernamen; die Meldung landet in der App.
-- ---------------------------------------------------------------------------
create function public.hook_before_user_created(event jsonb) returns jsonb
language plpgsql
as $$
declare
  v_email text := lower(event -> 'user' ->> 'email');
  v_meta jsonb := coalesce(event -> 'user' -> 'user_metadata', '{}'::jsonb);
  v_code text := public.normalize_invite_code(v_meta ->> 'invite_code');
  v_username text := btrim(v_meta ->> 'username');
  v_hash text;
  v_used timestamptz;
begin
  select code_hash, used_at into v_hash, v_used from public.invites where email = v_email;
  if not found or v_used is not null or v_code = '' or extensions.crypt(v_code, v_hash) <> v_hash then
    return jsonb_build_object('error', jsonb_build_object('http_code', 403,
      'message', 'Keine gültige Einladung für diese E-Mail-Adresse und diesen Code.'));
  end if;
  if v_username is null or v_username !~ '^[A-Za-z0-9_.-]{3,30}$' then
    return jsonb_build_object('error', jsonb_build_object('http_code', 400,
      'message', 'Benutzername: 3–30 Zeichen, nur Buchstaben, Ziffern, Punkt, Bindestrich und Unterstrich.'));
  end if;
  if exists (select 1 from public.profiles where lower(username) = lower(v_username)) then
    return jsonb_build_object('error', jsonb_build_object('http_code', 409,
      'message', 'Dieser Benutzername ist schon vergeben.'));
  end if;
  return '{}'::jsonb;
end;
$$;
grant usage on schema public to supabase_auth_admin;
grant usage on schema extensions to supabase_auth_admin;
grant execute on function public.hook_before_user_created(jsonb) to supabase_auth_admin;
grant execute on function public.normalize_invite_code(text) to supabase_auth_admin;
revoke execute on function public.hook_before_user_created(jsonb) from authenticated, anon, public;
grant select on public.invites, public.profiles to supabase_auth_admin;
create policy "Auth liest Einladungen" on public.invites for select to supabase_auth_admin using (true);
create policy "Auth liest Profile" on public.profiles for select to supabase_auth_admin using (true);

-- Vor dem Anlegen: Einladungscode nicht in den Benutzerdaten speichern
create function public.strip_invite_code() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  new.raw_user_meta_data := coalesce(new.raw_user_meta_data, '{}'::jsonb) - 'invite_code';
  return new;
end;
$$;
create trigger strip_invite_code before insert on auth.users
  for each row execute function public.strip_invite_code();

-- Nach dem Anlegen: Profil erstellen, Einladung als benutzt markieren, ggf. Admin eintragen
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_admin boolean;
begin
  insert into public.profiles (user_id, username) values (new.id, btrim(new.raw_user_meta_data ->> 'username'));
  update public.invites set used_by = new.id, used_at = now() where email = lower(new.email)
    returning make_admin into v_admin;
  if coalesce(v_admin, false) then
    insert into public.admins (user_id) values (new.id) on conflict do nothing;
  end if;
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Admin-Funktionen (prüfen selbst, ob der Aufrufer Admin ist)
-- ---------------------------------------------------------------------------
create function public.admin_list_invites()
returns table (email text, created_at timestamptz, used_at timestamptz, username text, is_admin boolean)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'Nur für Admins' using errcode = '42501'; end if;
  return query
    select i.email, i.created_at, i.used_at, p.username, (a.user_id is not null)
    from public.invites i
    left join public.profiles p on p.user_id = i.used_by
    left join public.admins a on a.user_id = i.used_by
    order by i.created_at desc;
end;
$$;

-- Gibt E-Mail frei und liefert den Code im Klartext (nur dieses eine Mal sichtbar)
create function public.admin_create_invite(p_email text) returns text
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_email text := lower(btrim(p_email));
  v_code text := public.gen_invite_code();
begin
  if not public.is_admin() then raise exception 'Nur für Admins' using errcode = '42501'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Ungültige E-Mail-Adresse' using errcode = '22023'; end if;
  if exists (select 1 from public.invites where email = v_email and used_at is not null) then
    raise exception 'Mit dieser E-Mail gibt es schon ein Konto' using errcode = '23505';
  end if;
  insert into public.invites (email, code_hash, created_by)
    values (v_email, extensions.crypt(v_code, extensions.gen_salt('bf')), (select auth.uid()))
    on conflict (email) do update set code_hash = excluded.code_hash, created_at = now(), created_by = excluded.created_by;
  return v_code;
end;
$$;

create function public.admin_delete_invite(p_email text) returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'Nur für Admins' using errcode = '42501'; end if;
  delete from public.invites where email = lower(btrim(p_email)) and used_at is null;
end;
$$;

-- Passwort vergessen: Admin setzt ein vorläufiges Passwort (bcrypt wie Supabase Auth)
create function public.admin_set_password(p_username text, p_password text) returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_user uuid;
begin
  if not public.is_admin() then raise exception 'Nur für Admins' using errcode = '42501'; end if;
  if length(coalesce(p_password, '')) < 8 then raise exception 'Passwort: mindestens 8 Zeichen' using errcode = '22023'; end if;
  select user_id into v_user from public.profiles where lower(username) = lower(btrim(p_username));
  if v_user is null then raise exception 'Benutzer nicht gefunden' using errcode = 'P0002'; end if;
  update auth.users set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')), updated_at = now()
    where id = v_user;
end;
$$;

revoke execute on function public.admin_list_invites(), public.admin_create_invite(text), public.admin_delete_invite(text),
  public.admin_set_password(text, text) from public, anon;
grant execute on function public.admin_list_invites(), public.admin_create_invite(text), public.admin_delete_invite(text),
  public.admin_set_password(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Login mit Benutzername: nur die Edge Function „login“ (service_role) darf die E-Mail nachschlagen
-- ---------------------------------------------------------------------------
create function public.email_for_username(p_username text) returns text
language sql stable security definer set search_path = ''
as $$
  select u.email from public.profiles p join auth.users u on u.id = p.user_id
  where lower(p.username) = lower(btrim(p_username))
$$;
revoke execute on function public.email_for_username(text) from public, anon, authenticated;
grant execute on function public.email_for_username(text) to service_role;

-- ---------------------------------------------------------------------------
-- Konto löschen: entfernt das Konto und über „on delete cascade“ alle Daten
-- ---------------------------------------------------------------------------
create function public.delete_my_account() returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null then raise exception 'Nicht angemeldet' using errcode = '42501'; end if;
  delete from public.invites where used_by = v_user;
  delete from auth.users where id = v_user;
end;
$$;
revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- ---------------------------------------------------------------------------
-- Synchronisierte Daten: die fünf lokalen Tabellen (Abschnitt 5 in PLAN.md).
-- Jede Zeile = ein lokaler Datensatz als JSON. updated_at = Änderungszeit auf dem Gerät (ms),
-- synced_at = Serverzeit (für „was ist neu seit …“). Gelöschte Datensätze bleiben als deleted = true.
-- ---------------------------------------------------------------------------
create function public.sync_keep_newest() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    -- Konflikt: der neueste Stand gewinnt; ältere Änderungen werden still verworfen
    if new.updated_at < old.updated_at then return null; end if;
    new.user_id := old.user_id;
  end if;
  new.synced_at := clock_timestamp();
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['games', 'analyses', 'puzzles', 'attempts', 'settings'] loop
    execute format($f$
      create table public.%1$I (
        user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
        id text not null,
        data jsonb,
        updated_at bigint not null,
        deleted boolean not null default false,
        synced_at timestamptz not null default clock_timestamp(),
        primary key (user_id, id)
      );
      create index %2$I on public.%1$I (user_id, synced_at);
      alter table public.%1$I enable row level security;
      create policy "eigene Daten lesen" on public.%1$I for select to authenticated using (user_id = (select auth.uid()));
      create policy "eigene Daten anlegen" on public.%1$I for insert to authenticated with check (user_id = (select auth.uid()));
      create policy "eigene Daten ändern" on public.%1$I for update to authenticated
        using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
      create policy "eigene Daten löschen" on public.%1$I for delete to authenticated using (user_id = (select auth.uid()));
      revoke all on public.%1$I from anon;
      grant select, insert, update, delete on public.%1$I to authenticated;
      create trigger keep_newest before insert or update on public.%1$I
        for each row execute function public.sync_keep_newest();
    $f$, t, t || '_synced');
  end loop;
end;
$$;
