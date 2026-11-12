import type { CSSProperties } from 'react';
import type { Color } from '@lichess-org/chessground/types';

type Props = {
  /** Gewinnchance für Weiß in Prozent (0–100) */
  white: number | null;
  /** Bewertung als Text, z. B. „+0,9“ oder „#3“ */
  label: string | null;
  orientation: Color;
};

/**
 * Bewertungsbalken: am Mac senkrecht neben dem Brett (Weiß wächst von der weißen Seite her),
 * am Handy waagerecht über dem Brett. Die Zahl steht auf der Seite, die vorn liegt.
 */
export function EvalBar({ white, label, orientation }: Props) {
  const pct = white === null ? 50 : Math.max(3, Math.min(97, white));
  const whiteAhead = (white ?? 50) >= 50;
  return (
    <div
      className={`evalbar ${orientation === 'black' ? 'is-flipped' : ''}`}
      data-testid="evalbar"
      style={{ '--pct': pct } as CSSProperties}
      role="img"
      aria-label={label ? `Bewertung ${label}` : 'Bewertung unbekannt'}
    >
      <div className="evalbar-white" />
      <div className="evalbar-mid" />
      {label && <span className={`evalbar-label ${whiteAhead ? 'on-white' : 'on-black'}`}>{label}</span>}
    </div>
  );
}
