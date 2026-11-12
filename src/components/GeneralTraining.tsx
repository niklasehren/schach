import { useCallback, useEffect, useRef, useState } from 'react';
import { BookOpen, Lightbulb } from 'lucide-react';
import { useLive } from '../db/useLive';
import { href } from '../app/router';
import { playLine } from '../analysis/explain';
import { toGermanSan } from '../chess/game';
import { logAttempt } from '../training/store';
import { getPuzzleRating, lichessAttemptId, nextLichessPuzzle, recordLichessResult, weightsFromAnalyses, type GeneralMode } from '../training/general';
import type { LichessPuzzle } from '../training/lichess';
import { THEMES, themeOf, type ThemeKey } from '../training/themes';
import { usePuzzleSolver } from '../training/usePuzzleSolver';
import { PuzzleLayout } from './PuzzleLayout';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';

const eyebrow = 'text-xs font-bold tracking-[0.08em] uppercase';
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
    <Card data-testid="general-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <BookOpen className="size-5 text-brass" /> Allgemeines Training
        </CardTitle>
        <CardDescription>Taktik-Puzzles aus der Lichess-Datenbank, passend zu deinem Niveau.</CardDescription>
        <CardAction className="flex flex-col items-end">
          <span className="font-heading text-4xl leading-none tabular-nums" data-testid="puzzle-rating">
            {rating?.rating ?? '…'}
          </span>
          <span className="text-xs text-muted-foreground">Puzzle-Rating</span>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3.5">
        <ToggleGroup
          variant="outline"
          value={[choice]}
          onValueChange={(v: string[]) => v[0] && setChoice(v[0] as 'weak' | 'theme')}
          aria-label="Auswahl der Puzzles"
          className="grid w-full grid-cols-2"
        >
          <ToggleGroupItem value="weak" className="h-auto min-h-10 py-2 whitespace-normal">
            Passend zu meinen Schwächen
          </ToggleGroupItem>
          <ToggleGroupItem value="theme" className="h-auto min-h-10 py-2">
            Thema wählen
          </ToggleGroupItem>
        </ToggleGroup>

        {choice === 'weak' ? (
          <>
            <p className="text-sm text-muted-foreground" data-testid="focus-themes">
              {focus === undefined
                ? '…'
                : focus === null
                  ? 'Noch keine Fehler mit klarer Taktik analysiert – alle Themen kommen gleich oft dran.'
                  : `Schwerpunkte aus deinen Fehlern: ${focus.join(', ')}. Andere Themen kommen seltener dran.`}
            </p>
            <a
              className={cn(buttonVariants({ size: 'lg' }), 'h-12 text-base font-bold no-underline')}
              href={href({ page: 'training', mode: 'allgemein', theme: 'schwaechen' })}
              data-testid="start-general"
            >
              <BookOpen data-icon="inline-start" /> Allgemeines Training starten
            </a>
          </>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" role="list" aria-label="Themen">
            {THEMES.map((t) => (
              <a
                key={t.key}
                role="listitem"
                className={cn(buttonVariants({ variant: 'outline' }), 'h-11 justify-start text-foreground no-underline')}
                href={href({ page: 'training', mode: 'allgemein', theme: t.key })}
                data-testid={`theme-${t.key}`}
              >
                {t.label}
              </a>
            ))}
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          {rating && rating.played === 0 ? 'Startwert aus deiner Chess.com-Wertung. ' : ''}Das Rating passt sich nach jedem Puzzle an: im ersten Versuch gelöst zählt voll, im
          zweiten halb. {LICHESS_NOTE}.
        </p>
      </CardContent>
    </Card>
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
  const oppSan = playLine(puzzle.startFen, [puzzle.opponentMove])[0]?.san;
  const diff = change ? change.after - change.before : 0;

  return (
    <PuzzleLayout
      solver={s}
      status={`Puzzle-Rating ${change?.after ?? rating}`}
      onExit={exitToHub}
      task={
        <>
          <span className={cn(eyebrow, 'text-brass')} data-testid="puzzle-theme">
            {mode === 'weak' ? `${theme.label} · passend zu deinen Schwächen` : theme.label}
          </span>
          <h1 className="font-heading text-4xl leading-tight">Finde den besten Zug</h1>
          <p className="text-muted-foreground">
            {oppSan ? `Der Gegner hat ${toGermanSan(oppSan)} gespielt. ` : ''}Puzzle-Schwierigkeit {puzzle.rating}.
          </p>
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
      <Card className="gap-2.5 px-4 py-4" data-testid="theme-card">
        <strong className="flex items-center gap-1.5">
          <Lightbulb className="size-4 text-brass" /> {theme.label}
        </strong>
        <p className="text-[15px]">{theme.explain}</p>
        <Button variant="outline" className="h-10 self-start" onClick={() => s.showLine(puzzle.line)} data-testid="show-line">
          Lösung zeigen
        </Button>
      </Card>
    </PuzzleLayout>
  );
}
