/**
 * Spielstärke-Stufen für den Regler. Oberhalb von Elo 1320 nutzt Stockfish die eingebaute
 * Elo-Begrenzung (UCI_Elo, geprüft: Spanne 1320–3190). Darunter gibt es nur den „Skill Level“ 0–20,
 * für den Stockfish keine Elo-Zahl angibt – daher dort nur „Stufe“ ohne Elo.
 */
export type Strength = { kind: 'skill'; skill: number } | { kind: 'elo'; elo: number };

export const strengthLevels: Strength[] = [
  { kind: 'skill', skill: 0 },
  { kind: 'skill', skill: 3 },
  { kind: 'skill', skill: 6 },
  { kind: 'skill', skill: 9 },
  ...[1320, 1400, 1500, 1600, 1700, 1800, 1900, 2000, 2200, 2400, 2600, 2800, 3000].map(
    (elo): Strength => ({ kind: 'elo', elo }),
  ),
];

export const defaultStrengthIndex = strengthLevels.findIndex((s) => s.kind === 'elo' && s.elo === 1500);

const skillCount = strengthLevels.filter((s) => s.kind === 'skill').length;

/**
 * Empfohlene Stufe aus der Chess.com-Wertung. Stockfish-Stufen und Chess.com-Wertung sind nicht direkt vergleichbar
 * (Stockfish begrenzt spielt anders als ein Mensch gleicher Zahl), daher eine bewusst vorsichtige, grobe Zuordnung:
 * unter 600 Einsteiger 1/4, unter 900 Einsteiger 2/4, unter 1100 Einsteiger 3/4, unter 1400 Einsteiger 4/4,
 * darüber die nächstniedrigere Elo-Stufe. Ohne Wertung: Einsteiger 2/4.
 */
export function recommendedStrengthIndex(rating: number | null): number {
  const skill = (n: number) => strengthLevels.findIndex((l) => l.kind === 'skill' && l.skill === [0, 3, 6, 9][n]);
  if (rating === null) return skill(1);
  if (rating < 600) return skill(0);
  if (rating < 900) return skill(1);
  if (rating < 1100) return skill(2);
  if (rating < 1400) return skill(3);
  let best = strengthLevels.findIndex((l) => l.kind === 'elo');
  strengthLevels.forEach((l, i) => {
    if (l.kind === 'elo' && l.elo <= rating) best = i;
  });
  return best;
}

export function strengthLabel(s: Strength): string {
  if (s.kind === 'elo') return `Elo ${s.elo}`;
  const step = strengthLevels.findIndex((l) => l.kind === 'skill' && l.skill === s.skill) + 1;
  return `Einsteiger ${step}/${skillCount}`;
}

export function strengthHint(s: Strength): string {
  return s.kind === 'elo' ? 'Stockfish begrenzt auf diese Elo-Zahl' : `unter Elo 1320 · Stockfish Skill Level ${s.skill}`;
}

/** UCI-Einstellungen für die gewählte Stärke */
export function strengthOptions(s: Strength): Record<string, string | number | boolean> {
  return s.kind === 'elo'
    ? { 'Skill Level': 20, UCI_LimitStrength: true, UCI_Elo: s.elo }
    : { UCI_LimitStrength: false, 'Skill Level': s.skill };
}
