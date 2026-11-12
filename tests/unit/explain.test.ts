import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { explain, lineText, playLine } from '../../src/analysis/explain';

const fenAfter = (moves: string[]) => {
  const c = new Chess();
  for (const m of moves) c.move(m);
  return c.fen();
};

describe('Erklärungen', () => {
  // Partie vom 12.11.: 1. d4 d5 2. Sc3 Sf6 3. e4 dxe4 4. f3 exf3 5. Dxf3 Sc6 6. Lb5 Lg4 – gespielt 7. Df1??
  const zwischenzug = fenAfter(['d4', 'd5', 'Nc3', 'Nf6', 'e4', 'dxe4', 'f3', 'exf3', 'Qxf3', 'Nc6', 'Bb5', 'Bg4']);

  it('Zwischenzug mit Schach: Lxc6+ statt Df1', () => {
    const e = explain({
      fenBefore: zwischenzug,
      played: 'f3f1',
      bestPv: ['b5c6', 'b7c6', 'f3c6', 'g4d7', 'c6c4', 'd7e6'],
      replyPv: ['d8d4', 'b5c6', 'b7c6', 'g1f3'],
      before: { cp: 9 },
      after: { cp: -242 },
    });
    expect(e.better[0]).toBe(
      'Lxc6+ ist ein Zwischenzug mit Schach: Der Gegner muss zuerst auf das Schach reagieren. Nach 7. Lxc6+ bxc6 8. Dxc6+ ist deine Dame nicht mehr angegriffen (sie steht dann auf c6).',
    );
    expect(e.better).toContain('Lxc6+ schlägt den Springer auf c6.');
    // Vorher war Weiß nach dem Gambit einen Bauern hinten
    expect(e.better).toContain('Nach 7. Lxc6+ bxc6 8. Dxc6+ Ld7 9. Dc4 holst du Material im Wert von einem Bauern zurück.');
    // Dxd4 greift zwar beide Springer an, beide sind aber gedeckt: keine Gabel
    expect(e.played.join(' ')).not.toContain('Gabel');
    // Warum Df1 schlecht ist: Dxd4 holt den Bauern
    expect(e.played[0]).toMatch(/^Die beste Antwort Dxd4 schlägt deinen Bauern auf d4/);
    expect(e.played.join(' ')).toContain('Material im Wert von einem Bauern verloren');
  });

  it('Gabel nach dem Zug wird erkannt', () => {
    // Partie 003: 1. d4 d5 2. e3 Sc6 3. Sc3 Sf6 4. Sf3 Lf5 5. h3 Sb4 – gespielt 6. g4, Antwort Sxc2+
    const before = fenAfter(['d4', 'd5', 'e3', 'Nc6', 'Nc3', 'Nf6', 'Nf3', 'Bf5', 'h3', 'Nb4']);
    const e = explain({ fenBefore: before, played: 'g2g4', bestPv: ['f1d3'], replyPv: ['b4c2', 'e1e2', 'c2a1'], before: { cp: 0 }, after: { cp: -400 } });
    expect(e.played).toContain('Die beste Antwort Sxc2+ schlägt deinen Bauern auf c2.');
    expect(e.played).toContain('Die beste Antwort Sxc2+ greift gleichzeitig deinen König und deinen Turm auf a1 an (Gabel).');
    expect(e.played).toContain('Nach 6… Sxc2+ 7. Ke2 Sxa1 hast du Material im Wert von 6 Bauern verloren.');
  });

  it('Ungedeckte Dame wird geschlagen; gedeckte Figur ist nicht „ungedeckt“', () => {
    const before = fenAfter(['e4', 'e5', 'Nf3']);
    const e = explain({ fenBefore: before, played: 'd8g5', bestPv: ['b8c6'], replyPv: ['f3g5'], before: { cp: -40 }, after: { cp: -900 } });
    expect(e.played[0]).toBe('Die beste Antwort Sxg5 schlägt deine Dame auf g5 – sie war ungedeckt.');
    expect(e.played).toContain('Nach 3. Sxg5 hast du Material im Wert von 9 Bauern verloren.');
    // Springer g4 ist vom Läufer c8 gedeckt
    const b2 = fenAfter(['e4', 'd5', 'Nc3', 'Nf6', 'a3']);
    const e2 = explain({ fenBefore: b2, played: 'f6g4', bestPv: ['d5e4'], replyPv: ['d1g4'], before: { cp: 0 }, after: { cp: -300 } });
    expect(e2.played[0]).toBe('Die beste Antwort Dxg4 schlägt deinen Springer auf g4.');
  });

  it('Hängende Figur ohne Schlagzug in der Antwort', () => {
    // 3. La6? – vom Bauern b7 angegriffen, ungedeckt; die angenommene Antwort schlägt nicht sofort
    const before = fenAfter(['e4', 'e5', 'Nf3', 'Nc6']);
    const e = explain({ fenBefore: before, played: 'f1a6', bestPv: ['f1b5'], replyPv: ['g8f6'], before: { cp: 30 }, after: { cp: -250 } });
    expect(e.played).toContain('Nach deinem Zug hängt dein Läufer auf a6 (angegriffen und ungedeckt).');
  });

  it('Matt zugelassen und Matt übersehen', () => {
    const before = fenAfter(['e4', 'e5', 'Bc4', 'Nc6', 'Qh5']);
    const e = explain({ fenBefore: before, played: 'g8f6', bestPv: ['g7g6', 'h5f3'], replyPv: ['h5f7'], before: { cp: -50 }, after: { mate: -1 } });
    expect(e.played).toContain('Nach deinem Zug kann der Gegner sofort matt setzen.');
    expect(e.better).toEqual([]);

    const white = fenAfter(['e4', 'e5', 'Bc4', 'Nc6', 'Qh5', 'Nf6']);
    const m = explain({ fenBefore: white, played: 'h5h3', bestPv: ['h5f7'], replyPv: ['d7d5'], before: { mate: 1 }, after: { cp: 0 } });
    expect(m.played).toContain('Du hattest Matt in 1 – nach Dh3 ist es weg.');
    expect(m.better).toContain('Dxf7# setzt sofort matt.');
  });

  it('Keine passende Regel: keine erfundenen Sätze', () => {
    const before = new Chess().fen();
    const e = explain({ fenBefore: before, played: 'a2a3', bestPv: ['e2e4', 'e7e5'], replyPv: ['e7e5'], before: { cp: 30 }, after: { cp: -10 } });
    expect(e).toEqual({ played: [], better: [] });
  });

  it('Variante als Text', () => {
    const fen = fenAfter(['e4', 'e5']);
    expect(lineText(fen, playLine(fen, ['g1f3', 'b8c6', 'f1b5']))).toBe('2. Sf3 Sc6 3. Lb5');
    const black = fenAfter(['e4']);
    expect(lineText(black, playLine(black, ['e7e5', 'g1f3']))).toBe('1… e5 2. Sf3');
  });
});
