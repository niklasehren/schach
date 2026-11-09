import { useEffect, useRef } from 'react';
import { toGermanSan } from '../chess/game';

type Props = { moves: string[] };

/** Zugliste in Paaren: 1. e4 e5  2. Sf3 Sc6 … */
export function MoveList({ moves }: Props) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'nearest' });
  }, [moves.length]);

  const rows: [string, string | undefined][] = [];
  for (let i = 0; i < moves.length; i += 2) rows.push([moves[i], moves[i + 1]]);

  return (
    <div className="movelist" data-testid="movelist">
      {rows.length === 0 && <p className="movelist-empty">Noch keine Züge</p>}
      {rows.map(([white, black], i) => (
        <div className="movelist-row" key={i}>
          <span className="movelist-num">{i + 1}.</span>
          <span className="movelist-move">{toGermanSan(white)}</span>
          <span className="movelist-move">{black ? toGermanSan(black) : ''}</span>
        </div>
      ))}
      <div ref={end} />
    </div>
  );
}
