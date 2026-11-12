import { describe, expect, it } from 'vitest';
import { ratingSeries, segments } from '../../src/stats/rating';

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime();
const now = at(2026, 11, 12, 18);

// Februar gespielt, dann Pause bis November
const points = [
  { date: at(2026, 2, 19), rating: 100 },
  { date: at(2026, 2, 26, 10), rating: 320 },
  { date: at(2026, 2, 26, 20), rating: 335 },
  { date: at(2026, 11, 6), rating: 335 },
  { date: at(2026, 11, 8, 9), rating: 300 },
  { date: at(2026, 11, 8, 21), rating: 319 },
  { date: at(2026, 11, 10), rating: 424 },
  { date: at(2026, 11, 12, 11), rating: 351 },
];

describe('Rating-Verlauf auf der Zeitachse', () => {
  it('4 Wochen: ein Punkt pro Tag, Wertung am Tagesende, Tage ohne Partie = Lücke', () => {
    const s = ratingSeries(points, '4w', now);
    expect(s.unit).toBe('day');
    expect(s.buckets).toHaveLength(28);
    const byDay = (d: number) => s.buckets.find((b) => b.start === at(2026, 11, d, 0))!;
    expect(byDay(8).rating).toBe(319);
    expect(byDay(7).rating).toBeNull();
    expect(byDay(12).rating).toBe(351);
    // Linie wird an den Lücken unterbrochen
    expect(segments(s.buckets).length).toBeGreaterThan(1);
    expect(s.games).toBe(5);
    // Veränderung gegenüber der letzten Partie vor dem Zeitraum (26.02.: 335)
    expect(s.delta).toBe(351 - 335);
    expect(s.best).toBe(424);
  });

  it('Woche: die letzten 7 Tage einschließlich heute (6.–12.11.)', () => {
    const s = ratingSeries(points, 'week', now);
    expect(s.buckets).toHaveLength(7);
    expect(s.buckets[0].start).toBe(at(2026, 11, 6, 0));
    expect(s.games).toBe(5);
    expect(s.delta).toBe(351 - 335);
  });

  it('Alles: ein Punkt pro Woche (Wertung am Wochenende), Pause Februar–November als Lücke', () => {
    const s = ratingSeries(points, 'all', now);
    expect(s.unit).toBe('week');
    // Woche mit 26.02. endet mit 335
    const feb = s.buckets.find((b) => b.start <= at(2026, 2, 26) && b.end > at(2026, 2, 26))!;
    expect(feb.rating).toBe(335);
    const gap = s.buckets.filter((b) => b.start > at(2026, 3, 9) && b.end < at(2026, 11, 2));
    expect(gap.length).toBeGreaterThan(30);
    expect(gap.every((b) => b.rating === null)).toBe(true);
    const segs = segments(s.buckets);
    expect(segs.length).toBeGreaterThanOrEqual(2);
    expect(s.delta).toBe(351 - 100);
    expect(s.games).toBe(8);
  });

  it('3 Monate: Wochenpunkte, Beginn = letzte Partie davor', () => {
    const s = ratingSeries(points, '3m', now);
    expect(s.unit).toBe('week');
    expect(s.buckets.length).toBeGreaterThanOrEqual(13);
    expect(s.delta).toBe(351 - 335);
  });

  it('keine Partie im Zeitraum', () => {
    const s = ratingSeries(points.slice(0, 3), 'week', now);
    expect(s.games).toBe(0);
    expect(s.delta).toBeNull();
    expect(segments(s.buckets)).toEqual([]);
  });
});
