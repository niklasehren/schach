/**
 * Erklärungen in einfachem Deutsch – nur aus Engine-Daten und chess.js, nur Aussagen, die sich am Brett
 * nachprüfen lassen (Schach, Schlagen, angegriffen/ungedeckt, Materialbilanz, Matt-Angaben der Engine).
 * Passt keine Regel, bleibt die Liste leer; die Oberfläche zeigt dann nur Variante und Gewinnchance.
 */
import { Chess, type Move, type PieceSymbol, type Square } from 'chess.js';
import { toGermanSan } from '../chess/game';
import type { Side } from '../db/schema';
import { materialBalance, type Pov } from './rules';

export type ExplainInput = {
  /** Stellung vor meinem Zug */
  fenBefore: string;
  /** Gespielter Zug (UCI, z. B. „f3f1“) */
  played: string;
  /** Engine-Hauptvariante ab fenBefore (beginnt mit dem besten Zug) */
  bestPv: string[];
  /** Engine-Hauptvariante nach meinem Zug (beginnt mit der besten Antwort des Gegners) */
  replyPv: string[];
  /** Bewertung vor/nach meinem Zug aus meiner Sicht */
  before: Pov;
  after: Pov;
};

export type Explanation = {
  /** Warum der gespielte Zug schlecht war */
  played: string[];
  /** Warum der bessere Zug besser ist */
  better: string[];
};

const values: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };

/** Grammatik der Figurennamen: [Nominativ „dein …“, Akkusativ „deinen …“, Akk. bestimmt „den …“, Nominativ bestimmt „der …“] */
const names: Record<PieceSymbol, { my: string; myAcc: string; theAcc: string; pron: string }> = {
  p: { my: 'dein Bauer', myAcc: 'deinen Bauern', theAcc: 'den Bauern', pron: 'er' },
  n: { my: 'dein Springer', myAcc: 'deinen Springer', theAcc: 'den Springer', pron: 'er' },
  b: { my: 'dein Läufer', myAcc: 'deinen Läufer', theAcc: 'den Läufer', pron: 'er' },
  r: { my: 'dein Turm', myAcc: 'deinen Turm', theAcc: 'den Turm', pron: 'er' },
  q: { my: 'deine Dame', myAcc: 'deine Dame', theAcc: 'die Dame', pron: 'sie' },
  k: { my: 'dein König', myAcc: 'deinen König', theAcc: 'den König', pron: 'er' },
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** UCI-Züge nacheinander ausführen; bricht bei einem ungültigen Zug ab */
export function playLine(fen: string, uci: string[]): Move[] {
  const chess = new Chess(fen);
  const moves: Move[] = [];
  for (const u of uci) {
    try {
      moves.push(chess.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }));
    } catch {
      break;
    }
  }
  return moves;
}

/** Variante als Text mit Zugnummern, z. B. „7. Lxc6+ bxc6 8. Dxc6+“ */
export function lineText(fen: string, moves: Move[]): string {
  const [, turn, , , , full] = fen.split(' ');
  let n = Number(full) || 1;
  let white = turn === 'w';
  const parts: string[] = [];
  moves.forEach((m, i) => {
    if (white) parts.push(`${n}. ${toGermanSan(m.san)}`);
    else parts.push(i === 0 ? `${n}… ${toGermanSan(m.san)}` : toGermanSan(m.san));
    if (!white) n++;
    white = !white;
  });
  return parts.join(' ');
}

const attackedBy = (chess: Chess, sq: Square, side: 'w' | 'b') => chess.attackers(sq, side).length > 0;

/** Bedrohte eigene Figuren (ohne König/Bauern): angegriffen und ungedeckt oder von einer schwächeren Figur angegriffen */
function threatened(fen: string, me: 'w' | 'b'): { square: Square; type: PieceSymbol }[] {
  const chess = new Chess(fen);
  const opp = me === 'w' ? 'b' : 'w';
  const out: { square: Square; type: PieceSymbol }[] = [];
  for (const row of chess.board()) {
    for (const p of row) {
      if (!p || p.color !== me || p.type === 'k' || p.type === 'p') continue;
      const attackers = chess.attackers(p.square, opp);
      if (attackers.length === 0) continue;
      const defended = chess.attackers(p.square, me).length > 0;
      const cheaper = attackers.some((sq) => values[chess.get(sq)!.type] < values[p.type]);
      if (!defended || cheaper) out.push({ square: p.square, type: p.type });
    }
  }
  return out;
}

/** „Material im Wert von einem Bauern“ / „… von 3 Bauern“ */
function materialText(diff: number): string {
  return `Material im Wert von ${diff === 1 ? 'einem Bauern' : `${diff} Bauern`}`;
}

export function explain(input: ExplainInput): Explanation {
  const played: string[] = [];
  const better: string[] = [];
  const meCode = new Chess(input.fenBefore).turn();
  const me: Side = meCode === 'w' ? 'white' : 'black';
  const oppCode = meCode === 'w' ? 'b' : 'w';

  const playedMove = playLine(input.fenBefore, [input.played])[0];
  if (!playedMove) return { played, better };
  const fenAfter = playedMove.after;

  // ── Gespielter Zug ──────────────────────────────────────────────
  if (input.before.mate !== undefined && input.before.mate > 0 && !(input.after.mate !== undefined && input.after.mate >= 0)) {
    played.push(`Du hattest Matt in ${input.before.mate} – nach ${toGermanSan(playedMove.san)} ist es weg.`);
  }
  if (input.after.mate !== undefined && input.after.mate < 0 && !(input.before.mate !== undefined && input.before.mate < 0)) {
    const n = -input.after.mate;
    played.push(n === 1 ? 'Nach deinem Zug kann der Gegner sofort matt setzen.' : `Nach deinem Zug kann der Gegner in ${n} Zügen matt setzen.`);
  }

  const reply = playLine(fenAfter, input.replyPv.slice(0, 4));
  const covered = new Set<string>();
  if (reply[0]) {
    const r = reply[0];
    const afterReply = new Chess(r.after);
    const san = toGermanSan(r.san);
    if (r.captured) {
      const victim = names[r.captured];
      const undefended = !attackedBy(new Chess(fenAfter), r.to, meCode);
      played.push(`Die beste Antwort ${san} schlägt ${victim.myAcc} auf ${r.to}${undefended ? ` – ${victim.pron} war ungedeckt` : ''}.`);
      covered.add(r.to);
    }
    // Gabel: die gezogene Figur bedroht danach mindestens zwei eigene Figuren wirklich –
    // König, ungedeckte Figur oder Figur, die mehr wert ist als der Angreifer (gedeckte gleichwertige zählen nicht)
    const forked: { square: Square; type: PieceSymbol }[] = [];
    for (const row of afterReply.board()) {
      for (const p of row) {
        if (!p || p.color !== meCode || values[p.type] < 3) continue;
        if (!afterReply.attackers(p.square, oppCode).includes(r.to)) continue;
        const real = p.type === 'k' || !attackedBy(afterReply, p.square, meCode) || values[p.type] > values[r.piece];
        if (real) forked.push({ square: p.square, type: p.type });
      }
    }
    if (forked.length >= 2) {
      const list = forked
        .sort((a, b) => values[b.type] - values[a.type])
        .map((f) => `${names[f.type].myAcc}${f.type === 'k' ? '' : ` auf ${f.square}`}`);
      played.push(`Die beste Antwort ${san} greift gleichzeitig ${list.slice(0, -1).join(', ')} und ${list.at(-1)} an (Gabel).`);
      forked.forEach((f) => covered.add(f.square));
    } else if (r.san.includes('+') && !r.captured) {
      played.push(`Die beste Antwort ${san} gibt Schach.`);
    }
  }

  // Hängende Figuren nach meinem Zug: angegriffen und ungedeckt (Leichtfiguren und mehr)
  const afterChess = new Chess(fenAfter);
  const hanging: string[] = [];
  for (const row of afterChess.board()) {
    for (const p of row) {
      if (!p || p.color !== meCode || values[p.type] < 3 || p.type === 'k' || covered.has(p.square)) continue;
      if (attackedBy(afterChess, p.square, oppCode) && !attackedBy(afterChess, p.square, meCode)) hanging.push(`${names[p.type].my} auf ${p.square}`);
    }
  }
  if (hanging.length) played.push(`Nach deinem Zug ${hanging.length === 1 ? 'hängt' : 'hängen'} ${hanging.slice(0, 2).join(' und ')} (angegriffen und ungedeckt).`);

  // Materialbilanz nach der wahrscheinlichen Fortsetzung (Gegner – ich – Gegner – ich)
  if (reply.length >= 1) {
    const end = reply[Math.min(reply.length, 4) - 1].after;
    const loss = materialBalance(input.fenBefore, me) - materialBalance(end, me);
    if (loss >= 1) played.push(`Nach ${lineText(fenAfter, reply)} hast du ${materialText(loss)} verloren.`);
  }

  // ── Besserer Zug ───────────────────────────────────────────────
  const line = playLine(input.fenBefore, input.bestPv.slice(0, 6));
  const best = line[0];
  if (!best) return { played, better };
  const bestSan = toGermanSan(best.san);

  if (input.before.mate !== undefined && input.before.mate > 0) {
    better.push(input.before.mate === 1 ? `${bestSan} setzt sofort matt.` : `Mit ${bestSan} beginnt ein Matt in ${input.before.mate} Zügen.`);
  }

  // Zwischenzug: eine eigene Figur ist bedroht, der beste Zug zieht sie nicht weg, sondern gibt Schach/schlägt –
  // und nach meinem nächsten Zug der Variante ist sie nicht mehr angegriffen
  const threats = threatened(input.fenBefore, meCode);
  const forcing = best.san.includes('+') || best.san.includes('#') || !!best.captured;
  let explainedCheck = false;
  for (const t of threats) {
    if (best.from === t.square) continue;
    let square: Square | null = t.square;
    const upto = line.slice(0, 3);
    for (const m of upto) {
      if (m.color === meCode && m.from === square) square = m.to;
      else if (m.color !== meCode && m.to === square) square = null; // geschlagen
    }
    if (!square || upto.length < 3) continue;
    const pos = new Chess(upto[upto.length - 1].after);
    if (attackedBy(pos, square, oppCode)) continue;
    const name = names[t.type];
    const where = square !== t.square ? ` (${name.pron} steht dann auf ${square})` : '';
    if (forcing && best.san.includes('+')) {
      better.push(
        `${bestSan} ist ein Zwischenzug mit Schach: Der Gegner muss zuerst auf das Schach reagieren. Nach ${lineText(input.fenBefore, upto)} ist ${name.my} nicht mehr angegriffen${where}.`,
      );
      explainedCheck = true;
    } else if (forcing) {
      better.push(`${bestSan} ist ein Zwischenzug: Nach ${lineText(input.fenBefore, upto)} ist ${name.my} auf ${t.square} nicht mehr angegriffen${where}.`);
    } else {
      better.push(`Nach ${lineText(input.fenBefore, upto)} ist ${name.my} nicht mehr angegriffen${where}.`);
    }
    break;
  }
  if (!explainedCheck && best.san.includes('+')) better.push(`${bestSan} gibt Schach – der Gegner muss zuerst darauf reagieren.`);
  if (best.captured) better.push(`${bestSan} schlägt ${names[best.captured].theAcc} auf ${best.to}.`);

  // Materialbilanz der Variante (endet nach einem eigenen Zug)
  const mine = line.filter((m) => m.color === meCode);
  if (mine.length >= 1) {
    const lastMine = line.lastIndexOf(mine[mine.length - 1]);
    const end = line[lastMine].after;
    const start = materialBalance(input.fenBefore, me);
    const gain = materialBalance(end, me) - start;
    if (gain >= 1) {
      better.push(
        start < 0 && materialBalance(end, me) <= 0
          ? `Nach ${lineText(input.fenBefore, line.slice(0, lastMine + 1))} holst du ${materialText(gain)} zurück.`
          : `Nach ${lineText(input.fenBefore, line.slice(0, lastMine + 1))} hast du ${materialText(gain)} gewonnen.`,
      );
    }
  }
  if (line.some((m) => m.san.includes('#')) && !(input.before.mate !== undefined && input.before.mate > 0)) better.push('Die Variante endet mit Matt.');

  return { played: played.map(cap), better: better.map(cap) };
}
