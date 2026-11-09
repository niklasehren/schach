import type { PieceSymbol } from 'chess.js';
import type { Color } from '@lichess-org/chessground/types';
import type { Player } from '../chess/session';

const roles: Record<PieceSymbol, string> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };

type Props = {
  player: Player;
  color: Color;
  /** Von diesem Spieler geschlagene Figuren (also in der Gegenfarbe) */
  captured: PieceSymbol[];
  advantage: number;
  active: boolean;
  thinking?: boolean;
};

/** Zeile über bzw. unter dem Brett: Name, geschlagene Figuren, Materialvorsprung */
export function PlayerBar({ player, color, captured, advantage, active, thinking }: Props) {
  const opponent: Color = color === 'white' ? 'black' : 'white';
  return (
    <div className={`player ${active ? 'is-active' : ''}`} data-testid={`player-${color}`}>
      <span className={`color-swatch swatch-${color}`} aria-hidden />
      <span className="player-name">{player.name}</span>
      {player.detail && <span className="player-detail">{player.detail}</span>}
      {thinking && <span className="player-thinking" aria-label="denkt nach" />}
      <span className="player-material cg-wrap" aria-label={`Geschlagen: ${captured.length} Figuren`}>
        {captured.map((p, i) => (
          <piece key={i} className={`${roles[p]} ${opponent} ${captured[i + 1] === p ? 'stacked' : ''}`} />
        ))}
        {advantage > 0 && <span className="player-advantage">+{advantage}</span>}
      </span>
    </div>
  );
}
