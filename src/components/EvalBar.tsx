import type { Color } from '@lichess-org/chessground/types';

type Props = {
  /** Gewinnchance für Weiß in Prozent (0–100) */
  white: number | null;
  /** Bewertung als Text, z. B. „+0,9“ oder „#3“ */
  label: string | null;
  orientation: Color;
};

/** Senkrechter Bewertungsbalken neben dem Brett: Weiß-Anteil wächst von der weißen Seite her */
export function EvalBar({ white, label, orientation }: Props) {
  const pct = white === null ? 50 : Math.max(2, Math.min(98, white));
  const whiteAtBottom = orientation === 'white';
  return (
    <div className="evalbar" data-testid="evalbar" aria-label={label ? `Bewertung ${label}` : 'Bewertung unbekannt'} role="img">
      <div className="evalbar-white" style={{ height: `${pct}%`, [whiteAtBottom ? 'bottom' : 'top']: 0 }} />
      <div className="evalbar-mid" />
    </div>
  );
}
