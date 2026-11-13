import { CircleAlert, CircleDashed, LoaderCircle } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { AnalysisRecord, GameRecord } from '../db/schema';
import { formatDate, formatTimeControl, myResultText, scoreText } from '../chess/format';
import { hasMoves, OCCASION_LABELS } from '../db/boardGames';
import { EndBoard, errorsText, gameHref, myErrors, opponentOf, resultColor } from './GameBits';
import { cn } from '@/lib/utils';
import { ColorSwatch } from './PlayerBar';

const tcName: Record<string, string> = { bullet: 'Bullet', blitz: 'Blitz', rapid: 'Rapid', daily: 'Täglich', classical: 'Klassisch' };

export const timeClassName = (g: GameRecord) =>
  g.timeClass ? tcName[g.timeClass] : g.source === 'app' ? 'App-Partie' : g.board ? OCCASION_LABELS[g.board.occasion] : 'ohne Uhr';

/** Ergebnis dezent: kleiner Farbpunkt und Wort (Sieg grün, Niederlage rot, Remis grau) */
export function ResultMark({ result, children, className }: { result: GameRecord['myResult']; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <span className={cn('size-2 shrink-0 rounded-full', resultColor(result))} aria-hidden />
      {children}
    </span>
  );
}

/** Eine Partie in der Liste: kleines Brett der Endstellung, Gegner, Ergebnis und Patzer als ruhiger Text */
export function GameRow({ game: g, analysis, analysing }: { game: GameRecord; analysis?: AnalysisRecord; analysing?: boolean }) {
  const opp = g.myColor ? (g.myColor === 'white' ? g.black : g.white) : null;
  const me = g.myColor ? g[g.myColor] : null;
  const diff = opp?.rating !== undefined && me?.rating !== undefined ? opp.rating - me.rating : null;
  const errs = errorsText(myErrors(g, analysis));
  const moves = g.source !== 'brett' || hasMoves(g);
  const meta = [formatDate(g.date).slice(0, 6), [timeClassName(g), g.timeControl ? formatTimeControl(g.timeControl) : ''].filter(Boolean).join(' '), me?.rating !== undefined ? `ich ${me.rating}` : '']
    .filter(Boolean)
    .join(', ');
  return (
    <a
      className="grid grid-cols-[52px_1fr_auto] items-center gap-x-4 border-t py-3 text-inherit no-underline transition-colors first:border-t-0 hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none md:grid-cols-[64px_1fr_auto]"
      href={gameHref(g)}
      data-testid="game-row"
    >
      <EndBoard game={g} className="w-full" />
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="flex min-w-0 items-baseline gap-2">
          {g.myColor && (
            <span className="self-center" role="img" aria-label={g.myColor === 'white' ? 'mit Weiß' : 'mit Schwarz'} title={g.myColor === 'white' ? 'Ich spielte Weiß' : 'Ich spielte Schwarz'}>
              <ColorSwatch color={g.myColor} className="block" />
            </span>
          )}
          <span className="truncate font-semibold">{opponentOf(g)}</span>
          {opp?.rating !== undefined && (
            <span className="shrink-0 text-[15px] whitespace-nowrap text-muted-foreground tabular-nums">
              {opp.rating}
              {diff !== null && (
                <span data-testid="rating-diff">, {diff === 0 ? 'gleich stark' : `${Math.abs(diff)} ${diff > 0 ? 'stärker' : 'schwächer'}`}</span>
              )}
            </span>
          )}
        </span>
        <span className="flex min-w-0 items-center gap-2 text-[15px] text-muted-foreground tabular-nums">
          <span className={cn('size-2 shrink-0 rounded-full', resultColor(g.myResult))} aria-hidden />
          <span className="truncate">
            {g.myResult ? myResultText[g.myResult] : scoreText(g.result)}, {meta}
            {g.source === 'brett' && (
              <>
                ,{' '}
                <span className="text-brass-text" data-testid="board-badge">
                  Brett
                </span>
              </>
            )}
          </span>
        </span>
      </span>
      <span className="flex items-center gap-2 text-[15px] whitespace-nowrap text-muted-foreground tabular-nums">
        {errs && <span data-testid="game-errors">{errs}</span>}
        {moves && !errs && <AnalysisStatus status={analysis?.status === 'failed' ? 'failed' : analysing ? 'running' : 'open'} />}
      </span>
    </a>
  );
}

const statusInfo = {
  running: { icon: LoaderCircle, label: 'wird gerade analysiert', className: 'animate-spin text-brass-text' },
  failed: { icon: CircleAlert, label: 'konnte nicht analysiert werden', className: 'text-muted-foreground' },
  open: { icon: CircleDashed, label: 'noch nicht analysiert', className: 'text-muted-foreground' },
} as const;

/** Nur solange eine Partie noch nicht fertig analysiert ist: dezentes Symbol, Erklärung als Tooltip */
function AnalysisStatus({ status }: { status: keyof typeof statusInfo }) {
  const info = statusInfo[status];
  return (
    <Tooltip>
      <TooltipTrigger render={<span role="img" aria-label={info.label} data-testid={`status-${status}`} className="grid size-6 place-items-center" />}>
        <info.icon className={cn('size-[18px]', info.className)} strokeWidth={2} />
      </TooltipTrigger>
      <TooltipContent>{info.label}</TooltipContent>
    </Tooltip>
  );
}
