-- Der Einladungscode darf nicht in den Benutzerdaten bleiben.
-- Supabase Auth schreibt die Metadaten nach dem Anlegen noch einmal per UPDATE –
-- deshalb den Code auch dabei entfernen (und vorhandene Reste löschen).
drop trigger if exists strip_invite_code on auth.users;
create trigger strip_invite_code before insert or update of raw_user_meta_data on auth.users
  for each row execute function public.strip_invite_code();

update auth.users set raw_user_meta_data = raw_user_meta_data - 'invite_code' where raw_user_meta_data ? 'invite_code';
