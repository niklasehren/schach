import { Chess, type Move } from 'chess.js';
import type { AnalysisRecord, MoveAnalysis, MoveClass, Side } from '../db/schema';
import { explain, winWords, type Explanation } from '../analysis/explain';
import { pov } from '../analysis/rules';
import { toGermanSan } from '../chess/game';
import { RichText } from './RichText';
import { ChevronLeft, ChevronRight, Lightbulb, Play, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const classColor: Record<MoveClass, { border: string; badge: string }> = {
  blunder: { border: 'border-l-blunder', badge: 'bg-blunder text-background' },
  mistake: { border: 'border-l-mistake', badge: 'bg-mistake text-background' },
  inaccuracy: { border: 'border-l-inaccuracy', badge: 'bg-inaccuracy text-background' },
};

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
    <section
      className={cn('error-card flex animate-in flex-col gap-3 border-l-4 pl-3 text-[15.5px] fade-in-0', classColor[move.class!].border)}
      data-testid="error-card"
      aria-label="Fehleranalyse"
    >
      <header className="flex flex-col gap-1">
        <span className="flex flex-wrap items-center gap-2">
          <Badge className={cn('h-5 text-[11px] font-bold tracking-wide uppercase', classColor[move.class!].badge)}>{classText[move.class!]}</Badge>
          <strong className="text-lg">
            {moveLabel} – {classText[move.class!]}
          </strong>
        </span>
        {tags.length > 0 && <span className="font-semibold">{tags.join(' · ')}</span>}
        <span className="text-sm text-muted-foreground" data-testid="win-words">
          {winSentence(move.winBefore, move.winAfter)} (Gewinnchance {Math.round(move.winBefore)} % → {Math.round(move.winAfter)} %)
        </span>
      </header>
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <span className="h-1.5 w-6 rounded-full bg-[#e53935]" aria-hidden /> dein Zug {san}
        {best && (
          <>
            <span className="ml-1 h-1.5 w-6 rounded-full bg-[#1f9d55]" aria-hidden /> besser {best}
          </>
        )}
      </p>
      {explanation.played.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="font-bold">Warum {san} schlecht ist</span>
          <ul className="flex list-disc flex-col gap-1.5 pl-5" data-testid="explain-played">
            {explanation.played.map((item) => (
              <li key={item.text}>
                <RichText text={item.text} />
              </li>
            ))}
          </ul>
        </div>
      )}
      {best && explanation.better.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="font-bold">Warum {best} besser ist</span>
          <ul className="flex list-disc flex-col gap-1.5 pl-5" data-testid="explain-better">
            {explanation.better.map((item) => (
              <li key={item.text}>
                <RichText text={item.text} />
              </li>
            ))}
          </ul>
        </div>
      )}
      {explanation.merke && (
        <p className="merke rounded-lg border-l-4 border-l-brass bg-brass/12 px-3 py-2.5" data-testid="merke">
          <strong>Merke:</strong> {explanation.merke}
        </p>
      )}
      {canShowLine && (
        <Button size="lg" className="h-11 text-[15px]" onClick={onShowLine} data-testid="show-line">
          <Play data-icon="inline-start" /> Beste Fortsetzung zeigen
        </Button>
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
    <section className="variation-card flex animate-in flex-col gap-3 rounded-xl border-2 border-dashed border-brass p-3 fade-in-0" data-testid="variation" aria-label="Variante">
      <header className="flex flex-col">
        <strong className="flex items-center gap-1.5">
          <Lightbulb className="size-4 text-brass" /> Variante (Engine)
        </strong>
        <span className="text-sm text-muted-foreground">nicht gespielt – so wäre es besser weitergegangen</span>
      </header>
      <ol className="m-0 flex list-none flex-wrap items-center gap-x-1 gap-y-0.5 p-0 tabular-nums">
        {moves.map((m, i) => {
          const num = white ? `${n}.` : i === 0 ? `${n}…` : '';
          if (!white) n++;
          white = !white;
          return (
            <li key={i} className="flex items-center gap-0.5">
              {num && <span className="text-muted-foreground">{num}</span>}
              <button
                className={cn('movelist-move rounded-md px-2 py-0.5 hover:bg-muted', step === i + 1 && 'is-current bg-primary text-primary-foreground hover:bg-primary')}
                onClick={() => onStep(i + 1)}
                data-testid="variation-move"
              >
                {toGermanSan(m.san)}
              </button>
            </li>
          );
        })}
      </ol>
      <div className="grid grid-cols-2 gap-1.5">
        <Button variant="outline" size="lg" className="h-11" aria-label="Variante zurück" onClick={() => onStep(step - 1)} disabled={step === 0}>
          <ChevronLeft className="size-5" />
        </Button>
        <Button variant="outline" size="lg" className="h-11" aria-label="Variante vor" onClick={() => onStep(step + 1)} disabled={step >= moves.length}>
          <ChevronRight className="size-5" />
        </Button>
      </div>
      <Button variant="secondary" size="lg" className="h-11" onClick={onClose} data-testid="close-line">
        <X data-icon="inline-start" /> Zurück zur Partie
      </Button>
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
