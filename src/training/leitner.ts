import type { PuzzleRecord } from '../db/schema';

/** Leitner-Kästen 1–5: Abstand bis zur nächsten Wiederholung in Tagen */
export const INTERVALS = [1, 3, 7, 14, 30] as const;
/** Höchstens so viele neue Puzzles pro Tag */
export const NEW_PER_DAY = 10;

const DAY = 24 * 60 * 60 * 1000;

export function startOfDay(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Ein Tag später (lokal, sommerzeitfest) */
export function addDays(dayStart: number, days: number): number {
  const d = new Date(dayStart);
  d.setDate(d.getDate() + days);
  return d.getTime();
}

/**
 * Nach einem Versuch: richtig (beim ersten Versuch) → einen Kasten weiter, falsch → Kasten 1 (morgen wieder).
 * Ein neues Puzzle (Kasten 0) zählt wie Kasten 1.
 */
export function schedule(box: number, correct: boolean, now: number): { box: number; due: number } {
  const current = Math.max(1, box);
  const next = correct ? Math.min(INTERVALS.length, current + 1) : 1;
  return { box: next, due: addDays(startOfDay(now), INTERVALS[next - 1]) };
}

export const isDue = (p: PuzzleRecord, now: number) => p.box > 0 && p.due !== null && p.due <= startOfDay(now) + DAY - 1;

/**
 * Heutige Aufgaben: alle fälligen Wiederholungen (älteste zuerst), dazu neue Puzzles bis zum Tageslimit –
 * Patzer vor Fehlern, neuere Partien zuerst, innerhalb einer Partie in Zugreihenfolge.
 */
export function todaysQueue(puzzles: PuzzleRecord[], now: number, newPerDay = NEW_PER_DAY): { due: PuzzleRecord[]; fresh: PuzzleRecord[] } {
  const today = startOfDay(now);
  const due = puzzles.filter((p) => isDue(p, now)).sort((a, b) => a.due! - b.due! || a.id.localeCompare(b.id));
  const seenToday = puzzles.filter((p) => p.firstSeen !== null && p.firstSeen >= today).length;
  const room = Math.max(0, newPerDay - seenToday);
  const fresh = puzzles
    .filter((p) => p.box === 0)
    .sort((a, b) => (a.class === b.class ? 0 : a.class === 'blunder' ? -1 : 1) || b.gameDate - a.gameDate || a.ply - b.ply)
    .slice(0, room);
  return { due, fresh };
}

/** Text für den Abstand bis zur nächsten Wiederholung */
export function dueText(due: number, now: number): string {
  const days = Math.round((startOfDay(due) - startOfDay(now)) / DAY);
  if (days <= 0) return 'heute';
  if (days === 1) return 'morgen';
  return `in ${days} Tagen`;
}
