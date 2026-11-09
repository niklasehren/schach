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
