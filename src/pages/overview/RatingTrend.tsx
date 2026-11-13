import { useEffect, useMemo, useRef, useState } from 'react';
import { Area, AreaChart, XAxis, YAxis } from 'recharts';
import { Info } from 'lucide-react';
import { type GameRecord } from '../../db/schema';
import { formatDate } from '../../chess/format';
import { chartRows, evenTicks, type ChartRow as Row } from '../../stats/rating';
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const tcLabels: Record<string, string> = { bullet: 'Bullet', blitz: 'Blitz', rapid: 'Rapid', daily: 'Täglich' };
const chartConfig = { rating: { label: 'Wertung', color: 'var(--chart-1)' } } satisfies ChartConfig;
const DAY = 86_400_000;

/** Zeiträume; „all“ = alle Daten (Standard). Die anderen erscheinen nur, wenn die Daten weiter zurückreichen. */
const RANGES = [
  { key: 'all', label: 'Alles', days: Infinity },
  { key: '3m', label: '3 Monate', days: 91 },
  { key: '4w', label: '4 Wochen', days: 28 },
] as const;
type RangeKey = (typeof RANGES)[number]['key'];

type Point = { date: number; rating: number };

export function useRatingSeries(games: GameRecord[]) {
  return useMemo(() => {
    const out: Record<string, Point[]> = {};
    for (const g of games) {
      if (g.source !== 'chesscom' || !g.myColor || !g.timeClass) continue;
      const r = g[g.myColor].rating;
      if (r === undefined) continue;
      (out[g.timeClass] ??= []).push({ date: g.date, rating: r });
    }
    for (const k of Object.keys(out)) out[k].sort((a, b) => a.date - b.date);
    return out;
  }, [games]);
}

/** Breite des Elements beobachten (für die Anzahl der Datumsmarken) */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(600);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

const signed = (d: number) => `${d > 0 ? '+' : d < 0 ? '−' : '±'}${Math.abs(d)}`;
const short = (ms: number) => formatDate(ms).slice(0, 6);

/** Chess.com-Wertung: große Zahl, Veränderung, Verlauf ohne leere Flächen */
export function RatingTrend({ games, className }: { games: GameRecord[]; className?: string }) {
  const series = useRatingSeries(games);
  const classes = Object.keys(series).sort((a, b) => series[b].length - series[a].length);
  const [pick, setPick] = useState<string | null>(null);
  const [range, setRange] = useState<RangeKey>('all');
  const [ref, width] = useWidth<HTMLDivElement>();
  const tc = pick && classes.includes(pick) ? pick : classes[0];

  if (!tc) {
    return (
      <div className={className} data-testid="rating-card">
        <h2 className="font-heading text-[26px] leading-tight font-normal">Chess.com-Wertung</h2>
        <p className="mt-2 text-muted-foreground">Erscheint, sobald du Chess.com-Partien importiert hast.</p>
      </div>
    );
  }

  const all = series[tc];
  const now = Date.now();
  // Nur Zeiträume anbieten, die weniger zeigen als „Alles“
  const ranges = RANGES.filter((r) => r.key === 'all' || (all[0].date < now - r.days * DAY && all.filter((p) => p.date >= now - r.days * DAY).length >= 2));
  const active = ranges.find((r) => r.key === range) ?? ranges[0];
  const points = active.days === Infinity ? all : all.filter((p) => p.date >= now - active.days * DAY);
  const { rows, unit } = chartRows(points, now);
  const current = all.at(-1)!.rating;
  const before = all.filter((p) => p.date < points[0]?.date).at(-1);
  const delta = points.length ? current - (before ?? points[0]).rating : 0;
  const best = Math.max(...all.map((p) => p.rating));
  const name = tcLabels[tc];
  const ticks = evenTicks(rows, Math.max(2, Math.floor(width / 110)));

  return (
    <div className={cn('flex flex-col gap-4', className)} data-testid="rating-card">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="flex items-end gap-3.5">
          <span className="font-heading text-[64px] leading-[0.8] tabular-nums" data-testid="rating-now">
            {current}
          </span>
          <span className="flex flex-col text-[15px] leading-snug text-muted-foreground">
            <span className="flex items-center gap-1 text-foreground">
              Chess.com, {name}
              <Popover>
                <PopoverTrigger render={<Button variant="ghost" size="icon-sm" className="-my-1 text-muted-foreground" aria-label="Was ist die Wertung?" data-testid="info-btn" />}>
                  <Info />
                </PopoverTrigger>
                <PopoverContent className="w-80 text-sm" data-testid="info-text">
                  Deine Chess.com-Wertung (Rating). Sie steigt bei Siegen und sinkt bei Niederlagen. Jede Zeitklasse (Rapid, Blitz, Bullet, Täglich) hat ihre eigene Wertung.
                </PopoverContent>
              </Popover>
            </span>
            <span className="tabular-nums">
              <span data-testid="rating-delta">
                {signed(delta)} seit {short(points[0].date)}
              </span>
              , <span data-testid="rating-best">Bestwert {best}</span>
            </span>
          </span>
        </div>
        {classes.length > 1 && (
          <div className="flex flex-wrap gap-1" role="group" aria-label="Zeitklasse">
            {classes.map((c) => (
              <button
                key={c}
                type="button"
                aria-pressed={c === tc}
                onClick={() => setPick(c)}
                className={cn(
                  'rounded-md px-2.5 py-1 text-[15px] text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                  c === tc && 'bg-muted font-semibold text-foreground',
                )}
              >
                {tcLabels[c]}
              </button>
            ))}
          </div>
        )}
      </div>
      <div ref={ref}>
        {rows.length >= 2 ? (
          <ChartContainer config={chartConfig} className="aspect-auto h-44 w-full md:h-48" data-testid="rating-chart" data-points={rows.length}>
            <AreaChart data={rows} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
              <defs>
                <linearGradient id="rating-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-rating)" stopOpacity={0.22} />
                  <stop offset="100%" stopColor="var(--color-rating)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="x"
                type="number"
                domain={['dataMin', 'dataMax']}
                ticks={ticks}
                interval={0}
                padding={{ left: 18, right: 18 }}
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tick={{ fontSize: 14 }}
                tickFormatter={(v: number) => short(rows[v]?.date ?? 0)}
              />
              <YAxis width={40} tickLine={false} axisLine={false} domain={['dataMin - 10', 'dataMax + 10']} allowDecimals={false} tickCount={3} tick={{ fontSize: 14 }} />
              <ChartTooltip
                cursor={{ strokeDasharray: '3 3' }}
                content={({ active, payload }) => {
                  const r = (payload?.[0] as { payload?: Row } | undefined)?.payload;
                  if (!active || !r) return null;
                  return (
                    <div className="rounded-lg border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-lg">
                      <b className="tabular-nums">{r.rating}</b> <span className="text-muted-foreground">am {formatDate(r.date)}</span>
                    </div>
                  );
                }}
              />
              <Area dataKey="rating" type="monotone" stroke="var(--color-rating)" strokeWidth={2} fill="url(#rating-fill)" isAnimationActive={false} dot={false} activeDot={{ r: 4, stroke: 'var(--background)', strokeWidth: 2 }} />
            </AreaChart>
          </ChartContainer>
        ) : (
          <p className="text-muted-foreground" data-testid="rating-few">
            Erst eine {name}-Partie – der Verlauf erscheint ab der zweiten.
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
        <span data-testid="rating-stats">
          Ein Punkt pro {unit === 'game' ? 'Partie' : unit === 'day' ? 'Tag' : 'Woche'}, {points.length} {name}-{points.length === 1 ? 'Partie' : 'Partien'}
        </span>
        {ranges.length > 1 && (
          <span className="flex gap-1" role="group" aria-label="Zeitraum">
            {ranges.map((r) => (
              <button
                key={r.key}
                type="button"
                aria-pressed={r.key === active.key}
                onClick={() => setRange(r.key)}
                className={cn('rounded-md px-2 py-0.5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none', r.key === active.key && 'bg-muted font-semibold text-foreground')}
              >
                {r.label}
              </button>
            ))}
          </span>
        )}
      </div>
    </div>
  );
}
