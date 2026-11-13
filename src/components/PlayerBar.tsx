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

/** Farbe eines Spielers als kleiner gefüllter Kreis (Weiß, Schwarz oder halb/halb für „Zufall“) – überall gleich */
export function ColorSwatch({ color, className }: { color: Color | 'random'; className?: string }) {
  return (
    <span
      aria-hidden
      data-color={color}
      className={cn(
        // Leicht gewölbt wie ein Spielstein, damit der Kreis eindeutig gefüllt wirkt (kein leeres Kästchen/Radio-Knopf)
        'color-dot inline-block size-3.5 shrink-0 rounded-full shadow-[inset_0_-1px_1px_rgba(0,0,0,0.35),0_0_0_1px_rgba(128,128,128,0.55)]',
        color === 'white' && 'bg-[radial-gradient(circle_at_35%_30%,#ffffff,#e4ddcc_70%)]',
        color === 'black' && 'bg-[radial-gradient(circle_at_35%_30%,#6b717b,#1a1d22_55%,#0b0c0e)]',
        color === 'random' && 'bg-[linear-gradient(90deg,#f4efe3_50%,#22252b_50%)]',
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
        {active && <span className="ml-2 text-[15px] font-normal text-muted-foreground">am Zug</span>}
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
