import type { CSSProperties } from 'react';
import type { Color } from '@lichess-org/chessground/types';
import { cn } from '@/lib/utils';

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
  const flipped = orientation === 'black';
  return (
    <div
      className="relative shrink-0 overflow-hidden bg-[#2a2a28] ring-1 ring-foreground/25 max-md:h-5 max-md:w-full md:w-(--evalbar) md:rounded-md"
      data-testid="evalbar"
      style={{ '--pct': pct } as CSSProperties}
      role="img"
      aria-label={label ? `Bewertung ${label}` : 'Bewertung unbekannt'}
    >
      <div
        className={cn(
          'absolute bg-[#fbf7ee] transition-all duration-300 max-md:inset-y-0 max-md:left-0 max-md:w-[calc(var(--pct)*1%)] md:inset-x-0 md:h-[calc(var(--pct)*1%)]',
          flipped ? 'md:top-0' : 'md:bottom-0',
        )}
      />
      <div className="absolute bg-red-500/60 max-md:inset-y-0 max-md:left-1/2 max-md:w-0.5 md:inset-x-0 md:top-1/2 md:-mt-px md:h-0.5" />
      {label && (
        <span
          className={cn(
            'absolute text-[11px] font-extrabold tracking-tight tabular-nums max-md:top-0.5 md:inset-x-0 md:text-center',
            whiteAhead ? 'text-[#1c1f1b] max-md:left-2' : 'text-[#fbf7ee] max-md:right-2',
            whiteAhead === !flipped ? 'md:bottom-1' : 'md:top-1',
          )}
        >
          {label}
        </span>
      )}
    </div>
  );
}
