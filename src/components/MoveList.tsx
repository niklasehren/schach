import { useEffect, useRef } from 'react';
import { toGermanSan } from '../chess/game';
import type { MoveClass } from '../db/schema';

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

  const rows: number[] = [];
  for (let i = 0; i < moves.length; i += 2) rows.push(i);

  const cell = (index: number) => {
    const ply = index + 1;
    if (index >= moves.length) return <span />;
    const isCurrent = ply === currentPly;
    const mark = marks?.[ply];
    return (
      <button
        className={`movelist-move ${isCurrent ? 'is-current' : ''} ${mark ? `mark-${mark}` : ''}`}
        ref={isCurrent ? active : undefined}
        aria-current={isCurrent ? 'step' : undefined}
        title={mark ? markText[mark].label : undefined}
        data-mark={mark}
        onClick={() => onSelect(ply)}
      >
        {toGermanSan(moves[index])}
        {mark && (
          <span className="movelist-mark" aria-label={markText[mark].label}>
            {markText[mark].sym}
          </span>
        )}
      </button>
    );
  };

  return (
    <div className="movelist" data-testid="movelist" ref={list}>
      {rows.length === 0 && <p className="movelist-empty">Noch keine Züge</p>}
      {rows.map((i) => (
        <div className="movelist-row" key={i}>
          <span className="movelist-num">{i / 2 + 1}.</span>
          {cell(i)}
          {cell(i + 1)}
        </div>
      ))}
    </div>
  );
}
