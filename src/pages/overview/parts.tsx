import { ArrowDown, ArrowUp, Minus } from 'lucide-react';
import type { AnalysisRecord, GameRecord } from '../../db/schema';
import { formatDate } from '../../chess/format';
import { href } from '../../app/router';
import { MiniBoard } from '../../components/MiniBoard';
import { cn } from '@/lib/utils';
import type { Trend } from '../../stats/coach';
import { finalPosition } from './useOverview';

export const opponentOf = (g: GameRecord) => {
  const opp = g.myColor ? (g.myColor === 'white' ? g.black : g.white) : null;
  return opp ? (opp.isEngine && opp.detail ? `${opp.name} (${opp.detail})` : opp.name) : `${g.white.name} – ${g.black.name}`;
};

export const resultWord = { win: 'Sieg', loss: 'Niederlage', draw: 'Remis' } as const;
export const resultColor = (r: GameRecord['myResult']) => (r === 'win' ? 'bg-win' : r === 'loss' ? 'bg-loss' : 'bg-draw');

/** Meine Patzer und Fehler einer analysierten Partie (ohne eigene Farbe: beide Seiten); null = noch nicht analysiert */
export function myErrors(g: GameRecord, a?: AnalysisRecord): { blunders: number; mistakes: number } | null {
  if (a?.status !== 'done' || !a.summary) return null;
  const sides = g.myColor ? [a.summary[g.myColor]] : [a.summary.white, a.summary.black];
  return { blunders: sides.reduce((s, x) => s + x.blunders, 0), mistakes: sides.reduce((s, x) => s + x.mistakes, 0) };
}

/** „2 Patzer“, „ohne Patzer“ (nur kleinere Fehler) oder „fehlerfrei“ (weder Patzer noch Fehler) */
export function errorsText(e: { blunders: number; mistakes: number } | null): string | null {
  if (!e) return null;
  if (e.blunders) return `${e.blunders} Patzer`;
  return e.mistakes ? 'ohne Patzer' : 'fehlerfrei';
}

export const shortDate = (ms: number) => formatDate(ms).slice(0, 6);

/** Kleines Brett der Endstellung (oder ein ruhiger Platzhalter bei Brettpartien ohne Züge) */
export function EndBoard({ game, className }: { game: GameRecord; className?: string }) {
  const pos = finalPosition(game);
  if (!pos) return <div className={cn('grid aspect-square place-items-center rounded-md bg-muted text-xs text-muted-foreground', className)}>ohne Züge</div>;
  return <MiniBoard fen={pos.fen} lastMove={pos.lastMove} orientation={game.myColor ?? 'white'} className={cn('rounded-md', className)} label={`Endstellung gegen ${opponentOf(game)}`} />;
}

export const gameHref = (g: GameRecord) => (g.source === 'brett' && g.plies === 0 ? href({ page: 'brett', id: g.id }) : href({ page: 'partie', id: g.id }));

const trendText: Record<Exclude<Trend, null>, string> = { up: 'häufiger', down: 'seltener', same: 'wie vorher' };

export function TrendMark({ trend }: { trend: Trend }) {
  if (!trend) return null;
  const Icon = trend === 'up' ? ArrowUp : trend === 'down' ? ArrowDown : Minus;
  return (
    <span className="inline-flex items-center gap-1 text-sm whitespace-nowrap text-muted-foreground" data-testid="error-trend" title={trend === 'same' ? 'etwa so oft wie vorher (pro Partie)' : `${trendText[trend]} als vorher (pro Partie)`}>
      <Icon className="size-3.5" strokeWidth={2.2} />
      {trendText[trend]}
    </span>
  );
}
