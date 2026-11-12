/**
 * Erklärungen in einfacher Sprache – nur aus Engine-Daten und chess.js, nur Aussagen, die sich am Brett
 * nachprüfen lassen. Figuren werden ausgeschrieben, Notation steht nur in Klammern, keine Zugfolgen im Text.
 * Fachbegriffe stehen als [[schlüssel|Anzeige]] im Text (die Oberfläche macht daraus antippbare Begriffe)
 * und werden beim ersten Vorkommen kurz erklärt. Passt keine Regel, bleibt die Liste leer.
 */
import { Chess, type Move, type PieceSymbol, type Square } from 'chess.js';
import { toGermanSan } from '../chess/game';
import type { Side } from '../db/schema';
import { materialBalance, type Pov } from './rules';
import type { TermKey } from './terms';

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
  /** Letzter Zug des Gegners vor meinem Zug (Stellung davor + UCI), für „Drohung übersehen“ */
  lastMove?: { fen: string; uci: string };
};

export type RuleKey =
  | 'checkUseless'
  | 'captureUseless'
  | 'threatMissed'
  | 'rescue'
  | 'defend'
  | 'mateMissed'
  | 'mateAllowed'
  | 'undefendedTaken'
  | 'pieceTaken'
  | 'fork'
  | 'hanging'
  | 'materialLoss'
  | 'mateAvailable'
  | 'zwischenzug'
  | 'capture'
  | 'check'
  | 'materialGain'
  | 'lineMate';

export type Item = { rule: RuleKey; text: string };

export type Explanation = {
  /** Warum der gespielte Zug schlecht war (höchstens 2 Punkte) */
  played: Item[];
  /** Warum der bessere Zug besser ist (höchstens 2 Punkte) */
  better: Item[];
  /** Fester Merksatz zur wichtigsten Regel */
  merke: string | null;
};

/** Feste Merksätze je Regel (vorgegeben, nicht frei formuliert) */
export const MERKE: Record<RuleKey, string> = {
  mateMissed: 'Steht der gegnerische König eingeengt, suche zuerst nach Schachgeboten – oft steckt ein Matt darin.',
  mateAvailable: 'Steht der gegnerische König eingeengt, suche zuerst nach Schachgeboten – oft steckt ein Matt darin.',
  mateAllowed: 'Prüfe vor jedem Zug, welche Schachgebote der Gegner danach hat.',
  threatMissed: 'Schau nach jedem Zug des Gegners zuerst: Was greift er an?',
  checkUseless: 'Ein Schach ist nur gut, wenn danach etwas für dich herausspringt. Prüfe vorher, wie der Gegner antworten kann.',
  captureUseless: 'Ein Schlagzug ist nur gut, wenn danach etwas für dich herausspringt. Prüfe vorher, wie der Gegner antworten kann.',
  rescue: 'Ist eine Figur angegriffen, such ihr ein Feld, auf dem sie sicher steht – am besten eins, von dem aus sie noch etwas tut.',
  defend: 'Prüfe, welche deiner Figuren und Bauern ungedeckt sind, und decke sie, bevor der Gegner zugreift.',
  zwischenzug: 'Wird eine deiner Figuren angegriffen, schau zuerst, ob du Schach geben oder etwas schlagen kannst.',
  fork: 'Achte auf Felder, von denen eine gegnerische Figur zwei deiner Figuren gleichzeitig angreifen kann.',
  undefendedTaken: 'Bevor du ziehst: Prüfe, welche deiner Figuren und Bauern danach angegriffen und ungedeckt sind.',
  hanging: 'Prüfe vor jedem Zug, ob das Zielfeld angegriffen ist und ob deine Figur dort gedeckt ist.',
  pieceTaken: 'Schau vor jedem Zug, was der Gegner danach schlagen kann.',
  materialLoss: 'Schau vor jedem Zug, was der Gegner danach schlagen kann.',
  capture: 'Suche bei jedem Zug zuerst nach Schlagzügen – vielleicht steht etwas ungeschützt.',
  check: 'Prüfe immer zuerst deine Schachgebote – der Gegner muss darauf reagieren.',
  materialGain: 'Suche bei jedem Zug zuerst nach Schlagzügen – vielleicht steht etwas ungeschützt.',
  lineMate: 'Prüfe immer zuerst deine Schachgebote – sie können zu Matt führen.',
};

/** Welcher Merksatz gewinnt, wenn mehrere Regeln zutreffen */
const MERKE_ORDER: RuleKey[] = [
  'mateMissed',
  'mateAvailable',
  'mateAllowed',
  'checkUseless',
  'captureUseless',
  'threatMissed',
  'zwischenzug',
  'rescue',
  'defend',
  'fork',
  'undefendedTaken',
  'hanging',
  'pieceTaken',
  'capture',
  'check',
  'materialLoss',
  'materialGain',
  'lineMate',
];

// ── Gewinnchance in Worten ──────────────────────────────────────────

/**
 * Gewinnchance (0–100 %, aus Sicht des Spielers) in Worten. Grenzen (siehe PLAN.md):
 * ≥ 92 gewonnen · ≥ 80 deutlich besser · ≥ 65 klar besser · ≥ 55 leicht besser · > 45 ausgeglichen ·
 * > 35 leicht schlechter · > 20 klar schlechter · > 8 deutlich schlechter · sonst verloren.
 */
export function winWords(percent: number): string {
  if (percent >= 92) return 'gewonnen';
  if (percent >= 80) return 'deutlich besser';
  if (percent >= 65) return 'klar besser';
  if (percent >= 55) return 'leicht besser';
  if (percent > 45) return 'ausgeglichen';
  if (percent > 35) return 'leicht schlechter';
  if (percent > 20) return 'klar schlechter';
  if (percent > 8) return 'deutlich schlechter';
  return 'verloren';
}

// ── Sprachbausteine ────────────────────────────────────────────────

const values: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };

const nouns: Record<PieceSymbol, { noun: string; acc: string; fem: boolean }> = {
  p: { noun: 'Bauer', acc: 'Bauern', fem: false },
  n: { noun: 'Springer', acc: 'Springer', fem: false },
  b: { noun: 'Läufer', acc: 'Läufer', fem: false },
  r: { noun: 'Turm', acc: 'Turm', fem: false },
  q: { noun: 'Dame', acc: 'Dame', fem: true },
  k: { noun: 'König', acc: 'König', fem: false },
};

const my = (t: PieceSymbol) => `${nouns[t].fem ? 'deine' : 'dein'} ${nouns[t].noun}`;
const myAcc = (t: PieceSymbol) => `${nouns[t].fem ? 'deine' : 'deinen'} ${nouns[t].acc}`;
const theAcc = (t: PieceSymbol) => `${nouns[t].fem ? 'die' : 'den'} ${nouns[t].acc}`;
const theNom = (t: PieceSymbol) => `${nouns[t].fem ? 'die' : 'der'} ${nouns[t].noun}`;
const pronAcc = (t: PieceSymbol) => (nouns[t].fem ? 'sie' : 'ihn');
const pronNom = (t: PieceSymbol) => (nouns[t].fem ? 'sie' : 'er');
/** „die schwarze Dame“, „der weiße Springer“ */
const theirs = (t: PieceSymbol, color: 'w' | 'b') => `${nouns[t].fem ? 'die' : 'der'} ${color === 'w' ? 'weiße' : 'schwarze'} ${nouns[t].noun}`;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** „ein Bauer“, „eine Dame“ */
const aNom = (t: PieceSymbol) => `${nouns[t].fem ? 'eine' : 'ein'} ${nouns[t].noun}`;
/** „einem Bauern“, „einer Dame“ */
const aDat = (t: PieceSymbol) => `${nouns[t].fem ? 'einer' : 'einem'} ${nouns[t].acc}`;

/** Satzteile eines Zuges: Subjekt, Verb, Rest – für „Subjekt Verb Rest“ und „Danach Verb Subjekt Rest“ */
function phrase(m: Move, mine: boolean): { subject: string; verb: string; rest: string } {
  const subject = mine ? my(m.piece) : theirs(m.piece, m.color);
  if (m.flags.includes('k') || m.flags.includes('q')) {
    return { subject: mine ? 'du' : 'der Gegner', verb: mine ? 'rochierst' : 'rochiert', rest: m.flags.includes('k') ? 'kurz' : 'lang' };
  }
  if (m.captured) {
    const target = mine ? theAcc(m.captured) : myAcc(m.captured);
    return { subject, verb: 'schlägt', rest: `${target} auf ${m.to}${m.flags.includes('e') ? ' (en passant)' : ''}` };
  }
  if (m.promotion) return { subject, verb: 'zieht', rest: `nach ${m.to} und wird zur ${nouns[m.promotion].noun}` };
  return { subject, verb: 'zieht', rest: `nach ${m.to}` };
}
/** Notation nur in Klammern hinter dem Satzteil */
const san = (m: Move) => `(${toGermanSan(m.san)})`;
const isCheck = (m: Move) => m.san.includes('+') || m.san.includes('#');

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

const defended = (chess: Chess, sq: Square, side: 'w' | 'b') => chess.attackers(sq, side).length > 0;

/** Bedrohte eigene Figuren (ohne König/Bauern): angegriffen und ungedeckt oder von einer schwächeren Figur angegriffen */
function threatened(chess: Chess, me: 'w' | 'b'): { square: Square; type: PieceSymbol }[] {
  const opp = me === 'w' ? 'b' : 'w';
  const out: { square: Square; type: PieceSymbol }[] = [];
  for (const row of chess.board()) {
    for (const p of row) {
      if (!p || p.color !== me || p.type === 'k' || p.type === 'p') continue;
      const attackers = chess.attackers(p.square, opp);
      if (attackers.length === 0) continue;
      const cheaper = attackers.some((sq) => values[chess.get(sq)!.type] < values[p.type]);
      if (!defended(chess, p.square, me) || cheaper) out.push({ square: p.square, type: p.type });
    }
  }
  return out;
}

/** Wie ist eine Figur bedroht? null = gar nicht; sonst ungedeckt oder von einer billigeren Figur angegriffen */
function threatOn(chess: Chess, sq: Square): { undefended: boolean; cheaper: { square: Square; type: PieceSymbol } | null } | null {
  const piece = chess.get(sq);
  if (!piece) return null;
  const opp = piece.color === 'w' ? 'b' : 'w';
  const attackers = chess.attackers(sq, opp).map((a) => ({ square: a, type: chess.get(a)!.type }));
  if (attackers.length === 0) return null;
  const undefended = !defended(chess, sq, piece.color);
  const cheaper = attackers.filter((a) => values[a.type] < values[piece.type]).sort((a, b) => values[a.type] - values[b.type])[0] ?? null;
  return undefended || cheaper ? { undefended, cheaper } : null;
}

/** Merkt sich, welche Fachbegriffe schon erklärt wurden: beim ersten Vorkommen kurze Erklärung in Klammern */
class Terms {
  private used = new Set<TermKey>();
  t(key: TermKey, display: string, inline: string): string {
    const first = !this.used.has(key);
    this.used.add(key);
    return first ? `[[${key}|${display}]] (${inline})` : `[[${key}|${display}]]`;
  }
}

// ── Regeln ─────────────────────────────────────────────────────────

export function explain(input: ExplainInput): Explanation {
  const terms = new Terms();
  const played: Item[] = [];
  const better: Item[] = [];
  const startChess = new Chess(input.fenBefore);
  const me = startChess.turn();
  const opp = me === 'w' ? 'b' : 'w';
  const side: Side = me === 'w' ? 'white' : 'black';
  const startMaterial = materialBalance(input.fenBefore, side);

  const playedMove = playLine(input.fenBefore, [input.played])[0];
  if (!playedMove) return { played, better, merke: null };
  const afterChess = new Chess(playedMove.after);
  const reply = playLine(playedMove.after, input.replyPv.slice(0, 4));
  const replyEnd = reply.length ? reply[Math.min(reply.length, 4) - 1].after : playedMove.after;
  const replyLoss = startMaterial - materialBalance(replyEnd, side);
  const covered = new Set<string>();

  // ── Warum der gespielte Zug schlecht ist ──

  if (input.before.mate !== undefined && input.before.mate > 0 && !(input.after.mate !== undefined && input.after.mate >= 0)) {
    played.push({
      rule: 'mateMissed',
      text: `Du hattest ein ${terms.t('erzwungenesMatt', 'erzwungenes Matt', 'der Gegner kann es nicht mehr verhindern')}: Matt in ${input.before.mate}. Mit diesem Zug ist es weg.`,
    });
  }
  if (input.after.mate !== undefined && input.after.mate < 0 && !(input.before.mate !== undefined && input.before.mate < 0)) {
    const n = -input.after.mate;
    played.push({
      rule: 'mateAllowed',
      text:
        n === 1
          ? `Danach kann der Gegner sofort matt setzen${reply[0] ? ` ${san(reply[0])}` : ''}.`
          : `Danach hat der Gegner ein ${terms.t('erzwungenesMatt', 'erzwungenes Matt', 'du kannst es nicht mehr verhindern')}: Matt in ${n} Zügen.`,
    });
  }

  // Drohung übersehen: der letzte Zug des Gegners greift eine meiner Figuren an (ungedeckt oder von einer
  // billigeren Figur) – und nach meinem Zug ist sie immer noch so bedroht
  if (input.lastMove && !played.length) {
    const prev = new Chess(input.lastMove.fen);
    for (const row of startChess.board()) {
      for (const p of row) {
        if (!p || p.color !== me || p.type === 'k' || values[p.type] < 3) continue;
        const now = startChess.attackers(p.square, opp);
        const before = prev.get(p.square)?.color === me && prev.get(p.square)?.type === p.type ? prev.attackers(p.square, opp) : [];
        // neue Angreifer durch den letzten Zug (gezogene Figur oder frei gewordene Linie)
        const fresh = now.filter((a) => !before.includes(a) || a === input.lastMove!.uci.slice(2, 4));
        const attacker = fresh.map((a) => ({ square: a, type: startChess.get(a)!.type })).sort((a, b) => values[a.type] - values[b.type])[0];
        if (!attacker) continue;
        const undefendedBefore = !defended(startChess, p.square, me);
        if (!undefendedBefore && values[attacker.type] >= values[p.type]) continue;
        // Löst mein Zug das? Figur verfolgen und prüfen, ob sie danach noch bedroht ist
        const square = playedMove.from === p.square ? playedMove.to : p.square;
        if (playedMove.to === attacker.square || !threatOn(afterChess, square)) continue;
        const why =
          values[attacker.type] < values[p.type]
            ? `${cap(aNom(attacker.type))} ist weniger wert als ${aNom(p.type)}, deshalb musst du reagieren, auch wenn ${theNom(p.type)} gedeckt ${undefendedBefore ? 'wäre' : 'ist'}.`
            : `${cap(theNom(p.type))} ist ${terms.t('ungedeckt', 'ungedeckt', `keine deiner Figuren schützt ${pronAcc(p.type)}`)}, deshalb musst du reagieren.`;
        // Hat mein Zug sogar die Deckung weggenommen?
        const lostCover = !undefendedBefore && !defended(afterChess, square, me) && playedMove.from !== p.square;
        const notSolved = lostCover
          ? ` Dein Zug löst das nicht – im Gegenteil: ${cap(my(playedMove.piece))} zieht weg ${san(playedMove)} und deckt ${theAcc(p.type)} danach nicht mehr.`
          : ` Dein Zug ${san(playedMove)} ändert daran nichts.`;
        played.push({
          rule: 'threatMissed',
          text: `${cap(theNom(attacker.type))} auf ${attacker.square} greift ${myAcc(p.type)} auf ${p.square} an. ${why}${notSolved}`,
        });
        covered.add(square);
        break;
      }
      if (played.some((i) => i.rule === 'threatMissed')) break;
    }
  }

  // Schach / Schlagzug bringt nichts: die beste Antwort greift eine meiner Figuren an, oder eine alte Drohung bleibt
  const r0 = reply[0];
  if (r0 && (isCheck(playedMove) || playedMove.captured) && !played.some((i) => i.rule === 'mateAllowed' || i.rule === 'mateMissed')) {
    const oppName = opp === 'w' ? 'Weiß' : 'Schwarz';
    const afterReply = new Chess(r0.after);
    // Neu angegriffen durch die Antwort (vorher nach meinem Zug nicht bedroht)
    let newTarget: { square: Square; type: PieceSymbol } | null = null;
    for (const row of afterReply.board()) {
      for (const p of row) {
        if (newTarget || !p || p.color !== me || p.type === 'k' || values[p.type] < 3) continue;
        if (afterReply.attackers(p.square, opp).includes(r0.to) && threatOn(afterReply, p.square) && !threatOn(afterChess, p.square)) {
          newTarget = { square: p.square, type: p.type };
        }
      }
    }
    // Alte Drohung: vor meinem Zug bedroht, nach der Antwort immer noch bedroht (Figur nicht gezogen)
    const oldThreat = threatened(startChess, me).find(
      (t) => t.square !== playedMove.from && afterReply.get(t.square)?.color === me && threatOn(afterReply, t.square),
    );
    if (newTarget || oldThreat) {
      // Wie antwortet der Gegner?
      let how: string;
      if (isCheck(playedMove)) {
        if (r0.piece === 'k') how = `${oppName} zieht einfach den König weg ${san(r0)}`;
        else if (r0.captured && r0.to === playedMove.to) how = `${oppName} schlägt ${myAcc(r0.captured)} ${san(r0)}`;
        else how = `${oppName} stellt ${theAcc(r0.piece)} dazwischen ${san(r0)}`;
      } else {
        const p = phrase(r0, false);
        how = `${oppName} antwortet: ${p.subject} ${p.verb} ${p.rest} ${san(r0)}`;
      }
      const parts: string[] = [];
      if (newTarget) {
        const again = newTarget.square === playedMove.to;
        parts.push(`${how} und greift damit ${myAcc(newTarget.type)} an.${again ? ` Du musst ${pronAcc(newTarget.type)} wieder wegziehen.` : ''}`);
      } else {
        parts.push(`${how}.`);
      }
      if (oldThreat) {
        // „geht verloren“ nur, wenn die Engine-Variante die Figur wirklich schlägt
        const lost = reply.some((m) => m.color === opp && m.to === oldThreat.square && m.captured === oldThreat.type);
        parts.push(
          lost
            ? `${cap(my(oldThreat.type))} auf ${oldThreat.square} geht trotzdem verloren.`
            : `${cap(my(oldThreat.type))} auf ${oldThreat.square} bleibt trotzdem angegriffen.`,
        );
        covered.add(oldThreat.square);
      }
      played.push({
        rule: isCheck(playedMove) ? 'checkUseless' : 'captureUseless',
        text: `${isCheck(playedMove) ? 'Dein Schach' : 'Dein Schlagzug'} hilft hier nicht: ${parts.join(' ')}`,
      });
      if (newTarget) covered.add(newTarget.square);
    }
  }

  // Hat mein Zug eine bedrohte Figur in Sicherheit gebracht? (für „zwar …, aber …“)
  const threatsBefore = threatened(startChess, me);
  const saved = threatsBefore.find((t) => t.square === playedMove.from && afterChess.attackers(playedMove.to, opp).length === 0);

  // Die beste Antwort des Gegners schlägt etwas
  const r = reply[0];
  const mateInPlay = played.some((i) => i.rule === 'mateAllowed' || i.rule === 'mateMissed');
  let captureIndex = -1;
  if (r?.captured && !mateInPlay) {
    captureIndex = played.length;
    const victim = r.captured;
    const zwar = saved ? `${cap(my(saved.type))} bringt sich zwar in Sicherheit, aber ` : '';
    const loses = replyLoss >= 1 ? `, und du verlierst ${victim === 'p' ? (startMaterial < 0 ? 'einen weiteren Bauern' : 'einen Bauern') : myAcc(victim)}` : '';
    if (!defended(afterChess, r.to, me)) {
      const wasUndefended = startChess.get(r.to)?.color === me && !defended(startChess, r.to, me);
      const subject = zwar ? my(victim) : cap(my(victim));
      played.push({
        rule: 'undefendedTaken',
        text:
          `${zwar}${subject} auf ${r.to} ${wasUndefended ? 'bleibt' : 'ist danach'} ${terms.t('ungedeckt', 'ungedeckt', `keine deiner Figuren schützt ${pronAcc(victim)}`)}. ` +
          `${cap(theirs(r.piece, opp))} kann ${pronAcc(victim)} einfach schlagen ${san(r)}${loses}.`,
      });
    } else {
      const p = phrase(r, false);
      played.push({ rule: 'pieceTaken', text: `${zwar}${zwar ? p.subject : cap(p.subject)} ${p.verb} ${p.rest} ${san(r)}${loses}.` });
    }
    covered.add(r.to);
  }

  // Gabel: die gezogene Figur bedroht danach mindestens zwei eigene Figuren wirklich
  // (König, ungedeckt oder wertvoller als der Angreifer – gedeckte gleichwertige zählen nicht)
  if (r && !mateInPlay) {
    const pos = new Chess(r.after);
    const forked: { square: Square; type: PieceSymbol }[] = [];
    for (const row of pos.board()) {
      for (const p of row) {
        if (!p || p.color !== me || values[p.type] < 3) continue;
        if (!pos.attackers(p.square, opp).includes(r.to)) continue;
        if (p.type === 'k' || !defended(pos, p.square, me) || values[p.type] > values[r.piece]) forked.push({ square: p.square, type: p.type });
      }
    }
    if (forked.length >= 2) {
      const list = forked
        .sort((a, b) => values[b.type] - values[a.type])
        .map((f) => (f.type === 'k' ? myAcc('k') : `${myAcc(f.type)} auf ${f.square}`));
      const gabel = terms.t('gabel', 'Gabel', 'eine Figur greift zwei auf einmal an');
      const targets = `${list.slice(0, -1).join(', ')} und ${list.at(-1)}`;
      if (captureIndex >= 0 && r.captured) {
        // Schlagen und Gabel sind derselbe Zug: ein Satz statt zwei
        played[captureIndex] = {
          rule: 'fork',
          text: `${cap(theirs(r.piece, opp))} schlägt ${myAcc(r.captured)} auf ${r.to} und greift dabei mit einer ${gabel} ${targets} gleichzeitig an ${san(r)}.`,
        };
      } else {
        played.push({ rule: 'fork', text: `Danach greift ${theirs(r.piece, opp)} mit einer ${gabel} ${targets} gleichzeitig an ${san(r)}.` });
      }
      forked.forEach((f) => covered.add(f.square));
    }
  }

  // Hängende Figuren nach meinem Zug (ohne die schon genannten): angegriffen und ungedeckt
  // oder von einer weniger wertvollen Figur angegriffen – im Text steht, welcher Fall zutrifft
  for (const row of mateInPlay ? [] : afterChess.board()) {
    for (const p of row) {
      if (!p || p.color !== me || values[p.type] < 3 || p.type === 'k' || covered.has(p.square)) continue;
      const t = threatOn(afterChess, p.square);
      if (!t) continue;
      const term = terms.t('haengend', 'hängende Figur', 'sie kann geschlagen werden, ohne dass du gleichwertig zurückschlagen kannst');
      const reason = t.undefended
        ? 'Sie wird angegriffen, und keine deiner Figuren deckt sie.'
        : `Sie wird von ${aDat(t.cheaper!.type)} angegriffen – ${aNom(t.cheaper!.type)} ist weniger wert, deshalb hilft auch Zurückschlagen nicht.`;
      played.push({ rule: 'hanging', text: `${cap(my(p.type))} auf ${p.square} ist danach eine ${term}. ${reason}` });
      covered.add(p.square);
    }
  }

  // Nur Materialverlust, wenn keine genauere Regel passt
  if (!mateInPlay && !played.some((i) => ['undefendedTaken', 'pieceTaken', 'fork', 'hanging', 'checkUseless', 'captureUseless'].includes(i.rule)) && replyLoss >= 1) {
    played.push({
      rule: 'materialLoss',
      text: `Mit seiner besten Antwort gewinnt der Gegner Material – etwa ${replyLoss === 1 ? 'einen Bauern' : `${replyLoss} Bauern`} an Wert.`,
    });
  }

  // ── Warum der bessere Zug besser ist ──

  const line = playLine(input.fenBefore, input.bestPv.slice(0, 6));
  const best = line[0];
  let zwischen = false;
  if (best) {
    const bp = phrase(best, true);
    const withCheck = isCheck(best) && !best.san.includes('#');

    if (input.before.mate !== undefined && input.before.mate > 0) {
      better.push({
        rule: 'mateAvailable',
        text:
          input.before.mate === 1
            ? `${cap(bp.subject)} ${bp.verb} ${bp.rest} – das ist sofort Matt ${san(best)}.`
            : `Hier gab es ein ${terms.t('erzwungenesMatt', 'erzwungenes Matt', 'der Gegner kann es nicht mehr verhindern')} in ${input.before.mate} Zügen. Es beginnt so: ${bp.subject} ${bp.verb} ${bp.rest} ${san(best)}.`,
      });
    }

    // Zwischenzug: eine eigene Figur ist bedroht, der beste Zug zieht sie nicht weg, sondern gibt Schach / schlägt –
    // und nach meinem nächsten Zug der Variante ist sie nicht mehr angegriffen (mit chess.js geprüft)
    const threat = threatsBefore.find((t) => t.square !== best.from);
    if (threat && (isCheck(best) || best.captured) && better.length === 0) {
      let square: Square | null = threat.square;
      const upto = line.slice(0, 3);
      for (const m of upto) {
        if (m.color === me && m.from === square) square = m.to;
        else if (m.color !== me && m.to === square) square = null;
      }
      if (square && upto.length === 3 && new Chess(upto[2].after).attackers(square, opp).length === 0) {
        zwischen = true;
        // Kann der Gegner nach dem Zwischenzug die bedrohte Figur schlagen? Wenn nicht: „keine Zeit“
        const noTime = !new Chess(best.after).moves({ verbose: true }).some((a) => a.to === threat.square);
        better.push({
          rule: 'zwischenzug',
          text:
            `Statt ${theAcc(threat.type)} wegzuziehen, ${bp.verb} ${bp.subject} ${bp.rest} ${san(best)}${withCheck ? ', und zwar mit Schach' : ''}. ` +
            `Das ist ein ${terms.t('zwischenzug', 'Zwischenzug', 'ein Zug, auf den der Gegner sofort reagieren muss')}` +
            (noTime ? `: Er hat keine Zeit, ${myAcc(threat.type)} zu schlagen.` : '.'),
        });
        const next = upto[2];
        const gain = materialBalance(next.after, side) - startMaterial;
        const back =
          gain < 1 ? '' : startMaterial < 0 ? (gain === 1 ? ', und du hast deinen Bauern zurück' : ', und du hast dein Material zurück') : `, und du gewinnst ${gain === 1 ? 'einen Bauern' : 'Material'}`;
        if (next.color === me && next.from === threat.square) {
          const p2 = phrase(next, true);
          better.push({
            rule: 'zwischenzug',
            text: `Danach ${p2.verb} ${p2.subject} ${p2.rest} ${san(next)}${isCheck(next) ? ', wieder mit Schach' : ''}. ${cap(pronNom(threat.type))} ist aus der Gefahr${back}.`,
          });
        } else {
          better.push({ rule: 'zwischenzug', text: `Danach ist ${my(threat.type)} nicht mehr angegriffen${back}.` });
        }
      }
    }

    const mateAvailable = better.some((i) => i.rule === 'mateAvailable');
    // Rettet die angegriffene Figur und/oder deckt etwas, das sonst verloren ginge
    if (!zwischen && !mateAvailable && better.length < 2) {
      const bestChess = new Chess(best.after);
      const rescued = threatOn(startChess, best.from) && !threatOn(bestChess, best.to) && best.piece !== 'k' && best.piece !== 'p';
      // Gedeckt: eigene Figur/Bauer, der jetzt oder nach meinem gespielten Zug angegriffen und ungedeckt war
      // (also sonst verloren ginge) und nach dem besseren Zug von der gezogenen Figur gedeckt wird
      let guarded: { square: Square; type: PieceSymbol; afterMine: boolean } | null = null;
      const loose = (c: Chess, sq: Square) => c.get(sq)?.color === me && c.attackers(sq, opp).length > 0 && !defended(c, sq, me);
      for (const row of bestChess.board()) {
        for (const p of row) {
          if (guarded || !p || p.color !== me || p.type === 'k' || p.square === best.to) continue;
          const nowLoose = loose(startChess, p.square);
          const looseAfterMine = !nowLoose && p.square !== playedMove.from && loose(afterChess, p.square);
          if ((nowLoose || looseAfterMine) && bestChess.attackers(p.square, me).includes(best.to)) {
            guarded = { square: p.square, type: p.type, afterMine: looseAfterMine };
          }
        }
      }
      if (rescued && guarded) {
        better.push({
          rule: 'rescue',
          text: `Dieser Zug ${san(best)} löst zwei Probleme auf einmal: ${cap(my(best.piece))} ist in Sicherheit, und ${pronNom(best.piece)} deckt jetzt ${theAcc(guarded.type)} auf ${guarded.square}.`,
        });
      } else if (rescued) {
        better.push({ rule: 'rescue', text: `${cap(bp.subject)} ${bp.verb} ${bp.rest} ${san(best)} und ist dort in Sicherheit.` });
      } else if (guarded) {
        better.push({
          rule: 'defend',
          text: `${cap(bp.subject)} ${bp.verb} ${bp.rest} ${san(best)} und deckt damit ${theAcc(guarded.type)} auf ${guarded.square}, ${nouns[guarded.type].fem ? 'die' : 'der'} ${guarded.afterMine ? 'nach deinem Zug ungedeckt war' : 'bisher ungedeckt war'}.`,
        });
      }
    }

    if (!zwischen && !mateAvailable && better.length < 2 && !better.some((i) => i.rule === 'rescue' || i.rule === 'defend')) {
      if (best.captured) {
        const wasUndefended = !defended(startChess, best.to, opp);
        better.push({
          rule: 'capture',
          text:
            `${cap(bp.subject)} ${bp.verb} ${bp.rest} ${san(best)}${withCheck ? ', und zwar mit Schach' : ''}.` +
            (wasUndefended ? ` ${cap(theNom(best.captured))} war ${terms.t('ungedeckt', 'ungedeckt', `keine gegnerische Figur schützte ${pronAcc(best.captured)}`)}.` : ''),
        });
      } else if (withCheck) {
        better.push({ rule: 'check', text: `${cap(bp.subject)} ${bp.verb} ${bp.rest} ${san(best)} und gibt Schach – der Gegner muss zuerst darauf reagieren.` });
      }
    }

    // Allgemeiner Material-Satz nur, wenn keine konkretere Regel passt – und nur, wenn die Fortsetzung
    // wirklich mehr Material bringt als der gespielte Zug (nach der besten Antwort des Gegners)
    if (better.length === 0) {
      const last = line.filter((m) => m.color === me).at(-1);
      const bestEnd = last ? materialBalance(last.after, side) : startMaterial;
      const gain = bestEnd - startMaterial;
      const playedEnd = materialBalance(replyEnd, side);
      if (gain >= 1 && bestEnd - playedEnd >= 1) {
        better.push({
          rule: 'materialGain',
          text:
            startMaterial < 0
              ? 'Mit dieser Fortsetzung holst du Material zurück.'
              : `Mit dieser Fortsetzung gewinnst du Material – etwa ${gain === 1 ? 'einen Bauern' : `${gain} Bauern`} an Wert.`,
        });
      }
    }
    if (better.length < 2 && line.some((m) => m.san.includes('#')) && !(input.before.mate !== undefined && input.before.mate > 0)) {
      better.push({ rule: 'lineMate', text: 'Die beste Fortsetzung endet sogar mit Matt.' });
    }
  }

  const rules = [...played, ...better].map((i) => i.rule);
  const top = MERKE_ORDER.find((k) => rules.includes(k) && !contradicts(k, playedMove));
  return { played: played.slice(0, 2), better: better.slice(0, 2), merke: top ? merkeFor(top, playedMove) : null };
}

/**
 * Widerspricht ein Merksatz dem gespielten Zug? Beispiel: „Schau, ob du Schach geben kannst“, obwohl ich
 * gerade Schach gegeben habe. Solche Merksätze werden übersprungen.
 */
export function contradicts(rule: RuleKey, played: Move): boolean {
  const gaveCheck = isCheck(played);
  const captured = !!played.captured;
  if (rule === 'zwischenzug') return gaveCheck || captured;
  if (rule === 'check' || rule === 'lineMate') return gaveCheck;
  if (rule === 'capture' || rule === 'materialGain') return captured;
  if (rule === 'checkUseless') return !gaveCheck;
  if (rule === 'captureUseless') return !captured;
  return false;
}

/** Merksatz; bei verpasstem Matt nach einem eigenen Schach ein angepasster fester Text */
function merkeFor(rule: RuleKey, played: Move): string {
  if ((rule === 'mateMissed' || rule === 'mateAvailable') && isCheck(played)) {
    return 'Prüfe bei jedem Schach, ob es nicht ein noch stärkeres gibt – oft steckt ein Matt darin.';
  }
  return MERKE[rule];
}

/** Text ohne Begriffs-Markierungen (für Tests und Screenreader) */
export function plainText(text: string): string {
  return text.replace(/\[\[[^|\]]+\|([^\]]+)\]\]/g, '$1');
}
