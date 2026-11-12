// Lichess-Puzzle-Datenbank (database.lichess.org, CC0) einmalig aufbereiten:
// pro Thema eine kleine Auswahl als JSON nach src/data/lichess/ schreiben, die mit der App ausgeliefert wird.
//
//   node scripts/lichess-puzzles.mjs            (lädt die Datei bei Bedarf nach scripts/.cache/)
//   node scripts/lichess-puzzles.mjs <datei.csv.zst>
//
// Format einer Zeile: PuzzleId,FEN,Moves,Rating,RatingDeviation,Popularity,NbPlays,Themes,GameUrl,OpeningTags,DailyDate
// Die FEN ist die Stellung VOR dem Zug des Gegners; der erste Zug in Moves ist der Zug des Gegners.
import { createReadStream, createWriteStream, existsSync, mkdirSync, writeFileSync, statSync } from 'node:fs';
import { createZstdDecompress } from 'node:zlib';
import { createInterface } from 'node:readline';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { join } from 'node:path';
import { Chess } from 'chess.js';

const URL = 'https://database.lichess.org/lichess_db_puzzle.csv.zst';
const ROOT = join(import.meta.dirname, '..');
const CACHE = join(ROOT, 'scripts/.cache/lichess_db_puzzle.csv.zst');
const OUT = join(ROOT, 'src/data/lichess');

/** Themen der App (Lichess-Schlüssel) – deutsche Namen stehen in src/training/themes.ts */
const THEMES = [
  'hangingPiece',
  'fork',
  'pin',
  'skewer',
  'discoveredAttack',
  'mateIn1',
  'mateIn2',
  'backRankMate',
  'defensiveMove',
  'trappedPiece',
  'quietMove',
  'deflection',
  'attraction',
  'promotion',
];

const MIN_RATING = 400;
const MAX_RATING = 1800;
const BUCKET = 100;
const PER_THEME = 300;
/** Nur beliebte, oft gespielte Puzzles mit verlässlichem Rating */
const MIN_POPULARITY = 85;
const MIN_PLAYS = 1000;
const MAX_DEVIATION = 90;

async function download() {
  mkdirSync(join(ROOT, 'scripts/.cache'), { recursive: true });
  console.log('Lade', URL, '…');
  const res = await fetch(URL);
  if (!res.ok || !res.body) throw new Error(`Download fehlgeschlagen: ${res.status}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(CACHE));
}

const file = process.argv[2] ?? CACHE;
if (!process.argv[2] && !existsSync(CACHE)) await download();
console.log('Lese', file, `(${Math.round(statSync(file).size / 1e6)} MB)`);

const buckets = (MAX_RATING - MIN_RATING) / BUCKET;
/** theme → bucket → Kandidaten */
const pool = new Map(THEMES.map((t) => [t, Array.from({ length: buckets }, () => [])]));
let rows = 0;
let kept = 0;

const lines = createInterface({ input: createReadStream(file).pipe(createZstdDecompress()), crlfDelay: Infinity });
for await (const line of lines) {
  if (rows++ === 0) continue; // Kopfzeile
  const f = line.split(',');
  const rating = Number(f[3]);
  if (!(rating >= MIN_RATING && rating < MAX_RATING)) continue;
  if (Number(f[4]) > MAX_DEVIATION || Number(f[5]) < MIN_POPULARITY || Number(f[6]) < MIN_PLAYS) continue;
  const tags = f[7].split(' ');
  const mine = THEMES.filter((t) => tags.includes(t));
  if (mine.length === 0) continue;
  kept++;
  const p = { id: f[0], fen: f[1], moves: f[2], rating, plays: Number(f[6]) };
  const b = Math.floor((rating - MIN_RATING) / BUCKET);
  for (const t of mine) pool.get(t)[b].push(p);
  if (rows % 1_000_000 === 0) console.log(`  ${rows / 1e6} Mio. Zeilen …`);
}
console.log(`${rows - 1} Puzzles gelesen, ${kept} passen zu den Filtern.`);

/** Zugfolge muss legal sein; mein Zug ist jeder zweite ab dem zweiten */
function valid(p) {
  try {
    const c = new Chess(p.fen);
    for (const uci of p.moves.split(' ')) c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    return p.moves.split(' ').length % 2 === 0;
  } catch {
    return false;
  }
}

/** Gleichmäßig über die Rating-Stufen verteilen; innerhalb einer Stufe die meistgespielten zuerst */
function pick(byBucket) {
  for (const list of byBucket) list.sort((a, b) => b.plays - a.plays || a.id.localeCompare(b.id));
  const chosen = byBucket.map(() => []);
  const idx = byBucket.map(() => 0);
  let total = 0;
  let progress = true;
  while (total < PER_THEME && progress) {
    progress = false;
    for (let b = 0; b < byBucket.length && total < PER_THEME; b++) {
      while (idx[b] < byBucket[b].length) {
        const p = byBucket[b][idx[b]++];
        if (!valid(p)) continue;
        chosen[b].push(p);
        total++;
        progress = true;
        break;
      }
    }
  }
  return chosen.flat().sort((a, b) => a.rating - b.rating || a.id.localeCompare(b.id));
}

mkdirSync(OUT, { recursive: true });
const counts = {};
let bytes = 0;
for (const t of THEMES) {
  const list = pick(pool.get(t));
  counts[t] = list.length;
  const json = JSON.stringify(list.map((p) => [p.id, p.fen, p.moves, p.rating]));
  writeFileSync(join(OUT, `${t}.json`), json + '\n');
  bytes += json.length;
  console.log(`${t.padEnd(18)} ${String(list.length).padStart(4)} Puzzles, Rating ${list[0]?.rating}–${list.at(-1)?.rating}, ${Math.round(json.length / 1024)} kB`);
}
writeFileSync(
  join(OUT, 'meta.json'),
  JSON.stringify(
    {
      source: URL,
      license: 'CC0 (Lichess)',
      created: new Date().toISOString().slice(0, 10),
      filters: { rating: [MIN_RATING, MAX_RATING], minPopularity: MIN_POPULARITY, minPlays: MIN_PLAYS, maxDeviation: MAX_DEVIATION, perTheme: PER_THEME },
      counts,
    },
    null,
    2,
  ) + '\n',
);
console.log(`Gesamt ${Math.round(bytes / 1024)} kB (unkomprimiert)`);
