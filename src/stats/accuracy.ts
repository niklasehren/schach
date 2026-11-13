import type { MoveAnalysis, PositionEval, Side } from '../db/schema';

/**
 * Genauigkeit einer Partie nach der Lichess-Formel (lila: modules/analyse/src/main/AccuracyPercent.scala,
 * scalachess: core/src/main/scala/eval.scala, scalalib: Maths.scala; Stand master am 13.11.2026, s. PLAN.md):
 * - Gewinnchance (Weiß) jeder Stellung: 50 + 50 · (2 / (1 + e^(−0,00368208 · cp)) − 1), cp auf ±1000 begrenzt, Matt = ±1000
 * - Genauigkeit eines Zugs: 103,1668 · e^(−0,04354 · Verlust) − 3,1669 + 1, begrenzt auf 0–100 (kein Verlust = 100)
 * - Gewicht eines Zugs: Standardabweichung der Gewinnchancen in einem Fenster (Größe (Stellungen − 1) / 10, 2–8), begrenzt auf 0,5–12
 * - Partie: Mittel aus gewichtetem Mittel und harmonischem Mittel (Werte unter 1 zählen als 1)
 */

const CEILING = 1000;

export function winPercentFromCp(cp: number): number {
  const c = Math.max(-CEILING, Math.min(CEILING, cp));
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * c)) - 1);
}

export function moveAccuracy(before: number, after: number): number {
  if (after >= before) return 100;
  const raw = 103.1668100711649 * Math.exp(-0.04354415386753951 * (before - after)) - 3.166924740191411;
  return Math.max(0, Math.min(100, raw + 1));
}

/** Bewertung (Weiß-Sicht) in Hundertstel-Bauern wie bei Lichess: Matt = ±1000; Matt in 0 = die Seite am Zug ist matt */
function forceCp(ev: Pick<PositionEval, 'cp' | 'mate'>, index: number): number {
  if (ev.mate === undefined) return ev.cp ?? 0;
  if (ev.mate === 0) return index % 2 === 0 ? -CEILING : CEILING;
  return ev.mate > 0 ? CEILING : -CEILING;
}

const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
const stdDev = (xs: number[]) => {
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length);
};

/**
 * Genauigkeit beider Seiten (0–100); evals[0] = Ausgangsstellung, Weiß zieht zuerst.
 * null für eine Seite ohne bewertbaren Zug; fehlende Bewertungen (null) machen die Partie unbewertbar.
 */
export function gameAccuracy(evals: (Pick<PositionEval, 'cp' | 'mate'> | null)[]): { white: number | null; black: number | null } | null {
  if (evals.length < 2 || evals.some((e) => !e)) return null;
  const wins = evals.map((e, i) => winPercentFromCp(forceCp(e!, i)));
  const windowSize = Math.max(2, Math.min(8, Math.floor((evals.length - 1) / 10)));
  const windows: number[][] = [];
  for (let i = 0; i < Math.min(windowSize, wins.length) - 2; i++) windows.push(wins.slice(0, windowSize));
  for (let i = 0; i + windowSize <= wins.length; i++) windows.push(wins.slice(i, i + windowSize));
  const weights = windows.map((w) => Math.max(0.5, Math.min(12, stdDev(w))));
  const per: Record<Side, { acc: number; w: number }[]> = { white: [], black: [] };
  for (let i = 0; i + 1 < wins.length && i < weights.length; i++) {
    const white = i % 2 === 0;
    const acc = white ? moveAccuracy(wins[i], wins[i + 1]) : moveAccuracy(100 - wins[i], 100 - wins[i + 1]);
    per[white ? 'white' : 'black'].push({ acc, w: weights[i] });
  }
  const side = (xs: { acc: number; w: number }[]) => {
    if (!xs.length) return null;
    const wsum = xs.reduce((s, x) => s + x.w, 0);
    const weighted = xs.reduce((s, x) => s + x.acc * x.w, 0) / wsum;
    const harmonic = xs.length / xs.reduce((s, x) => s + 1 / Math.max(1, x.acc), 0);
    return (weighted + harmonic) / 2;
  };
  return { white: side(per.white), black: side(per.black) };
}

/**
 * Entscheidender Fehler einer verlorenen Partie: mein erster Fehler oder Patzer, nach dem meine Gewinnchance
 * bis zum Ende nie wieder über 50 % stieg. null = kein solcher Zug (z. B. Zeit überschritten in guter Stellung
 * oder nur durch viele kleine Ungenauigkeiten verloren).
 */
export function decisiveError(sides: { white: MoveAnalysis[]; black: MoveAnalysis[] }, me: Side): MoveAnalysis | null {
  const opp: Side = me === 'white' ? 'black' : 'white';
  // Meine Gewinnchance nach jedem Halbzug (beim Gegnerzug aus seiner Sicht umgedreht)
  const curve = [...sides[me].map((m) => ({ ply: m.ply, win: m.winAfter })), ...sides[opp].map((m) => ({ ply: m.ply, win: 100 - m.winAfter }))].sort((a, b) => a.ply - b.ply);
  const mine = [...sides[me]].sort((a, b) => a.ply - b.ply);
  for (const m of mine) {
    if (m.class !== 'mistake' && m.class !== 'blunder') continue;
    if (curve.every((p) => p.ply < m.ply || p.win <= 50)) return m;
  }
  return null;
}
