import { useEffect, useRef, useState } from 'react';
import type { MoveClass } from '../db/schema';

type Props = {
  /** Gewinnchance für Weiß in Prozent je Stellung (Index 0 = Ausgangsstellung) */
  values: (number | null)[];
  /** Markierte Züge (Halbzug → Klasse) als Punkte */
  marks: Record<number, MoveClass>;
  /** Text je Halbzug für den Tooltip, z. B. „7. Df1??“ */
  labels: string[];
  current: number;
  onSelect: (ply: number) => void;
};

const HEIGHT = 84;
const PAD_X = 8;
const PAD_Y = 8;
const markText: Record<MoveClass, string> = { blunder: 'Patzer', mistake: 'Fehler', inaccuracy: 'Ungenauigkeit' };

/** Bewertungskurve: eine Linie (Weiß-Gewinnchance), Fehler als Punkte; Klick springt zum Zug */
export function EvalChart({ values, marks, labels, current, onSelect }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(300);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(120, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const n = Math.max(1, values.length - 1);
  const x = (i: number) => PAD_X + (i / n) * (width - 2 * PAD_X);
  const y = (v: number) => PAD_Y + (1 - v / 100) * (HEIGHT - 2 * PAD_Y);
  const mid = y(50);
  const pts = values.map((v, i) => [x(i), y(v ?? 50)] as const);
  const line = pts.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)},${py.toFixed(1)}`).join('');
  const area = `${line}L${x(n).toFixed(1)},${mid}L${x(0).toFixed(1)},${mid}Z`;

  const plyAt = (clientX: number) => {
    const rect = box.current!.getBoundingClientRect();
    return Math.max(0, Math.min(n, Math.round(((clientX - rect.left - PAD_X) / (width - 2 * PAD_X)) * n)));
  };

  const shown = hover ?? null;
  const tip =
    shown !== null
      ? `${shown === 0 ? 'Start' : labels[shown - 1]}${marks[shown] ? ` · ${markText[marks[shown]]}` : ''} · Weiß ${values[shown] === null ? '–' : `${Math.round(values[shown]!)} %`}`
      : null;

  return (
    <div
      className="evalchart"
      ref={box}
      data-testid="evalchart"
      onPointerMove={(e) => setHover(plyAt(e.clientX))}
      onPointerLeave={() => setHover(null)}
      onClick={(e) => onSelect(plyAt(e.clientX))}
      role="slider"
      aria-label="Bewertungskurve – Zug wählen"
      aria-valuemin={0}
      aria-valuemax={n}
      aria-valuenow={current}
      aria-valuetext={current === 0 ? 'Ausgangsstellung' : labels[current - 1]}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft') onSelect(Math.max(0, current - 1));
        if (e.key === 'ArrowRight') onSelect(Math.min(n, current + 1));
      }}
    >
      <svg width={width} height={HEIGHT} aria-hidden>
        <line className="evalchart-mid" x1={PAD_X} x2={width - PAD_X} y1={mid} y2={mid} />
        <path className="evalchart-area" d={area} />
        <path className="evalchart-line" d={line} />
        <line className="evalchart-current" x1={x(current)} x2={x(current)} y1={2} y2={HEIGHT - 2} />
        {hover !== null && <line className="evalchart-hover" x1={x(hover)} x2={x(hover)} y1={2} y2={HEIGHT - 2} />}
        {Object.entries(marks).map(([ply, cls]) => {
          const i = Number(ply);
          return <circle key={ply} className={`evalchart-dot dot-${cls}`} cx={x(i)} cy={y(values[i] ?? 50)} r={cls === 'blunder' ? 5.5 : 4.5} data-ply={i} />;
        })}
      </svg>
      {tip && (
        <span className="evalchart-tip" style={{ left: Math.min(Math.max(x(hover!), 70), width - 70) }}>
          {tip}
        </span>
      )}
    </div>
  );
}
