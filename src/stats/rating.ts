/** Rating-Verlauf: Zeitraum passend zu den vorhandenen Daten, Datumsmarken für die Grafik */
import { formatDate } from '../chess/format';

export type RatingPoint = { date: number; rating: number };
export type Bucket = { start: number; end: number; rating: number | null; games: number };
export type RatingSeries = {
  /** Tage bzw. Wochen – rating null = keine Partie */
  buckets: Bucket[];
  unit: 'day' | 'week';
  from: number;
  to: number;
  games: number;
  /** Veränderung im Zeitraum: letzte Wertung minus Wertung zu Beginn */
  delta: number | null;
  /** Bestwert über alle Partien dieser Zeitklasse */
  bestOverall: number | null;
};

const startOfDay = (t: number) => {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};
const addDays = (t: number, n: number) => {
  const d = new Date(t);
  d.setDate(d.getDate() + n);
  return d.getTime();
};
/** Montag 0:00 der Woche */
const startOfWeek = (t: number) => {
  const d = new Date(startOfDay(t));
  const dow = (d.getDay() + 6) % 7;
  return addDays(d.getTime(), -dow);
};

/** Bis zu so vielen Tagen Daten: ein Punkt pro Tag, darüber einer pro Woche */
export const AUTO_DAY_LIMIT = 60;

/**
 * Zeitraum passend zu den vorhandenen Daten: beginnt mit der ersten Partie (keine leere Fläche davor),
 * Tagespunkte bis 60 Tage, darüber Wochenpunkte.
 */
export function fittedSeries(points: RatingPoint[], now = Date.now()): RatingSeries {
  const sorted = [...points].sort((a, b) => a.date - b.date);
  const first = sorted[0]?.date ?? now;
  const unit: 'day' | 'week' = startOfDay(now) - startOfDay(first) <= AUTO_DAY_LIMIT * 86_400_000 ? 'day' : 'week';
  return seriesFrom(sorted, unit === 'day' ? startOfDay(first) : startOfWeek(first), unit, now);
}

function seriesFrom(sorted: RatingPoint[], from: number, unit: 'day' | 'week', now: number): RatingSeries {
  const to = addDays(startOfDay(now), 1);
  const buckets: Bucket[] = [];
  for (let s = from; s < to; s = addDays(s, unit === 'day' ? 1 : 7)) {
    const e = addDays(s, unit === 'day' ? 1 : 7);
    // Wertung am Ende des Tages bzw. der Woche = letzte Partie darin
    const inside = sorted.filter((p) => p.date >= s && p.date < e);
    buckets.push({ start: s, end: e, rating: inside.length ? inside[inside.length - 1].rating : null, games: inside.length });
  }

  const inRange = sorted.filter((p) => p.date >= from && p.date < to);
  const before = sorted.filter((p) => p.date < from).at(-1);
  const startRating = before?.rating ?? inRange[0]?.rating;
  const delta = inRange.length && startRating !== undefined ? inRange[inRange.length - 1].rating - startRating : null;
  return {
    buckets,
    unit,
    from,
    to,
    games: inRange.length,
    delta,
    bestOverall: sorted.length ? Math.max(...sorted.map((p) => p.rating)) : null,
  };
}

/** Bis zu so vielen Partien ein Punkt pro Partie, darüber pro Tag bzw. Woche */
export const PER_GAME_LIMIT = 150;

export type ChartRow = { x: number; date: number; rating: number; games: number };

/** Punkte der Grafik: wenige Partien einzeln (gleichmäßig verteilt, ohne Lücken), viele als Tages- bzw. Wochenwerte */
export function chartRows(points: RatingPoint[], now = Date.now()): { rows: ChartRow[]; unit: 'game' | 'day' | 'week' } {
  if (points.length <= PER_GAME_LIMIT) return { rows: points.map((p, i) => ({ x: i, date: p.date, rating: p.rating, games: 1 })), unit: 'game' };
  const s = fittedSeries(points, now);
  const rows = s.buckets.filter((b) => b.rating !== null).map((b, i) => ({ x: i, date: b.start, rating: b.rating!, games: b.games }));
  return { rows, unit: s.unit };
}

/**
 * Datumsmarken: höchstens `count` in gleichen Abständen über die ganze Breite,
 * jede mit einem anderen Datum (bei mehreren Partien am selben Tag sonst doppelt).
 */
export function evenTicks(rows: { date: number }[], count: number): number[] {
  if (rows.length === 0) return [];
  const n = Math.max(2, Math.min(count, rows.length));
  const last = rows.length - 1;
  const out: number[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < n; i++) {
    const x = Math.round((i * last) / (n - 1));
    const label = formatDate(rows[x].date);
    if (seen.has(label)) continue;
    seen.add(label);
    out.push(x);
  }
  return out;
}
