import { Check, Clock, MonitorSmartphone, Rocket, Sun, Zap, type LucideIcon } from 'lucide-react';
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
            <span
              className={cn('rounded-md bg-muted px-1.5 text-[12.5px] font-bold tabular-nums', diff > 0 ? 'text-loss' : diff < 0 ? 'text-win' : 'text-muted-foreground')}
              title={`Gegner ${Math.abs(diff)} Punkte ${diff >= 0 ? 'stärker' : 'schwächer'}`}
            >
              {diff > 0 ? '+' : diff < 0 ? '−' : '±'}
              {Math.abs(diff)}
            </span>
          )}
        </span>
        <span className="text-sm text-muted-foreground tabular-nums">
          {formatDate(g.date)} · {timeClassName(g)}
          {g.timeControl && <> {formatTimeControl(g.timeControl)}</>}
          {me?.rating !== undefined && <> · ich {me.rating}</>}
        </span>
      </span>
      <span className="flex md:justify-end">
        {blunders !== null ? (
          <Badge variant="outline" className={cn('h-6 font-bold', blunders ? 'border-blunder/40 text-blunder' : 'border-win/40 text-win')} data-testid="badge-done">
            <Check data-icon="inline-start" />
            {blunders ? `${blunders} Patzer` : 'analysiert'}
          </Badge>
        ) : analysis?.status === 'failed' ? (
          <Badge variant="outline" className="h-6 border-dashed text-muted-foreground">
            nicht lesbar
          </Badge>
        ) : analysing ? (
          <Badge variant="outline" className="h-6 border-dashed border-primary text-primary">
            wird analysiert
          </Badge>
        ) : (
          <Badge variant="outline" className="h-6 border-dashed text-muted-foreground">
            offen
          </Badge>
        )}
      </span>
    </a>
  );
}
