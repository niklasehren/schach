import { CircleAlert, CircleCheck, CircleDashed, Clock, LoaderCircle, MonitorSmartphone, Rocket, Sun, Zap, type LucideIcon } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { AnalysisRecord, GameRecord } from '../db/schema';
import { formatDate, formatTimeControl, myResultText, scoreText } from '../chess/format';
import { href } from '../app/router';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const tcIcon: Record<string, LucideIcon> = { bullet: Rocket, blitz: Zap, rapid: Clock, daily: Sun, classical: Clock };
const tcName: Record<string, string> = { bullet: 'Bullet', blitz: 'Blitz', rapid: 'Rapid', daily: 'Täglich', classical: 'Klassisch' };

export const timeClassName = (g: GameRecord) => (g.timeClass ? tcName[g.timeClass] : g.source === 'app' ? 'App-Partie' : 'ohne Uhr');

/** Ergebnis-Abzeichen: Sieg grün, Niederlage rot, Remis grau */
export function ResultBadge({ result, children, className }: { result: 'win' | 'loss' | 'draw' | 'neutral'; children: React.ReactNode; className?: string }) {
  return (
    <Badge
      className={cn(
        'h-6 px-2.5 text-[13px] font-bold',
        result === 'win' && 'bg-win-bg text-win',
        result === 'loss' && 'bg-loss-bg text-loss',
        (result === 'draw' || result === 'neutral') && 'bg-draw-bg text-draw',
        className,
      )}
    >
      {children}
    </Badge>
  );
}

/** Eine Partie in Listen: Ergebnis-Abzeichen, Zeitklasse, Gegner mit Rating-Unterschied, Patzer, Analyse-Status */
export function GameRow({ game: g, analysis, analysing }: { game: GameRecord; analysis?: AnalysisRecord; analysing?: boolean }) {
  const opp = g.myColor ? (g.myColor === 'white' ? g.black : g.white) : null;
  const me = g.myColor ? g[g.myColor] : null;
  const name = opp ? (opp.isEngine && opp.detail ? `${opp.name} · ${opp.detail}` : opp.name) : `${g.white.name} – ${g.black.name}`;
  const diff = opp?.rating !== undefined && me?.rating !== undefined ? opp.rating - me.rating : null;
  // Patzer: meine; ohne eigene Farbe (Gegen Freund, „Keiner“) beide Seiten zusammen
  const blunders =
    analysis?.status === 'done'
      ? g.myColor
        ? analysis.summary?.[g.myColor].blunders ?? 0
        : (analysis.summary?.white.blunders ?? 0) + (analysis.summary?.black.blunders ?? 0)
      : null;
  const TcIcon = g.timeClass ? tcIcon[g.timeClass] : MonitorSmartphone;
  return (
    <a
      className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1.5 border-t px-4 py-3 text-inherit no-underline transition-colors first:border-t-0 hover:bg-muted/60 md:grid-cols-[104px_28px_1fr_auto]"
      href={href({ page: 'partie', id: g.id })}
      data-testid="game-row"
    >
      <ResultBadge result={g.myResult ?? 'neutral'} className="md:w-full">
        {g.myResult ? myResultText[g.myResult] : scoreText(g.result)}
      </ResultBadge>
      <span className="hidden text-muted-foreground md:grid md:place-items-center" title={timeClassName(g)}>
        <TcIcon className="size-[18px]" strokeWidth={1.8} />
      </span>
      <span className="row-span-2 flex min-w-0 flex-col md:row-span-1">
        <span className="flex min-w-0 items-center gap-2">
          {g.myColor && (
            <span
              className={cn('size-3.5 shrink-0 rounded-[4px] ring-1 ring-muted-foreground', g.myColor === 'white' ? 'bg-[#f7f5ef]' : 'bg-[#0e1012] ring-2')}
              aria-label={g.myColor === 'white' ? 'mit Weiß' : 'mit Schwarz'}
            />
          )}
          <span className="truncate font-bold">{name}</span>
          {opp?.rating !== undefined && <span className="text-muted-foreground tabular-nums">{opp.rating}</span>}
          {diff !== null && (
            <span className="rounded-md bg-muted px-1.5 text-xs font-medium whitespace-nowrap text-muted-foreground tabular-nums" data-testid="rating-diff">
              {diff === 0 ? 'gleich stark' : `${Math.abs(diff)} ${diff > 0 ? 'stärker' : 'schwächer'}`}
            </span>
          )}
        </span>
        <span className="text-sm text-muted-foreground tabular-nums">
          {formatDate(g.date)} · {timeClassName(g)}
          {g.timeControl && <> {formatTimeControl(g.timeControl)}</>}
          {me?.rating !== undefined && <> · ich {me.rating}</>}
        </span>
      </span>
      <span className="flex items-center gap-2 md:justify-end">
        {blunders !== null && blunders > 0 && (
          <Badge className="h-6 bg-blunder px-2 font-bold text-background" data-testid="blunder-badge">
            {blunders} Patzer
          </Badge>
        )}
        <AnalysisStatus status={analysis?.status === 'done' ? 'done' : analysis?.status === 'failed' ? 'failed' : analysing ? 'running' : 'open'} />
      </span>
    </a>
  );
}

const statusInfo = {
  done: { icon: CircleCheck, label: 'analysiert', className: 'text-win' },
  running: { icon: LoaderCircle, label: 'wird gerade analysiert', className: 'animate-spin text-primary' },
  failed: { icon: CircleAlert, label: 'konnte nicht analysiert werden', className: 'text-muted-foreground' },
  open: { icon: CircleDashed, label: 'noch nicht analysiert', className: 'text-muted-foreground/70' },
} as const;

/** Dezentes Symbol für den Analyse-Stand, Erklärung als Tooltip */
function AnalysisStatus({ status }: { status: keyof typeof statusInfo }) {
  const info = statusInfo[status];
  return (
    <Tooltip>
      <TooltipTrigger
        render={<span role="img" aria-label={info.label} data-testid={status === 'done' ? 'badge-done' : `status-${status}`} className="grid size-6 place-items-center" />}
      >
        <info.icon className={cn('size-[18px]', info.className)} strokeWidth={2} />
      </TooltipTrigger>
      <TooltipContent>{info.label}</TooltipContent>
    </Tooltip>
  );
}
