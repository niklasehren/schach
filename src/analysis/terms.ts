/** Schach-Fachbegriffe mit kurzer Erklärung (zum Antippen in der Analyse) */
export const TERMS = {
  ungedeckt: { label: 'ungedeckt', text: 'Keine eigene Figur schützt diese Figur. Wird sie geschlagen, kann man nicht zurückschlagen.' },
  zwischenzug: {
    label: 'Zwischenzug',
    text: 'Ein Zug, auf den der Gegner sofort reagieren muss (zum Beispiel ein Schach), bevor man sich um die eigentliche Drohung kümmert.',
  },
  gabel: { label: 'Gabel', text: 'Eine Figur greift zwei oder mehr gegnerische Figuren gleichzeitig an. Meist kann nur eine davon gerettet werden.' },
  haengend: { label: 'hängende Figur', text: 'Eine Figur, die angegriffen und nicht gedeckt ist. Der Gegner kann sie ohne Gegenleistung schlagen.' },
  fesselung: {
    label: 'Fesselung',
    text: 'Eine Figur kann nicht (oder nur mit Verlust) ziehen, weil dahinter eine wertvollere Figur oder der König stehen würde.',
  },
  spiess: { label: 'Spieß', text: 'Eine wertvolle Figur wird angegriffen; zieht sie weg, wird die Figur dahinter geschlagen.' },
  abzug: { label: 'Abzugsangriff', text: 'Eine Figur zieht weg und gibt dadurch die Linie für eine andere eigene Figur frei, die nun angreift.' },
  mattdrohung: { label: 'Mattdrohung', text: 'Der Gegner droht, im nächsten Zug matt zu setzen.' },
  erzwungenesMatt: { label: 'erzwungenes Matt', text: 'Ein Matt, das sich nicht mehr verhindern lässt – egal, wie sich der Gegner verteidigt.' },
} as const;

export type TermKey = keyof typeof TERMS;
