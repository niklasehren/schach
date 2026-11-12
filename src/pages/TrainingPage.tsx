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

  if (!puzzles || !today) return <p className="page-note">Lädt …</p>;

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
    <div className="page">
      <h1 className="page-title">Training</h1>
      <section className="card training-card">
        <span className="training-due" data-testid="due-count">
          Heute fällig: {list.length} {list.length === 1 ? 'Puzzle' : 'Puzzles'}
        </span>
        <span className="field-note">
          {today.due.filter((p) => !done.includes(p.id)).length} Wiederholungen · {today.fresh.filter((p) => !done.includes(p.id)).length} neue (höchstens{' '}
          {NEW_PER_DAY} neue pro Tag)
        </span>
        <button className="btn btn-primary btn-large" disabled={list.length === 0} onClick={() => setCurrent(list[0].id)} data-testid="start-training">
          {list.length ? 'Training starten' : 'Für heute fertig'}
        </button>
        <p className="field-note small">
          Jedes Puzzle ist eine Stellung aus deinen eigenen Partien, in der du einen Fehler oder Patzer gemacht hast. Finde den besseren Zug. Richtig gelöste
          Puzzles kommen nach 1, 3, 7, 14 und 30 Tagen wieder, falsch gelöste schon morgen.
        </p>
      </section>
      <section className="card">
        <h2 className="card-title">Deine Puzzles</h2>
        <span className="field-note" data-testid="puzzle-total">
          {puzzles.length} Puzzles aus {new Set(puzzles.map((p) => p.gameId)).size} Partien · {fresh} noch nie geübt
        </span>
        <div className="boxes" aria-label="Leitner-Kästen">
          {boxes.map((n, i) => (
            <span key={i} className="box">
              <strong>{n}</strong>
              <span>Kasten {i + 1}</span>
              <span className="box-interval">{INTERVALS[i] === 1 ? 'täglich' : `alle ${INTERVALS[i]} Tage`}</span>
            </span>
          ))}
        </div>
        {queueState.total > queueState.processed && (
          <p className="field-note small">
            Noch {queueState.total - queueState.processed} Partien werden analysiert – danach entstehen daraus weitere Puzzles.
          </p>
        )}
      </section>
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
    <div className={`play ${variation ? 'in-variation' : ''}`}>
      <section className="play-board">
        <div className="puzzle-bar">
          <span className={`color-swatch swatch-${me}`} aria-hidden />
          <strong>{me === 'white' ? 'Weiß' : 'Schwarz'} am Zug</strong>
          <span className="puzzle-remaining">noch {remaining} heute</span>
        </div>
        <div className="board-area board-with-bar">
          <Board config={config} onMove={onMove} />
          {variation && <span className="variation-badge">Variante</span>}
        </div>
      </section>

      <aside className="play-side is-analysis">
        <button className="back-link link-reset" onClick={onExit}>
          ← Übersicht
        </button>
        {!finished && (
          <section className="puzzle-task" data-testid="puzzle-task">
            <h1 className="puzzle-title">Finde einen besseren Zug</h1>
            {game && (
              <p className="field-note">
                Aus deiner Partie gegen {opponent} vom {formatDate(game.date)}. Dort hast du hier {playedSan ? toGermanSan(playedSan) : '…'} gespielt –{' '}
                {puzzle.class === 'blunder' ? 'ein Patzer' : 'ein Fehler'}.
              </p>
            )}
            {message && (
              <p className={`puzzle-message ${tries > 0 && phase !== 'checking' && !message.startsWith('Richtig') ? 'is-wrong' : ''}`} role="status" data-testid="puzzle-message">
                {message}
              </p>
            )}
          </section>
        )}

        {finished && result && (
          <section className={`puzzle-result ${phase === 'solved' ? 'is-solved' : 'is-failed'}`} role="status" data-testid="puzzle-result">
            <strong>
              {phase === 'solved' ? (tries === 0 ? 'Richtig gelöst!' : 'Richtig – im zweiten Versuch.') : `Nicht gelöst. Besser war ${bestSan ? toGermanSan(bestSan) : '…'}.`}
            </strong>
            {result.alt && bestSan && result.alt !== toGermanSan(bestSan) && (
              <span>
                Auch gut: {result.alt} ist fast so stark wie {toGermanSan(bestSan)}.
              </span>
            )}
            <span data-testid="next-due">Nächste Wiederholung: {dueText(result.due, Date.now())}.</span>
          </section>
        )}

        {finished && analysis && original && !variation && (
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
          <div className="actions">
            <a className="btn" href={href({ page: 'partie', id: puzzle.gameId, ply: puzzle.ply - 1 })} data-testid="to-game">
              Zur Originalpartie
            </a>
            <button className="btn btn-primary" onClick={remaining > 0 ? onNext : onExit} data-testid="next-puzzle">
              {remaining > 0 ? 'Nächstes Puzzle' : 'Fertig'}
            </button>
          </div>
        )}
      </aside>
    </div>
  );
}
