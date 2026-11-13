import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import type { Config } from '@lichess-org/chessground/config';
import type { Color, Key } from '@lichess-org/chessground/types';
import { Board } from '../components/Board';
import { MoveList } from '../components/MoveList';
import { NavControls } from '../components/NavControls';
import { PlayerBar } from '../components/PlayerBar';
import { PromotionDialog } from '../components/PromotionDialog';
import { SetupPanel } from '../components/SetupPanel';
import { gameStatus, isPromotion, legalDests, turnColor, type PromotionPiece } from '../chess/game';
import { materialInfo } from '../chess/material';
import {
  createSession,
  loadSetup,
  resultFromStatus,
  resultScore,
  resultText,
  saveSetup,
  type GameResult,
  type GameSetup,
  type Player,
  type Session,
} from '../chess/session';
import { getEngine } from '../engine/stockfish';
import { buildAppGame, saveGame, setSetting } from '../db/games';
import { href } from '../app/router';
import { analysisQueue } from '../analysis/queue';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { strengthLabel, strengthLevels, strengthOptions } from '../engine/strength';

const other = (c: Color): Color => (c === 'white' ? 'black' : 'white');
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** active = Seite ist sichtbar. Die Seite bleibt beim Wechsel erhalten, damit eine laufende Partie nicht verloren geht. */
export function PlayPage({ active = true }: { active?: boolean }) {
  const [setup, setSetup] = useState<GameSetup>(loadSetup);
  const [session, setSession] = useState<Session | null>(null);
  const chess = useRef(new Chess());
  // chess.js ändert sich „innen“; dieser Zähler sagt React, dass neu gezeichnet werden muss
  const [version, setVersion] = useState(0);
  const [result, setResult] = useState<GameResult | null>(null);
  const [orientation, setOrientation] = useState<Color>('white');
  /** null = aktuelle Stellung, sonst angezeigter Halbzug beim Zurückblättern */
  const [viewPly, setViewPly] = useState<number | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<{ from: Key; to: Key } | null>(null);
  const [confirmResign, setConfirmResign] = useState(false);
  const [thinking, setThinking] = useState(false);
  /** Gespeicherte Partie (ID) bzw. Fehler beim Speichern */
  const [saved, setSaved] = useState<{ id?: string; error?: boolean } | null>(null);
  const savedSession = useRef<number | null>(null);

  const history = chess.current.history({ verbose: true });
  const ply = viewPly ?? history.length;
  const isLive = ply === history.length;
  const turn = turnColor(chess.current);
  const humanToMove = !!session && !result && !session.players[turn].isEngine;

  const refresh = () => setVersion((v) => v + 1);

  // Vor der Partie zeigt das Brett schon die gewählte Seite unten
  const boardOrientation: Color = session
    ? orientation
    : setup.mode === 'computer' && setup.colorChoice === 'black'
      ? 'black'
      : 'white';

  // Nach jedem Zug: Partieende prüfen
  useEffect(() => {
    if (!session || result) return;
    const r = resultFromStatus(gameStatus(chess.current));
    if (r) setResult(r);
  }, [version, session, result]);

  // Während einer Partie gegen den Computer pausiert die Hintergrund-Analyse (beide teilen sich die Rechenleistung)
  const playingEngine = !!session && session.setup.mode === 'computer' && !result;
  useEffect(() => {
    analysisQueue.setYielding(playingEngine);
  }, [playingEngine]);

  // Partieende: automatisch speichern (einmal pro Partie; Partien ganz ohne Züge nicht)
  useEffect(() => {
    if (!session || !result || savedSession.current === session.id) return;
    savedSession.current = session.id;
    if (chess.current.history().length === 0) return;
    const record = buildAppGame(session, chess.current, result);
    saveGame(record)
      .then(() => setSaved({ id: record.id }))
      .catch(() => setSaved({ error: true }));
  }, [session, result]);

  // Stockfish zieht, wenn er am Zug ist
  useEffect(() => {
    if (!session || result || !session.players[turn].isEngine) return;
    if (gameStatus(chess.current).kind !== 'playing') return;
    const id = session.id;
    let cancelled = false;
    setThinking(true);
    (async () => {
      // Kurze, leicht schwankende Bedenkzeit, damit es sich natürlich anfühlt
      const started = Date.now();
      const uci = await getEngine().bestMove(chess.current.fen(), 500);
      await wait(Math.max(0, 450 + Math.random() * 600 - (Date.now() - started)));
      if (cancelled || id !== session.id) return;
      chess.current.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
      setThinking(false);
      refresh();
    })();
    return () => {
      cancelled = true;
      setThinking(false);
    };
  }, [version, session, result]);

  const start = useCallback(async () => {
    saveSetup(setup);
    setSetting('setup', setup).catch(() => {});
    const s = createSession(setup);
    setSaved(null);
    chess.current = new Chess();
    setResult(null);
    setViewPly(null);
    setConfirmResign(false);
    setPendingPromotion(null);
    setOrientation(s.orientation);
    if (setup.mode === 'computer') {
      const engine = getEngine();
      await engine.newGame();
      await engine.setOptions(strengthOptions(strengthLevels[setup.strengthIndex]));
    }
    setSession(s);
    refresh();
    window.scrollTo({ top: 0 });
  }, [setup]);

  function play(from: Key, to: Key, promotion?: PromotionPiece) {
    chess.current.move({ from, to, promotion });
    setViewPly(null);
    refresh();
  }

  function handleMove(from: Key, to: Key) {
    if (isPromotion(chess.current, from, to)) setPendingPromotion({ from, to });
    else play(from, to);
  }

  function backToSetup() {
    chess.current = new Chess();
    setResult(null);
    setViewPly(null);
    setSession(null);
    refresh();
  }

  function resign() {
    if (!session) return;
    // Gegen Computer gibt immer der Mensch auf, am selben Gerät der Spieler am Zug
    const loser = session.setup.mode === 'computer' ? session.orientation : turn;
    setResult({ winner: other(loser), reason: 'resign' });
    setConfirmResign(false);
  }

  const goTo = useCallback(
    (target: number) => {
      const len = chess.current.history().length;
      const clamped = Math.max(0, Math.min(len, target));
      setViewPly(clamped === len ? null : clamped);
    },
    [],
  );

  // Pfeiltasten: ← → einen Zug, ↑ / Pos1 Anfang, ↓ / Ende aktuelle Stellung
  useEffect(() => {
    if (!active) return;
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const len = chess.current.history().length;
      const current = viewPly ?? len;
      const map: Record<string, number> = { ArrowLeft: current - 1, ArrowRight: current + 1, ArrowUp: 0, Home: 0, ArrowDown: len, End: len };
      if (e.key in map) {
        e.preventDefault();
        goTo(map[e.key]);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [viewPly, goTo, active]);

  const config = useMemo<Config>(() => {
    const shown = ply === 0 ? new Chess() : new Chess(history[ply - 1].after);
    const last = ply > 0 ? history[ply - 1] : undefined;
    const canMove = isLive && humanToMove;
    return {
      fen: shown.fen(),
      orientation: boardOrientation,
      turnColor: turnColor(shown),
      lastMove: last ? [last.from, last.to] : undefined,
      check: shown.inCheck() ? turnColor(shown) : false,
      movable: { color: canMove ? turn : undefined, dests: canMove ? legalDests(chess.current) : new Map() },
    };
  }, [version, ply, boardOrientation, humanToMove]);

  const material = materialInfo(chess.current, ply);
  const players = session?.players ?? previewPlayers(setup);

  const bar = (color: Color) => (
    <PlayerBar
      player={players[color]}
      color={color}
      captured={material.captured[color]}
      advantage={material.advantage[color]}
      active={!!session && !result && turn === color}
      thinking={thinking && players[color].isEngine}
    />
  );

  function statusLine(): string {
    if (!session) return '';
    if (result) return '';
    const p = session.players[turn];
    if (p.isEngine) return 'Stockfish ist am Zug';
    const check = chess.current.inCheck() ? ' – Schach!' : '';
    if (p.name === 'Du') return `Du bist am Zug${check}`;
    return `${p.name} ist am Zug${check}`;
  }

  const summary = result && session ? resultText(result, session.players) : null;

  return (
    <div className={cn('play grid w-full animate-in grid-cols-1 items-start gap-3 fade-in-0 md:w-auto md:grid-cols-[var(--board-size)_340px] md:gap-7', !session && 'is-setup')}>
      <section className="flex flex-col gap-0.5 md:gap-1.5">
        <div className="max-md:px-3.5">{bar(other(boardOrientation))}</div>
        <div className="board-area relative">
          <Board config={config} onMove={handleMove} />
          {pendingPromotion && (
            <PromotionDialog
              color={turn}
              onChoose={(piece) => {
                play(pendingPromotion.from, pendingPromotion.to, piece);
                setPendingPromotion(null);
              }}
              onCancel={() => {
                // Zug zurück aufs Brett setzen, ohne ihn auszuführen
                setPendingPromotion(null);
                refresh();
              }}
            />
          )}
        </div>
        <div className="max-md:px-3.5">{bar(boardOrientation)}</div>
      </section>

      <aside className={cn('flex min-h-0 flex-col gap-3.5 max-md:px-3.5 md:max-h-[calc(var(--board-size)+2*var(--bar-height)+12px)] md:pt-[calc(var(--bar-height)+6px)]', !session && 'max-md:order-first max-md:pb-2')}>
        {!session ? (
          <SetupPanel setup={setup} onChange={setSetup} onStart={start} />
        ) : (
          <>
            {summary && result ? (
              <Card size="sm" className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-0.5 px-4" data-testid="result" role="status">
                <span className="row-span-3 font-heading text-4xl leading-none text-brass">{resultScore(result)}</span>
                <span className="text-lg font-bold">{summary.headline}</span>
                <span className="text-[15px] text-muted-foreground">{summary.detail}</span>
                {saved?.id && (
                  <a className="text-[15px] font-semibold text-brass-text" href={href({ page: 'partie', id: saved.id })} data-testid="saved">
                    Gespeichert · ansehen
                  </a>
                )}
                {saved?.error && <span className="text-[15px] font-semibold text-destructive">Speichern fehlgeschlagen</span>}
              </Card>
            ) : (
              <p className="min-h-7 text-lg font-semibold" data-testid="status" aria-live="polite">
                {statusLine()}
              </p>
            )}

            <MoveList moves={history.map((m) => m.san)} currentPly={ply} onSelect={goTo} />

            <NavControls ply={ply} last={history.length} onGo={goTo} />

            <div className="grid grid-cols-2 gap-2">
              {result ? (
                <>
                  <Button variant="outline" size="lg" className="h-11" onClick={backToSetup}>
                    Einstellungen
                  </Button>
                  <Button size="lg" className="h-11" onClick={start}>
                    Neue Partie
                  </Button>
                </>
              ) : confirmResign ? (
                <>
                  <Button variant="outline" size="lg" className="h-11" onClick={() => setConfirmResign(false)}>
                    Weiterspielen
                  </Button>
                  <Button variant="destructive" size="lg" className="h-11" onClick={resign}>
                    {session.setup.mode === 'friend' ? `${players[turn].name} gibt auf` : 'Ja, aufgeben'}
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="outline" size="lg" className="h-11" onClick={() => setOrientation(other)}>
                    Brett drehen
                  </Button>
                  <Button variant="outline" size="lg" className="h-11" onClick={() => setConfirmResign(true)}>
                    Aufgeben
                  </Button>
                </>
              )}
            </div>
          </>
        )}
      </aside>
    </div>
  );
}

/** Spielernamen vor dem Start (bei „Zufall“ steht Stockfish vorläufig oben) */
function previewPlayers(setup: GameSetup): Record<Color, Player> {
  if (setup.mode === 'friend') {
    return {
      white: { name: setup.whiteName.trim() || 'Weiß', isEngine: false },
      black: { name: setup.blackName.trim() || 'Schwarz', isEngine: false },
    };
  }
  const engine: Player = { name: 'Stockfish', detail: strengthLabel(strengthLevels[setup.strengthIndex]), isEngine: true };
  const me: Player = { name: 'Du', isEngine: false };
  return setup.colorChoice === 'black' ? { white: engine, black: me } : { white: me, black: engine };
}
