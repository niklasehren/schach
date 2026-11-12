import type { PieceSymbol } from 'chess.js';
import type { Color } from '@lichess-org/chessground/types';
import type { Player } from '../chess/session';
import { cn } from '@/lib/utils';
import { Piece } from './Piece';

const roles: Record<PieceSymbol, string> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };

type Props = {
  player: Player;
  color: Color;
  /** Von diesem Spieler geschlagene Figuren (also in der Gegenfarbe) */
  captured: PieceSymbol[];
  advantage: number;
  active: boolean;
  thinking?: boolean;
  /** Restzeit, z. B. „9:58“ (beim Ansehen von Chess.com-Partien) */
  clock?: string;
};

export function ColorSwatch({ color, className }: { color: Color | 'random'; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'size-3.5 shrink-0 rounded-[4px]',
        color === 'white' && 'bg-[#f7f5ef] ring-1 ring-muted-foreground',
        color === 'black' && 'bg-[#0e1012] ring-2 ring-muted-foreground',
        color === 'random' && 'bg-[linear-gradient(135deg,#f7f5ef_50%,#0e1012_50%)] ring-1 ring-muted-foreground',
        className,
      )}
    />
  );
}

/** Zeile über bzw. unter dem Brett: Name, geschlagene Figuren, Materialvorsprung, Uhr */
export function PlayerBar({ player, color, captured, advantage, active, thinking, clock }: Props) {
  const opponent: Color = color === 'white' ? 'black' : 'white';
  return (
    <div className="player flex h-(--bar-height) min-w-0 items-center gap-2 px-0.5" data-testid={`player-${color}`}>
      <ColorSwatch color={color} />
      <span className="truncate font-bold">
        {player.name}
        {active && <span className="ml-2 inline-block size-2 rounded-full bg-brass align-middle" aria-label="am Zug" />}
      </span>
      {player.detail && <span className="text-[15px] whitespace-nowrap text-muted-foreground">{player.detail}</span>}
      {thinking && <span className="size-3.5 animate-spin rounded-full border-2 border-border border-t-primary" aria-label="denkt nach" />}
      <span className="player-material cg-wrap ml-auto flex min-w-0 items-center" aria-label={`Geschlagen: ${captured.length} Figuren`}>
        {captured.map((p, i) => (
          <Piece key={i} className={`${roles[p]} ${opponent} ${captured[i + 1] === p ? 'stacked' : ''}`} />
        ))}
        {advantage > 0 && <span className="ml-1.5 text-sm font-bold text-muted-foreground">+{advantage}</span>}
      </span>
      {clock && (
        <span className="ml-2.5 shrink-0 rounded-md border bg-card px-2.5 py-0.5 font-bold tabular-nums" data-testid={`clock-${color}`}>
          {clock}
        </span>
      )}
    </div>
  );
}
