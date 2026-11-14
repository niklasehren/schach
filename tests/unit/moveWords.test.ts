import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { movedPhrase, moveNoun, uciMove } from '../../src/chess/moveWords';

const after = (san: string[]) => {
  const c = new Chess();
  for (const m of san) c.move(m);
  return c.fen();
};

describe('Züge in Worten: Figur, Start- und Zielfeld', () => {
  it('Bauer, Läufer, Dame – meiner und der des Gegners', () => {
    const pawn = uciMove(after(['e4']), 'h7h6')!;
    expect(movedPhrase(pawn, 'me')).toBe('deinen Bauern von h7 nach h6 gezogen');
    expect(`Du hast hier ${movedPhrase(pawn, 'me')} – ein Patzer.`).toBe('Du hast hier deinen Bauern von h7 nach h6 gezogen – ein Patzer.');
    const bishop = uciMove(after(['e4', 'e5']), 'f1c4')!;
    expect(`Dein Gegner hat zuletzt ${movedPhrase(bishop, 'opp')}.`).toBe('Dein Gegner hat zuletzt seinen Läufer von f1 nach c4 gezogen.');
    const queen = uciMove(after(['e4', 'e5']), 'd1h5')!;
    expect(movedPhrase(queen, 'me')).toBe('deine Dame von d1 nach h5 gezogen');
    expect(movedPhrase(queen, 'opp')).toBe('seine Dame von d1 nach h5 gezogen');
    expect(moveNoun(queen)).toBe('Dame von d1 nach h5');
  });

  it('Springer, Turm, König', () => {
    expect(movedPhrase(uciMove(new Chess().fen(), 'g1f3')!, 'me')).toBe('deinen Springer von g1 nach f3 gezogen');
    const rook = uciMove('4k3/8/8/8/8/8/8/R3K3 w - - 0 1', 'a1a7')!;
    expect(moveNoun(rook)).toBe('Turm von a1 nach a7');
    expect(movedPhrase(uciMove('4k3/8/8/8/8/8/8/R3K3 w - - 0 1', 'e1d2')!, 'opp')).toBe('seinen König von e1 nach d2 gezogen');
  });

  it('Schlagen, Rochade, Umwandlung', () => {
    const capture = uciMove(after(['e4', 'd5']), 'e4d5')!;
    expect(movedPhrase(capture, 'me')).toBe('deinen Bauern von e4 nach d5 gezogen und seinen Bauern geschlagen');
    expect(movedPhrase(uciMove(after(['e4', 'Nf6', 'Bc4']), 'f6e4')!, 'opp')).toBe('seinen Springer von f6 nach e4 gezogen und deinen Bauern geschlagen');
    const castle = uciMove('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', 'e1g1')!;
    expect(movedPhrase(castle, 'me')).toBe('kurz rochiert');
    expect(moveNoun(uciMove('r3k2r/8/8/8/8/8/8/R3K2R b KQkq - 0 1', 'e8c8')!)).toBe('lange Rochade');
    const promo = uciMove('1n2k3/P7/8/8/8/8/8/4K3 w - - 0 1', 'a7b8q')!;
    expect(movedPhrase(promo, 'me')).toBe('deinen Bauern von a7 nach b8 gezogen, seinen Springer geschlagen und in eine Dame umgewandelt');
    expect(moveNoun(promo)).toBe('Bauer von a7 nach b8 (wird zur Dame)');
  });

  it('ungültiger Zug: null', () => {
    expect(uciMove(new Chess().fen(), 'e2e5')).toBeNull();
  });
});
