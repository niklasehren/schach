import { useEffect, useMemo, useState } from 'react';
import { Chess } from 'chess.js';
import { Repeat, Target } from 'lucide-react';
import { ErrorCard, explainMove } from '../components/ErrorExplain';
import { GeneralCard, GeneralSession } from '../components/GeneralTraining';
import { PuzzleLayout } from '../components/PuzzleLayout';
import { db, type PuzzleRecord } from '../db/schema';
import { useLive } from '../db/useLive';
import { toGermanSan } from '../chess/game';
import { formatDate } from '../chess/format';
import { playLine } from '../analysis/explain';
import { analysisQueue } from '../analysis/queue';
import { useQueueState } from '../analysis/useQueue';
import { isAcceptable, winFor } from '../training/puzzles';
import { dueText, INTERVALS, NEW_PER_DAY, practicedToday, practiceQueue, startOfDay, todaysQueue } from '../training/leitner';
import { finishPuzzle, logAttempt, markSeen, syncAllPuzzles } from '../training/store';
import { usePuzzleSolver } from '../training/usePuzzleSolver';
import { href, type TrainingMode } from '../app/router';
import { buttonVariants } from '@/components/ui/button';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

const exitToHub = () => (window.location.hash = href({ page: 'training' }));

export function TrainingPage({ mode, theme }: { mode?: TrainingMode; theme?: string }) {
  // Puzzles aus allen schon analysierten Partien nachziehen
  useEffect(() => {
    void syncAllPuzzles();
  }, []);
  if (mode === 'allgemein') return <GeneralSession theme={theme === 'schwaechen' ? undefined : theme} />;
  if (mode === 'fehler' || mode === 'mehr') return <MyErrorsSession key={mode} extra={mode === 'mehr'} />;
  return <TrainingHub />;
}

function TrainingHub() {
  const puzzles = useLive(() => db.puzzles.toArray(), []);
  const attemptsToday = useLive(() => db.attempts.where('date').aboveOrEqual(startOfDay(Date.now())).toArray(), []);
  const queueState = useQueueState();
  const today = useMemo(() => (puzzles ? todaysQueue(puzzles, Date.now()) : null), [puzzles]);
  if (!puzzles || !today) return <p className="text-muted-foreground">Lädt …</p>;

  const count = today.due.length + today.fresh.length;
  const practiced = practicedToday(attemptsToday ?? [], Date.now());
  const boxes = INTERVALS.map((_, i) => puzzles.filter((p) => p.box === i + 1).length);
  const fresh = puzzles.filter((p) => p.box === 0).length;
  const brassButton = cn(buttonVariants({ size: 'lg' }), 'h-13 bg-brass text-[17px] font-bold text-brass-foreground no-underline hover:bg-brass/90');

  return (
    <div className="flex w-full max-w-2xl animate-in flex-col gap-4 px-3.5 fade-in-0 slide-in-from-bottom-1 md:px-0">
      <h1 className="font-heading text-4xl">Training</h1>
      <Card className="gap-3 bg-hero p-6 text-hero-foreground ring-0">
        <span className="text-xs font-bold tracking-[0.08em] text-hero-muted uppercase">
          <Target className="mr-1 inline size-3.5 align-[-2px]" /> Meine Fehler
        </span>
        <span className="font-heading text-5xl leading-tight" data-testid="due-count">
          {count ? `Heute fällig: ${count} ${count === 1 ? 'Puzzle' : 'Puzzles'}` : puzzles.length ? 'Tagesziel geschafft' : 'Noch keine Puzzles'}
        </span>
        <span className="text-[15px] text-hero-muted">
          {count
            ? `${today.due.length} Wiederholungen · ${today.fresh.length} neue (Tagesziel: ${NEW_PER_DAY} neue)`
            : fresh
              ? `Heute geübt: ${practiced} ${practiced === 1 ? 'Puzzle' : 'Puzzles'}. Noch ${fresh} neue aus deinen Fehlern – du kannst weiter üben.`
              : puzzles.length
                ? `Heute geübt: ${practiced} ${practiced === 1 ? 'Puzzle' : 'Puzzles'}. Alle Puzzles aus deinen Fehlern sind geübt – weiter geht es mit dem Allgemeinen Training.`
                : 'Sie entstehen automatisch, sobald deine Partien analysiert sind. Bis dahin: Allgemeines Training.'}
        </span>
        {count > 0 ? (
          <a className={brassButton} href={href({ page: 'training', mode: 'fehler' })} data-testid="start-training">
            <Target data-icon="inline-start" /> Training starten
          </a>
        ) : (
          fresh > 0 && (
            <a className={brassButton} href={href({ page: 'training', mode: 'mehr' })} data-testid="practice-more">
              <Repeat data-icon="inline-start" /> Weiter üben
            </a>
          )
        )}
        <p className="text-[13px] text-hero-muted">
          Jedes Puzzle ist eine Stellung aus deinen eigenen Partien, in der du einen Fehler oder Patzer gemacht hast. Tagesziel: alle fälligen Wiederholungen und {NEW_PER_DAY} neue.
          Danach kannst du ohne Limit weiter üben. Richtig gelöste Puzzles kommen nach 1, 3, 7, 14 und 30 Tagen wieder, falsch gelöste schon morgen.
        </p>
      </Card>

      <GeneralCard />

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Deine Puzzles aus Fehlern</CardTitle>
          <CardDescription data-testid="puzzle-total">
            {puzzles.length} Puzzles aus {new Set(puzzles.map((p) => p.gameId)).size} Partien · {fresh} noch nie geübt
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="grid grid-cols-5 gap-2" aria-label="Leitner-Kästen">
            {boxes.map((n, i) => (
              <span key={i} className="box flex flex-col items-center gap-0.5 rounded-lg border bg-muted/40 px-1 py-2.5 text-center text-[13px] text-muted-foreground">
                <strong className="text-2xl text-foreground tabular-nums">{n}</strong>
                <span>Kasten {i + 1}</span>
                <span className="text-xs max-sm:hidden">{INTERVALS[i] === 1 ? 'täglich' : `alle ${INTERVALS[i]} Tage`}</span>
              </span>
            ))}
          </div>
          {queueState.total > queueState.processed && (
            <p className="text-[13px] text-muted-foreground">Noch {queueState.total - queueState.processed} Partien werden analysiert – danach entstehen daraus weitere Puzzles.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/** Puzzles aus meinen Fehlern: Tagesziel (extra = false) oder „Weiter üben“ ohne Limit (extra = true) */
function MyErrorsSession({ extra }: { extra: boolean }) {
  const puzzles = useLive(() => db.puzzles.toArray(), []);
  const [done, setDone] = useState<string[]>([]);
  const [current, setCurrent] = useState<string | null>(null);
  const list = useMemo(() => {
    if (!puzzles) return [];
    const all = extra ? practiceQueue(puzzles) : (({ due, fresh }) => [...due, ...fresh])(todaysQueue(puzzles, Date.now()));
    return all.filter((p) => !done.includes(p.id));
  }, [puzzles, extra, done]);

  // Das gerade gezeigte Puzzle festhalten, auch wenn es nach dem Lösen aus der Liste fällt
  useEffect(() => {
    if (!puzzles || current !== null) return;
    if (list[0]) setCurrent(list[0].id);
    else exitToHub();
  }, [puzzles, current, list]);

  const active = puzzles?.find((p) => p.id === current);
  if (!active) return <p className="text-muted-foreground">Lädt …</p>;
  const remaining = list.filter((p) => p.id !== active.id).length;
  return (
    <MyPuzzleView
      key={active.id}
      puzzle={active}
      status={extra ? `noch ${remaining} neue` : `noch ${remaining} heute`}
      hasNext={remaining > 0}
      onNext={() => {
        setDone((d) => [...d, active.id]);
        setCurrent(list.find((p) => p.id !== active.id)?.id ?? null);
      }}
    />
  );
}

function MyPuzzleView({ puzzle, status, hasNext, onNext }: { puzzle: PuzzleRecord; status: string; hasNext: boolean; onNext: () => void }) {
  const game = useLive(() => db.games.get(puzzle.gameId).then((g) => g ?? null), [puzzle.gameId]);
  const analysis = useLive(() => db.analyses.get(puzzle.gameId).then((a) => a ?? null), [puzzle.gameId]);
  const [nextDue, setNextDue] = useState<number | null>(null);

  useEffect(() => {
    void markSeen(puzzle);
  }, [puzzle]);

  const s = usePuzzleSolver({
    fen: puzzle.fen,
    line: puzzle.line,
    badArrow: puzzle.played,
    checkAlternative: async (before, after, me) => {
      const [b, a] = await Promise.all([analysisQueue.evaluate(before), analysisQueue.evaluate(after)]);
      return isAcceptable(winFor(b, me, before), winFor(a, me, after), false);
    },
    onAttempt: (uci, correct, tryNo, ms) => logAttempt(puzzle.id, uci, correct, tryNo, ms),
    onFinish: async (_solved, firstTry) => setNextDue((await finishPuzzle(puzzle, firstTry)).due),
  });

  const gameMoves = useMemo(() => {
    if (!game) return [];
    const c = new Chess();
    c.loadPgn(game.pgn);
    return c.history({ verbose: true });
  }, [game]);
  const fens = useMemo(() => (gameMoves.length ? [gameMoves[0].before, ...gameMoves.map((m) => m.after)] : []), [gameMoves]);
  const original = analysis?.sides?.[s.me].find((m) => m.ply === puzzle.ply);
  const playedSan = playLine(puzzle.fen, [puzzle.played])[0]?.san;
  const opponent = game ? (s.me === 'white' ? game.black.name : game.white.name) : '';

  return (
    <PuzzleLayout
      solver={s}
      status={status}
      onExit={exitToHub}
      task={
        <>
          <h1 className="font-heading text-4xl leading-tight">Finde einen besseren Zug</h1>
          {game && (
            <p className="text-muted-foreground">
              Aus deiner Partie gegen {opponent} vom {formatDate(game.date)}. Dort hast du hier {playedSan ? toGermanSan(playedSan) : '…'} gespielt –{' '}
              {puzzle.class === 'blunder' ? 'ein Patzer' : 'ein Fehler'}.
            </p>
          )}
        </>
      }
      result={nextDue !== null && <span data-testid="next-due">Nächste Wiederholung: {dueText(nextDue, Date.now())}.</span>}
      actions={
        <>
          <a
            className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), 'h-11 text-foreground no-underline')}
            href={href({ page: 'partie', id: puzzle.gameId, ply: puzzle.ply - 1 })}
            data-testid="to-game"
          >
            Zur Originalpartie
          </a>
          <Button size="lg" className="h-11" onClick={hasNext ? onNext : exitToHub} data-testid="next-puzzle">
            {hasNext ? 'Nächstes Puzzle' : 'Fertig'}
          </Button>
        </>
      }
    >
      {analysis && original && (
        <Card className="px-3.5">
          <ErrorCard
            move={original}
            moveLabel={`${toGermanSan(original.san)}${original.class === 'blunder' ? '??' : '?'} (in der Partie)`}
            explanation={explainMove(original, fens, analysis, gameMoves[puzzle.ply - 2])}
            canShowLine={puzzle.line.length > 0}
            onShowLine={() => s.showLine((analysis.evals[puzzle.ply - 1]?.pv ?? puzzle.line).slice(0, 6))}
          />
        </Card>
      )}
    </PuzzleLayout>
  );
}
