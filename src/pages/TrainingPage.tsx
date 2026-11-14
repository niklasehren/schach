import { useEffect, useMemo, useState } from 'react';
import { Chess } from 'chess.js';
import { ErrorCard, explainMove } from '../components/ErrorExplain';
import { GeneralCard, GeneralSession } from '../components/GeneralTraining';
import { MoveNote, MoveNotes, PuzzleLayout, PuzzleMeta, PuzzleTitle } from '../components/PuzzleLayout';
import { ColorSwatch } from '../components/PlayerBar';
import { movedPhrase, uciMove } from '../chess/moveWords';
import { MiniBoard } from '../components/MiniBoard';
import { db, type PuzzleRecord } from '../db/schema';
import { useLive } from '../db/useLive';
import { formatDate } from '../chess/format';
import { analysisQueue } from '../analysis/queue';
import { useQueueState } from '../analysis/useQueue';
import { isAcceptable, winFor } from '../training/puzzles';
import { dueText, INTERVALS, NEW_PER_DAY, practicedToday, practiceQueue, startOfDay, todaysQueue } from '../training/leitner';
import { finishPuzzle, logAttempt, markSeen, syncAllPuzzles } from '../training/store';
import { usePuzzleSolver } from '../training/usePuzzleSolver';
import { href, type PuzzleFilter, type TrainingMode } from '../app/router';
import { FilteredSession, PuzzleFilterSection } from '../components/PuzzleFilter';
import { buttonVariants } from '@/components/ui/button';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const exitToHub = () => (window.location.hash = href({ page: 'training' }));

export function TrainingPage({ mode, theme, filter }: { mode?: TrainingMode; theme?: string; filter?: PuzzleFilter }) {
  // Puzzles aus allen schon analysierten Partien nachziehen
  useEffect(() => {
    void syncAllPuzzles();
  }, []);
  if (mode === 'allgemein') return <GeneralSession theme={theme === 'schwaechen' ? undefined : theme} />;
  if (mode === 'fehler' || mode === 'mehr') return <MyErrorsSession key={mode} extra={mode === 'mehr'} />;
  if (mode === 'auswahl') return <FilteredSession filter={filter ?? {}} render={(p) => <MyPuzzleView key={p.puzzle.id} {...p} />} />;
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
  // Erste Stellung: heute fällig, sonst die nächste zum Weiterüben
  const first = today.due[0] ?? today.fresh[0] ?? practiceQueue(puzzles)[0] ?? null;
  const startHref = count > 0 ? href({ page: 'training', mode: 'fehler' }) : fresh > 0 ? href({ page: 'training', mode: 'mehr' }) : null;
  const brassButton = cn(buttonVariants({ size: 'lg' }), 'h-12 self-start bg-brass px-6 text-base font-bold text-brass-foreground no-underline hover:bg-brass/90');

  return (
    <div className="flex w-full max-w-[1120px] animate-in flex-col px-4 fade-in-0 md:px-0">
      <h1 className="sr-only">Training</h1>
      {/* Meine Fehler: grünes Band wie auf der Übersicht */}
      <section className={cn('grid gap-6 rounded-2xl bg-hero p-4 text-hero-foreground sm:p-6 md:gap-10 md:p-8', first && 'md:grid-cols-[minmax(0,300px)_1fr]')} aria-labelledby="mine-title">
        {first &&
          (startHref ? (
            <a href={startHref} className="block rounded-lg focus-visible:ring-3 focus-visible:ring-brass focus-visible:outline-none" aria-label="Diese Stellung lösen">
              <MiniBoard fen={first.fen} orientation={first.fen.split(' ')[1] === 'b' ? 'black' : 'white'} coordinates className="w-full rounded-lg shadow-[0_18px_40px_rgba(0,0,0,0.35)]" />
            </a>
          ) : (
            <MiniBoard fen={first.fen} orientation={first.fen.split(' ')[1] === 'b' ? 'black' : 'white'} coordinates className="w-full rounded-lg" />
          ))}
        <div className="flex flex-col justify-center gap-5">
          <h2 id="mine-title" className="font-heading text-[52px] leading-[0.95] font-normal md:text-[68px]" data-testid="due-count">
            {count ? `${count} ${count === 1 ? 'Puzzle' : 'Puzzles'} für heute` : puzzles.length ? 'Tagesziel geschafft' : 'Noch keine Puzzles'}
          </h2>
          <p className="max-w-lg text-[17px] leading-relaxed text-hero-muted">
            {count
              ? `Aus deinen eigenen Fehlern: ${today.fresh.length} ${today.fresh.length === 1 ? 'neues' : 'neue'}${today.due.length ? ` und ${today.due.length} zum Wiederholen` : ''}.`
              : fresh
                ? `Heute geübt: ${practiced} ${practiced === 1 ? 'Puzzle' : 'Puzzles'}. Noch ${fresh} neue aus deinen Fehlern – du kannst weiter üben.`
                : puzzles.length
                  ? `Heute geübt: ${practiced} ${practiced === 1 ? 'Puzzle' : 'Puzzles'}. Alle Puzzles aus deinen Fehlern sind geübt – weiter geht es mit dem Allgemeinen Training.`
                  : 'Sie entstehen automatisch, sobald deine Partien analysiert sind. Bis dahin: Allgemeines Training.'}
          </p>
          {count > 0 ? (
            <a className={brassButton} href={href({ page: 'training', mode: 'fehler' })} data-testid="start-training">
              Training starten
            </a>
          ) : (
            fresh > 0 && (
              <a className={brassButton} href={href({ page: 'training', mode: 'mehr' })} data-testid="practice-more">
                Weiter üben
              </a>
            )
          )}
          <p className="max-w-lg text-[15px] leading-relaxed text-hero-muted">
            Jedes Puzzle ist eine Stellung aus deinen Partien, in der du einen Fehler oder Patzer gemacht hast. Tagesziel: alle fälligen Wiederholungen und {NEW_PER_DAY} neue,
            danach ohne Limit weiter. Richtig gelöste kommen nach 1, 3, 7, 14 und 30 Tagen wieder, falsch gelöste schon morgen.
          </p>
        </div>
      </section>

      <PuzzleFilterSection />

      <GeneralCard />

      <section className="mt-12 border-t pt-8">
        <h2 className="font-heading text-[28px] leading-tight font-normal">Deine Puzzles aus Fehlern</h2>
        <p className="mt-1 text-[15px] text-muted-foreground" data-testid="puzzle-total">
          {puzzles.length} Puzzles aus {new Set(puzzles.map((p) => p.gameId)).size} Partien, {fresh} noch nie geübt
        </p>
        <ol className="mt-5 grid list-none grid-cols-5 p-0" aria-label="Leitner-Kästen">
          {boxes.map((n, i) => (
            <li key={i} className="box flex flex-col gap-0.5 border-l pl-3 first:border-l-0 first:pl-0">
              <strong className="font-heading text-[34px] leading-none font-normal tabular-nums">{n}</strong>
              <span className="text-sm text-muted-foreground">Kasten {i + 1}</span>
              <span className="text-sm text-muted-foreground max-sm:hidden">{INTERVALS[i] === 1 ? 'täglich' : `alle ${INTERVALS[i]} Tage`}</span>
            </li>
          ))}
        </ol>
        {queueState.total > queueState.processed && (
          <p className="mt-4 text-[15px] text-muted-foreground">Noch {queueState.total - queueState.processed} Partien werden analysiert – danach entstehen daraus weitere Puzzles.</p>
        )}
      </section>
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

export type MyPuzzleProps = { puzzle: PuzzleRecord; status: string; hasNext: boolean; onNext: () => void; onExit?: () => void };

function MyPuzzleView({ puzzle, status, hasNext, onNext, onExit = exitToHub }: MyPuzzleProps) {
  const game = useLive(() => db.games.get(puzzle.gameId).then((g) => g ?? null), [puzzle.gameId]);
  const analysis = useLive(() => db.analyses.get(puzzle.gameId).then((a) => a ?? null), [puzzle.gameId]);
  const [nextDue, setNextDue] = useState<number | null>(null);

  useEffect(() => {
    void markSeen(puzzle);
  }, [puzzle]);

  const gameMoves = useMemo(() => {
    if (!game) return [];
    const c = new Chess();
    c.loadPgn(game.pgn);
    return c.history({ verbose: true });
  }, [game]);
  // Letzter Zug des Gegners vor der Puzzle-Stellung (aus der Partie)
  const oppMove = gameMoves[puzzle.ply - 2];
  const s = usePuzzleSolver({
    fen: puzzle.fen,
    line: puzzle.line,
    lastMove: oppMove ? oppMove.from + oppMove.to + (oppMove.promotion ?? '') : undefined,
    played: puzzle.played,
    badArrow: puzzle.played,
    checkAlternative: async (before, after, me) => {
      const [b, a] = await Promise.all([analysisQueue.evaluate(before), analysisQueue.evaluate(after)]);
      return isAcceptable(winFor(b, me, before), winFor(a, me, after), false);
    },
    onAttempt: (uci, correct, tryNo, ms) => logAttempt(puzzle.id, uci, correct, tryNo, ms),
    onFinish: async (_solved, firstTry) => setNextDue((await finishPuzzle(puzzle, firstTry)).due),
  });

  const fens = useMemo(() => (gameMoves.length ? [gameMoves[0].before, ...gameMoves.map((m) => m.after)] : []), [gameMoves]);
  const original = analysis?.sides?.[s.me].find((m) => m.ply === puzzle.ply);
  const playedMove = uciMove(puzzle.fen, puzzle.played);
  const opponent = game ? (s.me === 'white' ? game.black.name : game.white.name) : '';
  const gameLink = href({ page: 'partie', id: puzzle.gameId, ply: puzzle.ply - 1 });

  return (
    <PuzzleLayout
      solver={s}
      status={status}
      onExit={onExit}
      legend={
        <>
          <span className="sq-swatch" data-kind="played" aria-hidden /> dein Zug in der Partie
        </>
      }
      task={
        <>
          {game && (
            <PuzzleMeta>
              <ColorSwatch color={s.me} className="mr-1.5 align-[-2px]" />
              {s.me === 'white' ? 'Weiß' : 'Schwarz'} gegen <span className="font-semibold text-foreground">{opponent}</span>,{' '}
              <a href={gameLink} className="text-brass-text underline-offset-3 hover:underline" data-testid="puzzle-game-link">
                {formatDate(game.date)}
              </a>
              , {puzzle.fen.split(' ')[5]}. Zug
            </PuzzleMeta>
          )}
          <PuzzleTitle>Finde einen besseren Zug</PuzzleTitle>
          <MoveNotes>
            {oppMove && (
              <MoveNote kind="last" testId="opponent-move">
                Dein Gegner hat zuletzt {movedPhrase(oppMove, 'opp')}.
              </MoveNote>
            )}
            {playedMove && (
              <MoveNote kind="played" testId="played-move">
                Du hast hier {movedPhrase(playedMove, 'me')} – <strong className="font-semibold">{puzzle.class === 'blunder' ? 'ein Patzer' : 'ein Fehler'}</strong>.
              </MoveNote>
            )}
          </MoveNotes>
        </>
      }
      result={nextDue !== null && <span data-testid="next-due">Nächste Wiederholung: {dueText(nextDue, Date.now())}.</span>}
      actions={
        <>
          <a
            className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), 'h-11 text-foreground no-underline')}
            href={gameLink}
            data-testid="to-game"
          >
            Zur Originalpartie
          </a>
          <Button size="lg" className="h-11" onClick={hasNext ? onNext : onExit} data-testid="next-puzzle">
            {hasNext ? 'Nächstes Puzzle' : 'Fertig'}
          </Button>
        </>
      }
    >
      {analysis && original && (
        <div className="border-t pt-4">
          <ErrorCard
            move={original}
            moveLabel="Dein Zug in der Partie"
            fenBefore={puzzle.fen}
            explanation={explainMove(original, fens, analysis, gameMoves[puzzle.ply - 2])}
            canShowLine={puzzle.line.length > 0}
            onShowLine={() => s.showLine((analysis.evals[puzzle.ply - 1]?.pv ?? puzzle.line).slice(0, 6))}
          />
        </div>
      )}
    </PuzzleLayout>
  );
}
