import { useCallback, useEffect, useMemo, useState } from 'react';
import { Chess, type Move } from 'chess.js';
import type { Config } from '@lichess-org/chessground/config';
import type { Color, Key } from '@lichess-org/chessground/types';
import type { DrawShape } from '@lichess-org/chessground/draw';
import { Board } from '../components/Board';
import { MoveList } from '../components/MoveList';
import { NavControls } from '../components/NavControls';
import { PlayerBar } from '../components/PlayerBar';
import { materialInfo } from '../chess/material';
import {
  baseSeconds,
  formatClock,
  formatDateTime,
  formatTimeControl,
  myResultText,
  parseClock,
  scoreText,
  sourceText,
  terminationText,
} from '../chess/format';
import { getGame } from '../db/games';
import { downloadFile } from '../db/backup';
import { db, type AnalysisRecord, type GameRecord, type MoveAnalysis, type MoveClass, type PositionEval, type Side } from '../db/schema';
import { explain, playLine, winWords, type Explanation } from '../analysis/explain';
import { RichText } from '../components/RichText';
import { pov, povChances, toPercent } from '../analysis/rules';
import { EvalBar } from '../components/EvalBar';
import { EvalChart } from '../components/EvalChart';
import { summaryText } from '../analysis/analyze';
import { analysisQueue } from '../analysis/queue';
import { useQueueState } from '../analysis/useQueue';
import { toGermanSan } from '../chess/game';
import { useLive } from '../db/useLive';
import { href } from '../app/router';

const other = (c: Color): Color => (c === 'white' ? 'black' : 'white');

type Parsed = { chess: Chess; moves: Move[]; startFen: string; clocks: (number | null)[] };

function parse(pgn: string): Parsed | null {
  try {
    const chess = new Chess();
    chess.loadPgn(pgn);
    const moves = chess.history({ verbose: true });
    const comments = new Map(chess.getComments().map((c) => [c.fen, c.comment]));
    return {
      chess,
      moves,
      startFen: moves[0]?.before ?? chess.fen(),
      clocks: moves.map((m) => parseClock(comments.get(m.after))),
    };
  } catch {
    return null;
  }
}

/** Restzeit einer Farbe in der angezeigten Stellung: letzte Angabe nach einem eigenen Zug, sonst Grundzeit */
function clockAt(parsed: Parsed, ply: number, color: Color, base: number | null): string | undefined {
  const parity = color === 'white' ? 'w' : 'b';
  for (let i = ply - 1; i >= 0; i--) {
    if (parsed.moves[i].color === parity && parsed.clocks[i] !== null) return formatClock(parsed.clocks[i]!);
  }
  return parsed.clocks.some((c) => c !== null) && base !== null ? formatClock(base) : undefined;
}

export function GameViewPage({ id }: { id: string }) {
  const game = useLive(() => getGame(id).then((g) => g ?? null), [id]);
  if (game === undefined) return <p className="page-note">Lädt …</p>;
  if (game === null)
    return (
      <div className="page">
        <p className="page-note">Diese Partie gibt es nicht (mehr).</p>
        <a className="btn btn-inline" href={href({ page: 'partien' })}>
          Zur Partienliste
        </a>
      </div>
    );
  return <GameView key={game.id} game={game} />;
}

function GameView({ game }: { game: GameRecord }) {
  const parsed = useMemo(() => parse(game.pgn), [game.pgn]);
  const total = parsed?.moves.length ?? 0;
  const fens = useMemo(() => (parsed ? [parsed.startFen, ...parsed.moves.map((m) => m.after)] : []), [parsed]);
  // Start bei der Grundstellung (vor Zug 1)
  const [ply, setPly] = useState(0);
  /** Engine-Variante, die gerade am Brett gezeigt wird (nicht gespielt) */
  const [variation, setVariation] = useState<{ base: number; moves: Move[]; step: number } | null>(null);
  const analysis = useLive(() => db.analyses.get(game.id).then((a) => a ?? null), [game.id]);
  const done = analysis?.status === 'done' && analysis.sides ? analysis : null;
  // Markiert werden meine Züge; bei „Gegen Freund“ (keine eigene Farbe) die beider Seiten
  const markedSides: Side[] = game.myColor ? [game.myColor] : ['white', 'black'];
  const markedMoves: MoveAnalysis[] = done ? markedSides.flatMap((s) => done.sides![s]).sort((a, b) => a.ply - b.ply) : [];
  const marks: Record<number, MoveClass> = {};
  for (const m of markedMoves) if (m.class) marks[m.ply] = m.class;
  const errors = markedMoves.filter((m) => m.class === 'mistake' || m.class === 'blunder');
  const firstError = errors[0];
  const nextError = errors.find((m) => m.ply - 1 > ply);
  const [orientation, setOrientation] = useState<Color>(game.myColor ?? 'white');

  /** Markierter Zug, dessen Stellung davor gerade gezeigt wird (dort stehen Pfeile und Erklärung) */
  const upcoming = markedMoves.find((m) => m.ply === ply + 1 && m.class);
  /** Markierter Zug, nach dem gerade die Stellung gezeigt wird */
  const justPlayed = markedMoves.find((m) => m.ply === ply && m.class);

  const goTo = useCallback(
    (p: number) => {
      setVariation(null);
      setPly(Math.max(0, Math.min(total, p)));
    },
    [total],
  );
  const stepVariation = (to: number) => setVariation((v) => (v ? { ...v, step: Math.max(0, Math.min(v.moves.length, to)) } : v));

  // Fehlende/zu kurze Hauptvarianten nur für die markierten Stellungen nachrechnen
  const errorPositions = markedMoves.map((m) => m.ply - 1).join(',');
  useEffect(() => {
    if (!done || !errorPositions) return;
    const wanted: Record<number, string> = {};
    for (const i of errorPositions.split(',').map(Number)) wanted[i] = fens[i];
    void analysisQueue.ensurePv(game.id, wanted);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!done, errorPositions, game.id]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (variation) {
        const map: Record<string, number> = { ArrowLeft: variation.step - 1, ArrowRight: variation.step + 1, ArrowUp: 0, Home: 0, ArrowDown: variation.moves.length, End: variation.moves.length };
        if (e.key === 'Escape') setVariation(null);
        else if (e.key in map) stepVariation(map[e.key]);
        else return;
        e.preventDefault();
        return;
      }
      const map: Record<string, number> = { ArrowLeft: ply - 1, ArrowRight: ply + 1, ArrowUp: 0, Home: 0, ArrowDown: total, End: total };
      if (e.key in map) {
        e.preventDefault();
        goTo(map[e.key]);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ply, total, goTo, variation]);

  const config = useMemo<Config>(() => {
    let fen: string;
    let last: { from: string; to: string } | undefined;
    const shapes: DrawShape[] = [];
    if (variation) {
      fen = variation.step === 0 ? fens[variation.base] : variation.moves[variation.step - 1].after;
      last = variation.step > 0 ? variation.moves[variation.step - 1] : undefined;
      const next = variation.moves[variation.step];
      if (next) shapes.push({ orig: next.from, dest: next.to, brush: 'good' });
    } else {
      fen = fens[ply] ?? new Chess().fen();
      last = ply > 0 ? parsed!.moves[ply - 1] : undefined;
      // Vor einem markierten Zug: rot = gespielt, grün = besser
      if (upcoming) {
        shapes.push({ orig: upcoming.uci.slice(0, 2) as Key, dest: upcoming.uci.slice(2, 4) as Key, brush: 'bad' });
        if (upcoming.best && upcoming.best !== upcoming.uci) shapes.push({ orig: upcoming.best.slice(0, 2) as Key, dest: upcoming.best.slice(2, 4) as Key, brush: 'good' });
      }
    }
    const shown = new Chess(fen);
    return {
      fen: shown.fen(),
      orientation,
      turnColor: shown.turn() === 'w' ? 'white' : 'black',
      lastMove: last ? [last.from as Key, last.to as Key] : undefined,
      check: shown.inCheck() ? (shown.turn() === 'w' ? 'white' : 'black') : false,
      movable: { color: undefined, dests: new Map() },
      drawable: { autoShapes: shapes },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fens, ply, orientation, variation, upcoming?.ply, upcoming?.best]);

  if (!parsed) {
    return (
      <div className="page">
        <p className="page-note">Die Partie konnte nicht gelesen werden.</p>
        <a className="btn btn-inline" href={href({ page: 'partien' })}>
          Zur Partienliste
        </a>
      </div>
    );
  }

  const material = materialInfo(parsed.chess, ply);
  const base = baseSeconds(game.timeControl);
  const bar = (color: Color) => {
    const p = game[color];
    const detail = p.rating ? String(p.rating) : p.detail;
    return (
      <PlayerBar
        player={{ name: p.name, detail, isEngine: !!p.isEngine }}
        color={color}
        captured={material.captured[color]}
        advantage={material.advantage[color]}
        active={false}
        clock={clockAt(parsed, ply, color, base)}
      />
    );
  };

  const headline = game.myResult ? myResultText[game.myResult] : game.result === '1/2-1/2' ? 'Remis' : game.result === '1-0' ? `${game.white.name} gewinnt` : `${game.black.name} gewinnt`;
  const meta = [formatDateTime(game.date), sourceText[game.source], game.timeControl ? formatTimeControl(game.timeControl) : null]
    .filter(Boolean)
    .join(' · ');

  // Bewertung je Stellung (Weiß-Sicht, 0–100 %) für Balken und Kurve
  const whiteValues: (number | null)[] = fens.map((f, i) => (done?.evals[i] ? whitePercent(done.evals[i]!, f) : null));
  const evalIndex = variation ? variation.base : ply;
  const labels = parsed.moves.map((m, i) => `${moveNumber(i + 1, parsed.startFen)}${toGermanSan(m.san)}${marks[i + 1] ? markSym[marks[i + 1]] : ''}`);

  function exportPgn() {
    const name = `${game.white.name}-${game.black.name}-${new Date(game.date).toISOString().slice(0, 10)}`.replace(/[^\p{L}\p{N}_-]+/gu, '_');
    downloadFile(`${name}.pgn`, game.pgn.endsWith('\n') ? game.pgn : `${game.pgn}\n`, 'application/x-chess-pgn');
  }

  function showVariation(m: MoveAnalysis) {
    const pv = done?.evals[m.ply - 1]?.pv ?? (m.best ? [m.best] : []);
    const moves = playLine(fens[m.ply - 1], pv.slice(0, 6));
    if (moves.length) {
      setPly(m.ply - 1);
      setVariation({ base: m.ply - 1, moves, step: 1 });
    }
  }

  return (
    <div className={`play has-evalbar ${variation ? 'in-variation' : ''}`}>
      <section className="play-board">
        {bar(other(orientation))}
        <div className="board-area board-with-bar">
          <EvalBar
            white={done ? whiteValues[evalIndex] : null}
            label={done?.evals[evalIndex] ? evalLabel(done.evals[evalIndex]!, fens[evalIndex]) : null}
            orientation={orientation}
          />
          <Board config={config} onMove={() => {}} />
          {variation && <span className="variation-badge">Variante</span>}
        </div>
        {bar(orientation)}
      </section>

      <aside className="play-side is-analysis">
        <a className="back-link" href={href({ page: 'partien' })}>
          ← Alle Partien
        </a>
        <div className={`result result-${game.myResult ?? 'neutral'}`} data-testid="game-header">
          <span className="result-score">{scoreText(game.result)}</span>
          <span className="result-headline">{headline}</span>
          <span className="result-detail">durch {terminationText[game.termination]}</span>
          <span className="result-meta">{meta}</span>
          {(game.opening || game.eco) && (
            <span className="result-meta">{[game.eco, game.opening].filter(Boolean).join(' · ')}</span>
          )}
        </div>

        <AnalysisBox game={game} analysis={analysis} />

        {done && variation && (
          <VariationCard
            fen={fens[variation.base]}
            moves={variation.moves}
            step={variation.step}
            onStep={stepVariation}
            onClose={() => setVariation(null)}
          />
        )}
        {done && !variation && upcoming && (
          <ErrorCard
            move={upcoming}
            moveLabel={labels[upcoming.ply - 1]}
            explanation={explainMove(upcoming, fens, done)}
            canShowLine={!!(done.evals[upcoming.ply - 1]?.pv?.length || upcoming.best)}
            onShowLine={() => showVariation(upcoming)}
          />
        )}
        {done && !variation && !upcoming && justPlayed && (
          <p className={`move-note note-${justPlayed.class}`} data-testid="move-note">
            <strong>
              {labels[justPlayed.ply - 1]} {classText[justPlayed.class!]}
            </strong>
            <button className="link-btn" onClick={() => goTo(justPlayed.ply - 1)}>
              Stellung davor mit Pfeilen und Erklärung
            </button>
          </p>
        )}

        <MoveList moves={parsed.moves.map((m) => m.san)} currentPly={ply} onSelect={goTo} marks={marks} />
        <NavControls ply={ply} last={total} onGo={goTo} />
        {done && (
          <>
            <div className="actions">
              <button className="btn" onClick={() => firstError && goTo(firstError.ply - 1)} disabled={!firstError} data-testid="first-error">
                {firstError ? 'Zum ersten Fehler' : 'Keine Fehler gefunden'}
              </button>
              {firstError && (
                <button className="btn" onClick={() => nextError && goTo(nextError.ply - 1)} disabled={!nextError} data-testid="next-error">
                  Nächster Fehler
                </button>
              )}
            </div>
            <div className="eval-readout" data-testid="eval-readout">
              <span>{variation ? 'Bewertung vor der Variante' : 'Bewertung'}</span>
              <strong>{done.evals[evalIndex] ? evalLabel(done.evals[evalIndex]!, fens[evalIndex]) : '–'}</strong>
              {whiteValues[evalIndex] !== null && <span>· Gewinnchance Weiß {Math.round(whiteValues[evalIndex]!)} %</span>}
            </div>
            <EvalChart values={whiteValues} marks={marks} labels={labels} current={evalIndex} onSelect={goTo} />
          </>
        )}

        <div className="actions">
          <button className="btn" onClick={() => setOrientation(other)}>
            Brett drehen
          </button>
          <button className="btn" onClick={exportPgn}>
            PGN exportieren
          </button>
        </div>
        {game.source === 'chesscom' && game.externalId && (
          <a className="text-link" href={game.externalId} target="_blank" rel="noreferrer">
            Auf Chess.com öffnen
          </a>
        )}
      </aside>
    </div>
  );
}

const markSym: Record<MoveClass, string> = { blunder: '??', mistake: '?', inaccuracy: '?!' };

/** „7. “ bzw. „7… “ für einen Halbzug */
function moveNumber(ply: number, startFen: string): string {
  const [, turn, , , , full] = startFen.split(' ');
  const offset = turn === 'b' ? 1 : 0;
  const index = ply - 1 + offset;
  const n = Number(full || 1) + Math.floor(index / 2);
  return index % 2 === 0 ? `${n}. ` : `${n}… `;
}

/** Gewinnchance für Weiß in Prozent; in einer Mattstellung ist die Seite am Zug matt */
function whitePercent(ev: PositionEval, fen: string): number {
  const whiteToMove = fen.split(' ')[1] === 'w';
  if (ev.mate === 0) return whiteToMove ? 0 : 100;
  return toPercent(povChances(pov(ev, 'white')));
}

/** „+0,9“, „−1,4“, „#3“ (Weiß setzt matt), „−#2“ */
function evalLabel(ev: PositionEval, fen: string): string {
  if (ev.mate === 0) return fen.split(' ')[1] === 'w' ? '0-1' : '1-0';
  if (ev.mate !== undefined) return ev.mate > 0 ? `#${ev.mate}` : `−#${-ev.mate}`;
  const v = (ev.cp ?? 0) / 100;
  return `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(1).replace('.', ',')}`;
}

function explainMove(m: MoveAnalysis, fens: string[], a: AnalysisRecord): Explanation {
  const mover: Side = new Chess(fens[m.ply - 1]).turn() === 'w' ? 'white' : 'black';
  const before = a.evals[m.ply - 1];
  const after = a.evals[m.ply];
  if (!before || !after) return { played: [], better: [], merke: null };
  return explain({
    fenBefore: fens[m.ply - 1],
    played: m.uci,
    bestPv: before.pv ?? (m.best ? [m.best] : []),
    replyPv: after.pv ?? [],
    before: pov(before, mover),
    after: pov(after, mover),
  });
}

const classText: Record<MoveClass, string> = { blunder: 'Patzer', mistake: 'Fehler', inaccuracy: 'Ungenauigkeit' };

/** Zusammenfassung der Analyse bzw. ihr Stand */
function AnalysisBox({ game, analysis }: { game: GameRecord; analysis: AnalysisRecord | null | undefined }) {
  const queue = useQueueState();
  if (analysis === undefined) return null;
  if (analysis?.status === 'done' && analysis.summary) {
    const sides: Side[] = game.myColor ? [game.myColor] : ['white', 'black'];
    const depth = 'depth' in analysis.limit ? `Tiefe ${analysis.limit.depth}` : `${analysis.limit.movetime} ms/Stellung`;
    return (
      <div className="analysis-box" data-testid="analysis-summary">
        {sides.map((s) => (
          <p key={s}>
            <strong>{game.myColor ? 'Deine Fehler' : game[s].name}:</strong> {summaryText(analysis.summary![s])}
          </p>
        ))}
        <span className="analysis-meta">
          Stockfish, {depth}
          {analysis.baseTime === null && game.timeClass === 'daily' ? ' · Fernschach: keine Zeitnot-Auswertung' : ''}
        </span>
      </div>
    );
  }
  if (analysis?.status === 'failed') return <div className="analysis-box">Diese Partie konnte nicht analysiert werden.</div>;
  const running = queue.current?.gameId === game.id;
  return (
    <div className="analysis-box is-pending" data-testid="analysis-pending">
      {running ? (
        <span>
          Wird gerade analysiert … Stellung {Math.min(queue.current!.position + 1, queue.current!.positions)} von {queue.current!.positions}
        </span>
      ) : (
        <>
          <span>Noch nicht analysiert.</span>
          <button className="btn btn-small" onClick={() => analysisQueue.prioritize(game.id)}>
            Als Nächstes analysieren
          </button>
          {queue.status === 'paused' && <span className="analysis-meta">Die Analyse ist pausiert (Weiter unter „Partien“).</span>}
        </>
      )}
    </div>
  );
}

/** Erklärung zu einem markierten Zug, gezeigt in der Stellung davor (mit Pfeilen am Brett) */
function ErrorCard({
  move,
  moveLabel,
  explanation,
  canShowLine,
  onShowLine,
}: {
  move: MoveAnalysis;
  moveLabel: string;
  explanation: Explanation;
  canShowLine: boolean;
  onShowLine: () => void;
}) {
  const tags = [move.hanging && 'Figur eingestellt', move.allowedMate && 'Matt zugelassen', move.missedMate && 'Matt übersehen', move.timeTrouble && 'in Zeitnot'].filter(Boolean);
  const san = toGermanSan(move.san);
  const best = move.bestSan ? toGermanSan(move.bestSan) : null;
  return (
    <section className={`error-card note-${move.class}`} data-testid="error-card" aria-label="Fehleranalyse">
      <header className="error-head">
        <strong>
          {moveLabel} – {classText[move.class!]}
        </strong>
        {tags.length > 0 && <span className="error-tags">{tags.join(' · ')}</span>}
        <span className="error-win" data-testid="win-words">
          {winSentence(move.winBefore, move.winAfter)} (Gewinnchance {Math.round(move.winBefore)} % → {Math.round(move.winAfter)} %)
        </span>
      </header>
      <p className="arrow-legend">
        <span className="arrow-key key-bad" aria-hidden /> dein Zug {san}
        {best && (
          <>
            <span className="arrow-key key-good" aria-hidden /> besser {best}
          </>
        )}
      </p>
      {explanation.played.length > 0 && (
        <div className="error-why">
          <span className="error-why-title">Warum {san} schlecht ist</span>
          <ul data-testid="explain-played">
            {explanation.played.map((item) => (
              <li key={item.text}>
                <RichText text={item.text} />
              </li>
            ))}
          </ul>
        </div>
      )}
      {best && explanation.better.length > 0 && (
        <div className="error-why">
          <span className="error-why-title">Warum {best} besser ist</span>
          <ul data-testid="explain-better">
            {explanation.better.map((item) => (
              <li key={item.text}>
                <RichText text={item.text} />
              </li>
            ))}
          </ul>
        </div>
      )}
      {explanation.merke && (
        <p className="merke" data-testid="merke">
          <strong>Merke:</strong> {explanation.merke}
        </p>
      )}
      {canShowLine && (
        <button className="btn btn-primary" onClick={onShowLine} data-testid="show-line">
          Beste Fortsetzung zeigen
        </button>
      )}
    </section>
  );
}

/** Engine-Variante Schritt für Schritt – deutlich als „nicht gespielt“ gekennzeichnet */
function VariationCard({ fen, moves, step, onStep, onClose }: { fen: string; moves: Move[]; step: number; onStep: (s: number) => void; onClose: () => void }) {
  const [, turn, , , , full] = fen.split(' ');
  let n = Number(full) || 1;
  let white = turn === 'w';
  return (
    <section className="variation-card" data-testid="variation" aria-label="Variante">
      <header className="variation-head">
        <strong>Variante (Engine)</strong>
        <span>nicht gespielt – so wäre es besser weitergegangen</span>
      </header>
      <ol className="variation-moves">
        {moves.map((m, i) => {
          const num = white ? `${n}.` : i === 0 ? `${n}…` : '';
          if (!white) n++;
          white = !white;
          return (
            <li key={i}>
              {num && <span className="movelist-num">{num}</span>}
              <button className={`movelist-move ${step === i + 1 ? 'is-current' : ''}`} onClick={() => onStep(i + 1)} data-testid="variation-move">
                {toGermanSan(m.san)}
              </button>
            </li>
          );
        })}
      </ol>
      <div className="nav-controls nav-controls-2">
        <button className="icon-btn" aria-label="Variante zurück" onClick={() => onStep(step - 1)} disabled={step === 0}>
          ‹
        </button>
        <button className="icon-btn" aria-label="Variante vor" onClick={() => onStep(step + 1)} disabled={step >= moves.length}>
          ›
        </button>
      </div>
      <button className="btn" onClick={onClose} data-testid="close-line">
        Zurück zur Partie
      </button>
    </section>
  );
}

/** „Vorher ausgeglichen, danach klar schlechter für dich“ */
function winSentence(before: number, after: number): string {
  const a = winWords(before);
  const b = winWords(after);
  const fmt = (w: string) => (w === 'ausgeglichen' || w === 'gewonnen' || w === 'verloren' ? w : `${w} für dich`);
  if (a === b) return `Die Stellung bleibt ${fmt(a)}`;
  return `Vorher ${fmt(a)}, danach ${fmt(b)}`;
}
