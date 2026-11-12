import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icon, type IconName } from '../components/Icons';
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
import { playLine } from '../analysis/explain';
import { pov, povChances, toPercent } from '../analysis/rules';
import { EvalBar } from '../components/EvalBar';
import { EvalChart } from '../components/EvalChart';
import { classText, ErrorCard, explainMove, markSym, moveNumber, VariationCard } from '../components/ErrorExplain';
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

export function GameViewPage({ id, ply }: { id: string; ply?: number }) {
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
  return <GameView key={`${game.id}:${ply ?? 0}`} game={game} initialPly={ply ?? 0} />;
}

function GameView({ game, initialPly }: { game: GameRecord; initialPly: number }) {
  const parsed = useMemo(() => parse(game.pgn), [game.pgn]);
  const total = parsed?.moves.length ?? 0;
  const fens = useMemo(() => (parsed ? [parsed.startFen, ...parsed.moves.map((m) => m.after)] : []), [parsed]);
  // Start bei der Grundstellung (vor Zug 1)
  const [ply, setPly] = useState(Math.min(initialPly, parsed?.moves.length ?? 0));
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
  const [tab, setTab] = useState<Tab>('fehler');

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

  const errorCount = errors.length;
  const pickTab = (t: Tab) => setTab(t);

  return (
    <div className={`analysis-layout ${variation ? 'in-variation' : ''}`}>
      <section className="board-col">
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
        <div className="board-controls">
          <NavControls ply={ply} last={total} onGo={goTo} />
          {done && (
            <button
              className="btn btn-primary next-error"
              onClick={() => {
                if (nextError) {
                  goTo(nextError.ply - 1);
                  pickTab('fehler');
                }
              }}
              disabled={!nextError}
              data-testid="next-error"
            >
              <Icon name="flag" size={18} />
              {nextError ? 'Nächster Fehler' : errorCount ? 'Kein weiterer Fehler' : 'Keine Fehler'}
            </button>
          )}
        </div>
      </section>

      <aside className="side-panel" aria-label="Analyse">
        <header className="side-head">
          <a className="icon-link back" href={href({ page: 'partien' })} aria-label="Alle Partien" title="Alle Partien">
            <Icon name="prev" size={20} />
          </a>
          <div className="side-title" data-testid="game-header">
            <span className={`res-badge res-${game.myResult ?? 'neutral'}`}>{headline}</span>
            <div>
              <strong>
                {scoreText(game.result)} · durch {terminationText[game.termination]}
              </strong>
              <span className="side-meta">{meta}</span>
              {(game.opening || game.eco) && <span className="side-meta">{[game.eco, game.opening].filter(Boolean).join(' · ')}</span>}
            </div>
          </div>
          <MoreMenu
            items={[
              { label: 'Brett drehen', icon: 'flip', onClick: () => setOrientation(other) },
              { label: 'PGN exportieren', icon: 'download', onClick: exportPgn },
              ...(game.source === 'chesscom' && game.externalId ? [{ label: 'Auf Chess.com öffnen', icon: 'external' as const, href: game.externalId }] : []),
            ]}
          />
        </header>

        <div className="tabs" role="tablist" aria-label="Ansicht">
          {(
            [
              ['fehler', 'Fehler'],
              ['zuege', 'Züge'],
              ['verlauf', 'Verlauf'],
            ] as [Tab, string][]
          ).map(([t, label]) => (
            <button key={t} role="tab" aria-selected={tab === t} className="tab" onClick={() => pickTab(t)} data-testid={`tab-${t}`}>
              {label}
              {t === 'fehler' && errorCount > 0 && <span className="tab-count">{errorCount}</span>}
            </button>
          ))}
        </div>

        <div className="tab-body" role="tabpanel">
          {tab === 'fehler' && (
            <>
              {!done && <AnalysisBox game={game} analysis={analysis} />}
              {done && variation && (
                <VariationCard fen={fens[variation.base]} moves={variation.moves} step={variation.step} onStep={stepVariation} onClose={() => setVariation(null)} />
              )}
              {done && !variation && upcoming && (
                <ErrorCard
                  move={upcoming}
                  moveLabel={labels[upcoming.ply - 1]}
                  explanation={explainMove(upcoming, fens, done, parsed.moves[upcoming.ply - 2])}
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
              {done && !variation && !upcoming && (
                <>
                  {!justPlayed && <AnalysisBox game={game} analysis={analysis} />}
                  <ErrorList moves={errors} labels={labels} current={ply} onPick={(m) => goTo(m.ply - 1)} />
                </>
              )}
              {done && (
                <button className="btn btn-small first-error" onClick={() => firstError && goTo(firstError.ply - 1)} disabled={!firstError} data-testid="first-error">
                  {firstError ? 'Zum ersten Fehler' : 'Keine Fehler gefunden'}
                </button>
              )}
            </>
          )}
          {tab === 'zuege' && <MoveList moves={parsed.moves.map((m) => m.san)} currentPly={ply} onSelect={goTo} marks={marks} />}
          {tab === 'verlauf' && (
            <div className="history-tab">
              {done ? (
                <>
                  <div className="eval-readout" data-testid="eval-readout">
                    <span>{variation ? 'Bewertung vor der Variante' : 'Bewertung'}</span>
                    <strong>{done.evals[evalIndex] ? evalLabel(done.evals[evalIndex]!, fens[evalIndex]) : '–'}</strong>
                    {whiteValues[evalIndex] !== null && <span>· Gewinnchance Weiß {Math.round(whiteValues[evalIndex]!)} %</span>}
                  </div>
                  <EvalChart values={whiteValues} marks={marks} labels={labels} current={evalIndex} onSelect={goTo} />
                  <AnalysisBox game={game} analysis={analysis} />
                </>
              ) : (
                <AnalysisBox game={game} analysis={analysis} />
              )}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

type Tab = 'fehler' | 'zuege' | 'verlauf';

/** Liste meiner Fehler und Patzer zum Anspringen */
function ErrorList({ moves, labels, current, onPick }: { moves: MoveAnalysis[]; labels: string[]; current: number; onPick: (m: MoveAnalysis) => void }) {
  if (moves.length === 0) return null;
  return (
    <ol className="error-list" data-testid="error-list">
      {moves.map((m) => (
        <li key={m.ply}>
          <button className={`error-item note-${m.class} ${current === m.ply - 1 ? 'is-current' : ''}`} onClick={() => onPick(m)}>
            <span className={`class-dot dot-${m.class}`} aria-hidden />
            <strong>{labels[m.ply - 1]}</strong>
            <span>{classText[m.class!]}</span>
            {m.hanging && <span className="error-tag">Figur eingestellt</span>}
            {m.allowedMate && <span className="error-tag">Matt zugelassen</span>}
            {m.timeTrouble && <span className="error-tag">Zeitnot</span>}
          </button>
        </li>
      ))}
    </ol>
  );
}

/** „…“-Menü für Nebenaktionen */
function MoreMenu({ items }: { items: { label: string; icon: IconName; onClick?: () => void; href?: string }[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);
  return (
    <div className="more-menu" ref={ref}>
      <button className="icon-link" aria-label="Weitere Aktionen" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)} data-testid="more-menu">
        <Icon name="more" size={22} />
      </button>
      {open && (
        <div className="menu" role="menu">
          {items.map((it) =>
            it.href ? (
              <a key={it.label} role="menuitem" className="menu-item" href={it.href} target="_blank" rel="noreferrer" onClick={() => setOpen(false)}>
                <Icon name={it.icon} size={18} /> {it.label}
              </a>
            ) : (
              <button
                key={it.label}
                role="menuitem"
                className="menu-item"
                onClick={() => {
                  it.onClick?.();
                  setOpen(false);
                }}
              >
                <Icon name={it.icon} size={18} /> {it.label}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
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

