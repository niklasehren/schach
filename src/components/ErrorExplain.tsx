import { Chess, type Move } from 'chess.js';
import type { AnalysisRecord, MoveAnalysis, MoveClass, Side } from '../db/schema';
import { explain, winWords, type Explanation } from '../analysis/explain';
import { pov } from '../analysis/rules';
import { toGermanSan } from '../chess/game';
import { RichText } from './RichText';

export const markSym: Record<MoveClass, string> = { blunder: '??', mistake: '?', inaccuracy: '?!' };

/** „7. “ bzw. „7… “ für einen Halbzug */
export function moveNumber(ply: number, startFen: string): string {
  const [, turn, , , , full] = startFen.split(' ');
  const offset = turn === 'b' ? 1 : 0;
  const index = ply - 1 + offset;
  const n = Number(full || 1) + Math.floor(index / 2);
  return index % 2 === 0 ? `${n}. ` : `${n}… `;
}

export function explainMove(m: MoveAnalysis, fens: string[], a: AnalysisRecord, last?: Move): Explanation {
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
    lastMove: last ? { fen: fens[m.ply - 2], uci: last.from + last.to + (last.promotion ?? '') } : undefined,
  });
}

export const classText: Record<MoveClass, string> = { blunder: 'Patzer', mistake: 'Fehler', inaccuracy: 'Ungenauigkeit' };

/** Erklärung zu einem markierten Zug, gezeigt in der Stellung davor (mit Pfeilen am Brett) */
export function ErrorCard({
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
export function VariationCard({ fen, moves, step, onStep, onClose }: { fen: string; moves: Move[]; step: number; onStep: (s: number) => void; onClose: () => void }) {
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
export function winSentence(before: number, after: number): string {
  const a = winWords(before);
  const b = winWords(after);
  const fmt = (w: string) => (w === 'ausgeglichen' || w === 'gewonnen' || w === 'verloren' ? w : `${w} für dich`);
  if (a === b) return `Die Stellung bleibt ${fmt(a)}`;
  return `Vorher ${fmt(a)}, danach ${fmt(b)}`;
}
