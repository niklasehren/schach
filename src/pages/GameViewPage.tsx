import { useCallback, useEffect, useMemo, useState } from 'react';
import { Chess, type Move } from 'chess.js';
import type { Config } from '@lichess-org/chessground/config';
import type { Color } from '@lichess-org/chessground/types';
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
import { db, type AnalysisRecord, type GameRecord, type MoveAnalysis, type MoveClass, type Side } from '../db/schema';
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
  // Start bei der Grundstellung (vor Zug 1)
  const [ply, setPly] = useState(0);
  const analysis = useLive(() => db.analyses.get(game.id).then((a) => a ?? null), [game.id]);
  const done = analysis?.status === 'done' && analysis.sides ? analysis : null;
  // Markiert werden meine Züge; bei „Gegen Freund“ (keine eigene Farbe) die beider Seiten
  const markedSides: Side[] = game.myColor ? [game.myColor] : ['white', 'black'];
  const markedMoves: MoveAnalysis[] = done ? markedSides.flatMap((s) => done.sides![s]).sort((a, b) => a.ply - b.ply) : [];
  const marks: Record<number, MoveClass> = {};
  for (const m of markedMoves) if (m.class) marks[m.ply] = m.class;
  const firstError = markedMoves.find((m) => m.class === 'mistake' || m.class === 'blunder');
  const [orientation, setOrientation] = useState<Color>(game.myColor ?? 'white');

  const goTo = useCallback((p: number) => setPly(Math.max(0, Math.min(total, p))), [total]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const map: Record<string, number> = { ArrowLeft: ply - 1, ArrowRight: ply + 1, ArrowUp: 0, Home: 0, ArrowDown: total, End: total };
      if (e.key in map) {
        e.preventDefault();
        goTo(map[e.key]);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ply, total, goTo]);

  const config = useMemo<Config>(() => {
    const fen = ply === 0 ? parsed?.startFen : parsed!.moves[ply - 1].after;
    const shown = new Chess(fen);
    const last = ply > 0 ? parsed!.moves[ply - 1] : undefined;
    return {
      fen: shown.fen(),
      orientation,
      turnColor: shown.turn() === 'w' ? 'white' : 'black',
      lastMove: last ? [last.from, last.to] : undefined,
      check: shown.inCheck() ? (shown.turn() === 'w' ? 'white' : 'black') : false,
      movable: { color: undefined, dests: new Map() },
    };
  }, [parsed, ply, orientation]);

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

  function exportPgn() {
    const name = `${game.white.name}-${game.black.name}-${new Date(game.date).toISOString().slice(0, 10)}`.replace(/[^\p{L}\p{N}_-]+/gu, '_');
    downloadFile(`${name}.pgn`, game.pgn.endsWith('\n') ? game.pgn : `${game.pgn}\n`, 'application/x-chess-pgn');
  }

  return (
    <div className="play">
      <section className="play-board">
        {bar(other(orientation))}
        <div className="board-area">
          <Board config={config} onMove={() => {}} />
        </div>
        {bar(orientation)}
      </section>

      <aside className="play-side">
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
        {done && (
          <MoveNote move={markedMoves.find((m) => m.ply === ply && m.class)} upcoming={markedMoves.find((m) => m.ply === ply + 1 && (m.class === 'mistake' || m.class === 'blunder'))} />
        )}

        <MoveList moves={parsed.moves.map((m) => m.san)} currentPly={ply} onSelect={goTo} marks={marks} />
        <NavControls ply={ply} last={total} onGo={goTo} />
        {done && (
          <button className="btn" onClick={() => firstError && goTo(firstError.ply - 1)} disabled={!firstError} data-testid="first-error">
            {firstError ? 'Zum ersten Fehler' : 'Keine Fehler gefunden'}
          </button>
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

/** Kurzer Hinweis zum angezeigten Zug (Pfeile und Kurve folgen in Block 6) */
function MoveNote({ move, upcoming }: { move?: MoveAnalysis; upcoming?: MoveAnalysis }) {
  if (move?.class) {
    const tags = [move.hanging && 'Figur eingestellt', move.allowedMate && 'Matt zugelassen', move.missedMate && 'Matt übersehen', move.timeTrouble && 'in Zeitnot']
      .filter(Boolean)
      .join(' · ');
    return (
      <p className={`move-note note-${move.class}`} data-testid="move-note">
        <strong>
          {toGermanSan(move.san)}: {classText[move.class]}
        </strong>
        {tags && ` · ${tags}`}
        {move.bestSan && <> · besser war {toGermanSan(move.bestSan)}</>}
        <span className="move-note-detail">
          Gewinnchance {Math.round(move.winBefore)} % → {Math.round(move.winAfter)} %
        </span>
      </p>
    );
  }
  if (upcoming?.class) {
    return (
      <p className="move-note" data-testid="move-note">
        Hier folgt {upcoming.class === 'blunder' ? 'ein Patzer' : 'ein Fehler'}. Finde zuerst selbst einen besseren Zug, dann einen Zug vor.
      </p>
    );
  }
  return null;
}
