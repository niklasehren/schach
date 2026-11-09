import { useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import type { Config } from '@lichess-org/chessground/config';
import type { Color, Key } from '@lichess-org/chessground/types';
import { Board } from '../components/Board';
import { MoveList } from '../components/MoveList';
import { PromotionDialog } from '../components/PromotionDialog';
import { checkSquare, gameStatus, isPromotion, legalDests, statusText, turnColor, type PromotionPiece } from '../chess/game';

/**
 * Block 1: freies Ziehen beider Seiten auf dem Brett.
 * In Block 2 übernimmt Stockfish eine Seite.
 */
export function PlayPage() {
  const chess = useRef(new Chess());
  // chess.js ändert sich „innen“; dieser Zähler sagt React, dass neu gezeichnet werden muss
  const [version, setVersion] = useState(0);
  const [orientation, setOrientation] = useState<Color>('white');
  const [pendingPromotion, setPendingPromotion] = useState<{ from: Key; to: Key } | null>(null);

  const status = gameStatus(chess.current);
  const history = chess.current.history({ verbose: true });
  const last = history.at(-1);

  const config = useMemo<Config>(() => {
    const c = chess.current;
    const over = status.kind !== 'playing';
    return {
      fen: c.fen(),
      orientation,
      turnColor: turnColor(c),
      lastMove: last ? [last.from, last.to] : undefined,
      check: checkSquare(c) ? turnColor(c) : false,
      movable: { color: over ? undefined : turnColor(c), dests: over ? new Map() : legalDests(c) },
    };
    // version steht für „Stellung hat sich geändert“
  }, [version, orientation]);

  function play(from: Key, to: Key, promotion?: PromotionPiece) {
    chess.current.move({ from, to, promotion });
    setVersion((v) => v + 1);
  }

  function handleMove(from: Key, to: Key) {
    if (isPromotion(chess.current, from, to)) setPendingPromotion({ from, to });
    else play(from, to);
  }

  function newGame() {
    chess.current = new Chess();
    setPendingPromotion(null);
    setVersion((v) => v + 1);
  }

  return (
    <div className="play">
      <section className="play-board">
        <Board config={config} onMove={handleMove} />
        {pendingPromotion && (
          <PromotionDialog
            color={turnColor(chess.current)}
            onChoose={(piece) => {
              play(pendingPromotion.from, pendingPromotion.to, piece);
              setPendingPromotion(null);
            }}
            onCancel={() => {
              // Zug zurück aufs Brett setzen, ohne ihn auszuführen
              setPendingPromotion(null);
              setVersion((v) => v + 1);
            }}
          />
        )}
      </section>

      <aside className="play-side">
        <p className={`status status-${status.kind}`} data-testid="status" aria-live="polite">
          {statusText(status)}
        </p>
        <MoveList moves={history.map((m) => m.san)} />
        <div className="actions">
          <button className="btn" onClick={() => setOrientation((o) => (o === 'white' ? 'black' : 'white'))}>
            Brett drehen
          </button>
          <button className="btn btn-primary" onClick={newGame}>
            Neue Partie
          </button>
        </div>
      </aside>
    </div>
  );
}
