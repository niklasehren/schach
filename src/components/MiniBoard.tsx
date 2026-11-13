import { useEffect, useRef } from 'react';
import { Chessground } from '@lichess-org/chessground';
import type { Api } from '@lichess-org/chessground/api';
import type { Key } from '@lichess-org/chessground/types';
import { cn } from '@/lib/utils';

type Props = {
  fen: string;
  orientation?: 'white' | 'black';
  lastMove?: [string, string];
  /** Koordinaten nur bei großen Brettern */
  coordinates?: boolean;
  className?: string;
  label?: string;
};

/** Brett nur zum Anschauen (chessground, ohne Ziehen): Puzzle-Vorschau und Endstellungen in Listen */
export function MiniBoard({ fen, orientation = 'white', lastMove, coordinates = false, className, label }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const api = useRef<Api | null>(null);

  useEffect(() => {
    if (!el.current) return;
    api.current = Chessground(el.current, { viewOnly: true, coordinates, animation: { enabled: false }, drawable: { enabled: false, visible: false } });
    return () => api.current?.destroy();
  }, [coordinates]);

  useEffect(() => {
    api.current?.set({ fen, orientation, lastMove: lastMove as Key[] | undefined });
  }, [fen, orientation, lastMove?.[0], lastMove?.[1]]);

  return (
    <div className={cn('mini-board aspect-square overflow-hidden', className)} role="img" aria-label={label}>
      <div ref={el} className="board h-full w-full" />
    </div>
  );
}
