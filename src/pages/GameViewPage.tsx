import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowUpDown, ChevronLeft, Download, Ellipsis, ExternalLink, Flag, NotebookPen } from 'lucide-react';
import { ResultMark } from '../components/GameRow';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
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
import { classDot, classText, ErrorCard, explainMove, markSym, moveNumber, VariationCard } from '../components/ErrorExplain';
import { summaryText } from '../analysis/analyze';
import { analysisQueue } from '../analysis/queue';
import { useQueueState } from '../analysis/useQueue';
import { toGermanSan } from '../chess/game';
import { moveNoun } from '../chess/moveWords';
import { useLive } from '../db/useLive';
import { href } from '../app/router';
import { hasMoves, OCCASION_LABELS, REASON_LABELS } from '../db/boardGames';

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
  if (game === undefined) return <p className="text-muted-foreground">Lädt …</p>;
  if (game === null)
    return (
      <div className="flex flex-col items-start gap-3 px-3.5">
        <p className="text-muted-foreground">Diese Partie gibt es nicht (mehr).</p>
        <a className={buttonVariants({ variant: 'outline' })} href={href({ page: 'partien' })}>
          Zur Partienliste
        </a>
      </div>
    );
  // Brett-Eintrag ohne Züge: nichts zum Ansehen → Eintrag bearbeiten
  if (game.source === 'brett' && !hasMoves(game)) {
    window.location.replace(href({ page: 'brett', id: game.id }));
    return null;
  }
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
        e.stopPropagation();
        return;
      }
      const map: Record<string, number> = { ArrowLeft: ply - 1, ArrowRight: ply + 1, ArrowUp: 0, Home: 0, ArrowDown: total, End: total };
      if (e.key in map) {
        e.preventDefault();
        // Pfeiltasten blättern immer durch die Züge – auch wenn gerade ein Reiter den Fokus hat
        e.stopPropagation();
        goTo(map[e.key]);
      }
    }
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
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
      <div className="flex flex-col items-start gap-3 px-3.5">
        <p className="text-muted-foreground">Die Partie konnte nicht gelesen werden.</p>
        <a className={buttonVariants({ variant: 'outline' })} href={href({ page: 'partien' })}>
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
    .join(', ');

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
    <div className={cn('analysis-layout grid w-full animate-in grid-cols-1 items-start gap-3 fade-in-0 md:w-auto md:grid-cols-[auto_420px] md:gap-7', variation && 'in-variation')}>
      <section className="flex flex-col gap-0.5 md:gap-1.5">
        <div className="max-md:px-3.5 md:pl-[calc(var(--evalbar)+10px)]">{bar(other(orientation))}</div>
        <div className="board-area relative flex max-md:flex-col md:gap-2.5">
          <EvalBar
            white={done ? whiteValues[evalIndex] : null}
            label={done?.evals[evalIndex] ? evalLabel(done.evals[evalIndex]!, fens[evalIndex]) : null}
            orientation={orientation}
          />
          <Board config={config} onMove={() => {}} />
          {variation && (
            <Badge className="variation-badge pointer-events-none absolute top-2.5 right-2.5 z-10 bg-brass text-brass-foreground max-md:top-8">Variante</Badge>
          )}
        </div>
        <div className="max-md:px-3.5 md:pl-[calc(var(--evalbar)+10px)]">{bar(orientation)}</div>
        <div className="grid grid-cols-4 gap-2 max-md:px-3 max-md:pt-1.5 md:grid-cols-[repeat(4,54px)_1fr] md:pl-[calc(var(--evalbar)+10px)]">
          <NavControls ply={ply} last={total} onGo={goTo} className="contents" />
          {done && (
            <Button
              size="lg"
              className="h-12 text-[15px] max-md:col-span-4"
              onClick={() => {
                if (nextError) {
                  goTo(nextError.ply - 1);
                  pickTab('fehler');
                }
              }}
              disabled={!nextError}
              data-testid="next-error"
            >
              <Flag data-icon="inline-start" />
              {nextError ? 'Nächster Fehler' : errorCount ? 'Kein weiterer Fehler' : 'Keine Fehler'}
            </Button>
          )}
        </div>
      </section>

      <section className="side-panel flex flex-col overflow-hidden max-md:mx-4 max-md:mt-3 max-md:border-t md:h-(--side-h) md:min-h-[460px] md:border-l md:pl-7" aria-label="Analyse">
        <header className="flex items-start gap-2.5 pt-3 pb-3 md:pt-0">
          <a
            className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }), '-ml-2 shrink-0 text-muted-foreground max-md:hidden')}
            href={href({ page: 'partien' })}
            aria-label="Alle Partien"
            title="Alle Partien"
          >
            <ChevronLeft />
          </a>
          <div className="flex min-w-0 flex-1 items-start gap-2.5" data-testid="game-header">
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="flex flex-wrap items-baseline gap-x-2.5">
                <ResultMark result={game.myResult} className="font-heading text-[28px] leading-tight">
                  {headline}
                </ResultMark>
                <span className="text-[15px] text-muted-foreground">
                  {scoreText(game.result)} durch {terminationText[game.termination]}
                </span>
              </span>
              <span className="truncate text-[15px] text-muted-foreground max-md:whitespace-nowrap md:whitespace-normal">{meta}</span>
              {game.board && (
                <span className="text-[15px] text-muted-foreground" data-testid="board-info">
                  {[OCCASION_LABELS[game.board.occasion], ...game.board.reasons.map((r) => REASON_LABELS[r])].join(', ')}
                  {game.board.note && <> – „{game.board.note}“</>}
                </span>
              )}
              {(game.opening || game.eco) && (
                <span className="truncate text-[15px] text-muted-foreground max-md:whitespace-nowrap md:whitespace-normal">
                  {[game.eco, game.opening].filter(Boolean).join(', ')}
                </span>
              )}
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="text-muted-foreground" aria-label="Weitere Aktionen" data-testid="more-menu" />}>
              <Ellipsis />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-56">
              <DropdownMenuItem onClick={() => setOrientation(other)}>
                <ArrowUpDown /> Brett drehen
              </DropdownMenuItem>
              <DropdownMenuItem onClick={exportPgn}>
                <Download /> PGN exportieren
              </DropdownMenuItem>
              {game.source === 'brett' && (
                <DropdownMenuItem onClick={() => (window.location.hash = href({ page: 'brett', id: game.id }))}>
                  <NotebookPen /> Brett-Eintrag bearbeiten
                </DropdownMenuItem>
              )}
              {game.source === 'chesscom' && game.externalId && (
                <DropdownMenuItem onClick={() => window.open(game.externalId, '_blank', 'noreferrer')}>
                  <ExternalLink /> Auf Chess.com öffnen
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        <Tabs value={tab} onValueChange={(v) => pickTab(v as Tab)} className="min-h-0 flex-1 gap-0">
          <TabsList variant="line" className="h-11 w-full justify-start border-b px-0" aria-label="Ansicht">
            <TabsTrigger value="fehler" className="flex-none px-3 text-[15px]" data-testid="tab-fehler">
              Fehler
              {errorCount > 0 && <span className="font-normal text-muted-foreground tabular-nums">{errorCount}</span>}
            </TabsTrigger>
            <TabsTrigger value="zuege" className="flex-none px-3 text-[15px]" data-testid="tab-zuege">
              Züge
            </TabsTrigger>
            <TabsTrigger value="verlauf" className="flex-none px-3 text-[15px]" data-testid="tab-verlauf">
              Verlauf
            </TabsTrigger>
          </TabsList>

          <TabsContent value="fehler" className="flex min-h-0 animate-in flex-col gap-4 overflow-y-auto py-4 pr-1 text-base fade-in-0">
            {!done && <AnalysisBox game={game} analysis={analysis} />}
            {done && variation && (
              <VariationCard fen={fens[variation.base]} moves={variation.moves} step={variation.step} onStep={stepVariation} onClose={() => setVariation(null)} />
            )}
            {done && !variation && upcoming && (
              <ErrorCard
                move={upcoming}
                moveLabel={labels[upcoming.ply - 1]}
                fenBefore={fens[upcoming.ply - 1]}
                explanation={explainMove(upcoming, fens, done, parsed.moves[upcoming.ply - 2])}
                canShowLine={!!(done.evals[upcoming.ply - 1]?.pv?.length || upcoming.best)}
                onShowLine={() => showVariation(upcoming)}
              />
            )}
            {done && !variation && !upcoming && justPlayed && (
              <p
                className="flex flex-wrap items-center gap-x-2 gap-y-1"
                data-testid="move-note"
              >
                <span className={cn('size-2 rounded-full', classDot[justPlayed.class!])} aria-hidden />
                <strong>
                  {labels[justPlayed.ply - 1]} {classText[justPlayed.class!]}
                </strong>
                <span className="text-muted-foreground">({moveNoun(parsed.moves[justPlayed.ply - 1])})</span>
                <button className="font-semibold text-brass-text underline" onClick={() => goTo(justPlayed.ply - 1)}>
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
              <Button variant="outline" size="sm" className="self-start" onClick={() => firstError && goTo(firstError.ply - 1)} disabled={!firstError} data-testid="first-error">
                {firstError ? 'Zum ersten Fehler' : 'Keine Fehler gefunden'}
              </Button>
            )}
          </TabsContent>
          <TabsContent value="zuege" className="flex min-h-0 flex-col overflow-y-auto">
            <MoveList moves={parsed.moves.map((m) => m.san)} currentPly={ply} onSelect={goTo} marks={marks} />
          </TabsContent>
          <TabsContent value="verlauf" className="flex min-h-0 animate-in flex-col gap-4 overflow-y-auto py-4 pr-1 fade-in-0">
            {done ? (
              <>
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[15px] text-muted-foreground tabular-nums" data-testid="eval-readout">
                  <span>{variation ? 'Bewertung vor der Variante' : 'Bewertung'}</span>
                  <strong className="text-2xl text-foreground">{done.evals[evalIndex] ? evalLabel(done.evals[evalIndex]!, fens[evalIndex]) : '–'}</strong>
                  {whiteValues[evalIndex] !== null && <span>· Gewinnchance Weiß {Math.round(whiteValues[evalIndex]!)} %</span>}
                </div>
                <EvalChart values={whiteValues} marks={marks} labels={labels} current={evalIndex} onSelect={goTo} />
                <AnalysisBox game={game} analysis={analysis} />
              </>
            ) : (
              <AnalysisBox game={game} analysis={analysis} />
            )}
          </TabsContent>
        </Tabs>
      </section>
    </div>
  );
}

type Tab = 'fehler' | 'zuege' | 'verlauf';

/** Liste meiner Fehler und Patzer zum Anspringen */
function ErrorList({ moves, labels, current, onPick }: { moves: MoveAnalysis[]; labels: string[]; current: number; onPick: (m: MoveAnalysis) => void }) {
  if (moves.length === 0) return null;
  return (
    <ol className="m-0 flex list-none flex-col p-0" data-testid="error-list">
      {moves.map((m) => (
        <li key={m.ply} className="border-t first:border-t-0">
          <button
            className={cn(
              '-mx-2 flex w-[calc(100%+1rem)] flex-wrap items-center gap-x-2.5 gap-y-1 rounded-md px-2 py-2.5 text-left transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
              current === m.ply - 1 && 'bg-muted',
            )}
            onClick={() => onPick(m)}
          >
            <span className={cn('size-2 shrink-0 rounded-full', classDot[m.class!])} aria-hidden />
            <strong className="tabular-nums">{labels[m.ply - 1]}</strong>
            <span className="text-muted-foreground">
              {[classText[m.class!], m.hanging && 'Figur eingestellt', m.allowedMate && 'Matt zugelassen', m.timeTrouble && 'Zeitnot'].filter(Boolean).join(', ')}
            </span>
          </button>
        </li>
      ))}
    </ol>
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
      <div className="flex flex-col gap-1 border-t pt-3" data-testid="analysis-summary">
        {sides.map((s) => (
          <p key={s}>
            <strong>{game.myColor ? 'Deine Fehler' : game[s].name}:</strong> {summaryText(analysis.summary![s])}
          </p>
        ))}
        <span className="text-sm text-muted-foreground">
          Stockfish, {depth}
          {analysis.baseTime === null && game.timeClass === 'daily' ? ', Fernschach: keine Zeitnot-Auswertung' : ''}
        </span>
      </div>
    );
  }
  if (analysis?.status === 'failed') return <p className="border-t pt-3 text-muted-foreground">Diese Partie konnte nicht analysiert werden.</p>;
  const running = queue.current?.gameId === game.id;
  return (
    <div className="flex flex-col items-start gap-2 text-muted-foreground" data-testid="analysis-pending">
      {running ? (
        <span>
          Wird gerade analysiert … Stellung {Math.min(queue.current!.position + 1, queue.current!.positions)} von {queue.current!.positions}
        </span>
      ) : (
        <>
          <span>Noch nicht analysiert.</span>
          <Button variant="outline" size="sm" onClick={() => analysisQueue.prioritize(game.id)}>
            Als Nächstes analysieren
          </Button>
          {queue.status === 'paused' && <span className="text-sm">Die Analyse ist pausiert (Weiter unter „Partien“).</span>}
        </>
      )}
    </div>
  );
}

