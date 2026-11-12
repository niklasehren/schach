import { useEffect, useMemo, useRef, useState } from 'react';
import { Chess, type Move } from 'chess.js';
import type { Config } from '@lichess-org/chessground/config';
import type { DrawShape } from '@lichess-org/chessground/draw';
import type { Color, Key } from '@lichess-org/chessground/types';
import type { Side } from '../db/schema';
import { legalDests, toGermanSan } from '../chess/game';
import { playLine } from '../analysis/explain';

export type Phase = 'intro' | 'solving' | 'reply' | 'checking' | 'solved' | 'failed';

/** Wie lange der Zug des Gegners vor dem Start zu sehen ist, bevor er gespielt wird */
export const INTRO_DELAY = 700;

export type SolverOptions = {
  /** Stellung, in der ich am Zug bin */
  fen: string;
  /** Lösung (UCI): meine Züge an geraden Stellen */
  line: string[];
  /** Lichess: Stellung davor und Zug des Gegners – wird zuerst auf dem Brett vorgespielt */
  intro?: { fen: string; move: string };
  /** Anderer Zug als die Lösung: fast gleich gut? (Matt ist immer richtig) */
  checkAlternative?: (fenBefore: string, fenAfter: string, me: Side) => Promise<boolean>;
  /** Roter Pfeil nach dem Ende; Standard: mein erster falscher Zug */
  badArrow?: string;
  onAttempt?: (uci: string, correct: boolean, tryNo: number, ms: number) => Promise<void> | void;
  /** Ende: gelöst oder nicht, und ob im ersten Versuch */
  onFinish: (solved: boolean, firstTry: boolean) => Promise<void> | void;
};

const keys = (uci: string): [Key, Key] => [uci.slice(0, 2) as Key, uci.slice(2, 4) as Key];

/** Ablauf eines Puzzles: gleiche Bedienung für „Meine Fehler“ und „Allgemeines Training“ */
export function usePuzzleSolver(o: SolverOptions) {
  const me: Side = o.fen.split(' ')[1] === 'w' ? 'white' : 'black';
  const introMove = o.intro ? keys(o.intro.move) : undefined;
  const [fen, setFen] = useState(o.intro?.fen ?? o.fen);
  const [lastMove, setLastMove] = useState<[Key, Key] | undefined>();
  const [phase, setPhase] = useState<Phase>(o.intro ? 'intro' : 'solving');
  const [step, setStep] = useState(0);
  const [tries, setTries] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [alt, setAlt] = useState<string | undefined>();
  const [wrong, setWrong] = useState<string | undefined>();
  const [variation, setVariation] = useState<{ moves: Move[]; step: number } | null>(null);
  const started = useRef(Date.now());
  const stepFen = useRef(o.fen);

  // Lichess: erst die Stellung vor dem Gegnerzug zeigen, dann den Zug spielen (chessground animiert ihn)
  useEffect(() => {
    if (!o.intro) return;
    const t = window.setTimeout(() => {
      setFen(o.fen);
      setLastMove(introMove);
      setPhase('solving');
      started.current = Date.now();
    }, INTRO_DELAY);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const finished = phase === 'solved' || phase === 'failed';

  async function finish(solved: boolean, tryNo: number, altSan?: string) {
    await o.onFinish(solved, solved && tryNo === 1);
    setAlt(altSan);
    setPhase(solved ? 'solved' : 'failed');
    // Brett zurück in die Ausgangsstellung – dort stehen Pfeile und Erklärung
    window.setTimeout(() => {
      setFen(o.fen);
      setLastMove(introMove);
    }, 700);
  }

  async function onMove(from: Key, to: Key) {
    if (phase !== 'solving') return;
    const chess = new Chess(stepFen.current);
    const expected = o.line[step];
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
      if (step + 1 >= o.line.length) {
        await o.onAttempt?.(uci, true, tryNo, ms);
        await finish(true, tryNo);
        return;
      }
      // Der Gegner antwortet
      setPhase('reply');
      setMessage('Richtig! Der Gegner antwortet …');
      await new Promise((r) => setTimeout(r, 450));
      const r = o.line[step + 1];
      const reply = chess.move({ from: r.slice(0, 2), to: r.slice(2, 4), promotion: r[4] });
      stepFen.current = chess.fen();
      setFen(chess.fen());
      setLastMove([reply.from as Key, reply.to as Key]);
      setStep(step + 2);
      setMessage(`Richtig! Der Gegner antwortet mit ${toGermanSan(reply.san)}. Wie geht es weiter?`);
      setPhase('solving');
      return;
    }

    // Anderer Zug: Matt ist immer richtig, sonst ggf. mit der Engine prüfen, ob er fast gleich gut ist
    let acceptable = chess.isCheckmate();
    if (!acceptable && o.checkAlternative) {
      setPhase('checking');
      setMessage('Prüfe deinen Zug …');
      acceptable = await o.checkAlternative(stepFen.current, chess.fen(), me);
    }
    if (acceptable) {
      await o.onAttempt?.(uci, true, tryNo, ms);
      setMessage(null);
      await finish(true, tryNo, toGermanSan(mv.san));
      return;
    }
    await o.onAttempt?.(uci, false, tryNo, ms);
    setTries(tryNo);
    if (step === 0 && !wrong) setWrong(uci);
    if (tryNo < 2) {
      setMessage(`${toGermanSan(mv.san)} ist nicht der beste Zug. Versuch es noch einmal.`);
      setPhase('reply');
      window.setTimeout(() => {
        setFen(stepFen.current);
        setLastMove(step === 0 ? introMove : undefined);
        setPhase('solving');
      }, 700);
    } else {
      setMessage(null);
      await finish(false, tryNo);
    }
  }

  const bad = o.badArrow ?? wrong;
  const config = useMemo<Config>(() => {
    const shapes: DrawShape[] = [];
    let shown = fen;
    let last = lastMove;
    if (variation) {
      shown = variation.step === 0 ? o.fen : variation.moves[variation.step - 1].after;
      const lm = variation.step > 0 ? variation.moves[variation.step - 1] : undefined;
      last = lm ? [lm.from as Key, lm.to as Key] : undefined;
      const next = variation.moves[variation.step];
      if (next) shapes.push({ orig: next.from as Key, dest: next.to as Key, brush: 'good' });
    } else if (finished && fen === o.fen) {
      if (bad && bad !== o.line[0]) shapes.push({ orig: keys(bad)[0], dest: keys(bad)[1], brush: 'bad' });
      shapes.push({ orig: keys(o.line[0])[0], dest: keys(o.line[0])[1], brush: 'good' });
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
  }, [fen, lastMove, phase, variation, finished, o.fen, o.line, bad, me]);

  return {
    me,
    config,
    onMove,
    phase,
    finished,
    tries,
    message,
    alt,
    variation,
    bestSan: playLine(o.fen, [o.line[0]])[0]?.san,
    /** Variante bzw. Lösung ab der Puzzle-Stellung zeigen */
    showLine: (uci: string[]) => setVariation({ moves: playLine(o.fen, uci), step: 1 }),
    stepVariation: (s: number) => setVariation((v) => (v ? { ...v, step: Math.max(0, Math.min(v.moves.length, s)) } : v)),
    closeVariation: () => setVariation(null),
  };
}
