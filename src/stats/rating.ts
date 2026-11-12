/** Rating-Verlauf auf einer echten Zeitachse: Tages- bzw. Wochenpunkte, Lücken bei Pausen */
export type RatingRange = 'week' | '4w' | '3m' | 'all';

export const RANGE_LABELS: Record<RatingRange, string> = { week: 'Woche', '4w': '4 Wochen', '3m': '3 Monate', all: 'Alles' };
/** „+34 in den letzten 4 Wochen“ */
export const RANGE_PHRASE: Record<RatingRange, string> = {
  week: 'in der letzten Woche',
  '4w': 'in den letzten 4 Wochen',
  '3m': 'in den letzten 3 Monaten',
  all: 'insgesamt',
};
/** Unter so vielen Partien im Zeitraum: Hinweis statt Aussage */
export const MIN_GAMES = 5;

export type RatingPoint = { date: number; rating: number };
export type Bucket = { start: number; end: number; rating: number | null; games: number };
export type RatingSeries = {
  /** Tage („week“, „4w“) bzw. Wochen („3m“, „all“) – rating null = keine Partie (Lücke) */
  buckets: Bucket[];
  unit: 'day' | 'week';
  from: number;
  to: number;
  games: number;
  /** Veränderung im Zeitraum: letzte Wertung minus Wertung zu Beginn (letzte Partie davor, sonst erste im Zeitraum) */
  delta: number | null;
  /** Bestwert über alle Partien dieser Zeitklasse (nicht nur im Zeitraum) */
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

export function ratingSeries(points: RatingPoint[], range: RatingRange, now = Date.now()): RatingSeries {
  const sorted = [...points].sort((a, b) => a.date - b.date);
  const unit: 'day' | 'week' = range === 'week' || range === '4w' ? 'day' : 'week';
  const today = startOfDay(now);
  let from: number;
  if (range === 'week') from = addDays(today, -6);
  else if (range === '4w') from = addDays(today, -27);
  else if (range === '3m') from = startOfWeek(addDays(today, -7 * 12));
  else from = sorted.length ? startOfWeek(sorted[0].date) : startOfWeek(today);
  const to = addDays(today, 1);

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

/** Linienstücke ohne Lücken (für die Grafik): aufeinanderfolgende Punkte mit Wertung */
export function segments(buckets: Bucket[]): { index: number; rating: number }[][] {
  const out: { index: number; rating: number }[][] = [];
  let cur: { index: number; rating: number }[] = [];
  buckets.forEach((b, i) => {
    if (b.rating === null) {
      if (cur.length) out.push(cur);
      cur = [];
    } else cur.push({ index: i, rating: b.rating });
  });
  if (cur.length) out.push(cur);
  return out;
}
