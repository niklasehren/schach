/**
 * Bewertungsregeln 1:1 nach Lichess (lila: modules/tree/src/main/Advice.scala,
 * ui/lib/src/ceval/winningChances.ts). Alle Werte hier sind rein rechnerisch – ohne Engine testbar.
 */
import { Chess } from 'chess.js';
import type { MoveClass, Phase, PositionEval, Side } from '../db/schema';

/** Gewinnchance −1 … +1 aus Hundertstel-Bauern (vorher auf ±1000 begrenzt) */
export function winningChances(cp: number): number {
  const c = Math.max(-1000, Math.min(1000, cp));
  return 2 / (1 + Math.exp(-0.00368208 * c)) - 1;
}

/** Gewinnchance bei „Matt in n“ (Lichess: je näher das Matt, desto höher, wie 1100–2000 cp) */
export function mateWinningChances(mate: number): number {
  const cp = (21 - Math.min(10, Math.abs(mate))) * 100;
  return 2 / (1 + Math.exp(-0.00368208 * (mate > 0 ? cp : -cp))) - 1;
}

/** Bewertung aus Sicht einer Farbe (Weiß-Sicht wird für Schwarz umgedreht) */
export type Pov = { cp?: number; mate?: number };
export function pov(ev: Pick<PositionEval, 'cp' | 'mate'>, side: Side): Pov {
  const s = side === 'white' ? 1 : -1;
  return ev.mate !== undefined ? { mate: ev.mate === 0 ? 0 : s * ev.mate } : { cp: s * (ev.cp ?? 0) };
}

/**
 * Gewinnchance −1 … +1 aus Sicht des Spielers. matedSide: In einer Mattstellung (mate = 0)
 * ist die Seite am Zug matt.
 */
export function povChances(p: Pov, matedHere = false): number {
  if (p.mate === 0) return matedHere ? -1 : 1;
  return p.mate !== undefined ? mateWinningChances(p.mate) : winningChances(p.cp ?? 0);
}

/** In Prozent 0–100 */
export const toPercent = (chances: number) => 50 + 50 * chances;

export type Judgement = { class: MoveClass; kind: 'cp' | 'mateCreated' | 'mateLost' };

/**
 * Bewertet einen Zug. before/after: Bewertung vor und nach dem Zug, beide aus Sicht des Ziehenden.
 * - Normal: Verlust an Gewinnchance ≥ 0,3 Patzer, ≥ 0,2 Fehler, ≥ 0,1 Ungenauigkeit (Skala −1 … +1).
 * - Matt zugelassen (vorher kein Matt, danach setzt der Gegner matt): Patzer; stand ich schon unter −7 Fehler, unter −10 nur Ungenauigkeit.
 * - Eigenes Matt verloren: Patzer; stehe ich danach noch über +7 Fehler, über +10 nur Ungenauigkeit.
 */
export function judge(before: Pov, after: Pov): Judgement | null {
  if (before.cp !== undefined && after.cp !== undefined) {
    const delta = winningChances(before.cp) - winningChances(after.cp);
    if (delta >= 0.3) return { class: 'blunder', kind: 'cp' };
    if (delta >= 0.2) return { class: 'mistake', kind: 'cp' };
    if (delta >= 0.1) return { class: 'inaccuracy', kind: 'cp' };
    return null;
  }
  const prevCp = before.cp ?? 0;
  const nextCp = after.cp ?? 0;
  const created = before.mate === undefined && after.mate !== undefined && after.mate < 0;
  const lost = before.mate !== undefined && before.mate > 0 && (after.mate === undefined || after.mate < 0);
  if (created) {
    if (prevCp < -999) return { class: 'inaccuracy', kind: 'mateCreated' };
    if (prevCp < -700) return { class: 'mistake', kind: 'mateCreated' };
    return { class: 'blunder', kind: 'mateCreated' };
  }
  if (lost) {
    if (nextCp > 999) return { class: 'inaccuracy', kind: 'mateLost' };
    if (nextCp > 700) return { class: 'mistake', kind: 'mateLost' };
    return { class: 'blunder', kind: 'mateLost' };
  }
  return null;
}

/** Matt übersehen: vorher hatte ich ein erzwungenes Matt, danach nicht mehr (Mattsetzen selbst = mate 0 zählt nicht) */
export const missedMate = (before: Pov, after: Pov) =>
  before.mate !== undefined && before.mate > 0 && !(after.mate !== undefined && after.mate >= 0);

/** Matt zugelassen: danach hat der Gegner ein erzwungenes Matt, vorher nicht */
export const allowedMate = (before: Pov, after: Pov) =>
  after.mate !== undefined && after.mate < 0 && !(before.mate !== undefined && before.mate < 0);

const values: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

/** Material aus Sicht einer Farbe (eigenes minus gegnerisches, in Bauerneinheiten) */
export function materialBalance(fen: string, side: Side): number {
  let balance = 0;
  for (const ch of fen.split(' ')[0]) {
    const lower = ch.toLowerCase();
    if (!(lower in values)) continue;
    balance += ch === lower ? -values[lower] : values[lower];
  }
  return side === 'white' ? balance : -balance;
}

/**
 * Spielphase der Stellung (vor dem Zug). Schwellen laut PLAN.md, an echten Partien nachjustierbar:
 * - Endspiel: keine Damen mehr und je Seite höchstens 2 Leichtfiguren/Türme – oder insgesamt höchstens 4 Figuren (ohne Könige und Bauern), z. B. D+T gegen D+T.
 * - Eröffnung: bis Zug 12, solange höchstens 2 Figuren (ohne Bauern) vom Brett sind.
 * - sonst Mittelspiel.
 */
export function phaseOf(fen: string): Phase {
  const [board, , , , , fullmove] = fen.split(' ');
  const count = { w: { q: 0, minorRook: 0 }, b: { q: 0, minorRook: 0 } };
  for (const ch of board) {
    const lower = ch.toLowerCase();
    if (!'qrbn'.includes(lower)) continue;
    const side = ch === lower ? count.b : count.w;
    if (lower === 'q') side.q++;
    else side.minorRook++;
  }
  const pieces = count.w.q + count.b.q + count.w.minorRook + count.b.minorRook;
  const noQueens = count.w.q + count.b.q === 0;
  if ((noQueens && count.w.minorRook <= 2 && count.b.minorRook <= 2) || pieces <= 4) return 'endgame';
  if (Number(fullmove) <= 12 && pieces >= 12) return 'opening';
  return 'middlegame';
}

/**
 * Figur eingestellt: Nach meinem Zug gewinnt der Gegner mit seiner besten Antwort (kurze Engine-Variante)
 * mindestens 2 Bauerneinheiten. Gemessen wird das Material nach bis zu 4 Halbzügen der Variante
 * (Gegner – ich – Gegner – ich), also nachdem ich zurückschlagen konnte. So zählt ein Abtausch nicht,
 * eine Gabel (Schach, König weg, Dame fällt) aber schon. Rückgabe: Materialverlust gegenüber vor meinem Zug.
 */
export function materialLossAfterPv(fenBefore: string, fenAfter: string, pv: string[] | undefined, mover: Side): number {
  const start = materialBalance(fenBefore, mover);
  const chess = new Chess(fenAfter);
  for (const uci of (pv ?? []).slice(0, 4)) {
    try {
      chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    } catch {
      break;
    }
  }
  return Math.max(0, start - materialBalance(chess.fen(), mover));
}

/** Grundzeit in Sekunden aus dem TimeControl-Header („600“, „180+2“). Fernschach („1/86400“, „-“) → null */
export function baseTimeFrom(timeControl: string | null | undefined, timeClass?: string | null): number | null {
  if (!timeControl || timeClass === 'daily') return null;
  const m = timeControl.match(/^(\d+)(?:\+\d+)?$/);
  return m ? Number(m[1]) : null;
}

/** Zeitnot: Restzeit unter 10 % der Grundzeit. null = ohne Uhr bzw. Fernschach */
export function inTimeTrouble(clock: number | null, base: number | null): boolean | null {
  if (clock === null || base === null) return null;
  return clock < base * 0.1;
}
