import { useState } from 'react';
import { Area, AreaChart, ReferenceLine, XAxis, YAxis } from 'recharts';
import type { MoveClass } from '../db/schema';
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart';

type Props = {
  /** Gewinnchance für Weiß in Prozent je Stellung (Index 0 = Ausgangsstellung) */
  values: (number | null)[];
  /** Markierte Züge (Halbzug → Klasse) als Punkte */
  marks: Record<number, MoveClass>;
  /** Text je Halbzug für den Tooltip, z. B. „7. Df1??“ */
  labels: string[];
  current: number;
  onSelect: (ply: number) => void;
};

const markText: Record<MoveClass, string> = { blunder: 'Patzer', mistake: 'Fehler', inaccuracy: 'Ungenauigkeit' };
const markColor: Record<MoveClass, string> = { blunder: 'var(--mark-blunder)', mistake: 'var(--mark-mistake)', inaccuracy: 'var(--mark-inaccuracy)' };
const config = { white: { label: 'Gewinnchance Weiß', color: 'var(--chart-1)' } } satisfies ChartConfig;

type Row = { ply: number; white: number | null; label: string; mark?: MoveClass };

/** Bewertungskurve (shadcn Chart): Gewinnchance Weiß, Fehler als Punkte, Klick springt zum Zug */
export function EvalChart({ values, marks, labels, current, onSelect }: Props) {
  const n = Math.max(1, values.length - 1);
  const data: Row[] = values.map((v, i) => ({ ply: i, white: v, label: i === 0 ? 'Start' : labels[i - 1], mark: marks[i] }));
  const [hover, setHover] = useState<number | null>(null);
  return (
    <div
      className="evalchart relative w-full cursor-pointer rounded-lg border bg-muted/30 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      data-testid="evalchart"
      role="slider"
      aria-label="Bewertungskurve – Zug wählen"
      aria-valuemin={0}
      aria-valuemax={n}
      aria-valuenow={current}
      aria-valuetext={current === 0 ? 'Ausgangsstellung' : labels[current - 1]}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft') onSelect(Math.max(0, current - 1));
        if (e.key === 'ArrowRight') onSelect(Math.min(n, current + 1));
      }}
    >
      <ChartContainer config={config} className="aspect-auto h-44 w-full">
        <AreaChart
          data={data}
          margin={{ top: 12, right: 10, bottom: 8, left: 10 }}
          onClick={(state) => {
            const i = state?.activeTooltipIndex ?? hover;
            if (i !== null && i !== undefined) onSelect(Number(i));
          }}
          onMouseMove={(state) => state?.activeTooltipIndex !== undefined && setHover(Number(state.activeTooltipIndex))}
        >
          <XAxis dataKey="ply" type="number" domain={[0, n]} hide />
          <YAxis domain={[0, 100]} hide />
          <ReferenceLine y={50} stroke="var(--border)" />
          <ReferenceLine x={current} stroke="var(--brass)" strokeWidth={2} />
          <ChartTooltip
            cursor={{ stroke: 'var(--muted-foreground)', strokeDasharray: '3 3' }}
            content={({ active, payload }) => {
              const row = payload?.[0]?.payload as Row | undefined;
              if (!active || !row) return null;
              return (
                <div className="rounded-md border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-md tabular-nums">
                  <b>{row.label}</b>
                  {row.mark && <span> · {markText[row.mark]}</span>}
                  <span className="text-muted-foreground"> · Weiß {row.white === null ? '–' : `${Math.round(row.white)} %`}</span>
                </div>
              );
            }}
          />
          <Area
            dataKey="white"
            type="linear"
            baseValue={50}
            stroke="var(--color-white)"
            strokeWidth={2}
            fill="var(--color-white)"
            fillOpacity={0.14}
            isAnimationActive={false}
            dot={(p: { cx?: number; cy?: number; payload?: Row; index?: number }) =>
              p.payload?.mark && p.cx !== undefined && p.cy !== undefined ? (
                <circle
                  key={p.index}
                  className={`evalchart-dot dot-${p.payload.mark}`}
                  data-ply={p.payload.ply}
                  cx={p.cx}
                  cy={p.cy}
                  r={p.payload.mark === 'blunder' ? 5.5 : 4.5}
                  fill={markColor[p.payload.mark]}
                  stroke="var(--card)"
                  strokeWidth={2}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelect(p.payload!.ply);
                  }}
                />
              ) : (
                <g key={p.index} />
              )
            }
            activeDot={{ r: 4, stroke: 'var(--card)', strokeWidth: 2 }}
          />
        </AreaChart>
      </ChartContainer>
    </div>
  );
}
