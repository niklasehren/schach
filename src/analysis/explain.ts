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
};

export type RuleKey =
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
  'zwischenzug',
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

  // Hängende Figuren nach meinem Zug (ohne die schon genannten)
  for (const row of mateInPlay ? [] : afterChess.board()) {
    for (const p of row) {
      if (!p || p.color !== me || values[p.type] < 3 || p.type === 'k' || covered.has(p.square)) continue;
      if (afterChess.attackers(p.square, opp).length && !defended(afterChess, p.square, me)) {
        played.push({
          rule: 'hanging',
          text: `${cap(my(p.type))} auf ${p.square} ist danach eine ${terms.t('haengend', 'hängende Figur', 'angegriffen und von keiner deiner Figuren gedeckt')}.`,
        });
        covered.add(p.square);
      }
    }
  }

  // Nur Materialverlust, wenn keine genauere Regel passt
  if (!mateInPlay && !played.some((i) => ['undefendedTaken', 'pieceTaken', 'fork', 'hanging'].includes(i.rule)) && replyLoss >= 1) {
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
    if (!zwischen && !mateAvailable && better.length < 2) {
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

    // Materialgewinn der Variante (wenn nicht schon gesagt)
    if (!zwischen && !mateAvailable && better.length < 2) {
      const last = line.filter((m) => m.color === me).at(-1);
      const gain = last ? materialBalance(last.after, side) - startMaterial : 0;
      if (gain >= 1 && !(best.captured && values[best.captured] === gain)) {
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
  const top = MERKE_ORDER.find((k) => rules.includes(k));
  return { played: played.slice(0, 2), better: better.slice(0, 2), merke: top ? MERKE[top] : null };
}

/** Text ohne Begriffs-Markierungen (für Tests und Screenreader) */
export function plainText(text: string): string {
  return text.replace(/\[\[[^|\]]+\|([^\]]+)\]\]/g, '$1');
}
