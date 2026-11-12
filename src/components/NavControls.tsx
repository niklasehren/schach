import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type Props = {
  ply: number;
  last: number;
  onGo: (ply: number) => void;
  className?: string;
};

/** Vier Knöpfe zum Durchblättern: Anfang, zurück, vor, Ende */
export function NavControls({ ply, last, onGo, className }: Props) {
  const atEnd = ply >= last;
  const btn = 'h-12 w-full';
  return (
    <div className={cn('grid grid-cols-4 gap-1.5', className)} aria-label="Züge durchblättern">
      <Button variant="outline" size="icon-lg" className={btn} aria-label="Zum Anfang" onClick={() => onGo(0)} disabled={ply === 0}>
        <ChevronsLeft className="size-5" />
      </Button>
      <Button variant="outline" size="icon-lg" className={btn} aria-label="Zug zurück" onClick={() => onGo(ply - 1)} disabled={ply === 0}>
        <ChevronLeft className="size-5" />
      </Button>
      <Button variant="outline" size="icon-lg" className={btn} aria-label="Zug vor" onClick={() => onGo(ply + 1)} disabled={atEnd}>
        <ChevronRight className="size-5" />
      </Button>
      <Button variant="outline" size="icon-lg" className={btn} aria-label="Zur aktuellen Stellung" onClick={() => onGo(last)} disabled={atEnd}>
        <ChevronsRight className="size-5" />
      </Button>
    </div>
  );
}
