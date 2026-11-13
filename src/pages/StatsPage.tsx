import { useMemo, useState, type ReactNode } from 'react';
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';
import { href } from '../app/router';
import { ERROR_TYPE_LABELS } from '../analysis/errorTypes';
import { PHASE_LABELS } from '../db/boardGames';
import type { Side } from '../db/schema';
import { formatDate } from '../chess/format';
import {
  applyFilter,
  boardDecided,
  clockBuckets,
  MIN_GAMES,
  openingRows,
  phaseRows,
  scoreRate,
  blundersPerGame,
  accuracyOf,
  errorsPerGame,
  sourceCompare,
  timeClassRows,
  topErrorType,
  weekly,
  SOURCE_COMPARE,
  type Filter,
  type GameFact,
  type Period,
} from '../stats/insights';
import { evaluate, VERDICT_LABELS, type Action, type Evidence, type HypothesisResult, type Verdict } from '../stats/hypotheses';
import { openingLabel } from '../stats/openings';
import { Choice, PageTitle, Section, SectionDescription, SectionHeader, SectionTitle } from '@/components/Section';
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart';
import { cn } from '@/lib/utils';
import { useStats } from './stats/useStats';

/**
 * Statistik (Block 9): meine Vermutungen gegen die Daten, darunter die Einzelheiten.
 * Jede Zahl mit Anzahl Partien; unter 10 Partien kein Urteil. Jede Erkenntnis führt zu einer Übung.
 */

const TC_LABELS: Record<string, string> = { bullet: 'Bullet', blitz: 'Blitz', rapid: 'Rapid', classical: 'Klassisch', daily: 'Täglich' };
const PERIOD_KEY = 'schach.statsPeriod';

const pct = (x: number | null) => (x === null ? '–' : `${Math.round(x)} %`);
const one = (x: number | null) => (x === null ? '–' : x.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
const fmtValue = (e: Pick<Evidence, 'value' | 'unit'>) => (e.unit === 'perGame' ? one(e.value) : pct(e.value));
const nText = (n: number, unit: 'Partien' | 'Züge' = 'Partien') => `${n} ${unit === 'Partien' ? (n === 1 ? 'Partie' : 'Partien') : n === 1 ? 'Zug' : 'Züge'}`;
const colorWord = (s: Side) => (s === 'white' ? 'Weiß' : 'Schwarz');

function readPeriod(): Period {
  try {
    return localStorage.getItem(PERIOD_KEY) === 'all' ? 'all' : '4w';
  } catch {
    return '4w';
  }
}

export function StatsPage() {
  const data = useStats();
  const [period, setPeriod] = useState<Period>(readPeriod);
  const [timeClass, setTimeClass] = useState('all');
  const now = Date.now();
  const filter: Filter = { period, timeClass };
  const games = useMemo(() => (data ? applyFilter(data.facts, filter, now) : []), [data, period, timeClass]); // eslint-disable-line react-hooks/exhaustive-deps
  const results = useMemo(() => (data ? data.hypotheses.map((h) => evaluate(h, games, now)) : []), [data, games]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!data) return <p className="text-muted-foreground">Lädt …</p>;
  const classes = [...new Set(data.facts.map((f) => f.timeClass).filter((c): c is string => !!c))].sort(
    (a, b) => Object.keys(TC_LABELS).indexOf(a) - Object.keys(TC_LABELS).indexOf(b),
  );
  const analysed = games.filter((g) => g.analysed).length;

  return (
    <div className="flex w-full max-w-[1120px] animate-in flex-col gap-10 px-4 fade-in-0 md:px-0" data-testid="stats-page">
      <div className="flex flex-col gap-6">
        <PageTitle
          sub={
            <span data-testid="stats-count">
              {games.length} {games.length === 1 ? 'Partie' : 'Partien'} {period === '4w' ? 'in den letzten 4 Wochen' : 'insgesamt'}
              {games.length > 0 && (analysed === games.length ? ', alle analysiert.' : `, davon ${analysed} analysiert.`)}
              {data.pending > 0 && ` ${data.pending} warten noch auf die Analyse.`}
            </span>
          }
        >
          Statistik
        </PageTitle>
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-8" data-testid="stats-filter">
          <FilterRow label="Zeitraum">
            <Choice
              label="Zeitraum"
              value={period}
              options={[
                { value: '4w', label: 'Letzte 4 Wochen' },
                { value: 'all', label: 'Alles' },
              ]}
              onChange={(v) => {
                setPeriod(v);
                try {
                  localStorage.setItem(PERIOD_KEY, v);
                } catch {
                  /* ohne Speicher: nur für diesen Besuch */
                }
              }}
            />
          </FilterRow>
          {classes.length > 1 && (
            <FilterRow label="Zeit">
              <Choice label="Zeitklasse" value={timeClass} options={[{ value: 'all', label: 'Alle' }, ...classes.map((c) => ({ value: c, label: TC_LABELS[c] ?? c }))]} onChange={setTimeClass} />
            </FilterRow>
          )}
        </div>
      </div>

      {data.facts.length === 0 ? (
        <p className="max-w-[60ch] text-[17px] text-muted-foreground">
          Noch keine Partien. Sobald du Partien importiert, gespielt oder eingetragen hast und sie analysiert sind, vergleicht die App hier deine Einschätzung mit den Daten.{' '}
          <a className="font-semibold text-brass-text no-underline hover:underline" href={href({ page: 'import' })}>
            Chess.com-Partien laden
          </a>
        </p>
      ) : (
        <>
          <Hypotheses results={results} />
          <ColorSection games={games} />
          <PhaseSection games={games} />
          <TimeSection games={games} />
          <OpeningSection games={games} />
          <ProgressSection games={games} />
          <ClassSection games={games} />
          <p className="border-t pt-4 text-[15px] text-muted-foreground">
            Ein Urteil gibt es erst ab {MIN_GAMES} Partien je Gruppe. Genauigkeit nach der Lichess-Formel; Eröffnungen aus der freien Liste von Lichess (CC0).
          </p>
        </>
      )}
    </div>
  );
}

function FilterRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
      <span className="text-[15px] text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

/* ---------- Vermutungen ---------- */

/** Urteil als Spielstein: voll = stimmt, halb = teilweise, Ring = stimmt nicht, gestrichelt = zu wenig Daten */
function VerdictStone({ verdict, className }: { verdict: Verdict; className?: string }) {
  const color = verdict === 'stimmt' ? 'text-win' : verdict === 'stimmtNicht' ? 'text-loss' : verdict === 'teilweise' ? 'text-foreground' : 'text-muted-foreground';
  return (
    <svg viewBox="0 0 20 20" className={cn('size-5 shrink-0', color, className)} aria-hidden>
      {verdict === 'stimmt' && <circle cx="10" cy="10" r="8" fill="currentColor" />}
      {verdict === 'teilweise' && (
        <>
          <circle cx="10" cy="10" r="7.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="M10 2.75a7.25 7.25 0 0 1 0 14.5z" fill="currentColor" />
        </>
      )}
      {verdict === 'stimmtNicht' && <circle cx="10" cy="10" r="7.25" fill="none" stroke="currentColor" strokeWidth="2" />}
      {verdict === 'zuWenig' && <circle cx="10" cy="10" r="7.25" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2.6 2.6" />}
    </svg>
  );
}

function Hypotheses({ results }: { results: HypothesisResult[] }) {
  return (
    <Section aria-labelledby="hyp-title" data-testid="hypotheses">
      <SectionHeader>
        <SectionTitle id="hyp-title" className="text-[34px] md:text-[40px]">
          Deine Einschätzung gegen die Daten
        </SectionTitle>
        <SectionDescription>
          {results.length
            ? 'Was du über dein Spiel vermutest – und was deine Partien dazu sagen.'
            : 'Du hast noch keine Vermutungen. Lege in den Einstellungen fest, was du über dein Spiel glaubst – die App prüft es mit deinen Partien.'}{' '}
          <a className="text-muted-foreground underline underline-offset-4 hover:text-foreground" href={`${href({ page: 'einstellungen' })}`} data-testid="edit-hypotheses">
            {results.length ? 'Vermutungen bearbeiten' : 'Vermutungen anlegen'}
          </a>
        </SectionDescription>
      </SectionHeader>
      {results.length > 0 && (
        <ol className="flex list-none flex-col p-0">
          {results.map((r) => (
            <HypothesisRow key={r.hypothesis.id} r={r} />
          ))}
        </ol>
      )}
    </Section>
  );
}

function HypothesisRow({ r }: { r: HypothesisResult }) {
  return (
    <li className="grid gap-5 border-t py-7 first:border-t-0 first:pt-2 md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] md:gap-12" data-testid="hypothesis" data-verdict={r.verdict}>
      <div className="flex flex-col gap-3">
        <blockquote className="font-heading text-[26px] leading-[1.15] md:text-[32px]">„{r.hypothesis.text}“</blockquote>
        <p className="flex items-center gap-2 text-[17px] font-semibold" data-testid="verdict">
          <VerdictStone verdict={r.verdict} />
          <span className={cn(r.verdict === 'stimmt' && 'text-win', r.verdict === 'stimmtNicht' && 'text-loss', r.verdict === 'zuWenig' && 'font-normal text-muted-foreground')}>
            {VERDICT_LABELS[r.verdict][0].toUpperCase() + VERDICT_LABELS[r.verdict].slice(1)}
          </span>
        </p>
        <p className="max-w-[62ch] text-[15px] leading-relaxed text-muted-foreground" data-testid="hypothesis-summary">
          {r.summary}
        </p>
        {r.verdict !== 'zuWenig' && r.signals.length > 1 && (
          <ul className="flex list-none flex-col gap-1 p-0 text-[15px]">
            {r.signals.map((s) => (
              <li key={s.label} className="flex items-center gap-2">
                <VerdictStone verdict={s.supports ? 'stimmt' : 'stimmtNicht'} className="size-3.5" />
                <span className={s.supports ? 'text-foreground' : 'text-muted-foreground'}>
                  {s.label}: {s.supports ? 'ja' : 'nein'}
                </span>
              </li>
            ))}
          </ul>
        )}
        {r.action && <ActionLink action={r.action} />}
      </div>
      <div className="flex flex-col gap-5 md:pt-2">
        {r.evidence.map((pair, i) => (
          <Bars key={i} items={pair} caption={captionOf(r, i)} />
        ))}
      </div>
    </li>
  );
}

function captionOf(r: HypothesisResult, i: number): string {
  const k = r.hypothesis.kind;
  if (k === 'color' || k === 'opening') return i === 0 ? 'Punkte-Quote' : k === 'color' ? 'Patzer pro Partie' : 'Fehler mit Materialverlust pro Partie';
  if (k === 'phase') return 'Entscheidender Fehler in verlorenen Partien';
  if (k === 'timeTrouble') return 'Anteil Fehler und Patzer an deinen Zügen';
  return i === 0 ? 'Patzer pro Partie' : 'Genauigkeit';
}

/** Balken für einen Vergleich; Länge relativ zum größten Wert (Prozent: zu 100) */
function Bars({ items, caption }: { items: Evidence[]; caption: string }) {
  const max = items[0]?.unit === 'perGame' ? Math.max(0.5, ...items.map((e) => e.value ?? 0)) : 100;
  return (
    <figure className="flex flex-col gap-2">
      <figcaption className="text-[15px] text-muted-foreground">{caption}</figcaption>
      {items.map((e) => (
        <div key={e.label} className="grid grid-cols-[7rem_minmax(0,1fr)_3.25rem] items-center gap-3 text-[15px] sm:grid-cols-[9rem_minmax(0,1fr)_3.5rem]">
          <span className="flex min-w-0 flex-col leading-tight">
            <span className="truncate">{e.label}</span>
            <span className="text-[13px] text-muted-foreground tabular-nums">{nText(e.n, e.nUnit)}</span>
          </span>
          <span className="relative h-2 rounded-full bg-muted">
            {e.value !== null && <span className="absolute inset-y-0 left-0 rounded-full bg-foreground/80" style={{ width: `${Math.max(2, (100 * e.value) / max)}%` }} />}
          </span>
          <span className="text-right font-semibold tabular-nums">{fmtValue(e)}</span>
        </div>
      ))}
    </figure>
  );
}

function ActionLink({ action, className }: { action: Action; className?: string }) {
  const to = action.href ?? href({ page: 'training', mode: 'auswahl', filter: action.filter });
  return (
    <a href={to} className={cn('self-start text-[15px] font-semibold text-brass-text no-underline hover:underline', className)} data-testid="stats-action">
      {action.label}
    </a>
  );
}

/* ---------- Einzelheiten ---------- */

function Detail({ id, title, description, children }: { id: string; title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <Section aria-labelledby={`${id}-title`} data-testid={`stats-${id}`}>
      <SectionHeader>
        <SectionTitle id={`${id}-title`}>{title}</SectionTitle>
        {description && <SectionDescription>{description}</SectionDescription>}
      </SectionHeader>
      {children}
    </Section>
  );
}

/** Ruhige Tabelle: rechtsbündige Zahlen, feine Linien. hide = Spalten, die am Handy ausgeblendet werden (Nebensachen) */
function Table({ head, rows, hide = [], className }: { head: ReactNode[]; rows: { key: string; cells: ReactNode[]; muted?: boolean }[]; hide?: number[]; className?: string }) {
  const cls = (i: number) => cn(i > 0 && 'text-right', hide.includes(i) && 'max-sm:hidden');
  return (
    <div className={cn('overflow-x-auto', className)}>
      <table className="w-full border-collapse text-[15px] tabular-nums">
        <thead>
          <tr className="text-left align-bottom text-muted-foreground">
            {head.map((h, i) => (
              <th key={i} scope="col" className={cn('pb-2 pl-3 font-normal first:pl-0', cls(i))}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className={cn('border-t', r.muted && 'text-muted-foreground')} data-muted={r.muted || undefined}>
              {r.cells.map((c, i) => (
                <td key={i} className={cn('py-2.5 pl-3 first:pl-0', cls(i), i === 0 && !r.muted && 'font-medium')}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const fewNote = <p className="text-sm text-muted-foreground">Grau: unter {MIN_GAMES} Partien – Einzelfälle, noch keine Aussage.</p>;

function ColorSection({ games }: { games: GameFact[] }) {
  const rows = (['white', 'black'] as Side[]).map((c) => {
    const list = games.filter((g) => g.myColor === c);
    const top = topErrorType(list);
    const s = scoreRate(list);
    return {
      key: c,
      muted: s.n < MIN_GAMES,
      cells: [
        colorWord(c),
        s.n,
        pct(s.value),
        `${list.filter((g) => g.result === 'win').length} / ${list.filter((g) => g.result === 'draw').length} / ${list.filter((g) => g.result === 'loss').length}`,
        one(blundersPerGame(list).value),
        one(errorsPerGame(list).value),
        pct(accuracyOf(list).value),
        top ? (ERROR_TYPE_LABELS[top.type] ?? top.type) : '–',
      ],
    };
  });
  return (
    <Detail id="farbe" title="Farbe" description="Ergebnisse und Fehler mit Weiß und mit Schwarz.">
      <Table head={['Farbe', 'Partien', 'Punkte', 'S / R / N', 'Patzer pro Partie', 'Fehler + Patzer', 'Genauigkeit', 'Häufigste Fehlerart']} rows={rows} hide={[3, 5, 7]} />
    </Detail>
  );
}

function PhaseSection({ games }: { games: GameFact[] }) {
  const { rows, losses, noDecisive } = phaseRows(games);
  const board = boardDecided(games);
  const boardLosses = board.reduce((s, b) => s + b.count, 0);
  const worst = rows.reduce((a, b) => (b.decisive > a.decisive ? b : a), rows[0]);
  return (
    <Detail
      id="phase"
      title="Spielphase"
      description={
        <>
          Entscheidender Fehler = dein Fehler oder Patzer, nach dem deine Gewinnchance nicht mehr über 50 % kam. Grundlage: {nText(losses)} verlorene, analysierte
          {noDecisive > 0 && `; ${noDecisive} davon ohne einzelnen entscheidenden Fehler (z. B. Zeit überschritten oder viele kleine Ungenauigkeiten)`}.
        </>
      }
    >
      <Table
        head={['Phase', 'Deine Züge', 'Fehler + Patzer', 'Fehlerquote', 'Entscheidende Fehler']}
        hide={[1, 2]}
        rows={rows.map((r) => ({ key: r.phase, cells: [PHASE_LABELS[r.phase], r.moves, r.errors, pct(r.rate), `${r.decisive} von ${losses}`] }))}
      />
      {boardLosses > 0 && (
        <p className="text-[15px] text-muted-foreground" data-testid="board-decided">
          Aus deinen Brettpartien (eigene Angabe „Wo entschieden“, {nText(boardLosses)} verloren):{' '}
          {board
            .filter((b) => b.count)
            .map((b) => `${b.phase ? PHASE_LABELS[b.phase] : 'ohne Angabe'} ${b.count}`)
            .join(', ')}
          .
        </p>
      )}
      {losses >= MIN_GAMES && worst.decisive > 0 && (
        <ActionLink action={{ label: `Übe Puzzles aus ${worst.phase === 'opening' ? 'der Eröffnung' : worst.phase === 'middlegame' ? 'dem Mittelspiel' : 'Endspielen'}`, filter: { phase: worst.phase } }} />
      )}
    </Detail>
  );
}

function TimeSection({ games }: { games: GameFact[] }) {
  const buckets = clockBuckets(games);
  const clockGames = games.filter((g) => g.clock).length;
  return (
    <Detail id="zeitnot" title="Zeitnot" description={`Fehlerquote nach Restzeit vor dem Zug (Anteil der Grundzeit). Nur Partien mit Uhr: ${nText(clockGames)}.`}>
      {clockGames === 0 ? (
        <p className="text-muted-foreground">Keine Partien mit Uhr in diesem Zeitraum.</p>
      ) : (
        <Table
          head={['Restzeit', 'Deine Züge', 'Partien', 'Fehler + Patzer', 'Fehlerquote']}
          hide={[2, 3]}
          rows={buckets.map((b) => ({ key: b.key, muted: b.games < MIN_GAMES, cells: [b.label, b.moves, b.games, b.errors, pct(b.rate)] }))}
        />
      )}
      {buckets.some((b) => b.games < MIN_GAMES && b.moves > 0) && fewNote}
    </Detail>
  );
}

function OpeningSection({ games }: { games: GameFact[] }) {
  const rows = openingRows(games);
  const [all, setAll] = useState(false);
  const unknown = games.filter((g) => !g.opening && (g.source !== 'brett' || g.moves.length)).length;
  return (
    <Detail
      id="eroeffnungen"
      title="Eröffnungen"
      description={
        <>
          Getrennt nach deiner Farbe. Chess.com-Partien nach dem ECO-Code, App- und Brettpartien nach den Zügen.
          {unknown > 0 && ` ${nText(unknown)} ohne erkannte Eröffnung.`}
        </>
      }
    >
      <div className="flex flex-col gap-10">
        {(['white', 'black'] as Side[]).map((c) => {
          const list = rows.filter((r) => r.color === c);
          const shown = all ? list : list.slice(0, 6);
          return (
            <div key={c} className="flex flex-col gap-2" data-testid={`openings-${c}`}>
              <h3 className="text-[17px] font-semibold">Mit {colorWord(c)}</h3>
              {list.length === 0 ? (
                <p className="text-muted-foreground">Keine Partien.</p>
              ) : (
                <Table
                  hide={[4]}
                  head={['Eröffnung', 'Partien', 'Punkte', 'Patzer pro Partie', 'Häufigste Fehlerart', '']}
                  rows={shown.map((r) => ({
                    key: r.family,
                    muted: r.games < MIN_GAMES,
                    cells: [
                      openingLabel(r.family),
                      r.games,
                      pct(r.score),
                      one(r.blunders),
                      r.topError ? (ERROR_TYPE_LABELS[r.topError] ?? r.topError).replace(' (ohne klare Taktik)', '') : '–',
                      r.topError ? (
                        <a className="font-semibold text-brass-text no-underline hover:underline" href={href({ page: 'training', mode: 'auswahl', filter: { opening: r.family, color: c } })} aria-label={`Puzzles aus ${openingLabel(r.family)} mit ${colorWord(c)} üben`}>
                          Üben
                        </a>
                      ) : (
                        ''
                      ),
                    ],
                  }))}
                />
              )}
              {list.length > 6 && (
                <button type="button" className="self-start text-[15px] text-muted-foreground underline underline-offset-4 hover:text-foreground" onClick={() => setAll(!all)}>
                  {all ? 'Weniger zeigen' : `Alle ${list.length} zeigen`}
                </button>
              )}
            </div>
          );
        })}
      </div>
      {rows.some((r) => r.games < MIN_GAMES) && fewNote}
    </Detail>
  );
}

const progressConfig = { blunders: { label: 'Patzer pro Partie', color: 'var(--chart-1)' }, accuracy: { label: 'Genauigkeit', color: 'var(--chart-2)' } } satisfies ChartConfig;

function ProgressSection({ games }: { games: GameFact[] }) {
  const weeks = weekly(games);
  const rows = weeks.map((w, i) => ({ ...w, x: i, label: formatDate(w.week).slice(0, 6) }));
  return (
    <Detail id="fortschritt" title="Fortschritt" description="Je Kalenderwoche (ab Montag): Patzer pro Partie und Genauigkeit nach der Lichess-Formel. Wochen ohne Partien fehlen.">
      {rows.length < 2 ? (
        <p className="text-muted-foreground">Erst {rows.length === 1 ? 'eine Woche' : 'keine Woche'} mit analysierten Partien – der Verlauf erscheint ab der zweiten.</p>
      ) : (
        <div className="grid gap-8 md:grid-cols-2">
          {(['blunders', 'accuracy'] as const).map((k) => (
            <figure key={k} className="flex flex-col gap-2" data-testid={`progress-${k}`}>
              <figcaption className="text-[15px] font-semibold">{progressConfig[k].label}</figcaption>
              <ChartContainer config={progressConfig} className="aspect-auto h-44 w-full">
                <LineChart data={rows} margin={{ left: 0, right: 12, top: 8, bottom: 0 }}>
                  <CartesianGrid vertical={false} strokeDasharray="2 4" />
                  <XAxis dataKey="x" type="number" domain={['dataMin', 'dataMax']} ticks={rows.map((r) => r.x)} padding={{ left: 14, right: 14 }} tickLine={false} axisLine={false} tickMargin={8} tick={{ fontSize: 13 }} tickFormatter={(v: number) => rows[v]?.label ?? ''} />
                  <YAxis width={36} tickLine={false} axisLine={false} tickCount={3} tick={{ fontSize: 13 }} domain={k === 'accuracy' ? ['dataMin - 5', 'dataMax + 5'] : [0, 'dataMax + 1']} tickFormatter={(v: number) => (k === 'accuracy' ? `${Math.round(v)}` : `${Math.round(v * 10) / 10}`)} />
                  <ChartTooltip
                    cursor={{ strokeDasharray: '3 3' }}
                    content={({ active, payload }) => {
                      const r = (payload?.[0] as { payload?: (typeof rows)[number] } | undefined)?.payload;
                      if (!active || !r) return null;
                      return (
                        <div className="rounded-lg border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-lg">
                          <b className="tabular-nums">{k === 'accuracy' ? pct(r.accuracy) : one(r.blunders)}</b> <span className="text-muted-foreground">Woche ab {formatDate(r.week)}, {nText(r.games)}</span>
                        </div>
                      );
                    }}
                  />
                  <Line dataKey={k} type="monotone" stroke={`var(--color-${k})`} strokeWidth={2} isAnimationActive={false} dot={{ r: 3, fill: `var(--color-${k})` }} activeDot={{ r: 5, stroke: 'var(--background)', strokeWidth: 2 }} />
                </LineChart>
              </ChartContainer>
            </figure>
          ))}
        </div>
      )}
      {rows.length > 0 && (
        <p className="text-sm text-muted-foreground tabular-nums" data-testid="progress-weeks">
          Partien je Woche: {rows.map((r) => `${r.label} ${r.games}`).join(', ')}.
        </p>
      )}
    </Detail>
  );
}

function ClassSection({ games }: { games: GameFact[] }) {
  const classes = timeClassRows(games);
  const src = sourceCompare(games);
  const labels: Record<(typeof SOURCE_COMPARE)[number], string> = {
    pieceTaken: 'Material eingestellt',
    threatMissed: 'Drohung übersehen',
    mateMissed: 'Matt übersehen',
    mateAllowed: 'Matt zugelassen',
    timeTrouble: 'Fehler in Zeitnot',
  };
  return (
    <Detail id="zeitklassen" title="Zeitklassen und Quellen">
      <Table
        head={['Zeitklasse', 'Partien', 'Punkte', 'Patzer pro Partie', 'Genauigkeit']}
        rows={classes.map((c) => ({ key: c.timeClass, muted: c.games < MIN_GAMES, cells: [TC_LABELS[c.timeClass] ?? c.timeClass, c.games, pct(c.score), one(c.blunders), pct(c.accuracy)] }))}
      />
      {classes.some((c) => c.games < MIN_GAMES) && fewNote}
      <div className="mt-4 flex flex-col gap-2" data-testid="source-compare">
        <h3 className="text-[17px] font-semibold">Chess.com gegen Brett</h3>
        <p className="max-w-[68ch] text-[15px] text-muted-foreground">
          Anteil der Partien mit diesem Fehler. Chess.com aus der Engine-Analyse („Material eingestellt“ schließt ungedeckte Figuren und Gabeln ein), Brett nur aus deinen eingetragenen Gründen – also deine eigene Einschätzung, nicht nachgeprüft.
        </p>
        {src.board.games === 0 ? (
          <p className="text-[15px] text-muted-foreground" data-testid="no-board">
            Noch keine Brettpartien in diesem Zeitraum.{' '}
            <a className="font-semibold text-brass-text no-underline hover:underline" href={href({ page: 'brett' })}>
              Brettpartie eintragen
            </a>
          </p>
        ) : (
          <Table
            head={['', `Chess.com (${nText(src.chesscom.games)})`, `Brett, eigene Angabe (${nText(src.board.games)})`]}
            rows={[
              { key: 'score', cells: ['Punkte-Quote', pct(src.chesscom.score), pct(src.board.score)] },
              ...SOURCE_COMPARE.map((t) => ({ key: t, cells: [labels[t], pct(src.chesscom.shares[t]), pct(src.board.shares[t])] })),
            ]}
          />
        )}
        {src.board.games > 0 && src.board.games < MIN_GAMES && <p className="text-sm text-muted-foreground">Erst {nText(src.board.games)} am Brett – noch keine Aussage.</p>}
      </div>
    </Detail>
  );
}
