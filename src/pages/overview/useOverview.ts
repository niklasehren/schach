import { useEffect, useMemo, useState } from 'react';
import { db, type AnalysisRecord, type GameRecord, type PuzzleRecord } from '../../db/schema';
import { useLive } from '../../db/useLive';
import { useQueueState } from '../../analysis/useQueue';
import { ERROR_TYPE_LABELS } from '../../analysis/errorTypes';
import { practicedToday, practiceQueue, startOfDay, todaysQueue } from '../../training/leitner';
import { getPuzzleRating, previewLichessPuzzle } from '../../training/general';
import { themeOf } from '../../training/themes';
import type { LichessPuzzle } from '../../training/lichess';
import { coach, errorRows, gameStats } from '../../stats/coach';

export type Preview = {
  fen: string;
  orientation: 'white' | 'black';
  lastMove?: [string, string];
  /** Woher die Stellung kommt, z. B. „aus deiner Partie gegen X am 12.11.2026“ */
  source: 'mine' | 'general';
  game?: GameRecord;
  /** Fehlerart bzw. Thema der Stellung */
  topic: string | null;
};

const sideToMove = (fen: string) => (fen.split(' ')[1] === 'b' ? 'black' : 'white');

function puzzleTopic(p: PuzzleRecord, analyses: AnalysisRecord[]): string | null {
  const a = analyses.find((x) => x.gameId === p.gameId);
  const side = a?.myColor;
  const m = side ? a?.sides?.[side].find((x) => x.ply === p.ply) : undefined;
  return m?.errorType && m.errorType !== 'other' ? ERROR_TYPE_LABELS[m.errorType] : null;
}

/** Alle Daten der Übersicht an einem Ort, damit die Darstellung austauschbar bleibt */
export function useOverview() {
  const games = useLive(() => db.games.orderBy('date').reverse().toArray(), []);
  const analyses = useLive(() => db.analyses.where('status').equals('done').toArray(), []);
  const puzzles = useLive(() => db.puzzles.toArray(), []);
  const attemptsToday = useLive(() => db.attempts.where('date').aboveOrEqual(startOfDay(Date.now())).toArray(), []);
  const rating = useLive(() => getPuzzleRating(), []);
  const queue = useQueueState();
  const [general, setGeneral] = useState<LichessPuzzle | null>(null);

  const now = Date.now();
  const today = puzzles ? todaysQueue(puzzles, now) : null;
  const first = today ? (today.due[0] ?? today.fresh[0] ?? null) : null;
  const needGeneral = !!puzzles && !first;

  // Nichts fällig: Stellung aus dem Allgemeinen Training (passend zu meinen Schwächen)
  useEffect(() => {
    if (!needGeneral || general) return;
    let alive = true;
    void previewLichessPuzzle().then((p) => alive && setGeneral(p));
    return () => {
      alive = false;
    };
  }, [needGeneral, general]);

  const stats = useMemo(() => (games && analyses ? gameStats(games, analyses) : []), [games, analyses]);
  const coachInfo = useMemo(() => coach(stats, now), [stats]); // eslint-disable-line react-hooks/exhaustive-deps
  const errors = useMemo(() => errorRows(stats, now), [stats]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!games || !analyses || !puzzles || !today) return null;

  let preview: Preview | null = null;
  if (first) {
    const game = games.find((g) => g.id === first.gameId);
    preview = { fen: first.fen, orientation: sideToMove(first.fen), source: 'mine', game, topic: puzzleTopic(first, analyses) };
  } else if (general) {
    const mv = general.opponentMove;
    preview = { fen: general.fen, orientation: sideToMove(general.fen), lastMove: [mv.slice(0, 2), mv.slice(2, 4)], source: 'general', topic: themeOf(general.theme)?.label ?? null };
  }

  const totalErrors = errors.reduce((s, e) => s + e.count, 0);
  return {
    games,
    analyses,
    puzzles,
    queue,
    puzzleRating: rating?.rating ?? null,
    due: today.due.length + today.fresh.length,
    fresh: today.fresh.length,
    repeats: today.due.length,
    practice: practiceQueue(puzzles).length,
    practiced: practicedToday(attemptsToday ?? [], now),
    preview,
    coach: coachInfo,
    errors: errors.filter((e) => e.type !== 'other'),
    positional: errors.find((e) => e.type === 'other')?.count ?? 0,
    totalErrors,
    byId: new Map(analyses.map((a) => [a.gameId, a])),
  };
}

export type OverviewData = NonNullable<ReturnType<typeof useOverview>>;
