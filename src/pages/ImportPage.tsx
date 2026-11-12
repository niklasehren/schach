import { useEffect, useRef, useState } from 'react';
import { importChessCom, ImportError, type ImportSummary, type Progress, type Range } from '../chesscom/importer';
import { BackupError, downloadFile, exportBackup, restoreBackup } from '../db/backup';
import { getSetting, setSetting } from '../db/games';
import { AUTO_KEY } from '../chesscom/autoImport';
import { useLive } from '../db/useLive';
import { href } from '../app/router';
import { CircleAlert, CircleCheck } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Progress as ProgressBar } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

const USERNAME_KEY = 'chesscomUsername';

type State =
  | { kind: 'idle' }
  | { kind: 'running'; progress: Progress }
  | { kind: 'done'; summary: ImportSummary }
  | { kind: 'error'; message: string; added: number };

export function ImportPage() {
  return (
    <div className="flex w-full max-w-2xl animate-in flex-col gap-4 px-3.5 fade-in-0 slide-in-from-bottom-1 md:px-0">
      <h1 className="font-heading text-4xl">Import</h1>
      <ChessComImport />
      <BackupSection />
    </div>
  );
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function ChessComImport() {
  const [username, setUsername] = useState('');
  const [range, setRange] = useState<Range>('last3');
  const [state, setState] = useState<State>({ kind: 'idle' });
  const abort = useRef<AbortController | null>(null);
  const lastProgress = useRef<Progress | null>(null);

  // Gespeicherten Namen vorausfüllen
  useEffect(() => {
    getSetting<string>(USERNAME_KEY).then((n) => n && setUsername((cur) => cur || n));
  }, []);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (state.kind === 'running') return;
    const ctrl = new AbortController();
    abort.current = ctrl;
    lastProgress.current = null;
    setState({ kind: 'running', progress: { phase: 'archives', month: 0, months: 0, added: 0 } });
    try {
      const summary = await importChessCom(
        username,
        range,
        (p) => {
          lastProgress.current = p;
          if (!ctrl.signal.aborted) setState({ kind: 'running', progress: p });
          // Name merken, sobald Chess.com ihn kennt
          if (p.phase === 'months' && p.month === 1) setSetting(USERNAME_KEY, username.trim()).catch(() => {});
        },
        { signal: ctrl.signal },
      );
      await setSetting(USERNAME_KEY, username.trim()).catch(() => {});
      setState({ kind: 'done', summary });
    } catch (err) {
      const added = (lastProgress.current as Progress | null)?.added ?? 0;
      if ((err as Error)?.name === 'AbortError') {
        setState({ kind: 'error', message: 'Import abgebrochen.', added });
      } else if (err instanceof ImportError) {
        setState({ kind: 'error', message: err.message, added });
      } else {
        setState({ kind: 'error', message: 'Beim Speichern ist ein Fehler aufgetreten. Bitte erneut versuchen.', added });
      }
    } finally {
      abort.current = null;
    }
  }

  const running = state.kind === 'running';

  return (
    <Card aria-labelledby="cc-title">
      <CardHeader>
        <CardTitle id="cc-title" className="text-lg">
          Partien von Chess.com
        </CardTitle>
        <CardDescription>
          Holt deine Partien über die öffentliche Chess.com-Schnittstelle – ohne Passwort. Bereits importierte Partien werden übersprungen, ein erneuter Import holt also nur neue.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <form className="flex flex-col gap-4" onSubmit={run}>
          <div className="grid gap-2">
            <Label htmlFor="cc-username">Chess.com-Benutzername</Label>
            <Input
              id="cc-username"
              className="h-11 text-base"
              type="text"
              name="username"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder="z. B. MagnusCarlsen"
              value={username}
              maxLength={50}
              disabled={running}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>
          <ToggleGroup
            variant="outline"
            value={[range]}
            onValueChange={(v: string[]) => v[0] && setRange(v[0] as Range)}
            aria-label="Zeitraum"
            className="grid w-full grid-cols-2"
            disabled={running}
          >
            <ToggleGroupItem value="last3" className="h-10">
              Letzte 3 Monate
            </ToggleGroupItem>
            <ToggleGroupItem value="all" className="h-10">
              Alle
            </ToggleGroupItem>
          </ToggleGroup>
          {running ? (
            <Button type="button" variant="outline" size="lg" className="h-11 text-base" onClick={() => abort.current?.abort()}>
              Abbrechen
            </Button>
          ) : (
            <Button type="submit" size="lg" className="h-11 text-base" disabled={!username.trim()}>
              Partien importieren
            </Button>
          )}
        </form>

        <AutoImportToggle />

        {state.kind === 'running' && <ProgressView progress={state.progress} />}

        {state.kind === 'done' && (
          <Alert role="status" data-testid="import-result" className="border-primary/40 bg-primary/10">
            <CircleCheck />
            <AlertTitle>
              {state.summary.added === 0 ? 'Keine neuen Partien.' : `${plural(state.summary.added, 'neue Partie', 'neue Partien')} importiert.`}
            </AlertTitle>
            <AlertDescription>
              <span>
                {plural(state.summary.months, 'Monat', 'Monate')} durchsucht
                {state.summary.duplicates > 0 && `, ${state.summary.duplicates} schon vorhanden`}
                {state.summary.skipped > 0 && `, ${plural(state.summary.skipped, 'Variante', 'Varianten')} übersprungen`}.
              </span>
              {state.summary.months === 0 && <span> In diesem Zeitraum gibt es keine Partien. Versuch es mit „Alle“.</span>}
              <a className="font-semibold text-primary" href={href({ page: 'partien' })}>
                Zur Partienliste
              </a>
            </AlertDescription>
          </Alert>
        )}

        {state.kind === 'error' && (
          <Alert variant="destructive" role="alert" data-testid="import-error">
            <CircleAlert />
            <AlertTitle>{state.message}</AlertTitle>
            {state.added > 0 && <AlertDescription>{plural(state.added, 'neue Partie wurde', 'neue Partien wurden')} vorher schon gespeichert.</AlertDescription>}
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}

function ProgressView({ progress: p }: { progress: Progress }) {
  const text =
    p.phase === 'archives' || p.months === 0
      ? 'Frage Chess.com nach deinen Monaten …'
      : `Monat ${p.month} von ${p.months}${p.label ? ` (${p.label.replace('/', '-')})` : ''}, ${plural(p.added, 'Partie', 'Partien')} neu`;
  return (
    <div className="flex flex-col gap-2 text-sm tabular-nums" role="status" aria-live="polite" data-testid="import-progress">
      <span>{text}</span>
      <ProgressBar value={p.months ? (p.month / p.months) * 100 : null} aria-label="Import-Fortschritt" />
    </div>
  );
}

function BackupSection() {
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  async function doExport() {
    setBusy(true);
    try {
      const backup = await exportBackup();
      const date = new Date().toISOString().slice(0, 10);
      downloadFile(`schach-sicherung-${date}.json`, JSON.stringify(backup), 'application/json');
      setMessage({ text: `Sicherung mit ${plural(backup.tables.games.length, 'Partie', 'Partien')} erstellt.` });
    } catch {
      setMessage({ text: 'Die Sicherung konnte nicht erstellt werden.', error: true });
    } finally {
      setBusy(false);
    }
  }

  async function doImport(file: File) {
    setBusy(true);
    try {
      let data: unknown;
      try {
        data = JSON.parse(await file.text());
      } catch {
        throw new BackupError('Die Datei ist keine gültige Sicherung (kein JSON).');
      }
      const s = await restoreBackup(data);
      setMessage({
        text: `Sicherung eingelesen: ${plural(s.games, 'Partie', 'Partien')} übernommen${s.skippedGames ? `, ${s.skippedGames} übersprungen (schon vorhanden)` : ''}.`,
      });
    } catch (e) {
      setMessage({ text: e instanceof BackupError ? e.message : 'Die Sicherung konnte nicht eingelesen werden.', error: true });
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  return (
    <Card aria-labelledby="backup-title">
      <CardHeader>
        <CardTitle id="backup-title" className="text-lg">
          Datensicherung
        </CardTitle>
        <CardDescription>
          Alle Daten liegen nur in diesem Browser. Lösche den Browserverlauf nicht ohne Sicherung. Mit einer Sicherungsdatei kannst du die Daten auch auf ein anderes Gerät übertragen; beim Einlesen wird zusammengeführt, nichts gelöscht.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Button variant="outline" size="lg" className="h-11" onClick={doExport} disabled={busy}>
            Alle Daten sichern
          </Button>
          <Button variant="outline" size="lg" className="h-11" onClick={() => fileInput.current?.click()} disabled={busy}>
            Sicherung einlesen
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            hidden
            data-testid="backup-file"
            onChange={(e) => e.target.files?.[0] && doImport(e.target.files[0])}
          />
        </div>
        {message && (
          <Alert variant={message.error ? 'destructive' : 'default'} role={message.error ? 'alert' : 'status'} data-testid="backup-message">
            <AlertDescription>{message.text}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}

/** Schalter „Neue Partien automatisch laden“ (Standard: an) */
function AutoImportToggle() {
  const value = useLive(() => getSetting<boolean>(AUTO_KEY).then((v) => v ?? true), []);
  if (value === undefined) return null;
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border bg-muted/30 p-3">
      <Label htmlFor="auto-import" className="flex flex-col items-start gap-1">
        <span className="text-[15px] font-semibold">Neue Partien automatisch laden</span>
        <span className="text-[13px] leading-snug font-normal text-muted-foreground">
          Beim Öffnen der App und wenn du zu ihr zurückkehrst, höchstens alle 10 Minuten (aktueller und letzter Monat). Chess.com zeigt eine beendete Partie in der
          Regel nach wenigen Minuten an; ganz frische Partien können also beim ersten Nachsehen noch fehlen.
        </span>
      </Label>
      <Switch id="auto-import" checked={value} onCheckedChange={(on: boolean) => setSetting(AUTO_KEY, on)} data-testid="auto-import" />
    </div>
  );
}
