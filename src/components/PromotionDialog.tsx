import type { Color } from '@lichess-org/chessground/types';
import type { PromotionPiece } from '../chess/game';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Piece } from './Piece';

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

/** Auswahl der Figur bei der Bauernumwandlung (shadcn-Dialog) */
export function PromotionDialog({ color, onChoose, onCancel }: Props) {
  return (
    <Dialog open onOpenChange={(open: boolean) => !open && onCancel()}>
      <DialogContent className="w-auto max-w-[calc(100vw-2rem)] sm:max-w-md" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Umwandlung wählen</DialogTitle>
          <DialogDescription>In welche Figur soll sich der Bauer verwandeln?</DialogDescription>
        </DialogHeader>
        <div className="cg-wrap grid grid-cols-4 gap-2">
          {choices.map((c) => (
            <button
              key={c.piece}
              className="relative aspect-square w-16 rounded-lg border bg-[var(--sq-light)] transition-colors hover:border-ring sm:w-20"
              aria-label={c.label}
              onClick={() => onChoose(c.piece)}
            >
              <Piece className={`${c.role} ${color} absolute! inset-[8%] h-auto! w-auto!`} />
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
