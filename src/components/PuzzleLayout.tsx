import type { ReactNode } from 'react';
import { CircleCheck, CircleX } from 'lucide-react';
import { Board } from './Board';
import { ColorSwatch } from './PlayerBar';
import { VariationCard } from './ErrorExplain';
import { toGermanSan } from '../chess/game';
import type { usePuzzleSolver } from '../training/usePuzzleSolver';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type Props = {
  solver: ReturnType<typeof usePuzzleSolver>;
  /** Rechts über dem Brett, z. B. „noch 3 heute“ oder das Puzzle-Rating */
  status: ReactNode;
  onExit: () => void;
  /** Überschrift und Beschreibung, solange das Puzzle läuft */
  task: ReactNode;
  /** Zusatz im Ergebnis-Kasten (z. B. nächste Wiederholung, Rating-Änderung) */
  result: ReactNode;
  /** Überschriften der Varianten-Karte */
  variationTitle?: string;
  variationSubtitle?: string;
  /** Karten nach dem Ende (Erklärung, Thema …) */
  children?: ReactNode;
  /** Knöpfe am Ende */
  actions: ReactNode;
  /** Kleingedrucktes unten (z. B. Lizenz) */
  footer?: ReactNode;
};

/** Gemeinsames Layout aller Puzzles: links das Brett, rechts Aufgabe, Ergebnis und Erklärung */
export function PuzzleLayout({ solver: s, status, onExit, task, result, variationTitle, variationSubtitle, children, actions, footer }: Props) {
  return (
    <div className={cn('play grid w-full animate-in grid-cols-1 items-start gap-3 fade-in-0 md:w-auto md:grid-cols-[var(--board-size)_380px] md:gap-7', s.variation && 'in-variation')}>
      <section className="flex flex-col gap-0.5 md:gap-1.5">
        <div className="flex h-(--bar-height) items-center gap-2 px-0.5 max-md:px-3.5">
          <ColorSwatch color={s.me} />
          <strong>{s.me === 'white' ? 'Weiß' : 'Schwarz'} am Zug</strong>
          <span className="ml-auto text-sm text-muted-foreground" data-testid="puzzle-status">
            {status}
          </span>
        </div>
        <div className="board-area relative">
          <Board config={s.config} onMove={s.onMove} />
          {s.variation && <Badge className="variation-badge pointer-events-none absolute top-2.5 right-2.5 z-10 bg-brass text-brass-foreground">Variante</Badge>}
        </div>
      </section>

      <aside className="flex flex-col gap-3.5 max-md:px-3.5 md:pt-[calc(var(--bar-height)+6px)]">
        <Button variant="ghost" size="sm" className="self-start text-muted-foreground max-md:order-last" onClick={onExit}>
          ← Training
        </Button>
        {!s.finished && (
          <section className="flex flex-col gap-2 max-md:order-first" data-testid="puzzle-task">
            {task}
            {s.phase === 'intro' && (
              <p className="rounded-lg bg-primary/12 px-3 py-2.5 font-semibold" role="status" data-testid="puzzle-message">
                Der Gegner zieht …
              </p>
            )}
            {s.message && (
              <p
                className={cn(
                  'rounded-lg px-3 py-2.5 font-semibold',
                  s.tries > 0 && s.phase !== 'checking' && !s.message.startsWith('Richtig') ? 'bg-loss-bg text-loss' : 'bg-primary/12',
                )}
                role="status"
                data-testid="puzzle-message"
              >
                {s.message}
              </p>
            )}
          </section>
        )}

        {s.finished && (
          <Alert className={cn('max-md:order-first', s.phase === 'solved' ? 'border-win/40 bg-win-bg' : 'border-loss/40 bg-loss-bg')} role="status" data-testid="puzzle-result">
            {s.phase === 'solved' ? <CircleCheck className="text-win" /> : <CircleX className="text-loss" />}
            <AlertTitle className={cn('text-base', s.phase === 'solved' ? 'text-win' : 'text-loss')}>
              {s.phase === 'solved'
                ? s.tries === 0
                  ? 'Richtig gelöst!'
                  : 'Richtig – im zweiten Versuch.'
                : `Nicht gelöst. Besser war ${s.bestSan ? toGermanSan(s.bestSan) : '…'}.`}
            </AlertTitle>
            <AlertDescription className="text-foreground">
              {s.alt && s.bestSan && s.alt !== toGermanSan(s.bestSan) && (
                <span>
                  Auch gut: {s.alt} ist fast so stark wie {toGermanSan(s.bestSan)}.
                </span>
              )}
              {result}
            </AlertDescription>
          </Alert>
        )}

        {s.finished && !s.variation && children}
        {s.finished && s.variation && (
          <VariationCard
            fen={s.variation.moves[0]?.before ?? ''}
            moves={s.variation.moves}
            step={s.variation.step}
            onStep={s.stepVariation}
            onClose={s.closeVariation}
            title={variationTitle}
            subtitle={variationSubtitle}
            closeLabel="Zurück zum Puzzle"
          />
        )}

        {s.finished && <div className="grid grid-cols-2 gap-2">{actions}</div>}
        {footer && <p className="text-xs text-muted-foreground max-md:order-last">{footer}</p>}
      </aside>
    </div>
  );
}
