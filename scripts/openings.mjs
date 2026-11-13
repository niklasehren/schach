// Erzeugt src/data/openings.json aus der freien Eröffnungsliste lichess-org/chess-openings (CC0-1.0).
// Aufruf: node scripts/openings.mjs (lädt die fünf TSV-Dateien einmal nach scripts/.cache/openings).
// Ergebnis: Stellung (FEN ohne Zugzähler) → Eröffnungsfamilie, ECO-Code → Familie. Siehe PLAN.md, Abschnitt Statistik.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { Chess } from 'chess.js';

const DIR = 'scripts/.cache/openings';
const SRC = 'https://raw.githubusercontent.com/lichess-org/chess-openings/master';
mkdirSync(DIR, { recursive: true });
for (const f of ['a', 'b', 'c', 'd', 'e']) {
  if (existsSync(`${DIR}/${f}.tsv`)) continue;
  const res = await fetch(`${SRC}/${f}.tsv`);
  if (!res.ok) throw new Error(`${f}.tsv: ${res.status}`);
  writeFileSync(`${DIR}/${f}.tsv`, await res.text());
}

/** Familie = Name vor dem Doppelpunkt, ohne „Accepted/Declined“ und ohne „, with …“ (außer beim Damengambit) */
export function familyOf(name) {
  let f = name.split(':')[0].split(', with')[0].trim();
  if (!/^Queen's Gambit/.test(f)) f = f.replace(/ (Accepted|Declined)$/, '');
  return f;
}

const rows = ['a', 'b', 'c', 'd', 'e'].flatMap((f) =>
  readFileSync(`${DIR}/${f}.tsv`, 'utf8')
    .trim()
    .split('\n')
    .slice(1)
    .map((l) => l.split('\t')),
);

const families = [];
const famIndex = (f) => {
  let i = families.indexOf(f);
  if (i < 0) i = families.push(f) - 1;
  return i;
};
const pos = {};
const ecoFirst = {};
const ecoFams = {};
for (const [eco, name, pgn] of rows) {
  const fam = famIndex(familyOf(name));
  const c = new Chess();
  c.loadPgn(pgn);
  const key = c.fen().split(' ').slice(0, 4).join(' ');
  // Bei gleicher Stellung gewinnt der erste (allgemeinere) Eintrag der Liste
  if (!(key in pos)) pos[key] = fam;
  (ecoFams[eco] ??= new Set()).add(fam);
  const plies = c.history().length;
  if (!ecoFirst[eco] || plies < ecoFirst[eco].plies) ecoFirst[eco] = { fam, plies };
}
// ECO-Code → Familie des kürzesten Eintrags mit diesem Code (der allgemeinste, z. B. D00 = Damenbauernspiel).
// Sammelcodes mit vielen Familien (z. B. A00 = alle ungewöhnlichen ersten Züge) → -1: dann entscheiden die Züge.
const eco = Object.fromEntries(Object.entries(ecoFirst).map(([code, v]) => [code, ecoFams[code].size > 3 ? -1 : v.fam]));
console.log('Sammelcodes:', Object.entries(eco).filter(([, f]) => f < 0).map(([c]) => c).join(' '));

writeFileSync(
  'src/data/openings.json',
  JSON.stringify({ source: 'lichess-org/chess-openings (CC0-1.0)', families, eco, pos }),
);
console.log(`${rows.length} Einträge, ${Object.keys(pos).length} Stellungen, ${families.length} Familien, ${Object.keys(eco).length} ECO-Codes`);
