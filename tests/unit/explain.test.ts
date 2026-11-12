import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { explain, MERKE, plainText, winWords, type Explanation, type ExplainInput } from '../../src/analysis/explain';
import { TERMS } from '../../src/analysis/terms';

const fenAfter = (moves: string[]) => {
  const c = new Chess();
  for (const m of moves) c.move(m);
  return c.fen();
};
const texts = (e: Explanation) => [...e.played, ...e.better].map((i) => plainText(i.text));

// Partie vom 12.11.: 1. d4 d5 2. Sc3 Sf6 3. e4 dxe4 4. f3 exf3 5. Dxf3 Sc6 6. Lb5 Lg4 – gespielt 7. Df1??
const zwischenzug: ExplainInput = {
  fenBefore: fenAfter(['d4', 'd5', 'Nc3', 'Nf6', 'e4', 'dxe4', 'f3', 'exf3', 'Qxf3', 'Nc6', 'Bb5', 'Bg4']),
  played: 'f3f1',
  bestPv: ['b5c6', 'b7c6', 'f3c6', 'g4d7', 'c6c4', 'd7e6'],
  replyPv: ['d8d4', 'b5c6', 'b7c6', 'g1f3'],
  before: { cp: 9 },
  after: { cp: -242 },
};
const gabel: ExplainInput = {
  // Partie 003: 1. d4 d5 2. e3 Sc6 3. Sc3 Sf6 4. Sf3 Lf5 5. h3 Sb4 – gespielt 6. g4, Antwort Sxc2+
  fenBefore: fenAfter(['d4', 'd5', 'e3', 'Nc6', 'Nc3', 'Nf6', 'Nf3', 'Bf5', 'h3', 'Nb4']),
  played: 'g2g4',
  bestPv: ['f1d3'],
  replyPv: ['b4c2', 'e1e2', 'c2a1'],
  before: { cp: 0 },
  after: { cp: -400 },
};
const dame: ExplainInput = { fenBefore: fenAfter(['e4', 'e5', 'Nf3']), played: 'd8g5', bestPv: ['b8c6'], replyPv: ['f3g5'], before: { cp: -40 }, after: { cp: -900 } };
const laeufer: ExplainInput = { fenBefore: fenAfter(['e4', 'e5', 'Nf3', 'Nc6']), played: 'f1a6', bestPv: ['f1b5'], replyPv: ['g8f6'], before: { cp: 30 }, after: { cp: -250 } };
const mattZugelassen: ExplainInput = { fenBefore: fenAfter(['e4', 'e5', 'Bc4', 'Nc6', 'Qh5']), played: 'g8f6', bestPv: ['g7g6', 'h5f3'], replyPv: ['h5f7'], before: { cp: -50 }, after: { mate: -1 } };
const mattVerpasst: ExplainInput = { fenBefore: fenAfter(['e4', 'e5', 'Bc4', 'Nc6', 'Qh5', 'Nf6']), played: 'h5h3', bestPv: ['h5f7'], replyPv: ['d7d5'], before: { mate: 1 }, after: { cp: 0 } };
const all = [zwischenzug, gabel, dame, laeufer, mattZugelassen, mattVerpasst];

describe('Erklärungen in einfacher Sprache', () => {
  it('7. Df1: genau der Zieltext', () => {
    const e = explain(zwischenzug);
    expect(e.played.map((i) => plainText(i.text))).toEqual([
      'Deine Dame bringt sich zwar in Sicherheit, aber dein Bauer auf d4 bleibt ungedeckt (keine deiner Figuren schützt ihn). Die schwarze Dame kann ihn einfach schlagen (Dxd4), und du verlierst einen weiteren Bauern.',
    ]);
    expect(e.better.map((i) => plainText(i.text))).toEqual([
      'Statt die Dame wegzuziehen, schlägt dein Läufer den Springer auf c6 (Lxc6+), und zwar mit Schach. Das ist ein Zwischenzug (ein Zug, auf den der Gegner sofort reagieren muss): Er hat keine Zeit, deine Dame zu schlagen.',
      'Danach schlägt deine Dame den Bauern auf c6 (Dxc6+), wieder mit Schach. Sie ist aus der Gefahr, und du hast deinen Bauern zurück.',
    ]);
    expect(e.merke).toBe('Wird eine deiner Figuren angegriffen, schau zuerst, ob du Schach geben oder etwas schlagen kannst.');
    // Fachbegriffe sind markiert (antippbar)
    expect(e.played[0].text).toContain('[[ungedeckt|ungedeckt]]');
    expect(e.better[0].text).toContain('[[zwischenzug|Zwischenzug]]');
  });

  it('„einen weiteren Bauern“ nur, wenn vorher schon ein Bauer fehlte', () => {
    // Gleiche Stellung, aber Schwarz ein Bauer weniger (g7 entfernt): Material ausgeglichen → „einen Bauern“
    const evenFen = zwischenzug.fenBefore.replace('ppp1pppp', 'ppp2ppp');
    expect(evenFen).not.toBe(zwischenzug.fenBefore);
    const even = explain({ ...zwischenzug, fenBefore: evenFen });
    const text = even.played.map((i) => plainText(i.text)).join(' ');
    expect(text).toContain('und du verlierst einen Bauern');
    expect(text).not.toContain('weiteren');
  });

  it('Gabel und Schlagen sind ein Satz, keine doppelte Aussage', () => {
    const e = explain(gabel);
    expect(texts(e)).toEqual([
      'Der schwarze Springer schlägt deinen Bauern auf c2 und greift dabei mit einer Gabel (eine Figur greift zwei auf einmal an) deinen König und deinen Turm auf a1 gleichzeitig an (Sxc2+).',
    ]);
    expect(e.merke).toBe(MERKE.fork);
  });

  it('Ungedeckte Dame, hängende Figur', () => {
    expect(texts(explain(dame))[0]).toBe(
      'Deine Dame auf g5 ist danach ungedeckt (keine deiner Figuren schützt sie). Der weiße Springer kann sie einfach schlagen (Sxg5), und du verlierst deine Dame.',
    );
    expect(texts(explain(laeufer))).toEqual(['Dein Läufer auf a6 ist danach eine hängende Figur (angegriffen und von keiner deiner Figuren gedeckt).']);
    expect(explain(laeufer).merke).toBe(MERKE.hanging);
  });

  it('Matt geht vor Material: keine Bauern-Sätze neben dem Matt', () => {
    const z = explain(mattZugelassen);
    expect(texts(z)).toEqual(['Danach kann der Gegner sofort matt setzen (Dxf7#).']);
    expect(z.merke).toBe(MERKE.mateAllowed);
    const v = explain(mattVerpasst);
    expect(texts(v)).toEqual([
      'Du hattest ein erzwungenes Matt (der Gegner kann es nicht mehr verhindern): Matt in 1. Mit diesem Zug ist es weg.',
      'Deine Dame schlägt den Bauern auf f7 – das ist sofort Matt (Dxf7#).',
    ]);
  });

  it('Keine passende Regel: nichts erfunden', () => {
    const e = explain({ fenBefore: new Chess().fen(), played: 'a2a3', bestPv: ['e2e4', 'e7e5'], replyPv: ['e7e5'], before: { cp: 30 }, after: { cp: -10 } });
    expect(e).toEqual({ played: [], better: [], merke: null });
  });

  it('Höchstens 2 Punkte pro Abschnitt, Fachbegriff nur beim ersten Mal erklärt', () => {
    for (const input of all) {
      const e = explain(input);
      expect(e.played.length).toBeLessThanOrEqual(2);
      expect(e.better.length).toBeLessThanOrEqual(2);
      const raw = [...e.played, ...e.better].map((i) => i.text).join(' ');
      for (const key of Object.keys(TERMS)) {
        const explained = raw.match(new RegExp(`\\[\\[${key}\\|[^\\]]+\\]\\] \\(`, 'g')) ?? [];
        expect(explained.length).toBeLessThanOrEqual(1);
      }
    }
  });

  it('Keine Zugfolgen mit Zugnummern, Notation nur in Klammern', () => {
    for (const input of all) {
      for (const t of texts(explain(input))) {
        // keine Zugnummern wie „7.“ oder „7…“
        expect(t).not.toMatch(/\b\d+\s*(\.|…)\s*[KDTLS]?[a-h]/);
        // außerhalb von Klammern keine Züge in Notation (Felder wie „auf c6“ sind erlaubt)
        const outside = t.replace(/\([^)]*\)/g, '');
        expect(outside).not.toMatch(/\b[KDTLS][a-h]?[1-8]?x?[a-h][1-8]/);
        expect(outside).not.toMatch(/\b[a-h]x[a-h][1-8]/);
        expect(outside).not.toMatch(/[+#]/);
      }
    }
  });
});

describe('Gewinnchance in Worten', () => {
  it('Grenzen', () => {
    expect(winWords(50)).toBe('ausgeglichen');
    expect(winWords(55)).toBe('leicht besser');
    expect(winWords(65)).toBe('klar besser');
    expect(winWords(80)).toBe('deutlich besser');
    expect(winWords(92)).toBe('gewonnen');
    expect(winWords(45)).toBe('leicht schlechter');
    expect(winWords(29)).toBe('klar schlechter');
    expect(winWords(15)).toBe('deutlich schlechter');
    expect(winWords(5)).toBe('verloren');
  });
});
