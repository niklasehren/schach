import { useEffect, useRef } from 'react';
import { toGermanSan } from '../chess/game';
import type { MoveClass } from '../db/schema';
import { cn } from '@/lib/utils';

const markText: Record<MoveClass, { sym: string; label: string }> = {
  blunder: { sym: '??', label: 'Patzer' },
  mistake: { sym: '?', label: 'Fehler' },
  inaccuracy: { sym: '?!', label: 'Ungenauigkeit' },
};

type Props = {
  moves: string[];
  /** Angezeigter Halbzug: 0 = Startstellung, moves.length = aktuelle Stellung */
  currentPly: number;
  onSelect: (ply: number) => void;
  /** Markierte Züge (Halbzug → Klasse), z. B. meine Fehler aus der Analyse */
  marks?: Record<number, MoveClass>;
};

/** Zugliste in Paaren: 1. e4 e5  2. Sf3 Sc6 … – anklickbar zum Zurückblättern */
export function MoveList({ moves, currentPly, onSelect, marks }: Props) {
  const active = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  // Nur die Liste selbst scrollen, nicht die ganze Seite (sonst rutscht am Handy das Brett weg)
  useEffect(() => {
    const box = list.current;
    if (!box) return;
    const item = active.current;
    if (!item) {
      box.scrollTop = 0;
      return;
    }
    const top = item.offsetTop; // .movelist ist position: relative
    if (top < box.scrollTop) box.scrollTop = top - 6;
    else if (top + item.offsetHeight > box.scrollTop + box.clientHeight) box.scrollTop = top + item.offsetHeight - box.clientHeight + 6;
  }, [currentPly, moves.length]);


  const cell = (index: number) => {
    const ply = index + 1;
    if (index >= moves.length) return <span />;
    const isCurrent = ply === currentPly;
    const mark = marks?.[ply];
    return (
      <button
        className={cn(
          'movelist-move -ml-2 justify-self-start rounded-md px-2 py-0.5 text-left transition-colors hover:bg-muted',
          mark === 'blunder' && 'mark-blunder font-bold text-blunder',
          mark === 'mistake' && 'mark-mistake font-bold text-mistake',
          mark === 'inaccuracy' && 'mark-inaccuracy text-inaccuracy',
          isCurrent && 'is-current bg-primary text-primary-foreground hover:bg-primary',
          isCurrent && mark === 'blunder' && 'bg-blunder text-background hover:bg-blunder',
          isCurrent && mark === 'mistake' && 'bg-mistake text-background hover:bg-mistake',
          isCurrent && mark === 'inaccuracy' && 'bg-inaccuracy text-background hover:bg-inaccuracy',
        )}
        ref={isCurrent ? active : undefined}
        aria-current={isCurrent ? 'step' : undefined}
        title={mark ? markText[mark].label : undefined}
        data-mark={mark}
        onClick={() => onSelect(ply)}
      >
        {toGermanSan(moves[index])}
        {mark && (
          <span className="ml-0.5 font-extrabold" aria-label={markText[mark].label}>
            {markText[mark].sym}
          </span>
        )}
      </button>
    );
  };

  const rows: number[] = [];
  for (let i = 0; i < moves.length; i += 2) rows.push(i);

  return (
    <div className="movelist relative min-h-0 flex-1 overflow-y-auto rounded-lg border bg-card py-1.5 tabular-nums" data-testid="movelist" ref={list}>
      {rows.length === 0 && <p className="movelist-empty mx-3.5 my-2 text-muted-foreground">Noch keine Züge</p>}
      {rows.map((i) => (
        <div className="movelist-row grid grid-cols-[42px_1fr_1fr] items-center py-0.5 pr-2.5 pl-3.5 text-[15.5px] even:bg-muted/40" key={i}>
          <span className="text-muted-foreground">{i / 2 + 1}.</span>
          {cell(i)}
          {cell(i + 1)}
        </div>
      ))}
    </div>
  );
}
