import { db, type AnalysisRecord, type GameRecord } from '../db/schema';
import { parseGame } from './analyze';
import { explain, type RuleKey } from './explain';
import { pov } from './rules';

export const ERROR_TYPES_VERSION = 1;

/** Fehlerarten für die Statistik – aus der wichtigsten Regel zum gespielten Zug */
export const ERROR_TYPE_LABELS: Record<string, string> = {
  mateAllowed: 'Matt zugelassen',
  mateMissed: 'Matt übersehen',
  threatMissed: 'Drohung übersehen',
  undefended: 'Figur oder Bauer ungedeckt gelassen',
  fork: 'Gabel übersehen',
  pieceTaken: 'Material eingestellt',
  forcingUseless: 'Schach oder Schlagzug ohne Wirkung',
  other: 'Stellungsfehler (ohne klare Taktik)',
};

const fromRule: Partial<Record<RuleKey, string>> = {
  mateAllowed: 'mateAllowed',
  mateMissed: 'mateMissed',
  threatMissed: 'threatMissed',
  undefendedTaken: 'undefended',
  hanging: 'undefended',
  fork: 'fork',
  pieceTaken: 'pieceTaken',
  materialLoss: 'pieceTaken',
  checkUseless: 'forcingUseless',
  captureUseless: 'forcingUseless',
};

/** Fehlerart eines meiner Fehler: erste passende Regel aus „Warum … schlecht ist“, sonst Stellungsfehler */
export function errorTypeOf(playedRules: RuleKey[]): string {
  for (const r of playedRules) if (fromRule[r]) return fromRule[r]!;
  return 'other';
}

/** Trägt die Fehlerart in meine Fehler und Patzer einer Analyse ein */
export function withErrorTypes(game: GameRecord, analysis: AnalysisRecord): AnalysisRecord {
  if (!game.myColor || !analysis.sides || analysis.status !== 'done') return { ...analysis, errorTypesVersion: ERROR_TYPES_VERSION };
  const parsed = parseGame(game);
  const side = game.myColor;
  const moves = analysis.sides[side].map((m) => {
    if (m.class !== 'mistake' && m.class !== 'blunder') return m;
    const before = analysis.evals[m.ply - 1];
    const after = analysis.evals[m.ply];
    if (!before || !after) return m;
    const last = parsed.moves[m.ply - 2];
    try {
      const e = explain({
      fenBefore: parsed.fens[m.ply - 1],
      played: m.uci,
      bestPv: before.pv ?? [],
      replyPv: after.pv ?? [],
      before: pov(before, side),
      after: pov(after, side),
      lastMove: last ? { fen: parsed.fens[m.ply - 2], uci: last.from + last.to + (last.promotion ?? '') } : undefined,
    });
      return { ...m, errorType: errorTypeOf(e.played.map((i) => i.rule)) };
    } catch {
      return m;
    }
  });
  return { ...analysis, sides: { ...analysis.sides, [side]: moves }, errorTypesVersion: ERROR_TYPES_VERSION };
}

/** Ältere Analysen schrittweise nachtragen (eine Partie pro Takt, damit die Oberfläche flüssig bleibt) */
export async function backfillErrorTypes(): Promise<number> {
  const done = await db.analyses.where('status').equals('done').toArray();
  let n = 0;
  for (const a of done) {
    if (a.errorTypesVersion === ERROR_TYPES_VERSION) continue;
    const game = await db.games.get(a.gameId);
    if (!game) continue;
    try {
      await db.analyses.put(withErrorTypes(game, a));
      n++;
    } catch (e) {
      console.warn('Fehlerarten nicht berechnet', a.gameId, e);
    }
    await new Promise((r) => setTimeout(r, 30));
  }
  return n;
}

/** Häufigste Fehlerarten über alle analysierten Partien (nur meine Fehler und Patzer) */
export function countErrorTypes(analyses: AnalysisRecord[]): { type: string; label: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const a of analyses) {
    if (!a.myColor || !a.sides) continue;
    for (const m of a.sides[a.myColor]) if (m.errorType) counts.set(m.errorType, (counts.get(m.errorType) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([type, count]) => ({ type, label: ERROR_TYPE_LABELS[type] ?? type, count }))
    .sort((a, b) => b.count - a.count);
}
