import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronLeft, Trash2 } from 'lucide-react';
import { db, type BoardOccasion, type BoardReason, type GameRecord, type Phase, type Side } from '../db/schema';
import { useLive } from '../db/useLive';
import { getSetting } from '../db/games';
import {
  buildBoardGame,
  deleteBoardGame,
  formOf,
  hasMoves,
  OCCASION_LABELS,
  PgnError,
  PHASE_LABELS,
  REASON_LABELS,
  recentOpponents,
  saveBoardGame,
  todayKey,
  type BoardForm,
} from '../db/boardGames';
import { href } from '../app/router';
import { fieldLabel } from '@/components/Section';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

const label = fieldLabel;

/** Große Antipp-Knöpfe statt Tippen (Einfach- oder Mehrfachauswahl) */
function Chips<T extends string>({
  name,
  options,
  selected,
  onToggle,
  cols,
  tone,
}: {
  name: string;
  options: [T, string][];
  selected: T[];
  onToggle: (v: T) => void;
  cols?: string;
  tone?: (v: T) => string | undefined;
}) {
  return (
    <div role="group" aria-label={name} className={cn('grid gap-2', cols ?? 'grid-cols-2 sm:flex sm:flex-wrap')}>
      {options.map(([v, text]) => {
        const on = selected.includes(v);
        return (
          <button
            key={v}
            type="button"
            aria-pressed={on}
            onClick={() => onToggle(v)}
            className={cn(
              'min-h-11 rounded-lg border border-input px-3 py-2 text-[15px] font-semibold transition-colors outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:min-w-28',
              on ? cn('border-foreground/50 bg-muted text-foreground', tone?.(v)) : 'text-muted-foreground hover:bg-muted/60',
            )}
          >
            {text}
          </button>
        );
      })}
    </div>
  );
}

function Field({ title, children, hint }: { title: string; children: React.ReactNode; hint?: string }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className={label}>
        {title}
        {hint && <span className="ml-1.5 font-medium tracking-normal normal-case">{hint}</span>}
      </h2>
      {children}
    </section>
  );
}

const yesterdayKey = () => todayKey(Date.now() - 86_400_000);

export function BoardEntryPage({ id }: { id?: string }) {
  // undefined = lädt, null = nicht gefunden
  const existing = useLive(() => (id ? db.games.get(id).then((g) => g ?? null) : Promise.resolve(null)), [id]);
  if (id && existing === undefined) return <p className="text-muted-foreground">Lädt …</p>;
  if (id && (!existing || existing.source !== 'brett'))
    return (
      <div className="flex flex-col items-start gap-3 px-3.5">
        <p className="text-muted-foreground">Diesen Eintrag gibt es nicht (mehr).</p>
        <a className={buttonVariants({ variant: 'outline' })} href={href({ page: 'partien' })}>
          Zur Partienliste
        </a>
      </div>
    );
  return <EntryForm existing={existing ?? undefined} />;
}

type Draft = Omit<BoardForm, 'myColor' | 'myResult'> & { myColor: Side | null; myResult: BoardForm['myResult'] | null };

function EntryForm({ existing }: { existing?: GameRecord }) {
  const [f, setF] = useState<Draft>(() =>
    existing
      ? formOf(existing)
      : { day: todayKey(), opponent: '', occasion: 'schulliga', myColor: null, myResult: null, decidedIn: null, reasons: [], note: '', pgn: '' },
  );
  const [showPgn, setShowPgn] = useState(() => !!existing?.pgn);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const opponents = useLive(() => recentOpponents(), []);
  const set = (patch: Partial<Draft>) => setF((cur) => ({ ...cur, ...patch }));

  // Neuer Eintrag: Anlass wie beim letzten Mal
  useEffect(() => {
    if (existing) return;
    void db.games
      .where('[source+date]')
      .between(['brett', 0], ['brett', Infinity])
      .last()
      .then((g) => g?.board && setF((cur) => ({ ...cur, occasion: g.board!.occasion })));
  }, [existing]);

  const suggestions = useMemo(() => {
    const q = f.opponent.trim().toLocaleLowerCase('de');
    return (opponents ?? []).filter((n) => n.toLocaleLowerCase('de') !== q && (!q || n.toLocaleLowerCase('de').includes(q))).slice(0, 6);
  }, [opponents, f.opponent]);

  const ready = f.myColor !== null && f.myResult !== null;

  async function save() {
    if (!f.myColor || !f.myResult) return;
    setError(null);
    setBusy(true);
    try {
      const myName = (await getSetting<string>('chesscomUsername'))?.trim() || 'Ich';
      const game = buildBoardGame({ ...f, myColor: f.myColor, myResult: f.myResult }, { myName: existing ? (existing.myColor === 'black' ? existing.black.name : existing.white.name) : myName, existing });
      await saveBoardGame(game);
      window.location.hash = hasMoves(game) ? href({ page: 'partie', id: game.id }) : href({ page: 'partien' });
    } catch (e) {
      setError(e instanceof PgnError ? e.message : 'Speichern hat nicht geklappt. Bitte noch einmal versuchen.');
      setBusy(false);
    }
  }

  async function remove() {
    if (!existing) return;
    await deleteBoardGame(existing.id);
    window.location.hash = href({ page: 'partien' });
  }

  const days: [string, string][] = [
    [todayKey(), 'Heute'],
    [yesterdayKey(), 'Gestern'],
  ];
  const otherDay = !days.some(([d]) => d === f.day);

  return (
    <div className="flex w-full max-w-[720px] animate-in flex-col gap-8 px-4 fade-in-0 md:px-0">
      <div className="flex items-center gap-2">
        <a
          className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }), '-ml-2 shrink-0 text-muted-foreground')}
          href={existing && hasMoves(existing) ? href({ page: 'partie', id: existing.id }) : href({ page: 'partien' })}
          aria-label="Zurück"
          title="Zurück"
        >
          <ChevronLeft />
        </a>
        <h1 className="font-heading text-[40px] leading-tight font-normal md:text-[52px]">{existing ? 'Brettpartie bearbeiten' : 'Brettpartie eintragen'}</h1>
      </div>

      <div className="flex flex-col gap-7" data-testid="board-form">
        <Field title="Ergebnis">
          <Chips
            name="Ergebnis"
            cols="grid-cols-3"
            options={[
              ['win', 'Sieg'],
              ['draw', 'Remis'],
              ['loss', 'Niederlage'],
            ]}
            selected={f.myResult ? [f.myResult] : []}
            onToggle={(v) => set({ myResult: v })}
            tone={(v) => (v === 'win' ? 'border-win bg-win-bg text-win' : v === 'loss' ? 'border-loss bg-loss-bg text-loss' : 'border-draw bg-draw-bg text-draw')}
          />
        </Field>

        <Field title="Meine Farbe">
          <Chips
            name="Meine Farbe"
            cols="grid-cols-2"
            options={[
              ['white', 'Weiß'],
              ['black', 'Schwarz'],
            ]}
            selected={f.myColor ? [f.myColor] : []}
            onToggle={(v) => set({ myColor: v })}
          />
        </Field>

        <Field title="Gegner" hint="(optional)">
          <Input
            aria-label="Gegner"
            placeholder="Name"
            autoComplete="off"
            autoCapitalize="words"
            className="h-11 text-base"
            value={f.opponent}
            onChange={(e) => set({ opponent: e.target.value })}
          />
          {suggestions.length > 0 && (
            <div className="flex flex-wrap gap-2" role="group" aria-label="Frühere Gegner" data-testid="opponent-suggestions">
              {suggestions.map((n) => (
                <button key={n} type="button" className="min-h-9 rounded-full border border-input px-3 text-sm font-medium hover:bg-muted" onClick={() => set({ opponent: n })}>
                  {n}
                </button>
              ))}
            </div>
          )}
        </Field>

        <Field title="Anlass">
          <Chips<BoardOccasion>
            name="Anlass"
            options={Object.entries(OCCASION_LABELS) as [BoardOccasion, string][]}
            selected={[f.occasion]}
            onToggle={(v) => set({ occasion: v })}
          />
        </Field>

        <Field title="Datum">
          <div className="grid grid-cols-3 gap-2">
            {days.map(([d, text]) => (
              <button
                key={d}
                type="button"
                aria-pressed={f.day === d}
                onClick={() => set({ day: d })}
                className={cn(
                  'min-h-11 rounded-lg border border-input px-3 text-[15px] font-semibold',
                  f.day === d ? 'border-foreground/50 bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted/60',
                )}
              >
                {text}
              </button>
            ))}
            <input
              type="date"
              aria-label="Anderes Datum"
              max={todayKey()}
              value={f.day}
              onChange={(e) => e.target.value && set({ day: e.target.value })}
              className={cn('min-h-11 w-full min-w-0 rounded-lg border border-input bg-transparent px-2 text-[15px]', otherDay ? 'border-foreground/50 bg-muted' : 'text-muted-foreground')}
            />
          </div>
        </Field>

        <Field title="Wo wurde die Partie entschieden?">
          <Chips<Phase>
            name="Entschieden in"
            cols="grid-cols-3"
            options={Object.entries(PHASE_LABELS) as [Phase, string][]}
            selected={f.decidedIn ? [f.decidedIn] : []}
            onToggle={(v) => set({ decidedIn: f.decidedIn === v ? null : v })}
          />
        </Field>

        <Field title="Hauptgründe" hint="(mehrere möglich)">
          <Chips<BoardReason>
            name="Hauptgründe"
            options={Object.entries(REASON_LABELS) as [BoardReason, string][]}
            selected={f.reasons}
            onToggle={(v) => set({ reasons: f.reasons.includes(v) ? f.reasons.filter((r) => r !== v) : [...f.reasons, v] })}
          />
        </Field>

        <Field title="Notiz" hint="(optional)">
          <textarea
            aria-label="Notiz"
            rows={2}
            value={f.note}
            onChange={(e) => set({ note: e.target.value })}
            placeholder="z. B. Turm auf e8 übersehen"
            className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
          />
        </Field>

        <section className="flex flex-col gap-2">
          <button type="button" className="flex items-center gap-1.5 self-start text-[15px] font-semibold text-brass-text" aria-expanded={showPgn} onClick={() => setShowPgn((s) => !s)}>
            <ChevronDown className={cn('size-4 transition-transform', !showPgn && '-rotate-90')} />
            Züge einfügen (PGN)
          </button>
          {showPgn && (
            <>
              <textarea
                aria-label="Züge (PGN)"
                rows={4}
                value={f.pgn}
                onChange={(e) => set({ pgn: e.target.value })}
                placeholder="1. e4 e5 2. Sf3 Sc6 …"
                className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 font-mono text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
              />
              <p className="text-sm text-muted-foreground">Deutsche (Sf3, Lxc6+, e8=D) oder englische Schreibweise (Nf3, Bxc6+, e8=Q). Mit Zügen wird die Partie wie jede andere analysiert und es entstehen Puzzles aus deinen Fehlern.</p>
            </>
          )}
        </section>

        {error && (
          <p className="text-sm font-medium text-destructive" role="alert" data-testid="board-error">
            {error}
          </p>
        )}

        {existing && (
          <div className="flex flex-wrap items-center gap-2 border-t pt-4">
            {confirmDelete ? (
              <>
                <span className="text-sm">Eintrag wirklich löschen?</span>
                <Button variant="destructive" onClick={remove}>
                  Ja, löschen
                </Button>
                <Button variant="outline" onClick={() => setConfirmDelete(false)}>
                  Abbrechen
                </Button>
              </>
            ) : (
              <Button variant="outline" onClick={() => setConfirmDelete(true)}>
                <Trash2 data-icon="inline-start" /> Eintrag löschen
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Speichern bleibt am Handy über der Navigationsleiste sichtbar */}
      <div className="sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-20 flex flex-col gap-1 md:static">
        <Button size="lg" className="h-12 w-full bg-brass text-base font-bold text-brass-foreground shadow-lg hover:bg-brass/90 md:w-auto md:self-start md:px-8" disabled={!ready || busy} onClick={save} data-testid="board-save">
          {existing ? 'Änderungen speichern' : 'Speichern'}
        </Button>
        {!ready && <p className="rounded-md bg-background/90 text-center text-sm text-muted-foreground md:text-left">Ergebnis und Farbe antippen</p>}
      </div>
    </div>
  );
}
