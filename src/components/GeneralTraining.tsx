import { useCallback, useEffect, useRef, useState } from 'react';
import { Lightbulb } from 'lucide-react';
import { useLive } from '../db/useLive';
import { href } from '../app/router';
import { movedPhrase, uciMove } from '../chess/moveWords';
import { logAttempt } from '../training/store';
import { getPuzzleRating, lichessAttemptId, nextLichessPuzzle, recordLichessResult, weightsFromAnalyses, type GeneralMode } from '../training/general';
import type { LichessPuzzle } from '../training/lichess';
import { THEMES, themeOf, type ThemeKey } from '../training/themes';
import { usePuzzleSolver } from '../training/usePuzzleSolver';
import { MoveNote, MoveNotes, PuzzleLayout, PuzzleMeta, PuzzleTitle } from './PuzzleLayout';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const exitToHub = () => (window.location.hash = href({ page: 'training' }));

export const LICHESS_NOTE = 'Puzzles: Lichess, CC0';

/** Die drei Themen mit dem größten Gewicht aus meinen Fehlern (null, wenn alle gleich) */
export function useFocusThemes(): string[] | null | undefined {
  const weights = useLive(() => weightsFromAnalyses(), []);
  if (!weights) return undefined;
  const values = [...weights.values()];
  if (Math.max(...values) - Math.min(...values) < 1e-9) return null;
  return [...weights.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k]) => themeOf(k)!.label);
}

/** Karte auf der Trainingsseite: Puzzle-Rating, Auswahl und Start */
export function GeneralCard() {
  const rating = useLive(() => getPuzzleRating(), []);
  const focus = useFocusThemes();
  const [choice, setChoice] = useState<'weak' | 'theme'>('weak');
  return (
    <section className="mt-12 flex flex-col gap-5 border-t pt-8" data-testid="general-card">
      <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-2">
        <div className="flex flex-col gap-1">
          <h2 className="font-heading text-[28px] leading-tight font-normal">Allgemeines Training</h2>
          <p className="text-[15px] text-muted-foreground">Taktik-Puzzles aus der Lichess-Datenbank, passend zu deinem Niveau.</p>
        </div>
        <span className="flex items-baseline gap-2.5">
          <span className="font-heading text-[56px] leading-[0.85] tabular-nums" data-testid="puzzle-rating">
            {rating?.rating ?? '…'}
          </span>
          <span className="text-[15px] text-muted-foreground">Puzzle-Rating</span>
        </span>
      </header>
      <div role="group" aria-label="Auswahl der Puzzles" className="flex flex-wrap gap-1">
        {(
          [
            ['weak', 'Passend zu meinen Schwächen'],
            ['theme', 'Thema wählen'],
          ] as const
        ).map(([v, label]) => (
          <button
            key={v}
            type="button"
            aria-pressed={choice === v}
            onClick={() => setChoice(v)}
            className={cn(
              'rounded-md px-2.5 py-1 text-[15px] text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
              choice === v && 'bg-muted font-semibold text-foreground',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {choice === 'weak' ? (
        <div className="flex flex-col gap-4">
          <p className="max-w-[62ch] text-[17px] leading-relaxed" data-testid="focus-themes">
            {focus === undefined
              ? '…'
              : focus === null
                ? 'Noch keine Fehler mit klarer Taktik analysiert – alle Themen kommen gleich oft dran.'
                : `Schwerpunkte aus deinen Fehlern: ${focus.join(', ')}. Andere Themen kommen seltener dran.`}
          </p>
          <a
            className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), 'h-12 self-start px-5 text-base font-semibold text-foreground no-underline')}
            href={href({ page: 'training', mode: 'allgemein', theme: 'schwaechen' })}
            data-testid="start-general"
          >
            Allgemeines Training starten
          </a>
        </div>
      ) : (
        <ul className="grid list-none grid-cols-2 gap-x-8 p-0 sm:grid-cols-3" aria-label="Themen">
          {THEMES.map((t) => (
            <li key={t.key} className="border-t">
              <a className="block py-2.5 text-foreground no-underline hover:text-brass-text" href={href({ page: 'training', mode: 'allgemein', theme: t.key })} data-testid={`theme-${t.key}`}>
                {t.label}
              </a>
            </li>
          ))}
        </ul>
      )}
      <p className="max-w-[70ch] text-sm text-muted-foreground">
        {rating && rating.played === 0 ? 'Startwert aus deiner Chess.com-Wertung. ' : ''}Das Rating passt sich nach jedem Puzzle an: im ersten Versuch gelöst zählt voll, im
        zweiten halb. {LICHESS_NOTE}.
      </p>
    </section>
  );
}

/** Endlose Folge von Lichess-Puzzles zu einem Thema oder passend zu meinen Schwächen */
export function GeneralSession({ theme }: { theme?: string }) {
  const mode: GeneralMode = theme && themeOf(theme) ? (theme as ThemeKey) : 'weak';
  const [puzzle, setPuzzle] = useState<LichessPuzzle | null | undefined>(undefined);
  const rating = useLive(() => getPuzzleRating(), []);
  const skip = useRef<string[]>([]);
  const load = useCallback(async () => {
    const p = await nextLichessPuzzle(mode, skip.current);
    if (p) skip.current.push(p.id);
    setPuzzle(p);
  }, [mode]);
  useEffect(() => {
    void load();
  }, [load]);

  if (puzzle === undefined || !rating) return <p className="text-muted-foreground">Lädt …</p>;
  if (puzzle === null) return <p className="text-muted-foreground">Keine Puzzles gefunden.</p>;
  return <LichessPuzzleView key={puzzle.id} puzzle={puzzle} rating={rating.rating} mode={mode} onNext={load} />;
}

function LichessPuzzleView({ puzzle, rating, mode, onNext }: { puzzle: LichessPuzzle; rating: number; mode: GeneralMode; onNext: () => void }) {
  const [change, setChange] = useState<{ before: number; after: number } | null>(null);
  const s = usePuzzleSolver({
    fen: puzzle.fen,
    line: puzzle.line,
    intro: { fen: puzzle.startFen, move: puzzle.opponentMove },
    onAttempt: (uci, correct, tryNo, ms) => logAttempt(lichessAttemptId(puzzle.id), uci, correct, tryNo, ms),
    onFinish: async (solved, firstTry) => setChange(await recordLichessResult(puzzle, solved, firstTry)),
  });
  const theme = themeOf(puzzle.theme)!;
  const oppMove = uciMove(puzzle.startFen, puzzle.opponentMove);
  const diff = change ? change.after - change.before : 0;

  return (
    <PuzzleLayout
      solver={s}
      status={`Puzzle-Rating ${change?.after ?? rating}`}
      onExit={exitToHub}
      task={
        <>
          <PuzzleMeta>
            <span className="font-semibold text-foreground" data-testid="puzzle-theme">
              {theme.label}
            </span>
            {mode === 'weak' && ', passend zu deinen Schwächen'}, Schwierigkeit {puzzle.rating}
          </PuzzleMeta>
          <PuzzleTitle>Finde den besten Zug</PuzzleTitle>
          {oppMove && (
            <MoveNotes>
              <MoveNote kind="last" testId="opponent-move">
                Dein Gegner hat zuletzt {movedPhrase(oppMove, 'opp')}.
              </MoveNote>
            </MoveNotes>
          )}
        </>
      }
      result={
        change && (
          <span data-testid="rating-change">
            Puzzle-Rating: {change.before} → {change.after} ({diff >= 0 ? '+' : '−'}
            {Math.abs(diff)})
          </span>
        )
      }
      variationTitle="Lösung"
      variationSubtitle="So geht das Puzzle richtig weiter"
      actions={
        <>
          <Button variant="outline" size="lg" className="h-11" onClick={exitToHub}>
            Beenden
          </Button>
          <Button size="lg" className="h-11" onClick={onNext} data-testid="next-puzzle">
            Nächstes Puzzle
          </Button>
        </>
      }
      footer={
        <>
          Puzzles:{' '}
          <a href={`https://lichess.org/training/${puzzle.id}`} target="_blank" rel="noreferrer">
            Lichess
          </a>
          , CC0
        </>
      }
    >
      <section className="flex flex-col gap-2.5 border-t pt-4" data-testid="theme-card">
        <strong className="flex items-center gap-1.5 font-heading text-[26px] leading-tight font-normal">
          <Lightbulb className="size-5 text-brass-text" /> {theme.label}
        </strong>
        <p>{theme.explain}</p>
        <Button variant="outline" className="h-10 self-start" onClick={() => s.showLine(puzzle.line)} data-testid="show-line">
          Lösung zeigen
        </Button>
      </section>
    </PuzzleLayout>
  );
}
