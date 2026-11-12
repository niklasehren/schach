import { useMemo, useState } from 'react';
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { BookOpen, Download, Info, Swords, Target } from 'lucide-react';
import { db, type GameRecord } from '../db/schema';
import { useLive } from '../db/useLive';
import { href } from '../app/router';
import { analysisQueue } from '../analysis/queue';
import { useQueueState } from '../analysis/useQueue';
import { countErrorTypes } from '../analysis/errorTypes';
import { todaysQueue } from '../training/leitner';
import { formatDate } from '../chess/format';
import { GameRow } from '../components/GameRow';
import { MIN_GAMES, RANGE_LABELS, RANGE_PHRASE, ratingSeries, segments, type RatingPoint, type RatingRange } from '../stats/rating';
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button, buttonVariants } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { cn } from '@/lib/utils';

const tcLabels: Record<string, string> = { bullet: 'Bullet', blitz: 'Blitz', rapid: 'Rapid', daily: 'Täglich' };
const eyebrow = 'text-xs font-bold tracking-[0.08em] uppercase';

export function OverviewPage() {
  const games = useLive(() => db.games.orderBy('date').reverse().toArray(), []);
  const analyses = useLive(() => db.analyses.where('status').equals('done').toArray(), []);
  const puzzles = useLive(() => db.puzzles.toArray(), []);
  const queue = useQueueState();

  if (!games || !analyses || !puzzles) return <p className="text-muted-foreground">Lädt …</p>;

  if (games.length === 0) {
    return (
      <div className="w-full max-w-[1180px] animate-in px-3.5 fade-in-0 slide-in-from-bottom-1 md:px-0">
        <Card className="gap-4 bg-hero p-7 text-hero-foreground ring-0">
          <span className={cn(eyebrow, 'text-hero-muted')}>Willkommen</span>
          <h1 className="font-heading text-4xl leading-tight md:text-5xl">Dein persönlicher Schachberater</h1>
          <p className="max-w-xl text-hero-muted">Lade deine Chess.com-Partien oder spiel eine Partie. Die App findet deine Fehler und macht daraus Training.</p>
          <div className="flex flex-wrap gap-3">
            <a className={cn(buttonVariants({ size: 'lg' }), 'h-12 bg-brass px-5 text-base font-bold text-brass-foreground no-underline hover:bg-brass/90')} href={href({ page: 'import' })}>
              <Download data-icon="inline-start" /> Chess.com-Partien laden
            </a>
            <a className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), 'h-12 border-hero-foreground/40 bg-transparent px-5 text-base text-hero-foreground no-underline')} href={href({ page: 'spielen' })}>
              <Swords data-icon="inline-start" /> Partie spielen
            </a>
          </div>
        </Card>
      </div>
    );
  }

  const today = todaysQueue(puzzles, Date.now());
  const due = today.due.length + today.fresh.length;
  const allTypes = countErrorTypes(analyses);
  const totalErrors = allTypes.reduce((sum, e) => sum + e.count, 0);
  // Top 3 nur mit konkreten Fehlerarten; Fehler ohne klare Taktik als eigene Zeile darunter
  const errorTypes = allTypes.filter((e) => e.type !== 'other');
  const positional = allTypes.find((e) => e.type === 'other')?.count ?? 0;
  const byId = new Map(analyses.map((a) => [a.gameId, a]));
  const progress = queue.total ? (queue.processed / queue.total) * 100 : 0;

  return (
    <div className="grid w-full max-w-[1180px] animate-in grid-cols-1 gap-4 px-3.5 fade-in-0 slide-in-from-bottom-1 md:grid-cols-[5fr_7fr] md:gap-5 md:px-0">
      {/* Hauptkarte: Training */}
      <Card className="gap-4 bg-hero p-6 text-hero-foreground ring-0 md:p-7" aria-labelledby="due-title">
        <span className={cn(eyebrow, 'text-hero-muted')} id="due-title">
          Heute fällig
        </span>
        <div className="flex items-baseline gap-3.5">
          <span className="font-heading text-[92px] leading-[0.9] md:text-[112px]" data-testid="overview-due">
            {due}
          </span>
          <span className="text-2xl">{due === 1 ? 'Puzzle' : 'Puzzles'}</span>
        </div>
        <span className="text-[15px] text-hero-muted">
          {today.fresh.length} neue aus deinen Fehlern · {today.due.length} Wiederholungen
        </span>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2" role="list" aria-label="Trainingsarten">
          <a role="listitem" href={href({ page: 'training' })} className="flex items-start gap-2.5 rounded-xl border-[1.5px] border-brass bg-brass/15 p-3 text-hero-foreground no-underline">
            <Target className="mt-0.5 size-5 shrink-0" />
            <span className="flex flex-col">
              <strong>Meine Fehler</strong>
              <small className="text-hero-muted">Stellungen aus deinen Partien</small>
            </span>
          </a>
          <span role="listitem" aria-disabled="true" className="flex items-start gap-2.5 rounded-xl border-[1.5px] border-dashed border-hero-foreground/30 p-3 opacity-80">
            <BookOpen className="mt-0.5 size-5 shrink-0" />
            <span className="flex flex-col">
              <strong>Allgemeines Training</strong>
              <small className="text-hero-muted">Taktik zu deinen Schwächen · kommt bald</small>
            </span>
          </span>
        </div>
        <a
          className={cn(buttonVariants({ size: 'lg' }), 'mt-auto h-13 bg-brass text-[17px] font-bold text-brass-foreground no-underline hover:bg-brass/90')}
          href={href({ page: 'training' })}
          data-testid="overview-start"
        >
          <Target data-icon="inline-start" /> {due ? 'Training starten' : 'Zum Training'}
        </a>
      </Card>

      <RatingCard games={games} />

      {/* Häufigste Fehler */}
      <Card>
        <CardHeader>
          <CardDescription className={eyebrow}>Deine häufigsten Fehler</CardDescription>
          {totalErrors > 0 && <CardAction className="text-sm text-muted-foreground">aus {totalErrors} Fehlern und Patzern</CardAction>}
        </CardHeader>
        <CardContent className="flex flex-col">
          {errorTypes.length === 0 ? (
            <p className="text-muted-foreground">{totalErrors ? 'Noch keine Fehler mit klarer Taktik gefunden.' : 'Erscheint, sobald Partien analysiert sind.'}</p>
          ) : (
            <ol className="m-0 list-none p-0" data-testid="error-types">
              {errorTypes.slice(0, 3).map((e, i) => (
                <li key={e.type} className="grid grid-cols-[34px_1fr_auto] items-center gap-3 border-t py-3 first:border-t-0">
                  <span className="text-center font-heading text-[32px] leading-none text-brass">{i + 1}</span>
                  <span className="font-semibold">
                    {e.label}
                    <Progress value={(e.count / errorTypes[0].count) * 100} className="mt-2" aria-label={`${e.count} von ${errorTypes[0].count}`} />
                  </span>
                  <span className="text-2xl font-bold tabular-nums">
                    {e.count}
                    <small className="text-sm font-medium text-muted-foreground">×</small>
                  </span>
                </li>
              ))}
            </ol>
          )}
          {positional > 0 && (
            <p className="mt-1 border-t pt-3 text-sm text-muted-foreground" data-testid="positional-errors">
              Dazu {positional} Fehler ohne klare Taktik (Stellung, Plan)
            </p>
          )}
        </CardContent>
      </Card>

      {/* Letzte Partien */}
      <Card className="recent-card gap-2 pb-1">
        <CardHeader>
          <CardDescription className={eyebrow}>Letzte Partien</CardDescription>
          <CardAction>
            <a className="text-sm font-bold text-primary no-underline" href={href({ page: 'partien' })}>
              Alle →
            </a>
          </CardAction>
        </CardHeader>
        <div className="flex flex-col">
          {games.slice(0, 5).map((g) => (
            <GameRow key={g.id} game={g} analysis={byId.get(g.id)} analysing={queue.current?.gameId === g.id} />
          ))}
        </div>
      </Card>

      {/* Analyse-Fortschritt */}
      <Card className="flex-row flex-wrap items-center gap-x-5 gap-y-2 px-5 py-3.5 md:col-span-2" data-testid="overview-analysis">
        <span className={cn(eyebrow, 'text-muted-foreground')}>Analyse</span>
        <span className="whitespace-nowrap">
          <b className="text-xl">{queue.processed}</b> von {queue.total} Partien
        </span>
        <Progress value={progress} className="min-w-40 flex-1 basis-full sm:basis-auto" aria-label="Analyse-Fortschritt" />
        <span className="text-sm text-muted-foreground">
          {queue.processed >= queue.total ? 'alle analysiert' : queue.status === 'paused' ? 'pausiert' : 'läuft, solange die App offen ist'}
        </span>
        {queue.processed < queue.total && (
          <Button variant="outline" size="sm" onClick={() => (queue.status === 'paused' ? analysisQueue.resume() : analysisQueue.pause())}>
            {queue.status === 'paused' ? 'Weiter' : 'Pause'}
          </Button>
        )}
      </Card>
    </div>
  );
}

const chartConfig = { rating: { label: 'Wertung', color: 'var(--chart-1)' } } satisfies ChartConfig;

/** Rating-Verlauf aus den importierten Chess.com-Partien: echte Zeitachse, Zeitraum wählbar, Lücken bei Pausen */
function RatingCard({ games }: { games: GameRecord[] }) {
  const series = useMemo(() => {
    const out: Record<string, RatingPoint[]> = {};
    for (const g of games) {
      if (g.source !== 'chesscom' || !g.myColor || !g.timeClass) continue;
      const r = g[g.myColor].rating;
      if (r === undefined) continue;
      (out[g.timeClass] ??= []).push({ date: g.date, rating: r });
    }
    for (const k of Object.keys(out)) out[k].sort((a, b) => a.date - b.date);
    return out;
  }, [games]);
  const classes = Object.keys(series).sort((a, b) => series[b].length - series[a].length);
  const [pick, setPick] = useState<string | null>(null);
  const [range, setRange] = useState<RatingRange>('4w');
  const tc = pick && classes.includes(pick) ? pick : classes[0];

  if (!tc) {
    return (
      <Card>
        <CardHeader>
          <CardDescription className={eyebrow}>Chess.com-Wertung</CardDescription>
        </CardHeader>
        <CardContent className="text-muted-foreground">Erscheint, sobald du Chess.com-Partien importiert hast.</CardContent>
      </Card>
    );
  }
  const all = series[tc];
  const s = ratingSeries(all, range, Date.now());
  const name = tcLabels[tc];
  const current = all[all.length - 1].rating;
  const enough = s.games >= MIN_GAMES;
  const data = s.buckets.map((b, i) => ({ i, x: b.start, rating: b.rating }));
  const isolated = new Set(segments(s.buckets).filter((seg) => seg.length === 1).map((seg) => seg[0].index));

  return (
    <Card data-testid="rating-card">
      <CardHeader className="max-sm:grid-cols-1!">
        <CardDescription className={eyebrow}>Chess.com</CardDescription>
        <CardTitle className="flex items-center gap-1.5 font-sans text-[17px] font-bold">
          {name}-Wertung
          <Popover>
            <PopoverTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Was ist die Wertung?" data-testid="info-btn" />}>
              <Info />
            </PopoverTrigger>
            <PopoverContent className="w-80 text-sm" data-testid="info-text">
              Deine Chess.com-Wertung (Rating). Sie steigt bei Siegen und sinkt bei Niederlagen. Jede Zeitklasse (Rapid, Blitz, Bullet, Täglich) hat ihre eigene Wertung.
            </PopoverContent>
          </Popover>
        </CardTitle>
        {enough && s.delta !== null && (
          <CardAction
            className={cn('text-[15px] font-bold max-sm:col-start-1 max-sm:row-span-1 max-sm:row-start-3 max-sm:justify-self-start', s.delta >= 0 ? 'text-win' : 'text-loss')}
            data-testid="rating-delta"
          >
            {s.delta > 0 ? '+' : s.delta < 0 ? '−' : '±'}
            {Math.abs(s.delta)} {RANGE_PHRASE[range]}
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-baseline gap-3.5">
          <span className="font-heading text-6xl leading-none" data-testid="rating-now">
            {current}
          </span>
          {enough && s.best !== null && (
            <span className="text-sm text-muted-foreground" data-testid="rating-stats">
              Bestwert {s.best} · {s.games} {name}-Partien
            </span>
          )}
        </div>
        {enough ? (
          <div data-testid="rating-chart" data-segments={segments(s.buckets).length}>
            <ChartContainer config={chartConfig} className="aspect-auto h-44 w-full">
              <AreaChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis
                  dataKey="x"
                  type="number"
                  scale="time"
                  domain={[s.from, s.to]}
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  minTickGap={40}
                  tickFormatter={(v: number) => formatDate(v).slice(0, 6)}
                />
                <YAxis width={40} tickLine={false} axisLine={false} domain={['dataMin - 15', 'dataMax + 15']} allowDecimals={false} />
                <ChartTooltip
                  cursor={false}
                  content={
                    <ChartTooltipContent
                      labelFormatter={(_, p) => {
                        const x = p?.[0]?.payload?.x as number | undefined;
                        return x ? (s.unit === 'day' ? formatDate(x) : `Woche ab ${formatDate(x)}`) : '';
                      }}
                    />
                  }
                />
                <Area
                  dataKey="rating"
                  type="linear"
                  connectNulls={false}
                  stroke="var(--color-rating)"
                  strokeWidth={2.5}
                  fill="var(--color-rating)"
                  fillOpacity={0.15}
                  isAnimationActive={false}
                  dot={(props: { cx?: number; cy?: number; index?: number }) =>
                    props.index !== undefined && isolated.has(props.index) && props.cx !== undefined && props.cy !== undefined ? (
                      <circle key={props.index} cx={props.cx} cy={props.cy} r={4} fill="var(--color-rating)" />
                    ) : (
                      <g key={props.index} />
                    )
                  }
                />
              </AreaChart>
            </ChartContainer>
            <p className="mt-1 text-center text-xs text-muted-foreground">{s.unit === 'day' ? 'ein Punkt pro Tag' : 'ein Punkt pro Woche'}</p>
          </div>
        ) : (
          <p className="grid min-h-40 place-items-center rounded-xl border-[1.5px] border-dashed p-3 text-center text-muted-foreground" data-testid="rating-few">
            Zu wenige Partien in diesem Zeitraum ({s.games} {name}-{s.games === 1 ? 'Partie' : 'Partien'}).
          </p>
        )}
      </CardContent>
      <CardFooter className="flex flex-wrap justify-between gap-2 border-t">
        <ToggleGroup
          variant="outline"
          size="sm"
          value={[range]}
          onValueChange={(v: string[]) => v[0] && setRange(v[0] as RatingRange)}
          aria-label="Zeitraum"
        >
          {(Object.keys(RANGE_LABELS) as RatingRange[]).map((r) => (
            <ToggleGroupItem key={r} value={r}>
              {RANGE_LABELS[r]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        {classes.length > 1 && (
          <ToggleGroup variant="outline" size="sm" value={[tc]} onValueChange={(v: string[]) => v[0] && setPick(v[0])} aria-label="Zeitklasse">
            {classes.map((c) => (
              <ToggleGroupItem key={c} value={c}>
                {tcLabels[c]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        )}
      </CardFooter>
    </Card>
  );
}
