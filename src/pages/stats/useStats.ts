import { useMemo } from 'react';
import { db } from '../../db/schema';
import { useLive } from '../../db/useLive';
import { gameFact, type GameFact } from '../../stats/insights';
import { HYPOTHESES_KEY, initialHypotheses, type Hypothesis } from '../../stats/hypotheses';

/** Alle Partien als Fakten (Partie + Analyse + Eröffnung) und meine Vermutungen */
export function useStats(): { facts: GameFact[]; hypotheses: Hypothesis[]; pending: number } | null {
  const games = useLive(() => db.games.toArray(), []);
  const analyses = useLive(() => db.analyses.toArray(), []);
  const hypotheses = useHypotheses();
  const facts = useMemo(() => {
    if (!games || !analyses) return null;
    const byId = new Map(analyses.map((a) => [a.gameId, a]));
    return games.map((g) => gameFact(g, byId.get(g.id))).filter((f): f is GameFact => !!f);
  }, [games, analyses]);
  if (!facts || !hypotheses) return null;
  // Noch nicht analysiert (mit Zügen)
  const pending = games!.filter((g) => g.plies > 0 && g.myColor && !facts.find((f) => f.id === g.id)?.analysed).length;
  return { facts, hypotheses, pending };
}

/** Meine Vermutungen aus den Einstellungen (ohne gespeicherte Liste: Vorgabe je nach Chess.com-Name) */
export function useHypotheses(): Hypothesis[] | undefined {
  const rows = useLive(() => db.settings.bulkGet([HYPOTHESES_KEY, 'chesscomUsername']), []);
  return rows ? initialHypotheses(rows[0]?.value, rows[1]?.value as string | undefined) : undefined;
}

export async function saveHypotheses(list: Hypothesis[]): Promise<void> {
  await db.settings.put({ key: HYPOTHESES_KEY, value: list });
}
