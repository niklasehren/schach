import type { Color } from '@lichess-org/chessground/types';
import type { PromotionPiece } from '../chess/game';

const choices: { piece: PromotionPiece; role: string; label: string }[] = [
  { piece: 'q', role: 'queen', label: 'Dame' },
  { piece: 'r', role: 'rook', label: 'Turm' },
  { piece: 'b', role: 'bishop', label: 'Läufer' },
  { piece: 'n', role: 'knight', label: 'Springer' },
];

type Props = {
  color: Color;
  onChoose: (piece: PromotionPiece) => void;
  onCancel: () => void;
};

/** Auswahl der Figur bei der Bauernumwandlung, liegt über dem Brett. */
export function PromotionDialog({ color, onChoose, onCancel }: Props) {
  return (
    <div className="promotion" role="dialog" aria-label="Umwandlung wählen" onClick={onCancel}>
      <div className="promotion-panel cg-wrap" onClick={(e) => e.stopPropagation()}>
        <p className="promotion-title">Umwandeln in</p>
        <div className="promotion-choices">
          {choices.map((c) => (
            <button key={c.piece} className="promotion-choice" aria-label={c.label} onClick={() => onChoose(c.piece)}>
              <piece className={`${c.role} ${color}`} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// <piece> ist ein eigenes HTML-Element von chessground (für die Figurenbilder)
declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      piece: React.HTMLAttributes<HTMLElement>;
    }
  }
}
