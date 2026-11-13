import type { PuzzleFilter } from '../app/router';
import type { Phase, Side } from '../db/schema';
import { ERROR_TYPE_LABELS } from '../analysis/errorTypes';
import { PHASE_LABELS } from '../db/boardGames';
import {
  accuracyOf,
  blundersPerGame,
  materialErrorsPerGame,
  MIN_GAMES,
  OVERSIGHT_TYPES,
  PHASES,
  scoreRate,
  timeTroubleRates,
  type GameFact,
} from './insights';
import { FRENCH, openingLabel } from './openings';

/**
 * Meine Vermutungen über mein Spiel – jede ist eine Vorlage mit Einstellungen, die die App mit den Daten vergleicht.
 * Gespeichert in den Einstellungen (Schlüssel „hypotheses“, synchronisiert). Freunde starten leer, mit Vorschlägen.
 */
export type Hypothesis =
  | { id: string; kind: 'color'; text: string; better: Side }
  | { id: string; kind: 'phase'; text: string; phase: Phase; earlyOversight: boolean }
  | { id: string; kind: 'timeTrouble'; text: string }
  | { id: string; kind: 'opening'; text: string; family: string; color: Side; claim: 'good' | 'bad' | 'none'; materialLoss: boolean }
  | { id: string; kind: 'progress'; text: string; days: number };

export type HypothesisKind = Hypothesis['kind'];

export const HYPOTHESES_KEY = 'hypotheses';

export const KIND_LABELS: Record<HypothesisKind, string> = {
  color: 'Farbe',
  phase: 'Wo ich verliere',
  timeTrouble: 'Zeitnot',
  opening: 'Eröffnung',
  progress: 'Fortschritt',
};

/** Meine fünf Vermutungen (Stand 13.11.2026) – zugleich die Vorschläge für Freunde */
export const SUGGESTIONS: Hypothesis[] = [
  { id: 'farbe', kind: 'color', text: 'Mit Weiß spiele ich besser', better: 'white' },
  { id: 'endspiel', kind: 'phase', text: 'Ich verliere eher im Endspiel, manchmal früher durch Übersehen', phase: 'endgame', earlyOversight: true },
  { id: 'zeitnot', kind: 'timeTrouble', text: 'In Zeitnot mache ich mehr Fehler' },
  { id: 'franzoesisch', kind: 'opening', text: 'Französisch liegt mir, aber als Schwarz verliere ich dort oft Material', family: FRENCH, color: 'black', claim: 'good', materialLoss: true },
  { id: 'fortschritt', kind: 'progress', text: 'Seit ca. 2 Wochen werde ich besser', days: 14 },
];

/** Chess.com-Name, mit dem die App gebaut wurde: startet mit den eigenen fünf Vermutungen statt leer */
export const OWNER_CHESSCOM = 'niklasehren';

/** Gespeicherte Liste; ohne gespeicherte Liste: der Besitzer seine fünf, alle anderen leer */
export function initialHypotheses(stored: unknown, chesscomUser: string | undefined): Hypothesis[] {
  if (Array.isArray(stored)) return stored as Hypothesis[];
  return chesscomUser?.toLowerCase() === OWNER_CHESSCOM ? SUGGESTIONS : [];
}

/** Vorschlagstext für eine Vermutung aus ihren Einstellungen (der eigene Text bleibt davon unberührt) */
export function defaultText(h: Hypothesis): string {
  switch (h.kind) {
    case 'color':
      return `Mit ${h.better === 'white' ? 'Weiß' : 'Schwarz'} spiele ich besser`;
    case 'phase': {
      const where = { opening: 'in der Eröffnung', middlegame: 'im Mittelspiel', endgame: 'im Endspiel' }[h.phase];
      return `Ich verliere eher ${where}${h.earlyOversight && h.phase !== 'opening' ? ', manchmal früher durch Übersehen' : ''}`;
    }
    case 'timeTrouble':
      return 'In Zeitnot mache ich mehr Fehler';
    case 'opening': {
      const name = openingLabel(h.family);
      const as = h.color === 'white' ? 'als Weiß' : 'als Schwarz';
      const claim = h.claim === 'good' ? `${name} liegt mir ${as}` : h.claim === 'bad' ? `${name} liegt mir ${as} nicht` : `${name} ${as}`;
      return h.materialLoss ? `${claim}${h.claim === 'none' ? ': ich verliere dort oft Material' : ', aber ich verliere dort oft Material'}` : claim;
    }
    case 'progress':
      return `Seit ca. ${Math.round(h.days / 7)} Wochen werde ich besser`;
  }
}

/* ---------- Urteil ---------- */

export type Verdict = 'stimmt' | 'teilweise' | 'stimmtNicht' | 'zuWenig';

export const VERDICT_LABELS: Record<Verdict, string> = { stimmt: 'stimmt', teilweise: 'teilweise', stimmtNicht: 'stimmt nicht', zuWenig: 'noch zu wenig Daten' };

/** Ein Teil der Vermutung: true = die Daten stützen ihn klar, false = nicht (kein klarer Unterschied oder umgekehrt) */
export type Signal = { label: string; supports: boolean };

/**
 * Urteils-Regel: alle Teile gestützt → „stimmt“, manche → „teilweise“, keiner → „stimmt nicht“.
 * Fehlen Daten (eine Gruppe unter 10 Partien) → „noch zu wenig Daten“, ohne Urteil.
 */
export function verdictOf(signals: Signal[], enoughData: boolean): Verdict {
  if (!enoughData || signals.length === 0) return 'zuWenig';
  const yes = signals.filter((s) => s.supports).length;
  if (yes === signals.length) return 'stimmt';
  return yes > 0 ? 'teilweise' : 'stimmtNicht';
}

/** Schwellen für „klarer Unterschied“ (bewusst grob – bei wenigen Dutzend Partien sind kleine Unterschiede Zufall) */
export const THRESHOLDS = {
  /** Punkte-Quote: mindestens 10 Prozentpunkte */
  score: 10,
  /** Pro-Partie-Werte (Patzer, Materialfehler): mindestens 0,25 und 20 % */
  perGameAbs: 0.25,
  perGameRel: 0.2,
  /** Fehlerquote pro Zug: mindestens 1,5-mal so hoch und 3 Prozentpunkte mehr */
  rateFactor: 1.5,
  rateAbs: 3,
  /** Genauigkeit: mindestens 3 Punkte */
  accuracy: 3,
  /** Phase: Anteil der entscheidenden Fehler in dieser Phase mindestens 40 % und am häufigsten */
  phaseShare: 40,
  /** Früher durch Übersehen: mindestens die Hälfte der früheren entscheidenden Fehler */
  oversightShare: 50,
};

/** a klar kleiner als b (für „weniger Patzer“) */
export const clearlyLess = (a: number | null, b: number | null) => a !== null && b !== null && b - a >= THRESHOLDS.perGameAbs && b - a >= THRESHOLDS.perGameRel * b;

/** Eine Zeile Beleg: Gruppe, Wert, Anzahl Partien */
export type Evidence = { label: string; value: number | null; n: number; unit: 'pct' | 'perGame' | 'acc'; nUnit?: 'Partien' | 'Züge' };

export type Action = { label: string; filter?: TrainingFilter; href?: string };
/** Filter für „Meine Fehler“ im Training (wie in der Adresse) */
export type TrainingFilter = PuzzleFilter;

export type HypothesisResult = {
  hypothesis: Hypothesis;
  verdict: Verdict;
  /** Ein Satz in einfacher Sprache, mit Zahlen */
  summary: string;
  /** Vergleich in Paaren (für die Balken) */
  evidence: Evidence[][];
  signals: Signal[];
  action: Action | null;
};

const pct = (x: number | null) => (x === null ? '–' : `${Math.round(x)} %`);
const one = (x: number | null) => (x === null ? '–' : x.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
const colorWord = (s: Side) => (s === 'white' ? 'Weiß' : 'Schwarz');
const partien = (n: number) => `${n} ${n === 1 ? 'Partie' : 'Partien'}`;
const DAY = 86_400_000;
export const IN_PHASE: Record<Phase, string> = { opening: 'in der Eröffnung', middlegame: 'im Mittelspiel', endgame: 'im Endspiel' };

export function evaluate(h: Hypothesis, gs: GameFact[], now: number): HypothesisResult {
  switch (h.kind) {
    case 'color':
      return evalColor(h, gs);
    case 'phase':
      return evalPhase(h, gs);
    case 'timeTrouble':
      return evalTimeTrouble(h, gs);
    case 'opening':
      return evalOpening(h, gs);
    case 'progress':
      return evalProgress(h, gs, now);
  }
}

function evalColor(h: Extract<Hypothesis, { kind: 'color' }>, gs: GameFact[]): HypothesisResult {
  const good = gs.filter((g) => g.myColor === h.better);
  const other = gs.filter((g) => g.myColor !== h.better);
  const [sg, so] = [scoreRate(good), scoreRate(other)];
  const [bg, bo] = [blundersPerGame(good), blundersPerGame(other)];
  const enough = bg.n >= MIN_GAMES && bo.n >= MIN_GAMES;
  const signals: Signal[] = [
    { label: `Mehr Punkte mit ${colorWord(h.better)}`, supports: sg.value !== null && so.value !== null && sg.value - so.value >= THRESHOLDS.score },
    { label: `Weniger Patzer mit ${colorWord(h.better)}`, supports: clearlyLess(bg.value, bo.value) },
  ];
  const verdict = verdictOf(signals, enough);
  const otherColor: Side = h.better === 'white' ? 'black' : 'white';
  const summary = enough
    ? `Mit ${colorWord(h.better)} holst du ${pct(sg.value)} der Punkte (${partien(sg.n)}), mit ${colorWord(otherColor)} ${pct(so.value)} (${partien(so.n)}). Patzer pro Partie: ${one(bg.value)} gegenüber ${one(bo.value)}.`
    : `Für einen Vergleich brauche ich je Farbe mindestens ${MIN_GAMES} analysierte Partien – bisher ${bg.n} mit ${colorWord(h.better)} und ${bo.n} mit ${colorWord(otherColor)}.`;
  // Aktion: die schwächere Farbe üben
  const weaker: Side = (sg.value ?? 0) - (so.value ?? 0) >= 0 ? otherColor : h.better;
  return {
    hypothesis: h,
    verdict,
    summary,
    signals,
    evidence: [
      [
        { label: colorWord(h.better), value: sg.value, n: sg.n, unit: 'pct' },
        { label: colorWord(otherColor), value: so.value, n: so.n, unit: 'pct' },
      ],
      [
        { label: colorWord(h.better), value: bg.value, n: bg.n, unit: 'perGame' },
        { label: colorWord(otherColor), value: bo.value, n: bo.n, unit: 'perGame' },
      ],
    ],
    action: enough ? { label: `Übe Puzzles aus deinen ${colorWord(weaker)}-Partien`, filter: { color: weaker } } : null,
  };
}

function evalPhase(h: Extract<Hypothesis, { kind: 'phase' }>, gs: GameFact[]): HypothesisResult {
  const losses = gs.filter((g) => g.analysed && g.result === 'loss');
  const decisive = losses.map((g) => g.decisive).filter((m): m is NonNullable<typeof m> => !!m);
  const counts = Object.fromEntries(PHASES.map((p) => [p, decisive.filter((m) => m.phase === p).length])) as Record<Phase, number>;
  const share = (p: Phase) => (losses.length ? (100 * counts[p]) / losses.length : null);
  const enough = losses.length >= MIN_GAMES;
  const top = Math.max(...PHASES.map((p) => counts[p]));
  const earlier = PHASES.slice(0, PHASES.indexOf(h.phase));
  const early = decisive.filter((m) => earlier.includes(m.phase));
  const oversight = early.filter((m) => OVERSIGHT_TYPES.includes(m.errorType ?? ''));
  const signals: Signal[] = [{ label: `Meist ${IN_PHASE[h.phase]} entschieden`, supports: counts[h.phase] === top && counts[h.phase] > 0 && (share(h.phase) ?? 0) >= THRESHOLDS.phaseShare }];
  if (h.earlyOversight && earlier.length)
    signals.push({ label: 'Früher meist durch Übersehen', supports: early.length > 0 && (100 * oversight.length) / early.length >= THRESHOLDS.oversightShare });
  const verdict = verdictOf(signals, enough);
  const parts = PHASES.map((p) => `${PHASE_LABELS[p]} ${counts[p]}`).join(', ');
  const none = losses.length - decisive.length;
  const typeCounts = new Map<string, number>();
  for (const m of early) typeCounts.set(m.errorType ?? 'other', (typeCounts.get(m.errorType ?? 'other') ?? 0) + 1);
  const topEarly = [...typeCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  const summary = enough
    ? `In ${losses.length} ${losses.length === 1 ? 'Niederlage' : 'Niederlagen'} lag der entscheidende Fehler so: ${parts}${none ? `; ${none} ohne einzelnen entscheidenden Fehler` : ''}.` +
      (h.earlyOversight && early.length
        ? ` Von den ${early.length} entscheidenden Fehlern vor dem ${PHASE_LABELS[h.phase]} waren ${oversight.length} Übersehen${topEarly ? `, am häufigsten „${ERROR_TYPE_LABELS[topEarly[0]] ?? topEarly[0]}“` : ''}.`
        : '')
    : `Für ein Urteil brauche ich mindestens ${MIN_GAMES} analysierte Niederlagen – bisher ${losses.length}.`;
  const worst = PHASES.reduce((a, b) => (counts[b] > counts[a] ? b : a), h.phase);
  return {
    hypothesis: h,
    verdict,
    summary,
    signals,
    evidence: [PHASES.map((p) => ({ label: PHASE_LABELS[p], value: share(p), n: losses.length, unit: 'pct' as const }))],
    action: enough && counts[worst] > 0 ? { label: `Übe Puzzles aus ${worst === 'opening' ? 'der Eröffnung' : worst === 'middlegame' ? 'dem Mittelspiel' : 'Endspielen'}`, filter: { phase: worst } } : null,
  };
}

function evalTimeTrouble(h: Extract<Hypothesis, { kind: 'timeTrouble' }>, gs: GameFact[]): HypothesisResult {
  const { trouble, normal, clockGames } = timeTroubleRates(gs);
  const enough = trouble.games >= MIN_GAMES && clockGames >= MIN_GAMES;
  const clearly = (a: number | null, b: number | null) => a !== null && b !== null && a >= THRESHOLDS.rateFactor * b && a - b >= THRESHOLDS.rateAbs;
  const signals: Signal[] = [
    { label: 'Mehr Fehler pro Zug in Zeitnot', supports: clearly(trouble.rate, normal.rate) },
    { label: 'Mehr Patzer pro Zug in Zeitnot', supports: clearly(trouble.blunderRate, normal.blunderRate) },
  ];
  const verdict = verdictOf(signals, enough);
  const summary = enough
    ? `In Zeitnot (unter 10 % Restzeit) waren ${pct(trouble.rate)} deiner Züge Fehler oder Patzer (${trouble.moves} Züge in ${partien(trouble.games)}), sonst ${pct(normal.rate)} (${normal.moves} Züge).`
    : `Für einen Vergleich brauche ich mindestens ${MIN_GAMES} Partien mit Uhr, in denen du in Zeitnot kamst – bisher ${trouble.games} (von ${partien(clockGames)} mit Uhr).`;
  return {
    hypothesis: h,
    verdict,
    summary,
    signals,
    evidence: [
      [
        { label: 'In Zeitnot', value: trouble.rate, n: trouble.moves, unit: 'pct', nUnit: 'Züge' },
        { label: 'Sonst', value: normal.rate, n: normal.moves, unit: 'pct', nUnit: 'Züge' },
      ],
    ],
    action: enough && signals.some((s) => s.supports) ? { label: 'Übe Puzzles aus Zeitnot-Stellungen', filter: { zeitnot: true } } : null,
  };
}

function evalOpening(h: Extract<Hypothesis, { kind: 'opening' }>, gs: GameFact[]): HypothesisResult {
  const mine = gs.filter((g) => g.myColor === h.color);
  const inOpening = mine.filter((g) => g.opening === h.family);
  const rest = mine.filter((g) => g.opening !== h.family);
  const [si, sr] = [scoreRate(inOpening), scoreRate(rest)];
  const [mi, mr] = [materialErrorsPerGame(inOpening), materialErrorsPerGame(rest)];
  const enough = mi.n >= MIN_GAMES && mr.n >= MIN_GAMES;
  const name = openingLabel(h.family);
  const signals: Signal[] = [];
  if (h.claim !== 'none') {
    const diff = si.value !== null && sr.value !== null ? si.value - sr.value : null;
    signals.push({ label: h.claim === 'good' ? `Mehr Punkte in ${name}` : `Weniger Punkte in ${name}`, supports: diff !== null && (h.claim === 'good' ? diff >= THRESHOLDS.score : -diff >= THRESHOLDS.score) });
  }
  if (h.materialLoss) signals.push({ label: `Mehr Materialverlust in ${name}`, supports: clearlyLess(mr.value, mi.value) });
  const verdict = verdictOf(signals, enough);
  const as = h.color === 'white' ? 'mit Weiß' : 'mit Schwarz';
  const summary = enough
    ? `${name} ${as}: ${pct(si.value)} der Punkte (${partien(si.n)}), andere Partien ${as}: ${pct(sr.value)} (${partien(sr.n)}). Fehler mit Materialverlust pro Partie: ${one(mi.value)} gegenüber ${one(mr.value)}.`
    : `${name} ${as}: bisher ${partien(mi.n)} analysiert, andere ${as} ${mr.n}. Für ein Urteil brauche ich je Gruppe mindestens ${MIN_GAMES}.`;
  return {
    hypothesis: h,
    verdict,
    summary,
    signals,
    evidence: [
      [
        { label: name, value: si.value, n: si.n, unit: 'pct' },
        { label: 'Andere', value: sr.value, n: sr.n, unit: 'pct' },
      ],
      [
        { label: name, value: mi.value, n: mi.n, unit: 'perGame' },
        { label: 'Andere', value: mr.value, n: mr.n, unit: 'perGame' },
      ],
    ],
    action: inOpening.some((g) => g.errors.length) ? { label: `Übe Puzzles aus deinen ${name}-Partien`, filter: { opening: h.family, color: h.color } } : null,
  };
}

function evalProgress(h: Extract<Hypothesis, { kind: 'progress' }>, gs: GameFact[], now: number): HypothesisResult {
  const from = now - h.days * DAY;
  const recent = gs.filter((g) => g.date >= from);
  const before = gs.filter((g) => g.date < from);
  const [br, bb] = [blundersPerGame(recent), blundersPerGame(before)];
  const [ar, ab] = [accuracyOf(recent), accuracyOf(before)];
  const enough = br.n >= MIN_GAMES && bb.n >= MIN_GAMES;
  const signals: Signal[] = [
    { label: 'Weniger Patzer pro Partie', supports: clearlyLess(br.value, bb.value) },
    { label: 'Höhere Genauigkeit', supports: ar.value !== null && ab.value !== null && ar.value - ab.value >= THRESHOLDS.accuracy },
  ];
  const verdict = verdictOf(signals, enough);
  const span = `${Math.round(h.days / 7)} Wochen`;
  const summary = enough
    ? `Letzte ${span}: ${one(br.value)} Patzer pro Partie und ${pct(ar.value)} Genauigkeit (${partien(br.n)}); davor ${one(bb.value)} und ${pct(ab.value)} (${partien(bb.n)}).`
    : before.length === 0 && recent.length
      ? `Alle ${partien(recent.length)} in diesem Zeitraum sind aus den letzten ${span} – es fehlt ein Davor. Wähle oben „Alles“, um mit älteren Partien zu vergleichen.`
      : `Für einen Vergleich brauche ich mindestens ${MIN_GAMES} analysierte Partien aus den letzten ${span} und ${MIN_GAMES} davor – bisher ${br.n} und ${bb.n}.`;
  return {
    hypothesis: h,
    verdict,
    summary,
    signals,
    evidence: [
      [
        { label: `Letzte ${span}`, value: br.value, n: br.n, unit: 'perGame' },
        { label: 'Davor', value: bb.value, n: bb.n, unit: 'perGame' },
      ],
      [
        { label: `Letzte ${span}`, value: ar.value, n: ar.n, unit: 'acc' },
        { label: 'Davor', value: ab.value, n: ab.n, unit: 'acc' },
      ],
    ],
    action: { label: 'Übe deine fälligen Puzzles', href: '#/training/fehler' },
  };
}
