import { describe, expect, it } from 'vitest';
import { coach, errorRows, splitPeriods, themeFor, trendOf, type GameStat } from '../../src/stats/coach';
import { chartRows, evenTicks, fittedSeries } from '../../src/stats/rating';

const DAY = 86_400_000;
const NOW = new Date(2026, 10, 13, 12).getTime();
const g = (daysAgo: number, blunders: number, errorTypes: string[] = []): GameStat => ({ date: NOW - daysAgo * DAY, blunders, errorTypes });

describe('Coach', () => {
  it('ohne Partien: ehrlicher Hinweis, keine Baustelle', () => {
    const c = coach([], NOW);
    expect(c.blunders).toMatch(/Noch keine analysierte Partie/);
    expect(c.focus).toBeNull();
    expect(c.advice).toBeNull();
  });

  it('diese Woche gegenüber den 4 Wochen davor', () => {
    const stats = [g(1, 1), g(2, 1), g(3, 1), g(10, 3), g(12, 3), g(14, 3), g(16, 3), g(20, 3)];
    const c = coach(stats, NOW);
    expect(c.blunders).toBe('Diese Woche 1,0 Patzer pro Partie, in den 4 Wochen davor 3,0 – weniger als vorher.');
  });

  it('zu wenig Partien diese Woche (und insgesamt zu wenig für den Partien-Vergleich)', () => {
    const c = coach([g(1, 2), g(10, 1)], NOW);
    expect(c.blunders).toBe('Diese Woche erst 1 analysierte Partie – für einen Vergleich mit vorher brauche ich mindestens 3.');
  });

  it('alle Partien aus wenigen Tagen: letzte 10 gegenüber den 10 davor', () => {
    const stats = [...Array.from({ length: 10 }, (_, i) => g(5 - i * 0.1, 3)), ...Array.from({ length: 10 }, (_, i) => g(1 - i * 0.05, 1))];
    const p = splitPeriods(stats, NOW);
    expect(p.nowLabel).toBe('In deinen letzten 10 Partien');
    expect(coach(stats, NOW).blunders).toBe('In deinen letzten 10 Partien 1,0 Patzer pro Partie, in den 10 davor 3,0 – weniger als vorher.');
  });

  it('größte Baustelle und Empfehlung nur bei genug Fehlern', () => {
    const few = coach([g(1, 1, ['pieceTaken', 'fork'])], NOW);
    expect(few.focus).toBeNull();
    const stats = [g(1, 2, ['pieceTaken', 'pieceTaken', 'other']), g(2, 1, ['pieceTaken', 'fork', 'other'])];
    const c = coach(stats, NOW);
    expect(c.focus).toBe('Größte Baustelle: Material eingestellt – 3 von 6 Fehlern.');
    expect(c.advice).toBe('Übe heute Puzzles zum Thema „Hängende Figur“.');
    expect(c.theme).toBe('hangingPiece');
  });

  it('Stellungsfehler ohne Taktik sind nie die „größte Baustelle“', () => {
    const c = coach([g(1, 1, ['other', 'other', 'other', 'other', 'fork', 'other'])], NOW);
    expect(c.focus).toMatch(/^Größte Baustelle: Gabel übersehen – 1 von 6/);
    expect(themeFor('other')).toBeNull();
  });

  it('Trend: pro Partie gerechnet, kleine Unterschiede gelten als „wie vorher“', () => {
    const p = splitPeriods([g(1, 0), g(2, 0), g(3, 0), g(9, 0), g(10, 0), g(11, 0), g(12, 0), g(13, 0)], NOW);
    expect(trendOf(1.0, 1.1, p)).toBe('same');
    expect(trendOf(1.5, 1.0, p)).toBe('up');
    expect(trendOf(0.2, 1.0, p)).toBe('down');
    // zu wenig Daten: kein Trend
    expect(trendOf(1, 2, splitPeriods([g(1, 0)], NOW))).toBeNull();
  });

  it('Fehlerarten mit Trend, sortiert nach Häufigkeit', () => {
    const week = [g(1, 0, ['fork', 'fork']), g(2, 0, ['fork']), g(3, 0, ['fork', 'pieceTaken'])];
    const before = [9, 10, 11, 12, 13].map((d) => g(d, 0, ['pieceTaken', 'pieceTaken']));
    const rows = errorRows([...week, ...before], NOW);
    expect(rows.map((r) => [r.type, r.count, r.trend])).toEqual([
      ['pieceTaken', 11, 'down'],
      ['fork', 4, 'up'],
    ]);
  });
});

describe('Wertung: Zeitraum passend zu den Daten', () => {
  it('beginnt mit der ersten Partie, Tagespunkte bei kurzer Spanne', () => {
    const s = fittedSeries([{ date: NOW - 6 * DAY, rating: 300 }, { date: NOW - DAY, rating: 350 }], NOW);
    expect(s.unit).toBe('day');
    expect(s.buckets).toHaveLength(7);
    expect(s.buckets[0].rating).toBe(300);
    expect(s.delta).toBe(50);
  });

  it('Wochenpunkte bei langer Spanne', () => {
    const s = fittedSeries([{ date: NOW - 200 * DAY, rating: 300 }, { date: NOW, rating: 400 }], NOW);
    expect(s.unit).toBe('week');
    expect(s.buckets[0].rating).toBe(300);
  });
});

describe('Wertung: Grafikpunkte und Datumsmarken', () => {
  it('wenige Partien: ein Punkt pro Partie, ohne Lücken', () => {
    const { rows, unit } = chartRows([{ date: NOW - 10 * DAY, rating: 300 }, { date: NOW, rating: 310 }], NOW);
    expect(unit).toBe('game');
    expect(rows.map((r) => r.x)).toEqual([0, 1]);
  });

  it('Marken gleichmäßig verteilt, jedes Datum nur einmal', () => {
    // 10 Partien, davon 6 am selben Tag
    const rows = [0, 0, 0, 0, 0, 0, 1, 2, 3, 4].map((d) => ({ date: NOW - (4 - d) * DAY }));
    const ticks = evenTicks(rows, 4);
    expect(ticks).toEqual([0, 6, 9]);
    expect(evenTicks(rows.slice(0, 1), 4)).toEqual([0]);
    expect(evenTicks([], 4)).toEqual([]);
  });
});

describe('Empfohlene Spielstärke aus der Chess.com-Wertung', () => {
  it('ca. 350 → Einsteiger 1/4, nicht Elo 1500', async () => {
    const { recommendedStrengthIndex, strengthLabel, strengthLevels } = await import('../../src/engine/strength');
    const label = (r: number | null) => strengthLabel(strengthLevels[recommendedStrengthIndex(r)]);
    expect(label(350)).toBe('Einsteiger 1/4');
    expect(label(750)).toBe('Einsteiger 2/4');
    expect(label(1000)).toBe('Einsteiger 3/4');
    expect(label(1300)).toBe('Einsteiger 4/4');
    expect(label(1450)).toBe('Elo 1400');
    expect(label(1800)).toBe('Elo 1800');
    expect(label(null)).toBe('Einsteiger 2/4');
  });
});
