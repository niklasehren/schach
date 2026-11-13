import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { CloudCheck, CloudOff, Copy, KeyRound, LoaderCircle, LogOut, RefreshCw, ShieldCheck, Trash2, UserPlus } from 'lucide-react';
import { loadAccount, useAccount } from '../sync/state';
import type { Invite } from '../sync/account';
import { Button } from '@/components/ui/button';
import { fieldLabel, Section, SectionContent, SectionDescription, SectionHeader, SectionTitle } from '@/components/Section';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const APP_URL = 'https://niklasehren.github.io/schach/';
const formatCode = (c: string) => (c.length === 8 ? `${c.slice(0, 4)}-${c.slice(4)}` : c);

/** Formular-Hilfe: läuft, Fehler, Erfolg */
function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, run, setError };
}

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className={fieldLabel}>
        {label}
      </Label>
      {children}
    </div>
  );
}

function ErrorText({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p className="font-semibold text-destructive" role="alert" data-testid="account-error">
      {error}
    </p>
  );
}

/** Konto: anmelden/registrieren oder (angemeldet) Status, Passwort, Abmelden, Konto löschen */
export function AccountCard() {
  const account = useAccount();
  return (
    <Section data-testid="account-card">
      <SectionHeader>
        <SectionTitle>Konto & Synchronisierung</SectionTitle>
        <SectionDescription>
          Freiwillig. Ohne Konto bleibt alles nur auf diesem Gerät. Mit Konto werden deine Partien, Analysen und Puzzles zwischen deinen Geräten abgeglichen.
        </SectionDescription>
      </SectionHeader>
      <SectionContent>
        {account.status === 'unknown' ? (
          <p className="text-muted-foreground">Lädt …</p>
        ) : account.status === 'signed-in' && account.user ? (
          <SignedIn />
        ) : (
          <SignInForms />
        )}
      </SectionContent>
    </Section>
  );
}

function SignInForms() {
  const login = useAction();
  const reg = useAction();
  const [form, setForm] = useState({ login: '', password: '', email: '', code: '', username: '', newPassword: '' });
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const onLogin = (e: FormEvent) => {
    e.preventDefault();
    void login.run(async () => (await loadAccount()).signIn(form.login, form.password));
  };
  const onRegister = (e: FormEvent) => {
    e.preventDefault();
    if (form.newPassword.length < 8) return reg.setError('Das Passwort muss mindestens 8 Zeichen haben.');
    void reg.run(async () => (await loadAccount()).signUp({ email: form.email, code: form.code, username: form.username, password: form.newPassword }));
  };

  return (
    <Tabs defaultValue="login" className="gap-4">
      <TabsList variant="line" className="h-10 justify-start gap-1">
        <TabsTrigger value="login" className="px-2.5 text-[15px]">
          Anmelden
        </TabsTrigger>
        <TabsTrigger value="register" className="px-2.5 text-[15px]">
          Registrieren
        </TabsTrigger>
      </TabsList>
      <TabsContent value="login">
        <form className="flex flex-col gap-3" onSubmit={onLogin} data-testid="login-form">
          <Field id="login" label="Benutzername oder E-Mail">
            <Input id="login" autoComplete="username" value={form.login} onChange={set('login')} required className="h-11 text-base" />
          </Field>
          <Field id="password" label="Passwort">
            <Input id="password" type="password" autoComplete="current-password" value={form.password} onChange={set('password')} required className="h-11 text-base" />
          </Field>
          <ErrorText error={login.error} />
          <Button type="submit" size="lg" className="h-12 self-start px-6 text-base font-bold max-md:self-stretch" disabled={login.busy}>
            {login.busy && <LoaderCircle className="animate-spin" data-icon="inline-start" />} Anmelden
          </Button>
          <p className="text-sm text-muted-foreground">Passwort vergessen? Frag Niklas – er setzt dir ein vorläufiges Passwort, das du danach hier änderst.</p>
        </form>
      </TabsContent>
      <TabsContent value="register">
        <form className="flex flex-col gap-3" onSubmit={onRegister} data-testid="register-form">
          <p className="text-sm text-muted-foreground">Nur mit Einladung: Du brauchst die freigegebene E-Mail-Adresse und den Einladungscode von Niklas.</p>
          <Field id="reg-email" label="E-Mail">
            <Input id="reg-email" type="email" autoComplete="email" value={form.email} onChange={set('email')} required className="h-11 text-base" />
          </Field>
          <Field id="reg-code" label="Einladungscode">
            <Input id="reg-code" autoComplete="off" placeholder="ABCD-EFGH" value={form.code} onChange={set('code')} required className="h-11 text-base uppercase" />
          </Field>
          <Field id="reg-username" label="Benutzername (3–30 Zeichen: Buchstaben, Ziffern, . _ -)">
            <Input
              id="reg-username"
              autoComplete="username"
              pattern="[A-Za-z0-9_.\-]{3,30}"
              value={form.username}
              onChange={set('username')}
              required
              className="h-11 text-base"
            />
          </Field>
          <Field id="reg-password" label="Passwort (mindestens 8 Zeichen)">
            <Input id="reg-password" type="password" autoComplete="new-password" value={form.newPassword} onChange={set('newPassword')} required className="h-11 text-base" />
          </Field>
          <ErrorText error={reg.error} />
          <Button type="submit" size="lg" className="h-12 self-start px-6 text-base font-bold max-md:self-stretch" disabled={reg.busy}>
            {reg.busy && <LoaderCircle className="animate-spin" data-icon="inline-start" />} Konto anlegen
          </Button>
          <p className="text-sm text-muted-foreground">Deine Partien und dein Training auf diesem Gerät werden ins neue Konto übernommen.</p>
        </form>
      </TabsContent>
    </Tabs>
  );
}

function SignedIn() {
  const account = useAccount();
  const user = account.user!;
  const sync = useAction();
  const out = useAction();
  const del = useAction();
  const pw = useAction();
  const [newPw, setNewPw] = useState('');
  const [pwDone, setPwDone] = useState(false);
  const [confirmOut, setConfirmOut] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [typed, setTyped] = useState('');

  const status =
    account.sync === 'syncing'
      ? 'Wird abgeglichen …'
      : account.sync === 'error' || account.sync === 'offline'
        ? account.message
        : account.lastSync
          ? `Zuletzt abgeglichen: ${new Date(account.lastSync).toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' })}`
          : 'Noch nicht abgeglichen';

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-semibold" data-testid="account-user">
          Angemeldet als {user.username || user.email}
        </span>
        {user.isAdmin && (
          <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
            <ShieldCheck className="size-4" /> Admin
          </span>
        )}
        <span className="w-full text-[15px] text-muted-foreground">{user.email}</span>
      </div>
      <div className="flex items-center gap-2 text-[15px] text-muted-foreground" role="status" data-testid="sync-status">
        {account.sync === 'syncing' ? (
          <LoaderCircle className="size-4 animate-spin" />
        ) : account.sync === 'idle' ? (
          <CloudCheck className="size-4 text-win" />
        ) : (
          <CloudOff className="size-4 text-loss" />
        )}
        <span className="grow">{status}</span>
        <Button variant="ghost" size="sm" disabled={account.sync === 'syncing'} onClick={() => void sync.run(async () => (await loadAccount()).syncNow())}>
          <RefreshCw data-icon="inline-start" /> Jetzt
        </Button>
      </div>

      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setPwDone(false);
          if (newPw.length < 8) return pw.setError('Das Passwort muss mindestens 8 Zeichen haben.');
          void pw.run(async () => {
            await (await loadAccount()).changePassword(newPw);
            setNewPw('');
            setPwDone(true);
          });
        }}
      >
        <Field id="new-password" label="Neues Passwort">
          <div className="flex gap-2">
            <Input id="new-password" type="password" autoComplete="new-password" value={newPw} onChange={(e) => setNewPw(e.target.value)} className="h-10" />
            <Button type="submit" variant="outline" className="h-10" disabled={pw.busy || !newPw}>
              <KeyRound data-icon="inline-start" /> Ändern
            </Button>
          </div>
        </Field>
        <ErrorText error={pw.error} />
        {pwDone && <p className="text-[15px] text-win">Passwort geändert.</p>}
      </form>

      <div className="flex flex-wrap gap-2 border-t pt-4">
        <Button variant="outline" className="h-10" onClick={() => setConfirmOut(true)} data-testid="sign-out">
          <LogOut data-icon="inline-start" /> Abmelden
        </Button>
        <Button variant="destructive" className="h-10" onClick={() => setConfirmDelete(true)} data-testid="delete-account">
          <Trash2 data-icon="inline-start" /> Konto löschen
        </Button>
      </div>

      <Dialog open={confirmOut} onOpenChange={setConfirmOut}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Abmelden?</DialogTitle>
            <DialogDescription>
              Vorher wird alles hochgeladen. Danach werden deine Daten auf diesem Gerät entfernt – im Konto bleiben sie und kommen beim nächsten Anmelden zurück.
            </DialogDescription>
          </DialogHeader>
          <ErrorText error={out.error} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOut(false)}>
              Abbrechen
            </Button>
            <Button
              disabled={out.busy}
              onClick={() =>
                void out.run(async () => {
                  await (await loadAccount()).signOut();
                  setConfirmOut(false);
                })
              }
            >
              {out.busy && <LoaderCircle className="animate-spin" data-icon="inline-start" />} Abmelden
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Konto endgültig löschen?</DialogTitle>
            <DialogDescription>
              Gelöscht werden dein Konto und alle Daten darin (Partien, Analysen, Puzzles, Versuche, Einstellungen) – auf dem Server und auf diesem Gerät. Das lässt sich nicht
              rückgängig machen. Tipp: Vorher auf der Seite „Import“ unter „Datensicherung“ eine Sicherung herunterladen.
            </DialogDescription>
          </DialogHeader>
          <Field id="confirm-username" label={`Zur Bestätigung „${user.username}“ eintippen`}>
            <Input id="confirm-username" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
          </Field>
          <ErrorText error={del.error} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>
              Abbrechen
            </Button>
            <Button
              variant="destructive"
              disabled={del.busy || typed.trim().toLowerCase() !== user.username.toLowerCase()}
              onClick={() =>
                void del.run(async () => {
                  await (await loadAccount()).deleteAccount();
                  setConfirmDelete(false);
                })
              }
              data-testid="confirm-delete"
            >
              Endgültig löschen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Nur für Admins: E-Mails freigeben (Einladungscode) und Passwörter zurücksetzen */
export function AdminCard() {
  const account = useAccount();
  const [invites, setInvites] = useState<Invite[] | null>(null);
  const [email, setEmail] = useState('');
  const [created, setCreated] = useState<{ email: string; code: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [reset, setReset] = useState({ username: '', password: '' });
  const [resetDone, setResetDone] = useState<string | null>(null);
  const inv = useAction();
  const rst = useAction();
  const isAdmin = account.status === 'signed-in' && account.user?.isAdmin;

  const refresh = async () => setInvites(await (await loadAccount()).listInvites());
  useEffect(() => {
    if (isAdmin) void inv.run(refresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);
  if (!isAdmin) return null;

  const message = created
    ? `Hallo! Du bist zu meiner Schach-App eingeladen: ${APP_URL}#/einstellungen → „Konto & Synchronisierung“ → „Registrieren“. E-Mail: ${created.email} · Einladungscode: ${formatCode(created.code)}`
    : '';

  return (
    <Section data-testid="admin-card">
      <SectionHeader>
        <SectionTitle className="flex items-center gap-2">
          <ShieldCheck className="size-5 text-brass" /> Freunde einladen
        </SectionTitle>
        <SectionDescription>Nur du siehst diese Karte. Registrieren kann sich nur, wessen E-Mail hier freigegeben ist – mit dem passenden Code.</SectionDescription>
      </SectionHeader>
      <SectionContent className="flex flex-col gap-4">
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setCopied(false);
            void inv.run(async () => {
              const code = await (await loadAccount()).createInvite(email);
              setCreated({ email: email.trim().toLowerCase(), code });
              setEmail('');
              await refresh();
            });
          }}
        >
          <Field id="invite-email" label="E-Mail-Adresse freigeben">
            <div className="flex gap-2">
              <Input id="invite-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="h-10" />
              <Button type="submit" className="h-10" disabled={inv.busy} data-testid="create-invite">
                <UserPlus data-icon="inline-start" /> Einladen
              </Button>
            </div>
          </Field>
          <ErrorText error={inv.error} />
        </form>

        {created && (
          <div className="flex flex-col gap-2 border-t pt-4" data-testid="invite-code">
            <span className="text-[15px] text-muted-foreground">Einladungscode für {created.email} – nur jetzt sichtbar:</span>
            <span className="font-mono text-3xl font-bold tracking-widest">{formatCode(created.code)}</span>
            <p className="text-[15px]">{message}</p>
            <Button
              variant="outline"
              className="self-start"
              onClick={() => {
                void navigator.clipboard?.writeText(message).then(() => setCopied(true));
              }}
            >
              <Copy data-icon="inline-start" /> {copied ? 'Kopiert' : 'Nachricht kopieren'}
            </Button>
          </div>
        )}

        <div className="flex flex-col">
          <span className={`${fieldLabel} mb-1`}>Freigaben</span>
          {invites === null ? (
            <p className="text-sm text-muted-foreground">Lädt …</p>
          ) : invites.length === 0 ? (
            <p className="text-sm text-muted-foreground">Noch keine.</p>
          ) : (
            <ul className="m-0 list-none p-0" data-testid="invite-list">
              {invites.map((i) => (
                <li key={i.email} className="flex items-center gap-2 border-t py-2 text-[15px] first:border-t-0">
                  <span className="min-w-0 grow">
                    <span className="block truncate font-semibold">{i.email}</span>
                    <span className="text-muted-foreground">
                      {i.used_at ? `registriert als ${i.username ?? '?'}${i.is_admin ? ' (Admin)' : ''}` : 'eingeladen, noch nicht registriert'}
                    </span>
                  </span>
                  {!i.used_at && (
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Freigabe für ${i.email} entfernen`}
                      onClick={() =>
                        void inv.run(async () => {
                          await (await loadAccount()).deleteInvite(i.email);
                          await refresh();
                        })
                      }
                    >
                      <Trash2 />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <form
          className="flex flex-col gap-2 border-t pt-4"
          onSubmit={(e) => {
            e.preventDefault();
            setResetDone(null);
            void rst.run(async () => {
              await (await loadAccount()).adminSetPassword(reset.username, reset.password);
              setResetDone(`Neues Passwort für ${reset.username} gesetzt. Sag es ihm/ihr – danach selbst ändern lassen.`);
              setReset({ username: '', password: '' });
            });
          }}
        >
          <span className={fieldLabel}>Passwort vergessen</span>
          <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <Input placeholder="Benutzername" aria-label="Benutzername" value={reset.username} onChange={(e) => setReset((r) => ({ ...r, username: e.target.value }))} required className="h-10" />
            <Input
              placeholder="Vorläufiges Passwort"
              aria-label="Vorläufiges Passwort"
              value={reset.password}
              minLength={8}
              onChange={(e) => setReset((r) => ({ ...r, password: e.target.value }))}
              required
              className="h-10"
            />
            <Button type="submit" variant="outline" className="h-10" disabled={rst.busy}>
              Setzen
            </Button>
          </div>
          <ErrorText error={rst.error} />
          {resetDone && <p className="text-sm text-win">{resetDone}</p>}
        </form>
      </SectionContent>
    </Section>
  );
}

/** Datenschutzhinweis: welche Daten, wo, wer sie sieht */
export function PrivacyCard() {
  return (
    <Section data-testid="privacy-card">
      <SectionHeader>
        <SectionTitle>Datenschutz</SectionTitle>
      </SectionHeader>
      <SectionContent className="flex flex-col gap-2.5 text-sm leading-relaxed">
        <p>
          <strong>Ohne Konto</strong> bleiben alle Daten nur in diesem Browser auf diesem Gerät. Nichts wird übertragen, außer beim Chess.com-Import (Abruf deiner öffentlichen
          Partien bei Chess.com).
        </p>
        <p>
          <strong>Mit Konto</strong> werden gespeichert: E-Mail-Adresse, Benutzername, Passwort (nur verschlüsselt, niemand kann es lesen), deine Partien, Analysen, Puzzles,
          Lösungsversuche und Einstellungen dieser App.
        </p>
        <p>
          <strong>Wo:</strong> bei Supabase (Datenbank-Anbieter) in Frankfurt am Main, Deutschland (EU). Kostenloser Tarif, keine Werbung, keine Weitergabe.
        </p>
        <p>
          <strong>Wer sieht sie:</strong> nur du. Andere Mitglieder sehen deine Daten nicht – das erzwingt die Datenbank selbst (Row Level Security). Niklas als Betreiber sieht in
          der Einladungsliste E-Mail und Benutzername; als Inhaber des Projekts könnte er technisch auf die Datenbank zugreifen, schaut aber nicht hinein.
        </p>
        <p>
          <strong>Löschen:</strong> „Konto löschen“ entfernt das Konto und alle Daten darin sofort. Fragen: direkt an Niklas.
        </p>
      </SectionContent>
    </Section>
  );
}
