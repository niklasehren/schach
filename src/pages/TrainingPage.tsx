import { useEffect, useMemo, useRef, useState } from 'react';
import { Chess, type Move } from 'chess.js';
import type { Config } from '@lichess-org/chessground/config';
import type { DrawShape } from '@lichess-org/chessground/draw';
import type { Color, Key } from '@lichess-org/chessground/types';
import { Board } from '../components/Board';
import { ErrorCard, explainMove, VariationCard } from '../components/ErrorExplain';
import { db, type PuzzleRecord, type Side } from '../db/schema';
import { useLive } from '../db/useLive';
import { legalDests } from '../chess/game';
import { toGermanSan } from '../chess/game';
import { formatDate } from '../chess/format';
import { playLine } from '../analysis/explain';
import { analysisQueue } from '../analysis/queue';
import { useQueueState } from '../analysis/useQueue';
import { isAcceptable, winFor } from '../training/puzzles';
import { dueText, INTERVALS, NEW_PER_DAY, todaysQueue } from '../training/leitner';
import { finishPuzzle, logAttempt, markSeen, syncAllPuzzles } from '../training/store';
import { href } from '../app/router';
import { CircleCheck, CircleX, Target } from 'lucide-react';
import { ColorSwatch } from '../components/PlayerBar';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export function TrainingPage() {
  // Puzzles aus allen schon analysierten Partien nachziehen
  useEffect(() => {
    void syncAllPuzzles();
  }, []);
  const puzzles = useLive(() => db.puzzles.toArray(), []);
  const [current, setCurrent] = useState<string | null>(null);
  const [done, setDone] = useState<string[]>([]);
  const queueState = useQueueState();
  const now = Date.now();
  const today = useMemo(() => (puzzles ? todaysQueue(puzzles, now) : null), [puzzles, now]);
  const list = today ? [...today.due, ...today.fresh].filter((p) => !done.includes(p.id)) : [];
  const active = puzzles?.find((p) => p.id === current) ?? null;

  if (!puzzles || !today) return <p className="text-muted-foreground">Lädt …</p>;

  if (active) {
    return (
      <PuzzleView
        key={active.id}
        puzzle={active}
        remaining={list.filter((p) => p.id !== active.id).length}
        onNext={() => {
          setDone((d) => [...d, active.id]);
          const next = list.find((p) => p.id !== active.id);
          setCurrent(next?.id ?? null);
        }}
        onExit={() => {
          setDone((d) => [...d, active.id]);
          setCurrent(null);
        }}
      />
    );
  }

  const boxes = INTERVALS.map((_, i) => puzzles.filter((p) => p.box === i + 1).length);
  const fresh = puzzles.filter((p) => p.box === 0).length;
  return (
    <div className="flex w-full max-w-2xl animate-in flex-col gap-4 px-3.5 fade-in-0 slide-in-from-bottom-1 md:px-0">
      <h1 className="font-heading text-4xl">Training</h1>
      <Card className="gap-3 bg-hero p-6 text-hero-foreground ring-0">
        <span className="font-heading text-5xl leading-tight" data-testid="due-count">
          Heute fällig: {list.length} {list.length === 1 ? 'Puzzle' : 'Puzzles'}
        </span>
        <span className="text-[15px] text-hero-muted">
          {today.due.filter((p) => !done.includes(p.id)).length} Wiederholungen · {today.fresh.filter((p) => !done.includes(p.id)).length} neue (höchstens{' '}
          {NEW_PER_DAY} neue pro Tag)
        </span>
        <Button
          size="lg"
          className="h-13 bg-brass text-[17px] font-bold text-brass-foreground hover:bg-brass/90"
          disabled={list.length === 0}
          onClick={() => setCurrent(list[0].id)}
          data-testid="start-training"
        >
          <Target data-icon="inline-start" />
          {list.length ? 'Training starten' : 'Für heute fertig'}
        </Button>
        <p className="text-[13px] text-hero-muted">
          Jedes Puzzle ist eine Stellung aus deinen eigenen Partien, in der du einen Fehler oder Patzer gemacht hast. Finde den besseren Zug. Richtig gelöste
          Puzzles kommen nach 1, 3, 7, 14 und 30 Tagen wieder, falsch gelöste schon morgen.
        </p>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Deine Puzzles</CardTitle>
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
            <p className="text-[13px] text-muted-foreground">
              Noch {queueState.total - queueState.processed} Partien werden analysiert – danach entstehen daraus weitere Puzzles.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

type Phase = 'solving' | 'reply' | 'checking' | 'solved' | 'failed';

function PuzzleView({ puzzle, remaining, onNext, onExit }: { puzzle: PuzzleRecord; remaining: number; onNext: () => void; onExit: () => void }) {
  const game = useLive(() => db.games.get(puzzle.gameId).then((g) => g ?? null), [puzzle.gameId]);
  const analysis = useLive(() => db.analyses.get(puzzle.gameId).then((a) => a ?? null), [puzzle.gameId]);
  const me: Side = puzzle.fen.split(' ')[1] === 'w' ? 'white' : 'black';
  const [fen, setFen] = useState(puzzle.fen);
  const [step, setStep] = useState(0);
  const [tries, setTries] = useState(0);
  const [phase, setPhase] = useState<Phase>('solving');
  const [message, setMessage] = useState<string | null>(null);
  const [lastMove, setLastMove] = useState<[Key, Key] | undefined>();
  const [result, setResult] = useState<{ due: number; alt?: string } | null>(null);
  const [variation, setVariation] = useState<{ moves: Move[]; step: number } | null>(null);
  const started = useRef(Date.now());
  const stepFen = useRef(puzzle.fen);

  useEffect(() => {
    void markSeen(puzzle);
  }, [puzzle]);

  const fens = useMemo(() => {
    if (!game) return [];
    const c = new Chess();
    c.loadPgn(game.pgn);
    const h = c.history({ verbose: true });
    return [h[0]?.before ?? c.fen(), ...h.map((m) => m.after)];
  }, [game]);
  const gameMoves = useMemo(() => {
    if (!game) return [];
    const c = new Chess();
    c.loadPgn(game.pgn);
    return c.history({ verbose: true });
  }, [game]);
  const original = analysis?.sides?.[me].find((m) => m.ply === puzzle.ply);
  const finished = phase === 'solved' || phase === 'failed';
  const bestSan = playLine(puzzle.fen, [puzzle.line[0]])[0]?.san;
  const playedSan = playLine(puzzle.fen, [puzzle.played])[0]?.san;

  async function finish(correct: boolean, alt?: string) {
    const updated = await finishPuzzle(puzzle, correct && tries === 0);
    setResult({ due: updated.due!, alt });
    setPhase(correct ? 'solved' : 'failed');
    // Brett zurück in die Ausgangsstellung – dort stehen Pfeile und Erklärung
    window.setTimeout(() => {
      setFen(puzzle.fen);
      setLastMove(undefined);
    }, 700);
  }

  async function onMove(from: Key, to: Key) {
    if (phase !== 'solving') return;
    const chess = new Chess(stepFen.current);
    const expected = puzzle.line[step];
    const promotion = expected && expected.slice(0, 4) === from + to ? expected[4] : 'q';
    let mv: Move;
    try {
      mv = chess.move({ from, to, promotion });
    } catch {
      return;
    }
    const uci = mv.from + mv.to + (mv.promotion ?? '');
    setFen(chess.fen());
    setLastMove([from, to]);
    const tryNo = tries + 1;
    const ms = Date.now() - started.current;

    if (uci === expected) {
      if (step + 1 >= puzzle.line.length) {
        await logAttempt(puzzle.id, uci, true, tryNo, ms);
        await finish(true);
        return;
      }
      // Der Computer antwortet
      setPhase('reply');
      setMessage('Richtig! Der Gegner antwortet …');
      await new Promise((r) => setTimeout(r, 450));
      const reply = chess.move({ from: puzzle.line[step + 1].slice(0, 2), to: puzzle.line[step + 1].slice(2, 4), promotion: puzzle.line[step + 1][4] });
      stepFen.current = chess.fen();
      setFen(chess.fen());
      setLastMove([reply.from as Key, reply.to as Key]);
      setStep(step + 2);
      setMessage(`Richtig! Der Gegner antwortet mit ${toGermanSan(reply.san)}. Wie geht es weiter?`);
      setPhase('solving');
      return;
    }

    // Anderer Zug: Matt ist immer richtig, sonst mit der Engine prüfen, ob er fast gleich gut ist
    let acceptable = chess.isCheckmate();
    if (!acceptable) {
      setPhase('checking');
      setMessage('Prüfe deinen Zug …');
      const [before, after] = await Promise.all([analysisQueue.evaluate(stepFen.current), analysisQueue.evaluate(chess.fen())]);
      acceptable = isAcceptable(winFor(before, me, stepFen.current), winFor(after, me, chess.fen()), false);
    }
    if (acceptable) {
      await logAttempt(puzzle.id, uci, true, tryNo, ms);
      setMessage(null);
      await finish(true, toGermanSan(mv.san));
      return;
    }
    await logAttempt(puzzle.id, uci, false, tryNo, ms);
    setTries(tryNo);
    if (tryNo < 2) {
      setMessage(`${toGermanSan(mv.san)} ist nicht der beste Zug. Versuch es noch einmal.`);
      setPhase('reply');
      window.setTimeout(() => {
        setFen(stepFen.current);
        setLastMove(undefined);
        setPhase('solving');
      }, 700);
    } else {
      setMessage(null);
      await finish(false);
    }
  }

  const config = useMemo<Config>(() => {
    const shapes: DrawShape[] = [];
    let shown = fen;
    let last = lastMove;
    if (variation) {
      shown = variation.step === 0 ? puzzle.fen : variation.moves[variation.step - 1].after;
      const lm = variation.step > 0 ? variation.moves[variation.step - 1] : undefined;
      last = lm ? [lm.from as Key, lm.to as Key] : undefined;
      const next = variation.moves[variation.step];
      if (next) shapes.push({ orig: next.from as Key, dest: next.to as Key, brush: 'good' });
    } else if (finished && fen === puzzle.fen) {
      shapes.push({ orig: puzzle.played.slice(0, 2) as Key, dest: puzzle.played.slice(2, 4) as Key, brush: 'bad' });
      shapes.push({ orig: puzzle.line[0].slice(0, 2) as Key, dest: puzzle.line[0].slice(2, 4) as Key, brush: 'good' });
    }
    const chess = new Chess(shown);
    const canMove = phase === 'solving' && !variation;
    const turn: Color = chess.turn() === 'w' ? 'white' : 'black';
    return {
      fen: chess.fen(),
      orientation: me,
      turnColor: turn,
      lastMove: last,
      check: chess.inCheck() ? turn : false,
      movable: { color: canMove ? me : undefined, dests: canMove ? legalDests(chess) : new Map() },
      drawable: { autoShapes: shapes },
    };
  }, [fen, lastMove, phase, variation, finished, puzzle, me]);

  const opponent = game ? (me === 'white' ? game.black.name : game.white.name) : '';
  const lastGameMove = gameMoves[puzzle.ply - 2];

  return (
    <div className={cn('play grid w-full animate-in grid-cols-1 items-start gap-3 fade-in-0 md:w-auto md:grid-cols-[var(--board-size)_380px] md:gap-7', variation && 'in-variation')}>
      <section className="flex flex-col gap-0.5 md:gap-1.5">
        <div className="flex h-(--bar-height) items-center gap-2 px-0.5 max-md:px-3.5">
          <ColorSwatch color={me} />
          <strong>{me === 'white' ? 'Weiß' : 'Schwarz'} am Zug</strong>
          <span className="ml-auto text-sm text-muted-foreground">noch {remaining} heute</span>
        </div>
        <div className="board-area relative">
          <Board config={config} onMove={onMove} />
          {variation && <Badge className="variation-badge pointer-events-none absolute top-2.5 right-2.5 z-10 bg-brass text-brass-foreground">Variante</Badge>}
        </div>
      </section>

      <aside className="flex flex-col gap-3.5 max-md:px-3.5 md:pt-[calc(var(--bar-height)+6px)]">
        <Button variant="ghost" size="sm" className="self-start text-muted-foreground max-md:order-last" onClick={onExit}>
          ← Übersicht
        </Button>
        {!finished && (
          <section className="flex flex-col gap-2 max-md:order-first" data-testid="puzzle-task">
            <h1 className="font-heading text-4xl leading-tight">Finde einen besseren Zug</h1>
            {game && (
              <p className="text-muted-foreground">
                Aus deiner Partie gegen {opponent} vom {formatDate(game.date)}. Dort hast du hier {playedSan ? toGermanSan(playedSan) : '…'} gespielt –{' '}
                {puzzle.class === 'blunder' ? 'ein Patzer' : 'ein Fehler'}.
              </p>
            )}
            {message && (
              <p
                className={cn(
                  'rounded-lg px-3 py-2.5 font-semibold',
                  tries > 0 && phase !== 'checking' && !message.startsWith('Richtig') ? 'bg-loss-bg text-loss' : 'bg-primary/12',
                )}
                role="status"
                data-testid="puzzle-message"
              >
                {message}
              </p>
            )}
          </section>
        )}

        {finished && result && (
          <Alert
            className={cn('max-md:order-first', phase === 'solved' ? 'border-win/40 bg-win-bg' : 'border-loss/40 bg-loss-bg')}
            role="status"
            data-testid="puzzle-result"
          >
            {phase === 'solved' ? <CircleCheck className="text-win" /> : <CircleX className="text-loss" />}
            <AlertTitle className={cn('text-base', phase === 'solved' ? 'text-win' : 'text-loss')}>
              {phase === 'solved' ? (tries === 0 ? 'Richtig gelöst!' : 'Richtig – im zweiten Versuch.') : `Nicht gelöst. Besser war ${bestSan ? toGermanSan(bestSan) : '…'}.`}
            </AlertTitle>
            <AlertDescription className="text-foreground">
              {result.alt && bestSan && result.alt !== toGermanSan(bestSan) && (
                <span>
                  Auch gut: {result.alt} ist fast so stark wie {toGermanSan(bestSan)}.
                </span>
              )}
              <span data-testid="next-due">Nächste Wiederholung: {dueText(result.due, Date.now())}.</span>
            </AlertDescription>
          </Alert>
        )}

        {finished && analysis && original && !variation && (
          <Card className="px-3.5">
            <ErrorCard
              move={original}
              moveLabel={`${toGermanSan(original.san)}${original.class === 'blunder' ? '??' : '?'} (in der Partie)`}
              explanation={explainMove(original, fens, analysis, lastGameMove)}
              canShowLine={puzzle.line.length > 0}
              onShowLine={() => {
                const pv = analysis.evals[puzzle.ply - 1]?.pv ?? puzzle.line;
                const moves = playLine(puzzle.fen, pv.slice(0, 6));
                setVariation({ moves, step: 1 });
              }}
            />
          </Card>
        )}
        {finished && variation && (
          <VariationCard
            fen={puzzle.fen}
            moves={variation.moves}
            step={variation.step}
            onStep={(s) => setVariation((v) => (v ? { ...v, step: Math.max(0, Math.min(v.moves.length, s)) } : v))}
            onClose={() => setVariation(null)}
          />
        )}

        {finished && (
          <div className="grid grid-cols-2 gap-2">
            <a
              className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), 'h-11 text-foreground no-underline')}
              href={href({ page: 'partie', id: puzzle.gameId, ply: puzzle.ply - 1 })}
              data-testid="to-game"
            >
              Zur Originalpartie
            </a>
            <Button size="lg" className="h-11" onClick={remaining > 0 ? onNext : onExit} data-testid="next-puzzle">
              {remaining > 0 ? 'Nächstes Puzzle' : 'Fertig'}
            </Button>
          </div>
        )}
      </aside>
    </div>
  );
}
