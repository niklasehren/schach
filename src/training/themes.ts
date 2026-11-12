/** Themen des Allgemeinen Trainings (Schlüssel wie in der Lichess-Puzzle-Datenbank) */
export const THEMES = [
  { key: 'hangingPiece', label: 'Hängende Figur', explain: 'Eine Figur steht ungedeckt und kann einfach geschlagen werden. Schau zuerst, was ungeschützt herumsteht – bei dir und beim Gegner.' },
  { key: 'fork', label: 'Gabel', explain: 'Eine Figur greift zwei gegnerische Figuren gleichzeitig an. Der Gegner kann nur eine retten.' },
  { key: 'pin', label: 'Fesselung', explain: 'Eine Figur darf nicht wegziehen, weil sonst eine wertvollere Figur dahinter (oft der König) angegriffen wäre. Gefesselte Figuren kann man gezielt angreifen.' },
  { key: 'skewer', label: 'Spieß', explain: 'Wie eine Fesselung, nur umgekehrt: Die wertvollere Figur steht vorn und muss weg – dann fällt die Figur dahinter.' },
  { key: 'discoveredAttack', label: 'Abzugsangriff', explain: 'Eine Figur zieht weg und gibt dabei die Linie für eine andere frei. So entstehen zwei Drohungen auf einmal.' },
  { key: 'mateIn1', label: 'Matt in 1', explain: 'Ein einziger Zug setzt matt. Prüfe alle Schachgebote – auch die unscheinbaren.' },
  { key: 'mateIn2', label: 'Matt in 2', explain: 'Mit zwei Zügen setzt du matt, egal was der Gegner antwortet. Meist zwingt der erste Zug den König in ein Mattnetz.' },
  { key: 'backRankMate', label: 'Grundreihenmatt', explain: 'Der König steht hinter seinen eigenen Bauern eingesperrt. Ein Turm oder die Dame auf der Grundreihe setzt matt.' },
  { key: 'defensiveMove', label: 'Verteidigen', explain: 'Der Gegner droht etwas. Finde den Zug, der die Drohung abwehrt, ohne neues Material zu verlieren.' },
  { key: 'trappedPiece', label: 'Gefangene Figur', explain: 'Eine Figur hat kein sicheres Feld mehr. Greif sie an – sie kann nicht entkommen.' },
  { key: 'quietMove', label: 'Ruhiger Zug', explain: 'Der beste Zug ist kein Schach und kein Schlagzug, bereitet aber eine Drohung vor, gegen die es keine Abwehr gibt.' },
  { key: 'deflection', label: 'Ablenkung', explain: 'Eine gegnerische Figur wird von ihrer Aufgabe weggelockt, zum Beispiel vom Decken eines Feldes oder einer Figur.' },
  { key: 'attraction', label: 'Hinlenkung', explain: 'Eine gegnerische Figur, oft der König, wird auf ein bestimmtes Feld gezwungen – meist durch ein Opfer –, wo sie dann angegriffen wird.' },
  { key: 'promotion', label: 'Umwandlung', explain: 'Ein Bauer erreicht die letzte Reihe und wird zur Dame (oder einer anderen Figur). Oft muss man vorher den Weg freiräumen.' },
] as const;

export type ThemeKey = (typeof THEMES)[number]['key'];
export const THEME_KEYS = THEMES.map((t) => t.key) as ThemeKey[];
export const themeOf = (key: string) => THEMES.find((t) => t.key === key);

/**
 * Welche Themen helfen gegen welche meiner Fehlerarten (aus der Analyse, siehe errorTypes.ts).
 * Regel: Ein Thema bekommt nur Gewicht, wenn sein Muster direkt zur erkannten Fehlerart passt.
 * Fesselung, Spieß, Abzugsangriff, Gefangene Figur, Hinlenkung und Umwandlung erkennt die Analyse
 * (noch) nicht als eigene Fehlerart – sie kommen nur über den Grundanteil dran.
 * Die Anzahl einer Fehlerart wird gleichmäßig auf ihre Themen verteilt.
 * „Stellungsfehler ohne klare Taktik“ (other) hat kein passendes Taktik-Thema.
 */
export const ERROR_THEMES: Record<string, ThemeKey[]> = {
  // Matt zugelassen: Mattmuster kennen (sie dann auch beim Gegner sehen) und rechtzeitig verteidigen
  mateAllowed: ['mateIn1', 'mateIn2', 'backRankMate', 'defensiveMove'],
  mateMissed: ['mateIn1', 'mateIn2', 'backRankMate'],
  threatMissed: ['defensiveMove'],
  undefended: ['hangingPiece', 'defensiveMove'],
  fork: ['fork'],
  pieceTaken: ['hangingPiece'],
  forcingUseless: ['quietMove'],
};

/** Anteil, der unabhängig von meinen Fehlern gleichmäßig auf alle Themen geht (damit nichts ganz verschwindet) */
export const BASE_SHARE = 0.2;

/**
 * Gewichte der Themen für „Passend zu meinen Schwächen“ (Summe 1).
 * 80 % nach meinen Fehlerarten, 20 % gleichmäßig. Ohne passende Fehler: alle Themen gleich.
 */
export function themeWeights(errorCounts: { type: string; count: number }[]): Map<ThemeKey, number> {
  const mapped = new Map<ThemeKey, number>(THEME_KEYS.map((k) => [k, 0]));
  for (const { type, count } of errorCounts) {
    const themes = ERROR_THEMES[type];
    if (!themes || count <= 0) continue;
    for (const t of themes) mapped.set(t, mapped.get(t)! + count / themes.length);
  }
  const total = [...mapped.values()].reduce((a, b) => a + b, 0);
  const n = THEME_KEYS.length;
  return new Map(THEME_KEYS.map((k) => [k, total === 0 ? 1 / n : BASE_SHARE / n + ((1 - BASE_SHARE) * mapped.get(k)!) / total]));
}

/** Ein Thema nach Gewicht ziehen (rand: Zahl in [0, 1)) */
export function pickTheme(weights: Map<ThemeKey, number>, rand = Math.random()): ThemeKey {
  let acc = 0;
  for (const [k, w] of weights) {
    acc += w;
    if (rand < acc) return k;
  }
  return [...weights.keys()].at(-1)!;
}
