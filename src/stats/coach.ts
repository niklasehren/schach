import type { AnalysisRecord, GameRecord } from '../db/schema';
import { ERROR_TYPE_LABELS } from '../analysis/errorTypes';
import { ERROR_THEMES, themeOf, type ThemeKey } from '../training/themes';

/**
 * Coach: kurze Aussagen in einfacher Sprache aus meinen echten Daten.
 * Nur Aussagen, die die Daten tragen – sonst ein ehrlicher Hinweis, dass es noch zu wenig ist.
 */

const DAY = 86_400_000;
/** „Diese Woche“ = die letzten 7 Tage; „vorher“ = die 4 Wochen davor */
export const WEEK_DAYS = 7;
export const BEFORE_DAYS = 28;
/** Mindestanzahl analysierter Partien je Zeitraum für einen Vergleich */
export const MIN_WEEK = 3;
export const MIN_BEFORE = 5;
/** Mindestanzahl Fehler, ab der eine „größte Baustelle“ genannt wird */
export const MIN_ERRORS = 5;

export type GameStat = { date: number; blunders: number; errorTypes: string[] };

/** Meine Patzer und Fehlerarten je analysierter Partie (nur Partien mit eigener Farbe) */
export function gameStats(games: GameRecord[], analyses: AnalysisRecord[]): GameStat[] {
  const byId = new Map(games.map((g) => [g.id, g]));
  const out: GameStat[] = [];
  for (const a of analyses) {
    const g = byId.get(a.gameId);
    if (a.status !== 'done' || !g || !a.myColor || !a.summary || !a.sides) continue;
    out.push({
      date: g.date,
      blunders: a.summary[a.myColor].blunders,
      errorTypes: a.sides[a.myColor].map((m) => m.errorType).filter((t): t is string => !!t),
    });
  }
  return out.sort((x, y) => x.date - y.date);
}

/** Ohne genug Partien pro Woche: die letzten N Partien gegenüber den N davor */
export const LAST_N = 10;

export type Periods = {
  week: GameStat[];
  before: GameStat[];
  /** „diese Woche“ / „in deinen letzten 10 Partien“ */
  nowLabel: string;
  /** „in den 4 Wochen davor“ / „in den 10 davor“ */
  beforeLabel: string;
};

/**
 * Vergleichszeiträume: bevorzugt diese Woche (7 Tage) gegenüber den 4 Wochen davor.
 * Reicht das nicht (z. B. alle Partien aus wenigen Tagen), die letzten 10 Partien gegenüber den 10 davor.
 */
export function splitPeriods(stats: GameStat[], now: number): Periods {
  const weekFrom = now - WEEK_DAYS * DAY;
  const beforeFrom = weekFrom - BEFORE_DAYS * DAY;
  const week = stats.filter((s) => s.date >= weekFrom && s.date <= now);
  const before = stats.filter((s) => s.date >= beforeFrom && s.date < weekFrom);
  if ((week.length >= MIN_WEEK && before.length >= MIN_BEFORE) || stats.length < LAST_N + MIN_BEFORE)
    return { week, before, nowLabel: 'Diese Woche', beforeLabel: 'in den 4 Wochen davor' };
  const sorted = [...stats].sort((a, b) => a.date - b.date);
  const last = sorted.slice(-LAST_N);
  const prev = sorted.slice(-2 * LAST_N, -LAST_N);
  return { week: last, before: prev, nowLabel: `In deinen letzten ${LAST_N} Partien`, beforeLabel: `in den ${prev.length} davor` };
}

const perGame = (list: GameStat[], f: (s: GameStat) => number) => (list.length ? list.reduce((sum, s) => sum + f(s), 0) / list.length : 0);
const fmt = (x: number) => x.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export type Trend = 'up' | 'down' | 'same' | null;

/**
 * Häufiger oder seltener als vorher (pro Partie gerechnet, damit viele Partien nicht automatisch „mehr Fehler“ heißen).
 * null = zu wenig Daten für einen Vergleich. „same“ bei weniger als 15 % bzw. 0,15 pro Partie Unterschied.
 */
export function trendOf(weekRate: number, beforeRate: number, p: Periods): Trend {
  if (p.week.length < MIN_WEEK || p.before.length < MIN_BEFORE) return null;
  const diff = weekRate - beforeRate;
  if (Math.abs(diff) < 0.15 || Math.abs(diff) < 0.15 * Math.max(weekRate, beforeRate)) return 'same';
  return diff > 0 ? 'up' : 'down';
}

export type ErrorRow = { type: string; label: string; count: number; trend: Trend; weekRate: number; beforeRate: number };

/** Fehlerarten über alle analysierten Partien, mit Trend „diese Woche gegenüber vorher“ */
export function errorRows(stats: GameStat[], now: number): ErrorRow[] {
  const p = splitPeriods(stats, now);
  const counts = new Map<string, number>();
  for (const s of stats) for (const t of s.errorTypes) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts.entries()]
    .map(([type, count]) => {
      const weekRate = perGame(p.week, (s) => s.errorTypes.filter((t) => t === type).length);
      const beforeRate = perGame(p.before, (s) => s.errorTypes.filter((t) => t === type).length);
      return { type, label: ERROR_TYPE_LABELS[type] ?? type, count, weekRate, beforeRate, trend: trendOf(weekRate, beforeRate, p) };
    })
    .sort((a, b) => b.count - a.count);
}

/** Das Trainingsthema, das am meisten gegen diese Fehlerart hilft */
export function themeFor(errorType: string): ThemeKey | null {
  const shares = ERROR_THEMES[errorType];
  if (!shares) return null;
  return (Object.entries(shares) as [ThemeKey, number][]).sort((a, b) => b[1] - a[1])[0][0];
}

export type Coach = {
  /** Satz zu den Patzern pro Partie (oder ehrlicher Hinweis) */
  blunders: string;
  /** Größte Baustelle (null, wenn zu wenig Fehler) */
  focus: string | null;
  /** Konkrete Empfehlung (null, wenn es keine klare gibt) */
  advice: string | null;
  /** Thema zur Empfehlung, für den Knopf */
  theme: ThemeKey | null;
  week: { games: number; blundersPerGame: number };
  before: { games: number; blundersPerGame: number };
  periods: Pick<Periods, 'nowLabel' | 'beforeLabel'>;
};

export function coach(stats: GameStat[], now: number): Coach {
  const p = splitPeriods(stats, now);
  const wb = perGame(p.week, (s) => s.blunders);
  const bb = perGame(p.before, (s) => s.blunders);
  const partien = (n: number) => `${n} ${n === 1 ? 'analysierte Partie' : 'analysierte Partien'}`;

  let blunders: string;
  if (stats.length === 0) blunders = 'Noch keine analysierte Partie – sobald die erste fertig ist, sage ich dir, worauf du achten solltest.';
  else if (p.week.length < MIN_WEEK)
    blunders = `Diese Woche erst ${partien(p.week.length)} – für einen Vergleich mit vorher brauche ich mindestens ${MIN_WEEK}.`;
  else if (p.before.length < MIN_BEFORE)
    blunders = `Diese Woche ${fmt(wb)} Patzer pro Partie. Für einen Vergleich mit den Wochen davor gibt es noch zu wenige Partien (${p.before.length}).`;
  else {
    const t = trendOf(wb, bb, p);
    const verdict = t === 'down' ? 'weniger als vorher' : t === 'up' ? 'mehr als vorher' : 'etwa gleich viele wie vorher';
    blunders = `${p.nowLabel} ${fmt(wb)} Patzer pro Partie, ${p.beforeLabel} ${fmt(bb)} – ${verdict}.`;
  }

  // Größte Baustelle: häufigste konkrete Fehlerart über alle Partien
  const rows = errorRows(stats, now).filter((r) => r.type !== 'other');
  const total = stats.reduce((s, g) => s + g.errorTypes.length, 0);
  const top = rows[0];
  let focus: string | null = null;
  let advice: string | null = null;
  let theme: ThemeKey | null = null;
  if (top && total >= MIN_ERRORS) {
    focus = `Größte Baustelle: ${top.label} – ${top.count} von ${total} Fehlern.`;
    theme = themeFor(top.type);
    const label = theme ? themeOf(theme)?.label : null;
    if (label) advice = `Übe heute Puzzles zum Thema „${label}“.`;
  }
  return { blunders, focus, advice, theme, week: { games: p.week.length, blundersPerGame: wb }, before: { games: p.before.length, blundersPerGame: bb }, periods: { nowLabel: p.nowLabel, beforeLabel: p.beforeLabel } };
}
